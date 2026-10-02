/*
 * race-audio.js — TENRYU RACING のエンジン音・走行音（Web Audio で合成）。
 *
 * 車種ごとに「気筒数・回転数の上限・音色」を変えて、
 *   軽の 3 気筒 / 直 4 / 直 6 / 水平対向 / ロータリー / V8 / V12 / フォーミュラ /
 *   2 ストローク（カート）/ ディーゼル / 電気モーター
 * を作り分ける。自動変速で回転が落ちる音、ターボの吸気音とブローオフ、
 * タイヤのスキール、風切り音、雨音、芝生のゴロゴロ、すれ違いの風音も鳴らす。
 */
(function () {
  'use strict';

  var TB = window.TB;
  var R = TB.Race = TB.Race || {};

  // gear: 変速段の上限（最高速に対する割合）
  var G6 = [0.2, 0.34, 0.49, 0.65, 0.82, 1.0], G5 = [0.25, 0.42, 0.6, 0.8, 1.0], G1 = [1.0];
  var PROFILES = {
    kei3: { cyl: 3, idle: 950, red: 7200, wave: 'square', cut: 1500, grit: 0.5, sub: 0.25, gear: G5, vol: 0.8 },
    i4: { cyl: 4, idle: 850, red: 7000, wave: 'sawtooth', cut: 1700, grit: 0.25, sub: 0.2, gear: G6, vol: 0.9 },
    i4hi: { cyl: 4, idle: 900, red: 7800, wave: 'sawtooth', cut: 2300, grit: 0.3, sub: 0.15, gear: G5, vol: 0.95 },
    i4t: { cyl: 4, idle: 900, red: 7200, wave: 'sawtooth', cut: 1900, grit: 0.35, sub: 0.2, gear: G6, turbo: 1, pops: 1, vol: 0.95 },
    boxer: { cyl: 4, idle: 800, red: 7000, wave: 'sawtooth', cut: 1300, grit: 0.3, sub: 0.75, burble: 0.5, gear: G6, turbo: 1, vol: 1 },
    i6: { cyl: 6, idle: 750, red: 7200, wave: 'sawtooth', cut: 2100, grit: 0.15, sub: 0.1, gear: G6, vol: 0.9 },
    i6t: { cyl: 6, idle: 800, red: 8000, wave: 'sawtooth', cut: 2400, grit: 0.2, sub: 0.1, gear: G6, turbo: 1, vol: 1 },
    rotary: { cyl: 4, idle: 1000, red: 9000, wave: 'sawtooth', cut: 2900, grit: 0.45, sub: 0.05, gear: G5, turbo: 1, pops: 1, vol: 0.95 },
    v6: { cyl: 6, idle: 700, red: 6500, wave: 'sawtooth', cut: 1500, grit: 0.2, sub: 0.3, gear: G6, vol: 0.9 },
    v8: { cyl: 8, idle: 650, red: 6500, wave: 'sawtooth', cut: 1100, grit: 0.35, sub: 0.9, burble: 0.8, gear: G6, pops: 1, vol: 1.1 },
    flat6: { cyl: 6, idle: 850, red: 9000, wave: 'sawtooth', cut: 2800, grit: 0.25, sub: 0.35, burble: 0.2, gear: G6, vol: 1 },
    v12: { cyl: 12, idle: 900, red: 9000, wave: 'sawtooth', cut: 3400, grit: 0.15, sub: 0.1, gear: G6, vol: 1 },
    f1: { cyl: 10, idle: 4000, red: 15000, wave: 'sawtooth', cut: 4500, grit: 0.2, sub: 0.05, gear: G6, vol: 0.9 },
    kart: { cyl: 2, idle: 2400, red: 13000, wave: 'square', cut: 3200, grit: 0.7, sub: 0.1, gear: G1, vol: 0.75 },
    diesel: { cyl: 6, idle: 600, red: 2800, wave: 'square', cut: 700, grit: 0.8, sub: 0.6, gear: G5, clatter: 1, turbo: 1, vol: 1.1 },
    twin: { cyl: 2, idle: 800, red: 5000, wave: 'square', cut: 900, grit: 0.6, sub: 0.5, burble: 0.7, gear: G5, vol: 0.9 },
    ev: { ev: 1, gear: G1, vol: 0.7 }
  };
  var BODY_PROFILE = R.BODY_PROFILE = {
    kei: 'kei3', keitra: 'kei3', hatch: 'i4hi', sedan: 'i4', taxi: 'i4', minivan: 'i4', rally: 'i4t', evo: 'i4t', s13: 'i4t', ae86: 'i4hi',
    gc8: 'boxer', zn8: 'boxer', gt: 'i6', classic: 'i6', r32: 'i6t', fc: 'rotary', fd: 'rotary', suv: 'v6', pickup: 'v8', muscle: 'v8',
    police: 'v8', limo: 'v8', ambulance: 'v8', monster: 'v8', super: 'v8', rr: 'flat6', wedge: 'v12', proto: 'v12', formula: 'f1',
    kart: 'kart', buggy: 'twin', trike: 'twin', tractor: 'diesel', fire: 'diesel', camper: 'diesel', van: 'diesel', truck: 'diesel', bus: 'diesel', ev: 'ev'
  };
  R.soundName = function (body) {
    return { kei3: '直列 3 気筒', i4: '直列 4 気筒', i4hi: '高回転 直 4', i4t: '直 4 ターボ', boxer: '水平対向 4 気筒ターボ', i6: '直列 6 気筒',
             i6t: '直 6 ツインターボ', rotary: 'ロータリーターボ', v6: 'V6', v8: 'V8', flat6: '水平対向 6 気筒', v12: 'V12', f1: 'V10 レーシング',
             kart: '2 ストローク単気筒', diesel: 'ディーゼル', twin: '2 気筒', ev: '電気モーター' }[BODY_PROFILE[body] || 'i4'];
  };

  var noiseBuf = null;
  function noise(ac) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    return s;
  }
  function shaper(ac, amt) {
    var ws = ac.createWaveShaper(), n = 1024, c = new Float32Array(n), k = amt * 40 + 1;
    for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    ws.curve = c;
    return ws;
  }

  /** 1 台ぶんの走行音。update({ speed:0..1+, throttle, boost, skid, off, rain, wind }) を毎コマ呼ぶ */
  R.carAudio = function (body) {
    var none = { update: function () {}, stop: function () {}, mute: function () {}, event: function () {}, info: function () { return {}; } };
    if (!TB.Sfx || !TB.Sfx.enabled() || TB.Sfx.volume() <= 0 || !TB.Sfx.ctx) return none;
    var ac = TB.Sfx.ctx();
    if (!ac) return none;
    var P = PROFILES[BODY_PROFILE[body] || 'i4'];
    var V = TB.Sfx.volume() * 1.6 * P.vol;
    var nodes = [], t = function () { return ac.currentTime; };
    function src(n) { nodes.push(n); return n; }
    try {
      var out = ac.createGain(); out.gain.value = 0; out.connect(ac.destination);
      out.gain.setTargetAtTime(1, t(), 0.2);
      var comp = ac.createDynamicsCompressor(); comp.connect(out);

      // --- エンジン ---
      var eng = ac.createGain(); eng.gain.value = 0;
      var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
      var ws = shaper(ac, P.grit || 0.1);
      lp.connect(ws); ws.connect(eng); eng.connect(comp);
      var oA, oB, oC, gA, gB, gC, am, lfo, lfoG, evA, evB;
      if (P.ev) {
        evA = src(ac.createOscillator()); evA.type = 'sine';
        evB = src(ac.createOscillator()); evB.type = 'triangle';
        var gEv = ac.createGain(); gEv.gain.value = 0.5;
        evA.connect(gEv); evB.connect(gEv); gEv.connect(lp);
        lp.frequency.value = 5000;
        evA.start(); evB.start();
      } else {
        oA = src(ac.createOscillator()); oA.type = P.wave;
        oB = src(ac.createOscillator()); oB.type = 'square';
        oC = src(ac.createOscillator()); oC.type = 'sawtooth';
        gA = ac.createGain(); gA.gain.value = 0.6;
        gB = ac.createGain(); gB.gain.value = P.sub;
        gC = ac.createGain(); gC.gain.value = 0.18;
        am = ac.createGain(); am.gain.value = 1;
        oA.connect(gA); oB.connect(gB); oC.connect(gC);
        gA.connect(am); gB.connect(am); gC.connect(am); am.connect(lp);
        if (P.burble) {   // V8・水平対向の「ドロドロ」した不等間隔の脈動
          lfo = src(ac.createOscillator()); lfo.type = 'square';
          lfoG = ac.createGain(); lfoG.gain.value = P.burble * 0.45;
          lfo.connect(lfoG); lfoG.connect(am.gain);
          lfo.start();
        }
        oA.start(); oB.start(); oC.start();
      }
      // 吸排気のゴー音（ノイズ）
      var nz = src(noise(ac)), nzF = ac.createBiquadFilter(), nzG = ac.createGain();
      nzF.type = 'bandpass'; nzF.Q.value = 0.8; nzG.gain.value = 0;
      nz.connect(nzF); nzF.connect(nzG); nzG.connect(comp); nz.start();
      // ディーゼルのカラカラ音
      var clG = null, clL = null;
      if (P.clatter) {
        var cl = src(noise(ac)), clF = ac.createBiquadFilter(); clF.type = 'highpass'; clF.frequency.value = 2500;
        clG = ac.createGain(); clG.gain.value = 0;
        clL = src(ac.createOscillator()); clL.type = 'square';
        var clM = ac.createGain(); clM.gain.value = 0;
        cl.connect(clF); clF.connect(clM); clM.connect(clG); clG.connect(comp);
        clL.connect(clM.gain); cl.start(); clL.start();
      }
      // ターボの吸気音
      var tb = null, tbG = null;
      if (P.turbo) {
        tb = src(ac.createOscillator()); tb.type = 'sine'; tbG = ac.createGain(); tbG.gain.value = 0;
        tb.connect(tbG); tbG.connect(comp); tb.start();
      }
      // タイヤ・風・雨・芝生
      function band(type, f, q) { var n = src(noise(ac)), fl = ac.createBiquadFilter(), g = ac.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 1; g.gain.value = 0; n.connect(fl); fl.connect(g); g.connect(comp); n.start(); return { g: g, f: fl }; }
      var sq = band('bandpass', 1100, 6), wind = band('lowpass', 600, 0.5), rain = band('highpass', 3500, 0.5), rumble = band('lowpass', 180, 1), road = band('lowpass', 350, 0.7);
      // スキールは 2 本を少しずらしてうなりを出す
      var sq2 = band('bandpass', 1350, 9);
    } catch (e) { return none; }

    var gear = 1, rpm = P.idle || 0, lastThr = 0, muted = false, stopped = false, popT = 0;
    function hit(freq, dur, amp, type) {   // 短い破裂音（ブローオフ・アフターファイア）
      try {
        var n = noise(ac), f = ac.createBiquadFilter(), g = ac.createGain();
        f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = 2;
        g.gain.setValueAtTime(amp * V, t()); g.gain.exponentialRampToValueAtTime(0.0001, t() + dur);
        n.connect(f); f.connect(g); g.connect(comp); n.start(); n.stop(t() + dur + 0.05);
      } catch (e) { /* ignore */ }
    }

    function update(s) {
      if (stopped) return;
      var now = t(), k = 0.04;
      var sp = Math.max(0, s.speed || 0), thr = s.throttle ? 1 : 0;
      if (s.boost) thr = 1;
      if (muted) { out.gain.setTargetAtTime(0, now, 0.05); return; }
      out.gain.setTargetAtTime(1, now, 0.1);
      // 自動変速（シフトアップすると回転が落ちる）
      var target, ng = 1;
      while (ng < P.gear.length && sp > P.gear[ng - 1] * 0.96) ng++;
      if (ng > gear) { gear = ng; if (P.turbo && sp > 0.15) hit(2600, 0.35, 0.5); }
      else if (ng < gear && sp < P.gear[gear - 2] * 0.85) gear = ng;
      if (P.ev) {
        var ef = 160 + sp * 2600;
        evA.frequency.setTargetAtTime(ef, now, k); evB.frequency.setTargetAtTime(ef * 2.01, now, k);
        eng.gain.setTargetAtTime(V * (0.12 + sp * 0.3 + thr * 0.12), now, 0.08);
        rpm = sp;
      } else {
        var lo = gear > 1 ? P.gear[gear - 2] : 0, hi = P.gear[gear - 1];
        var frac = Math.max(0, Math.min(1.05, (sp - lo * 0.75) / (hi - lo * 0.75)));
        target = P.idle + (P.red - P.idle) * frac;
        if (sp < 0.03) target = P.idle + (P.red - P.idle) * 0.55 * thr;   // 空ぶかし
        if (s.rpm01 !== undefined) target = P.idle + (P.red - P.idle) * Math.min(1.05, s.rpm01);
        rpm += (target - rpm) * 0.25;
        var F = rpm / 60 * P.cyl / 2;
        oA.frequency.setTargetAtTime(F, now, k);
        oB.frequency.setTargetAtTime(F / 2, now, k);
        oC.frequency.setTargetAtTime(F * 2.003, now, k);
        if (lfo) lfo.frequency.setTargetAtTime(F / 4, now, k);
        lp.frequency.setTargetAtTime(P.cut * (0.55 + thr * 0.7 + rpm / P.red * 0.6), now, k);
        eng.gain.setTargetAtTime(V * (0.16 + thr * 0.2 + rpm / P.red * 0.14), now, 0.06);
        nzF.frequency.setTargetAtTime(F * 1.5 + 200, now, k);
        nzG.gain.setTargetAtTime(V * (0.02 + thr * 0.09 * rpm / P.red), now, 0.06);
        if (clG) { clG.gain.setTargetAtTime(V * 0.25, now, 0.1); clL.frequency.setTargetAtTime(F, now, k); }
        // アクセルを戻したときのアフターファイア
        if (P.pops && lastThr && !thr && rpm > P.red * 0.55) { popT = 0.6; }
        if (popT > 0) { popT -= 1 / 60; if (Math.random() < 0.18) hit(300 + Math.random() * 500, 0.06, 0.9, 'lowpass'); }
        if (P.turbo && lastThr && !thr && rpm > P.red * 0.5) hit(2400, 0.45, 0.55);
      }
      if (tb) {
        tb.frequency.setTargetAtTime(1500 + rpm / (P.red || 1) * 4200, now, 0.1);
        tbG.gain.setTargetAtTime(V * 0.05 * thr * Math.min(1, rpm / (P.red || 1) * 1.4), now, 0.12);
      }
      lastThr = thr;
      var skid = s.skid ? 1 : 0;
      sq.g.gain.setTargetAtTime(V * 0.35 * skid * Math.min(1, sp * 1.5), now, 0.05);
      sq2.g.gain.setTargetAtTime(V * 0.2 * skid * Math.min(1, sp * 1.5), now, 0.05);
      wind.g.gain.setTargetAtTime(V * 0.5 * sp * sp, now, 0.2);
      wind.f.frequency.setTargetAtTime(400 + sp * 900, now, 0.2);
      road.g.gain.setTargetAtTime(V * 0.18 * Math.min(1, sp * 2), now, 0.2);
      rain.g.gain.setTargetAtTime(s.rain ? V * 0.25 : 0, now, 0.4);
      rumble.g.gain.setTargetAtTime(s.off ? V * 0.9 * Math.min(1, sp * 2) : 0, now, 0.05);
    }

    return {
      update: update,
      set: function (x) { update({ speed: x, throttle: x > 0.1 }); },
      mute: function (m) { muted = !!m; if (m && !stopped) out.gain.setTargetAtTime(0, t(), 0.05); },
      event: function (name) {
        if (name === 'passby') hit(900, 0.5, 0.35, 'lowpass');
        if (name === 'crash') { hit(150, 0.5, 1.4, 'lowpass'); hit(3000, 0.25, 0.6); }
        if (name === 'scrape') hit(4000, 0.2, 0.5, 'highpass');
      },
      info: function () { return { gear: gear, rpm: Math.round(rpm), name: BODY_PROFILE[body] || 'i4' }; },
      stop: function () {
        if (stopped) return;
        stopped = true;
        try {
          out.gain.setTargetAtTime(0, t(), 0.08);
          var end = t() + 0.5;
          nodes.forEach(function (n) { try { n.stop(end); } catch (e) { /* ignore */ } });
          setTimeout(function () { try { out.disconnect(); } catch (e) { /* ignore */ } }, 800);
        } catch (e) { /* ignore */ }
      }
    };
  };
  /** パトカーのサイレン（ウーーー）。level(0..1) で近さ */
  R.sirenAudio = function () {
    if (!TB.Sfx || !TB.Sfx.enabled() || !TB.Sfx.ctx) return null;
    var ac = TB.Sfx.ctx(); if (!ac) return null;
    try {
      var o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = 760; f.type = 'lowpass'; f.frequency.value = 1800; g.gain.value = 0;
      lfo.type = 'sine'; lfo.frequency.value = 0.32; lg.gain.value = 330;
      lfo.connect(lg); lg.connect(o.frequency); o.connect(f); f.connect(g); g.connect(ac.destination);
      o.start(); lfo.start();
      var V = TB.Sfx.volume() * 0.9, done = false;
      return {
        level: function (v) { if (!done) g.gain.setTargetAtTime(V * v, ac.currentTime, 0.2); },
        stop: function () { if (done) return; done = true; g.gain.setTargetAtTime(0, ac.currentTime, 0.1); try { o.stop(ac.currentTime + 0.5); lfo.stop(ac.currentTime + 0.5); } catch (e) { /* ignore */ } }
      };
    } catch (e) { return null; }
  };
})();
