import { randomUUID } from "node:crypto";
import { authorize, apiError } from "@/lib/api";
import { startReview } from "@/lib/reviews";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    authorize(request);
    return Response.json(
      await startReview("dashboard", `manual:${randomUUID()}`),
    );
  } catch (e) {
    return apiError(e);
  }
}
