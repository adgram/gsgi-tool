/**
 * FileOps —— Viewer 的文件操作扩展模块
 *
 * 以原型扩展方式为 Viewer 添加文件相关能力：
 *   - 标签页管理（新建/切换/状态保持）
 *   - 文件操作（新建/打开/保存/另存为）
 *   - 撤消/重做栈的持久化与恢复
 *   - 会话状态持久化（localStorage + IndexedDB 文件句柄）
 */
import { GSGIDocument } from '../../core/barrel';
import { Renderer } from '../../render/renderer';
import {showModal } from '../util/ui';
import { applyDocumentData } from '../util/clipboard';
import UndoManager from '../commands/UndoManager';
import { Viewer } from '../Viewer';
import { DocTab } from '../../core/types';

// ======================== DocTab 类型扩充 ========================

declare module '../../core/types' {
  interface DocTab {
    id: number;
    doc: GSGIDocument | null;
    undoManager: UndoManager;
    selectedIds: string[];
    fileHandle: FileSystemFileHandle | null;
  }
}

// ======================== Viewer 类型扩充声明 ========================

declare module '../Viewer' {
  interface Viewer {
    _addTab(name: string, data: any, opts?: any): void;
    _fileInput: HTMLInputElement;
    _activateDoc(index: number): void;
    _saveCurrentTabState(): void;
    loadFromJSON(jsonStr: string, name: string): void;
    loadFromJSONObject(obj: any): void;
    _newDocument(): void;
    _saveCurrentFile(): Promise<void>;
    _downloadJSON(blob: Blob, name: string): void;
    _saveAsFile(): Promise<void>;
    _openFile(): Promise<void>;
    _openFileFallback(): void;
    loadFile(data: any, opts?: any): void;
    _persist(opts?: any): void;
    _rebuildCmd(cmd: any): any;
    _rebuildUndoStack(stack: any[]): void;
    _restore(): Promise<boolean>;
    _openHandleDB(): Promise<IDBDatabase>;
    _persistHandles(): Promise<void>;
    _restoreHandles(): Promise<void>;
    _markDirty(): void;
  }
}

// ======================== 标签页管理 ========================

/**
 * 添加一个新标签页
 * @param name 标签名
 * @param data 文档数据（JSON 对象）
 * @param opts.preserveUndo 是否保留当前撤消栈
 * @param opts.fileHandle 关联的 FileSystemFileHandle
 * @param opts.silent 是否跳过自动持久化
 */
Viewer.prototype._addTab = function(this: Viewer, name: string, data: any, opts: any = {}): void {
  this._saveCurrentTabState();
  const doc = new GSGIDocument(data);
  doc.properties = doc.properties || {};
  if (!doc.properties.currentLayer) doc.properties.currentLayer = '0';
  if (!doc.layers.find(l => l.id === '0')) {
    doc.layers.unshift({ id: '0', color: 7, visible: true, frozen: false, locked: false, linetype: 'Continuous', printable: true });
  }
  const tab = {
    id: this._tabCounter++,
    name: name,
    doc: doc,
    data: null,
    undoManager: opts.preserveUndo ? this._undoManager : new UndoManager(),
    selectedIds: [],
    dirty: false,
    fileHandle: opts.fileHandle || null
  };
  this._docTabs.push(tab);
  this._activateDoc(this._docTabs.length - 1);
  if (!opts.silent) this._persist({ skipDirty: true });
};

/** 激活指定索引的标签页，切换文档、撤消栈、选择集，并重新渲染 */
Viewer.prototype._activateDoc = function(this: Viewer, index: number): void {
  const tab = this._docTabs[index];
  if (!tab) return;
  this._activeTabIndex = index;
  this.doc = tab.doc;
  if (!this.doc) return;
  this._undoManager = tab.undoManager;
  this.selectedIds = new Set(tab.selectedIds || []);
  this.renderer = new Renderer(this.project, this.doc);
  this.renderer.render();
  this._updateGridDisplay();
  this._removeGrips();
  this.updateUI();
  this.zoomExtents();
  for (const id of this.selectedIds) this._setEntitySelected(id, true);
  this._switchToLayerView();
  this._updateTabBar();
  this._updateTitle();
};

