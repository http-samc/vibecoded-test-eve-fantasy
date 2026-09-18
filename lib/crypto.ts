import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function key() {
  const value = process.env.CREDENTIALS_KEY;
  if (!value || Buffer.from(value, "hex").length !== 32)
    throw new Error("Credential encryption is not configured.");
  return Buffer.from(value, "hex");
}
export function seal(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body]
    .map((x) => x.toString("base64url"))
    .join(".");
}
export function unseal<T>(value: string): T {
  const [iv, tag, body] = value
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(body), cipher.final()]).toString("utf8"),
  );
}
export function sign(value: string) {
  if (!process.env.AUTH_SECRET)
    throw new Error("App authentication is not configured.");
  return createHmac("sha256", process.env.AUTH_SECRET)
    .update(value)
    .digest("base64url");
}
export function issueSession() {
  const payload = Buffer.from(
    JSON.stringify({ sub: "owner", exp: Date.now() + 7 * 86400000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function verifySession(token?: string) {
  if (!token || !process.env.AUTH_SECRET) return false;
  try {
    const [payload, mac, extra] = token.split(".");
    if (extra || !mac || !equal(sign(payload), mac)) return false;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (
      parsed.sub === "owner" &&
      Number.isFinite(parsed.exp) &&
      parsed.exp > Date.now()
    );
  } catch {
    return false;
  }
}
export function requestAuthorized(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("eve_owner="))
    ?.slice(10);
  return verifySession(cookie);
}
