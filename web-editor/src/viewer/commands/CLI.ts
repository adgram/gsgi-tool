/**
 * CLI - 命令行接口
 *
 * 提供注册式命令系统，支持子命令、参数解析、自动帮助。
 * 通过 Viewer.prototype._processCommand 入口集成到命令栏。
 * 支持：文档查询、编辑、视图控制、图层管理、文件操作、实体命令。
 */

import { createEntity, ENTITY_TYPES, nextId } from '../../core/barrel';
import { getAllCLICommands } from '../../core/barrel';
import { showModal } from '../util/ui';
import type { Viewer } from '../Viewer';
import type { Entity } from '../../core/entity';

interface HelpInfo { short: string; usage?: string; desc?: string; }
interface CommandEntry { handler: (viewer: Viewer, args: string[]) => void; help: HelpInfo; }

// ─── 命令注册表 ─────────────────────────────────────
const commands: Record<string, CommandEntry> = {};

// 注册一个命令到命令表
function def(name: string, handler: (viewer: Viewer, args: string[]) => void, help: HelpInfo): void {
  commands[name] = { handler, help };
}

// ─── 参数解析 ────────────────────────────────────────
interface ParsedArgs { cmd: string; args: string[]; raw: string; }

function parseArgs(str: string): ParsedArgs {
  const parts = str.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  return { cmd, args, raw: str };
}

// ─── 实体查询辅助 ───────────────────────────────────
function findEntity(viewer: Viewer, idOrIdx: string): Entity | null {
  const doc = viewer.doc;
  if (!doc) return null;
  const n = parseInt(idOrIdx, 10);
  if (!isNaN(n) && n >= 1 && n <= doc.entities.length) {
    return doc.entities[n - 1];
  }
  return doc.getEntityById(idOrIdx) || null;
}

function listEntities(doc: { entities: Entity[] }, filterType?: string | null): Entity[] {
  return doc.entities.filter(e => !filterType || e.type === filterType);
}

function formatEntity(e: Entity, idx: number): string {
  const pos = _getEntityPosition(e);
  const posStr = pos ? ` (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})` : '';
  return `#${idx} [${e.id}] ${e.type}${posStr}`;
}

function _getEntityPosition(entity: Entity): { x: number; y: number } | null {
  const pt = (entity as any).point || (entity as any).position_ref;
  if (Array.isArray(pt) && pt.length >= 2) return { x: pt[0], y: pt[1] };
  if (pt && typeof pt.x === 'number') return pt as { x: number; y: number };
  return null;
}

// ═════════════════════════════════════════════════════
// 命令实现 — 每个 def(...) 注册一条命令
// ═════════════════════════════════════════════════════

def('help', (viewer, args) => {
  if (args.length === 0) {
    const names = Object.keys(commands).sort();
    const lines = ['可用命令：（输入 help <命令名> 查看详情）'];
    for (const name of names) {
      const h = commands[name].help;
      lines.push(`  ${name.padEnd(14)} ${h ? h.short || '' : ''}`);
    }
    viewer._setPrompt(lines.join('\n'));
  } else {
    const cmd = commands[args[0]];
    if (!cmd) { viewer._setPrompt(`未知命令: ${args[0]}`); return; }
    const h = cmd.help;
    const lines = [`${args[0]} - ${h.short || ''}`];
    if (h.usage) lines.push(`用法: ${h.usage}`);
    if (h.desc) lines.push(h.desc);
    viewer._setPrompt(lines.join('\n'));
  }
}, { short: '显示帮助信息', usage: 'help [命令名]', desc: '不带参数时列出所有命令，指定命令名显示详细帮助。' });

def('echo', (viewer, args) => {
  viewer._setPrompt(args.join(' ') || '(空)');
}, { short: '回显文本', usage: 'echo <文字...>', desc: '将文字显示在提示栏，用于测试。' });

// ─── 文档查询命令 ──────────────────────────────────

def('ls', (viewer, args) => {
  if (!viewer.doc) { viewer._setPrompt('没有打开的文档'); return; }
  const filter = args[0] || null;
  const all = listEntities(viewer.doc, filter);
  if (all.length === 0) { viewer._setPrompt(filter ? `没有 ${filter} 类型的实体` : '文档中没有实体'); return; }
  const lines = all.map((e, i) => formatEntity(e, i + 1));
  viewer._setPrompt(lines.join('\n'));
}, { short: '列出实体', usage: 'ls [类型]', desc: '列出所有实体，可选按类型过滤。例如: ls line, ls circle' });

