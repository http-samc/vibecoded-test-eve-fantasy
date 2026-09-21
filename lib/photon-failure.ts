export function photonFailure(
  error: unknown,
  sendStarted: boolean,
  attempts: number,
) {
  if (
    error instanceof Error &&
    error.message.includes("Target not allowed for this project")
  )
    return {
      status: "failed",
      message:
        "Photon rejected this recipient for the selected project. Check the contact registration in Photon.",
    };
  return {
    status: sendStarted ? "unknown" : attempts >= 3 ? "failed" : "pending",
    message: sendStarted
      ? "Photon delivery could not be confirmed. Check your conversation before resending."
      : "Photon connection failed. Check the connector and recipient registration.",
  };
}
