import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { gate } from './auth/gate.js';

// Runs the same password gate as middleware.js (Vercel) inside `npm run dev` / `npm run preview`.
// Only active when SITE_PASSWORD is set, e.g. in .env.local.
function passwordGate(env) {
  const PUBLIC = /^\/fonts\/Novo-(Regular|Bold)\.woff2$/;
  const handler = async (req, res, next) => {
    try {
      if (PUBLIC.test(req.url.split('?')[0])) return next();
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v != null) for (const x of [].concat(v)) headers.append(k, x);
      let body;
      if (req.method === 'POST') { const chunks = []; for await (const c of req) chunks.push(c); body = Buffer.concat(chunks); }
      const out = await gate(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body }), env);
      if (!out) return next();
      res.statusCode = out.status;
      out.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
      const cookies = out.headers.getSetCookie?.() || [];
      if (cookies.length) res.setHeader('set-cookie', cookies);
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) { next(e); }
  };
  return {
    name: 'password-gate',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

// The 3D butterflies are imported straight from the film repo (../src), so allow the parent
// folder and force a single copy of three for both trees.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: env.SITE_PASSWORD ? [passwordGate(env)] : [],
    server: { port: 5178, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
    resolve: { dedupe: ['three'] },
  };
});
