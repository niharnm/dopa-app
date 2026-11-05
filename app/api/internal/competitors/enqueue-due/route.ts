import { nextDailyRun, retentionDue } from "@/lib/competitor-intelligence/schedule";
import { RESEARCH_CONTRACT_VERSION } from "@/lib/competitor-intelligence/types";
import { isJsonObject } from "@/lib/validation";
import { createAndEnqueueResearchRun } from "@/lib/server/competitor-research";
import { readVerifiedInternalJson } from "@/lib/server/internal-auth";
import { createAdminClient } from "@/utils/supabase/admin";

const businessSelect =
  "id, name, website, industry, description, target_audience, value_proposition, markets, target_keywords";

let lastRetentionDay: string | null = null;

export async function POST(request: Request) {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json({ error: "Server configuration is incomplete." }, { status: 503 });
  }
  const verified = await readVerifiedInternalJson(request, admin, 64 * 1024);
  if (!verified.ok) return verified.response;
  if (
    !isJsonObject(verified.value) ||
    verified.value.version !== RESEARCH_CONTRACT_VERSION
  ) {
    return Response.json({ error: "Unsupported scheduler payload." }, { status: 400 });
  }

  const now = new Date();
  // The worker invokes this route every minute. Run retention on the first
  // tick at or after 08:00 UTC each day, not only on an exact 08:00 tick.
  if (retentionDue(now, lastRetentionDay)) {
    lastRetentionDay = now.toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    const ninetyDaysAgo = new Date(
      now.getTime() - 90 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    await admin
      .from("competitor_research_runs")
      .update({ input_snapshot: {}, provider_request_id: null })
      .lt("created_at", thirtyDaysAgo);
    await admin
      .from("competitor_research_runs")
      .delete()
      .lt("created_at", ninetyDaysAgo);
  }

  const { data: due, error: dueError } = await admin
    .from("competitor_monitor_settings")
    .select("business_id, local_time, timezone")
    .eq("enabled", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(20);
  if (dueError) {
    return Response.json({ error: "Could not load due research schedules." }, { status: 500 });
  }

  const queued: string[] = [];
  const failed: string[] = [];
  for (const schedule of due ?? []) {
    try {
      const { data: business, error: businessError } = await admin
        .from("businesses")
        .select(businessSelect)
        .eq("id", schedule.business_id)
        .maybeSingle();
      if (businessError || !business) throw new Error("Business not found.");

      const run = await createAndEnqueueResearchRun(business, "scheduled");
      queued.push(run.runId);
      await admin
        .from("competitor_monitor_settings")
        .update({
          next_run_at: nextDailyRun(
            schedule.timezone,
            schedule.local_time,
            now,
          ).toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("business_id", schedule.business_id);
    } catch {
      failed.push(schedule.business_id);
    }
  }

  return Response.json({ success: true, queued, failed });
}
