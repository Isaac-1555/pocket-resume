// tracker.js

const STORAGE_KEYS = [
  'applications',
  'trackerTrialStartedAt',
  'trackerUnlocked',
  'trackerLockDismissed',
];

const TRIAL_DAYS = 30;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

const COLUMNS = ['saved', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'];

const COLUMN_LABELS = {
  saved: 'Saved',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const COLUMN_COLORS = {
  saved: '#4a9eff',
  applied: '#ff8600',
  interview: '#a371f7',
  offer: '#2ea043',
  rejected: '#f85149',
  withdrawn: '#8896a5',
};

let applications = [];
let trialInfo = { startedAt: null, unlocked: false, locked: false, dismissed: false };
let locked = false;
let currentView = 'board';
let selectedAppId = null;

document.addEventListener('DOMContentLoaded', () => {
  const boardView = document.getElementById('boardView');
  const graphView = document.getElementById('graphView');
  const addBtn = document.getElementById('addBtn');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const upgradeBtn = document.getElementById('upgradeBtn');
  const dismissLockBtn = document.getElementById('dismissLockBtn');
  const lockBanner = document.getElementById('lockBanner');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');

  document.querySelectorAll('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentView = tab.dataset.view;
      boardView.style.display = currentView === 'board' ? 'grid' : 'none';
      graphView.style.display = currentView === 'graph' ? 'grid' : 'none';
      if (currentView === 'graph') renderGraph();
    });
  });

  addBtn.addEventListener('click', () => openModal(null));

  openSettingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  });

  upgradeBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#cloud-pricing') });
  });

  dismissLockBtn.addEventListener('click', () => {
    trialInfo.dismissed = true;
    chrome.storage.local.set({ trackerLockDismissed: true });
    lockBanner.classList.remove('visible');
  });

  modalCloseBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  init();
});

function generateId() {
  return 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
}

function getFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (data) => {
      if (chrome.runtime.lastError) {
        console.error('[Tracker] Storage read failed:', chrome.runtime.lastError);
        resolve({});
        return;
      }
      resolve(data || {});
    });
  });
}

async function checkPlanAccess() {
  if (!window.CloudSync || typeof window.CloudSync.isConfigured !== 'function' || !window.CloudSync.isConfigured()) {
    return false;
  }
  try {
    await window.CloudSync.init();
    if (!(await window.CloudSync.isSignedIn())) return false;
    return await window.CloudSync.hasCloudSyncAccess();
  } catch (err) {
    console.warn('[Tracker] Plan check failed:', err);
    return false;
  }
}

async function init() {
  const data = await getFromStorage(STORAGE_KEYS);
  applications = Array.isArray(data.applications) ? data.applications : [];
  trialInfo.startedAt = data.trackerTrialStartedAt || null;
  trialInfo.unlocked = !!data.trackerUnlocked;
  trialInfo.dismissed = !!data.trackerLockDismissed;

  const hasPlan = await checkPlanAccess();
  if (hasPlan && !trialInfo.unlocked) {
    trialInfo.unlocked = true;
    chrome.storage.local.set({ trackerUnlocked: true });
  }

  const trialElapsed = trialInfo.startedAt ? (Date.now() - trialInfo.startedAt) : 0;
  locked = !trialInfo.unlocked && !!trialInfo.startedAt && trialElapsed > TRIAL_MS;

  render();
  updatePlanBadge();
}

function updatePlanBadge() {
  const badge = document.getElementById('planBadge');
  if (!badge) return;
  if (trialInfo.unlocked) {
    badge.textContent = 'Pro';
    badge.className = 'plan-badge pro';
  } else if (locked) {
    badge.textContent = 'Trial ended';
    badge.className = 'plan-badge locked';
  } else {
    badge.textContent = 'Trial · free';
    badge.className = 'plan-badge trial';
  }
}

function render() {
  const banner = document.getElementById('lockBanner');
  const addBtn = document.getElementById('addBtn');
  if (locked && !trialInfo.dismissed) {
    banner.classList.add('visible');
  } else {
    banner.classList.remove('visible');
  }
  if (addBtn) addBtn.disabled = locked;
  renderBoard();
  if (currentView === 'graph') renderGraph();
}

