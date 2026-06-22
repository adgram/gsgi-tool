/**
 * 文件操作工具
 * 提供文件大小格式化、文件名生成与校验、JSON 验证等文件相关辅助函数。
 */

/** 将字节数格式化为可读的 B/KB/MB/GB 字符串 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/** 基于当前时间戳生成唯一文件名 */
export function generateFileName(baseName = 'gsgi', ext = 'gsgi'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${baseName}-${timestamp}.${ext}`;
}

/** 验证 JSON 字符串是否合法 */
export function validateJSON(jsonStr: string): boolean {
  try {
    JSON.parse(jsonStr);
    return true;
  } catch (e) {
    return false;
  }
}

/** 清理文件名中的非法字符，仅保留字母数字、下划线、连字符、空格和点 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\s.]/g, '_').trim();
}

/** 确保文件名具有指定的扩展名，没有则替换 */
export function ensureFileExtension(fileName: string, ext = 'gsgi'): string {
  if (!fileName) return `untitled.${ext}`;
  const name = fileName.substring(0, fileName.lastIndexOf('.'));
  return `${name}.${ext}`;
}
