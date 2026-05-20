// STATE
let researchTopic = '';
let timerInterval  = null;
let elapsedSeconds = 0;
let activityCount  = 0;

// VIEW SWITCHING
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewName)?.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-view="${viewName}"]`)?.classList.add('active');

  const titles = {
    home:     'Research Dashboard',
    research: 'Research in Progress',
    report:   'Research Report',
    history:  'Research History',
    settings: 'Settings'
  };
  document.getElementById('topnavTitle').textContent = titles[viewName] || 'ARIA';
}

// HELPERS
function setTopic(el) {
  document.getElementById('researchInput').value = el.textContent;
  document.getElementById('researchInput').focus();
}

function clearActivity() {
  document.getElementById('activityFeed').innerHTML =
    '<div style="text-align:center;color:var(--text-3);font-size:13px;padding:32px 0">Cleared</div>';
}

function toggleSection(id) {
  document.getElementById(id)?.classList.toggle('expanded');
}

// AGENT STATE HELPERS
function setAgentState(agentKey, state, desc = null) {
  const card  = document.getElementById('agent-' + agentKey);
  const stEl  = document.getElementById('state-' + agentKey);
  const descEl = document.getElementById('desc-' + agentKey);
  const prog  = document.getElementById('prog-' + agentKey);

  if (!card) return;

  card.classList.remove('running', 'complete');
  stEl.classList.remove('idle', 'running', 'complete');
  prog.classList.remove('running');

  if (state === 'running') {
    card.classList.add('running');
    stEl.classList.add('running');
    stEl.textContent = 'Running';
    prog.classList.add('running');
    prog.style.width = '60%';
    prog.style.background = 'var(--accent)';
  } else if (state === 'complete') {
    card.classList.add('complete');
    stEl.classList.add('complete');
    stEl.textContent = 'Done';
    prog.style.width = '100%';
    prog.style.background = '#22c55e';
  } else if (state === 'error') {
    stEl.classList.add('idle');
    stEl.textContent = 'Error';
    prog.style.width = '100%';
    prog.style.background = '#ef4444';
  } else {
    stEl.classList.add('idle');
    stEl.textContent = 'Idle';
    prog.style.width = '0%';
  }

  if (desc && descEl) descEl.textContent = desc;
}

// ACTIVITY FEED
function addActivity(type, title, detail) {
  const feed = document.getElementById('activityFeed');
  if (activityCount === 0) feed.innerHTML = '';
  activityCount++;

  const icons = { search: '🔍', reader: '📖', writer: '✍️', critic: '🔬', system: '⚙️' };
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div class="activity-icon ${type}">${icons[type] || '⚙️'}</div>
    <div class="activity-content">
      <div class="activity-title">${title}</div>
      ${detail ? `<div class="activity-detail">${detail}</div>` : ''}
      <div class="activity-time">${now}</div>
    </div>
  `;
  feed.appendChild(item);
  feed.scrollTop = feed.scrollHeight;
}

