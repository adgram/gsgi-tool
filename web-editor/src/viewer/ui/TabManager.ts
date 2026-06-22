import { updateStatusBar } from '../util/ui';

interface DocTab {
  name: string;
  dirty: boolean;
  doc: any;
}

/** 文档标签页管理器 */
export class TabManager {
  viewer: any;
  _docTabs: DocTab[] = [];
  _activeTabIndex: number = -1;
  _tabCounter: number = 0;

  /** 初始化标签页管理器 */
  constructor(viewer: any) {
    this.viewer = viewer;
    this._init();
  }

  /** 初始化标签栏 */
  _init(): void {
    this.updateTabBar();
  }

  /** 新建文档标签页 */
  newTab(docName: string | null = null): void {
    const tab: DocTab = {
      name: docName || `\u6587\u6863 ${++this._tabCounter}`,
      dirty: false,
      doc: null
    };
    this._docTabs.push(tab);
    this._activateDoc(this._docTabs.length - 1);
    this.updateTabBar();
    this._updateTitle();
  }

  /** 激活指定索引的文档 */
  _activateDoc(index: number): void {
    if (index < 0 || index >= this._docTabs.length) return;

    if (this._activeTabIndex >= 0) {
      const currentTab = this._docTabs[this._activeTabIndex];
      currentTab.doc = this.viewer.doc;
      currentTab.dirty = this.viewer.doc?.dirty || false;
    }

    this._activeTabIndex = index;
    const tab = this._docTabs[index];

    if (tab.doc) {
      this.viewer.loadFromJSON(JSON.stringify(tab.doc), tab.name);
    } else {
      this.viewer._newDocument();
    }

    this.updateTabBar();
    this._updateTitle();
  }

  /** 关闭指定标签页 */
  closeTab(index: number): void {
    if (this._docTabs.length <= 1) return;

    const removedTab = this._docTabs.splice(index, 1)[0];
    const newIndex = Math.min(index, this._docTabs.length - 1);

    removedTab.doc = this.viewer.doc;

    this._activateDoc(newIndex);
    this.updateTabBar();
    this.viewer._persist({ skipDirty: true });
  }

  /** 更新标签栏DOM */
  updateTabBar(): void {
    const bar = document.getElementById('tab-bar');
    if (!bar) return;

    bar.innerHTML = '';

    for (let i = 0; i < this._docTabs.length; i++) {
      const tab = this._docTabs[i];
      const div = document.createElement('div');
      div.className = 'tab' + (i === this._activeTabIndex ? ' active' : '');
      div.dataset.index = String(i);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'tab-name';
      nameSpan.textContent = tab.dirty ? '\u25CF ' + tab.name : tab.name;
      div.appendChild(nameSpan);

      if (this._docTabs.length > 1) {
        const close = document.createElement('span');
        close.className = 'tab-close';
        close.textContent = '\u00D7';
        close.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          this.closeTab(i);
        });
        div.appendChild(close);
      }

      div.addEventListener('click', () => {
        if (i !== this._activeTabIndex) {
          this._saveCurrentTabState();
          this._activateDoc(i);
        }
      });

      bar.appendChild(div);
    }
  }

  /** 保存当前标签页状态 */
  _saveCurrentTabState(): void {
    if (this._activeTabIndex >= 0) {
      this._docTabs[this._activeTabIndex].doc = this.viewer.doc;
      this._docTabs[this._activeTabIndex].dirty = this.viewer.doc?.dirty || false;
    }
  }

  /** 更新页面标题 */
  _updateTitle(): void {
    const tab = this._docTabs[this._activeTabIndex];
    document.title = tab ? `GSGI \u2014 ${tab.name}${tab.dirty ? ' \u25CF' : ''}` : 'GSGI Viewer';
  }

  /** 标记当前文档已修改 */
  markDirty(dirty = true): void {
    if (this._activeTabIndex >= 0) {
      this._docTabs[this._activeTabIndex].dirty = dirty;
      this.updateTabBar();
      this._updateTitle();
    }
  }

  /** 获取当前激活的标签页 */
  get activeTab(): DocTab | undefined {
    return this._docTabs[this._activeTabIndex];
  }

  /** 获取标签页总数 */
  get tabCount(): number {
    return this._docTabs.length;
  }
}
