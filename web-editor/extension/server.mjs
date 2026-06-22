/**
 * Vite 插件 - 添加 /api/* 中间件，桥接浏览器状态与终端 CLI
 */

let browserState = { connected: false, tabs: [], entities: 0, drawTool: 'select', lastUpdate: null };
const commandQueue = [];
let resultQueue = [];

export default function gsgiServer() {
  return {
    name: 'gsgi-server-plugin',
    configureServer(server) {
      // 不加路径前缀，由 handler 自己检查 req.url
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const path = url.pathname;

        // ── /api/state ──
        if (path === '/api/state') {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                Object.assign(browserState, data, { connected: true, lastUpdate: Date.now() });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
              } catch (e) {
                res.writeHead(400);
                res.end('bad request');
              }
            });
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(browserState, null, 2));
          }
          return;
        }

        // ── /api/command/next ──
        if (path === '/api/command/next') {
          const cmd = commandQueue.shift() || null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ command: cmd }));
          return;
        }

        // ── /api/command/result ──
        if (path === '/api/command/result') {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                resultQueue.push(data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
              } catch (e) {
                res.writeHead(400);
                res.end('bad request');
              }
            });
          } else {
            const r = resultQueue.shift() || null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ result: r }));
          }
          return;
        }

        // ── /api/command ──
        if (path === '/api/command') {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                commandQueue.push(data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, queueLength: commandQueue.length }));
              } catch (e) {
                res.writeHead(400);
                res.end('bad request');
              }
            });
          } else {
            next();
          }
          return;
        }

        next();
      });
    }
  };
}
