// PROTOTYPE. Poster → video shared-element transition, as in the desktop app
// (app/views/viewTransition.ts): the tapped card's thumbnail flies into the player's video
// box; going back flies it into the card again. Uses `el`, `state` from ios-mvp.js and
// openPlayer / closePlayer from ios-player.js.

const HERO_MS = 380;
const HERO_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
let heroBusy = false;
/** Card whose thumbnail the hero is flying back into (hidden meanwhile; see cardHtml). */
let heroHide = null;

/** A rect relative to the phone shell, which is the hero's positioning box. */
function rectIn(phone, node) {
  const p = phone.getBoundingClientRect(), r = node.getBoundingClientRect();
  return { left: r.left - p.left - phone.clientLeft, top: r.top - p.top - phone.clientTop, width: r.width, height: r.height };
}

function makeHero(phone, from, background) {
  const hero = document.createElement("div");
  hero.className = "hero";
  Object.assign(hero.style, {
    left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, background
  });
  phone.appendChild(hero);
  return hero;
}

const frame = (r, radius) => ({
  left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${radius}px`
});

/** Opens the player for `item`, flying `thumb` (the card's thumbnail) into the video box. */
function openDetail(item, thumb) {
  if (heroBusy) return;
  const phone = document.querySelector(".phone");
  if (!thumb || !phone.animate) return openPlayer(item);
  heroBusy = true;
  const from = rectIn(phone, thumb);
  const lib = el("libraryView"), player = el("playerView"), canvas = player.querySelector(".video-canvas");

  openPlayer(item); // player is now laid out (display: flex)
  const to = rectIn(phone, canvas);
  const hero = makeHero(phone, from, getComputedStyle(thumb).backgroundImage);
  canvas.style.visibility = "hidden";
  lib.classList.add("active", "under"); // keep the library painted underneath while it fades

  hero.animate([frame(from, 8), frame(to, 14)], { duration: HERO_MS, easing: HERO_EASE, fill: "forwards" });
  lib.animate([{ opacity: 1 }, { opacity: 0 }], { duration: HERO_MS * 0.6, fill: "forwards" });
  player.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], { duration: HERO_MS, easing: "ease-out" });

  setTimeout(() => {
    lib.classList.remove("active", "under");
    lib.getAnimations().forEach((a) => a.cancel());
    canvas.style.visibility = "";
    hero.remove();
    heroBusy = false;
  }, HERO_MS);
}

/** Back to the library, flying the video box into the card it came from. */
function closeDetail() {
  if (heroBusy) return;
  const phone = document.querySelector(".phone");
  const id = state.activeVideoId;
  const lib = el("libraryView"), player = el("playerView"), canvas = player.querySelector(".video-canvas");
  if (!phone.animate) return closePlayer();
  heroBusy = true;
  const from = rectIn(phone, canvas);
  const background = el("ambientScene").dataset.poster || "";

  heroHide = id;
  closePlayer(); // library visible again (and re-rendered by the next tick)
  renderAll();
  const thumb = el("libraryList").querySelector(`.card[data-id="${id}"] .thumb`);
  const hero = makeHero(phone, from, background);
  const done = () => { heroHide = null; hero.remove(); renderAll(); heroBusy = false; };
  if (!thumb) {
    hero.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
    return setTimeout(done, 200);
  }
  const to = rectIn(phone, thumb);
  hero.animate([frame(from, 14), frame(to, 8)], { duration: HERO_MS, easing: HERO_EASE, fill: "forwards" });
  lib.animate([{ opacity: 0 }, { opacity: 1 }], { duration: HERO_MS * 0.7, easing: "ease-out" });
  setTimeout(done, HERO_MS);
}
