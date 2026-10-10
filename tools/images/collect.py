#!/usr/bin/env python3
"""作業で使った画像を、専用のフォルダ docs/images/ に、抽出・使用の順に番号を付けて集める（何度実行してもよい。新しい物だけ足す）。
  python3 tools/images/collect.py
集める物:
  docs/images/conversation/ … 会話の中に表示した画像（会話の記録 JSONL の中の画像。表示した順）
  docs/images/work/          … 作業用のフォルダ（scratchpad）で作った画像（作った時刻の順）。審査用のフォルダ audit*/ は除く
  docs/images/audit/<名前>/  … サブエージェントの審査で撮った画像（scratchpad の audit*/。作った時刻の順）
  docs/images/attached/      … ユーザーの添付画像（/mnt/user-data/uploads にある物。届いた順）
大きさをそろえる: 長い辺 1600px まで縮め、JPEG（品質 82）で保存する。一覧は docs/images/README.md と index.json。"""
import os, sys, json, glob, base64, io, hashlib
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'images')
LOG = os.environ.get('SESSION_LOG') or max(glob.glob('/root/.claude/projects/-home-user-lace/*.jsonl'), key=os.path.getsize)
SCR = os.environ.get('SCRATCH') or '/tmp/claude-0/-home-user-lace/4dca125b-613a-5d0e-b2ba-63cfbd42b9b1/scratchpad'
UP = '/mnt/user-data/uploads'
idx_path = os.path.join(OUT, 'index.json')
index = json.load(open(idx_path)) if os.path.exists(idx_path) else {'items': []}
seen = {it['hash'] for it in index['items']}


def save(img_bytes, folder, src, when):
    h = hashlib.sha1(img_bytes).hexdigest()[:16]
    if h in seen: return False
    try:
        im = Image.open(io.BytesIO(img_bytes)); im.load()
    except Exception:
        return False
    im = im.convert('RGB'); s = 1600 / max(im.size)
    if s < 1: im = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)
    d = os.path.join(OUT, folder); os.makedirs(d, exist_ok=True)
    n = len([f for f in os.listdir(d) if f.endswith('.jpg')]) + 1
    base = os.path.splitext(os.path.basename(src))[0][:40] if src else 'image'
    name = '%04d_%s.jpg' % (n, ''.join(ch if ch.isalnum() or ch in '-_' else '_' for ch in base))
    im.save(os.path.join(d, name), quality=82, optimize=True)
    index['items'].append({'hash': h, 'file': folder + '/' + name, 'source': src, 'time': when}); seen.add(h)
    return True


added = 0
# 1. 会話の中に表示した画像（表示した順）。浜松市の現況平面図（/wag/ の中・名前に wag）を開いた結果は除く
wagids = set()
for line in open(LOG):
    if '"tool_use"' not in line or 'wag' not in line: continue
    d = json.loads(line); c = d.get('message', {}).get('content')
    for x in (c if isinstance(c, list) else []):
        if isinstance(x, dict) and x.get('type') == 'tool_use':
            fp = str((x.get('input') or {}).get('file_path', ''))
            if '/wag/' in fp or 'wag' in os.path.basename(fp).lower(): wagids.add(x.get('id'))
for line in open(LOG):
    if '"image"' not in line or '"base64"' not in line: continue
    d = json.loads(line)
    def walk(x):
        if isinstance(x, dict):
            if x.get('type') == 'tool_result' and x.get('tool_use_id') in wagids: return
            if x.get('type') == 'image' and isinstance(x.get('source'), dict) and x['source'].get('type') == 'base64':
                yield x['source']['data']
            for v in x.values(): yield from walk(v)
        elif isinstance(x, list):
            for v in x: yield from walk(v)
    c = d.get('message', {}).get('content')
    # ユーザーの発言に直接付いた画像（道具の結果ではない物）は添付画像
    direct = d.get('type') == 'user' and not d.get('isSidechain') and isinstance(c, list) and not any(isinstance(x, dict) and x.get('type') == 'tool_result' for x in c)
    for b in walk(d.get('message', {})):
        added += save(base64.b64decode(b), 'attached' if direct else 'conversation', 'session:' + d.get('uuid', ''), d.get('timestamp', ''))
# 2. 添付画像（届いた順）
for f in sorted(glob.glob(os.path.join(UP, '*')), key=os.path.getmtime):
    if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif')): added += save(open(f, 'rb').read(), 'attached', os.path.basename(f), os.path.getmtime(f))
# 3. 作業の画像と審査の画像（作った時刻の順）
files = [f for f in glob.glob(os.path.join(SCR, '**', '*'), recursive=True) if f.lower().endswith(('.png', '.jpg', '.jpeg')) and '/npm/' not in f
         and '/wag/' not in f and 'wag' not in os.path.basename(f).lower()]   # 浜松市の現況平面図（公開のリポジトリに入れない）が写った画像は除く
for f in sorted(files, key=os.path.getmtime):
    rel = os.path.relpath(f, SCR); top = rel.split(os.sep)[0]
    folder = 'audit/' + top if top.startswith('audit') else 'work'
    if top.startswith('audit') and len(rel.split(os.sep)) > 2: folder += '_' + rel.split(os.sep)[1]
    added += save(open(f, 'rb').read(), folder, rel, os.path.getmtime(f))
json.dump(index, open(idx_path, 'w'), ensure_ascii=False, indent=0)
# 一覧
by = {}
for it in index['items']: by.setdefault(it['file'].rsplit('/', 1)[0], []).append(it)
with open(os.path.join(OUT, 'README.md'), 'w') as f:
    f.write('# 画像の一覧（tools/images/collect.py で集めた物）\n\n抽出・使用の順に番号を付けている。番号の小さい方が古い。\n\n')
    names = {'conversation': '会話の中に表示した画像', 'work': '作業の画像（撮影・比較）', 'attached': 'ユーザーの添付画像'}
    for k in sorted(by):
        f.write('- %s（%s）: %d 枚\n' % (k, names.get(k, 'サブエージェントの審査の画像'), len(by[k])))
print('追加', added, '枚、合計', len(index['items']), '枚')
