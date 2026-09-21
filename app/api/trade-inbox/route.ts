import { authorize, apiError } from "@/lib/api";
import { readTradeInbox } from "@/lib/trade-inbox";
export async function POST(request: Request) {
  try {
    authorize(request);
    return Response.json(await readTradeInbox());
  } catch (error) {
    return apiError(error);
  }
}
