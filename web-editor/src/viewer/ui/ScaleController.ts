/** 比例控制器 */
export class ScaleController {
  viewer: any;
  _scaleSelect: HTMLSelectElement | null = null;
  _scaleCustom: HTMLInputElement | null = null;

  /** 初始化比例控制器 */
  constructor(viewer: any) {
    this.viewer = viewer;
    this._init();
  }

  /** 初始化比例控件 */
  _init(): void {
    this._scaleSelect = document.getElementById('scale-select') as HTMLSelectElement | null;
    this._scaleCustom = document.getElementById('scale-custom') as HTMLInputElement | null;

    if (!this._scaleSelect) return;

    this._setupScaleChange();
    this._setupCustomInput();
    this._updateScaleDisplay();
  }

  /** 设置比例切换事件 */
  _setupScaleChange(): void {
    this._scaleSelect!.addEventListener('change', () => {
      const val = this._scaleSelect!.value;
      if (val === 'custom') {
        if (this._scaleCustom) {
          this._scaleCustom.style.display = '';
          this._scaleCustom.focus();
        }
        return;
      }
      if (this._scaleCustom) this._scaleCustom.style.display = 'none';
      this.applyScale(parseFloat(val));
    });
  }

  /** 设置自定义比例输入事件 */
  _setupCustomInput(): void {
    this._scaleCustom!.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const val = parseFloat(this._scaleCustom!.value);
        if (!isNaN(val) && val > 0) {
          this.applyScale(val);
        }
        this._scaleCustom!.style.display = 'none';
        this._scaleSelect!.value = 'custom';
      }
      if (e.key === 'Escape') {
        this._scaleCustom!.style.display = 'none';
        this._updateScaleDisplay();
      }
    });
  }

  /** 应用指定比例 */
  applyScale(scaleValue: number): void {
    this.viewer._applyScale(scaleValue);
  }

  /** 更新比例显示 */
  _updateScaleDisplay(): void {
    if (!this._scaleSelect || !this.viewer.doc) return;

    const s = this.viewer.doc.properties?.scale || 1;
    const presets = [...(this._scaleSelect.options as unknown as HTMLOptionElement[])]
      .filter(o => o.value !== 'custom')
      .map(o => ({ val: parseFloat(o.value), label: o.text }));

    let closest = presets[0];
    let minDiff = Infinity;

    for (const p of presets) {
      const d = Math.abs(p.val - s);
      if (d < minDiff) { minDiff = d; closest = p; }
    }

    if (minDiff <= 0.02) {
      this._scaleSelect.value = String(closest.val);
      if (this._scaleCustom) this._scaleCustom.style.display = 'none';
    } else {
      this._scaleSelect.value = 'custom';
      if (this._scaleCustom) {
        this._scaleCustom.style.display = '';
        this._scaleCustom.value = s.toFixed(2);
      }
    }
  }
}
