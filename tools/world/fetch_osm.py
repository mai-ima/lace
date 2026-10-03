#!/usr/bin/env python3
"""OSM API 0.6 の map 呼び出しで、範囲の生データ（XML）を小さな区画ごとに取得して保存する。
  python3 tools/world/fetch_osm.py 34.6947 137.7242 34.7127 137.7460 /tmp/world/osm
出典: © OpenStreetMap contributors（ODbL）。1 秒以上あけて取得する。"""
import sys, os, time, urllib.request
s, w, n, e, out = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
os.makedirs(out, exist_ok=True)
STEP = 0.006
lat = s
while lat < n:
    lon = w
    while lon < e:
        b = (round(lon, 4), round(lat, 4), round(min(lon + STEP, e), 4), round(min(lat + STEP, n), 4))
        fn = os.path.join(out, 'osm_%s_%s.xml' % (b[1], b[0]))
        if not os.path.exists(fn) or os.path.getsize(fn) < 200:
            url = 'https://www.openstreetmap.org/api/0.6/map?bbox=%s,%s,%s,%s' % b
            for tries in range(4):
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': 'tenryu-racing-map-build/1.0'})
                    data = urllib.request.urlopen(req, timeout=90).read()
                    open(fn, 'wb').write(data); print('ok', fn, len(data)); break
                except Exception as ex:
                    print('retry', b, ex); time.sleep(2 + tries * 3)
            time.sleep(1.2)
        lon += STEP
    lat += STEP