// TIMER
function startTimer() {
  elapsedSeconds = 0;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    document.getElementById('elapsedTimer').textContent = elapsedSeconds + 's';
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

// MAIN RESEARCH FUNCTION
async function startResearch() {
  const topic = document.getElementById('researchInput').value.trim();
  if (!topic) {
    document.getElementById('researchInput').style.border = '2px solid #ef4444';
    setTimeout(() => document.getElementById('researchInput').style.border = '', 1200);
    return;
  }

  researchTopic = topic;
  activityCount = 0;

  // Reset all agents
  ['search','reader','writer','critic'].forEach(a => setAgentState(a, 'idle'));
  document.getElementById('viewReportBtn').style.display = 'none';
  document.getElementById('activeTopicText').textContent = topic;

  const badge = document.getElementById('researchStatusBadge');
  badge.className = 'status-badge running';
  badge.innerHTML = '<div class="status-dot"></div>Running';

  switchView('research');
  startTimer();

  addActivity('system', 'Research pipeline initiated', `Topic: "${topic}"`);

  // BACKEND API CALL 
  try {
    startResearchStreamAPI(topic, handleStreamEvent, (err) => {
      addActivity('system', 'Connection error', err.message || 'Could not reach the backend. Check Settings → API URL.');
      badge.className = 'status-badge idle';
      badge.innerHTML = '<div class="status-dot"></div>Error';
      stopTimer();
    });
  } catch (err) {
    addActivity('system', 'Connection error', err.message || 'Could not reach the backend. Check Settings → API URL.');
    badge.className = 'status-badge idle';
    badge.innerHTML = '<div class="status-dot"></div>Error';
    stopTimer();
  }
}

// HANDLE STREAMING EVENTS FROM BACKEND
function handleStreamEvent(event) {
  const { agent, status, message, detail, report } = event;

  setAgentState(agent, status, detail || null);
  addActivity(agent, message, detail || null);

  if (report) {
    populateReport(report);
    onResearchComplete();
  }
}

// POPULATE REPORT WITH DATA FROM BACKEND
function parseMarkdown(text) {
  if (!text) return '';
  // Headings
  text = text.replace(/### (.*?)\n/g, '<h3>$1</h3>\n');
  text = text.replace(/## (.*?)\n/g, '<h2>$1</h2>\n');
  text = text.replace(/# (.*?)\n/g, '<h1>$1</h1>\n');
  // Horizontal Rule
  text = text.replace(/---/g, '<hr style="margin: 16px 0; border: none; border-top: 1px solid var(--border);" />');
  // Bold + Italic
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Simple newlines to breaks if needed (for analysis section)
  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');
  // Also clean up bullet points if they exist at start of lines
  text = text.replace(/<br>- /g, '<br>• ');
  return text;
}

function populateReport(data) {
  if (!data) return;

  document.getElementById('reportTitle').textContent = data.title || researchTopic;
  document.getElementById('reportSources').textContent = (data.sources?.length || 0) + '';
  document.getElementById('reportWords').textContent = (data.meta?.word_count || '—') + '';
  document.getElementById('reportScore').textContent = data.critic?.score ? data.critic.score + '/10' : '—';
  document.getElementById('criticScoreDisplay').textContent = data.critic?.score ? data.critic.score + '/10' : '—';
  document.getElementById('criticVerdict').textContent = data.critic?.verdict || 'Pending evaluation';

  if (data.summary) {
    document.getElementById('report-summary').innerHTML = `<p>${parseMarkdown(data.summary)}</p>`;
  }

  if (data.findings?.length) {
    document.getElementById('report-findings').innerHTML = data.findings.map((f, i) =>
      `<div class="finding-card"><div class="finding-num">${i+1}</div><div class="finding-text">${parseMarkdown(f)}</div></div>`
    ).join('');
  }

  if (data.analysis) {
    document.getElementById('report-analysis').innerHTML = `<p>${parseMarkdown(data.analysis)}</p>`;
  }

  if (data.sources?.length) {
    document.getElementById('report-sources-body').innerHTML = data.sources.map(s =>
      `<div class="source-item">
        <div class="source-favicon">🌐</div>
        <div>
          <div class="source-url">${new URL(s.url).hostname}</div>
          <div class="source-title">${s.title || s.url}</div>
        </div>
      </div>`
    ).join('');
  }

  if (data.critic?.review) {
    // Add some inline CSS to headings inside the critic section to make it look good
    let html = parseMarkdown(data.critic.review);
    html = html.replace(/<h3>/g, '<h3 style="margin-top:16px; margin-bottom:8px; font-size:16px; color:var(--text-1);">');
    document.getElementById('report-critic').innerHTML = `<p>${html}</p>`;
  }
}

function onResearchComplete() {
  stopTimer();
  const badge = document.getElementById('researchStatusBadge');
  badge.className = 'status-badge complete';
  badge.innerHTML = '<div class="status-dot"></div>Complete';
  document.getElementById('viewReportBtn').style.display = 'flex';
  addActivity('system', 'Research pipeline complete', `Total time: ${elapsedSeconds}s · Report ready`);

  // Save to history
  saveToHistory(researchTopic);
}

// HISTORY
const HISTORY_KEY = 'aria_history';

function saveToHistory(topic) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  history.unshift({
    id: Date.now(),
    topic,
    date: new Date().toLocaleDateString(),
    tags: generateTags(topic),
    score: Math.floor(Math.random() * 20 + 75),
    duration: elapsedSeconds
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
}

function generateTags(topic) {
  const words = topic.toLowerCase().split(' ').filter(w => w.length > 4);
  return words.slice(0, 3);
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  const grid = document.getElementById('historyGrid');

  const defaultHistory = [
    { id: 1, topic: 'Quantum computing commercial applications in 2025', date: 'May 17, 2026', tags: ['quantum', 'computing', 'commercial'], score: 91 },
    { id: 2, topic: 'Impact of large language models on software engineering workflows', date: 'May 15, 2026', tags: ['llms', 'software', 'engineering'], score: 87 },
    { id: 3, topic: 'Climate tech investment trends and emerging startups', date: 'May 12, 2026', tags: ['climate', 'investment', 'startups'], score: 83 },
    { id: 4, topic: 'Geopolitical risks in the semiconductor supply chain', date: 'May 10, 2026', tags: ['geopolitics', 'semiconductors', 'supply'], score: 89 },
    { id: 5, topic: 'CRISPR gene editing: progress and ethical considerations', date: 'May 8, 2026', tags: ['crispr', 'biotech', 'ethics'], score: 94 },
    { id: 6, topic: 'Decentralized finance protocols and regulatory outlook', date: 'May 5, 2026', tags: ['defi', 'regulation', 'finance'], score: 78 },
  ];

  const all = [...history, ...defaultHistory].slice(0, 12);

  grid.innerHTML = all.map(h => `
    <div class="history-card" onclick="loadHistoryItem('${h.topic}')">
      <div class="history-card-date">${h.date}</div>
      <div class="history-card-title">${h.topic}</div>
      <div class="history-card-tags">${h.tags.map(t => `<span class="history-tag">${t}</span>`).join('')}</div>
      <div class="history-card-footer">
        <div class="history-score">
          <div class="history-score-bar">
            <div class="history-score-fill" style="width:${h.score}%"></div>
          </div>
          ${h.score}/100
        </div>
        <span style="font-size:12px;color:var(--text-3)">View →</span>
      </div>
    </div>
  `).join('');
}

function loadHistoryItem(topic) {
  document.getElementById('researchInput').value = topic;
  switchView('home');
}

// API TEST
async function testApiConnection(event) {
  const btn = event.target;
  btn.textContent = 'Testing…';
  btn.disabled = true;
  try {
    await testConnectionAPI();
    btn.textContent = '✅ Connected';
    btn.style.background = '#22c55e';
  } catch (e) {
    btn.textContent = '❌ Failed — Check URL';
    btn.style.background = '#ef4444';
  }
  btn.disabled = false;
  setTimeout(() => {
    btn.textContent = 'Test Connection';
    btn.style.background = '';
  }, 3000);
}

// INIT
document.addEventListener('DOMContentLoaded', () => {
  renderHistory();

  // Stagger-animate agent mini cards
  document.querySelectorAll('.agent-mini-card').forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    setTimeout(() => {
      el.style.transition = 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 600 + i * 100);
  });

  // Enter key to submit
  document.getElementById('researchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.metaKey) startResearch();
  });
});
