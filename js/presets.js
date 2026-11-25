/**
 * SK8 预置平地招式与分组常量
 */

export const TIERS = Object.freeze({
  NEW: 'new',
  UNSTABLE: 'unstable',
  MASTERED: 'mastered',
});

export const TIER_ORDER = [TIERS.NEW, TIERS.UNSTABLE, TIERS.MASTERED];

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
    defaultTarget: '连成 2 次',
    nextTier: TIERS.MASTERED,
    nextLabel: '熟练老动作',
  },
  [TIERS.MASTERED]: {
    id: TIERS.MASTERED,
    label: '熟练老动作',
    shortLabel: '熟练',
    defaultTarget: '核对',
    nextTier: null,
    nextLabel: null,
  },
});

export const TARGET_CHIPS = [
  '成 1 个',
  '成 2 个',
  '连成 2 次',
  '连成 3 次',
  '核对',
];

export const DEFAULT_SETTINGS = Object.freeze({
  dailyUnstableCount: 4,
  newPromoteThreshold: 3,
  unstablePromoteThreshold: 5,
});

export const PRESET_TRICKS = [
  // 熟练老动作
  { id: 'preset_ollie', name: 'Ollie', tier: TIERS.MASTERED, target: '核对' },
  { id: 'preset_pop_shuvit', name: 'Pop Shuvit', tier: TIERS.MASTERED, target: '核对' },
  { id: 'preset_fs_180', name: 'FS 180', tier: TIERS.MASTERED, target: '核对' },
  { id: 'preset_bs_180', name: 'BS 180', tier: TIERS.MASTERED, target: '核对' },

  // 不稳定老招
  { id: 'preset_fs_shuvit', name: 'FS Shuvit', tier: TIERS.UNSTABLE, target: '连成 2 次' },
  { id: 'preset_fakie_ollie', name: 'Fakie Ollie', tier: TIERS.UNSTABLE, target: '连成 2 次' },
  { id: 'preset_fakie_shuvit', name: 'Fakie Shuvit', tier: TIERS.UNSTABLE, target: '连成 2 次' },
  { id: 'preset_half_cab', name: 'Half Cab', tier: TIERS.UNSTABLE, target: '连成 2 次' },
  { id: 'preset_fakie_bigspin', name: 'Fakie Bigspin', tier: TIERS.UNSTABLE, target: '连成 2 次' },
  { id: 'preset_kickflip', name: 'Kickflip', tier: TIERS.UNSTABLE, target: '连成 2 次' },

  // 攻坚新招
  { id: 'preset_heelflip', name: 'Heelflip', tier: TIERS.NEW, target: '成 2 个' },
  { id: 'preset_varial_kickflip', name: 'Varial Kickflip', tier: TIERS.NEW, target: '成 2 个' },
  { id: 'preset_nollie_shuvit', name: 'Nollie Shuvit', tier: TIERS.NEW, target: '成 2 个' },
  { id: 'preset_bs_bigspin', name: 'BS Bigspin', tier: TIERS.NEW, target: '成 2 个' },
  { id: 'preset_tre_flip', name: 'Tre Flip', tier: TIERS.NEW, target: '成 2 个' },
  { id: 'preset_hardflip', name: 'Hardflip', tier: TIERS.NEW, target: '成 2 个' },
  { id: 'preset_inward_heelflip', name: 'Inward Heelflip', tier: TIERS.NEW, target: '成 2 个' },
  { id: 'preset_nollie_flip', name: 'Nollie Flip', tier: TIERS.NEW, target: '成 2 个' },
  { id: 'preset_switch_flip', name: 'Switch Flip', tier: TIERS.NEW, target: '成 2 个' },
];
