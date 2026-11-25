import {
  TIERS,
  TIER_META,
  TIER_ORDER,
} from './presets.js';
import {
  computeStreak,
  createInitialState,
  getDayStatus,
  getDaySummary,
  getMonthCalendarGrid,
  reconcileDailyPlan,
  toggleRainRest,
  toggleTrickCompletion,
  toLocalDateKey,
} from './domain.js';
import {
  getPendingOps,
  loadCachedState,
  syncPull,
  syncPushOp,
} from './cloud.js';

const ui = {
  tab: 'today', // 'today' | 'history'
  todayKey: toLocalDateKey(),
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  selectedDateKey: toLocalDateKey(),
  state: reconcileDailyPlan(loadCachedState() || createInitialState(toLocalDateKey()), toLocalDateKey()),
  busy: false,
  syncStatus: '',
};

const dom = {
  topBar: document.getElementById('topBar'),
  segmentedBar: document.getElementById('segmentedBar'),
  mainContent: document.getElementById('mainContent'),
  statusBar: document.getElementById('statusBar'),
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function checkIconSvg() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
}

function refreshIconSvg() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>`;
}

function renderTopBar() {
  const streak = computeStreak(ui.state, ui.todayKey);
  const log = ui.state.dailyLogs[ui.todayKey];
  const isRain = Boolean(log?.isRainRest);

  dom.topBar.innerHTML = `
    <div class="top-left">
      <h1 class="brand-title">SK8</h1>
      <span class="streak-pill ${streak === 0 ? 'is-zero' : ''}">连续 ${streak} 天</span>
    </div>
    <div class="top-actions">
      <button type="button" id="rainBtn" class="rain-btn ${isRain ? 'is-active' : ''}">
        <span>☔</span>
        <span>${isRain ? '已休板' : '休板'}</span>
      </button>
      <button type="button" id="refreshBtn" class="refresh-btn" aria-label="刷新同步">
        ${refreshIconSvg()}
        <span>刷新</span>
      </button>
    </div>
  `;

  document.getElementById('rainBtn').onclick = handleRainToggle;
  document.getElementById('refreshBtn').onclick = () => handleRefresh(false);
}

function renderSegmented() {
  dom.segmentedBar.innerHTML = `
    <button type="button" class="seg-btn ${ui.tab === 'today' ? 'is-active' : ''}" data-tab="today">今日</button>
    <button type="button" class="seg-btn ${ui.tab === 'history' ? 'is-active' : ''}" data-tab="history">记录</button>
  `;
  dom.segmentedBar.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.onclick = () => {
      const next = btn.getAttribute('data-tab');
      if (next && next !== ui.tab) {
        ui.tab = next;
        render();
      }
    };
  });
}

function renderRow(trick, completedSet) {
  const isDone = completedSet.has(trick.id);
  const firstLand = trick.firstLandDate
    ? `<span class="mini-tag first-land">首成 ${escapeHtml(trick.firstLandDate.slice(5))}</span>`
    : '';

  return `
    <button
      type="button"
      class="trick-row ${isDone ? 'is-done' : ''}"
      data-toggle-id="${escapeHtml(trick.id)}"
    >
      <span class="check-circle ${trick.tier}">${isDone ? checkIconSvg() : ''}</span>
      <span class="trick-info">
        <span class="trick-name">${escapeHtml(trick.name)}</span>
        <span class="trick-meta-row">
          <span class="target-badge ${trick.tier}">${escapeHtml(trick.target)}</span>
          ${firstLand}
        </span>
      </span>
    </button>
  `;
}

function renderTodayView() {
  const log = ui.state.dailyLogs[ui.todayKey];
  const trickById = new Map(ui.state.tricks.map((t) => [t.id, t]));
  const completedSet = new Set(log.completedIds);

  const newTricks = log.selectedNewIds
    .map((id) => trickById.get(id))
    .filter(Boolean);
  const unstableTricks = log.assignedUnstableIds
    .map((id) => trickById.get(id))
    .filter(Boolean);
  const masteredTricks = ui.state.tricks.filter(
    (t) => t.tier === TIERS.MASTERED
  );

  const newDone = newTricks.filter((t) => completedSet.has(t.id)).length;
  const unstableDone = unstableTricks.filter((t) => completedSet.has(t.id)).length;
  const masteredDone = masteredTricks.filter((t) => completedSet.has(t.id)).length;

  const newHtml =
    newTricks.length > 0
      ? `<div class="card-list">${newTricks.map((t) => renderRow(t, completedSet)).join('')}</div>`
      : `<div class="empty-card">暂无攻坚新招</div>`;

  const unstableHtml =
    unstableTricks.length > 0
      ? `<div class="card-list">${unstableTricks.map((t) => renderRow(t, completedSet)).join('')}</div>`
      : `<div class="empty-card">暂无不稳定老招</div>`;

  const masteredHtml =
    masteredTricks.length > 0
      ? `<div class="mastered-grid">${masteredTricks
          .map((t) => {
            const done = completedSet.has(t.id);
            return `
              <button
                type="button"
                class="mastered-tile ${done ? 'is-done' : ''}"
                data-toggle-id="${escapeHtml(t.id)}"
              >
                <span class="check-circle mastered">${done ? checkIconSvg() : ''}</span>
                <span class="mastered-name">${escapeHtml(t.name)}</span>
              </button>
            `;
          })
          .join('')}</div>`
      : `<div class="empty-card">暂无熟练老动作</div>`;

  dom.mainContent.innerHTML = `
    <section class="section-block">
      <div class="section-header">
        <span class="tier-dot new"></span>
        <h2 class="section-title">攻坚新招</h2>
        <span class="section-count">${newDone}/${newTricks.length}</span>
      </div>
      ${newHtml}
    </section>

    <section class="section-block">
      <div class="section-header">
        <span class="tier-dot unstable"></span>
        <h2 class="section-title">不稳定老招</h2>
        <span class="section-count">${unstableDone}/${unstableTricks.length}</span>
      </div>
      ${unstableHtml}
    </section>

    <section class="section-block">
      <div class="section-header">
        <span class="tier-dot mastered"></span>
        <h2 class="section-title">熟练老动作</h2>
        <span class="section-count">${masteredDone}/${masteredTricks.length}</span>
      </div>
      ${masteredHtml}
    </section>
  `;

  dom.mainContent.querySelectorAll('[data-toggle-id]').forEach((btn) => {
    btn.onclick = () => handleToggle(btn.getAttribute('data-toggle-id'));
  });
}

function renderHistoryView() {
  const cells = getMonthCalendarGrid(ui.calYear, ui.calMonth);
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

  const gridHtml = cells
    .map((cell) => {
      if (!cell) return `<div class="cal-cell-empty"></div>`;
      const status = getDayStatus(ui.state, cell.dateKey);
      const isToday = cell.dateKey === ui.todayKey;
      const isSelected = cell.dateKey === ui.selectedDateKey;
      const cls = [
        'cal-day-btn',
        status !== 'none' ? `status-${status}` : '',
        isToday ? 'is-today' : '',
        isSelected ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<button type="button" class="${cls}" data-date="${cell.dateKey}">${cell.day}</button>`;
    })
    .join('');

  const summary = getDaySummary(ui.state, ui.selectedDateKey);
  const statusLabelMap = {
    full: '今日全清',
    partial: '完成部分',
    rain: '下雨休板',
    none: '未打卡',
  };

  let logDetailHtml = `<div class="muted-note">当日无记录</div>`;
  if (summary.items.length > 0) {
    logDetailHtml = `<div class="day-log-chips">${summary.items
      .map(
        (item) =>
          `<span class="day-log-chip ${item.tier}">${escapeHtml(item.name)}</span>`
      )
      .join('')}</div>`;
  } else if (summary.status === 'rain') {
    logDetailHtml = `<div class="day-log-chips"><span class="day-log-chip">☔ 下雨休板</span></div>`;
  }

  const librarySections = TIER_ORDER.map((tier) => {
    const items = ui.state.tricks.filter((t) => t.tier === tier);
    if (items.length === 0) return '';
    return `
      <div class="lib-group">
        <div class="section-header">
          <span class="tier-dot ${tier}"></span>
          <h3 class="section-title">${TIER_META[tier].label}</h3>
          <span class="section-count">${items.length}</span>
        </div>
        <div class="card-list">
          ${items
            .map(
              (t) => `
              <div class="lib-row">
                <span class="lib-name">${escapeHtml(t.name)}</span>
                <span class="lib-right">
                  ${
                    t.firstLandDate
                      ? `<span class="mini-tag first-land">首成 ${escapeHtml(t.firstLandDate)}</span>`
                      : ''
                  }
                  <span class="target-badge ${t.tier}">${escapeHtml(t.target)}</span>
                </span>
              </div>
            `
            )
            .join('')}
        </div>
      </div>
    `;
  }).join('');

  dom.mainContent.innerHTML = `
    <div class="card-panel">
      <div class="calendar-head">
        <button type="button" id="calPrevBtn" class="month-nav-btn" aria-label="上个月">‹</button>
        <div class="calendar-month-title">${ui.calYear}年${ui.calMonth}月</div>
        <button type="button" id="calNextBtn" class="month-nav-btn" aria-label="下个月">›</button>
      </div>
      <div class="calendar-legend">
        <span class="legend-item"><span class="legend-swatch full"></span>全清</span>
        <span class="legend-item"><span class="legend-swatch partial"></span>有练</span>
        <span class="legend-item"><span class="legend-swatch rain"></span>休板</span>
      </div>
      <div class="calendar-weekdays">
        ${weekdays.map((w) => `<div>${w}</div>`).join('')}
      </div>
      <div class="calendar-grid">${gridHtml}</div>

      <div class="day-log-strip">
        <div class="day-log-header">
          <span>${escapeHtml(summary.dateKey)}</span>
          <span class="muted-note">${statusLabelMap[summary.status]}</span>
        </div>
        ${logDetailHtml}
      </div>
    </div>

    ${librarySections}
  `;

  document.getElementById('calPrevBtn').onclick = () => shiftMonth(-1);
  document.getElementById('calNextBtn').onclick = () => shiftMonth(1);
  dom.mainContent.querySelectorAll('[data-date]').forEach((btn) => {
    btn.onclick = () => {
      ui.selectedDateKey = btn.getAttribute('data-date');
      renderHistoryView();
    };
  });
}

