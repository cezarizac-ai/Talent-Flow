const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const clean = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const nowIso = () => new Date().toISOString();
const randomId = () => crypto.randomUUID();
const ownerHeader = 'oai-authenticated-user-id';
const allowedProviders = new Set(['microsoft', 'google', 'documents']);

function boolish(value) {
  if (typeof value === 'boolean') return value;
  const normalized = clean(String(value ?? ''), 20).toLowerCase();
  if (['sim', 'yes', 'true', '1'].includes(normalized)) return true;
  if (['não', 'nao', 'no', 'false', '0'].includes(normalized)) return false;
  return null;
}

function arrayish(value) {
  if (Array.isArray(value)) return value.map((item) => clean(String(item), 200)).filter(Boolean);
  return clean(String(value ?? ''), 2000).split(';').map((item) => item.trim()).filter(Boolean);
}

function integerish(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return '{}'; }
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 262144) throw new Error('payload_too_large');
  const text = await request.text();
  if (text.length > 262144) throw new Error('payload_too_large');
  try { return JSON.parse(text || '{}'); } catch { throw new Error('invalid_json'); }
}

function isHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

async function hashSecret(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function requireAdmin(request, env) {
  const userId = request.headers.get(ownerHeader);
  if (!userId) return json({ error: 'authentication_required' }, 401);
  if (env.NEXO_OWNER_USER_ID && !constantTimeEqual(userId, env.NEXO_OWNER_USER_ID)) return json({ error: 'access_denied' }, 403);
  return null;
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS vacancies (id TEXT PRIMARY KEY, title TEXT NOT NULL, department TEXT NOT NULL, manager TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'draft', source TEXT NOT NULL DEFAULT 'manual', external_response_id TEXT, reason TEXT, sla_days INTEGER NOT NULL DEFAULT 30, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vacancies_source_external ON vacancies(source, external_response_id) WHERE external_response_id IS NOT NULL`),
    db.prepare(`CREATE TABLE IF NOT EXISTS candidates (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL, email_normalized TEXT NOT NULL UNIQUE, phone TEXT, source TEXT NOT NULL DEFAULT 'manual', talent_consent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, vacancy_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', source_event_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(candidate_id) REFERENCES candidates(id), FOREIGN KEY(vacancy_id) REFERENCES vacancies(id))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_applications_candidate_vacancy_lookup ON applications(candidate_id, vacancy_id)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_source_event ON applications(source_event_id) WHERE source_event_id IS NOT NULL`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS application_history (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, previous_status TEXT, new_status TEXT NOT NULL, actor_user_id TEXT, note TEXT, created_at TEXT NOT NULL, FOREIGN KEY(application_id) REFERENCES applications(id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS interviews (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, type TEXT NOT NULL, scheduled_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled', interviewer TEXT, modality TEXT, created_at TEXT NOT NULL, FOREIGN KEY(application_id) REFERENCES applications(id))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_at ON interviews(scheduled_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS talent_pool_entries (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, application_id TEXT, interest_status TEXT NOT NULL DEFAULT 'unknown', notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(candidate_id) REFERENCES candidates(id), FOREIGN KEY(application_id) REFERENCES applications(id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admissions (id TEXT PRIMARY KEY, application_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', start_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(application_id) REFERENCES applications(id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS integration_tokens (id TEXT PRIMARY KEY, provider TEXT NOT NULL, token_hash TEXT NOT NULL, token_last4 TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_integration_tokens_provider_active ON integration_tokens(provider, revoked_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS integration_events (id TEXT PRIMARY KEY, source TEXT NOT NULL, event_key TEXT, event_type TEXT NOT NULL, status TEXT NOT NULL, entity_type TEXT, entity_id TEXT, error_code TEXT, error_message TEXT, received_at TEXT NOT NULL, processed_at TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_integration_events_source_received ON integration_events(source, received_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS job_requests (id TEXT PRIMARY KEY, source TEXT NOT NULL, external_response_id TEXT NOT NULL, raw_payload TEXT NOT NULL, normalized_payload TEXT NOT NULL, status TEXT NOT NULL, vacancy_id TEXT, received_at TEXT NOT NULL, UNIQUE(source, external_response_id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS candidate_submissions (id TEXT PRIMARY KEY, source TEXT NOT NULL, external_submission_id TEXT NOT NULL, raw_payload TEXT NOT NULL, candidate_id TEXT, application_id TEXT, status TEXT NOT NULL, received_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(source, external_submission_id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS candidate_documents (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, application_id TEXT, provider TEXT NOT NULL, external_file_id TEXT NOT NULL, file_name TEXT NOT NULL, content_type TEXT, web_url TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(provider, external_file_id))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_candidate_documents_candidate ON candidate_documents(candidate_id)`),
  ]);
  await db.prepare('PRAGMA optimize').run();
}

async function recordEvent(db, { source, eventKey = null, eventType, status, entityType = null, entityId = null, errorCode = null, errorMessage = null }) {
  const timestamp = nowIso();
  await db.prepare(`INSERT INTO integration_events (id,source,event_key,event_type,status,entity_type,entity_id,error_code,error_message,received_at,processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(randomId(), source, eventKey, eventType, status, entityType, entityId, errorCode, clean(errorMessage, 500) || null, timestamp, timestamp).run();
}

async function authenticateIntegration(request, db, provider) {
  const supplied = clean(request.headers.get('x-api-key') || '', 500);
  if (!supplied) return false;
  const suppliedHash = await hashSecret(supplied);
  const token = await db.prepare(`SELECT id, token_hash FROM integration_tokens WHERE provider = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(provider).first();
  if (!token || !constantTimeEqual(token.token_hash, suppliedHash)) return false;
  await db.prepare(`UPDATE integration_tokens SET last_used_at = ? WHERE id = ?`).bind(nowIso(), token.id).run();
  return true;
}

async function bootstrap(db) {
  await ensureSchema(db);
  const [vacancies, candidates, applications, interviews, summary] = await db.batch([
    db.prepare(`SELECT * FROM vacancies ORDER BY created_at DESC`),
    db.prepare(`SELECT c.*, (SELECT v.title FROM applications a JOIN vacancies v ON v.id = a.vacancy_id WHERE a.candidate_id = c.id ORDER BY a.updated_at DESC LIMIT 1) AS vacancy_title, (SELECT a.status FROM applications a WHERE a.candidate_id = c.id ORDER BY a.updated_at DESC LIMIT 1) AS application_status FROM candidates c ORDER BY c.updated_at DESC`),
    db.prepare(`SELECT a.*, c.full_name AS candidate_name, v.title AS vacancy_title FROM applications a JOIN candidates c ON c.id = a.candidate_id JOIN vacancies v ON v.id = a.vacancy_id ORDER BY a.updated_at DESC`),
    db.prepare(`SELECT * FROM interviews ORDER BY scheduled_at ASC`),
    db.prepare(`SELECT (SELECT COUNT(*) FROM vacancies WHERE status IN ('new_request','draft','open','paused')) AS vacancies_open, (SELECT COUNT(*) FROM applications WHERE status NOT IN ('rejected','hired','withdrawn')) AS applications_active, (SELECT COUNT(*) FROM interviews WHERE status = 'scheduled' AND date(scheduled_at) = date('now','-3 hours')) AS interviews_today, (SELECT COUNT(*) FROM vacancies WHERE status IN ('new_request','draft','open','paused') AND julianday('now') - julianday(created_at) > sla_days) AS vacancies_overdue`),
  ]);
  return { vacancies: vacancies.results, candidates: candidates.results, applications: applications.results, interviews: interviews.results, summary: summary.results[0] || {} };
}

async function integrationStatus(request, db) {
  await ensureSchema(db);
  const origin = new URL(request.url).origin;
  const providers = [
    ['microsoft', '/api/public/webhooks/microsoft-forms'],
    ['google', '/api/public/webhooks/google-forms'],
    ['documents', '/api/public/webhooks/documents'],
  ];
  const result = {};
  for (const [provider, path] of providers) {
    const [token, event, totals] = await db.batch([
      db.prepare(`SELECT token_last4, created_at, last_used_at FROM integration_tokens WHERE provider = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(provider),
      db.prepare(`SELECT status, error_code, received_at FROM integration_events WHERE source = ? ORDER BY received_at DESC LIMIT 1`).bind(provider),
      db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) AS processed, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors FROM integration_events WHERE source = ?`).bind(provider),
    ]);
    result[provider] = {
      configured: token.results.length > 0,
      key_last4: token.results[0]?.token_last4 || null,
      key_created_at: token.results[0]?.created_at || null,
      last_used_at: token.results[0]?.last_used_at || null,
      endpoint: `${origin}${path}`,
      last_event: event.results[0] || null,
      totals: totals.results[0] || { total: 0, processed: 0, errors: 0 },
    };
  }
  return json(result);
}

async function configureIntegrationKey(request, db, provider) {
  if (!allowedProviders.has(provider)) return json({ error: 'provider_not_supported' }, 404);
  let body; try { body = await readJson(request); } catch (error) { return json({ error: error.message }, error.message === 'payload_too_large' ? 413 : 400); }
  const secret = clean(body.api_key, 500);
  if (secret.length < 32) return json({ error: 'A chave deve ter pelo menos 32 caracteres.' }, 400);
  const timestamp = nowIso();
  const hash = await hashSecret(secret);
  await db.batch([
    db.prepare(`UPDATE integration_tokens SET revoked_at = ? WHERE provider = ? AND revoked_at IS NULL`).bind(timestamp, provider),
    db.prepare(`INSERT INTO integration_tokens (id,provider,token_hash,token_last4,created_by,created_at) VALUES (?,?,?,?,?,?)`).bind(randomId(), provider, hash, secret.slice(-4), request.headers.get(ownerHeader) || null, timestamp),
  ]);
  return json({ configured: true, key_last4: secret.slice(-4), created_at: timestamp });
}

async function createVacancy(request, db) {
  let body; try { body = await readJson(request); } catch (error) { return json({ error: error.message }, error.message === 'payload_too_large' ? 413 : 400); }
  const title = clean(body.title, 140); const department = clean(body.department, 120); const manager = clean(body.manager, 140);
  if (!title || !department || !manager) return json({ error: 'Preencha cargo, departamento e gestor.' }, 400);
  const id = randomId(); const timestamp = nowIso();
  await db.prepare(`INSERT INTO vacancies (id,title,department,manager,quantity,priority,status,source,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, title, department, manager, integerish(body.quantity), ['normal','high','urgent'].includes(body.priority) ? body.priority : 'normal', ['new_request','draft','open'].includes(body.status) ? body.status : 'draft', ['manual','microsoft_forms'].includes(body.source) ? body.source : 'manual', clean(body.reason, 2000) || null, timestamp, timestamp).run();
  return json({ id }, 201);
}

async function createCandidate(request, db) {
  let body; try { body = await readJson(request); } catch (error) { return json({ error: error.message }, error.message === 'payload_too_large' ? 413 : 400); }
  const fullName = clean(body.full_name, 160); const email = clean(body.email, 180); const normalized = email.toLowerCase();
  if (!fullName || !email || !email.includes('@')) return json({ error: 'Informe nome e e-mail válidos.' }, 400);
  const timestamp = nowIso();
  let candidate = await db.prepare(`SELECT id FROM candidates WHERE email_normalized = ?`).bind(normalized).first();
  let candidateId = candidate?.id;
  if (!candidateId) {
    candidateId = randomId();
    await db.prepare(`INSERT INTO candidates (id,full_name,email,email_normalized,phone,source,talent_consent,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(candidateId, fullName, email, normalized, clean(body.phone,40) || null, ['manual','google_forms'].includes(body.source) ? body.source : 'manual', body.talent_consent === '1' ? 1 : 0, timestamp, timestamp).run();
  }
  const vacancyId = clean(body.vacancy_id, 80);
  if (vacancyId) {
    const vacancy = await db.prepare(`SELECT id FROM vacancies WHERE id = ?`).bind(vacancyId).first();
    if (!vacancy) return json({ error: 'A vaga selecionada não existe.' }, 400);
    const existing = await db.prepare(`SELECT id FROM applications WHERE candidate_id = ? AND vacancy_id = ? AND source_event_id IS NULL`).bind(candidateId, vacancyId).first();
    if (!existing) {
      const applicationId = randomId();
      await db.batch([
        db.prepare(`INSERT INTO applications (id,candidate_id,vacancy_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?)`).bind(applicationId,candidateId,vacancyId,'new',timestamp,timestamp),
        db.prepare(`INSERT INTO application_history (id,application_id,previous_status,new_status,actor_user_id,created_at) VALUES (?,?,?,?,?,?)`).bind(randomId(),applicationId,null,'new',request.headers.get(ownerHeader)||null,timestamp),
      ]);
    }
  }
  return json({ id: candidateId }, 201);
}

function microsoftNormalized(body) {
  return {
    external_response_id: clean(body.external_response_id ?? body.response_id ?? body.Id ?? body.id, 180),
    gestor_nome: clean(body.gestor_nome, 160), gestor_email: clean(body.gestor_email, 180),
    departamento: clean(body.departamento, 140), cargo_nome: clean(body.cargo_nome, 180), quantidade: integerish(body.quantidade),
    tipo_contratacao: clean(body.tipo_contratacao, 100), vaga_aprovada: boolish(body.vaga_aprovada), aprovador_nome: clean(body.aprovador_nome, 160),
    motivo_abertura: clean(body.motivo_abertura, 500), motivo_descricao: clean(body.motivo_descricao, 3000), colaborador_substituido: clean(body.colaborador_substituido, 180) || null,
    faixa_salarial_aprovada: clean(body.faixa_salarial_aprovada, 180) || null, possui_remuneracao_variavel: boolish(body.possui_remuneracao_variavel), remuneracao_variavel_descricao: clean(body.remuneracao_variavel_descricao, 1000) || null,
    escolaridade_minima: clean(body.escolaridade_minima, 180), tempo_experiencia_minimo: clean(body.tempo_experiencia_minimo, 180), grau_urgencia: clean(body.grau_urgencia, 80),
    escopo_vaga: clean(body.escopo_vaga, 3000) || null, atividades_responsabilidades: clean(body.atividades_responsabilidades, 5000), experiencias_necessarias: clean(body.experiencias_necessarias, 5000), resultados_esperados: clean(body.resultados_esperados, 5000),
    exige_certificacao: boolish(body.exige_certificacao), certificacoes_desc: clean(body.certificacoes_desc, 1500) || null, modalidade_trabalho: clean(body.modalidade_trabalho, 120), divisao_presencial_remoto: clean(body.divisao_presencial_remoto, 500) || null,
    perfil_comportamental: arrayish(body.perfil_comportamental), ritmo_trabalho: arrayish(body.ritmo_trabalho), melhores_periodos_entrevista: clean(body.melhores_periodos_entrevista, 1000),
  };
}

async function microsoftWebhook(request, db) {
  if (!await authenticateIntegration(request, db, 'microsoft')) return json({ error: 'unauthorized' }, 401);
  let body; try { body = await readJson(request); } catch (error) { return json({ error: error.message }, error.message === 'payload_too_large' ? 413 : 400); }
  const normalized = microsoftNormalized(body);
  const eventKey = normalized.external_response_id;
  if (!eventKey || !normalized.cargo_nome || !normalized.departamento || (!normalized.gestor_nome && !normalized.gestor_email)) {
    await recordEvent(db, { source: 'microsoft', eventKey, eventType: 'job_request', status: 'error', errorCode: 'validation_failed', errorMessage: 'Campos obrigatórios ausentes.' });
    return json({ error: 'validation_failed', fields: ['external_response_id','cargo_nome','departamento','gestor_nome|gestor_email'] }, 422);
  }
  const duplicate = await db.prepare(`SELECT vacancy_id FROM job_requests WHERE source = 'microsoft_forms' AND external_response_id = ?`).bind(eventKey).first();
  if (duplicate) {
    await recordEvent(db, { source: 'microsoft', eventKey, eventType: 'job_request', status: 'duplicate', entityType: 'vacancy', entityId: duplicate.vacancy_id });
    return json({ status: 'duplicate', vacancy_id: duplicate.vacancy_id });
  }
  const vacancyId = randomId(); const timestamp = nowIso();
  const urgency = normalized.grau_urgencia.toLowerCase();
  const priority = urgency.includes('urgent') || urgency.includes('alta') ? 'urgent' : urgency.includes('média') || urgency.includes('media') ? 'high' : 'normal';
  const manager = normalized.gestor_nome || normalized.gestor_email;
  await db.batch([
    db.prepare(`INSERT INTO vacancies (id,title,department,manager,quantity,priority,status,source,external_response_id,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(vacancyId,normalized.cargo_nome,normalized.departamento,manager,normalized.quantidade,priority,'new_request','microsoft_forms',eventKey,normalized.motivo_descricao||normalized.motivo_abertura||null,timestamp,timestamp),
    db.prepare(`INSERT INTO job_requests (id,source,external_response_id,raw_payload,normalized_payload,status,vacancy_id,received_at) VALUES (?,?,?,?,?,?,?,?)`).bind(randomId(),'microsoft_forms',eventKey,safeJson(body),safeJson(normalized),'processed',vacancyId,timestamp),
    db.prepare(`INSERT INTO integration_events (id,source,event_key,event_type,status,entity_type,entity_id,received_at,processed_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(randomId(),'microsoft',eventKey,'job_request','processed','vacancy',vacancyId,timestamp,timestamp),
  ]);
  return json({ status: 'processed', vacancy_id: vacancyId }, 201);
}

async function resolveVacancy(db, body) {
  const directId = clean(body.vacancy_id, 100);
  if (directId) return db.prepare(`SELECT id, title FROM vacancies WHERE id = ?`).bind(directId).first();
  const external = clean(body.vacancy_external_response_id ?? body.external_vacancy_id, 180);
  if (external) return db.prepare(`SELECT id, title FROM vacancies WHERE external_response_id = ?`).bind(external).first();
  const title = clean(body.vaga ?? body.vacancy_title ?? body.cargo, 180);
  if (title) return db.prepare(`SELECT id, title FROM vacancies WHERE lower(title) = lower(?) ORDER BY created_at DESC LIMIT 1`).bind(title).first();
  return null;
}

async function googleWebhook(request, db) {
  if (!await authenticateIntegration(request, db, 'google')) return json({ error: 'unauthorized' }, 401);
  let body; try { body = await readJson(request); } catch (error) { return json({ error: error.message }, error.message === 'payload_too_large' ? 413 : 400); }
  const submissionId = clean(body.external_submission_id ?? body.submission_id ?? body.response_id ?? body.id, 180);
  const fullName = clean(body.nome ?? body.full_name ?? body.name, 180);
  const email = clean(body.email, 180); const emailNormalized = email.toLowerCase();
  if (!submissionId || !fullName || !email.includes('@')) {
    await recordEvent(db, { source: 'google', eventKey: submissionId, eventType: 'candidate_submission', status: 'error', errorCode: 'validation_failed', errorMessage: 'Identificador, nome ou e-mail inválido.' });
    return json({ error: 'validation_failed', fields: ['external_submission_id','nome','email'] }, 422);
  }
  const resumeUrl = clean(body.curriculo_url ?? body.resume_url ?? body.web_url, 2000);
  const resumeId = clean(body.curriculo_file_id ?? body.resume_file_id ?? body.external_file_id, 500) || (resumeUrl ? `${submissionId}:resume` : '');
  if (resumeUrl && !isHttpsUrl(resumeUrl)) {
    await recordEvent(db, { source: 'google', eventKey: submissionId, eventType: 'candidate_submission', status: 'error', errorCode: 'invalid_document_url', errorMessage: 'O link do currículo deve usar HTTPS.' });
    return json({ error: 'invalid_document_url' }, 422);
  }
  const duplicate = await db.prepare(`SELECT candidate_id, application_id, status FROM candidate_submissions WHERE source = 'google_forms' AND external_submission_id = ?`).bind(submissionId).first();
  if (duplicate) {
    await recordEvent(db, { source: 'google', eventKey: submissionId, eventType: 'candidate_submission', status: 'duplicate', entityType: duplicate.application_id ? 'application' : 'candidate', entityId: duplicate.application_id || duplicate.candidate_id });
    return json({ status: 'duplicate', candidate_id: duplicate.candidate_id, application_id: duplicate.application_id });
  }
  const timestamp = nowIso();
  let candidate = await db.prepare(`SELECT id FROM candidates WHERE email_normalized = ?`).bind(emailNormalized).first();
  let candidateId = candidate?.id;
  const phone = clean(body.telefone ?? body.whatsapp ?? body.phone, 60);
  if (!candidateId) {
    candidateId = randomId();
    await db.prepare(`INSERT INTO candidates (id,full_name,email,email_normalized,phone,source,talent_consent,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(candidateId,fullName,email,emailNormalized,phone||null,'google_forms',boolish(body.consentimento_banco_talentos ?? body.talent_consent)===true?1:0,timestamp,timestamp).run();
  } else {
    await db.prepare(`UPDATE candidates SET full_name = ?, phone = COALESCE(NULLIF(?,''), phone), updated_at = ? WHERE id = ?`).bind(fullName,phone,timestamp,candidateId).run();
  }
  const vacancy = await resolveVacancy(db, body);
  let applicationId = null; let status = 'pending_vacancy';
  if (vacancy) {
    applicationId = randomId(); status = 'processed';
    await db.batch([
      db.prepare(`INSERT INTO applications (id,candidate_id,vacancy_id,status,source_event_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).bind(applicationId,candidateId,vacancy.id,'new',submissionId,timestamp,timestamp),
      db.prepare(`INSERT INTO application_history (id,application_id,previous_status,new_status,actor_user_id,note,created_at) VALUES (?,?,?,?,?,?,?)`).bind(randomId(),applicationId,null,'new',null,'Candidatura recebida pelo Google Forms.',timestamp),
    ]);
  }
  if (resumeUrl && resumeId) {
    await db.prepare(`INSERT OR IGNORE INTO candidate_documents (id,candidate_id,application_id,provider,external_file_id,file_name,content_type,web_url,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(randomId(),candidateId,applicationId,clean(body.document_provider,50)||'google_drive',resumeId,clean(body.curriculo_nome ?? body.resume_file_name,250)||'Currículo',clean(body.content_type,120)||'application/pdf',resumeUrl,timestamp).run();
  }
  await db.batch([
    db.prepare(`INSERT INTO candidate_submissions (id,source,external_submission_id,raw_payload,candidate_id,application_id,status,received_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(randomId(),'google_forms',submissionId,safeJson(body),candidateId,applicationId,status,timestamp,timestamp),
    db.prepare(`INSERT INTO integration_events (id,source,event_key,event_type,status,entity_type,entity_id,received_at,processed_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(randomId(),'google',submissionId,'candidate_submission',status,applicationId?'application':'candidate',applicationId||candidateId,timestamp,timestamp),
  ]);
  return json({ status, candidate_id: candidateId, application_id: applicationId }, vacancy ? 201 : 202);
}

async function documentsWebhook(request, db) {
  if (!await authenticateIntegration(request, db, 'documents')) return json({ error: 'unauthorized' }, 401);
  let body; try { body = await readJson(request); } catch (error) { return json({ error: error.message }, error.message === 'payload_too_large' ? 413 : 400); }
  const email = clean(body.candidate_email ?? body.email, 180).toLowerCase();
  const externalFileId = clean(body.external_file_id ?? body.file_id, 500);
  const webUrl = clean(body.web_url ?? body.url, 2000);
  const fileName = clean(body.file_name ?? body.name, 250);
  if (!email.includes('@') || !externalFileId || !webUrl || !fileName || !isHttpsUrl(webUrl)) {
    await recordEvent(db, { source: 'documents', eventKey: externalFileId, eventType: 'candidate_document', status: 'error', errorCode: 'validation_failed', errorMessage: 'E-mail, identificador, arquivo ou URL HTTPS inválido.' });
    return json({ error: 'validation_failed', fields: ['candidate_email','external_file_id','web_url_https','file_name'] }, 422);
  }
  const provider = clean(body.provider, 50) || 'onedrive';
  const duplicate = await db.prepare(`SELECT candidate_id FROM candidate_documents WHERE provider = ? AND external_file_id = ?`).bind(provider, externalFileId).first();
  if (duplicate) {
    await recordEvent(db, { source: 'documents', eventKey: externalFileId, eventType: 'candidate_document', status: 'duplicate', entityType: 'candidate', entityId: duplicate.candidate_id });
    return json({ status: 'duplicate', candidate_id: duplicate.candidate_id });
  }
  const candidate = await db.prepare(`SELECT id FROM candidates WHERE email_normalized = ?`).bind(email).first();
  if (!candidate) {
    await recordEvent(db, { source: 'documents', eventKey: externalFileId, eventType: 'candidate_document', status: 'error', errorCode: 'candidate_not_found', errorMessage: 'Nenhum candidato corresponde ao e-mail informado.' });
    return json({ error: 'candidate_not_found' }, 404);
  }
  const applicationId = clean(body.application_id, 100) || null;
  if (applicationId) {
    const application = await db.prepare(`SELECT id FROM applications WHERE id = ? AND candidate_id = ?`).bind(applicationId, candidate.id).first();
    if (!application) {
      await recordEvent(db, { source: 'documents', eventKey: externalFileId, eventType: 'candidate_document', status: 'error', errorCode: 'application_not_found', errorMessage: 'A candidatura não pertence ao candidato informado.' });
      return json({ error: 'application_not_found' }, 404);
    }
  }
  const timestamp = nowIso();
  await db.batch([
    db.prepare(`INSERT INTO candidate_documents (id,candidate_id,application_id,provider,external_file_id,file_name,content_type,web_url,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(randomId(),candidate.id,applicationId,provider,externalFileId,fileName,clean(body.content_type,120)||null,webUrl,timestamp),
    db.prepare(`INSERT INTO integration_events (id,source,event_key,event_type,status,entity_type,entity_id,received_at,processed_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(randomId(),'documents',externalFileId,'candidate_document','processed','candidate',candidate.id,timestamp,timestamp),
  ]);
  return json({ status: 'processed', candidate_id: candidate.id }, 201);
}

function serveAsset(request, env, url) {
  const asset = assets[url.pathname] || (request.method === 'GET' ? assets['/'] : null);
  if (!asset) return new Response('Not found', { status: 404 });
  if (asset.type.startsWith('text/html') && env.NEXO_OWNER_USER_ID) {
    const userId = request.headers.get(ownerHeader);
    if (!userId) return Response.redirect(`${url.origin}/signin-with-chatgpt?return_to=${encodeURIComponent(url.pathname + url.search)}`, 302);
    if (!constantTimeEqual(userId, env.NEXO_OWNER_USER_ID)) return new Response('Acesso não autorizado.', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  const body = asset.binary ? Uint8Array.from(atob(asset.body), (character) => character.charCodeAt(0)) : asset.type.startsWith('text/html') ? asset.body.replaceAll('__ORIGIN__', url.origin) : asset.body;
  return new Response(body, { headers: { 'content-type': asset.type, 'cache-control': url.pathname === '/' ? 'no-cache' : 'public, max-age=3600' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return serveAsset(request, env, url);
    if (!env.DB) return json({ error: 'database_unavailable' }, 503);
    try {
      await ensureSchema(env.DB);
      if (url.pathname === '/api/public/webhooks/microsoft-forms' && request.method === 'POST') return microsoftWebhook(request, env.DB);
      if (url.pathname === '/api/public/webhooks/google-forms' && request.method === 'POST') return googleWebhook(request, env.DB);
      if (url.pathname === '/api/public/webhooks/documents' && request.method === 'POST') return documentsWebhook(request, env.DB);
      const denied = requireAdmin(request, env); if (denied) return denied;
      if (url.pathname === '/api/bootstrap' && request.method === 'GET') return json(await bootstrap(env.DB));
      if (url.pathname === '/api/integrations/status' && request.method === 'GET') return integrationStatus(request, env.DB);
      const keyMatch = url.pathname.match(/^\/api\/integrations\/(microsoft|google|documents)\/key$/);
      if (keyMatch && request.method === 'PUT') return configureIntegrationKey(request, env.DB, keyMatch[1]);
      if (url.pathname === '/api/vacancies' && request.method === 'POST') return createVacancy(request, env.DB);
      if (url.pathname === '/api/candidates' && request.method === 'POST') return createCandidate(request, env.DB);
      return json({ error: 'route_not_found' }, 404);
    } catch (error) {
      console.error('Nexo Flow API error', error instanceof Error ? error.message : 'unknown');
      return json({ error: 'operation_failed' }, 500);
    }
  },
};
