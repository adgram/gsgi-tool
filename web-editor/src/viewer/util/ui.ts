/**
 * UI 辅助工具
 * 提供全局模式对话框、Toast 消息提示、状态栏更新、数字格式化等通用 UI 函数。
 */

interface ModalOptions {
  title?: string;
  message?: string;
  input?: boolean;
  inputValue?: string;
  confirmText?: string;
  cancelText?: string | null;
  width?: number;
}

/** 显示模态对话框，返回 Promise 在确认时 resolve 输入值/true，取消时 resolve null */
export function showModal({ title, message, input, inputValue, confirmText, cancelText, width }: ModalOptions): Promise<string | boolean | null> {
  // 返回一个 Promise：用户确认时 resolve 输入值(true)，取消时 resolve null
  return new Promise((resolve) => {
    const existing = document.getElementById('gsgi-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gsgi-modal-overlay';

    const box = document.createElement('div');
    box.className = 'gsgi-modal-box';
    if (width) box.style.minWidth = width + 'px';

    if (title) {
      const t = document.createElement('div');
      t.className = 'gsgi-modal-title';
      t.textContent = title;
      box.appendChild(t);
    }

    if (message) {
      const m = document.createElement('div');
      m.className = 'gsgi-modal-message';
      m.textContent = message;
      box.appendChild(m);
    }

    let inputEl: HTMLInputElement | null = null;
    if (input) {
      inputEl = document.createElement('input');
      inputEl.className = 'gsgi-modal-input';
      inputEl.type = 'text';
      inputEl.value = inputValue || '';
      box.appendChild(inputEl);
      setTimeout(() => inputEl!.focus(), 50);
    }

    const btnRow = document.createElement('div');
    btnRow.className = 'gsgi-modal-buttons';

    const okText = confirmText || '确定';
    const cancelText2 = cancelText || '取消';

    if (cancelText2) {
      const cb = document.createElement('button');
      cb.className = 'gsgi-modal-btn-cancel';
      cb.textContent = cancelText2;
      cb.addEventListener('click', () => { overlay.remove(); resolve(null); });
      btnRow.appendChild(cb);
    }

    const ob = document.createElement('button');
    ob.className = 'gsgi-modal-btn-confirm';
    ob.textContent = okText;
    ob.addEventListener('click', () => {
      overlay.remove();
      resolve(inputEl ? inputEl.value : true);
    });
    btnRow.appendChild(ob);

    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { ob.click(); }
      if (e.key === 'Escape') { overlay.remove(); resolve(null); }
    };
    document.addEventListener('keydown', keyHandler);
    overlay.addEventListener('remove', () => document.removeEventListener('keydown', keyHandler), { once: true });
  });
}

/** 在屏幕底部中央显示一个临时消息，默认 2 秒后自动淡出消失 */
export function showToast(message: string, duration = 2000): void {
  const existing = document.getElementById('gsgi-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'gsgi-toast';
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/** 更新状态栏中的实体数、块数和图层数显示 */
export function updateStatusBar(viewer: Record<string, any> | null): void {
  if (!viewer) return;

  const entityCount = viewer.doc?.entities?.length || 0;
  const blockCount = viewer.doc?.blocks?.length || 0;
  const layerCount = viewer.doc?.layers?.length || 1;

  const infoEntities = document.getElementById('info-entities');
  const infoBlocks = document.getElementById('info-blocks');
  const infoLayers = document.getElementById('info-layers');

  if (infoEntities) infoEntities.textContent = `实体: ${entityCount}`;
  if (infoBlocks) infoBlocks.textContent = `块: ${blockCount}`;
  if (infoLayers) infoLayers.textContent = `图层: ${layerCount}`;
}

/** 将数字格式化为指定小数位数的浮点数 */
export function formatNumber(num: number, decimals = 1): number {
  return parseFloat(num.toFixed(decimals));
}
