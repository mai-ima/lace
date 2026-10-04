/*
 * guide.js — 青看板（方面案内標識 108 系）と交差点名標識。
 * - 方面案内: 国道・主要地方道を含む信号交差点への進入路（県道以上）の、交差点の手前に置く。
 *   直進・左・右それぞれの腕へ、腕の実際の角度の矢印と、その方向にある実在の地名（下の表。浜松の主な行先）と、国道・県道の番号を描く。
 *   地名が見つからない方向は道路の名前。どちらも無い方向は矢印だけ。
 * - 交差点名標識: 名前のある信号（OSM の traffic_signals の name）の灯器の上に、日本語とローマ字。
 * 図柄は Canvas に描いて、標識の画像（world.js の標識のまとめた画像）に並べる。
 */
const LAT0 = 34.7037, LON0 = 137.7351, KX = Math.cos(LAT0 * Math.PI / 180) * 111320, KZ = 110574;
const xz = (lat, lon) => [(lon - LON0) * KX, (LAT0 - lat) * KZ];
// 浜松の主な行先（案内標識に出る地名）。w は重み（大きいほど優先）
export const PLACES = [
  ['浜松駅', 'Hamamatsu Sta.', 34.7037, 137.7351, 3], ['浜松城', 'Hamamatsu Castle', 34.7113, 137.7247, 2],
  ['磐田', 'Iwata', 34.7177, 137.8515, 3], ['掛川', 'Kakegawa', 34.7693, 137.9983, 2], ['掛塚', 'Kakezuka', 34.6650, 137.8400, 1],
  ['舞阪', 'Maisaka', 34.6851, 137.6103, 3], ['雄踏', 'Yuto', 34.6957, 137.6416, 2], ['豊橋', 'Toyohashi', 34.7692, 137.3917, 2],
  ['天竜', 'Tenryu', 34.8664, 137.8160, 3], ['浜北', 'Hamakita', 34.7930, 137.7869, 3], ['三方原', 'Mikatahara', 34.7680, 137.7160, 2],
  ['舘山寺', 'Kanzanji', 34.7668, 137.6144, 2], ['浜松西IC', 'Hamamatsu-nishi IC', 34.7498, 137.6523, 2], ['浜松IC', 'Hamamatsu IC', 34.7678, 137.8016, 2],
  ['中田島', 'Nakatajima', 34.6575, 137.7330, 2], ['可美', 'Kami', 34.6865, 137.6857, 1], ['笠井', 'Kasai', 34.7490, 137.8170, 1]
].map(([ja, en, lat, lon, w]) => { const [x, z] = xz(lat, lon); return { ja, en, x, z, w }; });
// 交差点名のローマ字（浜松市の交差点名標識の表記に合わせる）
export const ROMAJI = {
  '成子': 'Naruko', '伝馬町': 'Temmacho', '菅原町': 'Sugaharacho', '海老塚二丁目': 'Ebizuka 2', '八幡橋西': 'Hachimanbashi-nishi', '寺島町南': 'Terajimacho-minami',
  '東税務署': 'Higashi Zeimusho', '北寺島町': 'Kitaterajimacho', '連尺': 'Renjaku', '栄町': 'Sakaemachi', '紺屋町': 'Konyamachi', '旭町': 'Asahicho',
  '砂山東': 'Sunayama-higashi', 'JR浜松駅東': 'JR Hamamatsu Sta. East', '早馬町': 'Hayumacho', '板屋町': 'Itayamachi', 'JR浜松駅北口': 'JR Hamamatsu Sta. North',
  '田町': 'Tamachi', '科学館南': 'Kagakukan-minami', '科学館東': 'Kagakukan-higashi', '松江': 'Matsue', '永代橋東': 'Eitaibashi-higashi', '市役所前': 'City Office',
  '池町': 'Ikemachi', '常盤町': 'Tokiwacho', '八幡町': 'Hachimancho', '文化芸大前': 'SUAC'
};

