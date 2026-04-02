import { defineConfig, loadEnv } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import nowHandler from './api/now.js';
import notifyHandler from './api/notify.js';
import employeeLoginHandler from './api/employee-login.js';

function copyFileSyncSafe(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function devApiBridge() {
  const routes = new Map([
    ['/api/now', nowHandler],
    ['/api/notify', notifyHandler],
    ['/api/employee-login', employeeLoginHandler],
  ]);

  return {
    name: 'dev-api-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';
        const handler = routes.get(url);
        if (!handler) return next();

        Promise.resolve(handler(req, res)).catch((err) => {
          console.error('API bridge error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'dev_api_bridge_error' }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  for (const [k, v] of Object.entries(env)) {
    if (!(k in process.env)) process.env[k] = v;
  }

  return {
    envDir: __dirname,
    root: 'public',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    plugins: [
      devApiBridge(),
      {
        name: 'copy-static-for-sw',
        apply: 'build',
        writeBundle(options) {
          const outDir = options.dir || path.resolve(__dirname, 'dist');

          const swSrc = path.resolve(__dirname, 'public', 'firebase-messaging-sw.js');
          const swDst = path.resolve(outDir, 'firebase-messaging-sw.js');
          if (fs.existsSync(swSrc)) copyFileSyncSafe(swSrc, swDst);

          const manifestSrc = path.resolve(__dirname, 'public', 'manifest.webmanifest');
          const manifestDst = path.resolve(outDir, 'manifest.webmanifest');
          if (fs.existsSync(manifestSrc)) copyFileSyncSafe(manifestSrc, manifestDst);

          const iconSrc = path.resolve(__dirname, 'public', 'img', 'logo_administrativo.png');
          const iconDst = path.resolve(outDir, 'img', 'logo_administrativo.png');
          if (fs.existsSync(iconSrc)) copyFileSyncSafe(iconSrc, iconDst);

          const vendorSrcDir = path.resolve(__dirname, 'public', 'vendor');
          const vendorDstDir = path.resolve(outDir, 'vendor');
          if (fs.existsSync(vendorSrcDir)) {
            for (const name of ['firebase-app-compat.js', 'firebase-messaging-compat.js']) {
              const src = path.resolve(vendorSrcDir, name);
              const dst = path.resolve(vendorDstDir, name);
              if (fs.existsSync(src)) copyFileSyncSafe(src, dst);
            }
          }
        },
      },
    ],
  };
});