// Isolated integration check: temporary tables shadow production names only for
// this transaction and are dropped at commit. No user records or messages change.
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import {
  claimNotification,
  suppressDuplicateMessages,
  suppressQuietReviews,
} from "../lib/notification-queue";
const sql = neon(
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
);
const ids = {
  first: "00000000-0000-4000-8000-000000000001",
  copy: "00000000-0000-4000-8000-000000000002",
  unknown: "00000000-0000-4000-8000-000000000003",
  retry: "00000000-0000-4000-8000-000000000004",
  review: "00000000-0000-4000-8000-000000000005",
  quiet: "00000000-0000-4000-8000-000000000006",
};
const results = await sql.transaction([
  sql`CREATE TEMP TABLE notification_outbox (LIKE public.notification_outbox INCLUDING ALL) ON COMMIT DROP`,
  sql`CREATE TEMP TABLE reviews (LIKE public.reviews INCLUDING ALL) ON COMMIT DROP`,
  sql`INSERT INTO notification_outbox(id,operation_key,body,created_at,status) VALUES (${ids.first},'fixture:first','same body',now()-interval '1 second','pending'),(${ids.copy},'fixture:copy','same body',now(),'pending'),(${ids.unknown},'fixture:unknown','uncertain body',now(),'unknown'),(${ids.retry},'fixture:retry','uncertain body',now(),'pending')`,
  sql`INSERT INTO reviews(id,occurrence,trigger,status) VALUES (${ids.review},'prelock:fixture','before game lock','completed')`,
  sql`INSERT INTO notification_outbox(id,operation_key,body) VALUES (${ids.quiet},${`review:${ids.review}`},'No changes needed')`,
  suppressQuietReviews(sql, "America/New_York"),
  suppressDuplicateMessages(sql, "America/New_York"),
  claimNotification(sql, "America/New_York"),
  claimNotification(sql, "America/New_York"),
  suppressDuplicateMessages(sql, "America/New_York"),
  sql`SELECT id,status,attempts FROM notification_outbox ORDER BY id`,
]);
const rows = results.at(-1)!;
const byId = new Map(rows.map((r) => [r.id, r]));
assert.equal(byId.get(ids.first)?.status, "sending");
assert.equal(byId.get(ids.first)?.attempts, 1);
assert.equal(byId.get(ids.copy)?.status, "suppressed");
assert.equal(byId.get(ids.retry)?.status, "suppressed");
assert.equal(byId.get(ids.quiet)?.status, "suppressed");
assert.equal(
  results[8].length,
  0,
  "A second worker cannot claim the duplicate payload",
);
console.log(
  "Notification claim integration passed: one send claim, duplicate and quiet-review suppression, uncertain deliveries not retried. No real messages sent.",
);
