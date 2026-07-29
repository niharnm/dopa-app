import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { BUSINESS_SELECT, type Business } from "@/lib/business-types";

export async function getBusinessesForUser(
  userId: string,
): Promise<{ businesses: Business[]; selectedBusinessId: string | null }> {
  const supabase = createClient(await cookies());

  const { data: businesses, error } = await supabase
    .from("businesses")
    .select(BUSINESS_SELECT)
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load businesses.", {
      code: error.code ?? "unknown",
    });
    throw new Error("Businesses could not be loaded.");
  }

  const list = (businesses ?? []) as Business[];

  if (list.length === 0) {
    return { businesses: [], selectedBusinessId: null };
  }

  const { data: prefs, error: prefsError } = await supabase
    .from("user_preferences")
    .select("selected_business_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (prefsError) {
    console.error("Failed to load business preferences.", {
      code: prefsError.code ?? "unknown",
    });
    throw new Error("Business preferences could not be loaded.");
  }

  const validIds = new Set(list.map((business) => business.id));
  let selectedBusinessId = prefs?.selected_business_id ?? null;

  if (!selectedBusinessId || !validIds.has(selectedBusinessId)) {
    selectedBusinessId = list[0]?.id ?? null;
  }

  return { businesses: list, selectedBusinessId };
}
