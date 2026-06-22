/**
 * 核心类型定义
 *
 * 项目共享的基础接口和类型别名，
 * 避免在多个文件中重复定义相同的形状。
 */

/** 2D 坐标点（纯数据，轻量） */
export interface PointData {
  x: number;
  y: number;
}

/** 捕捉结果，由 SnapManager 返回 */
export interface SnapResult {
  x: number;
  y: number;
  pointId?: string;
  lineId?: string;
  entityId?: string;
  t?: number;
  type?: string;
}

/** 文档标签页元数据 */
export interface DocTab {
  name: string;
  data: unknown;
  dirty: boolean;
}

/** CLI 历史记录条目 */
export interface CmdHistoryEntry {
  text: string;
  type: 'cmd' | 'system';
  time: number;
}

/** 撤销命令接口 */
export interface UndoableCommand {
  type: string;
  entityId?: string;
  undo(): void;
  redo(): void;
}

/** 文档序列化数据 */
export interface DocumentData {
  properties?: Record<string, unknown>;
  entities?: unknown[];
  points?: Record<string, PointData>;
  layers?: unknown[];
  blocks?: unknown[];
  linetypes?: unknown[];
  textstyles?: unknown[];
  dimstyles?: unknown[];
  xrefs?: unknown[];
}

/** 快照对象 */
export interface Snapshot {
  before: unknown;
  after: unknown;
  timestamp: number;
}
