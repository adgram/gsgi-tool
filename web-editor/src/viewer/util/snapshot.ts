/**
 * 快照管理工具
 * 用于创建和恢复文档状态快照（通常用于撤销操作前的状态备份）。
 */

import { cloneDocumentData, applyDocumentData } from './clipboard.js';

interface Snapshot {
  before: unknown;
  after: unknown;
  timestamp: number;
}

/** 创建当前文档的快照对象（包含 before/after 文档状态和时间戳） */
export function createSnapshot(viewer: Record<string, any>): Snapshot {
  return {
    before: cloneDocumentData(viewer.doc),
    after: cloneDocumentData(viewer.doc),
    timestamp: Date.now()
  };
}

/** 将快照中的 before 状态应用到 viewer（用于撤销恢复） */
export function applySnapshot(viewer: Record<string, any>, snapshot: Snapshot): Snapshot {
  applyDocumentData(viewer, snapshot.before);
  viewer._persist();
  if (viewer.renderer) {
    viewer.renderer.render();
    viewer.view.update();
  }
  return snapshot;
}

/** 保存当前快照（createSnapshot 的别名） */
export function saveSnapshot(viewer: Record<string, any>): Snapshot {
  return createSnapshot(viewer);
}

/** 序列化快照为 JSON 字符串（用于存储或传输） */
export function snapshotToString(snapshot: Snapshot): string {
  return JSON.stringify(snapshot);
}

/** 从 JSON 字符串反序列化为快照对象 */
export function snapshotFromString(str: string): Snapshot | null {
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn('[snapshot] snapshotFromString: invalid JSON');
    return null;
  }
}

/** 通过 JSON 字符串比较两个快照是否相等 */
export function compareSnapshots(s1: Snapshot | null, s2: Snapshot | null): boolean {
  if (!s1 || !s2) return false;
  return JSON.stringify(s1) === JSON.stringify(s2);
}
