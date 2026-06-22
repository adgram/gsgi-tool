import paper from 'paper';

/** 捕捉与网格控制器 */
export class SnapGridController {
  viewer: any;
  _snapEnabled: boolean = true;
  _gridEnabled: boolean = false;
  _osnapEnabled: boolean = true;
  _nearestEnabled: boolean = false;
  _gridItems: any[] = [];
  _snapIndicator: any = null;

  /** 初始化捕捉与网格控制器 */
  constructor(viewer: any) {
    this.viewer = viewer;
    this._init();
  }

  /** 初始化按钮与状态 */
  _init(): void {
    this._setupButtons();
    this._updateState();
  }

  /** 设置捕捉/网格切换按钮 */
  _setupButtons(): void {
    const btnSnap = document.getElementById('btn-snap');
    const btnGrid = document.getElementById('btn-grid');
    const btnOsnap = document.getElementById('btn-osnap');
    const btnNearest = document.getElementById('btn-nearest');

    if (btnSnap) {
      btnSnap.addEventListener('click', () => {
        this._snapEnabled = !this._snapEnabled;
        btnSnap.classList.toggle('active', this._snapEnabled);
        localStorage.setItem('gsgi_snap', this._snapEnabled ? '1' : '0');
      });
    }

    if (btnOsnap) {
      btnOsnap.addEventListener('click', () => {
        this._osnapEnabled = !this._osnapEnabled;
        btnOsnap.classList.toggle('active', this._osnapEnabled);
        localStorage.setItem('gsgi_osnap', this._osnapEnabled ? '1' : '0');
      });
    }

    if (btnGrid) {
      btnGrid.addEventListener('click', () => {
        this._gridEnabled = !this._gridEnabled;
        btnGrid.classList.toggle('active', this._gridEnabled);
        localStorage.setItem('gsgi_grid', this._gridEnabled ? '1' : '0');
        this.updateGridDisplay();
      });
    }

    if (btnNearest) {
      btnNearest.addEventListener('click', () => {
        this._nearestEnabled = !this._nearestEnabled;
        btnNearest.classList.toggle('active', this._nearestEnabled);
        localStorage.setItem('gsgi_nearest', this._nearestEnabled ? '1' : '0');
      });
    }
  }

  /** 从本地存储恢复状态 */
  _updateState(): void {
    this._snapEnabled = localStorage.getItem('gsgi_snap') !== '0';
    this._gridEnabled = localStorage.getItem('gsgi_grid') === '1';
    this._osnapEnabled = localStorage.getItem('gsgi_osnap') === '1';
    this._nearestEnabled = localStorage.getItem('gsgi_nearest') === '1';

    const btnSnap = document.getElementById('btn-snap');
    const btnGrid = document.getElementById('btn-grid');
    const btnOsnap = document.getElementById('btn-osnap');
    const btnNearest = document.getElementById('btn-nearest');

    if (btnSnap) btnSnap.classList.toggle('active', this._snapEnabled);
    if (btnGrid) btnGrid.classList.toggle('active', this._gridEnabled);
    if (btnOsnap) btnOsnap.classList.toggle('active', this._osnapEnabled);
    if (btnNearest) btnNearest.classList.toggle('active', this._nearestEnabled);
  }

  /** 是否启用栅格捕捉 */
  get snapEnabled(): boolean { return this._snapEnabled; }
  /** 是否启用对象捕捉 */
  get osnapEnabled(): boolean { return this._osnapEnabled; }
  /** 是否启用最近点捕捉 */
  get nearestEnabled(): boolean { return this._nearestEnabled; }

  /** 更新捕捉指示器 */
  updateSnapIndicator(pt: { x: number; y: number }): void {
    if (this._snapIndicator) {
      this._snapIndicator.remove();
      this._snapIndicator = null;
    }

    if (!this._snapEnabled && !this._osnapEnabled && !this._nearestEnabled) return;
    if (!this.viewer._drawTool || this.viewer._drawTool === 'select' || !this.viewer.project) return;

    const snapPt = this.viewer._snapPoint(pt);

    if (Math.abs(snapPt.x - pt.x) < 0.1 && Math.abs(snapPt.y - pt.y) < 0.1) return;

    const size = 6 / this.viewer.view.zoom;
    this._snapIndicator = new paper.Path.Circle({
      center: [snapPt.x, snapPt.y],
      radius: size,
      strokeColor: '#FF6600',
      strokeWidth: 1.5 / this.viewer.view.zoom,
      fillColor: new paper.Color(1, 0.4, 0, 0.2),
      insert: false
    });

    this.viewer._getWorldLayer().addChild(this._snapIndicator);
  }

  /** 更新网格显示 */
  updateGridDisplay(): void {
    if (!this.viewer.project) return;
    for (const item of this._gridItems) item.remove();
    this._gridItems = [];

    if (!this._gridEnabled || !this.viewer.doc) {
      this.viewer._getWorldLayer().activate();
      return;
    }

    let gridLayer = this.viewer.project.layers.find((l: any) => l.name === '__grid__');
    if (!gridLayer) {
      gridLayer = new paper.Layer({ name: '__grid__', insert: false });
      this.viewer.project.insertLayer(0, gridLayer);
    }

    gridLayer.applyMatrix = true;
    gridLayer.matrix = new paper.Matrix();

    const scale = this.viewer.doc.properties?.scale || 1;
    const g = scale;

    if (g * this.viewer.view.zoom < 20) {
      this.viewer._getWorldLayer().activate();
      return;
    }

    const viewBounds = this.viewer.view.bounds;
    const startX = Math.floor(viewBounds.left / g) * g;
    const startY = Math.floor(viewBounds.top / g) * g;
    const endX = Math.ceil(viewBounds.right / g) * g;
    const endY = Math.ceil(viewBounds.bottom / g) * g;
    const color = new paper.Color(1, 1, 1, 0.15);

    for (let x = startX; x <= endX; x += g) {
      const line = new paper.Path.Line({
        from: [x, startY],
        to: [x, endY],
        strokeColor: color,
        strokeWidth: 1,
        strokeScaling: false,
        insert: false
      });
      gridLayer.addChild(line);
      line.data.grid = true;
      this._gridItems.push(line);
    }

    for (let y = startY; y <= endY; y += g) {
      const line = new paper.Path.Line({
        from: [startX, y],
        to: [endX, y],
        strokeColor: color,
        strokeWidth: 1,
        strokeScaling: false,
        insert: false
      });
      gridLayer.addChild(line);
      line.data.grid = true;
      this._gridItems.push(line);
    }

    this.viewer._getWorldLayer().activate();
  }

  /** 清理网格与捕捉指示器 */
  cleanup(): void {
    for (const item of this._gridItems) item.remove();
    this._gridItems = [];
    if (this._snapIndicator) {
      this._snapIndicator.remove();
      this._snapIndicator = null;
    }
  }
}
