/**
 * SK8 云端双向同步（Upstash Redis REST + 非阻塞防抖批量队列 + 本地离线兜底）
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

let opSeq = 0;

function nextOpId() {
  opSeq += 1;
  return `${Date.now()}_${opSeq}`;
}

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

export function mergePendingOpList(existingOps, opRecord) {
  const stamped = { ...opRecord, opId: opRecord.opId || nextOpId() };
  const filtered = (existingOps || []).filter((item) => {
    if (stamped.op === 'setDone') {
      return !(
        item.op === 'setDone' &&
        item.dateKey === stamped.dateKey &&
        item.trickId === stamped.trickId
      );
    }
    if (stamped.op === 'setRain') {
      return !(item.op === 'setRain' && item.dateKey === stamped.dateKey);
    }
    if (stamped.op === 'selectNew') {
      return !(item.op === 'selectNew' && item.dateKey === stamped.dateKey);
    }
    return true;
  });
  filtered.push(stamped);
  return filtered;
}

export function queuePendingOp(opRecord) {
  const next = mergePendingOpList(getPendingOps(), opRecord);
  savePendingOps(next);
  return next;
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

export function isSameLogicalState(a, b) {
  if (!a || !b) return false;
  const strip = (s) => {
    const { updatedAt, ...rest } = s;
    return rest;
  };
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
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
      const sentIds = new Set(pending.map((o) => o.opId));
      cloudState = replayPendingOps(cloudState, pending);
      cloudState = reconcileDailyPlan(cloudState, todayKey);
      cloudState.updatedAt = Date.now();
      await redisCmd(['SET', KEY, JSON.stringify(cloudState)]);
      const remaining = getPendingOps().filter((o) => !sentIds.has(o.opId));
      savePendingOps(remaining);
      if (remaining.length > 0) {
        cloudState = reconcileDailyPlan(
          replayPendingOps(cloudState, remaining),
          todayKey
        );
      }
      saveCachedState(cloudState);
      return {
        state: cloudState,
        synced: remaining.length === 0,
        pendingCount: remaining.length,
      };
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

export async function flushPendingOps(fallbackState, todayKey = toLocalDateKey()) {
  if (isLocalOnlyMode()) {
    savePendingOps([]);
    return { state: fallbackState, synced: true, pendingCount: 0 };
  }

  const initialPending = getPendingOps();
  if (initialPending.length === 0) {
    return { state: fallbackState, synced: true, pendingCount: 0 };
  }

  try {
    const raw = await redisCmd(['GET', KEY]);
    const batch = getPendingOps();
    const sentIds = new Set(batch.map((o) => o.opId));

    let base = parseCloudPayload(raw, todayKey) || fallbackState;
    base = replayPendingOps(base, batch);
    base = reconcileDailyPlan(base, todayKey);
    base.updatedAt = Date.now();

    await redisCmd(['SET', KEY, JSON.stringify(base)]);

    const remaining = getPendingOps().filter((o) => !sentIds.has(o.opId));
    savePendingOps(remaining);

    const effective =
      remaining.length > 0
        ? reconcileDailyPlan(replayPendingOps(base, remaining), todayKey)
        : base;
    saveCachedState(effective);

    return {
      state: effective,
      synced: true,
      pendingCount: remaining.length,
      needsFollowUp: remaining.length > 0,
    };
  } catch {
    return {
      state: fallbackState,
      synced: false,
      pendingCount: getPendingOps().length,
      needsFollowUp: false,
    };
  }
}
