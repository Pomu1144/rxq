/* rxq-offline: inside the offline app (Wisdom builds) the rxq game draws characters that have no sprite sheets from
 * the offline game's own SpriteStudio rigs, read straight from its Unity bundles (SSUnity) through the app's asset
 * server (window.RXQ_OFFLINE.base). Characters with sheets keep them.
 *
 * Wraps window.SpritePlayer when the page defines it:
 *   has(id)       also true for characters whose Blazing rig is on the device (blazing-unit-map.json, animReady)
 *   pathFor(id)   'ss:<id>' for those
 *   create(...)   for 'ss:' bases: a player with SpritePlayer's interface (play / setState / meta / showFrame / ...)
 *                 that draws the rig on a canvas
 *   preload(...)  for 'ss:' bases: the sheet's metadata
 * Sheets map to the rig's clips: idle, run, attack (2 hits), jutsu, ultimate, hit, ko. A rig that fails to load makes
 * play() reject, and the battle falls back to the portrait as it does for a missing sheet.
 */
(function (global) {
  'use strict';
  const CFG = global.RXQ_OFFLINE || {};
  const BASE = CFG.base || 'rxq://app/blazing/';
  const mapP = fetch(CFG.map || 'rxq://app/_rxq/blazing-unit-map.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  let MAP = {};
  mapP.then((m) => { MAP = m || {}; });

  const usable = (id) => { const r = MAP[id]; return !!(r && (r.animReady || CFG.all)); };
  const rigOf = {};
  function rig(id) {
    if (!rigOf[id]) {
      rigOf[id] = mapP.then(() => {
        const r = MAP[id];
        if (!r || !global.SSUnity) throw new Error('rxq-offline: no rig for ' + id);
        return global.SSUnity.loadPaths(BASE, r).then((ch) => ({ ch, rec: r, clips: pickClips(ch) }));
      });
      rigOf[id].catch(() => { delete rigOf[id]; });
    }
    return rigOf[id];
  }

  // clip names: <category><sprite id 4><action 5><L|R>; category 0 = moves, 1 = attack, 2 = secret technique,
  // 3 = ninjutsu. The R clips face right, like the game's sheets.
  function pickClips(ch) {
    const names = ch.clipNames();
    const side = names.some((n) => n.endsWith('R')) ? 'R' : 'L';
    const of = (re) => names.filter((n) => n.endsWith(side) && re.test(n)).sort();
    const first = (...lists) => { for (const l of lists) if (l.length) return l[0]; return null; };
    const moves = of(/^0/);
    const idle = first(of(/^3\d{4}10001/), moves.filter((n) => /00004[LR]$/.test(n)), of(/^3/), moves);
    return {
      flipRight: side === 'L',                      // only left-facing clips: mirror them
      idle,
      run: first(moves.filter((n) => /00002[LR]$/.test(n)), [idle]),
      attack: first(of(/^1/), [idle]),
      jutsu: first(of(/^3\d{4}20001/), of(/^3/).filter((n) => n !== idle), of(/^1/)),
      ultimate: first(of(/^2/), of(/^3\d{4}20001/), of(/^1/)),
      hit: first(moves.filter((n) => /00003[LR]$/.test(n)), [idle]),
      ko: first(moves.filter((n) => /00003[LR]$/.test(n)), [idle]),
    };
  }

  const LOOP = { idle: true, run: true };
  function metaFor(r, name) {
    const clip = r.clips[name];
    if (!clip) return null;
    const c = r.ch.clips[clip];
    let frames = c.frames;
    if (name === 'hit') frames = Math.min(frames, Math.round(0.25 * c.fps) + 1);
    const hits = name === 'attack' ? [Math.round(frames * 0.46), Math.round(frames * 0.61)]
      : name === 'jutsu' ? [Math.round(frames * 0.6)]
      : name === 'ultimate' ? Array.from({ length: 6 }, (_, k) => Math.round(frames * (0.45 + k * 0.08)))
      : [];
    return { clip, frames, fps: c.fps, loop: !!LOOP[name], hits: hits.filter((h) => h < frames), heightScale: 1, anchorX: 0.5, ss: true };
  }

  // height of the character (rig units) from its idle pose, to scale it like a sheet
  const tall = new WeakMap();
  function bodyHeight(r) {
    if (tall.has(r)) return tall.get(r);
    const cv = document.createElement('canvas'); cv.width = 600; cv.height = 600;
    const ctx = cv.getContext('2d');
    r.ch.draw(ctx, r.clips.idle, 0, 300, 560, 1);
    const d = ctx.getImageData(0, 0, 600, 600).data;
    let top = 560;
    for (let y = 0; y < 560; y++) { let hit = false; for (let x = 0; x < 600; x += 2) if (d[(y * 600 + x) * 4 + 3] > 40) { hit = true; break; } if (hit) { top = y; break; } }
    const h = Math.max(60, 560 - top);
    tall.set(r, h);
    return h;
  }

  function createSS(container, base, opts) {
    opts = opts || {};
    const id = base.slice(3);
    const el = document.createElement('canvas');
    el.className = 'sprite-player sprite-player--ss';
    el.style.display = 'block';
    if (opts.flip) el.style.transform = 'scaleX(-1)';
    container.appendChild(el);
    const ctx = el.getContext('2d');
    let token = 0, raf = 0, current = null, shown = null, lastName = null;
    let drawn; const firstDraw = new Promise((res) => { drawn = res; });
    const dpr = Math.min(2, global.devicePixelRatio || 1);

    function size(r) {
      const h = Math.round((opts.height || 101) * 1.25), w = Math.round(h * 1.5);
      if (el.width !== w * dpr) { el.width = w * dpr; el.height = h * dpr; el.style.width = w + 'px'; el.style.height = h + 'px'; }
      return { w, h, scale: ((opts.height || 101) / bodyHeight(r)) * dpr };
    }
    function paint(r, m, i) {
      const { w, h, scale } = size(r);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, el.width, el.height);
      r.ch.draw(ctx, m.clip, i, (w / 2) * dpr, (h - 4) * dpr, scale, { flipX: r.clips.flipRight });
      el.dataset.frame = i; shown = [r, m, i]; drawn();
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    async function play(name, o) {
      o = o || {};
      const my = ++token; current = name;
      const r = await rig(id);
      if (my !== token) return;
      const m = metaFor(r, name);
      if (!m) throw new Error('rxq-offline: no ' + name + ' clip for ' + id);
      lastName = name; el.dataset.anim = name;
      stop();
      const frameMs = 1000 / (m.fps * (o.speed || 1)), start = performance.now();
      const hitIdx = new Map(m.hits.map((f, k) => [f, k]));
      const oneShot = !m.loop || !!o.then;
      let reached = -1;
      const safe = (fn, ...a) => { try { fn(...a); } catch (e) { console.error('[rxq-offline] callback', e); } };
      const fireUpTo = (n) => { while (reached < n) { reached++; if (o.onFrame) safe(o.onFrame, reached); if (o.onHit && hitIdx.has(reached)) safe(o.onHit, hitIdx.get(reached), reached); } };
      return new Promise((resolve) => {
        const tick = (now) => {
          if (my !== token) return resolve();
          let i = Math.max(0, Math.floor((now - start) / frameMs));
          if (i >= m.frames) {
            if (!oneShot) i %= m.frames;
            else { fireUpTo(m.frames - 1); stop(); if (o.onEnd) safe(o.onEnd); resolve(); if (o.then && my === token) play(o.then); return; }
          }
          paint(r, m, i);
          if (oneShot) fireUpTo(i);
          raf = requestAnimationFrame(tick);
        };
        paint(r, m, 0); if (oneShot) fireUpTo(0);
        raf = requestAnimationFrame(tick);
      });
    }
    return {
      el, play, stop, firstDraw,
      setState(name, o) { return current === name ? Promise.resolve() : play(name, o); },
      meta(name) { return rig(id).then((r) => metaFor(r, name) || Promise.reject(new Error('no ' + name))); },
      showFrame(i) { if (!lastName) return; rig(id).then((r) => { const m = metaFor(r, lastName); if (m) { stop(); paint(r, m, Math.max(0, Math.min(m.frames - 1, i))); } }); },
      warm() { return rig(id).then(() => {}, () => {}); },
      get current() { return current; },
      destroy() { token++; current = null; stop(); el.remove(); },
    };
  }

  function wrap(SP) {
    if (!SP || SP.__rxqOffline) return SP;
    const o = { has: SP.has, pathFor: SP.pathFor, basePathFor: SP.basePathFor, create: SP.create, preload: SP.preload };
    SP.has = (id) => o.has(id) || usable(id);
    SP.pathFor = (id, opt) => o.pathFor(id, opt) || (usable(id) ? 'ss:' + id : null);
    SP.basePathFor = (id) => o.basePathFor(id) || (usable(id) ? 'ss:' + id : null);
    SP.create = (c, base, opt) => (typeof base === 'string' && base.startsWith('ss:') ? createSS(c, base, opt) : o.create(c, base, opt));
    SP.preload = (base, name, opt) => (typeof base === 'string' && base.startsWith('ss:')
      ? rig(base.slice(3)).then((r) => metaFor(r, name) || Promise.reject(new Error('no ' + name)))
      : o.preload(base, name, opt));
    SP.__rxqOffline = true;
    return SP;
  }
  // SpritePlayer is assigned by the page's own script after this runs: wrap it as it lands
  let held = global.SpritePlayer ? wrap(global.SpritePlayer) : undefined;
  try {
    Object.defineProperty(global, 'SpritePlayer', { configurable: true, get: () => held, set: (v) => { held = wrap(v); } });
  } catch (e) { /* already defined and locked: nothing to do */ }
  global.RxqOffline = { map: () => MAP, ready: mapP, rig, usable };
})(window);
