/**
 * 剪贴板/文档数据操作工具
 * 提供文档深度克隆、剪切板读写、实体序列化/反序列化、HTML 转义等通用工具函数。
 */

export const DRAG_THRESHOLD = 5;        // 拖拽操作的像素阈值
export const GRIP_SIZE_PX = 14;         // 夹点（控制柄）大小（像素）

import { nextId } from '../../core/barrel.js';
export { nextId };

/** 深拷贝文档数据（JSON 序列化再解析） */
export function cloneDocumentData(doc: { toJSON: () => unknown }): unknown {
  return JSON.parse(JSON.stringify(doc.toJSON()));
}

/** 将数据加载到 viewer，保留撤销栈、选中状态和视图 */
export function applyDocumentData(viewer: Record<string, any>, data: unknown): void {
  viewer.loadFile(data, { preserveUndo: true, preserveSelection: true, preserveView: true });
}

/** 创建标准撤销命令（适用于文档修改操作） */
export function createUndoCommand(
  entityId: string | undefined,
  before: unknown,
  after: unknown,
  viewer: Record<string, any>
): { type: 'modify-document'; entityId: string | undefined; before: unknown; after: unknown; undo(): void; redo(): void } {
  return {
    type: 'modify-document',
    entityId,
    before,
    after,
    undo() { applyDocumentData(viewer, before); },
    redo() { applyDocumentData(viewer, after); }
  };
}

/** 转义 HTML 特殊字符，防止 XSS 注入 */
export function escapeHTML(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 将文本写入系统剪贴板（异步 API + 降级方案） */
export function saveToClipboard(text: string): boolean {
  try {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
    return true;
  } catch (e) {
    console.warn('[clipboard] saveToClipboard failed:', e);
    return false;
  }
}

/** 从系统剪贴板读取文本（返回 Promise，失败返回 null） */
export function readFromClipboard(): Promise<string | null> {
  return navigator.clipboard.readText()
    .then(text => text)
    .catch(() => Promise.resolve(null));
}

interface EntityLike { toJSON: () => unknown }

/** 将实体数组序列化为格式化的 JSON 字符串（用于导出选中实体） */
export function exportEntitiesToJSON(entities: EntityLike[]): string {
  return JSON.stringify(entities.map(e => e.toJSON()), null, 2);
}

/** 从 JSON 字符串中解析实体数组（用于导入实体） */
export function importEntitiesFromJSON(jsonStr: string): unknown[] | null {
  try {
    const data = JSON.parse(jsonStr);
    return Array.isArray(data) ? data : [data];
  } catch (e) {
    console.warn('[clipboard] importEntitiesFromJSON: invalid JSON');
    return null;
  }
}

interface DocLike { toJSON: () => unknown }

/** 导出整个文档为 JSON 对象 */
export function exportDocumentToJSON(doc: DocLike): unknown {
  return doc.toJSON();
}

/** 从 JSON 字符串解析文档对象 */
export function importDocumentFromJSON(jsonStr: string): unknown | null {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn('[clipboard] importDocumentFromJSON: invalid JSON');
    return null;
  }
}
