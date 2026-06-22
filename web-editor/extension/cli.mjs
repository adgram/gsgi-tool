#!/usr/bin/env node
/**
 * GSGI CLI - 终端命令接口
 *
 * 用法:
 *   node cli.mjs <文件.gsgi>                  交互模式
 *   node cli.mjs <文件.gsgi> <命令> [参数...]   单命令模式
 *
 * 命令:
 *   help [命令]         显示帮助
 *   ls [类型]           列出实体
 *   count [类型]        统计实体
 *   info <ID|编号>      实体属性
 *   set <ID> <键> <值>  设置属性
 *   delete <ID>         删除实体
 *   move <ID> <dx> <dy> 移动实体
 *   save [路径]         保存文件
 *   layer [list|add|delete]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';

// ═════════════════════════════════════════════════════
// GSGI 数据模型（纯 JS，无 Paper.js 依赖）
// ═════════════════════════════════════════════════════

class GSGIDocument {
  constructor(data = {}) {
    this.version = data.gsgi || '1.0';
    this.summary = data.summary || '';
    this.author = data.author || '';
    this.created = data.created || '';
    this.modified = data.modified || '';
    this.properties = data.properties || {};
    this.layers = data.layers || [];
    this.textStyles = data.text_styles || [];
    this.linetypes = data.linetypes || [];
    this.blocks = data.blocks || [];
    this.entities = data.entities || [];
    this.groups = data.groups || [];
    this.descriptions = data.descriptions || [];
    this.ext_derive = data.ext_derive || null;
  }

  toJSON() {
    return {
      gsgi: this.version, summary: this.summary, author: this.author,
      created: this.created, modified: this.modified, properties: this.properties,
      layers: this.layers, text_styles: this.textStyles, linetypes: this.linetypes,
      blocks: this.blocks, entities: this.entities.map(e => e.toJSON ? e.toJSON() : e),
      groups: this.groups, descriptions: this.descriptions,
      ...(this.ext_derive ? { ext_derive: this.ext_derive } : {})
    };
  }

  getEntityById(id) { return this.entities.find(e => e.id === id || e.id === id) || null; }
}

// 将普通对象转换为 Entity（添加辅助方法）
function toEntity(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj.toJSON) return obj; // 已经是 Entity
  obj.toJSON = function() { const o = { ...this }; return o; };
  obj.clone = function() { return { ...this, id: this.id + '_copy' }; };
  return obj;
}

// ═════════════════════════════════════════════════════
// 文件 I/O
// ═════════════════════════════════════════════════════

function loadFile(path) {
  if (!existsSync(path)) { console.error(`文件不存在: ${path}`); process.exit(1); }
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw);
  const doc = new GSGIDocument(data);
  // 确保每个实体有辅助方法
  doc.entities = doc.entities.map(e => (e.toJSON ? e : toEntity(e)));
  return doc;
}

function saveFile(doc, path) {
  writeFileSync(path, JSON.stringify(doc.toJSON(), null, 2), 'utf-8');
  console.log(`已保存: ${path}`);
}

// ═════════════════════════════════════════════════════
// 命令实现
// ═════════════════════════════════════════════════════

function findEntity(doc, idOrIdx) {
  const n = parseInt(idOrIdx, 10);
  if (!isNaN(n) && n >= 1 && n <= doc.entities.length) return doc.entities[n - 1];
  return doc.getEntityById(idOrIdx) || null;
}

function getEntityPos(e) {
  const pt = e.point || e.position_ref;
  if (Array.isArray(pt) && pt.length >= 2) return `(${+pt[0].toFixed(2)}, ${+pt[1].toFixed(2)})`;
  return '';
}

function formatEntity(e, i) {
  return `  #${i + 1} [${e.id}] ${e.type} ${getEntityPos(e)}`;
}

const COMMANDS = {};

function reg(name, fn, help) { COMMANDS[name] = { fn, help }; }

// ─── help ──────────────────────────────────────────
reg('help', (args, doc, path) => {
  if (args.length === 0) {
    console.log('可用命令:');
    for (const [name, h] of Object.entries(COMMANDS)) {
      console.log(`  ${name.padEnd(12)} ${h.help.short || ''}`);
    }
  } else if (COMMANDS[args[0]]) {
    const h = COMMANDS[args[0]].help;
    console.log(`${args[0]} - ${h.short}`);
    if (h.usage) console.log(`用法: ${h.usage}`);
    if (h.desc) console.log(h.desc);
  } else {
    console.log(`未知命令: ${args[0]}`);
  }
}, { short: '显示帮助', usage: 'help [命令]' });

// ─── ls ────────────────────────────────────────────
reg('ls', (args, doc) => {
  const filter = args[0] || null;
  const list = filter ? doc.entities.filter(e => e.type === filter) : doc.entities;
  if (list.length === 0) { console.log(filter ? `没有 ${filter} 类型实体` : '文档为空'); return; }
  for (let i = 0; i < list.length; i++) console.log(formatEntity(list[i], doc.entities.indexOf(list[i])));
}, { short: '列出实体', usage: 'ls [类型]', desc: '按类型过滤列出实体。例: ls line' });

// ─── count ─────────────────────────────────────────
reg('count', (args, doc) => {
  const filter = args[0] || null;
  if (filter) {
    console.log(`${filter}: ${doc.entities.filter(e => e.type === filter).length} 个`);
  } else {
    const counts = {};
    for (const e of doc.entities) counts[e.type] = (counts[e.type] || 0) + 1;
    for (const [t, n] of Object.entries(counts)) console.log(`  ${t}: ${n}`);
    console.log(`  总计: ${doc.entities.length}`);
  }
}, { short: '统计实体数量', usage: 'count [类型]' });

// ─── info ──────────────────────────────────────────
reg('info', (args, doc) => {
  if (args.length < 1) { console.log('用法: info <ID|编号>'); return; }
  const e = findEntity(doc, args[0]);
  if (!e) { console.log(`未找到: ${args[0]}`); return; }
  console.log(`[${e.id}] ${e.type}`);
  for (const [k, v] of Object.entries(e)) {
    if (k.startsWith('_') || typeof v === 'function') continue;
    const val = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
    console.log(`  ${k}=${val}`);
  }
}, { short: '显示实体属性', usage: 'info <ID|编号>' });

// ─── set ───────────────────────────────────────────
reg('set', (args, doc, path, save) => {
  if (args.length < 3) { console.log('用法: set <ID|编号> <键> <值>'); return; }
  const e = findEntity(doc, args[0]);
  if (!e) { console.log(`未找到: ${args[0]}`); return; }
  const key = args[1], val = args.slice(2).join(' ');
  const num = parseFloat(val);
  e[key] = isNaN(num) ? val : num;
  console.log(`已设置 ${e.id}.${key} = ${JSON.stringify(e[key])}`);
  if (save) save();
}, { short: '设置实体属性', usage: 'set <ID> <键> <值>' });

// ─── delete ────────────────────────────────────────
reg('delete', (args, doc, path, save) => {
  if (args.length < 1) { console.log('用法: delete <ID|编号>'); return; }
  const idx = (() => {
    const n = parseInt(args[0], 10);
    if (!isNaN(n) && n >= 1 && n <= doc.entities.length) return n - 1;
    return doc.entities.findIndex(e => e.id === args[0]);
  })();
  if (idx < 0) { console.log(`未找到: ${args[0]}`); return; }
  const removed = doc.entities.splice(idx, 1)[0];
  console.log(`已删除 [${removed.id}] ${removed.type}`);
  if (save) save();
}, { short: '删除实体', usage: 'delete <ID|编号>' });

// ─── move ──────────────────────────────────────────
reg('move', (args, doc, path, save) => {
  if (args.length < 3) { console.log('用法: move <ID|编号> <dx> <dy>'); return; }
  const e = findEntity(doc, args[0]);
  if (!e) { console.log(`未找到: ${args[0]}`); return; }
  const dx = parseFloat(args[1]), dy = parseFloat(args[2]);
  if (isNaN(dx) || isNaN(dy)) { console.log('dx, dy 须为数字'); return; }
  // 移动 point 或 polyline 坐标
  if (e.type === 'point' && Array.isArray(e.point)) {
    e.point[0] += dx; e.point[1] += dy;
    console.log(`已移动至 (${e.point[0].toFixed(2)}, ${e.point[1].toFixed(2)})`);
  } else if (e.type === 'polyline' && Array.isArray(e.points)) {
    for (const p of e.points) { p[0] += dx; p[1] += dy; }
    console.log(`已移动多段线 (${dx}, ${dy})`);
  } else {
    // 尝试移动所有引用点的坐标
    let moved = 0;
    for (const [k, v] of Object.entries(e)) {
      if (k.endsWith('_ref') && typeof v === 'string') {
        const ref = findEntity(doc, v);
        if (ref && ref.type === 'point' && Array.isArray(ref.point)) {
          ref.point[0] += dx; ref.point[1] += dy; moved++;
        }
      }
      if (k.endsWith('_refs') && Array.isArray(v)) {
        for (const r of v) {
          if (typeof r === 'string') {
            const ref = findEntity(doc, r);
            if (ref && ref.type === 'point' && Array.isArray(ref.point)) {
              ref.point[0] += dx; ref.point[1] += dy; moved++;
            }
          }
        }
      }
    }
    console.log(`已移动 ${moved} 个引用点`);
  }
  if (save) save();
}, { short: '移动实体', usage: 'move <ID> <dx> <dy>' });

// ─── save ──────────────────────────────────────────
reg('save', (args, doc, path) => {
  const outPath = args[0] || path;
  saveFile(doc, outPath);
}, { short: '保存文件', usage: 'save [路径]' });

// ─── layer ─────────────────────────────────────────
reg('layer', (args, doc, path, save) => {
  const sub = args[0] && args[0].toLowerCase();
  if (!sub || sub === 'list' || sub === 'ls') {
    if (!doc.layers.length) { console.log('图层: 0 (默认)'); return; }
    for (const l of doc.layers) {
      console.log(`  [${l.id}] ${l.visible !== false ? '' : '隐藏 '}${l.frozen ? '冻结 ' : ''}`);
    }
  } else if (sub === 'add') {
    const name = args[1] || `图层${doc.layers.length + 1}`;
    doc.layers.push({ id: name, name, color: 7, visible: true, frozen: false, locked: false });
    console.log(`已添加图层: ${name}`);
    if (save) save();
  } else if (sub === 'delete' || sub === 'rm') {
    const name = args[1];
    if (!name || name === '0') { console.log('不能删除默认图层 0'); return; }
    const idx = doc.layers.findIndex(l => l.id === name);
    if (idx < 0) { console.log(`图层不存在: ${name}`); return; }
    doc.layers.splice(idx, 1);
    console.log(`已删除图层: ${name}`);
    if (save) save();
  } else {
    console.log('用法: layer [list|add <名称>|delete <名称>]');
  }
}, { short: '图层管理', usage: 'layer [list|add|delete]' });

// ─── export 输出为文本表格 ────────────────────────
reg('export', (args, doc) => {
  const outPath = args[0] || (doc.summary ? doc.summary.replace(/[^a-z0-9]/gi, '_') + '.csv' : 'export.csv');
  const lines = [['ID', '类型', '属性'].join(',')];
  for (const e of doc.entities) {
    const props = Object.entries(e).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}:${JSON.stringify(v)}`).join('; ');
    lines.push([e.id, e.type, `"${props.replace(/"/g, '""')}"`].join(','));
  }
  writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`已导出: ${outPath} (${doc.entities.length} 实体)`);
}, { short: '导出为 CSV', usage: 'export [路径]' });

// ═════════════════════════════════════════════════════
// 交互模式
// ═════════════════════════════════════════════════════

function interactive(doc, path) {
  console.log(`\nGSGI CLI — ${path}`);
  console.log(`实体: ${doc.entities.length}, 图层: ${doc.layers.length}`);
  console.log('输入 help 查看命令, Ctrl+C 或 exit 退出\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();

  let dirty = false;
  const saveIfDirty = () => { if (dirty) { saveFile(doc, path); dirty = false; } };

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed === 'exit' || trimmed === 'quit') { saveIfDirty(); rl.close(); return; }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    const entry = COMMANDS[cmd];
    if (entry) {
      entry.fn(args, doc, path, () => { dirty = true; });
    } else {
      console.log(`未知命令: ${cmd}（输入 help 查看帮助）`);
    }
    rl.prompt();
  });

  rl.on('close', () => { saveIfDirty(); console.log('再见'); process.exit(0); });
}

// ═════════════════════════════════════════════════════
// 入口
// ═════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法: node cli.mjs <文件.gsgi> [命令] [参数...]');
    console.log('例:');
    console.log('  node cli.mjs demo.gsgi                  交互模式');
    console.log('  node cli.mjs demo.gsgi count            统计实体');
    console.log('  node cli.mjs demo.gsgi ls line          列出直线');
    console.log('  node cli.mjs demo.gsgi info L1          查看实体');
    process.exit(0);
  }

  const filePath = args[0];
  const doc = loadFile(filePath);
  const cmdArgs = args.slice(1);

  if (cmdArgs.length === 0) {
    // 交互模式
    interactive(doc, filePath);
  } else {
    // 单命令模式
    const cmd = cmdArgs[0].toLowerCase();
    const entry = COMMANDS[cmd];
    if (entry) {
      entry.fn(cmdArgs.slice(1), doc, filePath);
    } else {
      console.log(`未知命令: ${cmd}`);
      process.exit(1);
    }
  }
}

main();