/**
 * 方面案内の中身を決める。units: 信号の単位（roadnet の signals と同じ { x, z, A: [{ arm, d }] }）
 * 返り値: [{ unit, a（進入の腕）, items: [{ ang（進む向きに対する角度。左が +）, ja, en, ref, kind（'kokudo' | 'kendo' | ''） }] }]
 */
export function guideContents(units) {
  const res = [];
  units.forEach(n => {
    if (!n.A || n.A.length < 3 || !n.A.some(a => a.arm.e.pr.rank <= 2)) return;
    n.A.forEach(a => {
      const pr = a.arm.e.pr; if (pr.rank > 3 || a.arm.e.internal) return;
      const inLanes = a.arm.end === 0 ? pr.bw : pr.fw; if (!inLanes) return;
      const tx = -a.d[0], tz = -a.d[1];   // 進む向き
      const items = [];
      [['s', 0], ['l', 1], ['r', -1]].forEach(([k, sgn]) => {
        // その向きの腕（進む向きからの角度: 直進 ±35 度、左右 35〜150 度）でいちばん格の高いもの
        let best = null;
        n.A.forEach(b => {
          if (b === a) return;
          const ang = Math.atan2(tz * b.d[0] - tx * b.d[1], tx * b.d[0] + tz * b.d[1]);   // 進む向きから見た腕の角度。左が +（x 東・z 南）
          const deg = ang * 180 / Math.PI;
          const ok = k === 's' ? Math.abs(deg) < 35 : k === 'l' ? deg > 35 && deg < 150 : deg < -35 && deg > -150;
          if (!ok) return;
          const out = b.arm.end === 0 ? b.arm.e.pr.fw : b.arm.e.pr.bw; if (!out) return;   // 出ていけない（一方通行の逆）
          const sc = b.arm.e.pr.rank * 10 + Math.abs(deg - (k === 's' ? 0 : sgn * 90)) * 0.1;
          if (!best || sc < best.sc) best = { b, ang, sc };
        });
        if (!best) return;
        const b = best.b, bp = b.arm.e.pr;
        // 行先: その腕の向き（±35 度）にある地名で、600m 以上先のもの。重みと近さで選ぶ（直進は 2 つまで）
        const cands = PLACES.map(p => { const dx = p.x - n.x, dz = p.z - n.z, dist = Math.hypot(dx, dz), c = (dx * b.d[0] + dz * b.d[1]) / (dist || 1); return { p, dist, dg: Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI }; })
          .filter(c => c.dist > 600 && c.dg < 35 && bp.rank <= 4).sort((p, q) => (p.dg * 0.6 + p.dist / 1000 * 1.2 - p.p.w * 6) - (q.dg * 0.6 + q.dist / 1000 * 1.2 - q.p.w * 6));
        const dests = cands.slice(0, k === 's' ? 2 : 1).map(c => c.p);
        const ref = /^\d+$/.test(bp.ref) ? bp.ref : '';
        const kind = ref ? (bp.cls === 'trunk' || (bp.rank <= 2 && +ref >= 100) ? 'kokudo' : 'kendo') : '';   // 国道（一般国道は trunk）・県道
        const ja = dests.map(p => p.ja), en = dests.map(p => p.en);
        if (!ja.length && bp.roadName && bp.rank <= 4) { ja.push(bp.roadName.replace(/（.*）/, '')); en.push(''); }
        items.push({ k, ang: best.ang, ja, en, ref, kind });
      });
      if (items.some(it => it.ja.length || it.ref)) res.push({ unit: n, a, items });
    });
  });
  return res;
}