/** 将当前标签的文档、撤消栈、选择集保存到 tab 对象中 */
Viewer.prototype._saveCurrentTabState = function(this: Viewer): void {
  if (this._activeTabIndex < 0 || !this._docTabs[this._activeTabIndex]) return;
  this._docTabs[this._activeTabIndex].doc = this.doc;
  this._docTabs[this._activeTabIndex].undoManager = this._undoManager;
  this._docTabs[this._activeTabIndex].selectedIds = [...this.selectedIds];
};

// ======================== 文件操作 ========================

/** 从 JSON 字符串加载文档并新建标签 */
Viewer.prototype.loadFromJSON = function(this: Viewer, jsonStr: string, name: string): void {
  try {
    const data = JSON.parse(jsonStr);
    this._addTab(name || '未命名', data);
  } catch (e: any) {
    showModal({ title: '解析错误', message: e.message, confirmText: '确定', cancelText: null, width: 320 });
  }
};

/** 从 JSON 对象直接加载文档并新建标签 */
Viewer.prototype.loadFromJSONObject = function(this: Viewer, obj: any): void {
  this._addTab('未命名', obj);
};

/** 创建空白新文档 */
Viewer.prototype._newDocument = function(this: Viewer): void {
  const empty = { gsgi: '1.0', tags: [], summary: '', properties: {}, layers: [], entities: [], blocks: [], groups: [], descriptions: [] };
  this._addTab(`未命名-${this._tabCounter + 1}`, empty);
};

/**
 * 保存当前文件
 * 优先使用 File System Access API 写入原文件，否则触发下载
 */
Viewer.prototype._saveCurrentFile = async function(this: Viewer): Promise<void> {
  if (!this.doc) return;
  const tab = this._docTabs[this._activeTabIndex];
  if (!tab) return;
  const json = JSON.stringify(this.doc.toJSON(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  if (tab.fileHandle) {
    try {
      const writable = await tab.fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (_) {
      this._downloadJSON(blob, tab.name);
    }
  } else if (typeof (window as any).showSaveFilePicker === 'function') {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: tab.name.endsWith('.gsgi') ? tab.name : tab.name + '.gsgi',
        types: [{ description: 'GSGI Document', accept: { 'application/json': ['.gsgi'] } }]
      });
      tab.fileHandle = handle;
      tab.name = handle.name.replace(/\.gsgi$/i, '');
      this._updateTabBar();
      this._updateTitle();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (_) { return; }
  } else {
    this._downloadJSON(blob, tab.name);
  }
  tab.dirty = false;
  if (this._activeTabIndex >= 0 && this._activeTabIndex < this._docTabs.length) {
    if (this._docTabs[this._activeTabIndex] !== tab) {
      for (let i = 0; i < this._docTabs.length; i++) {
        if (this._docTabs[i] === tab) {
          this._activateDoc(i);
          break;
        }
      }
    }
  }
  this._updateTabBar();
  this._updateTitle();
  this._persist();
};

/** 通过创建 <a> 元素触发文件下载 */
Viewer.prototype._downloadJSON = function(this: Viewer, blob: Blob, name: string): void {
  const filename = name.endsWith('.gsgi') ? name : name + '.gsgi';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** 另存为：弹出文件选择器选择新路径后保存 */
Viewer.prototype._saveAsFile = async function(this: Viewer): Promise<void> {
  if (!this.doc) return;
  const tab = this._docTabs[this._activeTabIndex];
  if (!tab) return;
  if (typeof (window as any).showSaveFilePicker !== 'function') {
    this._saveCurrentFile();
    return;
  }
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: tab.name.endsWith('.gsgi') ? tab.name : tab.name + '.gsgi',
      types: [{ description: 'GSGI Document', accept: { 'application/json': ['.gsgi'] } }]
    });
    tab.fileHandle = handle;
    tab.name = handle.name.replace(/\.gsgi$/i, '');
    this._updateTabBar();
    this._updateTitle();
    await this._saveCurrentFile();
  } catch (e) { console.warn('[FileOps] _saveNewFile error:', e); }
};

/**
 * 打开文件
 * 优先使用 File System Access API，若浏览器不支持则回退到 <input> 方式
 */
