/** 可撤销的命令接口 */
export interface UndoableCommand {
  undo(): void;
  redo(): void;
  type?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/** 撤销/重做管理器 */
export class UndoManager {
  private _stack: UndoableCommand[] = [];
  private _index: number = -1;
  private _maxSize: number = 50;

  /** 推入一个命令到撤销栈 */
  push(command: UndoableCommand): void {
    this._stack = this._stack.slice(0, this._index + 1);
    this._stack.push(command);
    if (this._stack.length > this._maxSize) this._stack.shift();
    this._index = this._stack.length - 1;
  }

  /** 执行撤销，返回被撤销的命令 */
  undo(): UndoableCommand | null {
    if (this._index < 0) return null;
    const cmd = this._stack[this._index];
    this._index--;
    return cmd;
  }

  /** 执行重做，返回被重做的命令 */
  redo(): UndoableCommand | null {
    if (this._index >= this._stack.length - 1) return null;
    this._index++;
    return this._stack[this._index];
  }

  /** 清空撤销栈 */
  clear(): void { this._stack = []; this._index = -1; }

  /** 是否可以撤销 */
  canUndo(): boolean { return this._index >= 0; }
  /** 是否可以重做 */
  canRedo(): boolean { return this._index < this._stack.length - 1; }

  /** 获取撤销栈 */
  get stack(): UndoableCommand[] { return this._stack; }
  /** 设置撤销栈 */
  set stack(v: UndoableCommand[]) { this._stack = v; }

  /** 获取当前索引 */
  get index(): number { return this._index; }
  /** 设置当前索引 */
  set index(v: number) { this._index = v; }
}

export default UndoManager;
