import { normalizePhone } from "./settings-schema";

export function isPhotonOwner(
  author: { userId: string; isBot?: boolean; isMe?: boolean },
  recipient: string,
  isDM: boolean,
) {
  const owner = normalizePhone(recipient);
  return Boolean(
    isDM &&
    !author.isBot &&
    !author.isMe &&
    /^\+[1-9]\d{7,14}$/.test(owner) &&
    normalizePhone(author.userId) === owner,
  );
}