Viewer.prototype._openFile = async function(this: Viewer): Promise<void> {
  if (typeof (window as any).showOpenFilePicker === 'function') {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        multiple: false,
        types: [{ description: 'GSGI Document', accept: { 'application/json': ['.gsgi', '.json'] } }]
      });
      for (let i = 0; i < this._docTabs.length; i++) {
        if (this._docTabs[i].fileHandle && await handle.isSameEntry(this._docTabs[i].fileHandle)) {
          if (i !== this._activeTabIndex) {
            this._saveCurrentTabState();
            this._activateDoc(i);
          }
          return;
        }
      }
      const file = await handle.getFile();
      const text = await file.text();
      const name = file.name.replace(/\.gsgi$/i, '').replace(/\.json$/i, '');
      this._addTab(name, JSON.parse(text), { fileHandle: handle });
      return;
    } catch (_) { return; }
  }
  this._openFileFallback();
};

/** 回退方案：使用隐藏 <input type="file"> 选择文件 */
Viewer.prototype._openFileFallback = function(this: Viewer): void {
  if (!this._fileInput) {
    this._fileInput = document.createElement('input');
    this._fileInput.type = 'file';
    this._fileInput.accept = '.gsgi,.json';
    this._fileInput.style.display = 'none';
    this._fileInput.addEventListener('change', async (e: any) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const name = file.name.replace(/\.gsgi$/i, '').replace(/\.json$/i, '');
        this._addTab(name, JSON.parse(text));
      } catch (ex: any) {
        showModal({ title: '解析错误', message: ex.message, confirmText: '确定', cancelText: null, width: 320 });
      }
    });
    document.body.appendChild(this._fileInput);
  }
  this._fileInput.value = '';
  this._fileInput.click();
};

/** 将数据加载到当前文档（替换当前标签内容），可选保留视图状态 */
Viewer.prototype.loadFile = function(this: Viewer, data: any, opts: any = {}): void {
  this._saveCurrentTabState();
  const doc = new GSGIDocument(data);
  doc.properties = doc.properties || {};
  if (!doc.properties.currentLayer) doc.properties.currentLayer = '0';
  if (!doc.layers.find(l => l.id === '0')) {
    doc.layers.unshift({ id: '0', color: 7, visible: true, frozen: false, locked: false, linetype: 'Continuous', printable: true });
  }
  this.doc = doc;
  if (this._activeTabIndex >= 0 && this._docTabs[this._activeTabIndex]) {
    this._docTabs[this._activeTabIndex].doc = doc;
  }
  this.renderer = new Renderer(this.project, this.doc);
  this.renderer.render();
  this._updateGridDisplay();
  this._persist();
  if (!opts.preserveSelection) this.selectedIds = new Set();
  this._removeGrips();
  this.updateUI();
  if (opts.preserveView && opts._viewState) {
    this.view.zoom = opts._viewState.zoom;
    this.view.center = opts._viewState.center;
    this._updateScreenFixedVisuals();
    this.view.update();
  } else {
    this.zoomExtents();
  }
  for (const id of this.selectedIds) this._setEntitySelected(id, true);
  this._switchToLayerView();
};

// ======================== 会话持久化 ========================

/**
 * 持久化当前会话状态到 localStorage
 * 包含标签页列表、撤消栈、选择集、绘图工具等
 */
Viewer.prototype._persist = function(this: Viewer, opts: any = {}): void {
  if (!opts.skipDirty) this._markDirty();
  this._saveCurrentTabState();
  try {
    const state = {
      activeTabIndex: this._activeTabIndex,
      drawTool: this._drawTool,
      cmdHistory: this._cmdHistory?.slice(-200) || [],
      tabs: this._docTabs.map((t: any) => ({
        name: t.name, data: t.doc.toJSON(),
        undoStack: t.undoManager.stack.map((cmd: any) => ({
          type: cmd.type, entityId: cmd.entityId,
          before: cmd.before, after: cmd.after
        })),
        undoIndex: t.undoManager.index,
        selectedIds: [...this._selectionManager.selectedIds],
        dirty: t.dirty || false
      }))
    };
    const json = JSON.stringify(state);
    localStorage.setItem('gsgi_tabs', json);
  } catch (e) { console.error('[persist] failed:', e); }
  this._persistHandles();
};

/** 重建单个撤消/重做命令，注入 undo/redo 闭包 */
Viewer.prototype._rebuildCmd = function(this: Viewer, cmd: any): any {
  if (cmd && cmd.type === 'modify-document' && typeof cmd.undo !== 'function') {
    const self = this;
    const before = cmd.before, after = cmd.after;
    cmd.undo = function () { applyDocumentData(self, before); };
    cmd.redo = function () { applyDocumentData(self, after); };
  }
  return cmd;
};

