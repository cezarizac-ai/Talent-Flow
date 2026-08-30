const state = { vacancies: [], candidates: [], applications: [], interviews: [], summary: {}, integrations: {} };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = 'toast'; }, 3200);
}

function openView(view) {
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `${view}View`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $('#sidebar').classList.remove('open');
  $('#sidebarBackdrop').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'integrations') loadIntegrations();
}

function openModal(type) {
  $(`#${type}Modal`).classList.add('open');
  setTimeout(() => $(`#${type}Modal input`)?.focus(), 60);
}

function closeModals() { $$('.modal').forEach((modal) => modal.classList.remove('open')); }

function statusLabel(status) {
  return ({ draft: 'Em preparação', open: 'Aberta', paused: 'Pausada', closed: 'Fechada', new: 'Novo', screening: 'Em triagem', preselected: 'Pré-selecionado', rh_interview_scheduled: 'Entrevista agendada', sent_to_manager: 'Com gestor' })[status] || status || '—';
}

function sourceLabel(source) {
  return ({ manual: 'Manual', microsoft_forms: 'Microsoft Forms', google_forms: 'Google Forms' })[source] || source || '—';
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short' }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return 'Nenhum evento recebido';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

const integrationCopy = {
  microsoft: {
    title: 'Microsoft Forms',
    instructions: '<strong>Power Automate</strong><ol><li>Use o gatilho do Microsoft Forms e obtenha os detalhes da resposta.</li><li>Adicione uma ação HTTP com método POST e o endpoint acima.</li><li>Envie <code>Content-Type: application/json</code> e <code>x-api-key</code> com a mesma chave cadastrada aqui.</li><li>Use o ID da resposta em <code>external_response_id</code>. Reenvios serão ignorados.</li></ol>',
  },
  google: {
    title: 'Google Forms',
    instructions: '<strong>Google Apps Script</strong><ol><li>Crie um gatilho instalável para o envio do formulário.</li><li>Faça POST do registro normalizado para o endpoint acima.</li><li>Envie <code>Content-Type: application/json</code> e <code>x-api-key</code>.</li><li>Inclua <code>external_submission_id</code>, nome, e-mail e a referência da vaga.</li></ol>',
  },
  documents: {
    title: 'OneDrive / SharePoint',
    instructions: '<strong>Power Automate</strong><ol><li>Após salvar o arquivo na biblioteca privada, envie apenas seus metadados ao Nexo Flow.</li><li>Inclua <code>candidate_email</code>, <code>external_file_id</code>, <code>file_name</code> e <code>web_url</code>.</li><li>Envie <code>Content-Type: application/json</code> e <code>x-api-key</code>.</li><li>O arquivo original permanece no Microsoft 365; o Nexo Flow registra o vínculo seguro.</li></ol>',
  },
};

function renderIntegrations() {
  Object.entries(state.integrations).forEach(([provider, details]) => {
    const card = $(`.integration-card[data-provider="${provider}"]`);
    if (!card) return;
    const status = $('.integration-status', card);
    const total = Number(details.totals?.processed || 0);
    const latestHasError = details.last_event?.status === 'error';
    status.textContent = details.configured ? (latestHasError ? 'Requer atenção' : 'Configurado') : 'A configurar';
    status.className = `status-pill integration-status ${details.configured ? (latestHasError ? 'warning' : '') : 'neutral'}`;
    $('.integration-count', card).textContent = String(total);
    const latest = details.last_event;
    $('.integration-meta', card).textContent = latest
      ? `Último evento: ${formatDateTime(latest.received_at)} · ${latest.status === 'error' ? 'erro' : 'recebido'}`
      : details.configured
        ? `Chave ativa terminada em ••••${details.key_last4}`
        : 'Nenhum evento recebido';
    $('.integration-config', card).textContent = details.configured ? 'Atualizar configuração' : 'Configurar webhook';
  });
}

async function loadIntegrations() {
  try {
    const response = await fetch('/api/integrations/status');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível consultar as integrações.');
    state.integrations = result;
    renderIntegrations();
  } catch (error) {
    $$('.integration-status').forEach((status) => { status.textContent = 'Indisponível'; status.className = 'status-pill warning integration-status'; });
    showToast(error.message || 'Não foi possível consultar as integrações.', 'error');
  }
}

function openIntegrationModal(provider) {
  const details = state.integrations[provider];
  const copy = integrationCopy[provider];
  if (!details || !copy) return showToast('Atualize o status antes de configurar.', 'error');
  $('#integrationForm').dataset.provider = provider;
  $('#integrationTitle').textContent = `Configurar ${copy.title}`;
  $('#integrationEndpoint').value = details.endpoint;
  $('#integrationInstructions').innerHTML = copy.instructions;
  $('#integrationKey').value = '';
  openModal('integration');
}

async function copyEndpoint() {
  const field = $('#integrationEndpoint');
  try {
    await navigator.clipboard.writeText(field.value);
  } catch {
    field.select();
    document.execCommand('copy');
  }
  showToast('Endpoint copiado.');
}

async function configureIntegration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const provider = form.dataset.provider;
  const submit = $('button[type="submit"]', form);
  submit.disabled = true;
  submit.textContent = 'Salvando...';
  try {
    const response = await fetch(`/api/integrations/${provider}/key`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ api_key: $('#integrationKey').value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a configuração.');
    form.reset();
    closeModals();
    showToast('Integração configurada com segurança.');
    await loadIntegrations();
  } catch (error) {
    showToast(error.message || 'Não foi possível salvar a configuração.', 'error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Salvar configuração';
  }
}

function populateVacancyOptions() {
  const options = state.vacancies.map((vacancy) => `<option value="${escapeHtml(vacancy.id)}">${escapeHtml(vacancy.title)}</option>`).join('');
  $('#candidateVacancy').innerHTML = `<option value="">Sem vaga vinculada</option>${options}`;
  $('#pipelineVacancyFilter').innerHTML = `<option value="">Todas as vagas</option>${options}`;
}

function renderVacancies(filter = '') {
  const term = filter.trim().toLowerCase();
  const status = $('#vacancyStatusFilter').value;
  const rows = state.vacancies.filter((item) => {
    const haystack = `${item.title} ${item.department} ${item.manager}`.toLowerCase();
    return (!term || haystack.includes(term)) && (!status || item.status === status);
  });
  $('#vacanciesEmpty').style.display = rows.length ? 'none' : 'flex';
  $('#vacanciesList').innerHTML = rows.map((item) => `
    <div class="table-row vacancy-row">
      <span class="table-primary"><span class="row-avatar">${escapeHtml(item.title.slice(0, 2).toUpperCase())}</span><span>${escapeHtml(item.title)}<small class="row-subtitle">${escapeHtml(item.department)}</small></span></span>
      <span>${escapeHtml(item.manager)}</span><span>${sourceLabel(item.source)}</span><span>${item.sla_days ?? '—'} dias</span><span class="row-status">${statusLabel(item.status)}</span>
    </div>`).join('');
}

function renderCandidates(filter = '') {
  const term = filter.trim().toLowerCase();
  const rows = state.candidates.filter((item) => `${item.full_name} ${item.email} ${item.vacancy_title || ''}`.toLowerCase().includes(term));
  $('#candidatesEmpty').style.display = rows.length ? 'none' : 'flex';
  $('#candidatesList').innerHTML = rows.map((item) => `
    <div class="table-row candidate-row">
      <span class="table-primary"><span class="row-avatar">${escapeHtml(item.full_name.slice(0, 2).toUpperCase())}</span><span>${escapeHtml(item.full_name)}<small class="row-subtitle">${escapeHtml(item.email)}</small></span></span>
      <span>${escapeHtml(item.vacancy_title || 'Sem vaga vinculada')}</span><span>${sourceLabel(item.source)}</span><span class="row-status">${statusLabel(item.application_status || 'new')}</span><span>${formatDate(item.updated_at)}</span>
    </div>`).join('');
}

function renderPipeline() {
  const vacancyId = $('#pipelineVacancyFilter').value;
  const columns = [
    ['new', 'Novos'], ['screening', 'Em triagem'], ['preselected', 'Pré-selecionados'], ['rh_interview_scheduled', 'Entrevista RH'], ['sent_to_manager', 'Com gestor']
  ];
  const applications = state.applications.filter((item) => !vacancyId || item.vacancy_id === vacancyId);
  $('#pipelineBoard').innerHTML = columns.map(([key, label]) => {
    const items = applications.filter((item) => item.status === key);
    return `<article class="kanban-column"><div class="kanban-header"><h2>${label}</h2><span>${items.length}</span></div>${items.length ? items.map((item) => `<div class="kanban-card"><strong>${escapeHtml(item.candidate_name)}</strong><span>${escapeHtml(item.vacancy_title)}</span><span>Atualizado ${formatDate(item.updated_at)}</span></div>`).join('') : '<div class="kanban-empty">Nenhuma candidatura<br>nesta etapa</div>'}</article>`;
  }).join('');
}

function renderSummary() {
  $('#kpiVacancies').textContent = state.summary.vacancies_open || 0;
  $('#kpiCandidates').textContent = state.summary.applications_active || 0;
  $('#kpiInterviews').textContent = state.summary.interviews_today || 0;
  $('#kpiOverdue').textContent = state.summary.vacancies_overdue || 0;
  $('#attentionCount').textContent = state.summary.vacancies_overdue || 0;
}

function renderWeek() {
  const formatterDay = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
  const formatterNumber = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' });
  const today = new Date();
  $('#weekDays').innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() + index);
    return `<div class="day-card ${index === 0 ? 'today' : ''}"><strong>${formatterNumber.format(date)}</strong><span>${formatterDay.format(date)}</span></div>`;
  }).join('');
}

