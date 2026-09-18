CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE IF NOT EXISTS snapshots (
  id uuid PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY, occurrence text UNIQUE NOT NULL, trigger text NOT NULL,
  status text NOT NULL DEFAULT 'queued', started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz, summary text, error text, snapshot_id uuid REFERENCES snapshots(id),
  session_id text, model_cost numeric NOT NULL DEFAULT 0, evidence jsonb NOT NULL DEFAULT '[]'
);
-- statement
CREATE UNIQUE INDEX IF NOT EXISTS one_active_review ON reviews ((1)) WHERE status IN ('queued','running');
-- statement
CREATE TABLE IF NOT EXISTS actions (
  id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES reviews(id),
  action_key text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'proposed', proposal jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  result text, approved_at timestamptz
);
-- statement
CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY, operation_key text UNIQUE NOT NULL, body text NOT NULL,
  status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0, last_error text, provider_id text,
  lease_until timestamptz, retry_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE IF NOT EXISTS login_attempts (
  bucket text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL
);
-- statement
CREATE TABLE IF NOT EXISTS model_usage (
  operation_key text PRIMARY KEY, session_id text NOT NULL, cost numeric NOT NULL,
  input_tokens integer NOT NULL, output_tokens integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE UNIQUE INDEX IF NOT EXISTS one_executing_action ON actions ((1)) WHERE status='executing';
-- statement
ALTER TABLE actions ADD COLUMN IF NOT EXISTS external_id text;
-- statement
ALTER TABLE actions ADD COLUMN IF NOT EXISTS execution_started_at timestamptz;
