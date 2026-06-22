/** 工具栏管理器 */
export class Toolbar {
  viewer: any;

  /** 初始化工具栏 */
  constructor(viewer: any) {
    this.viewer = viewer;
    this._init();
  }

  /** 初始化工具栏按钮 */
  _init(): void {
    this._setupToolButtons();
    this._setupActionButtons();
  }

  /** 设置绘图工具按钮事件 */
  _setupToolButtons(): void {
    const toolButtons = document.querySelectorAll('.draw-btn');
    toolButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = (btn as HTMLElement).dataset.tool;
        this.viewer._setDrawTool(tool);
      });
    });
  }

  /** 设置操作按钮事件 */
  _setupActionButtons(): void {
    document.getElementById('btn-new')?.addEventListener('click', () => this.viewer._newDocument());
    document.getElementById('btn-open')?.addEventListener('click', () => this.viewer._openFile());
    document.getElementById('btn-save')?.addEventListener('click', () => this.viewer._saveCurrentFile());
    document.getElementById('btn-saveas')?.addEventListener('click', () => this.viewer._saveAsFile());
    document.getElementById('btn-undo')?.addEventListener('click', () => this.viewer.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.viewer.redo());
    document.getElementById('btn-zoom-ext')?.addEventListener('click', () => this.viewer.zoomExtents());
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.viewer.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.viewer.zoomOut());
  }

  /** 更新工具按钮激活状态 */
  updateToolButtons(): void {
    const tool = this.viewer._drawTool;
    document.querySelectorAll('.draw-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === tool);
    });
  }

  /** 设置当前激活工具 */
  setActiveTool(tool: string): void {
    this.viewer._setDrawTool(tool);
  }
}
