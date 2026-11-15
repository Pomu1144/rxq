#!/usr/bin/env python3
"""rxq: convert a Naruto Blazing character (SpriteStudio rig in Unity asset bundles) for the web game.

Reads, for one unit id (e.g. 0402):
  sprite/unit/sprite/<id>_mock.prefab     the rig: parts (SSPart), cells (SSController.cellList), the part texture
  sprite/unit/mockanimations/<id>         the animation clips (Mecanim, streamed curves)
  sprite/unit/textures/common_unit.png    the shared effects texture (cells with mapId 0)
Writes to OUT/<id>/:
  map1.png (the unit's texture), map0.png (shared effects texture, if used)
  rig.json  { cells, parts, clips }  (see the player, js/ss-player.js, for how it is drawn)

Each clip is sampled at its own rate (30 fps) into per-frame values; a value that never changes in a clip is stored
once, a changing one as a list with one entry per frame. Fields per part:
  show, cellId, pos.x, pos.y, rot.x, rot.y, rot.z, scl.x, scl.y, alpha, prio, flpH, flpV,
  vertLB.x/y, vertRB.x/y, vertLT.x/y, vertRT.x/y (corner offsets), vcol.r/g/b/a (+ blend)
usage: ss_convert.py ASSETBUNDLE_ROOT UNIT_ID OUT_DIR
  ASSETBUNDLE_ROOT is the folder holding sprite/ (e.g. .../Data/Raw/AssetBundle/iOS)
"""
import json, math, os, struct, sys, zlib

import UnityPy

FIELDS_114 = ["prio", "pos.x", "pos.y", "pos.z", "rot.x", "rot.y", "rot.z", "alpha", "cellId", "show",
              "vertLB.x", "vertLB.y", "vertRB.x", "vertRB.y", "vertLT.x", "vertLT.y", "vertRT.x", "vertRT.y",
              "flpH", "flpV", "vcol.r", "vcol.g", "vcol.b", "vcol.a", "vrate", "uvt.x", "uvt.y",
              "pvt.x", "pvt.y", "anc.x", "anc.y", "siz.x", "siz.y", "vcolBlend", "colorBlendType", "vcol.blend",
              "blendType", "vcol.type", "colorBlend", "colorBlendTarget", "vcolType", "vcolBlendType"]
HASH_114 = {zlib.crc32(n.encode()): n for n in FIELDS_114}
HASH_RENDERER = {zlib.crc32(b"m_Enabled"): "show"}
TRANSFORM = {1: ("pos3", 3), 2: ("rotq", 4), 3: ("scl", 3), 4: ("euler", 3)}


def load_objects(path):
    return UnityPy.load(path).objects


def read_rig(prefab_path):
    parts, ctl, tex = {}, None, None
    for o in load_objects(prefab_path):
        if o.type.name == "MonoBehaviour":
            t = o.read_typetree()
            if "path" in t and "parentIndex" in t:
                parts[t["arrayIndex"]] = t
            elif "cellList" in t:
                ctl = t
        elif o.type.name == "Texture2D":
            tex = o.read()
    assert ctl and parts and tex, "not a SpriteStudio unit prefab"
    order = sorted(parts)
    assert order == list(range(len(order))), "part indices are not 0..n-1"
    out_parts = []
    for i in order:
        p = parts[i]
        out_parts.append({
            "name": p["path"].rsplit("/", 1)[-1], "path": p["path"], "parent": p["parentIndex"],
            "type": p["partType"], "blend": p["alphaBlendType"],
            "inheritAlpha": p["inheritAlph"], "inheritFlipH": p["inheritFlph"], "inheritFlipV": p["inheritFlpv"],
            "inheritHide": p["inheritHide"],
        })
    cells = []
    for c in ctl["cellList"]:
        cells.append({
            "name": c["name"], "map": c["mapId"],
            "x": c["pos"]["x"], "y": c["pos"]["y"], "w": c["size"]["x"], "h": c["size"]["y"],
            "px": round(c["pivot"]["x"], 5), "py": round(c["pivot"]["y"], 5),
        })
    return out_parts, cells, tex


def streamed_keys(words):
    """Unity StreamedClip: frames of (time, n, n x (curveIndex, 4 coefficients)) -> {curve: [(t, a, b, c, d)]}"""
    raw = struct.pack("<%dI" % len(words), *words)
    pos, keys = 0, {}
    while pos < len(raw):
        t, n = struct.unpack_from("<fi", raw, pos); pos += 8
        for _ in range(n):
            idx, a, b, c, d = struct.unpack_from("<i4f", raw, pos); pos += 20
            keys.setdefault(idx, []).append((t, a, b, c, d))
    return keys


def sample(keys, t):
    # last key at or before t (keys are in time order); value = ((a*dt + b)*dt + c)*dt + d
    lo, hi = 0, len(keys) - 1
    if t <= keys[0][0]:
        return keys[0][4]
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if keys[mid][0] <= t:
            lo = mid
        else:
            hi = mid - 1
    k0, a, b, c, d = keys[lo]
    dt = t - k0
    return ((a * dt + b) * dt + c) * dt + d


