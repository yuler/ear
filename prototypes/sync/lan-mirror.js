// PROTOTYPE. Rendering, gestures and the tick loop. State + engine: mirror.js.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const poster = (v) => `background:linear-gradient(135deg,hsl(${v.hue} 35% 38%),hsl(${(v.hue + 40) % 360} 30% 18%))`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Fake QR (looks right, encodes nothing): deterministic modules from the payload + finders.
const qrCache = {};
function qrDataUrl(text) {
  if (qrCache[text]) return qrCache[text];
  const n = 29, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, n, n); g.fillStyle = "#000";
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const inFinder = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => x >= fx - 1 && x < fx + 8 && y >= fy - 1 && y < fy + 8);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && rnd() < 0.5) g.fillRect(x, y, 1, 1);
  for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    g.fillRect(fx, fy, 7, 7); g.fillStyle = "#fff"; g.fillRect(fx + 1, fy + 1, 5, 5);
    g.fillStyle = "#000"; g.fillRect(fx + 2, fy + 2, 3, 3);
  }
  return (qrCache[text] = c.toDataURL());
}

function ring(p) {
  const r = 8, len = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 20 20"><circle cx="10" cy="10" r="${r}" fill="none" stroke="var(--line)" stroke-width="2.5"/>
    <circle cx="10" cy="10" r="${r}" fill="none" stroke="var(--fg)" stroke-width="2.5" stroke-linecap="round"
      stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - p)}" transform="rotate(-90 10 10)"/></svg>`;
}

// ---------- PC ----------

function deviceStatus(p) {
  const s = phoneStats(p);
  if (!p.online) return [`<span class="dot"></span>离线 · 已镜像 ${s.done}/${s.wanted}`, s];
  const where = p.background ? `<span class="dot bg"></span>后台` : `<span class="dot on"></span>在线`;
  return [s.complete ? `${where} · 已镜像全部 ${s.wanted} 个` : `${where} · 镜像中 ${s.done}/${s.wanted}`, s];
}

function renderPcLibrary() {
  return `<div class="grid">${state.pc.library.map((v) => `
    <div class="card"><div class="poster" style="${poster(v)}"><span class="dur">${v.min}:00</span></div>
      <div class="title">${esc(v.title)}</div>
      <div class="meta">${v.kind === "audio" ? "🎧 " : ""}YouTube · ${v.sizeMB} MB</div></div>`).join("")}</div>`;
}

function renderPcSettings() {
  const pc = state.pc, t = createTransport(state.transport);
  const paired = state.phones.filter((p) => p.paired);
  const devices = paired.length === 0
    ? `<div class="empty-dev">还没有配对的手机</div>`
    : paired.map((p) => {
        const [label, s] = deviceStatus(p);
        const pct = s.wanted ? (s.done / s.wanted) * 100 : 100;
        return `<div class="dev"><div class="glyph">📱</div>
          <div class="grow"><div><b>${esc(p.name)}</b></div><div class="muted" style="font-size:12px">${label}</div>
            ${s.complete ? "" : `<div class="bar"><i style="width:${pct}%"></i></div>`}</div>
          <button class="icon-btn" data-act="pc-menu" data-id="${p.id}">⋯</button>
          ${pc.menu === p.id ? `<div class="menu"><button data-act="pc-remove" data-id="${p.id}" class="danger">移除这台设备</button></div>` : ""}
        </div>`;
      }).join("");
  return `<div class="settings">
    <div class="sec-label">手机镜像</div>
    <div class="mirror-box">
      <div class="qr"><img alt="配对二维码" src="${qrDataUrl(t.pairUrl(pc, pc.code))}"></div>
      <div class="mirror-info">
        <h3>用手机扫码配对</h3>
        <div class="muted">手机和电脑连同一个 Wi-Fi。配对后，媒体库会在后台自动镜像到手机。</div>
        <div class="grow"></div>
        <div class="code mono">${pc.code}</div>
        <div class="dim" style="font-size:11px">${mmss(pc.codeLeft)} 后刷新 · <span class="mono">${t.address(pc)}</span></div>
      </div>
    </div>
    <div class="devices">${devices}</div>
    <div class="sec-label">通用</div>
    <div class="list">
      <div class="row"><span>下载目录</span><span class="muted mono">~/Downloads/Ear</span></div>
      <div class="row"><span>外观</span><span class="muted">深色 · 浅色 · 跟随系统</span></div>
      <div class="row"><span>界面语言</span><span class="muted">中文</span></div>
      <div class="row"><span>默认清晰度</span><span class="muted">360p</span></div>
    </div>
  </div>`;
}

