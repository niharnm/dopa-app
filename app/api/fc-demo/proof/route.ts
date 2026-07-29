import { getFcProof } from "@/lib/fc-sandbox/service";
import { NO_STORE_HEADERS } from "@/utils/http-security";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await getFcProof(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("FC proof lookup failed.", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "Evidence ledger unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
