'use client';

import { useState } from 'react';

const navItems = [
  { label: 'Visão geral', icon: '⌂', active: true },
  { label: 'Vagas', icon: '▣' },
  { label: 'Candidatos', icon: '◎' },
  { label: 'Pipeline', icon: '≋' },
  { label: 'Entrevistas', icon: '◇' },
  { label: 'Banco de talentos', icon: '✦' },
];

const supportItems = [
  { label: 'Cargos e salários', icon: '▤' },
  { label: 'Admissões', icon: '↗' },
  { label: 'Integrações', icon: '⎋' },
  { label: 'Configurações', icon: '⚙' },
];

const kpis = [
  { label: 'Vagas em andamento', value: '0', hint: 'Nenhuma vaga ativa', tone: 'blue' },
  { label: 'Candidatos no processo', value: '0', hint: 'Aguardando integrações', tone: 'violet' },
  { label: 'Entrevistas hoje', value: '0', hint: 'Agenda livre', tone: 'green' },
  { label: 'Fora do SLA', value: '0', hint: 'Tudo sob controle', tone: 'amber' },
];

export default function DashboardClient({ userName }: { userName: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <button
        className={`sidebar-backdrop ${sidebarOpen ? 'is-open' : ''}`}
        aria-label="Fechar menu"
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <p className="brand-name">Nexo <strong>Flow</strong></p>
            <p className="brand-tagline">Do currículo à decisão.</p>
          </div>
        </div>

        <nav className="nav" aria-label="Navegação principal">
          <p className="nav-label">Operação</p>
          {navItems.map((item) => (
            <button key={item.label} className={`nav-item ${item.active ? 'active' : ''}`}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
          <p className="nav-label nav-label-spaced">Gestão</p>
          {supportItems.map((item) => (
            <button key={item.label} className="nav-item">
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="avatar" aria-hidden="true">{userName.slice(0, 2).toUpperCase()}</div>
          <div><p>{userName}</p><span>Administrador RH</span></div>
          <button aria-label="Opções do perfil">•••</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="menu-button" aria-label="Abrir menu" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="search">
            <span aria-hidden="true">⌕</span>
            <input aria-label="Buscar no Nexo Flow" placeholder="Buscar vaga, candidato ou gestor..." />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notificações">○<span className="notification-dot" /></button>
            <button className="primary-button"><span aria-hidden="true">＋</span> Nova vaga</button>
          </div>
        </header>

        <div className="content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">PAINEL OPERACIONAL</p>
              <h1>Bom dia, {userName.split(' ')[0]}</h1>
              <p>Acompanhe o processo seletivo de ponta a ponta.</p>
            </div>
            <div className="date-chip"><span aria-hidden="true">□</span> Hoje · São Paulo</div>
          </section>

          <section className="kpi-grid" aria-label="Indicadores principais">
            {kpis.map((kpi) => (
              <article className="kpi-card" key={kpi.label}>
                <div className={`kpi-icon ${kpi.tone}`} aria-hidden="true"><span /></div>
                <div className="kpi-copy"><p>{kpi.label}</p><strong>{kpi.value}</strong><span>{kpi.hint}</span></div>
                <button aria-label={`Ver ${kpi.label}`}>↗</button>
              </article>
            ))}
          </section>

          <section className="dashboard-grid">
            <article className="panel agenda-panel">
              <div className="panel-header">
                <div><p className="eyebrow">PRÓXIMOS COMPROMISSOS</p><h2>Agenda de entrevistas</h2></div>
                <button className="text-button">Ver agenda <span>→</span></button>
              </div>
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true">◇</div>
                <h3>Sua agenda está livre</h3>
                <p>Quando uma entrevista for agendada, ela aparecerá aqui com candidato, vaga e horário.</p>
                <button className="secondary-button">Agendar entrevista</button>
              </div>
            </article>

            <article className="panel attention-panel">
              <div className="panel-header">
                <div><p className="eyebrow">PRIORIDADES</p><h2>Precisa de atenção</h2></div>
                <span className="count-badge">0</span>
              </div>
              <div className="attention-empty">
                <div className="success-mark" aria-hidden="true">✓</div>
                <h3>Tudo em dia</h3>
                <p>Nenhuma pendência operacional no momento.</p>
              </div>
            </article>

            <article className="panel flow-panel">
              <div className="panel-header">
                <div><p className="eyebrow">FLUXO PRINCIPAL</p><h2>Da solicitação à admissão</h2></div>
                <span className="status-pill">Estrutura pronta</span>
              </div>
              <div className="process-flow" aria-label="Etapas do processo seletivo">
                {['Solicitação', 'Vaga', 'Triagem', 'Entrevista', 'Parecer', 'Decisão', 'Admissão'].map((step, index) => (
                  <div className="flow-step" key={step}>
                    <span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p>{index < 6 && <i aria-hidden="true" />}
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>
      </main>
    </div>
  );
}