function renderPc() {
  const pc = state.pc;
  const mirroring = state.phones.filter((p) => p.paired && p.online && !phoneStats(p).complete).length;
  const req = pc.request && phoneById(pc.request);
  $("#pc").innerHTML = `
    <div class="topbar"><div class="lights"><i></i><i></i><i></i></div>
      <div class="seg"><button>Discover</button>
        <button class="${pc.view === "library" ? "on" : ""}" data-act="pc-view" data-v="library">Library</button></div>
      <div class="field">粘贴 YouTube 链接</div>
      <button class="icon-btn" title="手机镜像" data-act="pc-view" data-v="settings">📱${mirroring ? `<span class="badge">${mirroring}</span>` : ""}</button>
      <button class="icon-btn ${pc.view === "settings" ? "on" : ""}" title="设置" data-act="pc-view" data-v="settings">⚙</button>
    </div>
    <div class="pc-body">${pc.view === "library" ? renderPcLibrary() : renderPcSettings()}</div>
    ${req ? `<div class="modal-scrim"><div class="modal">
      <h3>「${esc(req.name)}」请求配对</h3>
      <div class="muted">确认手机上显示的配对码是 <b class="mono">${req.scannedCode}</b>。允许后，它会在后台镜像你的媒体库。</div>
      <div class="actions"><button class="btn" data-act="pair-no">拒绝</button><button class="btn primary" data-act="pair-yes">允许</button></div>
    </div></div>` : ""}`;
}

// ---------- Phone ----------

function phoneRow(p, v, it) {
  const removed = it.status === "removed";
  const right = removed ? `<button class="pill" data-act="ph-again" data-id="${p.id}" data-v="${v.id}">镜像</button>`
    : it.status === "done" ? `<span class="ok">✓</span>`
    : it.status === "syncing" ? ring(it.progress)
    : `<span class="dim">等待</span>`;
  const open = swipeOpen && swipeOpen.p === p.id && swipeOpen.v === v.id;
  return `<div class="swipe ${removed ? "removed" : ""}">
    ${removed ? "" : `<button class="del" data-act="ph-del" data-id="${p.id}" data-v="${v.id}">删除</button>`}
    <div class="fg" data-swipe="${removed ? "" : `${p.id}|${v.id}`}" style="transform:translateX(${open ? -88 : 0}px)">
      <div class="thumb" style="${poster(v)}">${v.kind === "audio" ? `<span class="k">🎧</span>` : ""}</div>
      <div class="it-main"><div class="it-title">${esc(v.title)}</div>
        <div class="it-meta">${v.min} 分钟 · ${v.sizeMB} MB${it.status === "syncing" ? ` · ${Math.round(it.progress * 100)}%` : ""}</div></div>
      <div class="it-state">${right}</div>
    </div></div>`;
}

function renderPhoneScreen(p) {
  if (p.screen === "unpaired") return `<div class="center">
      <div class="big-glyph">🖥</div><h3 style="margin:0">连接电脑</h3>
      <div class="muted">在电脑上打开「设置 → 手机镜像」，扫描二维码。两台设备需连同一个 Wi-Fi。</div>
      ${p.notice ? `<div class="notice">${esc(p.notice)}</div>` : ""}
      <button class="btn primary block" data-act="ph-scan" data-id="${p.id}">扫码配对</button></div>`;
  if (p.screen === "scan") return `<div class="camera">
      <div class="finder"></div><div>对准电脑上的二维码</div>
      <button class="btn" data-act="ph-scanned" data-id="${p.id}">模拟扫到二维码</button>
      <button class="link" data-act="ph-cancel" data-id="${p.id}">取消</button></div>`;
  if (p.screen === "waiting") return `<div class="center">
      <div class="spinner"></div><h3 style="margin:0">在电脑上点「允许」</h3>
      <div class="muted">配对码</div><div class="code mono">${p.scannedCode}</div>
      <button class="link btn" data-act="ph-cancel" data-id="${p.id}">取消</button></div>`;

  const s = phoneStats(p), lib = state.pc.library;
  const items = lib.map((v) => [v, p.items[v.id] ?? { status: "queued", progress: 0 }]);
  const kept = items.filter(([, it]) => it.status !== "removed");
  const removed = items.filter(([, it]) => it.status === "removed");
  const sub = !p.online ? "未连接电脑 · 回到同一 Wi-Fi 后继续"
    : s.complete ? `已镜像全部 ${s.wanted} 个` : `镜像中 ${s.done}/${s.wanted} · 同时传 ${s.syncing} 个`;
  return `<div class="ph-head"><div class="h"><h2>Ear</h2>
      <button class="icon-btn" data-act="ph-menu" data-id="${p.id}">⋯</button></div>
      <div class="ph-sub">${esc(state.pc.name)} · ${sub}</div>
      ${phoneMenu === p.id ? `<div class="menu" style="top:70px;right:18px"><button class="danger" data-act="ph-unpair" data-id="${p.id}">断开配对</button></div>` : ""}
    </div>
    <div class="ph-list">
      ${kept.map(([v, it]) => phoneRow(p, v, it)).join("")}
      ${removed.length ? `<div class="ph-sec">仅在电脑</div>${removed.map(([v, it]) => phoneRow(p, v, it)).join("")}` : ""}
      <div class="hint">左滑删除手机上的副本，电脑上的不受影响</div>
    </div>
    ${p.online ? "" : `<div class="offline">未连接 ${esc(state.pc.name)}</div>`}`;
}

