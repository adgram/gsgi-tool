/**
 * GSGI 网页编辑器入口
 * 
 * 初始化 Viewer、绑定拖放/滚轮事件、启动时加载演示文件
 */

import { Viewer } from './viewer/index';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const viewer = new Viewer(canvas);
(window as any).viewer = viewer;

// ─── 拖放加载 .gsgi 文件 ─────────────────────────

const dropOverlay = document.getElementById('drop-overlay')!;
const container = document.getElementById('canvas-container')!;

let _dragEnterCount = 0;

// 文件拖入窗口时显示拖放覆盖层
document.addEventListener('dragenter', () => {
  _dragEnterCount++;
  dropOverlay.classList.add('show');
});

// 阻止默认行为以允许 drop
document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

// 拖出窗口区域时隐藏拖放覆盖层（需计数归零，避免子元素进出误触发）
document.addEventListener('dragleave', () => {
  _dragEnterCount--;
  if (_dragEnterCount <= 0) {
    _dragEnterCount = 0;
    dropOverlay.classList.remove('show');
  }
});

// 拖放操作结束时强制重置状态
document.addEventListener('dragend', () => {
  _dragEnterCount = 0;
  dropOverlay.classList.remove('show');
});

// 读取拖放的 .gsgi 文件并加载到 viewer
document.addEventListener('drop', (e) => {
  e.preventDefault();
  _dragEnterCount = 0;
  dropOverlay.classList.remove('show');
  if (!container.contains(e.target as Node)) return;
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  const name = file.name.replace(/\.gsgi$/i, '');
  const reader = new FileReader();
  reader.onload = (ev) => {
    viewer.loadFromJSON(ev.target!.result as string, name);
  };
  reader.readAsText(file);
});

// ─── 鼠标滚轮缩放（以光标为中心） ────────────────

// 以光标位置为中心进行滚轮缩放
container.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.3 : 1 / 1.3;
  viewer.zoomToCursor(e, factor);
}, { passive: false });

// ─── 启动时加载演示文件 ─────────────────────────

const demoModules = import.meta.glob('/default_demo/*.gsgi', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

// 启动时加载 /default_demo/ 目录下的所有 .gsgi 演示文件；若没有则创建空白文档
async function loadDemos() {
  const entries = Object.entries(demoModules);
  if (entries.length === 0) {
    viewer._newDocument();
    return;
  }
  for (const [path, jsonStr] of entries) {
    const name = path.replace(/\\/g, '/').split('/').pop()!.replace(/\.gsgi$/i, '');
    viewer.loadFromJSON(jsonStr, name);
  }
}

// 尝试恢复上次会话；若没有可恢复的内容则加载演示文件
viewer._restore().then(restored => { if (!restored) loadDemos(); });
