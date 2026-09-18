import { authorize, apiError } from "@/lib/api";
import { dashboardData } from "@/lib/db";
export async function GET(request: Request) {
  try {
    authorize(request);
    return Response.json(await dashboardData(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
