#!/usr/bin/env python3
"""rxq: pull the art out of a Naruto Blazing IPA (e.g. the Blazing:Rebirth offline build) into a folder the web game
can load from the app bundle (www/assets/blazing).

Writes, under OUT/:
  manifest.json                    everything below, with sizes, so the game can look things up
  textures/<source>/<name>.png     every Texture2D in the game data and asset bundles (UI atlases, backgrounds,
                                   effects, cut-ins, story art, gimmicks, map objects, title art...)
  ui/<Atlas>/<sprite>.png          the UI atlases cut into named sprites, and ui/<Atlas>.json with each sprite's
                                   rect and 9-slice borders (left, right, top, bottom)
  units/<id>/rig.json + map*.png   character rigs for the SpriteStudio player (rxq tools/ss_convert.py)
usage: blazing_pack.py BLAZING.ipa OUT_DIR
"""
import io, json, os, re, struct, subprocess, sys, tempfile, zipfile

import UnityPy

HERE = os.path.dirname(os.path.abspath(__file__))


def safe(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s).strip("_") or "x"


def atlas_table(raw):
    """NGUI UIAtlas.mSprites from a MonoBehaviour's raw bytes: {name: [x, y, w, h, bL, bR, bT, bB, pL, pR, pT, pB]}"""
    for st in range(0, min(len(raw) - 8, 600), 4):
        n, L = struct.unpack_from("<ii", raw, st)
        if not (3 < n < 3000 and 0 < L < 80 and st + 8 + L <= len(raw)):
            continue
        if not all(32 <= c < 127 for c in raw[st + 8:st + 8 + L]):
            continue
        p, out = st + 4, {}
        try:
            for _ in range(n):
                L = struct.unpack_from("<i", raw, p)[0]; p += 4
                if not 0 < L < 100:
                    raise ValueError
                name = raw[p:p + L].decode(); p += L; p += (-p) % 4
                v = list(struct.unpack_from("<12i", raw, p)); p += 48
                if not (0 <= v[0] < 4096 and 0 <= v[1] < 4096 and 0 < v[2] <= 4096 and 0 < v[3] <= 4096):
                    raise ValueError
                out[name] = v
            return out
        except Exception:
            continue
    return None


def atlas_texture(objs, raw):
    """name of the texture an atlas's material points at (same file), or None"""
    try:
        L = struct.unpack_from("<i", raw, 28)[0]
        p = 32 + L; p += (-p) % 4
        fid, mpid = struct.unpack_from("<iq", raw, p)
        if fid != 0 or mpid not in objs:
            return None
        m = objs[mpid].read_typetree()
        for _, v in m["m_SavedProperties"]["m_TexEnvs"]:
            t = v["m_Texture"]
            if t["m_PathID"] and t["m_FileID"] == 0 and t["m_PathID"] in objs:
                return objs[t["m_PathID"]].read().m_Name
    except Exception:
        return None
    return None