function renderBoard() {
  const board = document.getElementById('boardView');
  board.innerHTML = '';

  if (!applications.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-board-note';
    empty.innerHTML = locked
      ? `<h2>Trial ended</h2><p>Your tracker is read-only. Upgrade to add new applications.</p>`
      : `<h2>No applications yet</h2>
      <p>Generate a resume from a job posting to auto-capture it here, or add one manually.</p>
      <button class="btn btn-primary" id="emptyAddBtn">+ Add your first job</button>`;
    board.appendChild(empty);
    const emptyAddBtn = empty.querySelector('#emptyAddBtn');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', () => openModal(null));
    }
    return;
  }

  COLUMNS.forEach((status) => {
    const col = document.createElement('div');
    col.className = 'board-column';
    col.dataset.status = status;

    const cards = applications
      .filter((app) => app.status === status)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const header = document.createElement('div');
    header.className = 'column-header';
    header.innerHTML = `
      <span class="column-dot" style="background:${COLUMN_COLORS[status]};"></span>
      <span class="column-title">${COLUMN_LABELS[status]}</span>
      <span class="column-count">${cards.length}</span>
    `;
    col.appendChild(header);

    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'column-cards';
    cardsContainer.dataset.status = status;

    if (!cards.length) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.textContent = locked ? 'Empty' : 'Drop a job here';
      cardsContainer.appendChild(emptyState);
    }

    cards.forEach((app) => {
      const card = createCard(app);
      cardsContainer.appendChild(card);
    });

    col.appendChild(cardsContainer);

    if (!locked) {
      cardsContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drag-over');
      });
      cardsContainer.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      cardsContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/application-id');
        if (!id) return;
        moveApplication(id, status);
      });
    }

    board.appendChild(col);
  });
}