def read_clips(anim_path, path_index):
    objs = list(load_objects(anim_path))
    by_id = {o.path_id: o for o in objs}
    # clip name = name of the GameObject whose AnimatorController uses it
    clip_name = {}
    for o in objs:
        if o.type.name == "MonoBehaviour":
            t = o.read_typetree()
            if "controller" in t and "length" in t:
                go = by_id[t["m_GameObject"]["m_PathID"]].read().m_Name
                ac = by_id[t["controller"]["m_PathID"]].read_typetree()
                for c in ac["m_AnimationClips"]:
                    clip_name[c["m_PathID"]] = (go, t["length"])
    clips, unknown = {}, {}
    for o in objs:
        if o.type.name != "AnimationClip":
            continue
        name, length = clip_name.get(o.path_id, (str(o.path_id), None))
        t = o.read_typetree()
        mc = t["m_MuscleClip"]
        data = mc["m_Clip"]["data"]
        assert data["m_DenseClip"]["m_CurveCount"] == 0 and not data["m_ConstantClip"]["data"], "dense/constant curves not handled"
        keys = streamed_keys(data["m_StreamedClip"]["data"])
        rate = t["m_SampleRate"] or 30.0
        stop = mc["m_StopTime"]
        nframes = max(1, int(round(stop * rate)))
        tracks = {}
        ci = 0
        for b in t["m_ClipBindingConstant"]["genericBindings"]:
            part = path_index.get(b["path"])
            if b["typeID"] == 4:
                kind, n = TRANSFORM[b["attribute"]]
                fields = {"scl": ["scl.x", "scl.y", "scl.z"], "pos3": ["tpos.x", "tpos.y", "tpos.z"],
                          "euler": ["teul.x", "teul.y", "teul.z"], "rotq": ["tq.x", "tq.y", "tq.z", "tq.w"]}[kind]
            elif b["typeID"] == 114:
                fields, n = [HASH_114.get(b["attribute"], "#%d" % b["attribute"])], 1
            elif b["typeID"] == 23:
                fields, n = [HASH_RENDERER.get(b["attribute"], "r#%d" % b["attribute"])], 1
            else:
                fields, n = ["t%d#%d" % (b["typeID"], b["attribute"])], 1
            for j in range(n):
                f = fields[j]
                if f.startswith("#") or f.startswith("r#") or f.startswith("t"):
                    unknown[f] = unknown.get(f, 0) + 1
                k = keys.get(ci + j)
                if part is not None and k and f != "scl.z":
                    vals = [sample(k, fr / rate) for fr in range(nframes + 1)]
                    vals = [round(v, 3) for v in vals]
                    if f in ("show", "cellId", "flpH", "flpV", "prio"):
                        vals = [int(round(v)) for v in vals]
                    tracks.setdefault(str(part), {})[f] = vals[0] if all(v == vals[0] for v in vals) else vals
            ci += n
        assert ci == data["m_StreamedClip"]["curveCount"], (ci, data["m_StreamedClip"]["curveCount"])
        clips[name] = {"fps": rate, "frames": nframes + 1, "length": length, "tracks": tracks}
    return clips, unknown


def main():
    root, unit, out = sys.argv[1], sys.argv[2], sys.argv[3]
    prefab = os.path.join(root, "sprite", "unit", "sprite", unit + "_mock.prefab")
    anim = os.path.join(root, "sprite", "unit", "mockanimations", unit)
    parts, cells, tex = read_rig(prefab)
    path_index = {zlib.crc32(p["path"].encode()): i for i, p in enumerate(parts)}
    clips, unknown = read_clips(anim, path_index)
    d = os.path.join(out, unit)
    os.makedirs(d, exist_ok=True)
    tex.image.save(os.path.join(d, "map1.png"))
    maps = {1: {"file": "map1.png", "w": tex.m_Width, "h": tex.m_Height}}
    if any(c["map"] == 0 for c in cells):
        common = os.path.join(root, "sprite", "unit", "textures", "common_unit.png")
        for o in load_objects(common):
            if o.type.name == "Texture2D":
                t0 = o.read(); t0.image.save(os.path.join(d, "map0.png"))
                maps[0] = {"file": "map0.png", "w": t0.m_Width, "h": t0.m_Height}
    rig = {"unit": unit, "maps": maps, "cells": cells, "parts": parts, "clips": clips}
    with open(os.path.join(d, "rig.json"), "w") as f:
        json.dump(rig, f, separators=(",", ":"))
    size = os.path.getsize(os.path.join(d, "rig.json"))
    print("%s: %d parts, %d cells, %d clips, rig.json %.1f MB" % (unit, len(parts), len(cells), len(clips), size / 1e6))
    for n, c in sorted(clips.items()):
        print("  clip %s: %d frames @ %g fps, %d animated parts" % (n, c["frames"], c["fps"], len(c["tracks"])))
    if unknown:
        print("  fields not named (left in rig.json under their hash):", unknown)


if __name__ == "__main__":
    main()
