/**
 * GSGI 浏览器端通信插件
 *
 * 向本地 Vite 开发服务器上报编辑器状态、轮询并执行远程命令。
 * 引入方式与 server.mjs 一致：
 *
 *   import gsgiClient from '../extension/client.js';
 *   Viewer.use(gsgiClient());
 */

import { nextId } from '../src/core/entity';

export default function gsgiClient() {
  return {
    name: 'gsgi-client-plugin',

    install(viewer) {
      if (!viewer) return;

      // 用 HEAD 探测 /api/state 是否存在，避免后端插件未启用时轮询产生 404 报警
      let serverAvailable = false;
      fetch('/api/state', { method: 'HEAD' }).then(() => { serverAvailable = true; }).catch(() => {});

      /**
       * 定时向服务端上报当前编辑器状态（标签页、实体数、工具、图层等）
       * 用于后端插件在 IDE 中同步显示编辑器实时状态
       */

      function sendState() {
        if (!serverAvailable) return;
        const state = {
          connected: true,
          tabs: (viewer._docTabs || []).map(t => ({ name: t.name, dirty: t.dirty, entities: (t.doc?.entities?.length || 0) })),
          activeTabIndex: viewer._activeTabIndex,
          entities: viewer.doc?.entities?.length || 0,
          drawTool: viewer._drawTool || 'select',
          layers: (viewer.doc?.layers || []).map(l => l.id),
          version: viewer.doc?.version || null
        };
        fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }).catch(() => {});
      }
      // 每 2 秒上报一次状态
      setInterval(sendState, 2000);
      // 拦截 _newDocument 和 loadFromJSON，在文档变更后立即上报状态
      const origNewDoc = viewer._newDocument.bind(viewer);
      viewer._newDocument = function(...a) { origNewDoc(...a); if (serverAvailable) setTimeout(sendState, 100); };
      const origLoad = viewer.loadFromJSON.bind(viewer);
      viewer.loadFromJSON = function(...a) { origLoad(...a); if (serverAvailable) setTimeout(sendState, 100); };

      /**
       * 轮询远程命令队列（来自 IDE 后端的命令）
       * 获取到命令后执行并返回结果，同时更新状态
       */
      async function pollCommands() {
        if (!serverAvailable) return;
        try {
          const res = await fetch('/api/command/next');
          const data = await res.json();
          if (data.command) {
            const result = await executeRemoteCommand(data.command);
            fetch('/api/command/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) }).catch(() => {});
            sendState();
          }
        } catch (e) { /* server not ready */ }
      }

      /**
       * 执行远程命令（三种格式）：
       * 1. cmd.cmd — 直接执行字符串命令（模拟在命令行输入）
       * 2. cmd.entity — 创建实体（自动生成依赖的点实体）
       * 3. cmd.fn — 调用 viewer 上的白名单方法
       */
      async function executeRemoteCommand(cmd) {
        try {
          if (cmd.cmd) {
            // 模拟在命令行输入框中按下回车执行
            if (viewer._cmdInput) {
              viewer._cmdInput.value = cmd.cmd;
              viewer._cmdInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            } else {
              viewer._processCommand(cmd.cmd);
            }
            return { ok: true, cmd: cmd.cmd };
          }
          if (cmd.entity) {
            const data = cmd.entity;
            let entity;
            // 根据实体类型自动创建其依赖的点实体（如直线需要起点/终点，圆/弧需要圆心）
            if (data.type === 'line' && data.x1 !== undefined) {
              const p1Id = nextId('P'); const p2Id = nextId('P');
              viewer.doc.entities.push(viewer._createEntity({ type: 'point', id: p1Id, point: [data.x1, data.y1], description: '远程起点' }));
              viewer.doc.entities.push(viewer._createEntity({ type: 'point', id: p2Id, point: [data.x2, data.y2], description: '远程终点' }));
              entity = viewer._createEntity({ type: 'line', id: data.id || nextId('L'), start_ref: p1Id, end_ref: p2Id, description: data.description || '远程直线' });
            } else if ((data.type === 'circle' || data.type === 'arc') && data.cx !== undefined) {
              const cId = nextId('P');
              viewer.doc.entities.push(viewer._createEntity({ type: 'point', id: cId, point: [data.cx, data.cy], description: '远程圆心' }));
              const entData = { ...data, center_ref: cId };
              delete entData.cx; delete entData.cy;
              entity = viewer._createEntity(entData);
            } else if (data.type === 'point' && data.x !== undefined) {
              entity = viewer._createEntity({ type: 'point', id: data.id || nextId('P'), point: [data.x, data.y], description: data.description || '远程点' });
            } else {
              entity = viewer._createEntity({ ...data, id: data.id || nextId(data.type[0].toUpperCase()) });
            }
            if (entity) {
              // 添加实体、重新渲染、选中新实体、持久化
              if (!viewer.doc.getEntityById(entity.id)) viewer.doc.entities.push(entity);
              if (viewer.renderer) {
                viewer.renderer.render();
                viewer.selectEntity(entity.id);
              }
              viewer._persist();
              return { ok: true, entityId: entity.id };
            }
            return { ok: false, error: 'createEntity failed' };
          }
          if (cmd.fn) {
            // 安全白名单：只允许调用列表中的方法，防止远程执行任意函数
            const ALLOWED_METHODS = new Set([
              'zoomExtents', 'zoomIn', 'zoomOut', 'undo', 'redo',
              'deselectAll', 'selectEntity',
              '_setDrawTool', '_cancelDrawing',
              '_updateGridDisplay', '_updateLayerPanel',
              '_saveCurrentFile', '_newDocument'
            ]);
            if (!ALLOWED_METHODS.has(cmd.fn)) {
              return { ok: false, error: `method ${cmd.fn} not allowed` };
            }
            const args = cmd.args || [];
            const fn = viewer[cmd.fn];
            if (typeof fn === 'function') {
              const r = fn.apply(viewer, args);
              if (viewer.renderer) viewer.renderer.render();
              viewer.view.update();
              return { ok: true, result: r };
            }
            return { ok: false, error: `method ${cmd.fn} not found` };
          }
          return { ok: false, error: 'unknown command format' };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }

      // 每 1 秒轮询一次远程命令队列
      setInterval(pollCommands, 1000);
    }
  };
}
