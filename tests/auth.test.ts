import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  issueSession,
  verifySession,
  seal,
  unseal,
  sign,
  requestAuthorized,
} from "../lib/crypto";
process.env.AUTH_SECRET = randomBytes(32).toString("hex");
process.env.CREDENTIALS_KEY = randomBytes(32).toString("hex");
test("session signature, subject and expiry are all enforced", () => {
  const token = issueSession();
  assert.equal(verifySession(token), true);
  assert.equal(verifySession(token + "tampered"), false);
  assert.equal(verifySession(), false);
  const expired = Buffer.from(
    JSON.stringify({ sub: "owner", exp: 1 }),
  ).toString("base64url");
  assert.equal(verifySession(`${expired}.${sign(expired)}`), false);
  assert.equal(
    requestAuthorized(
      new Request("https://example.com", {
        headers: { cookie: `another=x; eve_owner=${token}` },
      }),
    ),
    true,
  );
});
test("credentials are authenticated encrypted data and tampering fails closed", () => {
  const c = { espnS2: "private-cookie", swid: "private-id" };
  const value = seal(c);
  assert.ok(!value.includes(c.espnS2));
  assert.deepEqual(unseal(value), c);
  const parts = value.split(".");
  const body = Buffer.from(parts[2], "base64url");
  body[0] ^= 1;
  parts[2] = body.toString("base64url");
  assert.throws(() => unseal(parts.join(".")));
});
