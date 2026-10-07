// Password gate shared by the Vercel Routing Middleware (middleware.js) and the Vite dev server
// (vite.config.js). The password lives only in the SITE_PASSWORD env var on the server; the browser
// gets an HttpOnly cookie holding an HMAC of it, so changing the password signs everyone out.
//
//   gate(request, env) → Response   (login pop-up, redirect after login, logout)
//                      → null       (authorised: let the request through)

export const COOKIE = 'bt_auth';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const enc = new TextEncoder();

async function sign(secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('butterfly-type:v1')));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
// only same-site relative paths ("/x"), never "//host" or absolute URLs
const safeNext = n => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function gate(request, env) {
  const password = env.SITE_PASSWORD;
  const url = new URL(request.url);
  if (!password) {
    // fail closed: a deployment without SITE_PASSWORD never serves the site
    return new Response('SITE_PASSWORD is not configured for this deployment.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const token = await sign(password + (env.AUTH_SECRET || ''));
  const secure = url.protocol === 'https:' ? '; Secure' : '';

  if (url.pathname === '/__logout') {
    return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`, 'cache-control': 'no-store' } });
  }
  if (url.pathname === '/__login' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const given = form?.get('password');
    const next = safeNext(form?.get('next'));
    if (typeof given === 'string' && safeEqual(await sign(given + (env.AUTH_SECRET || '')), token)) {
      return new Response(null, { status: 303, headers: { location: next, 'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`, 'cache-control': 'no-store' } });
    }
    await new Promise(r => setTimeout(r, 700)); // slow down guessing
    return loginPage(next, true);
  }
  if (safeEqual(readCookie(request, COOKIE), token)) return null;
  return loginPage(safeNext(url.pathname + url.search), false);
}

function loginPage(next, failed) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Butterfly Type</title>
<style>
@font-face { font-family: Novo; src: url(/fonts/Novo-Regular.woff2) format("woff2"); font-weight: 400; }
@font-face { font-family: Novo; src: url(/fonts/Novo-Bold.woff2) format("woff2"); font-weight: 700; }
*{box-sizing:border-box} html,body{margin:0;height:100%}
body{font:400 14px/1.4 Novo,system-ui,sans-serif;color:#fff;display:grid;place-items:center;padding:16px;
 background:radial-gradient(60vmax 50vmax at 22% 28%,rgba(159,227,238,.55),transparent 60%),radial-gradient(55vmax 45vmax at 82% 18%,rgba(231,166,214,.6),transparent 60%),radial-gradient(60vmax 50vmax at 70% 90%,rgba(110,79,208,.6),transparent 60%),#00008F}
.card{width:min(380px,100%);padding:30px 28px 26px;border-radius:22px;background:rgba(5,5,46,.82);border:1px solid rgba(255,255,255,.14);box-shadow:0 30px 90px rgba(0,0,0,.45);backdrop-filter:blur(14px);animation:in .35s ease-out}
@keyframes in{from{opacity:0;transform:translateY(10px) scale(.98)}}
h1{margin:0 0 4px;font-weight:700;font-size:28px} p{margin:0 0 22px;color:rgba(255,255,255,.65)}
label{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:8px}
input{width:100%;font:inherit;font-size:16px;color:#fff;background:#02021f;border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:12px 14px;outline:none}
input:focus{border-color:rgba(255,255,255,.45)}
button{margin-top:14px;width:100%;font:inherit;font-weight:500;border:0;border-radius:999px;padding:13px;background:#fff;color:#00008F;cursor:pointer}
.err{margin:12px 0 0;color:#F4B4D6;min-height:1.4em} small{display:block;margin-top:18px;color:rgba(255,255,255,.45);font-size:11px}
</style></head><body>
<form class="card" method="post" action="/__login">
  <h1>Butterfly Type</h1>
  <p>Internal preview. Enter the password to continue.</p>
  <label for="pw">Password</label>
  <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
  <input type="hidden" name="next" value="${esc(next)}">
  <button type="submit">Enter</button>
  <div class="err" role="alert">${failed ? 'That password didn’t work. Try again.' : ''}</div>
  <small>Novo 2026 · internal use only</small>
</form></body></html>`;
  return new Response(html, { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
