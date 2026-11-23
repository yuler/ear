// PROTOTYPE. The Mac (server) side, drawn next to the phone: one panel per Mac (home,
// office), each with its pairing QR, pair prompt and paired-client list.
// Uses the global `state` from ios-mvp.js.

const qrCache = {};
/** Fake QR (looks right, encodes nothing): modules seeded from the payload, plus finders. */
function qrDataUrl(text) {
  if (qrCache[text]) return qrCache[text];
  const n = 29, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, n, n); g.fillStyle = "#000";
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const finders = [[0, 0], [n - 7, 0], [0, n - 7]];
  const inFinder = (x, y) => finders.some(([fx, fy]) => x >= fx - 1 && x < fx + 8 && y >= fy - 1 && y < fy + 8);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && rnd() < 0.5) g.fillRect(x, y, 1, 1);
  for (const [fx, fy] of finders) {
    g.fillRect(fx, fy, 7, 7); g.fillStyle = "#fff"; g.fillRect(fx + 1, fy + 1, 5, 5);
    g.fillStyle = "#000"; g.fillRect(fx + 2, fy + 2, 3, 3);
  }
  return (qrCache[text] = c.toDataURL());
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** This phone as seen by one Mac: only what that Mac serves counts. */
function selfLine(mac) {
  const mine = phoneLibrary().filter((x) => mac.library.includes(x.id) && x.status !== "removed");
  const ready = mine.filter((x) => x.status === "ready").length;
  if (!reachable(mac)) return `<span class="dot"></span>不在此网络 · 已有 ${ready}/${mine.length}`;
  const where = state.background ? `<span class="dot bg"></span>后台` : `<span class="dot on"></span>在线`;
  return ready === mine.length ? `${where} · 已镜像全部 ${mine.length} 个` : `${where} · 镜像中 ${ready}/${mine.length}`;
}

function clientLine(mac, c) {
  if (c.self) return selfLine(mac);
  const total = mac.library.length;
  const where = c.background ? `<span class="dot bg"></span>后台` : `<span class="dot on"></span>在线`;
  return c.done >= total ? `${where} · 已镜像全部 ${total} 个` : `${where} · 镜像中 ${c.done}/${total}`;
}

function renderMac() {
  const mac = macById(state.viewMac), t = createTransport(state.transport);
  const tabs = state.macs.map((m) => `<button class="mac-tab ${m.id === mac.id ? "on" : ""}" data-act="view-mac" data-id="${m.id}">
      ${m.name}${m.request ? " •" : ""}</button>`).join("");
  const clients = mac.clients.length === 0
    ? `<div class="mac-empty">还没有配对的设备</div>`
    : mac.clients.map((c) => `
        <div class="mac-client">
          <div class="mac-glyph">${c.name.includes("iPad") ? "▭" : "▯"}</div>
          <div class="grow"><div class="mac-cname">${c.name}${c.self ? " <span class='mac-you'>左侧</span>" : ""}</div>
            <div class="mac-cline">${clientLine(mac, c)}</div></div>
          <button class="mac-x" data-act="mac-remove" data-id="${c.id}" title="移除设备">移除</button>
        </div>`).join("");

  el("macPanel").innerHTML = `
    <div class="mac-tabs">${tabs}</div>
    <div class="mac-head"><span class="mac-lights"><i></i><i></i><i></i></span>${mac.name} · 设置 → 手机镜像
      <span class="grow"></span><span class="mac-net">Wi-Fi：${mac.networkName}</span></div>
    <div class="mac-body">
      <div class="mac-pair">
        <div class="mac-qr"><img alt="配对二维码" src="${qrDataUrl(t.pairUrl(mac, mac.code))}"></div>
        <div class="mac-pair-info">
          <div class="mac-h">用手机扫码配对</div>
          <div class="mac-muted">手机和这台 Mac 连同一个 Wi-Fi。配对后，媒体库会在后台自动镜像到手机。</div>
          <div class="mac-code">${mac.code}</div>
          <div class="mac-dim">${mmss(mac.codeLeft)} 后刷新 · ${t.address(mac)}</div>
        </div>
      </div>
      <div class="mac-sec">已配对设备 · ${mac.clients.length}</div>
      <div class="mac-clients">${clients}</div>
      <div class="mac-sec">这台 Mac 的媒体库 · ${mac.library.length}</div>
      <div class="mac-lib">${mac.library.map((v) => `<span>${VIDEOS[v].title}</span>`).join("")}</div>
    </div>
    ${mac.request ? `<div class="mac-scrim"><div class="mac-modal">
      <div class="mac-h">「这台 iPhone」请求配对</div>
      <div class="mac-muted">确认手机上显示的配对码是 <b>${state.scannedCode}</b>。允许后，它会在后台镜像这台 Mac 的媒体库。</div>
      <div class="mac-actions"><button class="ghost-btn" data-act="pair-no">拒绝</button>
        <button class="primary-btn" data-act="pair-yes">允许</button></div>
    </div></div>` : ""}`;
}
