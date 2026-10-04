/*
 * garage.js — 自車を選ぶガレージ画面（3D 自由走行）。
 * 左に選んでいる車の写真と性能、右に車の一覧、下に塗装の色。開いている間はゲームを止める。
 * 操作: ←→ 車、↑↓ 色、Enter 決定、Esc 戻る。スマホはカード・色・ボタンをタップ。
 * 性能の目盛りは物理の値（vehicle.js の makeCar に渡す値）から求める:
 *   加速 = 出力 / 重量、最高速 = 出力と空気抵抗（Cd × 前面投影面積）のつり合い、操縦性 = タイヤの摩擦係数と重心の高さ、制動 = ブレーキの強さと摩擦係数
 */
const DRIVE = { ff: 'FF（前輪駆動）', fr: 'FR（後輪駆動）', mr: 'MR（ミッドシップ後輪駆動）', '4wd': '4WD（四輪駆動）' };
export const PAINTS = [
  { name: 'パールホワイト', c: 0xf2f2ee }, { name: 'シルバー', c: 0xb8bcc2 }, { name: 'ガンメタリック', c: 0x50555c }, { name: 'ブラック', c: 0x16171a },
  { name: 'レッド', c: 0xb3121c }, { name: 'オレンジ', c: 0xe8740c }, { name: 'イエロー', c: 0xe8c20c }, { name: 'ブルー', c: 0x1f4c9a },
  { name: 'ダークブルー', c: 0x1c2a4a }, { name: 'グリーン', c: 0x2c5a3a }
];