async function loadData() {
  try {
    const response = await fetch('/api/bootstrap');
    if (!response.ok) throw new Error('Não foi possível carregar os dados');
    const data = await response.json();
    Object.assign(state, data);
    renderSummary(); renderVacancies(); renderCandidates(); populateVacancyOptions(); renderPipeline();
  } catch (error) {
    showToast('A visualização está pronta, mas os dados não puderam ser carregados.', 'error');
  }
}

async function submitForm(form, endpoint, successMessage) {
  const data = Object.fromEntries(new FormData(form).entries());
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível salvar');
  form.reset(); closeModals(); showToast(successMessage); await loadData();
}

document.addEventListener('DOMContentLoaded', () => {
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
  $('#todayLabel').textContent = date.charAt(0).toUpperCase() + date.slice(1);
  renderWeek();
  $$('.nav-item').forEach((item) => item.addEventListener('click', () => openView(item.dataset.view)));
  $$('[data-view-link]').forEach((item) => item.addEventListener('click', () => openView(item.dataset.viewLink)));
  $$('[data-open-modal]').forEach((item) => item.addEventListener('click', () => openModal(item.dataset.openModal)));
  $$('[data-close-modal]').forEach((item) => item.addEventListener('click', closeModals));
  $('#quickCreate').addEventListener('click', () => openModal('vacancy'));
  $('#menuButton').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.add('open'); });
  $('#sidebarBackdrop').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('open'); });
  $('#vacanciesView [data-filter]').addEventListener('input', (event) => renderVacancies(event.target.value));
  $('#candidatesView [data-filter]').addEventListener('input', (event) => renderCandidates(event.target.value));
  $('#vacancyStatusFilter').addEventListener('change', () => renderVacancies($('#vacanciesView [data-filter]').value));
  $('#pipelineVacancyFilter').addEventListener('change', renderPipeline);
  $('#scheduleInterview').addEventListener('click', () => showToast('Selecione primeiro uma candidatura no módulo Candidatos.'));
  $('#vacancyForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await submitForm(event.target, '/api/vacancies', 'Vaga criada com sucesso.'); } catch (error) { showToast(error.message, 'error'); } });
  $('#candidateForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await submitForm(event.target, '/api/candidates', 'Candidato registrado com sucesso.'); } catch (error) { showToast(error.message, 'error'); } });
  $$('.integration-config').forEach((button) => button.addEventListener('click', () => openIntegrationModal(button.dataset.configProvider)));
  $('#integrationForm').addEventListener('submit', configureIntegration);
  $('#copyEndpoint').addEventListener('click', copyEndpoint);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModals(); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#globalSearch').focus(); } });
  $('#globalSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') { const term = event.target.value; openView('vacancies'); $('#vacanciesView [data-filter]').value = term; renderVacancies(term); } });
  loadData();
});
