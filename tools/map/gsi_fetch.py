#!/usr/bin/env python3
"""国土地理院ベクトルタイル（experimental_bvmap）を取ってくる。控えめな速度で、取れたものは飛ばして再開できる。
  python3 tools/map/gsi_fetch.py /tmp/gsi/tiles.json /tmp/gsi/raw
出典: 国土地理院ベクトルタイル（https://maps.gsi.go.jp/development/ichiran.html）"""
import json, os, sys, time, urllib.request, concurrent.futures as cf
tiles = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
Z = 16
def get(t):
    x, y = t; fn = '%s/%d_%d.pbf' % (out, x, y)
    if os.path.exists(fn): return 'skip'
    url = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/%d/%d/%d.pbf' % (Z, x, y)
    for a in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'tenryu-racing-map-build/1.0 (personal game project)'})
            with urllib.request.urlopen(req, timeout=40) as r: body = r.read()
            open(fn, 'wb').write(body); time.sleep(0.12); return 'ok'
        except urllib.error.HTTPError as e:
            if e.code == 404: open(fn, 'wb').write(b''); return '404'
            time.sleep(2 + a * 3)
        except Exception as e:
            time.sleep(2 + a * 3)
    return 'fail'
res = {}
with cf.ThreadPoolExecutor(5) as ex:
    for i, r in enumerate(ex.map(get, tiles)):
        res[r] = res.get(r, 0) + 1
        if i % 200 == 0: print(i, res, flush=True)
print('done', res)
