/**
 * SK8 招式分组、脚位分类与预置平地招式库
 */

export const TIERS = Object.freeze({
  NEW: 'new',
  UNSTABLE: 'unstable',
  MASTERED: 'mastered',
  DREAM: 'dream',
});

export const TIER_ORDER = [
  TIERS.NEW,
  TIERS.UNSTABLE,
  TIERS.MASTERED,
  TIERS.DREAM,
];

export const TIER_META = Object.freeze({
  [TIERS.NEW]: {
    id: TIERS.NEW,
    label: '攻坚新招',
    shortLabel: '攻坚',
    defaultTarget: '成 2 个',
    nextTier: TIERS.UNSTABLE,
    nextLabel: '不稳老招',
  },
  [TIERS.UNSTABLE]: {
    id: TIERS.UNSTABLE,
    label: '不稳定老招',
    shortLabel: '不稳',
    defaultTarget: '出一遍',
    nextTier: TIERS.MASTERED,
    nextLabel: '熟练老动作',
  },
  [TIERS.MASTERED]: {
    id: TIERS.MASTERED,
    label: '熟练老动作',
    shortLabel: '熟练',
    defaultTarget: '稳定',
    nextTier: null,
    nextLabel: null,
  },
  [TIERS.DREAM]: {
    id: TIERS.DREAM,
    label: '梦想招式',
    shortLabel: '梦想',
    defaultTarget: '梦想',
    nextTier: TIERS.NEW,
    nextLabel: '攻坚新招',
  },
});

export const STANCES = Object.freeze({
  REGULAR: 'regular',
  FAKIE: 'fakie',
  SWITCH: 'switch',
});

export const STANCE_ORDER = [
  STANCES.REGULAR,
  STANCES.FAKIE,
  STANCES.SWITCH,
];

export const STANCE_META = Object.freeze({
  [STANCES.REGULAR]: { id: STANCES.REGULAR, label: '正滑' },
  [STANCES.FAKIE]: { id: STANCES.FAKIE, label: '倒滑' },
  [STANCES.SWITCH]: { id: STANCES.SWITCH, label: '反脚位' },
});

export const DEFAULT_SETTINGS = Object.freeze({
  dailyUnstableCount: 7,
  newPromoteThreshold: 3,
  unstablePromoteThreshold: 5,
});

export const PRESET_TRICKS = [
  // 熟练老动作（纯静态列表，按脚位与相近动作归类）
  { id: 'm_1', name: '正滑 Ollie', tier: TIERS.MASTERED, stance: STANCES.REGULAR, target: '稳定' },
  { id: 'm_2', name: '正滑外转', tier: TIERS.MASTERED, stance: STANCES.REGULAR, target: '稳定' },
  { id: 'm_3', name: '正滑 FS Pop Shuvit', tier: TIERS.MASTERED, stance: STANCES.REGULAR, target: '稳定' },
  { id: 'm_4', name: '正滑 BS Pop Shuvit', tier: TIERS.MASTERED, stance: STANCES.REGULAR, target: '稳定' },
  { id: 'm_5', name: '正滑尖翻', tier: TIERS.MASTERED, stance: STANCES.REGULAR, target: '稳定' },

  { id: 'm_6', name: '倒滑 Ollie', tier: TIERS.MASTERED, stance: STANCES.FAKIE, target: '稳定' },
  { id: 'm_7', name: '倒滑外转', tier: TIERS.MASTERED, stance: STANCES.FAKIE, target: '稳定' },
  { id: 'm_8', name: '倒滑内转', tier: TIERS.MASTERED, stance: STANCES.FAKIE, target: '稳定' },
  { id: 'm_9', name: '倒滑 FS Pop Shuvit', tier: TIERS.MASTERED, stance: STANCES.FAKIE, target: '稳定' },
  { id: 'm_10', name: '倒滑 BS Pop Shuvit', tier: TIERS.MASTERED, stance: STANCES.FAKIE, target: '稳定' },
  { id: 'm_11', name: '倒滑内转 Bigspin', tier: TIERS.MASTERED, stance: STANCES.FAKIE, target: '稳定' },

  { id: 'm_12', name: 'Nollie BS Shuvit', tier: TIERS.MASTERED, stance: STANCES.SWITCH, target: '稳定' },

  // 不稳定老招（每日全部出一遍）
  { id: 'u_1', name: '正滑内转', tier: TIERS.UNSTABLE, stance: STANCES.REGULAR, target: '出一遍' },
  { id: 'u_2', name: '正滑 Pop Shuvit Revert', tier: TIERS.UNSTABLE, stance: STANCES.REGULAR, target: '出一遍' },
  { id: 'u_3', name: '正滑跟翻', tier: TIERS.UNSTABLE, stance: STANCES.REGULAR, target: '出一遍' },

  { id: 'u_4', name: '倒滑 360 Shuvit', tier: TIERS.UNSTABLE, stance: STANCES.FAKIE, target: '出一遍' },
  { id: 'u_5', name: '倒滑外转 360', tier: TIERS.UNSTABLE, stance: STANCES.FAKIE, target: '出一遍' },
  { id: 'u_6', name: '倒滑外转 Bigspin', tier: TIERS.UNSTABLE, stance: STANCES.FAKIE, target: '出一遍' },
  { id: 'u_7', name: '倒滑尖翻', tier: TIERS.UNSTABLE, stance: STANCES.FAKIE, target: '出一遍' },

  // 攻坚新招（每日选两个）
  { id: 'n_1', name: '正滑小乱', tier: TIERS.NEW, stance: STANCES.REGULAR, target: '成 2 个' },
  { id: 'n_2', name: '正滑大乱', tier: TIERS.NEW, stance: STANCES.REGULAR, target: '成 2 个' },
  { id: 'n_3', name: '正滑跟翻小乱', tier: TIERS.NEW, stance: STANCES.REGULAR, target: '成 2 个' },
  { id: 'n_4', name: '正滑外转跟翻', tier: TIERS.NEW, stance: STANCES.REGULAR, target: '成 2 个' },

  { id: 'n_5', name: '倒滑内转 360', tier: TIERS.NEW, stance: STANCES.FAKIE, target: '成 2 个' },
  { id: 'n_6', name: 'Half Cab 尖翻', tier: TIERS.NEW, stance: STANCES.FAKIE, target: '成 2 个' },
  { id: 'n_7', name: '倒滑跟翻', tier: TIERS.NEW, stance: STANCES.FAKIE, target: '成 2 个' },
  { id: 'n_8', name: '倒滑外转跟翻', tier: TIERS.NEW, stance: STANCES.FAKIE, target: '成 2 个' },

  // 梦想招式（纯静态展示）
  { id: 'd_1', name: '正滑压翻', tier: TIERS.DREAM, stance: STANCES.REGULAR, target: '梦想' },
];
