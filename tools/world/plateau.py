#!/usr/bin/env python3
"""国交省 PLATEAU（浜松市 2023、建物 LOD2）を、ゲームの座標の軽い形式に変換する。
  python3 tools/world/plateau.py assets/data/world/center
出典: 国土交通省 PLATEAU（https://www.mlit.go.jp/plateau/）を加工して作成。CC BY 4.0 互換の利用規約。
高さ: 3D Tiles は楕円体高なので、浜松のジオイド高（GSIGEO2011、約 39.7m）を引いて標高にする。"""
import sys, os, json, math, struct, urllib.request
import numpy as np, DracoPy
out = sys.argv[1]
HALF = float(os.environ.get('HALF', '1200'))
LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110574.0
GEOID = 39.7
CAT = 'https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets'
cat = '/tmp/world/plateau_catalog.json'
os.makedirs('/tmp/world/plateau', exist_ok=True)
if not os.path.exists(cat): open(cat, 'wb').write(urllib.request.urlopen(CAT, timeout=120).read())
D = json.load(open(cat))['datasets']
sets = [d for d in D if d.get('city') == '浜松市' and d.get('type_en') == 'bldg' and str(d.get('lod')) == '2' and d.get('format') == '3D Tiles']
# 範囲（緯度経度）
s_lat, n_lat = LAT0 - HALF / KZ, LAT0 + HALF / KZ
w_lon, e_lon = LON0 - HALF / KX, LON0 + HALF / KX
def overlaps(reg):
    w, s, e, n = [math.degrees(v) for v in reg[:4]]
    return not (e < w_lon or w > e_lon or n < s_lat or s > n_lat)
def get(url, fn):
    if not os.path.exists(fn):
        os.makedirs(os.path.dirname(fn), exist_ok=True)
        open(fn, 'wb').write(urllib.request.urlopen(url, timeout=120).read())
    return open(fn, 'rb').read()
A, F = 6378137.0, 1 / 298.257223563; E2 = F * (2 - F)
def ecef2llh(X, Y, Z):
    lon = np.arctan2(Y, X); p = np.hypot(X, Y); lat = np.arctan2(Z, p * (1 - E2))
    for _ in range(5):
        Nn = A / np.sqrt(1 - E2 * np.sin(lat) ** 2); h = p / np.cos(lat) - Nn; lat = np.arctan2(Z, p * (1 - E2 * Nn / (Nn + h)))
    Nn = A / np.sqrt(1 - E2 * np.sin(lat) ** 2); h = p / np.cos(lat) - Nn
    return np.degrees(lat), np.degrees(lon), h
POS, IDX, BID, BLD = [], [], [], []
vbase = 0
for ds in sets:
    base = ds['url'].rsplit('/', 1)[0]; ward = base.rsplit('/', 1)[1]
    ts = json.loads(get(ds['url'], '/tmp/world/plateau/%s/tileset.json' % ward))
    leaves = []
    def walk(t):
        if 'region' in t.get('boundingVolume', {}) and not overlaps(t['boundingVolume']['region']): return
        ch = t.get('children', [])
        if ch: [walk(c) for c in ch]
        elif 'content' in t: leaves.append(t['content']['uri'])
    walk(ts['root'])
    print(ward, 'leaves', len(leaves))
    for uri in leaves:
        b = get(base + '/' + uri, '/tmp/world/plateau/%s/%s' % (ward, uri))
        mg, ver, bl, ftj, ftb, btj, btb = struct.unpack('<4sIIIIII', b[:28])
        bt = json.loads(b[28 + ftj + ftb:28 + ftj + ftb + btj]) if btj else {}
        glb = b[28 + ftj + ftb + btj + btb:]
        jl = struct.unpack('<I', glb[12:16])[0]; js = json.loads(glb[20:20 + jl])
        bo = 20 + jl; BIN = glb[bo + 8:bo + 8 + struct.unpack('<I', glb[bo:bo + 4])[0]]
        rtc = np.array(js['extensions']['CESIUM_RTC']['center'])
        for mesh in js['meshes']:
            for prim in mesh['primitives']:
                ext = prim['extensions']['KHR_draco_mesh_compression']; bv = js['bufferViews'][ext['bufferView']]
                m = DracoPy.decode(BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])
                pts = np.asarray(m.points, dtype=np.float64); faces = np.asarray(m.faces, dtype=np.int64)
                bid = None
                for a in m.attributes:
                    if a['unique_id'] == ext['attributes'].get('_BATCHID'): bid = np.asarray(a['data']).reshape(-1).astype(np.int64)
                # glTF は y が上 → 3D Tiles の z が上へ
                X = rtc[0] + pts[:, 0]; Y = rtc[1] - pts[:, 2]; Z = rtc[2] + pts[:, 1]
                lat, lon, h = ecef2llh(X, Y, Z)
                gx = (lon - LON0) * KX; gz = (LAT0 - lat) * KZ; gy = h - GEOID
                nb = int(bid.max()) + 1 if bid is not None else 1
                for k in range(nb):
                    sel = np.where(bid == k)[0] if bid is not None else np.arange(len(pts))
                    if not len(sel): continue
                    cx, cz = gx[sel].mean(), gz[sel].mean()
                    if abs(cx) > HALF or abs(cz) > HALF: continue
                    fm = np.isin(faces[:, 0], sel)
                    fk = faces[fm]
                    if not len(fk): continue
                    remap = -np.ones(len(pts), dtype=np.int64); remap[sel] = np.arange(len(sel))
                    def at(key):
                        v = bt.get(key); return v[k] if isinstance(v, list) and k < len(v) else None
                    BLD.append({'h': at('bldg:measuredHeight'), 'u': at('bldg:usage'), 'y0': round(float(gy[sel].min()), 2)})
                    bi = len(BLD) - 1
                    POS.append(np.stack([gx[sel], gy[sel], gz[sel]], 1)); IDX.append(remap[fk] + vbase); BID.append(np.full(len(sel), bi))
                    vbase += len(sel)
P = np.concatenate(POS); I = np.concatenate(IDX).reshape(-1); B = np.concatenate(BID).astype(np.int64)
q = np.round(P * 20).astype(np.int64)   # 5cm 単位（±1638m まで）
# 同じ位置の頂点（建物ごと）をまとめて、頂点数を約 1/3 にする
key = np.concatenate([q, B[:, None]], 1)
uk, inv = np.unique(key, axis=0, return_inverse=True)
inv = inv.reshape(-1)
q = uk[:, :3].astype(np.int16); B = uk[:, 3].astype(np.uint16); I = inv[I].astype(np.uint32)
tri = I.reshape(-1, 3); tri = tri[(tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])]; I = tri.reshape(-1)
os.makedirs(out, exist_ok=True)
with open(os.path.join(out, 'bldg.bin'), 'wb') as f:
    hdr = json.dumps({'nv': len(q), 'ni': len(I), 'nb': len(BLD), 'q': 0.05}).encode(); hdr += b' ' * ((4 - len(hdr) % 4) % 4)
    f.write(struct.pack('<I', len(hdr))); f.write(hdr); f.write(q.tobytes()); f.write(b'\0' * (len(q.tobytes()) % 4)); f.write(I.tobytes()); f.write(B.tobytes())
json.dump({'b': BLD, 'credit': '国土交通省 PLATEAU（浜松市 2023）を加工して作成'}, open(os.path.join(out, 'bldg.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('buildings', len(BLD), 'verts', len(q), 'tris', len(I) // 3, 'bytes', os.path.getsize(os.path.join(out, 'bldg.bin')))
