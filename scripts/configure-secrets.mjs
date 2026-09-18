import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
mkdirSync(".local", { recursive: true, mode: 0o700 });
if (existsSync(".local/access-code.txt"))
  throw new Error("Secrets already generated; refusing to rotate implicitly.");
const values = {
  AUTH_SECRET: randomBytes(32).toString("hex"),
  CREDENTIALS_KEY: randomBytes(32).toString("hex"),
  OWNER_ACCESS_CODE: randomBytes(24).toString("base64url"),
  EVE_SERVICE_TOKEN: randomBytes(32).toString("base64url"),
  CRON_SECRET: randomBytes(32).toString("base64url"),
};
writeFileSync(".local/access-code.txt", values.OWNER_ACCESS_CODE + "\n", {
  mode: 0o600,
});
for (const [key, value] of Object.entries(values)) {
  const result = spawnSync(
    "vercel",
    [
      "env",
      "add",
      key,
      "production,preview,development",
      "--scope",
      "httpsamcs-projects",
      "--yes",
    ],
    { input: value, encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(`Could not provision ${key}; inspect Vercel env settings.`);
  appendFileSync(".env.local", `\n${key}=${value}\n`, { mode: 0o600 });
  console.log(`${key}: configured`);
}
