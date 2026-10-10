#!/usr/bin/env python3
"""バス停と、駐車場の出入口の開閉バーを OSM から取り出す。
  python3 tools/world/build_stops.py assets/data/world/center
入力: /tmp/world/osm/*.xml
出力: stops.json … { stops: [[x, z, 名前, 屋根 0/1, ベンチ 0/1], ...], gates: [[x, z], ...], vend: [[x, z], ...] }（x, z は m、小数 1 桁）
バス停: highway=bus_stop、または public_transport=platform かつ bus=yes。屋根・ベンチは shelter / bench の値（無ければ 0）。
開閉バー: barrier=lift_gate（駐車場の出入口など）。
自販機: amenity=vending_machine で、飲み物（vending=drinks）か種類の書いてない物（駐車券の精算機は除く）。"""
import sys, os, json, math, glob
import xml.etree.ElementTree as ET
out = sys.argv[1]
LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110574.0
T = json.load(open(os.path.join(out, 'roads.json')))['terrain']
X0, Z0, X1, Z1 = T['x0'], T['z0'], T['x0'] + (T['nx'] - 1) * T['cell'], T['z0'] + (T['nz'] - 1) * T['cell']
stops, gates, vend, seen = [], [], [], set()
for f in sorted(glob.glob('/tmp/world/osm/*.xml')):
    for n in ET.parse(f).getroot().iter('node'):
        if n.get('id') in seen: continue
        t = {k.get('k'): k.get('v') for k in n.iter('tag')}
        if not t: continue
        x, z = (float(n.get('lon')) - LON0) * KX, (LAT0 - float(n.get('lat'))) * KZ
        if not (X0 < x < X1 and Z0 < z < Z1): continue
        bus = t.get('highway') == 'bus_stop' or (t.get('public_transport') == 'platform' and t.get('bus') == 'yes')
        if bus:
            seen.add(n.get('id'))
            stops.append([round(x, 1), round(z, 1), t.get('name', ''), 1 if t.get('shelter') == 'yes' else 0, 1 if t.get('bench') == 'yes' else 0])
        elif t.get('barrier') == 'lift_gate':
            seen.add(n.get('id')); gates.append([round(x, 1), round(z, 1)])
        elif t.get('amenity') == 'vending_machine' and t.get('vending', 'drinks') in ('drinks', 'food;drinks', 'drinks;food'):
            seen.add(n.get('id')); vend.append([round(x, 1), round(z, 1)])
# 同じ名前で 3m 以内のバス停（platform と bus_stop の二重登録）は 1 つに
uniq = []
for s in stops:
    if any(u[2] == s[2] and math.hypot(u[0] - s[0], u[1] - s[1]) < 3 for u in uniq): continue
    uniq.append(s)
json.dump({'stops': uniq, 'gates': gates, 'vend': vend, 'credit': '© OpenStreetMap contributors'}, open(os.path.join(out, 'stops.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('バス停', len(uniq), ' 屋根あり', sum(s[3] for s in uniq), ' 開閉バー', len(gates), ' 自販機', len(vend))
