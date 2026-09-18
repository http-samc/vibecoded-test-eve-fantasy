import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL);
const source = await readFile(
  new URL("../db/schema.sql", import.meta.url),
  "utf8",
);
await sql.transaction(
  source
    .split("-- statement")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => sql.query(s)),
);
console.log("Database schema is ready.");