function renderStatus() {
  dom.statusBar.textContent = ui.syncStatus || '';
}

function render() {
  renderTopBar();
  renderSegmented();
  if (ui.tab === 'today') {
    renderTodayView();
  } else {
    renderHistoryView();
  }
  renderStatus();
}

function shiftMonth(delta) {
  let m = ui.calMonth + delta;
  let y = ui.calYear;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  ui.calYear = y;
  ui.calMonth = m;
  renderHistoryView();
}

async function handleToggle(trickId) {
  if (ui.busy) return;
  ui.busy = true;

  const { state: optimisticState, event } = toggleTrickCompletion(
    ui.state,
    trickId,
    ui.todayKey
  );
  if (!event) {
    ui.busy = false;
    return;
  }

  const wantDone = event.action === 'checked';
  ui.state = optimisticState;
  ui.syncStatus = '同步中…';
  render();

  const res = await syncPushOp(
    optimisticState,
    { op: 'setDone', dateKey: ui.todayKey, trickId, value: wantDone },
    ui.todayKey
  );

  ui.state = res.state;
  if (res.synced) {
    ui.syncStatus = event.firstLandRecorded
      ? `首成记录 ${event.firstLandDate}`
      : '';
  } else {
    ui.syncStatus = `离线已暂存（待同步 ${res.pendingCount}）`;
  }
  ui.busy = false;
  render();
}

