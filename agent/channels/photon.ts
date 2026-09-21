import { connectPhotonCredentials } from "@vercel/connect/eve";
import { photonIMessageChannel, defaultPhotonAuth } from "eve/channels/photon";
import { getSettings } from "../../lib/db";
import { checkBudget } from "../../lib/reviews";
import { isPhotonOwner } from "../../lib/photon-owner";

export default photonIMessageChannel({
  credentials: connectPhotonCredentials(
    process.env.PHOTON_CONNECTOR || "photon/eve-fantasy",
  ),
  turnPolicy: "queue",
  async onMessage(ctx, message) {
    if (process.env.VERCEL_ENV !== "production") return null;
    const settings = await getSettings();
    if (
      !isPhotonOwner(message.author, settings.photonRecipient, ctx.thread.isDM)
    )
      return null;
    await checkBudget();
    return { auth: defaultPhotonAuth(message) };
  },
});
