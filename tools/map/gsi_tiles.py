#!/usr/bin/env python3
"""道路の近く（約 120m 以内）にかかる国土地理院ベクトルタイル（z16）の一覧を作る。
  python3 tools/map/gsi_tiles.py /tmp/gsi/edges.json /tmp/gsi/tiles.json
edges.json はゲームの道路網の点（x, z メートル）。"""
import json, math, sys
LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
Z = 16
def tile_of(lat, lon):
    n = 2 ** Z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y
pts = json.load(open(sys.argv[1]))
tiles = set()
for x, z in pts:
    for dx in (-120, 0, 120):
        for dz in (-120, 0, 120):
            lat = LAT0 - (z + dz) / KZ; lon = LON0 + (x + dx) / KX
            tiles.add(tile_of(lat, lon))
tiles = sorted(tiles)
json.dump(tiles, open(sys.argv[2], 'w'))
print(len(tiles), 'tiles')
