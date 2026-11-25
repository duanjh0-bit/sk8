/**
 * SK8 云端双向同步（Upstash Redis REST + 本地离线兜底队列）
 */

import {
  createInitialState,
  reconcileDailyPlan,
  setRainRest,
  setTodayNewSelection,
  setTrickCompletion,
  toLocalDateKey,
} from './domain.js';

const STORE_URL = 'https://accepted-lacewing-134185.upstash.io';
const STORE_AUTH = atob(
  'Z1FBQUFBQUFBZ3dwQUFJZ2NESm1ZVE01TWpnd1pXUTJOR0UwT0dNeE9UWXpOalUwT0Rnd1pXTmtaV0k0TUE='
);
const KEY = 'sk8_state';
const CACHE_KEY = 'sk8_cached_state_v2';
const PENDING_KEY = 'sk8_pending_ops_v2';

export function isLocalOnlyMode() {
  try {
    return new URLSearchParams(window.location.search).get('local') === '1';
  } catch {
    return false;
  }
}

export function loadCachedState() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCachedState(state) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    // 忽略容量受限错误
  }
}

export function getPendingOps() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function savePendingOps(ops) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
  } catch {
    // ignore
  }
}

export function queuePendingOp(opRecord) {
  const ops = getPendingOps().filter((item) => {
    if (opRecord.op === 'setDone') {
      return !(
        item.op === 'setDone' &&
        item.dateKey === opRecord.dateKey &&
        item.trickId === opRecord.trickId
      );
    }
    if (opRecord.op === 'setRain') {
      return !(item.op === 'setRain' && item.dateKey === opRecord.dateKey);
    }
    if (opRecord.op === 'selectNew') {
      return !(item.op === 'selectNew' && item.dateKey === opRecord.dateKey);
    }
    return true;
  });
  ops.push(opRecord);
  savePendingOps(ops);
  return ops;
}

export function replayPendingOps(baseState, ops) {
  let state = baseState;
  for (const item of ops) {
    if (item.op === 'setDone') {
      state = setTrickCompletion(
        state,
        item.trickId,
        Boolean(item.value),
        item.dateKey
      ).state;
    } else if (item.op === 'setRain') {
      state = setRainRest(state, Boolean(item.value), item.dateKey).state;
    } else if (item.op === 'selectNew') {
      state = setTodayNewSelection(state, item.ids || [], item.dateKey);
    }
  }
  return state;
}

async function redisCmd(args) {
  const res = await fetch(STORE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STORE_AUTH}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

function parseCloudPayload(raw, todayKey) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tricks)) {
      return reconcileDailyPlan(parsed, todayKey);
    }
  } catch {
    return null;
  }
  return null;
}

export async function syncPull(todayKey = toLocalDateKey()) {
  const localFallback = reconcileDailyPlan(
    loadCachedState() || createInitialState(todayKey),
    todayKey
  );

  if (isLocalOnlyMode()) {
    saveCachedState(localFallback);
    return { state: localFallback, synced: true, pendingCount: 0 };
  }

  try {
    const raw = await redisCmd(['GET', KEY]);
    let cloudState = parseCloudPayload(raw, todayKey);
    const pending = getPendingOps();

    if (!cloudState) {
      cloudState = localFallback;
      cloudState.updatedAt = Date.now();
      await redisCmd(['SET', KEY, JSON.stringify(cloudState)]);
      savePendingOps([]);
      saveCachedState(cloudState);
      return { state: cloudState, synced: true, pendingCount: 0 };
    }

    if (pending.length > 0) {
      cloudState = replayPendingOps(cloudState, pending);
      cloudState = reconcileDailyPlan(cloudState, todayKey);
      cloudState.updatedAt = Date.now();
      await redisCmd(['SET', KEY, JSON.stringify(cloudState)]);
      savePendingOps([]);
    }

    saveCachedState(cloudState);
    return { state: cloudState, synced: true, pendingCount: 0 };
  } catch {
    saveCachedState(localFallback);
    return {
      state: localFallback,
      synced: false,
      pendingCount: getPendingOps().length,
    };
  }
}

export async function syncPushOp(
  optimisticState,
  opRecord,
  todayKey = toLocalDateKey()
) {
  const stamped = { ...optimisticState, updatedAt: Date.now() };
  saveCachedState(stamped);

  if (isLocalOnlyMode()) {
    return { state: stamped, synced: true, pendingCount: 0 };
  }

  const pending = queuePendingOp(opRecord);

  try {
    const raw = await redisCmd(['GET', KEY]);
    let base = parseCloudPayload(raw, todayKey) || stamped;
    base = replayPendingOps(base, pending);
    base = reconcileDailyPlan(base, todayKey);
    base.updatedAt = Date.now();

    await redisCmd(['SET', KEY, JSON.stringify(base)]);
    savePendingOps([]);
    saveCachedState(base);
    return { state: base, synced: true, pendingCount: 0 };
  } catch {
    return {
      state: stamped,
      synced: false,
      pendingCount: pending.length,
    };
  }
}
