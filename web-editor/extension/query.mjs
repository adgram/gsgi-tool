#!/usr/bin/env node
/**
 * GSGI 查询工具 — 与浏览器中的 GSGI 编辑器通信
 *
 * 用法:
 *   node query.mjs state             查看完整状态
 *   node query.mjs tabs              查看打开的文档
 *   node query.mjs active            查看当前激活的文档
 *   node query.mjs entities          查看当前文档实体数量
 *   node query.mjs layers            查看当前文档图层
 *   node query.mjs watch             持续监听状态变化
 *   node query.mjs run <命令>        在浏览器中执行命令栏命令
 *   node query.mjs entity <JSON>     在浏览器中创建实体
 *   node query.mjs fn <方法> [参数..] 调用 viewer 方法
 *   node query.mjs result            获取上次命令执行结果
 */

const BASE = process.env.GSGI_URL || 'http://localhost:3000';

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function format(s) {
  console.log('连接:', s.connected ? '✓' : '✗');
  if (!s.connected) return;
  console.log('版本:', s.version || '-');
  console.log('当前工具:', s.drawTool);
  console.log('当前文档实体:', s.entities);
  console.log('---');

  if (s.tabs?.length) {
    console.log(`打开的文档 (${s.tabs.length}):`);
    for (let i = 0; i < s.tabs.length; i++) {
      const t = s.tabs[i];
      const active = i === s.activeTabIndex ? ' ◄ 当前' : '';
      console.log(`  #${i + 1} ${t.name}${t.dirty ? ' ●' : ''} (${t.entities} 实体)${active}`);
    }
  }

  if (s.layers?.length) {
    console.log('---\n图层:', s.layers.join(', '));
  }
}

async function waitForResult() {
  // 等待命令执行结果（最多 3 秒，轮询 5 次）
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 600));
    const res = await api('GET', '/api/command/result');
    if (res.result) return res.result;
  }
  return null;
}

async function main() {
  const cmd = process.argv[2] || 'state';

  try {
    if (cmd === 'watch') {
      console.log(`监听 ${BASE}/api/state...（按 Ctrl+C 停止）\n`);
      while (true) {
        try {
          const s = await api('GET', '/api/state');
          const now = new Date().toLocaleTimeString();
          const tabs = s.tabs?.map((t, i) => `${i === s.activeTabIndex ? '*' : ' '}${t.name}${t.dirty ? '●' : ''}`).join(' | ') || '-';
          console.log(`[${now}] 文档:${s.tabs?.length || 0} | 当前:${tabs} | 实体:${s.entities} | 工具:${s.drawTool}`);
        } catch (e) {
          console.log(`[${new Date().toLocaleTimeString()}] 等待连接...`);
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    } else if (cmd === 'tabs') {
      const s = await api('GET', '/api/state');
      if (s.tabs?.length) {
        for (let i = 0; i < s.tabs.length; i++) {
          const t = s.tabs[i];
          const active = i === s.activeTabIndex ? ' ◄ 当前' : '';
          console.log(`#${i + 1} ${t.name}${t.dirty ? ' ●' : ''} (${t.entities} 实体)${active}`);
        }
      } else {
        console.log('无打开文档');
      }
    } else if (cmd === 'active') {
      const s = await api('GET', '/api/state');
      const t = s.tabs?.[s.activeTabIndex];
      if (t) {
        console.log(`当前文档: ${t.name}`);
        console.log(`  实体: ${t.entities}`);
        console.log(`  修改: ${t.dirty ? '是' : '否'}`);
      } else {
        console.log('无激活文档');
      }
    } else if (cmd === 'entities') {
      const s = await api('GET', '/api/state');
      console.log(s.entities);
    } else if (cmd === 'layers') {
      const s = await api('GET', '/api/state');
      console.log((s.layers || []).join('\n'));
    } else if (cmd === 'run') {
      const cmdLine = process.argv.slice(3).join(' ');
      if (!cmdLine) { console.log('用法: node query.mjs run <命令>'); process.exit(1); }
      await api('POST', '/api/command', { cmd: cmdLine });
      const result = await waitForResult();
      console.log('已发送:', cmdLine);
      if (result) console.log('结果:', JSON.stringify(result));
    } else if (cmd === 'entity') {
      const jsonStr = process.argv.slice(3).join(' ');
      if (!jsonStr) { console.log('用法: node query.mjs entity \'{"type":"line","start_ref":"...","end_ref":"..."}\''); process.exit(1); }
      const entityData = JSON.parse(jsonStr);
      await api('POST', '/api/command', { entity: entityData });
      const result = await waitForResult();
      console.log('已发送实体创建:', entityData.type);
      if (result) console.log('结果:', JSON.stringify(result));
    } else if (cmd === 'fn') {
      const fnName = process.argv[3];
      const args = process.argv.slice(4).map(a => { try { return JSON.parse(a); } catch(e) { return a; } });
      await api('POST', '/api/command', { fn: fnName, args });
      const result = await waitForResult();
      console.log('已调用:', fnName);
      if (result) console.log('结果:', JSON.stringify(result));
    } else if (cmd === 'result') {
      const res = await api('GET', '/api/command/result');
      console.log(JSON.stringify(res, null, 2));
    } else {
      const s = await api('GET', '/api/state');
      format(s);
    }
  } catch (e) {
    console.error(`错误: ${e.message}`);
    console.error(`确保 GSGI 编辑器已在浏览器中打开 (${BASE})`);
    process.exit(1);
  }
}

main();
