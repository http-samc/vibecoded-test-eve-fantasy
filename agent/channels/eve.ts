import { eveChannel } from "eve/channels/eve";
import { equal, requestAuthorized } from "../../lib/crypto";
import { checkBudget } from "../../lib/reviews";
export default eveChannel({
  auth: [
    async (request) => {
      const bearer = request.headers
        .get("authorization")
        ?.replace(/^Bearer /, "");
      const service = Boolean(
        process.env.EVE_SERVICE_TOKEN &&
        bearer &&
        equal(bearer, process.env.EVE_SERVICE_TOKEN),
      );
      if (!service && !requestAuthorized(request)) return null;
      if (!service && request.method !== "GET") {
        const origin = request.headers.get("origin");
        if (
          origin &&
          origin !== new URL(request.url).origin &&
          origin !== process.env.APP_URL
        )
          return null;
      }
      return {
        authenticator: "eve-fantasy",
        principalId: "owner",
        principalType: "user" as const,
        attributes: {},
      };
    },
  ],
  uploadPolicy: "disabled",
  turnPolicy: "queue",
  async onMessage(ctx) {
    await checkBudget();
    return { auth: ctx.eve.caller };
  },
});
