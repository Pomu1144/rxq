/* rxq blazing-assets: the art pulled out of the Naruto Blazing IPA (rxq tools/blazing_pack.py), shipped inside the
 * app at assets/blazing/. Works in every build: the full app serves it from its own files, the live / lite apps load
 * pages from the website and read this folder from the app (capacitor://localhost).
 *
 *   await BlazingAssets.ready                       // manifest loaded (resolves to null if the pack isn't in the app)
 *   BlazingAssets.url('textures/.../page_bg.png')   // URL of any file in the pack
 *   await BlazingAssets.sprite('CommonAtlas', 'close_btn')   // { url, w, h, border: [l, r, t, b] } or null
 *   BlazingAssets.textures(/bg/)                    // texture paths matching a pattern
 *   await BlazingAssets.unit('0402')                // character rig, ready for SSPlayer (null if not in the pack)
 *   BlazingAssets.nineSlice(el, sprite)             // style an element with a 9-sliced UI sprite (border-image)
 */
(function (global) {
  'use strict';
  const inApp = location.protocol === 'capacitor:' || location.protocol === 'ionic:';
  // global.BLAZING_BASE (set before this script) points the pack somewhere else, e.g. for testing in a browser
  const BASE = global.BLAZING_BASE || ((inApp ? '' : 'capacitor://localhost/') + 'assets/blazing/');
  const abs = (p) => new URL(BASE + p, document.baseURI).href;

  let manifest = null;
  const ready = fetch(abs('manifest.json'))
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => (manifest = m))
    .catch(() => null);
  const atlasCache = {};

  function atlas(name) {
    if (!atlasCache[name]) {
      atlasCache[name] = ready.then((m) => {
        const a = m && m.ui && m.ui[name];
        if (!a || !a.index) return null;
        return fetch(abs(a.index)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      });
    }
    return atlasCache[name];
  }

  const BlazingAssets = {
    ready,
    base: BASE,
    get manifest() { return manifest; },
    url: abs,
    atlases() { return manifest ? Object.keys(manifest.ui).filter((k) => !k.startsWith('_')) : []; },
    async sprite(atlasName, spriteName) {
      const a = await atlas(atlasName);
      const s = a && a[spriteName];
      return s ? { url: abs(s.file), w: s.w, h: s.h, border: s.border } : null;
    },
    async spriteNames(atlasName) { const a = await atlas(atlasName); return a ? Object.keys(a) : []; },
    textures(pattern) {
      if (!manifest) return [];
      const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
      return Object.keys(manifest.textures).filter((p) => re.test(p));
    },
    async unit(id) {
      const m = await ready;
      const u = m && m.units && m.units[id];
      if (!u || !global.SSPlayer) return null;
      return global.SSPlayer.load(abs(u.base));
    },
    nineSlice(el, s, scale) {
      if (!el || !s) return;
      const k = scale || 1;
      const [l, r, t, b] = s.border || [0, 0, 0, 0];
      el.style.borderStyle = 'solid';
      el.style.borderColor = 'transparent';
      el.style.borderWidth = `${t * k}px ${r * k}px ${b * k}px ${l * k}px`;
      el.style.borderImage = `url("${s.url}") ${t} ${r} ${b} ${l} fill / ${t * k}px ${r * k}px ${b * k}px ${l * k}px / 0 stretch`;
    },
  };
  global.BlazingAssets = BlazingAssets;
})(window);