function createCard(app) {
  const card = document.createElement('div');
  card.className = 'card' + (locked ? ' locked-card' : '');
  card.dataset.id = app.id;

  const date = app.dateSaved ? new Date(app.dateSaved).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const recruiterTag = app.recruiterName ? `<span class="card-tag accent" title="${escapeHtml(app.recruiterName)}">${escapeHtml(app.recruiterName)}</span>` : '';
  const linkTag = app.url
    ? `<span class="card-tag link" data-link="${escapeHtml(app.url)}" title="${escapeHtml(app.url)}">source ↗</span>`
    : '';

  card.innerHTML = `
    <p class="card-company">${escapeHtml(app.company || 'Unnamed company')}</p>
    <p class="card-role">${escapeHtml(app.role || 'Job posting')}</p>
    <div class="card-meta">
      ${date ? `<span class="card-tag">${date}</span>` : ''}
      ${recruiterTag}
      ${linkTag}
    </div>
  `;

  card.querySelector('[data-link]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.tabs.create({ url: app.url });
  });

  card.addEventListener('click', () => openModal(app));

  if (!locked) {
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/application-id', app.id);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  }

  return card;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function moveApplication(id, newStatus) {
  const app = applications.find((a) => a.id === id);
  if (!app) return;
  app.status = newStatus;
  const now = Date.now();
  if (newStatus === 'applied' && !app.appliedDate) app.appliedDate = now;
  if (newStatus === 'interview' && !app.interviewDate) app.interviewDate = now;
  app.updatedAt = now;
  persist();
  renderBoard();
}

function openModal(app) {
  const overlay = document.getElementById('modalOverlay');
  const body = document.getElementById('modalBody');
  const title = document.getElementById('modalTitle');
  selectedAppId = app ? app.id : null;

  const isNew = !app;
  title.textContent = app ? app.company || app.role || 'Application' : 'Add job';
  const isReadonly = locked;

  body.innerHTML = `
    <div class="field">
      <label for="m_company">Company</label>
      <input id="m_company" type="text" value="${escapeAttr(app?.company || '')}" ${isReadonly ? 'readonly' : ''} placeholder="Acme Inc.">
    </div>
    <div class="field">
      <label for="m_role">Role</label>
      <input id="m_role" type="text" value="${escapeAttr(app?.role || '')}" ${isReadonly ? 'readonly' : ''} placeholder="Senior Software Engineer">
    </div>
    <div class="field">
      <label for="m_url">Job URL</label>
      <input id="m_url" type="text" value="${escapeAttr(app?.url || '')}" ${isReadonly ? 'readonly' : ''} placeholder="https://…">
    </div>
    <div class="field">
      <label for="m_recruiter">Recruiter / hiring manager</label>
      <input id="m_recruiter" type="text" value="${escapeAttr(app?.recruiterName || '')}" ${isReadonly ? 'readonly' : ''} placeholder="Name, if known">
    </div>
    <div class="field">
      <label for="m_recEmail">Recruiter email</label>
      <input id="m_recEmail" type="text" value="${escapeAttr(app?.recruiterEmail || '')}" ${isReadonly ? 'readonly' : ''} placeholder="name@company.com">
    </div>
    <div class="field">
      <label for="m_status">Status</label>
      <select id="m_status" ${isReadonly ? 'disabled' : ''}>
        ${COLUMNS.map((s) => `<option value="${s}" ${app?.status === s ? 'selected' : ''}>${COLUMN_LABELS[s]}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="m_appliedDate">Applied date</label>
      <input id="m_appliedDate" type="date" value="${app?.appliedDate ? toDateInput(app.appliedDate) : ''}" ${isReadonly ? 'readonly' : ''}>
    </div>
    <div class="field">
      <label for="m_interviewDate">Interview date</label>
      <input id="m_interviewDate" type="date" value="${app?.interviewDate ? toDateInput(app.interviewDate) : ''}" ${isReadonly ? 'readonly' : ''}>
    </div>
    <div class="field">
      <label for="m_notes">Notes</label>
      <textarea id="m_notes" ${isReadonly ? 'readonly' : ''} placeholder="Anything worth remembering…">${escapeTextarea(app?.notes || '')}</textarea>
    </div>
    ${isReadonly ? '<p class="readonly-note">Read-only — your free trial has ended. Upgrade to edit applications.</p>' : ''}
  `;

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const right = document.createElement('div');
  right.className = 'right';

  if (app) {
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.disabled = isReadonly;
    delBtn.addEventListener('click', () => {
      if (!confirm('Delete this application?')) return;
      applications = applications.filter((a) => a.id !== app.id);
      persist();
      closeModal();
      renderBoard();
    });
    right.appendChild(delBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  right.appendChild(cancelBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = isNew ? 'Add job' : 'Save';
  saveBtn.disabled = isReadonly;
  saveBtn.addEventListener('click', () => saveModal(isNew));
  right.appendChild(saveBtn);

  actions.appendChild(right);
  body.appendChild(actions);
  overlay.classList.add('open');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function escapeTextarea(value) {
  return escapeHtml(value);
}

function toDateInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromDateInput(value) {
  if (!value) return null;
  const d = new Date(value + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d.getTime();
}

function saveModal(isNew) {
  const getVal = (id) => document.getElementById(id)?.value.trim() || '';

  const now = Date.now();
  if (isNew) {
    const app = {
      id: generateId(),
      company: getVal('m_company'),
      role: getVal('m_role'),
      url: getVal('m_url'),
      recruiterName: getVal('m_recruiter'),
      recruiterEmail: getVal('m_recEmail'),
      status: document.getElementById('m_status')?.value || 'saved',
      appliedDate: fromDateInput(getVal('m_appliedDate')),
      interviewDate: fromDateInput(getVal('m_interviewDate')),
      notes: document.getElementById('m_notes')?.value || '',
      dateSaved: now,
      updatedAt: now,
    };
    applications.push(app);
    if (!trialInfo.startedAt) {
      trialInfo.startedAt = now;
      chrome.storage.local.set({ trackerTrialStartedAt: now });
    }
  } else {
    const app = applications.find((a) => a.id === selectedAppId);
    if (!app) return;
    app.company = getVal('m_company');
    app.role = getVal('m_role');
    app.url = getVal('m_url');
    app.recruiterName = getVal('m_recruiter');
    app.recruiterEmail = getVal('m_recEmail');
    app.status = document.getElementById('m_status')?.value || app.status;
    app.appliedDate = fromDateInput(getVal('m_appliedDate'));
    app.interviewDate = fromDateInput(getVal('m_interviewDate'));
    app.notes = document.getElementById('m_notes')?.value || '';
    app.updatedAt = now;
  }

  persist();
  closeModal();
  renderBoard();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  selectedAppId = null;
}

function persist() {
  chrome.storage.local.set({ applications });
}

function renderGraph() {
  const graph = document.getElementById('graphView');
  graph.innerHTML = '';

  if (!applications.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-board-note';
    empty.innerHTML = `<h2>No data yet</h2><p>Add applications to see your funnel and progress.</p>`;
    graph.appendChild(empty);
    return;
  }

  const funnelCard = document.createElement('div');
  funnelCard.className = 'graph-card';
  funnelCard.innerHTML = `<h2>Application funnel</h2><p class="sub">Where each application currently sits</p>`;
  funnelCard.appendChild(buildFunnelSvg());
  graph.appendChild(funnelCard);

  const timelineCard = document.createElement('div');
  timelineCard.className = 'graph-card';
  timelineCard.innerHTML = `<h2>Submissions over time</h2><p class="sub">Last 12 weeks by week of save date</p>`;
  timelineCard.appendChild(buildTimelineSvg());
  graph.appendChild(timelineCard);

  const outcomesCard = document.createElement('div');
  outcomesCard.className = 'graph-card';
  outcomesCard.innerHTML = `<h2>Outcomes</h2><p class="sub">Interview, offer, and rejection counts</p>`;
  outcomesCard.appendChild(buildOutcomesSvg());
  graph.appendChild(outcomesCard);
}

function buildFunnelSvg() {
  const counts = COLUMNS.map((s) => ({
    status: s,
    count: applications.filter((a) => a.status === s).length,
  }));
  const total = applications.length;
  const maxW = 300;
  const rowH = 28;
  const labelW = 78;
  const width = labelW + maxW + 42;
  const height = counts.length * rowH + 16;

  let svg = `<svg width="${width}" height="${height}" role="img" aria-label="Application funnel">`;

  counts.forEach((row, i) => {
    const y = 10 + i * rowH;
    const barW = total ? Math.max((row.count / total) * maxW, row.count ? 6 : 2) : 0;
    svg += `
      <text x="0" y="${y + 12}" fill="#8896a5" font-size="11">${COLUMN_LABELS[row.status]}</text>
      <rect x="${labelW}" y="${y}" width="${barW}" height="18" rx="4" fill="${COLUMN_COLORS[row.status]}" opacity="0.85"></rect>
      <text x="${labelW + barW + 8}" y="${y + 13}" fill="#f2f4f8" font-size="11" font-weight="600">${row.count}</text>
    `;
  });

  svg += `</svg>`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = svg;
  return wrapper.firstChild;
}

function buildTimelineSvg() {
  const weeks = [];
  const now = new Date();
  for (let w = 11; w >= 0; w--) {
    const start = new Date(now);
    start.setDate(now.getDate() - start.getDay() - w * 7);
    weeks.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, startMs: start.getTime(), count: 0 });
  }
  weeks.forEach((w) => {
    w.count = applications.filter((a) => a.dateSaved >= w.startMs && a.dateSaved < w.startMs + 7 * 24 * 60 * 60 * 1000).length;
  });

  const barW = 26;
  const gap = 10;
  const height = 130;
  const maxCount = Math.max(1, ...weeks.map((w) => w.count));
  const width = weeks.length * (barW + gap) + 10;

  let svg = `<svg width="${width}" height="${height + 26}" role="img" aria-label="Submissions over time">`;
  weeks.forEach((w, i) => {
    const x = 6 + i * (barW + gap);
    const h = Math.max((w.count / maxCount) * (height - 10), w.count ? 4 : 1);
    const y = height - h;
    svg += `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="#4a9eff" opacity="${w.count ? 0.9 : 0.25}"></rect>
      <text x="${x - 1}" y="${height + 14}" fill="#8896a5" font-size="9">${w.label}</text>
      ${w.count ? `<text x="${x + barW / 2 - 3}" y="${y - 4}" fill="#f2f4f8" font-size="9" font-weight="600">${w.count}</text>` : ''}
    `;
  });
  svg += `</svg>`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = svg;
  return wrapper.firstChild;
}

function buildOutcomesSvg() {
  const interview = applications.filter((a) => ['interview', 'offer'].includes(a.status)).length;
  const offers = applications.filter((a) => a.status === 'offer').length;
  const rejected = applications.filter((a) => a.status === 'rejected').length;

  const rows = [
    { label: 'Reached interview', count: interview, color: '#a371f7' },
    { label: 'Offers', count: offers, color: '#2ea043' },
    { label: 'Rejected', count: rejected, color: '#f85149' },
  ];

  const total = applications.length;
  const maxW = 240;
  const labelW = 122;
  const rowH = 28;
  const width = labelW + maxW + 42;
  const height = rows.length * rowH + 16;

  let svg = `<svg width="${width}" height="${height}" role="img" aria-label="Outcomes">`;
  rows.forEach((row, i) => {
    const y = 10 + i * rowH;
    const barW = total ? Math.max((row.count / total) * maxW, row.count ? 6 : 2) : 0;
    svg += `
      <text x="0" y="${y + 12}" fill="#8896a5" font-size="11">${row.label}</text>
      <rect x="${labelW}" y="${y}" width="${barW}" height="18" rx="4" fill="${row.color}" opacity="0.85"></rect>
      <text x="${labelW + barW + 8}" y="${y + 13}" fill="#f2f4f8" font-size="11" font-weight="600">${row.count}</text>
    `;
  });
  svg += `</svg>`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = svg;
  return wrapper.firstChild;
}