// 道路標識の青（案内標識の地の色）
const BLUE = '#0b4fa6', FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';
function shield(g, x, y, ref, kind, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = BLUE; g.strokeStyle = '#fff'; g.lineWidth = 4;
  if (kind === 'kokudo') {   // 国道: 逆さの盾形（青地に白）
    g.beginPath(); g.moveTo(-34, -30); g.lineTo(34, -30); g.lineTo(34, 4); g.quadraticCurveTo(30, 26, 0, 36); g.quadraticCurveTo(-30, 26, -34, 4); g.closePath(); g.fill(); g.stroke();
  } else {   // 県道: 六角形
    g.beginPath(); for (let i = 0; i < 6; i++) { const t = Math.PI / 6 + i * Math.PI / 3; g.lineTo(Math.cos(t) * 36, Math.sin(t) * 32); } g.closePath(); g.fill(); g.stroke();
  }
  g.fillStyle = '#fff'; g.font = '800 ' + (ref.length > 2 ? 26 : 32) + 'px Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ref, 0, kind === 'kokudo' ? 0 : 2);
  g.restore();
}
/** 方面案内を (w × h) に描く（地は青、白の縁、白い矢印）。割り付けは 108 系に合わせる:
 *  直進の行先は上の中央、左右の行先は上の左右の隅（矢印より上）。矢印は下寄りの交差点から腕の角度で出る。番号の盾は矢印の下・軸の横 */
export function drawGuide(g, w, h, G) {
  g.fillStyle = BLUE; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.roundRect(14, 14, w - 28, h - 28, 12); g.stroke();
  const cx = w / 2, cy = h * 0.66, big = h * 0.13, small = big * 0.42;
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 20; g.lineCap = 'butt'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx, h - 24); g.lineTo(cx, cy); g.stroke();   // 根元
  const name = (t, en, x, y, align, maxW) => {
    g.textAlign = align; g.textBaseline = 'middle'; g.font = '800 ' + big + 'px ' + FONT;
    const fit = Math.min(1, maxW / g.measureText(t).width); g.save(); g.translate(x, y); g.scale(fit, 1); g.fillText(t, 0, 0); g.restore();
    if (en) { g.font = '600 ' + small + 'px Arial,sans-serif'; const f2 = Math.min(1, maxW / g.measureText(en).width); g.save(); g.translate(x, y + big * 0.7); g.scale(f2, 1); g.fillText(en, 0, 0); g.restore(); }
  };
  G.items.forEach(it => {
    let ex, ey;
    if (it.k === 's') { ex = cx; ey = h * 0.33; }
    else {   // 左右: 腕の角度（直角から ±50 度まで）で、上下に少し傾ける
      const dev = Math.max(-0.9, Math.min(0.9, Math.abs(it.ang) - Math.PI / 2)), sx = it.k === 'l' ? -1 : 1;
      ex = cx + sx * w * 0.36; ey = cy + Math.sin(dev) * h * 0.18;
    }
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
    const ux = ex - cx, uy = ey - cy, ul = Math.hypot(ux, uy) || 1, nx = ux / ul, ny = uy / ul;   // 矢じり
    g.beginPath(); g.moveTo(ex + nx * 24, ey + ny * 24); g.lineTo(ex - ny * 22, ey + nx * 22); g.lineTo(ex + ny * 22, ey - nx * 22); g.closePath(); g.fill();
    if (it.k === 's') {
      if (it.ja.length) name(it.ja.join('・'), it.en.filter(Boolean).join(' / '), cx, 44, 'center', w * 0.44);
      if (it.ref) shield(g, cx + 52, cy + 40, it.ref, it.kind, 0.85);
    } else {
      const left = it.k === 'l';
      if (it.ja.length) name(it.ja[0], it.en[0], left ? 30 : w - 30, Math.min(h * 0.4, ey - big * 1.3), left ? 'left' : 'right', w * 0.3);
      if (it.ref) shield(g, ex + (left ? 40 : -40), ey + 44, it.ref, it.kind, 0.8);
    }
  });
}
/** 交差点名標識（地は青、白い文字。下にローマ字） */
export function drawNamePlate(g, w, h, ja) {
  g.fillStyle = BLUE; g.beginPath(); g.roundRect(3, 3, w - 6, h - 6, 10); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 7); g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 ' + Math.round(h * 0.44) + 'px ' + FONT; const fit = Math.min(1, (w - 40) / g.measureText(ja).width);
  g.save(); g.translate(w / 2, h * 0.4); g.scale(fit, 1); g.fillText(ja, 0, 0); g.restore();
  const en = ROMAJI[ja] || ''; if (en) { g.font = '600 ' + Math.round(h * 0.2) + 'px Arial,sans-serif'; g.fillText(en, w / 2, h * 0.76); }
}
