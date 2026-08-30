import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const vacancies = sqliteTable('vacancies', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  department: text('department').notNull(),
  manager: text('manager').notNull(),
  quantity: integer('quantity').notNull().default(1),
  priority: text('priority').notNull().default('normal'),
  status: text('status').notNull().default('draft'),
  source: text('source').notNull().default('manual'),
  externalResponseId: text('external_response_id'),
  reason: text('reason'),
  slaDays: integer('sla_days').notNull().default(30),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_vacancies_source_external').on(table.source, table.externalResponseId)]);

export const candidates = sqliteTable('candidates', {
  id: text('id').primaryKey(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  emailNormalized: text('email_normalized').notNull().unique(),
  phone: text('phone'),
  source: text('source').notNull().default('manual'),
  talentConsent: integer('talent_consent').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id').notNull().references(() => candidates.id),
  vacancyId: text('vacancy_id').notNull().references(() => vacancies.id),
  status: text('status').notNull().default('new'),
  sourceEventId: text('source_event_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_applications_candidate_vacancy_lookup').on(table.candidateId, table.vacancyId),
  uniqueIndex('idx_applications_source_event').on(table.sourceEventId),
  index('idx_applications_status').on(table.status),
]);

export const applicationHistory = sqliteTable('application_history', {
  id: text('id').primaryKey(),
  applicationId: text('application_id').notNull().references(() => applications.id),
  previousStatus: text('previous_status'),
  newStatus: text('new_status').notNull(),
  actorUserId: text('actor_user_id'),
  note: text('note'),
  createdAt: text('created_at').notNull(),
});

export const interviews = sqliteTable('interviews', {
  id: text('id').primaryKey(),
  applicationId: text('application_id').notNull().references(() => applications.id),
  type: text('type').notNull(),
  scheduledAt: text('scheduled_at').notNull(),
  status: text('status').notNull().default('scheduled'),
  interviewer: text('interviewer'),
  modality: text('modality'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_interviews_scheduled_at').on(table.scheduledAt)]);

export const talentPoolEntries = sqliteTable('talent_pool_entries', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id').notNull().references(() => candidates.id),
  applicationId: text('application_id').references(() => applications.id),
  interestStatus: text('interest_status').notNull().default('unknown'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const admissions = sqliteTable('admissions', {
  id: text('id').primaryKey(),
  applicationId: text('application_id').notNull().unique().references(() => applications.id),
  status: text('status').notNull().default('pending'),
  startDate: text('start_date'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const integrationTokens = sqliteTable('integration_tokens', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  tokenHash: text('token_hash').notNull(),
  tokenLast4: text('token_last4').notNull(),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
}, (table) => [index('idx_integration_tokens_provider_active').on(table.provider, table.revokedAt)]);

export const integrationEvents = sqliteTable('integration_events', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  eventKey: text('event_key'),
  eventType: text('event_type').notNull(),
  status: text('status').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  receivedAt: text('received_at').notNull(),
  processedAt: text('processed_at'),
}, (table) => [index('idx_integration_events_source_received').on(table.source, table.receivedAt)]);

export const jobRequests = sqliteTable('job_requests', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  externalResponseId: text('external_response_id').notNull(),
  rawPayload: text('raw_payload').notNull(),
  normalizedPayload: text('normalized_payload').notNull(),
  status: text('status').notNull(),
  vacancyId: text('vacancy_id').references(() => vacancies.id),
  receivedAt: text('received_at').notNull(),
}, (table) => [uniqueIndex('idx_job_requests_source_external').on(table.source, table.externalResponseId)]);

export const candidateSubmissions = sqliteTable('candidate_submissions', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  externalSubmissionId: text('external_submission_id').notNull(),
  rawPayload: text('raw_payload').notNull(),
  candidateId: text('candidate_id').references(() => candidates.id),
  applicationId: text('application_id').references(() => applications.id),
  status: text('status').notNull(),
  receivedAt: text('received_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_candidate_submissions_source_external').on(table.source, table.externalSubmissionId)]);

export const candidateDocuments = sqliteTable('candidate_documents', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id').notNull().references(() => candidates.id),
  applicationId: text('application_id').references(() => applications.id),
  provider: text('provider').notNull(),
  externalFileId: text('external_file_id').notNull(),
  fileName: text('file_name').notNull(),
  contentType: text('content_type'),
  webUrl: text('web_url').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_candidate_documents_provider_external').on(table.provider, table.externalFileId),
  index('idx_candidate_documents_candidate').on(table.candidateId),
]);
