DROP INDEX IF EXISTS idx_applications_candidate_vacancy;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_applications_candidate_vacancy_lookup ON applications(candidate_id, vacancy_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_source_event ON applications(source_event_id) WHERE source_event_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS integration_tokens (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_last4 TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_integration_tokens_provider_active ON integration_tokens(provider, revoked_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS integration_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  event_key TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  error_code TEXT,
  error_message TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_integration_events_source_received ON integration_events(source, received_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS job_requests (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_response_id TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  normalized_payload TEXT NOT NULL,
  status TEXT NOT NULL,
  vacancy_id TEXT,
  received_at TEXT NOT NULL,
  FOREIGN KEY(vacancy_id) REFERENCES vacancies(id),
  UNIQUE(source, external_response_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS candidate_submissions (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_submission_id TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  candidate_id TEXT,
  application_id TEXT,
  status TEXT NOT NULL,
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id),
  FOREIGN KEY(application_id) REFERENCES applications(id),
  UNIQUE(source, external_submission_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS candidate_documents (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  application_id TEXT,
  provider TEXT NOT NULL,
  external_file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  web_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id),
  FOREIGN KEY(application_id) REFERENCES applications(id),
  UNIQUE(provider, external_file_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_candidate_documents_candidate ON candidate_documents(candidate_id);
--> statement-breakpoint
PRAGMA optimize;
