import { requestAuthorized } from "./crypto";
export function authorize(request: Request) {
  if (!requestAuthorized(request))
    throw new ApiError("Sign in to continue.", 401);
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (
      origin &&
      origin !== new URL(request.url).origin &&
      origin !== process.env.APP_URL
    )
      throw new ApiError("Request origin is not allowed.", 403);
  }
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function apiError(error: unknown) {
  if (error instanceof ApiError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.name === "ZodError")
    return Response.json(
      { error: "Check the supplied fields and try again." },
      { status: 400 },
    );
  // Only application-authored errors are exposed; database/provider diagnostics are private.
  const safe =
    error instanceof Error &&
    /^(ESPN|The |This |Eve |Connect |Current |Owner |Live |Roster |Player |Invalid |A player|Credential|The agent)/.test(
      error.message,
    );
  return Response.json(
    {
      error: safe
        ? (error as Error).message
        : "The request could not be completed. Try again or check the connection settings.",
    },
    { status: 400 },
  );
}
