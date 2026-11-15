/* rxq ss-player: draws Naruto Blazing characters (SpriteStudio rigs converted by rxq tools/ss_convert.py).
 *
 *   const ch = await SSPlayer.load('assets/ss/0402/');      // rig.json + map textures
 *   ch.draw(ctx, '0040200002L', frame, x, y, scale)          // one frame, feet at (x, y)
 *   const a = ch.play(canvas, clip, { loop: true, scale })    // or animate on a canvas; a.stop()
 *
 * Each part: a cell (rectangle of a texture) drawn at the part's transform (parent transform x position x
 * rotation x scale), offset by the cell's pivot, with per-corner offsets (vertLB/RB/LT/RT), flips, alpha
 * (multiplied down the tree when the part inherits it) and a blend mode (0 normal, 1 multiply, 2 add, 3 subtract).
 * Parts are drawn in priority order (prio), ties by part order. Y is up in the rig, down on the canvas.
 */
(function (global) {
  'use strict';
  const BLEND = ['source-over', 'multiply', 'lighter', 'difference'];
  const DEG = Math.PI / 180;

  function loadImage(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('ss-player: cannot load ' + src));
      im.src = src;
    });
  }

  class SSCharacter {
    constructor(rig, images) {
      this.rig = rig;
      this.images = images;
      this.parts = rig.parts;
      this.cells = rig.cells;
      this.clips = rig.clips;
      this.n = rig.parts.length;
      // scratch arrays for one frame
      this.wm = new Float32Array(this.n * 6); // world matrix a b c d e f
      this.wa = new Float32Array(this.n);     // world alpha
      this.vis = new Uint8Array(this.n);
    }

    clipNames() { return Object.keys(this.clips); }
    frames(clip) { const c = this.clips[clip]; return c ? c.frames : 0; }
    fps(clip) { const c = this.clips[clip]; return c ? c.fps : 30; }

    _val(tr, f, frame, def) {
      if (!tr) return def;
      const v = tr[f];
      if (v === undefined) return def;
      return typeof v === 'number' ? v : v[Math.min(frame, v.length - 1)];
    }

    /** Draw frame `frame` of `clip` with the rig origin (feet) at (x, y), `scale` canvas px per rig unit. */
    draw(ctx, clip, frame, x, y, scale, opts) {
      const c = this.clips[clip];
      if (!c) return;
      const tracks = c.tracks, parts = this.parts, n = this.n, wm = this.wm, wa = this.wa, vis = this.vis;
      const flipX = opts && opts.flipX ? -1 : 1;
      frame = Math.max(0, Math.min(c.frames - 1, frame | 0));
      const order = [];
      for (let i = 0; i < n; i++) {
        const p = parts[i], tr = tracks[i];
        const par = p.parent;
        // parts the clip never touches stay hidden
        let show = tr ? this._val(tr, 'show', frame, 1) : 0;
        if (par >= 0 && !vis[par] && p.inheritHide !== 0) show = show && 1;
        const px = this._val(tr, 'pos.x', frame, 0), py = this._val(tr, 'pos.y', frame, 0);
        const rz = this._val(tr, 'rot.z', frame, 0) * DEG;
        let sx = this._val(tr, 'scl.x', frame, 1), sy = this._val(tr, 'scl.y', frame, 1);
        const rx = this._val(tr, 'rot.x', frame, 0), ry = this._val(tr, 'rot.y', frame, 0);
        if (ry) sx *= Math.cos(ry * DEG);
        if (rx) sy *= Math.cos(rx * DEG);
        const cs = Math.cos(rz), sn = Math.sin(rz);
        // local = T(px,py) R(rz) S(sx,sy)
        const la = cs * sx, lb = sn * sx, lc = -sn * sy, ld = cs * sy, le = px, lf = py;
        const o = i * 6;
        if (par < 0) {
          wm[o] = la; wm[o + 1] = lb; wm[o + 2] = lc; wm[o + 3] = ld; wm[o + 4] = le; wm[o + 5] = lf;
          wa[i] = this._val(tr, 'alpha', frame, 1);
          vis[i] = show ? 1 : 0;
        } else {
          const q = par * 6;
          const A = wm[q], B = wm[q + 1], C = wm[q + 2], D = wm[q + 3], E = wm[q + 4], F = wm[q + 5];
          wm[o] = A * la + C * lb; wm[o + 1] = B * la + D * lb;
          wm[o + 2] = A * lc + C * ld; wm[o + 3] = B * lc + D * ld;
          wm[o + 4] = A * le + C * lf + E; wm[o + 5] = B * le + D * lf + F;
          const al = this._val(tr, 'alpha', frame, 1);
          wa[i] = p.inheritAlpha ? al * wa[par] : al;
          vis[i] = show && vis[par] ? 1 : 0;
        }
        if (vis[i] && p.type === 1 && wa[i] > 0.004) {
          const cell = this._val(tr, 'cellId', frame, -1);
          if (cell >= 0 && this.cells[cell]) order.push([this._val(tr, 'prio', frame, 0), i, cell]);
        }
      }
      order.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

      ctx.save();
      for (const [, i, ci] of order) {
        const p = parts[i], tr = tracks[i], cell = this.cells[ci];
        const img = this.images[cell.map];
        if (!img) continue;
        const o = i * 6;
        const w = cell.w, h = cell.h;
        // quad corners in part space (y up); the pivot moves the quad so that the part's origin sits on it
        const cx = -cell.px * w, cy = -cell.py * h;
        const l = cx - w / 2, r = cx + w / 2, b = cy - h / 2, t = cy + h / 2;
        const vLB = [l + this._val(tr, 'vertLB.x', frame, 0), b + this._val(tr, 'vertLB.y', frame, 0)];
        const vRB = [r + this._val(tr, 'vertRB.x', frame, 0), b + this._val(tr, 'vertRB.y', frame, 0)];
        const vLT = [l + this._val(tr, 'vertLT.x', frame, 0), t + this._val(tr, 'vertLT.y', frame, 0)];
        const vRT = [r + this._val(tr, 'vertRT.x', frame, 0), t + this._val(tr, 'vertRT.y', frame, 0)];
        // texture rectangle (png pixels, y down); flips swap its sides
        let u0 = cell.x, u1 = cell.x + w, v0 = cell.y, v1 = cell.y + h; // v0 = top
        if (this._val(tr, 'flpH', frame, 0)) { const tmp = u0; u0 = u1; u1 = tmp; }
        if (this._val(tr, 'flpV', frame, 0)) { const tmp = v0; v0 = v1; v1 = tmp; }
        // to canvas: world (y up) -> screen
        const A = wm[o], B = wm[o + 1], C = wm[o + 2], D = wm[o + 3], E = wm[o + 4], F = wm[o + 5];
        const sc = (v) => [x + flipX * (A * v[0] + C * v[1] + E) * scale, y - (B * v[0] + D * v[1] + F) * scale];
        const sLB = sc(vLB), sRB = sc(vRB), sLT = sc(vLT), sRT = sc(vRT);
        ctx.globalAlpha = Math.min(1, wa[i]);
        ctx.globalCompositeOperation = BLEND[p.blend] || 'source-over';
        // two triangles: LT RT LB  and  RT RB LB
        tri(ctx, img, sLT, sRT, sLB, [u0, v0], [u1, v0], [u0, v1]);
        tri(ctx, img, sRT, sRB, sLB, [u1, v0], [u1, v1], [u0, v1]);
      }
      ctx.restore();
    }

    play(canvas, clip, opts) {
      opts = opts || {};
      const ctx = canvas.getContext('2d');
      const fps = this.fps(clip), total = this.frames(clip);
      let start = performance.now(), raf = 0, stopped = false;
      const loop = () => {
        if (stopped) return;
        let f = Math.floor((performance.now() - start) / 1000 * fps);
        if (f >= total) {
          if (opts.loop) { start = performance.now(); f = 0; }
          else { f = total - 1; stopped = true; if (opts.onEnd) opts.onEnd(); }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.draw(ctx, clip, f, opts.x != null ? opts.x : canvas.width / 2, opts.y != null ? opts.y : canvas.height * 0.92, opts.scale || 1, opts);
        if (!stopped) raf = requestAnimationFrame(loop);
      };
      loop();
      return { stop() { stopped = true; cancelAnimationFrame(raf); } };
    }
  }

  // draw the image triangle (t0 t1 t2, texture px) onto the screen triangle (s0 s1 s2)
  function tri(ctx, img, s0, s1, s2, t0, t1, t2) {
    const x0 = s0[0], y0 = s0[1], x1 = s1[0], y1 = s1[1], x2 = s2[0], y2 = s2[1];
    const u0 = t0[0], v0 = t0[1], u1 = t1[0], v1 = t1[1], u2 = t2[0], v2 = t2[1];
    const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (!det) return;
    const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det;
    const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det;
    const c = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det;
    const d = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det;
    const e = x0 - a * u0 - c * v0, f = y0 - b * u0 - d * v0;
    ctx.save();
    // clip slightly enlarged so neighbouring triangles leave no seam
    const mx = (x0 + x1 + x2) / 3, my = (y0 + y1 + y2) / 3, g = 0.6;
    const ex = (px, py) => { const dx = px - mx, dy = py - my, L = Math.hypot(dx, dy) || 1; return [px + dx / L * g, py + dy / L * g]; };
    const p0 = ex(x0, y0), p1 = ex(x1, y1), p2 = ex(x2, y2);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath(); ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  const cache = {};
  const SSPlayer = {
    /** base: folder URL ending in '/', holding rig.json and the map pngs */
    load(base) {
      if (!cache[base]) {
        cache[base] = fetch(base + 'rig.json').then((r) => {
          if (!r.ok) throw new Error('ss-player: no rig at ' + base);
          return r.json();
        }).then(async (rig) => {
          const images = {};
          for (const k of Object.keys(rig.maps)) images[k] = await loadImage(base + rig.maps[k].file);
          return new SSCharacter(rig, images);
        });
        cache[base].catch(() => { delete cache[base]; });
      }
      return cache[base];
    },
    SSCharacter,
  };
  global.SSPlayer = SSPlayer;
})(window);
