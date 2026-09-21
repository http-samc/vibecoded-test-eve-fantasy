import type { db } from "./db";
type Sql = ReturnType<typeof db>;

// Also suppress quiet-review messages queued by a run on an older deployment.
export function suppressQuietReviews(sql: Sql, timezone: string) {
  return sql`UPDATE notification_outbox n SET status='suppressed',last_error='Routine check recorded in Activity; only the daily digest is texted.'
    FROM reviews r WHERE n.operation_key='review:'||r.id::text AND n.status='pending'
    AND (r.trigger<>'daily schedule' OR r.occurrence NOT LIKE 'daily:%'
      OR (n.created_at AT TIME ZONE ${timezone})::date < (now() AT TIME ZONE ${timezone})::date)`;
}
export function suppressDuplicateMessages(sql: Sql, timezone: string) {
  return sql`UPDATE notification_outbox n SET status='suppressed',last_error='An identical message was already sent or has an uncertain delivery today.'
    WHERE n.status='pending' AND EXISTS(SELECT 1 FROM notification_outbox prior
      WHERE prior.id<>n.id AND prior.body=n.body AND prior.status IN ('sent','sending','unknown')
      AND (prior.created_at AT TIME ZONE ${timezone})::date=(n.created_at AT TIME ZONE ${timezone})::date)`;
}
export function claimNotification(sql: Sql, timezone: string) {
  return sql`WITH candidate AS (
    SELECT n.id FROM notification_outbox n WHERE n.status='pending' AND n.retry_at<=now()
    AND NOT EXISTS(SELECT 1 FROM notification_outbox prior WHERE prior.id<>n.id AND prior.body=n.body
      AND (prior.created_at AT TIME ZONE ${timezone})::date=(n.created_at AT TIME ZONE ${timezone})::date
      AND (prior.status IN ('sent','sending','unknown') OR (prior.status='pending' AND (prior.created_at,prior.id)<(n.created_at,n.id))))
    ORDER BY n.created_at,n.id LIMIT 1 FOR UPDATE SKIP LOCKED
  ) UPDATE notification_outbox n SET status='sending',lease_until=now()+interval '2 minutes',attempts=n.attempts+1
    FROM candidate WHERE n.id=candidate.id AND n.status='pending' RETURNING n.*`;
}
