/**
 * 全局常量、默认值与容差。
 * 容差单一来源：/conventions 回显与自动化测试都引用这里。
 */

/** 默认比热比（空气，理想气体定比热假设） */
export const DEFAULT_GAMMA = 1.4;

/** 默认气体常数 R，J/(kg·K)（干空气） */
export const DEFAULT_GAS_CONSTANT = 287.0;

/**
 * 各项数值容差。
 */
export const TOLERANCES = {
  /** 热效率与理想闭式对比时允许的绝对误差 */
  efficiencyClosedForm: 1e-9,
  /** 比净功符号/升降判定的相对容差（乘以比净功量级） */
  netWorkRelative: 1e-9,
  /** 加热量为零判定：对应的温差阈值 K（q = cp·ΔT） */
  heatZeroTemperature: 1e-9,
} as const;

/** 材料温度上限策略标识与标注语 */
export const MATERIAL_LIMIT_POLICY = 'FLAG_ONLY_NEVER_CLAMP';
export const MATERIAL_LIMIT_MARKER = '受入口温度限制';

/** 单批最大工况组数 */
export const MAX_BATCH_CASES = 500;
/** 扫描最多网格点数 */
export const MAX_SCAN_POINTS = 100_001;
/** 历史查询默认/最大单页条数 */
export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 500;