def main():
    ipa, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    work = tempfile.mkdtemp(prefix="blazing_")
    with zipfile.ZipFile(ipa) as z:
        members = [n for n in z.namelist() if "/Data/" in n and not n.endswith("/")]
        z.extractall(work, members)
    data = next(os.path.join(r, d) for r, ds, _ in os.walk(work) for d in ds if d == "Data")
    bundles = os.path.join(data, "Raw", "AssetBundle", "iOS")
    files = [os.path.join(data, f) for f in sorted(os.listdir(data))
             if os.path.isfile(os.path.join(data, f)) and not f.endswith((".resS", ".config", ".resource"))]
    for r, _, fs in os.walk(bundles):
        files += [os.path.join(r, f) for f in sorted(fs) if not f.endswith(".manifest")]

    manifest = {"source": os.path.basename(ipa), "textures": {}, "ui": {}, "units": {}}
    seen = set()
    textures_by_name = {}
    for f in files:
        rel = os.path.relpath(f, bundles if f.startswith(bundles) else data)
        try:
            env = UnityPy.load(f)
        except Exception:
            continue
        objs = {o.path_id: o for o in env.objects}
        for o in env.objects:
            try:
                if o.type.name == "Texture2D":
                    t = o.read()
                    if not t.m_Width or not t.m_Height:
                        continue
                    img = t.image
                    key = (t.m_Name, t.m_Width, t.m_Height, img.tobytes()[:4096])
                    if key in seen:                       # same art in en/ko copies: keep one
                        continue
                    seen.add(key)
                    d = os.path.join(out, "textures", safe(os.path.splitext(rel)[0]))
                    os.makedirs(d, exist_ok=True)
                    name = safe(t.m_Name) + ".png"
                    img.save(os.path.join(d, name), optimize=True)
                    path = os.path.relpath(os.path.join(d, name), out)
                    manifest["textures"][path] = [t.m_Width, t.m_Height]
                    textures_by_name.setdefault(t.m_Name, (img, path))
                elif o.type.name == "MonoBehaviour":
                    raw = o.get_raw_data()
                    if len(raw) < 200:
                        continue
                    tab = atlas_table(raw)
                    if tab and len(tab) >= 4:
                        tex = atlas_texture(objs, raw)
                        manifest["ui"].setdefault("_tables", []).append({"file": rel, "id": o.path_id, "texture": tex, "sprites": len(tab)})
                        if tex:
                            manifest["ui"][tex] = {"table": tab}
            except Exception as e:
                print("skip", rel, o.path_id, e, file=sys.stderr)

    # cut the atlases whose texture we know into named sprites
    for atlas, info in list(manifest["ui"].items()):
        if atlas.startswith("_") or atlas not in textures_by_name:
            continue
        img, _ = textures_by_name[atlas]
        d = os.path.join(out, "ui", safe(atlas))
        os.makedirs(d, exist_ok=True)
        sprites = {}
        for name, v in info["table"].items():
            x, y, w, h = v[:4]
            if x + w > img.width or y + h > img.height:
                continue
            img.crop((x, y, x + w, y + h)).save(os.path.join(d, safe(name) + ".png"), optimize=True)
            sprites[name] = {"file": "ui/%s/%s.png" % (safe(atlas), safe(name)), "w": w, "h": h, "border": v[4:8]}
        with open(os.path.join(out, "ui", safe(atlas) + ".json"), "w") as fh:
            json.dump(sprites, fh, separators=(",", ":"))
        manifest["ui"][atlas] = {"index": "ui/%s.json" % safe(atlas), "sprites": len(sprites)}

    # character rigs
    unit_dir = os.path.join(bundles, "sprite", "unit", "sprite")
    if os.path.isdir(unit_dir):
        for f in sorted(os.listdir(unit_dir)):
            m = re.match(r"(\d{4})_mock\.prefab$", f)
            if not m or m.group(1) == "0999":
                continue
            uid = m.group(1)
            r = subprocess.run([sys.executable, os.path.join(HERE, "ss_convert.py"), bundles, uid, os.path.join(out, "units")],
                               capture_output=True, text=True)
            if r.returncode == 0:
                rig = json.load(open(os.path.join(out, "units", uid, "rig.json")))
                manifest["units"][uid] = {"base": "units/%s/" % uid, "clips": sorted(rig["clips"])}
            else:
                print("unit", uid, "failed:", r.stderr[-400:], file=sys.stderr)

    with open(os.path.join(out, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, separators=(",", ":"))
    n_ui = sum(v.get("sprites", 0) for k, v in manifest["ui"].items() if not k.startswith("_"))
    print("textures %d, ui sprites %d in %d atlases, units %d" % (
        len(manifest["textures"]), n_ui, len([k for k in manifest["ui"] if not k.startswith("_")]), len(manifest["units"])))


if __name__ == "__main__":
    main()