/** cars: [{ key, name, color, s（makeCar に入る全部の値）, size: { w, l, h }, thumb }]、onPick(index, color) は決定したとき */
export function makeGarage(container, cars, onPick) {
  let idx = 0, paint = 0, open = false;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:none;z-index:30;background:linear-gradient(180deg,rgba(10,12,16,.94),rgba(18,22,28,.97));color:#eef1f4;font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif;overflow:auto';
  el.innerHTML = `
    <style>@media (max-width: 640px) { .w3g-keys { display: none } }</style>
    <div style="max-width:1100px;margin:0 auto;padding:18px 16px calc(18px + env(safe-area-inset-bottom))">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#eef1f4" stroke-width="1.8" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5V20H3z"/><path d="M7 20v-6h10v6"/><path d="M7 17h10"/></svg>
        <b style="font-size:22px;letter-spacing:.08em;white-space:nowrap">ガレージ</b>
        <span class="w3g-keys" style="margin-left:auto;font-size:13px;opacity:.7">←→ 車　↑↓ 色　Enter 決定　Esc 戻る</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:16px">
        <div style="flex:1 1 520px;min-width:0">
          <div style="position:relative;border-radius:14px;overflow:hidden;background:#2a2f36;aspect-ratio:16/10">
            <img data-r="img" style="width:100%;height:100%;object-fit:cover;display:block" alt="">
            <div data-r="name" style="position:absolute;left:14px;bottom:10px;font-size:22px;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,.6)"></div>
          </div>
          <div data-r="paints" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px"></div>
          <div data-r="paintName" style="font-size:13px;opacity:.75;margin-bottom:10px"></div>
          <div data-r="bars" style="display:grid;grid-template-columns:5.5em 1fr;gap:6px 10px;align-items:center;font-size:14px"></div>
          <table data-r="spec" style="width:100%;margin-top:12px;border-collapse:collapse;font-size:14px"></table>
        </div>
        <div style="flex:0 1 330px;min-width:260px">
          <div data-r="list" style="display:flex;flex-direction:column;gap:8px"></div>
          <div style="display:flex;gap:10px;margin-top:14px">
            <button data-r="ok" style="flex:1;padding:12px;border-radius:12px;border:0;background:#e8740c;color:#fff;font-size:16px;font-weight:700">この車で走る</button>
            <button data-r="back" style="flex:0 0 auto;padding:12px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#eef1f4;font-size:16px">戻る</button>
          </div>
        </div>
      </div>
    </div>`;
  container.appendChild(el);
  const $ = r => el.querySelector('[data-r="' + r + '"]');
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  // 性能の値（全車で比べて 0〜1 の目盛り）
  const perf = cars.map(C => {
    const s = C.s, vmax = Math.cbrt(s.power / (0.5 * 1.2 * s.cd * s.area));   // 空気抵抗だけのつり合い（m/s）
    return { acc: s.power / s.mass, top: vmax * 3.6, hnd: s.mu * (1 - (s.cgH - 0.4) * 0.6) * (s.rearMu || s.mu) / s.mu, brk: s.brake * s.mu };
  });
  const range = k => { const v = perf.map(p => p[k]); return [Math.min(...v) * 0.8, Math.max(...v)]; };
  const R = { acc: range('acc'), top: range('top'), hnd: range('hnd'), brk: range('brk') };
  const bar = (label, k, i) => { const [a, b] = R[k], f = Math.max(0.05, Math.min(1, (perf[i][k] - a) / (b - a || 1))); return `<span style="opacity:.8">${label}</span><div style="height:10px;border-radius:5px;background:rgba(255,255,255,.12)"><div style="width:${(f * 100).toFixed(0)}%;height:100%;border-radius:5px;background:linear-gradient(90deg,#e8740c,#f2b33d)"></div></div>`; };
  function render() {
    const C = cars[idx], s = C.s;
    $('img').src = C.thumb; $('name').textContent = C.name;
    $('bars').innerHTML = bar('加速', 'acc', idx) + bar('最高速', 'top', idx) + bar('操縦性', 'hnd', idx) + bar('制動', 'brk', idx);
    const rows = [
      ['最高出力', Math.round(s.power / 735.5) + ' PS（' + Math.round(s.power / 1000) + ' kW）'],
      ['車両重量', Math.round(s.mass) + ' kg'],
      ['駆動方式', DRIVE[s.drive] || s.drive],
      ['変速機', s.gears.length + ' 速'],
      ['最高速度（目安）', Math.round(Math.min(perf[idx].top, s.maxRpm / 60 * 2 * Math.PI * s.wheelR / (s.gears[s.gears.length - 1] * s.final) * 3.6)) + ' km/h'],
      ['全長 × 全幅 × 全高', C.size ? [C.size.l, C.size.w, C.size.h].map(v => (v * 1000).toFixed(0)).join(' × ') + ' mm' : '—']
    ];
    $('spec').innerHTML = rows.map(([a, b]) => `<tr><td style="padding:5px 0;opacity:.7;border-bottom:1px solid rgba(255,255,255,.08)">${a}</td><td style="padding:5px 0;text-align:right;border-bottom:1px solid rgba(255,255,255,.08)">${b}</td></tr>`).join('');
    $('list').innerHTML = '';
    cars.forEach((c, i) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;cursor:pointer;border:2px solid ' + (i === idx ? '#e8740c' : 'rgba(255,255,255,.1)') + ';background:' + (i === idx ? 'rgba(232,116,12,.14)' : 'rgba(255,255,255,.04)');
      d.innerHTML = `<img src="${c.thumb}" style="width:96px;height:60px;object-fit:cover;border-radius:8px" alt=""><div><div style="font-weight:700">${c.name}</div><div style="font-size:12px;opacity:.7">${Math.round(c.s.power / 735.5)} PS・${Math.round(c.s.mass)} kg・${(DRIVE[c.s.drive] || '').replace(/（.*/, '')}</div></div>`;
      d.addEventListener('pointerdown', e => { e.stopPropagation(); if (idx !== i) { idx = i; paint = Math.max(0, PAINTS.findIndex(p => p.c === cars[i].color)); render(); } });
      $('list').appendChild(d);
    });
    $('paints').innerHTML = '';
    PAINTS.forEach((p, i) => {
      const b = document.createElement('button');
      b.title = p.name; b.setAttribute('aria-label', p.name);
      b.style.cssText = 'width:34px;height:34px;border-radius:50%;border:3px solid ' + (i === paint ? '#fff' : 'rgba(255,255,255,.2)') + ';background:' + hex(p.c) + ';box-shadow:inset 0 -6px 10px rgba(0,0,0,.35)';
      b.addEventListener('pointerdown', e => { e.stopPropagation(); paint = i; render(); });
      $('paints').appendChild(b);
    });
    $('paintName').textContent = '塗装: ' + PAINTS[paint].name;
  }
  const close = () => { open = false; el.style.display = 'none'; };
  const pick = () => { close(); onPick(idx, PAINTS[paint].c); };
  $('ok').addEventListener('pointerdown', e => { e.stopPropagation(); pick(); });
  $('back').addEventListener('pointerdown', e => { e.stopPropagation(); close(); });
  return {
    get isOpen() { return open; },
    open(cur, color) { idx = cur; const k = PAINTS.findIndex(p => p.c === color); paint = k >= 0 ? k : 0; open = true; el.style.display = 'block'; render(); },
    close,
    key(k) {
      if (k === 'Escape' || k === 'c' || k === 'C') close();
      else if (k === 'Enter') pick();
      else if (k === 'ArrowRight') { idx = (idx + 1) % cars.length; paint = Math.max(0, PAINTS.findIndex(p => p.c === cars[idx].color)); render(); }
      else if (k === 'ArrowLeft') { idx = (idx - 1 + cars.length) % cars.length; paint = Math.max(0, PAINTS.findIndex(p => p.c === cars[idx].color)); render(); }
      else if (k === 'ArrowDown') { paint = (paint + 1) % PAINTS.length; render(); }
      else if (k === 'ArrowUp') { paint = (paint - 1 + PAINTS.length) % PAINTS.length; render(); }
    }
  };
}