/** 批量重建撤消栈中的命令 */
Viewer.prototype._rebuildUndoStack = function(this: Viewer, stack: any[]): void {
  if (!Array.isArray(stack)) return;
  for (let i = 0; i < stack.length; i++) {
    this._rebuildCmd(stack[i]);
  }
};

/** 从 localStorage 恢复之前的会话（标签页、撤消栈、选择集等），失败返回 false */
Viewer.prototype._restore = async function(this: Viewer): Promise<boolean> {
  try {
    const raw = localStorage.getItem('gsgi_tabs');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const all = Array.isArray(parsed) ? parsed : parsed.tabs;
    if (!Array.isArray(all) || all.length === 0) return false;
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      try {
        const opts = { name: t.name, silent: true, preserveUndo: false };
        this._addTab(t.name, t.data, opts);
        const idx = this._docTabs.length - 1;
        const stack = t.undoStack || t.undoManager?.stack;
        if (Array.isArray(stack)) {
          this._rebuildUndoStack(stack);
          this._docTabs[idx].undoManager.stack = stack;
          if (t.undoIndex !== undefined) this._docTabs[idx].undoManager.index = t.undoIndex;
        }
        if (t.selectedIds) this._docTabs[idx].selectedIds = t.selectedIds;
        if (t.dirty) this._docTabs[idx].dirty = t.dirty;
      } catch (e) {
        console.error('[restore] tab', i, 'failed:', e);
      }
    }
    if (Array.isArray(parsed.cmdHistory)) {
      this._cmdHistory = parsed.cmdHistory;
      this._cmdHistoryIndex = this._cmdHistory.length;
      this._populateHistoryPanel();
    }

    const restoreIndex = parsed.activeTabIndex !== undefined ? parsed.activeTabIndex : 0;
    this._activateDoc(Math.min(restoreIndex, this._docTabs.length - 1));
    this._restoreHandles();
    if (parsed.drawTool && parsed.drawTool !== 'select') {
      this._setDrawTool(parsed.drawTool);
    }
    return true;
  } catch (e) { console.error('[restore] failed:', e); return false; }
};

// ======================== 文件句柄持久化（IndexedDB） ========================

/** 打开 IndexedDB "gsgi_handles" 数据库 */
Viewer.prototype._openHandleDB = function(this: Viewer): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gsgi_handles', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

/** 将当前标签页的 FileSystemFileHandle 持久化到 IndexedDB */
Viewer.prototype._persistHandles = async function(this: Viewer): Promise<void> {
  try {
    const db = await this._openHandleDB();
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    store.clear();
    for (let i = 0; i < this._docTabs.length; i++) {
      const tab = this._docTabs[i];
      if (tab.fileHandle) {
        store.put({ id: `tab_${i}`, tabIndex: i, name: tab.name, handle: tab.fileHandle });
      }
    }
    await (tx as any).done;
    db.close();
  } catch (e) { console.warn('[FileOps] _saveHandles error:', e); }
};

/** 从 IndexedDB 恢复标签页关联的 FileSystemFileHandle */
Viewer.prototype._restoreHandles = async function(this: Viewer): Promise<void> {
  try {
    const db = await this._openHandleDB();
    const tx = db.transaction('handles', 'readonly');
    const store = tx.objectStore('handles');
    const all = await new Promise<any[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    for (const entry of all) {
      if (entry.tabIndex === undefined || !this._docTabs[entry.tabIndex]) continue;
      if (this._docTabs[entry.tabIndex].name !== entry.name) continue;
      try {
        if (await entry.handle.queryPermission({ mode: 'readwrite' }) !== 'granted') continue;
        this._docTabs[entry.tabIndex].fileHandle = entry.handle;
      } catch (e) { console.warn('[FileOps] _restoreHandles: permission check failed for tab', entry.tabIndex, e); }
    }
  } catch (e) { console.warn('[FileOps] _restoreHandles error:', e); }
};

// ======================== 脏标记 ========================

/** 标记当前标签为已修改状态，更新标签栏和标题 */
Viewer.prototype._markDirty = function(this: Viewer): void {
  const tab = this._docTabs[this._activeTabIndex];
  if (!tab || tab.dirty) return;
  tab.dirty = true;
  this._updateTabBar();
  this._updateTitle();
};

export {};
