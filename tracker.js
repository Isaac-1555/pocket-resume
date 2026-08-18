// tracker.js

const STORAGE_KEYS = [
  'applications',
  'trackerTrialStartedAt',
  'trackerUnlocked',
  'trackerLockDismissed',
  'trackerTourSeen',
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

  initTourControls();
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
  const tourSeen = !!data.trackerTourSeen;

  const hasPlan = await checkPlanAccess();
  if (hasPlan && !trialInfo.unlocked) {
    trialInfo.unlocked = true;
    chrome.storage.local.set({ trackerUnlocked: true });
  }

  const trialElapsed = trialInfo.startedAt ? (Date.now() - trialInfo.startedAt) : 0;
  locked = !trialInfo.unlocked && !!trialInfo.startedAt && trialElapsed > TRIAL_MS;

  render();
  updatePlanBadge();

  if (!tourSeen) {
    window.setTimeout(startTour, 400);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.applications) {
      applications = Array.isArray(changes.applications.newValue) ? changes.applications.newValue : [];
      renderBoard();
      if (currentView === 'graph') renderGraph();
    }
  });
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
  const interviewRound = getInterviewRound(app);
  const roundControl = app.status !== 'saved' && !['rejected', 'withdrawn'].includes(app.status)
    ? `<label class="round-control" title="Record completed interview round">
        <span>Round</span>
        <select class="card-round-select" aria-label="Interview round" ${locked ? 'disabled' : ''}>
          <option value="0">—</option>
          ${[1, 2, 3, 4].map((round) => `<option value="${round}" ${interviewRound === round ? 'selected' : ''}>${round}</option>`).join('')}
        </select>
      </label>`
    : '';

  card.innerHTML = `
    <p class="card-company">${escapeHtml(app.company || 'Unnamed company')}</p>
    <p class="card-role">${escapeHtml(app.role || 'Job posting')}</p>
    <div class="card-meta">
      ${date ? `<span class="card-tag">${date}</span>` : ''}
      ${recruiterTag}
      ${linkTag}
      ${roundControl}
    </div>
  `;

  card.querySelector('[data-link]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.tabs.create({ url: app.url });
  });

  card.querySelector('.card-round-select')?.addEventListener('click', (e) => e.stopPropagation());
  card.querySelector('.card-round-select')?.addEventListener('change', (e) => {
    e.stopPropagation();
    setInterviewRound(app, Number(e.target.value));
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

function getInterviewRounds(app) {
  return (Array.isArray(app?.interviews) ? app.interviews : [])
    .filter((interview) => {
      const round = Number(interview?.round);
      const date = interview?.date;
      return Number.isInteger(round) && round >= 1 && date && !isNaN(new Date(date).getTime());
    })
    .map((interview) => ({ round: Math.round(Number(interview.round)), date: interview.date }))
    .sort((a, b) => a.round - b.round);
}

function getInterviewRound(app) {
    const rounds = getInterviewRounds(app);
    if (rounds.length) return Math.max(...rounds.map((interview) => interview.round));
    return ['interview', 'offer'].includes(app?.status) ? 1 : 0;
}

function setInterviewRound(app, round) {
  if (locked || !app) return;
  const now = Date.now();
  if (!round) {
    app.interviews = [];
    app.updatedAt = now;
    persist();
    renderBoard();
    return;
  }

  const existing = new Map(getInterviewRounds(app).map((interview) => [interview.round, interview.date]));
  app.interviews = Array.from({ length: round }, (_, index) => ({
    round: index + 1,
    date: existing.get(index + 1) || now,
  }));
  if (!app.interviewDate) app.interviewDate = app.interviews[0].date;
  if (!['offer', 'rejected', 'withdrawn'].includes(app.status)) app.status = 'interview';
  app.updatedAt = now;
  persist();
  renderBoard();
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
      <label>Interview rounds</label>
      <p class="field-hint">Completed rounds drive the funnel. Use Board's Round control for a quick update.</p>
      <div id="m_interviews"></div>
      <button type="button" class="btn btn-ghost add-round-btn" id="m_addRound" ${isReadonly ? 'disabled' : ''}>+ Add round</button>
    </div>
    <div class="field flags">
      <label>Flags</label>
      <label class="flag"><input type="checkbox" id="m_noReply" ${app?.noReply ? 'checked' : ''} ${isReadonly ? 'disabled' : ''}> No reply / ghosted</label>
      <label class="flag"><input type="checkbox" id="m_internalHire" ${app?.internalHire ? 'checked' : ''} ${isReadonly ? 'disabled' : ''}> Internal hire</label>
      <label class="flag"><input type="checkbox" id="m_scam" ${app?.scam ? 'checked' : ''} ${isReadonly ? 'disabled' : ''}> Scam / fake posting</label>
    </div>
    <div class="field row3">
      <div class="mini-field">
        <label for="m_rejectedAt">Rejected date</label>
        <input id="m_rejectedAt" type="date" value="${app?.rejectedAt ? toDateInput(app.rejectedAt) : ''}" ${isReadonly ? 'readonly' : ''}>
      </div>
      <div class="mini-field">
        <label for="m_offeredAt">Offer date</label>
        <input id="m_offeredAt" type="date" value="${app?.offeredAt ? toDateInput(app.offeredAt) : ''}" ${isReadonly ? 'readonly' : ''}>
      </div>
      <div class="mini-field">
        <label for="m_withdrawnAt">Withdrawn date</label>
        <input id="m_withdrawnAt" type="date" value="${app?.withdrawnAt ? toDateInput(app.withdrawnAt) : ''}" ${isReadonly ? 'readonly' : ''}>
      </div>
    </div>
    <div class="field">
      <label for="m_notes">Notes</label>
      <textarea id="m_notes" ${isReadonly ? 'readonly' : ''} placeholder="Anything worth remembering…">${escapeTextarea(app?.notes || '')}</textarea>
    </div>
    ${isReadonly ? '<p class="readonly-note">Read-only — your free trial has ended. Upgrade to edit applications.</p>' : ''}
  `;

  populateInterviewEditor(body, app, isReadonly);

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

function populateInterviewEditor(body, app, isReadonly) {
    const host = body.querySelector('#m_interviews');
    if (!host) return;
    const addBtn = body.querySelector('#m_addRound');
    const seed = (app && Array.isArray(app.interviews) ? app.interviews : [])
        .filter((i) => i && Math.round(Number(i.round)) >= 1)
        .sort((a, b) => (a.round || 0) - (b.round || 0));

    const showSeedRow =
        !seed.length && (app && (app.status === 'interview' || app.status === 'offer'));

    if (!seed.length) {
        if (showSeedRow) addRow(null);
    } else {
        seed.forEach((iv) => addRow(iv));
    }

    const renumber = () => {
        host.querySelectorAll('.round-row').forEach((row, i) => {
            row.querySelector('.round-num').textContent = String(i + 1);
        });
    };
    const addRow = (iv) => {
        const row = document.createElement('div');
        row.className = 'round-row';
        row.innerHTML = `
            <span class="round-num"></span>
            <input type="date" class="round-date" value="${iv && iv.date ? toDateInput(iv.date) : ''}" ${isReadonly ? 'readonly' : ''} aria-label="Interview round date">
            <button type="button" class="round-rm" ${isReadonly ? 'disabled' : ''} aria-label="Remove round">&times;</button>
        `;
        if (!isReadonly) {
            row.querySelector('.round-rm').addEventListener('click', () => {
                row.remove();
                renumber();
            });
        }
        host.appendChild(row);
        renumber();
        return row;
    };

    if (!seed.length) {
        addRow(null);
    } else {
        seed.forEach((iv) => addRow(iv));
    }

    if (addBtn && !isReadonly) {
        addBtn.addEventListener('click', () => addRow(null));
    }
}

function readInterviewsFromModal() {
    const host = document.querySelector('#m_interviews');
    if (!host) return [];
    return [...host.querySelectorAll('.round-row')].map((row, i) => ({
        round: i + 1,
        date: fromDateInput(row.querySelector('.round-date')?.value || ''),
    }));
}

function saveModal(isNew) {
  const getVal = (id) => document.getElementById(id)?.value.trim() || '';

  const now = Date.now();
  const m_interviews = readInterviewsFromModal();
  const m_noReply = !!document.getElementById('m_noReply')?.checked;
  const m_internalHire = !!document.getElementById('m_internalHire')?.checked;
  const m_scam = !!document.getElementById('m_scam')?.checked;
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
      interviews: m_interviews,
      noReply: m_noReply,
      internalHire: m_internalHire,
      scam: m_scam,
      rejectedAt: fromDateInput(getVal('m_rejectedAt')),
      offeredAt: fromDateInput(getVal('m_offeredAt')),
      withdrawnAt: fromDateInput(getVal('m_withdrawnAt')),
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
    app.interviews = m_interviews;
    app.noReply = m_noReply;
    app.internalHire = m_internalHire;
    app.scam = m_scam;
    app.rejectedAt = fromDateInput(getVal('m_rejectedAt'));
    app.offeredAt = fromDateInput(getVal('m_offeredAt'));
    app.withdrawnAt = fromDateInput(getVal('m_withdrawnAt'));
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
  if (currentView === 'graph') renderGraph();
}

function renderGraph() {
  const graph = document.getElementById('graphView');
  graph.innerHTML = '';

  if (!applications.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-board-note';
    empty.innerHTML = `<h2>No data yet</h2><p>Add applications to see your pipeline and progress.</p>`;
    graph.appendChild(empty);
    return;
  }

  const dataset = buildFunnelDataset(applications, graphFilters);

  const sankeyCard = document.createElement('div');
  sankeyCard.className = 'graph-card wide';
  const head = document.createElement('div');
  head.className = 'graph-head';
  head.innerHTML = `
    <div>
      <h2>Application pipeline</h2>
      <p class="sub">Applications &rarr; outcomes &rarr; interview progression</p>
    </div>
    <button class="btn btn-ghost" id="sankyReset">Reset filters</button>
  `;
  sankeyCard.appendChild(head);
  sankeyCard.appendChild(buildFilterBar());
  const sankyWrap = document.createElement('div');
  sankyWrap.className = 'sanky-wrap';
  sankeyCard.appendChild(sankyWrap);
  renderSankey(sankyWrap, dataset);
  sankeyCard.appendChild(buildDrillPanel());
  graph.appendChild(sankeyCard);

  const metricsCard = document.createElement('div');
  metricsCard.className = 'graph-card';
  metricsCard.innerHTML = `<h2>Funnel metrics</h2><p class="sub">Computed from the same dataset as the pipeline</p>`;
  metricsCard.appendChild(buildMetrics(dataset));
  graph.appendChild(metricsCard);

  const timelineCard = document.createElement('div');
  timelineCard.className = 'graph-card timeline-card';
  timelineCard.innerHTML = `<h2>Submissions over time</h2><p class="sub">Last 12 weeks by week of save date</p>`;
  timelineCard.appendChild(buildTimelineSvg());
  graph.appendChild(timelineCard);
}

const NO_REPLY_THRESHOLD_DAYS = 14;

const BUCKET_DEFS = [
    { id: 'rejected', label: 'Rejected', color: '#f85149', category: 'outcome' },
    { id: 'internal-hire', label: 'Internal hire', color: '#a371f7', category: 'outcome' },
    { id: 'scam', label: 'Backed out / scam', color: '#d29922', category: 'outcome' },
    { id: 'withdrawn', label: 'Withdrawn', color: '#8896a5', category: 'outcome' },
    { id: 'no-reply', label: 'No reply', color: '#6e7681', category: 'outcome' },
    { id: 'awaiting', label: 'Awaiting response', color: '#8b949e', category: 'outcome' },
    { id: 'interview', label: 'Interview process', color: '#4a9eff', category: 'outcome' },
];

const ROUND_DEFS = [
    { id: 'r1', label: '1st interview', color: '#a371f7' },
    { id: 'r2', label: '2nd interview', color: '#a371f7' },
    { id: 'r3', label: '3rd interview', color: '#a371f7' },
    { id: 'r4', label: '4th interview', color: '#a371f7' },
];

const TERMINAL_DEFS = [
    { id: 'offer', label: 'Offer', color: '#2ea043', category: 'terminal' },
    { id: 'no-offer', label: 'No offer', color: '#f85149', category: 'terminal' },
    { id: 'in-progress', label: 'In progress', color: '#4a9eff', category: 'terminal' },
];

const ROOT_NODE = { id: 'applications', label: 'Applications', color: '#ff8600', category: 'root' };

const CATEGORY_LABELS = {
    root: 'All applications',
    outcome: 'End state',
    round: 'Interview round',
    terminal: 'Final result',
};

const SANKY_LAYOUT = {
    hGap: 58,
    vGap: 14,
    padding: 26,
    minHeight: 280,
    minNodeH: 28,
    maxScale: 12,
};

let graphFilters = { company: '', source: 'all', status: 'all', from: '', to: '' };

function buildDefsMap() {
    const map = new Map();
    map.set(ROOT_NODE.id, { ...ROOT_NODE });
    BUCKET_DEFS.forEach((d) => map.set(d.id, { ...d }));
    ROUND_DEFS.forEach((d, i) => map.set(d.id, { ...d, category: 'round', label: d.label.replace('1st', `${i + 1}st`).replace('2nd', `${i + 1}nd`).replace('3rd', `${i + 1}rd`).replace('4th', `${i + 1}th`) }));
    TERMINAL_DEFS.forEach((d) => map.set(d.id, { ...d }));
    return map;
}

function normalizeApplication(app) {
    const status = app.status || 'saved';
    const rawRounds = getInterviewRounds(app).map((interview) => interview.round);
    const maxRound = rawRounds.length ? Math.max(...rawRounds) : 0;

    const reachedInterview =
        status === 'interview' || status === 'offer' ||
        rawRounds.length > 0 || (!!app.interviewDate && status !== 'applied') || !!app.offeredAt;

    const appliedTs = app.appliedDate || app.dateSaved || null;
    const ageDays = appliedTs ? (Date.now() - appliedTs) / (24 * 60 * 60 * 1000) : 0;

    let outcome = 'awaiting';
    let terminal = null;
    let round = maxRound;

    if (app.scam) {
        outcome = 'scam';
    } else if (app.internalHire) {
        outcome = 'internal-hire';
    } else if (status === 'withdrawn') {
        outcome = 'withdrawn';
    } else if (reachedInterview) {
        outcome = 'interview';
        if (round < 1) round = 1;
        if (status === 'offer' || app.offeredAt) terminal = 'offer';
        else if (status === 'rejected' || app.rejectedAt) terminal = 'no-offer';
        else if (status === 'withdrawn' || app.withdrawnAt) terminal = 'in-progress';
        else terminal = 'in-progress';
    } else if (status === 'rejected' || app.rejectedAt) {
        outcome = 'rejected';
    } else if (app.noReply) {
        outcome = 'no-reply';
    } else if (status === 'applied' && ageDays > NO_REPLY_THRESHOLD_DAYS) {
        outcome = 'no-reply';
    } else {
        outcome = 'awaiting';
    }

    return {
        id: app.id,
        app,
        status,
        outcome,
        terminal,
        round,
        source: app.source || app.resumeStyle || 'manual',
    };
}

function matchFilters(app, f) {
    if (f.company) {
        const haystack = `${app.company || ''} ${app.role || ''}`.toLowerCase();
        if (!haystack.includes(f.company.toLowerCase())) return false;
    }
    if (f.source !== 'all') {
        const src = app.source || app.resumeStyle || 'manual';
        if (src !== f.source) return false;
    }
    if (f.status !== 'all' && app.status !== f.status) return false;
    const ts = app.appliedDate || app.dateSaved;
    if (ts) {
        if (f.from && ts < f.from) return false;
        if (f.to && ts > f.to) return false;
    }
    return true;
}

function buildFunnelDataset(applications, filters) {
    const f = { company: '', source: 'all', status: 'all', from: null, to: null, ...(filters || {}) };
    const defs = buildDefsMap();
    const records = applications
        .filter((a) => a && a.status !== 'saved')
        .filter((a) => matchFilters(a, f))
        .map(normalizeApplication);

    const nodes = new Map();
    const links = new Map();

    const ensure = (id) => {
        let n = nodes.get(id);
        if (!n) {
            n = { ...defs.get(id), count: 0, appIds: [] };
            nodes.set(id, n);
        }
        return n;
    };
    const flow = (a, b, record) => {
        const nb = ensure(b);
        nb.count += 1;
        nb.appIds.push(record.id);
        const key = `${a}\u0000${b}`;
        const lk = links.get(key) || { source: a, target: b, value: 0, appIds: [] };
        lk.value += 1;
        lk.appIds.push(record.id);
        links.set(key, lk);
    };

    const totalNode = ensure('applications');

    records.forEach((rec) => {
        totalNode.count += 1;
        totalNode.appIds.push(rec.id);
        if (rec.outcome === 'interview') {
            flow('applications', 'interview', rec);
            flow('interview', 'r1', rec);
            for (let r = 2; r <= rec.round; r += 1) {
                flow(`r${r - 1}`, `r${r}`, rec);
            }
            flow(`r${rec.round}`, rec.terminal, rec);
        } else {
            flow('applications', rec.outcome, rec);
        }
    });

    const nodeList = [...nodes.values()];
    const linkList = [...links.values()];

    const interviews = records.filter((r) => r.outcome === 'interview');
    const reached = (r) => interviews.filter((x) => x.round >= r).length;
    const total = records.length;
    const offers = interviews.filter((x) => x.terminal === 'offer').length;
    const rejectedCount = records.filter((x) => x.outcome === 'rejected' || x.terminal === 'no-offer').length;
    const noReplyCount = records.filter((x) => x.outcome === 'no-reply' || x.outcome === 'awaiting').length;

    const denominator = Math.max(1, total);
    const metrics = {
        totalApplications: total,
        responseRate: (total - noReplyCount) / denominator,
        interviewRate: interviews.length / denominator,
        offerRate: offers / denominator,
        rejectionRate: rejectedCount / denominator,
        noResponseRate: noReplyCount / denominator,
        conversions: {
            r1r2: reached(2) / Math.max(1, reached(1)),
            r2r3: reached(3) / Math.max(1, reached(2)),
            r3r4: reached(4) / Math.max(1, reached(3)),
        },
    };

    return { nodes: nodeList, links: linkList, metrics, records };
}

function buildFilterBar() {
    const bar = document.createElement('div');
    bar.className = 'filter-bar';

    const company = document.createElement('input');
    company.type = 'text';
    company.value = graphFilters.company;
    company.placeholder = 'Company or role…';
    company.addEventListener('input', () => { graphFilters.company = company.value; renderGraph(); });
    bar.appendChild(company);

    const sources = [...new Set(applications.map((a) => a.source || a.resumeStyle || 'manual'))].sort();
    const sourceSel = document.createElement('select');
    sourceSel.innerHTML = `<option value="all">All sources</option>` + sources.map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
    sourceSel.value = graphFilters.source;
    sourceSel.addEventListener('change', () => { graphFilters.source = sourceSel.value; renderGraph(); });
    bar.appendChild(sourceSel);

    const statusSel = document.createElement('select');
    statusSel.innerHTML = `<option value="all">All statuses</option>` + COLUMNS.map((s) => `<option value="${s}">${COLUMN_LABELS[s]}</option>`).join('');
    statusSel.value = graphFilters.status;
    statusSel.addEventListener('change', () => { graphFilters.status = statusSel.value; renderGraph(); });
    bar.appendChild(statusSel);

    const from = document.createElement('input');
    from.type = 'date';
    from.value = graphFilters.from && !isNaN(graphFilters.from) ? toDateInput(graphFilters.from) : (graphFilters.from || '');
    from.addEventListener('change', () => { graphFilters.from = from.value ? new Date(from.value + 'T00:00:00').getTime() : ''; renderGraph(); });
    const to = document.createElement('input');
    to.type = 'date';
    to.value = graphFilters.to && !isNaN(graphFilters.to) ? toDateInput(graphFilters.to) : (graphFilters.to || '');
    to.addEventListener('change', () => { graphFilters.to = to.value ? new Date(to.value + 'T23:59:59').getTime() : ''; renderGraph(); });

    const range = document.createElement('label');
    range.className = 'range-label';
    range.appendChild(document.createTextNode('Applied: '));
    range.appendChild(from);
    range.appendChild(document.createTextNode(' — '));
    range.appendChild(to);
    bar.appendChild(range);

    const reset = document.getElementById('sankyReset');
    if (reset) {
        reset.addEventListener('click', () => {
            graphFilters = { company: '', source: 'all', status: 'all', from: '', to: '' };
            renderGraph();
        });
    }

    return bar;
}

function buildDrillPanel() {
    const panel = document.createElement('div');
    panel.className = 'drill-panel';
    panel.style.display = 'none';
    const title = document.createElement('div');
    title.className = 'drill-title';
    const list = document.createElement('div');
    list.className = 'drill-list';
    panel.appendChild(title);
    panel.appendChild(list);
    return panel;
}

function showDrill(label, apps) {
    const panel = document.querySelector('.drill-panel');
    if (!panel) return;
    const title = panel.querySelector('.drill-title');
    const list = panel.querySelector('.drill-list');
    title.textContent = `${apps.length} application${apps.length === 1 ? '' : 's'} · ${label}`;
    list.innerHTML = '';
    if (!apps.length) {
        list.innerHTML = `<div class="drill-empty">No matching applications</div>`;
    } else {
        apps.forEach((app) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'drill-row';
            const st = app.status || 'saved';
            row.innerHTML = `
                <span class="drill-company">${escapeHtml(app.company || 'Unnamed company')}</span>
                <span class="drill-role">${escapeHtml(app.role || 'Job posting')}</span>
                <span class="drill-status" style="color:${COLUMN_COLORS[st] || '#8896a5'}">${COLUMN_LABELS[st] || st}</span>
            `;
            row.addEventListener('click', () => openModal(app));
            list.appendChild(row);
        });
    }
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

  const chartWidth = 380;
  const barW = 22;
  const gap = (chartWidth - 40 - weeks.length * barW) / Math.max(1, weeks.length - 1);
  const baseline = 140;
  const plotHeight = 120;
  const maxCount = Math.max(1, ...weeks.map((w) => w.count));

  let svg = `<svg class="timeline-svg" preserveAspectRatio="none" viewBox="0 0 ${chartWidth} ${baseline + 34}" role="img" aria-label="Submissions over time">`;
  svg += `<line x1="20" y1="${baseline}" x2="${chartWidth - 20}" y2="${baseline}" stroke="#303844" stroke-width="1"></line>`;
  weeks.forEach((w, i) => {
    const x = 20 + i * (barW + gap);
    const h = Math.max((w.count / maxCount) * plotHeight, w.count ? 4 : 1);
    const y = baseline - h;
    svg += `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="#4a9eff" opacity="${w.count ? 0.9 : 0.2}"></rect>
      <text x="${x + barW / 2}" y="${baseline + 18}" text-anchor="middle" fill="#8896a5" font-size="10">${w.label}</text>
      ${w.count ? `<text x="${x + barW / 2}" y="${y - 7}" text-anchor="middle" fill="#f2f4f8" font-size="11" font-weight="600">${w.count}</text>` : ''}
    `;
  });
  svg += `</svg>`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = svg;
  return wrapper.firstChild;
}

function sankyRank(id) {
    if (/^r[1-9]/.test(id)) return parseInt(id.slice(1), 10) + 1;
    if (id === 'offer' || id === 'no-offer' || id === 'in-progress') return 6;
    if (id === 'applications') return 0;
    return 1;
}

function layoutSankey(nodes, links) {
    const ranks = new Map();
    nodes.forEach((n) => {
        const r = sankyRank(n.id);
        if (!ranks.has(r)) ranks.set(r, []);
        ranks.get(r).push(n);
    });

    const order = new Map();
    let oi = 0;
    order.set('applications', oi++);
    BUCKET_DEFS.forEach((d) => order.set(d.id, oi++));
    ROUND_DEFS.forEach((d) => order.set(d.id, oi++));
    TERMINAL_DEFS.forEach((d) => order.set(d.id, oi++));

    ranks.forEach((list) => list.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99)));

    ranks.forEach((list) => {
        list.forEach((n) => {
            n.w = Math.max(120, Math.min(220, n.label.length * 7.4 + 44));
            n.cx = 0;
        });
    });

    const total = Math.max(1, nodes.find((n) => n.id === 'applications')?.count || 1);
    const scale = Math.min(SANKY_LAYOUT.maxScale, 220 / total);
    nodes.forEach((n) => {
        n.h = Math.max(SANKY_LAYOUT.minNodeH, n.count * scale);
    });

    const colW = new Map();
    ranks.forEach((list, r) => {
        colW.set(r, Math.max(...list.map((n) => n.w), 0));
    });

    const rankList = [...ranks.keys()].sort((a, b) => a - b);
    const columnWidth = rankList.reduce((sum, r) => sum + colW.get(r), 0);
    const minimumWidth = 960;
    const width = Math.max(minimumWidth, columnWidth + SANKY_LAYOUT.hGap * Math.max(0, rankList.length - 1) + SANKY_LAYOUT.padding * 2);
    const gap = rankList.length > 1
        ? Math.max(SANKY_LAYOUT.hGap, (width - columnWidth - SANKY_LAYOUT.padding * 2) / (rankList.length - 1))
        : SANKY_LAYOUT.hGap;
    const xs = new Map();
    let x = SANKY_LAYOUT.padding;
    rankList.forEach((r) => {
        xs.set(r, x);
        x += colW.get(r) + gap;
    });

    [...ranks.keys()].sort((a, b) => a - b).forEach((r) => {
        const list = ranks.get(r);
        const totalH = list.reduce((sum, n) => sum + n.h, 0) + (list.length - 1) * SANKY_LAYOUT.vGap;
        let y = Math.max(SANKY_LAYOUT.padding, (SANKY_LAYOUT.minHeight - totalH) / 2);
        list.forEach((n) => {
            n.x = xs.get(r);
            n.y = y;
            n.cx = y + n.h / 2;
            y += n.h + SANKY_LAYOUT.vGap;
        });
    });

    const height = Math.max(SANKY_LAYOUT.minHeight, ...[...ranks.values()].map((list) => list.reduce((sum, n) => sum + n.h, 0) + (list.length - 1) * SANKY_LAYOUT.vGap)) + SANKY_LAYOUT.padding * 2;

    const outgoing = new Map();
    const incoming = new Map();
    links.forEach((link) => {
        link.band = Math.max(2, link.value * scale);
        if (!outgoing.has(link.source)) outgoing.set(link.source, []);
        if (!incoming.has(link.target)) incoming.set(link.target, []);
        outgoing.get(link.source).push(link);
        incoming.get(link.target).push(link);
    });

    const assignPorts = (groups, key) => {
        groups.forEach((list, nodeId) => {
            const node = nodes.find((n) => n.id === nodeId);
            if (!node) return;
            const totalBand = list.reduce((sum, link) => sum + link.band, 0);
            let offset = node.y + Math.max(0, (node.h - totalBand) / 2);
            list.forEach((link) => {
                link[key] = offset + link.band / 2;
                offset += link.band;
            });
        });
    };
    assignPorts(outgoing, 'sourceY');
    assignPorts(incoming, 'targetY');

    return { nodes, links, width, height, scale };
}

function layoutLinkPath(x1, y1, x2, y2, w) {
    const mx = Math.max(24, (x2 - x1) * 0.5);
    const y1a = y1 - w / 2;
    const y1b = y1 + w / 2;
    const y2a = y2 - w / 2;
    const y2b = y2 + w / 2;
    return `M ${x1} ${y1a} C ${x1 + mx} ${y1a}, ${x2 - mx} ${y2a}, ${x2} ${y2a} L ${x2} ${y2b} C ${x2 - mx} ${y2b}, ${x1 + mx} ${y1b}, ${x1} ${y1b} Z`;
}

function renderSankey(container, dataset) {
    container.innerHTML = '';

    if (!dataset.nodes.length || !dataset.metrics.totalApplications) {
        const note = document.createElement('div');
        note.className = 'empty-board-note';
        note.innerHTML = `<h2>No applications match these filters</h2><p>Adjust the filters above to see the pipeline.</p>`;
        container.appendChild(note);
        return;
    }

    const total = dataset.metrics.totalApplications;
    const idToApp = new Map(dataset.records.map((r) => [r.id, r.app]));
    const placed = layoutSankey(dataset.nodes, dataset.links);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${placed.width} ${placed.height}`);
    svg.style.height = `${Math.max(360, Math.min(520, placed.height + 32))}px`;
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Job application pipeline — Sankey');
    svg.classList.add('sanky');

    const tipEl = document.createElement('div');
    tipEl.className = 'sanky-tip';
    container.appendChild(tipEl);
    const showTip = (html, ev) => {
        tipEl.innerHTML = html;
        tipEl.style.display = 'block';
        positionTip(tipEl, ev, container);
    };
    const pct = (v) => (v / Math.max(1, total)) * 100;

    const bases = {};
    placed.nodes.forEach((n) => { bases[n.id] = n; });

    const headings = [
        { rank: 0, label: 'START' },
        { rank: 1, label: 'APPLICATION OUTCOME' },
        { rank: 2, label: 'INTERVIEW PROGRESSION' },
        { rank: 6, label: 'FINAL OUTCOME' },
    ];
    headings.forEach(({ rank, label }) => {
        const columnNodes = placed.nodes.filter((node) => sankyRank(node.id) === rank);
        if (!columnNodes.length) return;
        const heading = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        heading.setAttribute('x', columnNodes[0].x);
        heading.setAttribute('y', SANKY_LAYOUT.padding - 9);
        heading.setAttribute('fill', '#8896a5');
        heading.setAttribute('font-size', '10');
        heading.setAttribute('font-weight', '700');
        heading.setAttribute('letter-spacing', '0.08em');
        heading.textContent = label;
        svg.appendChild(heading);
    });

    dataset.links.forEach((l) => {
        const src = bases[l.source];
        const dst = bases[l.target];
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'sanky-link');
        path.setAttribute('d', layoutLinkPath(src.x + src.w, l.sourceY, dst.x, l.targetY, l.band));
        path.setAttribute('fill', src.color);
        path.setAttribute('fill-opacity', '0.42');
        path.style.opacity = '0';
        path.addEventListener('mouseenter', (ev) => {
            showTip(`<b>${escapeHtml(src.label)} &rarr; ${escapeHtml(dst.label)}</b><br>${l.value} application${l.value === 1 ? '' : 's'} &middot; ${pct(l.value).toFixed(1)}%`, ev);
        });
        path.addEventListener('click', () => {
            showDrill(`${src.label} → ${dst.label}`, l.appIds.map((id) => idToApp.get(id)).filter(Boolean));
        });
        svg.appendChild(path);
    });

    placed.nodes.forEach((n) => {
        const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        grp.setAttribute('class', 'sanky-node');
        grp.style.opacity = '0';
        grp.style.transform = 'translateY(10px)';

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', n.x);
        rect.setAttribute('y', n.y);
        rect.setAttribute('width', n.w);
        rect.setAttribute('height', n.h);
        rect.setAttribute('rx', '8');
        rect.setAttribute('fill', n.color);
        rect.setAttribute('fill-opacity', '0.14');
        rect.setAttribute('stroke', n.color);
        rect.setAttribute('stroke-opacity', '0.8');

        const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        labelText.setAttribute('x', n.x + 12);
        labelText.setAttribute('y', n.cx);
        labelText.setAttribute('dominant-baseline', 'central');
        labelText.setAttribute('font-size', '12.5');
        labelText.setAttribute('font-weight', '600');
        labelText.textContent = n.label;
        labelText.setAttribute('fill', '#f2f4f8');

        const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        countText.setAttribute('x', n.x + n.w - 12);
        countText.setAttribute('y', n.cx);
        countText.setAttribute('text-anchor', 'end');
        countText.setAttribute('dominant-baseline', 'central');
        countText.setAttribute('font-size', '13');
        countText.setAttribute('font-weight', '700');
        countText.textContent = n.count;
        countText.setAttribute('fill', n.color);

        grp.appendChild(rect);
        grp.appendChild(labelText);
        grp.appendChild(countText);
        grp.addEventListener('mouseenter', (ev) => {
            const cat = CATEGORY_LABELS[n.category] || '';
            showTip(`<b>${escapeHtml(n.label)}</b> ${cat ? `&middot; ${escapeHtml(cat)}` : ''}<br>${n.count} application${n.count === 1 ? '' : 's'} &middot; ${pct(n.count).toFixed(1)}%`, ev);
        });
        grp.addEventListener('click', () => {
            showDrill(n.label, n.appIds.map((id) => idToApp.get(id)).filter(Boolean));
        });
        svg.appendChild(grp);
    });

    svg.addEventListener('mousemove', (ev) => {
        if (tipEl.style.display !== 'none') positionTip(tipEl, ev, container);
    });
    svg.addEventListener('mouseleave', () => { tipEl.style.display = 'none'; });

    container.appendChild(svg);

    requestAnimationFrame(() => {
        svg.querySelectorAll('.sanky-node').forEach((el, i) => {
            el.style.transition = `opacity .5s cubic-bezier(0.22, 1, 0.36, 1) ${i * 30}ms, transform .55s cubic-bezier(0.22, 1, 0.36, 1) ${i * 30}ms`;
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
        svg.querySelectorAll('.sanky-link').forEach((el, i) => {
            el.style.transition = `opacity .55s cubic-bezier(0.22, 1, 0.36, 1) ${i * 15}ms`;
            el.style.opacity = '1';
        });
    });
}

function positionTip(tipEl, ev, container) {
    const rect = container.getBoundingClientRect();
    const x = Math.min(ev.clientX - rect.left + 14, rect.width - tipEl.offsetWidth - 8);
    const y = ev.clientY - rect.top + 14;
    tipEl.style.left = `${Math.max(4, x)}px`;
    tipEl.style.top = `${y}px`;
}

function buildMetrics(dataset) {
    const m = dataset.metrics;
    const wrap = document.createElement('div');
    wrap.className = 'metrics-grid';
    const fmt = (v) => (v == null || isNaN(v) ? '—' : `${Math.round(v * 100)}%`);
    const rows = [
        ['Total applications', String(m.totalApplications), ''],
        ['Response rate', fmt(m.responseRate), ''],
        ['Interview rate', fmt(m.interviewRate), ''],
        ['Offer rate', fmt(m.offerRate), ''],
        ['Rejection rate', fmt(m.rejectionRate), ''],
        ['No-response rate', fmt(m.noResponseRate), ''],
        ['1st → 2nd', fmt(m.conversions.r1r2), 'conversion'],
        ['2nd → 3rd', fmt(m.conversions.r2r3), 'conversion'],
        ['3rd → 4th', fmt(m.conversions.r3r4), 'conversion'],
    ];
    rows.forEach(([label, value, sub]) => {
        const tile = document.createElement('div');
        tile.className = 'metric-tile';
        tile.innerHTML = `
            <div class="metric-value">${escapeHtml(value)}</div>
            <div class="metric-label">${escapeHtml(label)}${sub ? ` <span class="metric-sub">${escapeHtml(sub)}</span>` : ''}</div>
        `;
        wrap.appendChild(tile);
    });
    return wrap;
}

// --- Onboarding tour ---

const tour = { active: false, steps: [], index: 0 };

function tourEls() {
    return {
        overlay: document.getElementById('tourOverlay'),
        catcher: document.getElementById('tourCatcher'),
        spotlight: document.getElementById('tourSpotlight'),
        tip: document.getElementById('tourTip'),
        title: document.getElementById('tourTitle'),
        body: document.getElementById('tourBody'),
        progress: document.getElementById('tourProgress'),
        nextBtn: document.getElementById('tourNextBtn'),
        skipBtn: document.getElementById('tourSkipBtn'),
    };
}

function buildTourSteps() {
    const hasCards = !!document.querySelector('#boardView .card');
    const steps = [
        {
            id: 'welcome',
            title: 'Welcome to your Job Tracker',
            body: 'One board for every application. Track each job from Saved to Offer, then watch your whole pipeline in the Graph view.',
        },
        {
            id: 'plan',
            target: () => document.getElementById('planBadge'),
            placement: 'bottom',
            title: 'Your free trial',
            body: 'Every account starts with a free 30-day trial. After that, upgrade to keep editing — or your board goes read-only.',
        },
        {
            id: 'add',
            target: () => document.getElementById('addBtn'),
            placement: 'bottom',
            title: 'Add a job',
            body: 'Add applications manually — company, role, URL, recruiter, flags, and notes. Jobs also appear here automatically whenever you generate a resume from a posting.',
        },
        {
            id: 'board',
            target: () => document.getElementById('boardView'),
            placement: 'bottom',
            title: 'The board',
            body: 'Six stages: Saved, Applied, Interview, Offer, Rejected, and Withdrawn. Drag cards between columns to update status — counts update live.',
        },
        {
            id: 'cards',
            target: () => document.querySelector('#boardView .card') || document.querySelector('#boardView .board-column') || document.getElementById('boardView'),
            placement: () => (hasCards ? 'top' : 'bottom'),
            title: 'Cards',
            body: hasCards
                ? 'Click a card to edit recruiter, dates, flags (no reply / internal hire / scam), notes, and interview rounds. The Round selector on a card is a quick funnel update.'
                : 'Cards appear here when you generate a resume or tap + Add job. Click a card to edit recruiter, dates, flags, notes, and interview rounds. The Round selector on a card is a quick funnel update.',
        },
        {
            id: 'graph',
            target: () => document.querySelector('.view-tab[data-view="graph"]'),
            placement: 'bottom',
            title: 'Graph view',
            body: 'Switch to Graph to see your pipeline as a Sankey funnel, funnel metrics (response, interview, offer rates), submissions over time, and filters. Click any node or link to drill into the applications behind it.',
        },
        {
            id: 'settings',
            target: () => document.getElementById('openSettingsBtn'),
            placement: 'bottom',
            title: 'Settings',
            body: 'Open Settings to toggle auto-capture in Job Tracker, manage your resumes, and handle your plan and cloud sync.',
        },
        {
            id: 'done',
            title: 'You\u2019re all set',
            body: 'Generate a resume or tap + Add job to get started. Replay this tour anytime with the ? button in the header.',
        },
    ];

    const banner = document.getElementById('lockBanner');
    if (banner && banner.classList.contains('visible')) {
        steps.splice(2, 0, {
            id: 'lock',
            target: () => banner,
            placement: 'bottom',
            title: 'Trial ended',
            body: 'Your tracker is now read-only. Upgrade to keep adding applications and dragging cards.',
        });
    }
    return steps;
}

function startTour() {
    const els = tourEls();
    if (!els.overlay) return;
    tour.steps = buildTourSteps();
    tour.active = true;
    els.overlay.style.display = 'block';
    tourRender(0);
}

function endTour() {
    const els = tourEls();
    tour.active = false;
    if (els.overlay) els.overlay.style.display = 'none';
    if (els.spotlight) els.spotlight.style.opacity = '0';
    chrome.storage.local.set({ trackerTourSeen: true });
}

function tourRender(index) {
    const els = tourEls();
    const step = tour.steps[index];
    if (!step) return;
    tour.index = index;
    els.title.textContent = step.title;
    els.body.textContent = step.body;
    els.progress.textContent = `${index + 1} / ${tour.steps.length}`;
    els.nextBtn.textContent = index === tour.steps.length - 1 ? 'Finish' : 'Next';
    els.tip.style.display = 'block';

    const target = typeof step.target === 'function' ? step.target() : null;
    if (target) {
        const rect = target.getBoundingClientRect();
        els.spotlight.style.opacity = '1';
        els.spotlight.style.left = `${rect.left}px`;
        els.spotlight.style.top = `${rect.top}px`;
        els.spotlight.style.width = `${rect.width}px`;
        els.spotlight.style.height = `${rect.height}px`;
        els.spotlight.style.borderRadius = '10px';
        positionTourTip(step, rect);
    } else {
        els.spotlight.style.opacity = '0';
        centerTourTip();
    }
}

function tourAdvance(next) {
    const els = tourEls();
    if (next >= tour.steps.length) {
        endTour();
        return;
    }
    tourRender(next);
    const step = tour.steps[next];
    const target = typeof step.target === 'function' ? step.target() : null;
    if (target) {
        target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        window.setTimeout(() => tourRender(tour.index), 420);
    } else {
        window.setTimeout(() => tourRender(tour.index), 60);
    }
    els.nextBtn.focus();
}

function positionTourTip(step, rect) {
    const els = tourEls();
    const tw = els.tip.offsetWidth;
    const th = els.tip.offsetHeight;
    const margin = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const placement = typeof step.placement === 'function' ? step.placement() : (step.placement || 'bottom');

    let left;
    let top;
    if (placement === 'top') {
        left = rect.left + rect.width / 2 - tw / 2;
        top = rect.top - th - margin;
    } else if (placement === 'left') {
        left = rect.left - tw - margin;
        top = rect.top + rect.height / 2 - th / 2;
    } else if (placement === 'right') {
        left = rect.right + margin;
        top = rect.top + rect.height / 2 - th / 2;
    } else {
        left = rect.left + rect.width / 2 - tw / 2;
        top = rect.bottom + margin;
    }

    if (left + tw > vw - 12) left = vw - tw - 12;
    if (top + th > vh - 12) top = vh - th - 12;
    if (left < 12) left = 12;
    if (top < 12) top = 12;

    els.tip.style.left = `${left}px`;
    els.tip.style.top = `${top}px`;
}

function centerTourTip() {
    const els = tourEls();
    const tw = els.tip.offsetWidth;
    const th = els.tip.offsetHeight;
    els.tip.style.left = `${(window.innerWidth - tw) / 2}px`;
    els.tip.style.top = `${(window.innerHeight - th) / 2}px`;
}

function initTourControls() {
    const els = tourEls();
    if (!els.overlay || !els.nextBtn) return;

    els.nextBtn.addEventListener('click', () => {
        if (!tour.active) return;
        tourAdvance(tour.index + 1);
    });
    els.skipBtn.addEventListener('click', endTour);
    els.catcher.addEventListener('click', endTour);

    window.addEventListener('keydown', (e) => {
        if (tour.active && e.key === 'Escape') endTour();
    });

    let repositionTimer = null;
    window.addEventListener('resize', () => {
        if (!tour.active) return;
        window.clearTimeout(repositionTimer);
        repositionTimer = window.setTimeout(() => tourRender(tour.index), 80);
    });
    window.addEventListener('scroll', () => {
        if (!tour.active) return;
        window.clearTimeout(repositionTimer);
        repositionTimer = window.setTimeout(() => tourRender(tour.index), 80);
    }, true);

    const replayBtn = document.getElementById('tourReplayBtn');
    if (replayBtn) replayBtn.addEventListener('click', startTour);
}
