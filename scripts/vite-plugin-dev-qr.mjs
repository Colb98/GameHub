/**
 * Dev-only Vite plugin: injects a floating "Scan to test" button into the game
 * page that reveals a QR code for the dev server's LAN URL (http://IP:port), so
 * you can open the game on a phone on the same Wi-Fi without typing anything.
 *
 * `apply: 'serve'` means it runs ONLY on the Vite dev server — it is never part
 * of `vite build` output or the uploaded bundle. The QR is rendered server-side
 * (Node) into a data URI, so the page makes no external requests.
 */
import os from 'node:os';
import QRCode from 'qrcode';

function score(ip) {
  if (ip.startsWith('192.168.')) return 3;
  if (ip.startsWith('10.')) return 2;
  if (ip.startsWith('172.')) return 1;
  return 0;
}

/** Best-guess LAN IPv4, preferring common private ranges (Windows often has
 *  several virtual adapters). Only used if Vite didn't resolve a network URL. */
function fallbackLanIp() {
  const addrs = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  addrs.sort((a, b) => score(b) - score(a));
  return addrs[0] ?? 'localhost';
}

export function devQrPlugin() {
  return {
    name: 'gamehub-dev-qr',
    // JSDoc cast keeps this the literal 'serve' (not widened to string) so the
    // plugin satisfies Vite's Plugin type when imported into vite.config.ts.
    apply: /** @type {'serve'} */ ('serve'),
    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        const port = ctx.server?.config?.server?.port ?? 5173;
        // Vite's own resolved network URL is the most reliable (needs host:true)
        const network = ctx.server?.resolvedUrls?.network?.[0];
        const url = network
          ? network.replace(/\/+$/, '')
          : `http://${fallbackLanIp()}:${port}`;

        let qr;
        try {
          qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
        } catch {
          return html; // never break the page over a QR failure
        }

        const overlay = `
<div id="__ghqr" style="position:fixed;right:12px;bottom:12px;z-index:2147483647;font-family:system-ui,-apple-system,sans-serif">
  <button id="__ghqr_btn" style="cursor:pointer;border:0;border-radius:20px;padding:8px 14px;background:#6366f1;color:#fff;font-weight:600;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.4)">📱 Scan to test</button>
  <div id="__ghqr_panel" style="display:none;position:absolute;right:0;bottom:44px;background:#0f172a;border:1px solid #334155;border-radius:12px;padding:12px;box-shadow:0 8px 30px rgba(0,0,0,.5);text-align:center">
    <img src="${qr}" width="220" height="220" alt="Scan to open on your phone" style="display:block;border-radius:8px"/>
    <div style="margin-top:8px;color:#cbd5e1;font-size:12px;word-break:break-all;max-width:220px">${url}</div>
    <div style="margin-top:4px;color:#64748b;font-size:11px">Same Wi-Fi · dev only</div>
  </div>
  <script>(function(){var b=document.getElementById('__ghqr_btn'),p=document.getElementById('__ghqr_panel');b.addEventListener('click',function(){p.style.display=p.style.display==='none'?'block':'none';});})();</script>
</div>`;
        return html.replace('</body>', `${overlay}\n</body>`);
      },
    },
  };
}
