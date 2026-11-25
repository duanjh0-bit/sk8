/**
 * SK8 纯领域逻辑（无 DOM 依赖，支持 Node 单元测试与浏览器端直接运行）
 */

import {
  DEFAULT_SETTINGS,
  PRESET_TRICKS,
  TIER_META,
  TIER_ORDER,
  TIERS,
} from './presets.js';

export { TIERS, TIER_ORDER, TIER_META, DEFAULT_SETTINGS };

export function cloneState(state) {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state));
}

export function toLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return false;
  }
  const [y, m, d] = key.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

export function parseLocalDateKey(key) {
  if (!isValidDateKey(key)) {
    throw new Error(`Invalid local date key: ${key}`);
  }
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDaysToKey(key, deltaDays) {
  const dt = parseLocalDateKey(key);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalDateKey(dt);
}

export function prevDayKey(key) {
  return addDaysToKey(key, -1);
}

export function getMonthCalendarGrid(year, month1Based) {
  const firstDay = new Date(year, month1Based - 1, 1, 12, 0, 0, 0);
  const daysInMonth = new Date(year, month1Based, 0, 12, 0, 0, 0).getDate();
  // Monday-first: Monday=0 .. Sunday=6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month1Based).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, dateKey });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function clampInt(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function sanitizeSettings(raw = {}) {
  return {
    dailyUnstableCount: clampInt(
      raw.dailyUnstableCount,
      1,
      20,
      DEFAULT_SETTINGS.dailyUnstableCount
    ),
    newPromoteThreshold: clampInt(
      raw.newPromoteThreshold,
      1,
      30,
      DEFAULT_SETTINGS.newPromoteThreshold
    ),
    unstablePromoteThreshold: clampInt(
      raw.unstablePromoteThreshold,
      1,
      30,
      DEFAULT_SETTINGS.unstablePromoteThreshold
    ),
  };
}

function getMaxQueueOrder(tricks) {
  let max = 0;
  for (const t of tricks) {
    if (typeof t.queueOrder === 'number' && t.queueOrder > max) {
      max = t.queueOrder;
    }
  }
  return max;
}

function createTrickId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `t_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function compareUnstableQueue(a, b) {
  const qa = typeof a.queueOrder === 'number' ? a.queueOrder : 0;
  const qb = typeof b.queueOrder === 'number' ? b.queueOrder : 0;
  if (qa !== qb) return qa - qb;

  const pa = a.lastPracticedDate || '';
  const pb = b.lastPracticedDate || '';
  if (pa !== pb) return pa.localeCompare(pb);

  const ca = a.createdAt || '';
  const cb = b.createdAt || '';
  if (ca !== cb) return ca.localeCompare(cb);

  return a.id.localeCompare(b.id);
}

function createEmptyLog() {
  return {
    selectedNewIds: [],
    assignedUnstableIds: [],
    completedIds: [],
    completedSnapshots: {},
    preCompleteMeta: {},
    isRainRest: false,
    isFullComplete: false,
  };
}

export function createInitialState(todayKey = toLocalDateKey()) {
  const tricks = PRESET_TRICKS.map((item, idx) => ({
    id: item.id,
    name: item.name,
    tier: item.tier,
    target: item.target,
    queueOrder: idx + 1,
    firstLandDate: null,
    totalCompletedCount: 0,
    tierCompletedCount: 0,
    promotionDismissedAtCount: null,
    lastPracticedDate: null,
    createdAt: todayKey,
  }));

  const state = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    tricks,
    dailyLogs: {},
  };

  return reconcileDailyPlan(state, todayKey);
}

function getCarryOverNewIds(state, todayKey, newTrickSet) {
  const prevKeys = Object.keys(state.dailyLogs)
    .filter((k) => isValidDateKey(k) && k < todayKey)
    .sort((a, b) => b.localeCompare(a));

  for (const key of prevKeys) {
    const prevLog = state.dailyLogs[key];
    if (prevLog && Array.isArray(prevLog.selectedNewIds)) {
      const valid = prevLog.selectedNewIds.filter((id) => newTrickSet.has(id));
      if (valid.length > 0) {
        return Array.from(new Set(valid));
      }
    }
  }

  // 首次启动或沿用的新招均已晋级/删除时，默认自动选入前 2 个攻坚新招
  const firstTwo = state.tricks
    .filter((t) => newTrickSet.has(t.id))
    .slice(0, 2)
    .map((t) => t.id);
  return firstTwo;
}

function computeIsFullComplete(tricks, log) {
  const completedSet = new Set(log.completedIds);
  if (completedSet.size === 0) return false;

  // 熟练老动作为静态展示列表，满勤判定只需勾完今日攻坚新招 + 不稳定老招
  const requiredIds = [
    ...log.selectedNewIds,
    ...log.assignedUnstableIds,
  ];

  if (requiredIds.length === 0) {
    return completedSet.size > 0;
  }
  return requiredIds.every((id) => completedSet.has(id));
}

export function reconcileDailyPlan(inputState, todayKey = toLocalDateKey()) {
  const state = cloneState(inputState);
  state.settings = sanitizeSettings(state.settings);
  if (!state.dailyLogs || typeof state.dailyLogs !== 'object') {
    state.dailyLogs = {};
  }

  const trickById = new Map(state.tricks.map((t) => [t.id, t]));
  const newTrickIds = new Set(
    state.tricks.filter((t) => t.tier === TIERS.NEW).map((t) => t.id)
  );
  const unstableTricks = state.tricks.filter((t) => t.tier === TIERS.UNSTABLE);
  const unstableIdSet = new Set(unstableTricks.map((t) => t.id));

  let log = state.dailyLogs[todayKey];
  if (!log) {
    log = createEmptyLog();
    log.selectedNewIds = getCarryOverNewIds(state, todayKey, newTrickIds);
    state.dailyLogs[todayKey] = log;
  } else {
    log.selectedNewIds = Array.isArray(log.selectedNewIds) ? log.selectedNewIds : [];
    log.assignedUnstableIds = Array.isArray(log.assignedUnstableIds)
      ? log.assignedUnstableIds
      : [];
    log.completedIds = Array.isArray(log.completedIds) ? log.completedIds : [];
    log.completedSnapshots =
      log.completedSnapshots && typeof log.completedSnapshots === 'object'
        ? log.completedSnapshots
        : {};
    log.preCompleteMeta =
      log.preCompleteMeta && typeof log.preCompleteMeta === 'object'
        ? log.preCompleteMeta
        : {};
    log.isRainRest = Boolean(log.isRainRest);
  }

  // 清理已失效或已跨分组的 selectedNewIds
  log.selectedNewIds = Array.from(
    new Set(log.selectedNewIds.filter((id) => newTrickIds.has(id)))
  );

  // 清理已删除动作的 completedIds（保留 completedSnapshots 以留存历史显示）
  log.completedIds = Array.from(
    new Set(log.completedIds.filter((id) => trickById.has(id)))
  );
  const completedSet = new Set(log.completedIds);

  // 调和不稳定老招的滚动队列分配
  const quota = state.settings.dailyUnstableCount;
  const existingUnstableAssigned = Array.from(
    new Set(log.assignedUnstableIds.filter((id) => unstableIdSet.has(id)))
  );

  const completedAssigned = existingUnstableAssigned.filter((id) =>
    completedSet.has(id)
  );
  const uncompletedAssigned = existingUnstableAssigned.filter(
    (id) => !completedSet.has(id)
  );

  const remainingSlotsForUncompleted = Math.max(
    0,
    quota - completedAssigned.length
  );
  const keptUncompleted = uncompletedAssigned.slice(
    0,
    remainingSlotsForUncompleted
  );

  // 保持已有条目在今日列表中的相对位置，避免点击勾选时突然跳位
  const keepSet = new Set([...completedAssigned, ...keptUncompleted]);
  const nextAssigned = existingUnstableAssigned.filter((id) => keepSet.has(id));

  if (nextAssigned.length < quota) {
    const assignedSet = new Set(nextAssigned);
    const candidates = unstableTricks
      .filter((t) => !assignedSet.has(t.id))
      .sort(compareUnstableQueue);

    for (const candidate of candidates) {
      if (nextAssigned.length >= quota) break;
      nextAssigned.push(candidate.id);
      assignedSet.add(candidate.id);
    }
  }

  log.assignedUnstableIds = nextAssigned;
  log.isFullComplete = computeIsFullComplete(state.tricks, log);
  return state;
}

export function setTodayNewSelection(inputState, selectedIds, todayKey = toLocalDateKey()) {
  const state = reconcileDailyPlan(inputState, todayKey);
  const newIdSet = new Set(
    state.tricks.filter((t) => t.tier === TIERS.NEW).map((t) => t.id)
  );
  const uniqueValid = Array.from(
    new Set((selectedIds || []).filter((id) => newIdSet.has(id)))
  );
  state.dailyLogs[todayKey].selectedNewIds = uniqueValid;
  state.dailyLogs[todayKey].isFullComplete = computeIsFullComplete(
    state.tricks,
    state.dailyLogs[todayKey]
  );
  return state;
}

export function toggleTrickCompletion(inputState, trickId, todayKey = toLocalDateKey()) {
  const state = reconcileDailyPlan(inputState, todayKey);
  const trick = state.tricks.find((t) => t.id === trickId);
  if (!trick) {
    return { state, event: null };
  }

  const log = state.dailyLogs[todayKey];
  const idx = log.completedIds.indexOf(trickId);

  if (idx === -1) {
    // 打卡勾选
    const prevQueueOrder = trick.queueOrder;
    const prevLastPracticed = trick.lastPracticedDate;
    let firstLandRecorded = false;

    log.completedIds.push(trickId);
    log.completedSnapshots[trickId] = {
      name: trick.name,
      tier: trick.tier,
      target: trick.target,
    };
    log.isRainRest = false;

    trick.totalCompletedCount = (trick.totalCompletedCount || 0) + 1;
    trick.tierCompletedCount = (trick.tierCompletedCount || 0) + 1;
    trick.lastPracticedDate = todayKey;

    if (!trick.firstLandDate) {
      trick.firstLandDate = todayKey;
      firstLandRecorded = true;
    }

    if (trick.tier === TIERS.UNSTABLE) {
      trick.queueOrder = getMaxQueueOrder(state.tricks) + 1;
    }

    log.preCompleteMeta[trickId] = {
      queueOrder: prevQueueOrder,
      firstLandAutoSet: firstLandRecorded,
      prevLastPracticedDate: prevLastPracticed,
    };

    log.isFullComplete = computeIsFullComplete(state.tricks, log);
    const promotionEligible = getPendingPromotion(state);

    return {
      state,
      event: {
        action: 'checked',
        trickId,
        trickName: trick.name,
        firstLandRecorded,
        firstLandDate: trick.firstLandDate,
        promotionEligible,
      },
    };
  }

  // 取消勾选（防误触回退）
  log.completedIds.splice(idx, 1);
  delete log.completedSnapshots[trickId];

  trick.totalCompletedCount = Math.max(0, (trick.totalCompletedCount || 0) - 1);
  trick.tierCompletedCount = Math.max(0, (trick.tierCompletedCount || 0) - 1);

  const meta = log.preCompleteMeta[trickId];
  if (meta) {
    if (meta.firstLandAutoSet && trick.totalCompletedCount === 0) {
      trick.firstLandDate = null;
    }
    if (trick.tier === TIERS.UNSTABLE && typeof meta.queueOrder === 'number') {
      trick.queueOrder = meta.queueOrder;
    }
    if ('prevLastPracticedDate' in meta) {
      trick.lastPracticedDate = meta.prevLastPracticedDate;
    }
    delete log.preCompleteMeta[trickId];
  } else if (trick.firstLandDate === todayKey && trick.totalCompletedCount === 0) {
    trick.firstLandDate = null;
  }

  if (
    trick.promotionDismissedAtCount !== null &&
    trick.tierCompletedCount < trick.promotionDismissedAtCount
  ) {
    trick.promotionDismissedAtCount = null;
  }

  log.isFullComplete = computeIsFullComplete(state.tricks, log);

  return {
    state,
    event: {
      action: 'unchecked',
      trickId,
      trickName: trick.name,
    },
  };
}

export function swapUnstableTrick(inputState, trickId, todayKey = toLocalDateKey()) {
  const state = reconcileDailyPlan(inputState, todayKey);
  const log = state.dailyLogs[todayKey];
  if (log.completedIds.includes(trickId)) {
    return { state, swapped: false, reason: 'already_completed' };
  }

  const assignedSet = new Set(log.assignedUnstableIds);
  if (!assignedSet.has(trickId)) {
    return { state, swapped: false, reason: 'not_assigned' };
  }

  const bench = state.tricks.filter(
    (t) => t.tier === TIERS.UNSTABLE && !assignedSet.has(t.id)
  );
  if (bench.length === 0) {
    return { state, swapped: false, reason: 'no_bench' };
  }

  const trick = state.tricks.find((t) => t.id === trickId);
  if (!trick) {
    return { state, swapped: false, reason: 'not_found' };
  }

  trick.queueOrder = getMaxQueueOrder(state.tricks) + 1;
  log.assignedUnstableIds = log.assignedUnstableIds.filter((id) => id !== trickId);

  const nextState = reconcileDailyPlan(state, todayKey);
  return { state: nextState, swapped: true };
}

export function toggleRainRest(inputState, todayKey = toLocalDateKey()) {
  const state = reconcileDailyPlan(inputState, todayKey);
  const log = state.dailyLogs[todayKey];
  if (log.completedIds.length > 0) {
    return { state, changed: false, reason: 'has_completions' };
  }
  log.isRainRest = !log.isRainRest;
  return { state, changed: true, isRainRest: log.isRainRest };
}

export function getPendingPromotion(state) {
  const settings = sanitizeSettings(state.settings);
  for (const trick of state.tricks) {
    if (trick.tier === TIERS.NEW) {
      if (
        (trick.tierCompletedCount || 0) >= settings.newPromoteThreshold &&
        trick.promotionDismissedAtCount !== trick.tierCompletedCount
      ) {
        return {
          trickId: trick.id,
          trickName: trick.name,
          fromTier: TIERS.NEW,
          toTier: TIERS.UNSTABLE,
          toLabel: TIER_META[TIERS.UNSTABLE].shortLabel,
          count: trick.tierCompletedCount,
        };
      }
    } else if (trick.tier === TIERS.UNSTABLE) {
      if (
        (trick.tierCompletedCount || 0) >= settings.unstablePromoteThreshold &&
        trick.promotionDismissedAtCount !== trick.tierCompletedCount
      ) {
        return {
          trickId: trick.id,
          trickName: trick.name,
          fromTier: TIERS.UNSTABLE,
          toTier: TIERS.MASTERED,
          toLabel: TIER_META[TIERS.MASTERED].shortLabel,
          count: trick.tierCompletedCount,
        };
      }
    }
  }
  return null;
}

export function acceptPromotion(inputState, trickId, todayKey = toLocalDateKey()) {
  const state = cloneState(inputState);
  const trick = state.tricks.find((t) => t.id === trickId);
  if (!trick) return reconcileDailyPlan(state, todayKey);

  if (trick.tier === TIERS.NEW) {
    trick.tier = TIERS.UNSTABLE;
    trick.tierCompletedCount = 0;
    trick.promotionDismissedAtCount = null;
    trick.queueOrder = getMaxQueueOrder(state.tricks) + 1;
    if (/^成\s*\d+\s*个$/.test((trick.target || '').trim())) {
      trick.target = TIER_META[TIERS.UNSTABLE].defaultTarget;
    }
  } else if (trick.tier === TIERS.UNSTABLE) {
    trick.tier = TIERS.MASTERED;
    trick.tierCompletedCount = 0;
    trick.promotionDismissedAtCount = null;
    if (/^连成\s*\d+\s*次$/.test((trick.target || '').trim())) {
      trick.target = TIER_META[TIERS.MASTERED].defaultTarget;
    }
  }

  return reconcileDailyPlan(state, todayKey);
}

export function dismissPromotion(inputState, trickId) {
  const state = cloneState(inputState);
  const trick = state.tricks.find((t) => t.id === trickId);
  if (trick) {
    trick.promotionDismissedAtCount = trick.tierCompletedCount || 0;
  }
  return state;
}

export function addTrick(inputState, payload, todayKey = toLocalDateKey()) {
  const state = cloneState(inputState);
  const name = String(payload?.name || '').trim();
  if (!name) {
    throw new Error('招式名称不能为空');
  }
  const tier = TIER_ORDER.includes(payload?.tier) ? payload.tier : TIERS.NEW;
  const target =
    String(payload?.target || '').trim() || TIER_META[tier].defaultTarget;
  const firstLandDate = isValidDateKey(payload?.firstLandDate)
    ? payload.firstLandDate
    : null;

  const trick = {
    id: createTrickId(),
    name,
    tier,
    target,
    queueOrder: getMaxQueueOrder(state.tricks) + 1,
    firstLandDate,
    totalCompletedCount: 0,
    tierCompletedCount: 0,
    promotionDismissedAtCount: null,
    lastPracticedDate: null,
    createdAt: todayKey,
  };

  state.tricks.push(trick);
  const nextState = reconcileDailyPlan(state, todayKey);
  return { state: nextState, trickId: trick.id };
}

export function updateTrick(inputState, trickId, patch, todayKey = toLocalDateKey()) {
  const state = cloneState(inputState);
  const trick = state.tricks.find((t) => t.id === trickId);
  if (!trick) {
    return reconcileDailyPlan(state, todayKey);
  }

  if (typeof patch.name === 'string') {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error('招式名称不能为空');
    trick.name = trimmed;
  }

  const oldTier = trick.tier;
  if (patch.tier && TIER_ORDER.includes(patch.tier) && patch.tier !== oldTier) {
    trick.tier = patch.tier;
    trick.tierCompletedCount = 0;
    trick.promotionDismissedAtCount = null;
    if (patch.tier === TIERS.UNSTABLE) {
      trick.queueOrder = getMaxQueueOrder(state.tricks) + 1;
    }
    const currentTarget = (trick.target || '').trim();
    if (
      patch.target === undefined &&
      currentTarget === TIER_META[oldTier].defaultTarget
    ) {
      trick.target = TIER_META[patch.tier].defaultTarget;
    }
  }

  if (typeof patch.target === 'string') {
    const t = patch.target.trim();
    trick.target = t || TIER_META[trick.tier].defaultTarget;
  }

  if ('firstLandDate' in patch) {
    if (!patch.firstLandDate) {
      trick.firstLandDate = null;
    } else if (isValidDateKey(patch.firstLandDate)) {
      trick.firstLandDate = patch.firstLandDate;
    }
  }

  return reconcileDailyPlan(state, todayKey);
}

export function deleteTrick(inputState, trickId, todayKey = toLocalDateKey()) {
  const state = cloneState(inputState);
  state.tricks = state.tricks.filter((t) => t.id !== trickId);
  const todayLog = state.dailyLogs?.[todayKey];
  if (todayLog) {
    todayLog.selectedNewIds = (todayLog.selectedNewIds || []).filter(
      (id) => id !== trickId
    );
    todayLog.assignedUnstableIds = (todayLog.assignedUnstableIds || []).filter(
      (id) => id !== trickId
    );
    todayLog.completedIds = (todayLog.completedIds || []).filter(
      (id) => id !== trickId
    );
  }
  return reconcileDailyPlan(state, todayKey);
}

export function updateSettings(inputState, patch, todayKey = toLocalDateKey()) {
  const state = cloneState(inputState);
  state.settings = sanitizeSettings({
    ...state.settings,
    ...patch,
  });
  return reconcileDailyPlan(state, todayKey);
}

export function getDayStatus(state, dateKey) {
  const log = state?.dailyLogs?.[dateKey];
  if (!log) return 'none';
  if (Array.isArray(log.completedIds) && log.completedIds.length > 0) {
    return log.isFullComplete ? 'full' : 'partial';
  }
  if (log.isRainRest) {
    return 'rain';
  }
  return 'none';
}

export function computeStreak(state, todayKey = toLocalDateKey()) {
  const logKeys = Object.keys(state?.dailyLogs || {}).filter(isValidDateKey);
  if (logKeys.length === 0) return 0;

  let earliestKey = logKeys[0];
  for (const k of logKeys) {
    if (k < earliestKey) earliestKey = k;
  }

  let cursor =
    getDayStatus(state, todayKey) !== 'none'
      ? todayKey
      : prevDayKey(todayKey);

  let streak = 0;
  let guard = 0;
  while (cursor >= earliestKey && guard < 36500) {
    const status = getDayStatus(state, cursor);
    if (status === 'full' || status === 'partial') {
      streak += 1;
    } else if (status === 'rain') {
      // 下雨休板日只桥接不断签，也不额外增加天数
    } else {
      break;
    }
    cursor = prevDayKey(cursor);
    guard += 1;
  }

  return streak;
}

export function getDaySummary(state, dateKey) {
  const status = getDayStatus(state, dateKey);
  const log = state?.dailyLogs?.[dateKey];
  if (!log) {
    return { dateKey, status: 'none', items: [] };
  }
  const trickById = new Map((state.tricks || []).map((t) => [t.id, t]));
  const items = (log.completedIds || []).map((id) => {
    const snap = log.completedSnapshots?.[id];
    const trick = trickById.get(id);
    if (snap) {
      return { id, name: snap.name, tier: snap.tier, target: snap.target };
    }
    if (trick) {
      return { id, name: trick.name, tier: trick.tier, target: trick.target };
    }
    return { id, name: '已删除招式', tier: TIERS.NEW, target: '' };
  });

  return {
    dateKey,
    status,
    isRainRest: Boolean(log.isRainRest),
    items,
  };
}

export function exportBackupPayload(state, now = new Date()) {
  return {
    app: 'SK8',
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    data: cloneState(state),
  };
}

export function parseAndValidateBackup(rawText, todayKey = toLocalDateKey()) {
  let parsed;
  try {
    parsed = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
  } catch {
    throw new Error('备份文件不是有效的 JSON 格式');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('备份文件格式无效');
  }

  const candidate =
    parsed.app === 'SK8' && parsed.data && typeof parsed.data === 'object'
      ? parsed.data
      : parsed;

  if (!Array.isArray(candidate.tricks)) {
    throw new Error('备份缺少招式数据');
  }

  const normalizedTricks = [];
  const seenIds = new Set();
  candidate.tricks.forEach((rawTrick, idx) => {
    if (!rawTrick || typeof rawTrick !== 'object') {
      throw new Error('招式条目格式错误');
    }
    const id = String(rawTrick.id || '').trim() || `imported_${idx + 1}`;
    const name = String(rawTrick.name || '').trim();
    if (!name || seenIds.has(id)) {
      throw new Error('招式条目缺少名称或存在重复 ID');
    }
    seenIds.add(id);

    const tier = TIER_ORDER.includes(rawTrick.tier) ? rawTrick.tier : TIERS.NEW;
    const target =
      String(rawTrick.target || '').trim() || TIER_META[tier].defaultTarget;

    normalizedTricks.push({
      id,
      name,
      tier,
      target,
      queueOrder:
        typeof rawTrick.queueOrder === 'number' && Number.isFinite(rawTrick.queueOrder)
          ? rawTrick.queueOrder
          : idx + 1,
      firstLandDate: isValidDateKey(rawTrick.firstLandDate)
        ? rawTrick.firstLandDate
        : null,
      totalCompletedCount: clampInt(rawTrick.totalCompletedCount, 0, 999999, 0),
      tierCompletedCount: clampInt(rawTrick.tierCompletedCount, 0, 999999, 0),
      promotionDismissedAtCount:
        typeof rawTrick.promotionDismissedAtCount === 'number'
          ? rawTrick.promotionDismissedAtCount
          : null,
      lastPracticedDate: isValidDateKey(rawTrick.lastPracticedDate)
        ? rawTrick.lastPracticedDate
        : null,
      createdAt: isValidDateKey(rawTrick.createdAt)
        ? rawTrick.createdAt
        : todayKey,
    });
  });

  const normalizedLogs = {};
  if (candidate.dailyLogs && typeof candidate.dailyLogs === 'object') {
    for (const [dateKey, rawLog] of Object.entries(candidate.dailyLogs)) {
      if (!isValidDateKey(dateKey) || !rawLog || typeof rawLog !== 'object') {
        continue;
      }
      normalizedLogs[dateKey] = {
        selectedNewIds: Array.isArray(rawLog.selectedNewIds)
          ? rawLog.selectedNewIds.map(String)
          : [],
        assignedUnstableIds: Array.isArray(rawLog.assignedUnstableIds)
          ? rawLog.assignedUnstableIds.map(String)
          : [],
        completedIds: Array.isArray(rawLog.completedIds)
          ? rawLog.completedIds.map(String)
          : [],
        completedSnapshots:
          rawLog.completedSnapshots && typeof rawLog.completedSnapshots === 'object'
            ? rawLog.completedSnapshots
            : {},
        preCompleteMeta:
          rawLog.preCompleteMeta && typeof rawLog.preCompleteMeta === 'object'
            ? rawLog.preCompleteMeta
            : {},
        isRainRest: Boolean(rawLog.isRainRest),
        isFullComplete: Boolean(rawLog.isFullComplete),
      };
    }
  }

  const nextState = {
    version: 1,
    settings: sanitizeSettings(candidate.settings || {}),
    tricks: normalizedTricks,
    dailyLogs: normalizedLogs,
  };

  return reconcileDailyPlan(nextState, todayKey);
}

export function setTrickCompletion(
  inputState,
  trickId,
  wantDone,
  todayKey = toLocalDateKey()
) {
  const state = reconcileDailyPlan(inputState, todayKey);
  const completed = Boolean(state.dailyLogs[todayKey]?.completedIds?.includes(trickId));
  if (completed === Boolean(wantDone)) {
    return { state, event: null };
  }
  return toggleTrickCompletion(state, trickId, todayKey);
}

export function setRainRest(
  inputState,
  wantRain,
  todayKey = toLocalDateKey()
) {
  const state = reconcileDailyPlan(inputState, todayKey);
  const isRain = Boolean(state.dailyLogs[todayKey]?.isRainRest);
  if (isRain === Boolean(wantRain)) {
    return { state, changed: false, isRainRest: isRain };
  }
  return toggleRainRest(state, todayKey);
}

export function findTrickByName(state, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  const tricks = state?.tricks || [];
  return (
    tricks.find((t) => t.name.toLowerCase() === q) ||
    tricks.find((t) => t.id.toLowerCase() === q) ||
    tricks.find((t) => t.name.toLowerCase().includes(q)) ||
    null
  );
}

export function renderMarkdownLog(inputState, todayKey = toLocalDateKey()) {
  const state = reconcileDailyPlan(inputState, todayKey);
  const log = state.dailyLogs[todayKey];
  const trickById = new Map(state.tricks.map((t) => [t.id, t]));
  const completedSet = new Set(log.completedIds);
  const streak = computeStreak(state, todayKey);
  const statusMap = {
    full: '今日全清',
    partial: '部分完成',
    rain: '下雨休板',
    none: '未打卡',
  };
  const todayStatus = statusMap[getDayStatus(state, todayKey)];

  const lines = [
    '# SK8 平地滑板练习记录',
    '',
    `> 今日：\`${todayKey}\` · 状态：**${todayStatus}** · 连续打卡：**${streak} 天**`,
    '',
    '## 今日攻坚新招',
  ];

  const newList = log.selectedNewIds.map((id) => trickById.get(id)).filter(Boolean);
  if (newList.length === 0) {
    lines.push('- （暂无）');
  } else {
    for (const t of newList) {
      const box = completedSet.has(t.id) ? '[x]' : '[ ]';
      const land = t.firstLandDate ? ` · 首成 ${t.firstLandDate}` : '';
      lines.push(`- ${box} ${t.name}（${t.target}${land}）`);
    }
  }

  lines.push('', `## 今日不稳定老招（每日 ${state.settings.dailyUnstableCount} 个滚动）`);
  const unstableList = log.assignedUnstableIds
    .map((id) => trickById.get(id))
    .filter(Boolean);
  if (unstableList.length === 0) {
    lines.push('- （暂无）');
  } else {
    for (const t of unstableList) {
      const box = completedSet.has(t.id) ? '[x]' : '[ ]';
      lines.push(`- ${box} ${t.name}（${t.target}）`);
    }
  }

  lines.push('', '## 熟练老动作（静态列表）');
  const masteredList = state.tricks.filter((t) => t.tier === TIERS.MASTERED);
  if (masteredList.length === 0) {
    lines.push('- （暂无）');
  } else {
    for (const t of masteredList) {
      lines.push(`- ${t.name}`);
    }
  }

  lines.push('', '## 招式库总览');
  for (const tier of TIER_ORDER) {
    const group = state.tricks.filter((t) => t.tier === tier);
    lines.push(`### ${TIER_META[tier].label}（${group.length}）`);
    for (const t of group) {
      const land = t.firstLandDate ? ` · 首成 ${t.firstLandDate}` : '';
      lines.push(`- ${t.name}｜${t.target}｜累计 ${t.totalCompletedCount || 0} 次${land}`);
    }
    lines.push('');
  }

  lines.push('## 最近打卡记录');
  const recentKeys = Object.keys(state.dailyLogs)
    .filter((k) => isValidDateKey(k) && getDayStatus(state, k) !== 'none')
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 30);

  if (recentKeys.length === 0) {
    lines.push('- （暂无打卡记录）');
  } else {
    for (const k of recentKeys) {
      const summary = getDaySummary(state, k);
      if (summary.items.length > 0) {
        const names = summary.items.map((item) => item.name).join('、');
        lines.push(`- **${k}**（${statusMap[summary.status]}）：${names}`);
      } else if (summary.status === 'rain') {
        lines.push(`- **${k}**（下雨休板）`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}