function renderBackground(p) {
  const s = phoneStats(p), pct = s.wanted ? (s.done / s.wanted) * 100 : 100;
  const text = !p.online ? "等待连接电脑" : s.complete ? `已镜像全部 ${s.wanted} 个` : `后台镜像中 ${s.done}/${s.wanted}`;
  return `<div class="home"><div class="live"><div class="app">E</div>
      <div class="grow"><div style="font-weight:600">${text}</div>
        <div style="font-size:11px;opacity:.7">${esc(state.pc.name)} · 局域网</div>
        ${s.complete ? "" : `<div class="bar"><i style="width:${pct}%"></i></div>`}</div></div>
    <div class="apps">${"<i></i>".repeat(16)}</div></div>`;
}

function renderPhone(p) {
  const el = document.getElementById(`phone-${p.id}`) ?? createPhoneEl(p);
  if (drag && drag.p === p.id) return; // don't rebuild under the finger
  el.querySelector(".screen").innerHTML = renderPhoneScreen(p) + (p.paired && p.background ? renderBackground(p) : "");
  el.querySelector(".sim").innerHTML = p.paired
    ? `<button data-act="ph-bg" data-id="${p.id}">${p.background ? "回到前台" : "切到后台"}</button>
       <button data-act="ph-wifi" data-id="${p.id}">${p.online ? "离开 Wi-Fi" : "连上 Wi-Fi"}</button>`
    : "";
}

function createPhoneEl(p) {
  const wrap = document.createElement("div");
  wrap.id = `phone-${p.id}`;
  wrap.innerHTML = `<div class="phone"><div class="notch"></div>
      <div class="status"><span>9:41</span><span>Wi-Fi ▮▮▮</span></div><div class="screen"></div></div>
    <div style="text-align:center;margin-top:8px" class="muted">${esc(p.name)}</div><div class="sim"></div>`;
  $("#phones").appendChild(wrap);
  return wrap;
}

let swipeOpen = null, drag = null, phoneMenu = null;

function render() {
  document.documentElement.dataset.theme = state.theme;
  renderPc();
  state.phones.forEach(renderPhone);
  $("#add-phone").disabled = state.phones.length >= 3;
  const brief = { ...state, pc: { ...state.pc, library: state.pc.library.map((v) => v.id) } };
  $("#state").textContent = JSON.stringify(brief, null, 1);
}

// ---------- Events ----------

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) {
    state.pc.menu = null; phoneMenu = null;
    return render();
  }
  const p = b.dataset.id && phoneById(b.dataset.id), v = b.dataset.v;
  const acts = {
    "pc-view": () => { state.pc.view = v; },
    "pc-menu": () => { state.pc.menu = state.pc.menu === b.dataset.id ? null : b.dataset.id; },
    "pc-remove": () => { unpair(p, true); state.pc.menu = null; },
    "pair-yes": () => answerPair(true),
    "pair-no": () => answerPair(false),
    "ph-scan": () => startScan(p),
    "ph-scanned": () => scanSucceeded(p),
    "ph-cancel": () => { if (state.pc.request === p.id) state.pc.request = null; p.screen = "unpaired"; },
    "ph-menu": () => { phoneMenu = phoneMenu === p.id ? null : p.id; },
    "ph-unpair": () => { unpair(p, false); phoneMenu = null; },
    "ph-del": () => { deleteLocal(p, v); swipeOpen = null; },
    "ph-again": () => mirrorAgain(p, v),
    "ph-bg": () => { p.background = !p.background; },
    "ph-wifi": () => { p.online = !p.online; },
  };
  acts[b.dataset.act]?.();
  render();
});

// Swipe left to reveal "删除"; a long swipe deletes at once.
document.addEventListener("pointerdown", (e) => {
  const fg = e.target.closest(".fg[data-swipe]");
  if (!fg || !fg.dataset.swipe || e.target.closest("[data-act]")) return;
  const [pid, vid] = fg.dataset.swipe.split("|");
  const base = swipeOpen && swipeOpen.p === pid && swipeOpen.v === vid ? -88 : 0;
  drag = { p: pid, v: vid, x0: e.clientX, base, dx: 0, fg };
  fg.classList.add("dragging");
  fg.setPointerCapture(e.pointerId);
});
document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  drag.dx = Math.min(0, drag.base + e.clientX - drag.x0);
  drag.fg.style.transform = `translateX(${drag.dx}px)`;
});
document.addEventListener("pointerup", () => {
  if (!drag) return;
  const { p, v, dx } = drag;
  drag = null;
  if (dx < -170) { deleteLocal(phoneById(p), v); swipeOpen = null; }
  else swipeOpen = dx < -44 ? { p, v } : null;
  render();
});

$("#theme").onclick = (e) => { e.stopPropagation(); state.theme = state.theme === "dark" ? "light" : "dark"; render(); };
$("#add-phone").onclick = (e) => { e.stopPropagation(); addPhone(); render(); };
$("#add-pc-video").onclick = (e) => { e.stopPropagation(); addPcVideo(); render(); };

setInterval(() => { tick(); render(); }, TICK_MS);
render();