def('count', (viewer, args) => {
  if (!viewer.doc) { viewer._setPrompt('没有打开的文档'); return; }
  const filter = args[0] || null;
  if (filter) {
    const n = listEntities(viewer.doc, filter).length;
    viewer._setPrompt(`${filter}: ${n} 个`);
  } else {
    const counts: Record<string, number> = {};
    for (const e of viewer.doc.entities) {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    const lines = Object.entries(counts).map(([t, n]) => `${t}: ${n}`);
    viewer._setPrompt(lines.join(' | ') + ` | 总计: ${viewer.doc.entities.length}`);
  }
}, { short: '统计实体数量', usage: 'count [类型]', desc: '按类型统计实体数量，不指定类型则显示全部统计。' });

def('info', (viewer, args) => {
  if (!viewer.doc) { viewer._setPrompt('没有打开的文档'); return; }
  let entities: Entity[] = [];
  if (args.length >= 1) {
    const entity = findEntity(viewer, args[0]);
    if (!entity) { viewer._setPrompt(`未找到实体: ${args[0]}`); return; }
    entities = [entity];
  } else {
    entities = viewer._selectionManager?.selectedIds ? [...viewer._selectionManager?.selectedIds].map(id => viewer.doc!.getEntityById(id)).filter(Boolean) as Entity[] : [];
    if (entities.length === 0) { viewer._setPrompt('用法: info <ID|编号>（或先选中实体后直接执行 info）'); return; }
  }
  const lines: string[] = [];
  for (const entity of entities) {
    const props = entity.getProperties();
    lines.push(`[${entity.id}] ${entity.type}`);
    for (const p of props) {
      const val = typeof p.value === 'number' ? p.value.toFixed(3) : String(p.value);
      lines.push(`  ${p.label}=${val}`);
    }
  }
  viewer._setPrompt(lines.join('\n'));
}, { short: '显示实体属性', usage: 'info [ID|编号]', desc: '显示实体的所有属性。指定 ID/编号时显示该实体，不指定时显示当前选中的所有实体。' });

def('select', (viewer, args) => {
  if (args.length < 1) { viewer._setPrompt('用法: select <ID|编号>'); return; }
  const entity = findEntity(viewer, args[0]);
  if (!entity) { viewer._setPrompt(`未找到实体: ${args[0]}`); return; }
  viewer.selectEntity(entity.id);
  viewer._setPrompt(`已选择 [${entity.id}] ${entity.type}`);
}, { short: '选择实体', usage: 'select <ID|编号>', desc: '按 ID 或序号选择实体。例如: select L1 或 select 3' });

def('deselect', (viewer, args) => {
  if (args.length >= 1) {
    const entity = findEntity(viewer, args[0]);
    if (!entity) { viewer._setPrompt(`未找到实体: ${args[0]}`); return; }
    viewer._selectionManager?.selectedIds.delete(entity.id);
    viewer._setEntitySelected(entity.id, false);
    viewer._updateLayerPanel();
    viewer.view.update();
    viewer._setPrompt(`已取消选择 [${entity.id}]`);
  } else {
    viewer.deselectAll();
    viewer._setPrompt('已取消选择全部');
  }
}, { short: '取消选择', usage: 'deselect [ID|编号]', desc: '取消选择指定实体，不指定则取消全部选择。' });

// ─── 文档编辑命令 ──────────────────────────────────

def('set', (viewer, args) => {
  if (args.length < 2) { viewer._setPrompt('用法: set <ID|编号> <属性名> <值>（或选中实体后直接 set <属性名> <值>）'); return; }
  let entities: Entity[] = [], key: string, value: string;
  if (args.length >= 3) {
    const entity = findEntity(viewer, args[0]);
    if (!entity) { viewer._setPrompt(`未找到实体: ${args[0]}`); return; }
    entities = [entity];
    key = args[1]; value = args.slice(2).join(' ');
  } else {
    entities = viewer._selectionManager?.selectedIds ? [...viewer._selectionManager?.selectedIds].map(id => viewer.doc?.getEntityById(id)).filter(Boolean) as Entity[] : [];
    if (entities.length === 0) { viewer._setPrompt('用法: set <ID|编号> <属性名> <值>（或先选中实体）'); return; }
    key = args[0]; value = args.slice(1).join(' ');
  }
  const before = viewer._saveSnapshot();
  let okCount = 0;
  for (const entity of entities) {
    if (entity.setProperty(key, value, viewer.renderer?.resolver)) okCount++;
  }
  if (okCount === 0) { viewer._setPrompt(`不支持属性: ${key}`); return; }
  viewer._finishDraw(entities[0], before, `已为 ${okCount} 个实体设置 ${key}=${value}`);
}, { short: '设置实体属性', usage: 'set [ID|编号] <属性名> <值>', desc: '设置实体的属性值。指定 ID/编号时设置该实体，不指定时设置所有选中的实体。' });

def('delete', (viewer, args) => {
  if (!viewer.doc) { viewer._setPrompt('没有打开的文档'); return; }
  const before = viewer._saveSnapshot();
  if (args.length >= 1) {
    const entity = findEntity(viewer, args[0]);
    if (!entity) { viewer._setPrompt(`未找到实体: ${args[0]}`); return; }
    viewer.doc.entities = viewer.doc.entities.filter(e => e.id !== entity.id);
    viewer._selectionManager?.selectedIds.delete(entity.id);
    viewer._finishDraw(entity, before, `已删除 [${entity.id}]`);
  } else {
    const ids = viewer._selectionManager?.selectedIds ? [...viewer._selectionManager?.selectedIds] : [];
    if (ids.length === 0) { viewer._setPrompt('用法: delete <ID|编号>（或先选中实体后直接执行 delete）'); return; }
    viewer.doc.entities = viewer.doc.entities.filter(e => !ids.includes(e.id));
    viewer._selectionManager?.selectedIds.clear();
    viewer._finishDraw(null, before, `已删除 ${ids.length} 个实体`);
  }
}, { short: '删除实体', usage: 'delete [ID|编号]', desc: '删除指定实体，不指定时删除所有选中的实体。' });

def('move', (viewer, args) => {
  if (args.length < 2) { viewer._setDrawTool('move'); return; }
  let entities: Entity[], dx: number, dy: number;
  if (args.length >= 3) {
    const entity = findEntity(viewer, args[0]);
    if (!entity) { viewer._setPrompt(`未找到实体: ${args[0]}`); return; }
    entities = [entity];
    dx = parseFloat(args[1]); dy = parseFloat(args[2]);
  } else {
    entities = viewer._selectionManager?.selectedIds ? [...viewer._selectionManager?.selectedIds].map(id => viewer.doc?.getEntityById(id)).filter(Boolean) as Entity[] : [];
    if (entities.length === 0) { viewer._setPrompt('用法: move <ID|编号> <dx> <dy>（或先选中实体）'); return; }
    dx = parseFloat(args[0]); dy = parseFloat(args[1]);
  }
  if (isNaN(dx) || isNaN(dy)) { viewer._setPrompt('dx, dy 必须是数字'); return; }
  const before = viewer._saveSnapshot();
  for (const entity of entities) viewer._moveEntity(entity, dx, dy);
  viewer._finishDraw(entities[0], before, `已移动 ${entities.length} 个实体 (${dx}, ${dy})`);
}, { short: '移动实体', usage: 'move [ID|编号] <dx> <dy>', desc: '移动实体。指定 ID/编号时移动该实体，不指定时移动所有选中的实体。' });

// ─── 视图控制命令 ──────────────────────────────────

def('zoom', (viewer, args) => {
  const sub = args[0];
  if (sub === 'in' || sub === '+') { viewer.zoomIn(); viewer._setPrompt('放大'); }
  else if (sub === 'out' || sub === '-') { viewer.zoomOut(); viewer._setPrompt('缩小'); }
  else { viewer.zoomExtents(); viewer._setPrompt('缩放到全图'); }
}, { short: '缩放视图', usage: 'zoom [in|out]', desc: '不带参数缩放至全图，zoom in 放大，zoom out 缩小。别名: z' });

def('grid', (viewer, args) => {
  const sub = args[0] && args[0].toLowerCase();
  if (sub === 'on' || sub === '1') { viewer._gridEnabled = true; }
  else if (sub === 'off' || sub === '0') { viewer._gridEnabled = false; }
  else { viewer._gridEnabled = !viewer._gridEnabled; }
  viewer._updateGridDisplay();
  viewer._setPrompt(`栅格: ${viewer._gridEnabled ? '开启' : '关闭'}`);
}, { short: '切换栅格显示', usage: 'grid [on|off]', desc: '不带参数切换栅格开关状态。' });

def('snap', (viewer, args) => {
  const sub = args[0] && args[0].toLowerCase();
  if (sub === 'on' || sub === '1') { viewer._snapEnabled = true; }
  else if (sub === 'off' || sub === '0') { viewer._snapEnabled = false; }
  else { viewer._snapEnabled = !viewer._snapEnabled; }
  viewer._setPrompt(`栅格捕捉: ${viewer._snapEnabled ? '开启' : '关闭'}`);
}, { short: '切换栅格捕捉', usage: 'snap [on|off]', desc: '不带参数切换栅格捕捉开关状态。' });

// ─── 图层管理命令 ──────────────────────────────────

def('layer', (viewer, args) => {
  if (!viewer.doc) { viewer._setPrompt('没有打开的文档'); return; }
  const sub = args[0] && args[0].toLowerCase();
  if (!sub || sub === 'list' || sub === 'ls') {
    const layers = viewer.doc.layers || [];
    const lines = layers.map((l: any, i: number) => `#${i + 1} [${l.id}] ${l.visible !== false ? '可见' : '隐藏'}${l.frozen ? ' 冻结' : ''}${l.locked ? ' 锁定' : ''}`);
    viewer._setPrompt(lines.length ? lines.join('\n') : '图层: 0 (默认)');
  } else if (sub === 'add') {
    const name = args[1] || `图层${(viewer.doc.layers.length || 0) + 1}`;
    viewer.doc.layers.push({ id: name, name, color: 7, visible: true, frozen: false, locked: false });
    viewer._updateLayerPanel();
    if (viewer.renderer) viewer.renderer.render();
    viewer._setPrompt(`已添加图层: ${name}`);
  } else if (sub === 'delete' || sub === 'rm') {
    const name = args[1];
    if (!name || name === '0') { viewer._setPrompt('不能删除默认图层 0'); return; }
    const idx = viewer.doc.layers.findIndex((l: any) => l.id === name);
    if (idx < 0) { viewer._setPrompt(`图层不存在: ${name}`); return; }
    viewer.doc.layers.splice(idx, 1);
    viewer._updateLayerPanel();
    if (viewer.renderer) viewer.renderer.render();
    viewer._setPrompt(`已删除图层: ${name}`);
  } else {
    viewer._setPrompt('用法: layer [list|add <名称>|delete <名称>]');
  }
}, { short: '图层管理', usage: 'layer [list|add <名称>|delete <名称>]', desc: '管理文档图层。' });

// ─── 文件操作命令 ──────────────────────────────────

def('save', (viewer) => {
  const btn = document.getElementById('btn-save');
  btn?.click();
}, { short: '保存文件', usage: 'save' });

def('open', (viewer) => {
  const btn = document.getElementById('btn-open');
  btn?.click();
}, { short: '打开文件', usage: 'open' });

def('new', (viewer) => {
  const btn = document.getElementById('btn-new');
  btn?.click();
}, { short: '新建文档', usage: 'new' });

def('clear', async (viewer) => {
  const ok = await showModal({ title: '清空全部', message: '确定要清空所有实体吗？', confirmText: '清空', cancelText: '取消', width: 280 });
  if (ok) {
    viewer.deselectAll();
    if (viewer.renderer) { viewer.renderer.clear(); viewer.view.update(); }
    viewer._setPrompt('已清空');
  }
}, { short: '清空全部实体', usage: 'clear', desc: '删除文档中所有实体。' });

// ═════════════════════════════════════════════════════
// 各实体类注册的 CLI 命令 — 允许实体类扩展自定义命令
// ═════════════════════════════════════════════════════
for (const cmd of getAllCLICommands()) {
  const existing = commands[cmd.name];
  if (!existing) def(cmd.name, cmd.handler, cmd.help);
}

/**
 * 处理 CLI 命令入口，被 Viewer._processCommand 调用
 */
export function processCLICommand(viewer: Viewer, input: string): boolean {
  const { cmd, args } = parseArgs(input);

  const entry = commands[cmd];
  if (entry) {
    entry.handler(viewer, args);
    return true;
  }

  return false;
}

/** 返回所有已注册的命令名列表 */
export function getCLICommandNames(): string[] {
  return Object.keys(commands).sort();
}
