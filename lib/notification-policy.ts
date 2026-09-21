export interface ReviewNotificationSource {
  id: string;
  occurrence: string;
  trigger: string;
}
export function reviewNotificationStatus(
  review: ReviewNotificationSource,
): "pending" | "suppressed" {
  return review.trigger === "daily schedule" &&
    review.occurrence.startsWith("daily:")
    ? "pending"
    : "suppressed";
}
