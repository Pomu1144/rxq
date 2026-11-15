/* rxq ss-unity: reads Naruto Blazing character rigs straight from the game's Unity asset bundles, in the browser /
 * web view (no conversion step). Makes the same rig as rxq tools/ss_convert.py and hands it to SSPlayer.
 *
 *   const ch = await SSUnity.loadUnit('http://127.0.0.1:18080/assets/', '0402')   // -> SSPlayer character
 *   const rig = await SSUnity.convert(prefabBytes, animBytes, commonUnitBytes)    // -> { rig, images }
 *
 * Supports what these bundles use: UnityFS (none / LZ4 / LZ4HC blocks), serialized files with type trees
 * (Unity 2018.x, format 17-22), Texture2D in RGBA4444 / RGBA32 / ARGB32 / RGB24 / RGB565 / Alpha8, and
 * AnimationClips stored as streamed (Mecanim) curves.
 */
(function (global) {
  'use strict';
  const COMMON = "AABB\u0000AnimationClip\u0000AnimationCurve\u0000AnimationState\u0000Array\u0000Base\u0000BitField\u0000bitset\u0000bool\u0000char\u0000ColorRGBA\u0000Component\u0000data\u0000deque\u0000double\u0000dynamic_array\u0000FastPropertyName\u0000first\u0000float\u0000Font\u0000GameObject\u0000Generic Mono\u0000GradientNEW\u0000GUID\u0000GUIStyle\u0000int\u0000list\u0000long long\u0000map\u0000Matrix4x4f\u0000MdFour\u0000MonoBehaviour\u0000MonoScript\u0000m_ByteSize\u0000m_Curve\u0000m_EditorClassIdentifier\u0000m_EditorHideFlags\u0000m_Enabled\u0000m_ExtensionPtr\u0000m_GameObject\u0000m_Index\u0000m_IsArray\u0000m_IsStatic\u0000m_MetaFlag\u0000m_Name\u0000m_ObjectHideFlags\u0000m_PrefabInternal\u0000m_PrefabParentObject\u0000m_Script\u0000m_StaticEditorFlags\u0000m_Type\u0000m_Version\u0000Object\u0000pair\u0000PPtr<Component>\u0000PPtr<GameObject>\u0000PPtr<Material>\u0000PPtr<MonoBehaviour>\u0000PPtr<MonoScript>\u0000PPtr<Object>\u0000PPtr<Prefab>\u0000PPtr<Sprite>\u0000PPtr<TextAsset>\u0000PPtr<Texture>\u0000PPtr<Texture2D>\u0000PPtr<Transform>\u0000Prefab\u0000Quaternionf\u0000Rectf\u0000RectInt\u0000RectOffset\u0000second\u0000set\u0000short\u0000size\u0000SInt16\u0000SInt32\u0000SInt64\u0000SInt8\u0000staticvector\u0000string\u0000TextAsset\u0000TextMesh\u0000Texture\u0000Texture2D\u0000Transform\u0000TypelessData\u0000UInt16\u0000UInt32\u0000UInt64\u0000UInt8\u0000unsigned int\u0000unsigned long long\u0000unsigned short\u0000vector\u0000Vector2f\u0000Vector3f\u0000Vector4f\u0000m_ScriptingClassIdentifier\u0000Gradient\u0000Type*\u0000int2_storage\u0000int3_storage\u0000BoundsInt\u0000m_CorrespondingSourceObject\u0000m_PrefabInstance\u0000m_PrefabAsset\u0000FileSize\u0000Hash128\u0000RenderingLayerMask\u0000fixed_array\u0000EntityId\u0000LoadableObjectId\u0000LoadableSceneId\u0000";

  // ── bytes ──────────────────────────────────────────────────────────────────────────────────────────────────
  class Reader {
    constructor(u8, little) { this.u8 = u8; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.p = 0; this.le = !!little; }
    align(n) { this.p = (this.p + n - 1) & ~(n - 1); }
    u8v() { return this.u8[this.p++]; }
    i8() { return this.dv.getInt8(this.p++); }
    u16() { const v = this.dv.getUint16(this.p, this.le); this.p += 2; return v; }
    i16() { const v = this.dv.getInt16(this.p, this.le); this.p += 2; return v; }
    u32() { const v = this.dv.getUint32(this.p, this.le); this.p += 4; return v; }
    i32() { const v = this.dv.getInt32(this.p, this.le); this.p += 4; return v; }
    f32() { const v = this.dv.getFloat32(this.p, this.le); this.p += 4; return v; }
    f64() { const v = this.dv.getFloat64(this.p, this.le); this.p += 8; return v; }
    i64() { const lo = this.dv.getUint32(this.p + (this.le ? 0 : 4), this.le), hi = this.dv.getInt32(this.p + (this.le ? 4 : 0), this.le); this.p += 8; return hi * 4294967296 + lo; }
    u64() { const lo = this.dv.getUint32(this.p + (this.le ? 0 : 4), this.le), hi = this.dv.getUint32(this.p + (this.le ? 4 : 0), this.le); this.p += 8; return hi * 4294967296 + lo; }
    bytes(n) { const b = this.u8.subarray(this.p, this.p + n); this.p += n; return b; }
    cstr() { let e = this.p; while (this.u8[e] !== 0) e++; const s = utf8(this.u8.subarray(this.p, e)); this.p = e + 1; return s; }
  }
  const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  function utf8(b) { return dec ? dec.decode(b) : Buffer.from(b).toString('utf8'); }

  function lz4(src, outLen) {
    const out = new Uint8Array(outLen);
    let s = 0, d = 0;
    while (s < src.length) {
      const tok = src[s++];
      let lit = tok >> 4;
      if (lit === 15) { let b; do { b = src[s++]; lit += b; } while (b === 255); }
      out.set(src.subarray(s, s + lit), d); s += lit; d += lit;
      if (s >= src.length) break;
      const off = src[s] | (src[s + 1] << 8); s += 2;
      let m = tok & 15;
      if (m === 15) { let b; do { b = src[s++]; m += b; } while (b === 255); }
      m += 4;
      let from = d - off;
      for (let i = 0; i < m; i++) out[d++] = out[from++];
    }
    return out;
  }
  function decompress(b, flags, size) {
    const kind = flags & 0x3f;
    if (kind === 0) return b;
    if (kind === 2 || kind === 3) return lz4(b, size);
    throw new Error('ss-unity: unsupported compression ' + kind);
  }

  // ── UnityFS bundle -> { name: Uint8Array } ───────────────────────────────────────────────────────────────────
  function readBundle(u8) {
    const r = new Reader(u8, false);
    const sig = r.cstr();
    if (sig !== 'UnityFS') throw new Error('ss-unity: not a UnityFS bundle (' + sig + ')');
    const ver = r.u32(); r.cstr(); r.cstr();
    r.i64(); const cs = r.u32(), us = r.u32(), flags = r.u32();
    if (ver >= 7) r.align(16);
    let infoBytes;
    if (flags & 0x80) { infoBytes = u8.subarray(u8.length - cs, u8.length); }
    else { infoBytes = r.bytes(cs); }
    const info = new Reader(decompress(infoBytes, flags, us), false);
    info.p += 16;
    const nb = info.i32(), blocks = [];
    for (let i = 0; i < nb; i++) blocks.push({ us: info.u32(), cs: info.u32(), f: info.u16() });
    const nn = info.i32(), nodes = [];
    for (let i = 0; i < nn; i++) nodes.push({ off: info.i64(), size: info.i64(), flags: info.u32(), path: info.cstr() });
    if (flags & 0x200) r.align(16);
    let total = 0; for (const b of blocks) total += b.us;
    const data = new Uint8Array(total);
    let o = 0;
    for (const b of blocks) { data.set(decompress(r.bytes(b.cs), b.f, b.us), o); o += b.us; }
    const files = {};
    for (const n of nodes) files[n.path] = data.subarray(n.off, n.off + n.size);
    return files;
  }

  // ── serialized file (format 17..22) with type trees ─────────────────────────────────────────────────────────
  function readSerialized(u8) {
    const h = new Reader(u8, false);
    h.u32(); h.u32(); const version = h.u32(); let dataOff = h.u32();
    if (version < 17 || version > 22) throw new Error('ss-unity: serialized format ' + version + ' not supported');
    const big = h.u8v(); h.p += 3;
    if (version >= 22) { h.u32(); h.i64(); dataOff = h.i64(); h.i64(); }
    const r = new Reader(u8, !big); r.p = h.p;
    r.cstr(); r.i32(); const hasTree = r.u8v();
    const ntypes = r.i32(), types = [];
    for (let i = 0; i < ntypes; i++) {
      const t = { classID: r.i32() }; r.u8v(); t.scriptIndex = r.i16();
      if (t.classID === 114 || t.classID < 0 || (version >= 17 && t.scriptIndex >= 0)) r.p += 16;
      r.p += 16;
      if (hasTree) {
        const nNodes = r.i32(), sbSize = r.i32(), nodes = [];
        for (let k = 0; k < nNodes; k++) {
          const nd = { ver: r.u16(), level: r.u8v(), flags: r.u8v(), tOff: r.u32(), nOff: r.u32(), size: r.i32(), index: r.i32(), meta: r.u32() };
          if (version >= 19) r.u64();
          nodes.push(nd);
        }
        const sb = r.bytes(sbSize);
        const str = (off) => {
          if (off & 0x80000000) { const o = off & 0x7fffffff; return COMMON.slice(o, COMMON.indexOf('\0', o)); }
          let e = off; while (sb[e] !== 0) e++; return utf8(sb.subarray(off, e));
        };
        for (const nd of nodes) { nd.type = str(nd.tOff); nd.name = str(nd.nOff); }
        t.nodes = nodes;
        if (version >= 21) { const n = r.i32(); r.p += 4 * n; }
      }
      types.push(t);
    }
    const nobj = r.i32(), objects = [];
    for (let i = 0; i < nobj; i++) {
      r.align(4);
      const o = { pathID: r.i64(), start: version >= 22 ? r.i64() : r.u32(), size: r.u32(), typeIndex: r.i32() };
      o.start += dataOff;
      o.type = types[o.typeIndex];
      objects.push(o);
    }
    return { objects, le: !big, u8, read: (o) => readTree(new Reader(u8, !big), o) };
  }

  // generic type-tree reader -> plain objects
  function readTree(r, obj) {
    r.p = obj.start;
    const nodes = obj.type.nodes;
    if (!nodes) throw new Error('ss-unity: no type tree');
    let i = 0;
    function children(idx) {
      const lv = nodes[idx].level, out = [];
      for (let k = idx + 1; k < nodes.length && nodes[k].level > lv; k++) if (nodes[k].level === lv + 1) out.push(k);
      return out;
    }
    function read(idx) {
      const n = nodes[idx];
      let v;
      const ch = children(idx);
      switch (n.type) {
        case 'SInt8': v = r.i8(); break;
        case 'UInt8': case 'char': v = r.u8v(); break;
        case 'bool': v = r.u8v() !== 0; break;
        case 'SInt16': case 'short': v = r.i16(); break;
        case 'UInt16': case 'unsigned short': v = r.u16(); break;
        case 'SInt32': case 'int': v = r.i32(); break;
        case 'UInt32': case 'unsigned int': case 'Type*': v = r.u32(); break;
        case 'SInt64': case 'long long': v = r.i64(); break;
        case 'UInt64': case 'unsigned long long': case 'FileSize': v = r.u64(); break;
        case 'float': v = r.f32(); break;
        case 'double': v = r.f64(); break;
        case 'string': { const len = r.i32(); v = utf8(r.bytes(len)); r.align(4); break; }
        case 'TypelessData': { const len = r.i32(); v = r.bytes(len); break; }
        default:
          if (ch.length === 1 && nodes[ch[0]].type === 'Array') {
            v = readArray(ch[0]);
            if (nodes[ch[0]].meta & 0x4000) r.align(4);
          } else if (n.type === 'Array') {
            v = readArray(idx);
          } else {
            v = {};
            for (const c of ch) v[nodes[c].name] = read(c);
          }
      }
      if (n.meta & 0x4000) r.align(4);
      return v;
    }
    function readArray(aidx) {
      const ch = children(aidx);           // [size, data]
      const size = r.i32();
      const di = ch[1], dn = nodes[di];
      if (dn.type === 'UInt8' || dn.type === 'char') { return r.bytes(size); }
      if (dn.type === 'UInt32' || dn.type === 'unsigned int') { const a = new Uint32Array(size); for (let k = 0; k < size; k++) a[k] = r.u32(); return a; }
      if (dn.type === 'float') { const a = new Float32Array(size); for (let k = 0; k < size; k++) a[k] = r.f32(); return a; }
      const out = new Array(size);
      for (let k = 0; k < size; k++) out[k] = read(di);
      return out;
    }
    return read(0);
  }

  // ── textures ─────────────────────────────────────────────────────────────────────────────────────────────────
  function textureRGBA(t, files) {
    const w = t.m_Width, h = t.m_Height, fmt = t.m_TextureFormat;
    let data = t['image data'];
    if ((!data || !data.length) && t.m_StreamData && t.m_StreamData.size) {
      const name = String(t.m_StreamData.path).split('/').pop();
      const src = files[name] || Object.entries(files).find(([k]) => k.endsWith(name))?.[1];
      if (!src) throw new Error('ss-unity: texture stream ' + name + ' missing');
      data = src.subarray(t.m_StreamData.offset, t.m_StreamData.offset + t.m_StreamData.size);
    }
    const out = new Uint8ClampedArray(w * h * 4);
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let y = 0; y < h; y++) {
      const sy = h - 1 - y;            // Unity rows are bottom-up
      for (let x = 0; x < w; x++) {
        const i = sy * w + x, o = (y * w + x) * 4;
        let R, G, B, A;
        switch (fmt) {
          case 13: { const v = dv.getUint16(i * 2, true); R = (v >> 12) * 17; G = ((v >> 8) & 15) * 17; B = ((v >> 4) & 15) * 17; A = (v & 15) * 17; break; }
          case 4: R = data[i * 4]; G = data[i * 4 + 1]; B = data[i * 4 + 2]; A = data[i * 4 + 3]; break;
          case 5: A = data[i * 4]; R = data[i * 4 + 1]; G = data[i * 4 + 2]; B = data[i * 4 + 3]; break;
          case 3: R = data[i * 3]; G = data[i * 3 + 1]; B = data[i * 3 + 2]; A = 255; break;
          case 7: { const v = dv.getUint16(i * 2, true); R = ((v >> 11) & 31) * 255 / 31; G = ((v >> 5) & 63) * 255 / 63; B = (v & 31) * 255 / 31; A = 255; break; }
          case 1: R = G = B = 255; A = data[i]; break;
          case 2: { const v = dv.getUint16(i * 2, true); A = (v >> 12) * 17; R = ((v >> 8) & 15) * 17; G = ((v >> 4) & 15) * 17; B = (v & 15) * 17; break; }
          default: throw new Error('ss-unity: texture format ' + fmt + ' not supported');
        }
        out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = A;
      }
    }
    return { width: w, height: h, data: out };
  }

  // ── animation clips (streamed Mecanim curves) ───────────────────────────────────────────────────────────────
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(s) { let c = 0xffffffff; const b = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Buffer.from(s); for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  const F114 = ['prio', 'pos.x', 'pos.y', 'pos.z', 'rot.x', 'rot.y', 'rot.z', 'alpha', 'cellId', 'show', 'vertLB.x', 'vertLB.y', 'vertRB.x', 'vertRB.y',
    'vertLT.x', 'vertLT.y', 'vertRT.x', 'vertRT.y', 'flpH', 'flpV', 'vcol.r', 'vcol.g', 'vcol.b', 'vcol.a', 'vrate', 'uvt.x', 'uvt.y', 'pvt.x', 'pvt.y',
    'anc.x', 'anc.y', 'siz.x', 'siz.y'];
  const H114 = {}; for (const f of F114) H114[crc32(f)] = f;
  const HREN = { [crc32('m_Enabled')]: 'show' };
  const TRANSFORM = { 1: ['tpos.x', 'tpos.y', 'tpos.z'], 2: ['tq.x', 'tq.y', 'tq.z', 'tq.w'], 3: ['scl.x', 'scl.y', 'scl.z'], 4: ['teul.x', 'teul.y', 'teul.z'] };
  const INTS = new Set(['show', 'cellId', 'flpH', 'flpV', 'prio']);

  function streamedKeys(words) {
    const u8 = new Uint8Array(words.buffer, words.byteOffset, words.byteLength);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const keys = new Map();
    let p = 0;
    while (p < u8.length) {
      const t = dv.getFloat32(p, true), n = dv.getInt32(p + 4, true); p += 8;
      for (let k = 0; k < n; k++) {
        const idx = dv.getInt32(p, true);
        const key = [t, dv.getFloat32(p + 4, true), dv.getFloat32(p + 8, true), dv.getFloat32(p + 12, true), dv.getFloat32(p + 16, true)];
        p += 20;
        let a = keys.get(idx); if (!a) keys.set(idx, a = []);
        a.push(key);
      }
    }
    return keys;
  }
  function sample(keys, t) {
    if (t <= keys[0][0]) return keys[0][4];
    let lo = 0, hi = keys.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (keys[mid][0] <= t) lo = mid; else hi = mid - 1; }
    const [k0, a, b, c, d] = keys[lo], dt = t - k0;
    return ((a * dt + b) * dt + c) * dt + d;
  }
  const r3 = (v) => Math.round(v * 1000) / 1000;

  // ── rig ──────────────────────────────────────────────────────────────────────────────────────────────────────
  function serializedFiles(files) {
    return Object.entries(files).filter(([k]) => !k.endsWith('.resS') && !k.endsWith('.resource')).map(([, v]) => readSerialized(v));
  }

  function convert(prefabU8, animU8, commonU8) {
    const pf = readBundle(prefabU8);
    const parts = {}, images = {};
    let ctl = null, tex = null;
    for (const sf of serializedFiles(pf)) {
      for (const o of sf.objects) {
        const cid = o.type.classID;
        if (cid === 114) {
          const t = sf.read(o);
          if ('path' in t && 'parentIndex' in t) parts[t.arrayIndex] = t;
          else if (t.cellList) ctl = t;
        } else if (cid === 28) {
          tex = textureRGBA(sf.read(o), pf);
        }
      }
    }
    if (!ctl || !tex) throw new Error('ss-unity: not a SpriteStudio unit prefab');
    const n = Object.keys(parts).length;
    const outParts = [];
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      if (!p) throw new Error('ss-unity: part ' + i + ' missing');
      outParts.push({ name: p.path.split('/').pop(), path: p.path, parent: p.parentIndex, type: p.partType, blend: p.alphaBlendType,
        inheritAlpha: p.inheritAlph, inheritFlipH: p.inheritFlph, inheritFlipV: p.inheritFlpv, inheritHide: p.inheritHide });
    }
    const cells = ctl.cellList.map((c) => ({ name: c.name, map: c.mapId, x: c.pos.x, y: c.pos.y, w: c.size.x, h: c.size.y,
      px: Math.round(c.pivot.x * 1e5) / 1e5, py: Math.round(c.pivot.y * 1e5) / 1e5 }));
    images[1] = tex;
    const maps = { 1: { w: tex.width, h: tex.height } };
    if (commonU8 && cells.some((c) => c.map === 0)) {
      for (const sf of serializedFiles(readBundle(commonU8))) for (const o of sf.objects) if (o.type.classID === 28) { images[0] = textureRGBA(sf.read(o), readBundle(commonU8)); maps[0] = { w: images[0].width, h: images[0].height }; }
    }
    const pathIndex = new Map(outParts.map((p, i) => [crc32(p.path), i]));

    const af = readBundle(animU8);
    const clips = {};
    for (const sf of serializedFiles(af)) {
      const byId = new Map(sf.objects.map((o) => [o.pathID, o]));
      const clipName = new Map();
      for (const o of sf.objects) {
        if (o.type.classID !== 114) continue;
        const t = sf.read(o);
        if (!('controller' in t && 'length' in t)) continue;
        const go = byId.get(t.m_GameObject.m_PathID), ac = byId.get(t.controller.m_PathID);
        if (!go || !ac) continue;
        const name = sf.read(go).m_Name;
        for (const c of sf.read(ac).m_AnimationClips) clipName.set(c.m_PathID, [name, t.length]);
      }
      for (const o of sf.objects) {
        if (o.type.classID !== 74) continue;
        const t = sf.read(o);
        const [name, length] = clipName.get(o.pathID) || [String(o.pathID), null];
        const mc = t.m_MuscleClip, data = mc.m_Clip.data;
        const keys = streamedKeys(data.m_StreamedClip.data);
        const rate = t.m_SampleRate || 30, nframes = Math.max(1, Math.round(mc.m_StopTime * rate));
        const tracks = {};
        let ci = 0;
        for (const b of t.m_ClipBindingConstant.genericBindings) {
          const part = pathIndex.get(b.path >>> 0);
          let fields;
          if (b.typeID === 4) fields = TRANSFORM[b.attribute] || ['t?'];
          else if (b.typeID === 114) fields = [H114[b.attribute >>> 0] || ('#' + (b.attribute >>> 0))];
          else if (b.typeID === 23) fields = [HREN[b.attribute >>> 0] || ('r#' + (b.attribute >>> 0))];
          else fields = ['t' + b.typeID + '#' + b.attribute];
          for (let j = 0; j < fields.length; j++) {
            const f = fields[j], k = keys.get(ci + j);
            if (part !== undefined && k && f !== 'scl.z') {
              const vals = new Array(nframes + 1);
              for (let fr = 0; fr <= nframes; fr++) { let v = r3(sample(k, fr / rate)); if (INTS.has(f)) v = Math.round(v); vals[fr] = v; }
              (tracks[part] || (tracks[part] = {}))[f] = vals.every((v) => v === vals[0]) ? vals[0] : vals;
            }
          }
          ci += fields.length;
        }
        clips[name] = { fps: rate, frames: nframes + 1, length, tracks };
      }
    }
    return { rig: { maps, cells, parts: outParts, clips }, images };
  }

  function toCanvas(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return c;
  }
  async function fetchBytes(url) { const r = await fetch(url); if (!r.ok) throw new Error('ss-unity: ' + r.status + ' ' + url); return new Uint8Array(await r.arrayBuffer()); }

  const cache = {};
  const SSUnity = {
    readBundle, readSerialized, convert, crc32,
    /** base: URL of the folder holding sprite/unit/... (the game's AssetBundle/iOS folder, or the offline engine's /assets/) */
    loadUnit(base, id) {
      const key = base + '|' + id;
      if (!cache[key]) {
        cache[key] = Promise.all([
          fetchBytes(base + 'sprite/unit/sprite/' + id + '_mock.prefab'),
          fetchBytes(base + 'sprite/unit/mockanimations/' + id),
          fetchBytes(base + 'sprite/unit/textures/common_unit.png').catch(() => null),
        ]).then(([p, a, c]) => {
          const { rig, images } = convert(p, a, c);
          const canv = {}; for (const k of Object.keys(images)) canv[k] = toCanvas(images[k]);
          return new global.SSPlayer.SSCharacter(rig, canv);
        });
        cache[key].catch(() => { delete cache[key]; });
      }
      return cache[key];
    },
  };
  global.SSUnity = SSUnity;
})(typeof window !== 'undefined' ? window : globalThis);