async function handleRainToggle() {
  if (ui.busy) return;
  const res = toggleRainRest(ui.state, ui.todayKey);
  if (!res.changed && res.reason === 'has_completions') {
    ui.syncStatus = '今日已有打卡记录';
    renderStatus();
    return;
  }

  ui.busy = true;
  ui.state = res.state;
  ui.syncStatus = '同步中…';
  render();

  const pushRes = await syncPushOp(
    res.state,
    { op: 'setRain', dateKey: ui.todayKey, value: res.isRainRest },
    ui.todayKey
  );

  ui.state = pushRes.state;
  ui.syncStatus = pushRes.synced
    ? ''
    : `离线已暂存（待同步 ${pushRes.pendingCount}）`;
  ui.busy = false;
  render();
}

async function handleRefresh(silent = false) {
  const latestToday = toLocalDateKey();
  if (latestToday !== ui.todayKey) {
    ui.todayKey = latestToday;
    ui.selectedDateKey = latestToday;
    const now = new Date();
    ui.calYear = now.getFullYear();
    ui.calMonth = now.getMonth() + 1;
  }

  const refreshBtn = document.getElementById('refreshBtn');
  if (!silent && refreshBtn) refreshBtn.classList.add('spinning');

  const res = await syncPull(ui.todayKey);
  ui.state = res.state;
  if (res.synced) {
    ui.syncStatus = '';
  } else {
    const pendingCount = getPendingOps().length;
    ui.syncStatus =
      pendingCount > 0
        ? `离线模式（待同步 ${pendingCount}）`
        : '离线模式，稍后点刷新同步';
  }

  if (refreshBtn) refreshBtn.classList.remove('spinning');
  render();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    handleRefresh(true);
  }
});

render();
handleRefresh(false);
