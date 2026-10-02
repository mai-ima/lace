/*
 * race-music.js — TENRYU RACING の BGM（Web Audio でその場で演奏する）。
 *
 *   R.Music.play('battle')  … ユーロビート風のバトル曲（155 BPM・A マイナー）
 *   R.Music.play('boss')    … ボス戦（165 BPM・D マイナー、和声的短音階）
 *   R.Music.play('drive')   … オープンワールドのシティポップ風（112 BPM）
 *   R.Music.play('title')   … メニューのシンセウェイブ（100 BPM）
 *   R.Music.play('story')   … ストーリーのピアノ（72 BPM）
 *   R.Music.play('tension') … 緊迫した場面（130 BPM）
 *   R.Music.jingle('win' | 'lose')
 * 楽器（キック・スネア・ハイハット・ベース・パッド・リード・アルペジオ・ピアノ）も全部合成。
 */
(function () {
  'use strict';
  var TB = window.TB, R = TB.Race = TB.Race || {};

  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var CH = { m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], d7: [0, 4, 7, 10], dim: [0, 3, 6], sus: [0, 5, 7] };

  /* ---------- 曲 ---------- */
  // bars: [root(MIDI), 和音, 旋律[[拍, 音, 長さ]...]]  拍は 16 分音符で 0〜15
  var SONGS = {
    battle: {
      bpm: 155, drums: 'euro', bass: 'octave', arp: true, pad: true, leadWave: 'saw',
      intro: [[57, 'm'], [53, 'M'], [55, 'M'], [57, 'm']],
      loop: [
        // A メロ
        [57, 'm', [[0, 76, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2], [8, 74, 4], [12, 72, 2], [14, 69, 2]]],
        [53, 'M', [[0, 72, 2], [2, 72, 2], [4, 74, 2], [6, 76, 2], [8, 77, 6], [14, 76, 2]]],
        [55, 'M', [[0, 74, 2], [2, 74, 2], [4, 72, 2], [6, 71, 2], [8, 72, 4], [12, 74, 4]]],
        [57, 'm', [[0, 76, 8], [8, 69, 8]]],
        [57, 'm', [[0, 76, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2], [8, 74, 4], [12, 76, 2], [14, 77, 2]]],
        [53, 'M', [[0, 79, 2], [2, 77, 2], [4, 76, 2], [6, 74, 2], [8, 77, 6], [14, 76, 2]]],
        [55, 'M', [[0, 74, 2], [2, 76, 2], [4, 77, 2], [6, 79, 2], [8, 81, 4], [12, 79, 4]]],
        [52, 'M', [[0, 76, 2], [2, 75, 2], [4, 76, 2], [6, 78, 2], [8, 80, 8]]],
        // サビ
        [53, 'M', [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 76, 4], [12, 77, 4]]],
        [55, 'M', [[0, 79, 4], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 76, 4]]],
        [52, 'm', [[0, 76, 2], [2, 74, 2], [4, 76, 2], [6, 79, 2], [8, 83, 6], [14, 81, 2]]],
        [57, 'm', [[0, 81, 12], [12, 76, 2], [14, 79, 2]]],
        [53, 'M', [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 76, 4], [12, 77, 4]]],
        [55, 'M', [[0, 79, 4], [4, 77, 2], [6, 79, 2], [8, 83, 4], [12, 84, 4]]],
        [52, 'M', [[0, 83, 4], [4, 80, 4], [8, 76, 4], [12, 80, 4]]],
        [57, 'm', [[0, 81, 14]]]
      ]
    },
    boss: {
      bpm: 165, drums: 'euro', bass: 'octave', arp: true, pad: true, leadWave: 'square', dark: true,
      intro: [[50, 'm'], [50, 'm'], [46, 'M'], [45, 'M']],
      loop: [
        [50, 'm', [[0, 74, 2], [2, 74, 1], [3, 77, 1], [4, 74, 2], [6, 73, 2], [8, 74, 2], [10, 77, 2], [12, 81, 4]]],
        [46, 'M', [[0, 82, 4], [4, 81, 2], [6, 77, 2], [8, 79, 6], [14, 77, 2]]],
        [43, 'm', [[0, 79, 2], [2, 77, 2], [4, 74, 2], [6, 70, 2], [8, 74, 4], [12, 77, 4]]],
        [45, 'M', [[0, 76, 4], [4, 73, 4], [8, 76, 4], [12, 79, 2], [14, 81, 2]]],
        [50, 'm', [[0, 86, 4], [4, 84, 2], [6, 82, 2], [8, 81, 4], [12, 77, 4]]],
        [46, 'M', [[0, 82, 2], [2, 81, 2], [4, 79, 2], [6, 77, 2], [8, 79, 8]]],
        [43, 'm', [[0, 79, 4], [4, 82, 4], [8, 86, 4], [12, 84, 4]]],
        [45, 'd7', [[0, 85, 8], [8, 81, 4], [12, 73, 4]]]
      ]
    },
    drive: {
      bpm: 112, drums: 'pop', bass: 'walk', ep: true, pad: true, leadWave: 'tri', swing: 0.0,
      intro: [[55, 'M7'], [54, 'm7'], [52, 'm7'], [57, 'd7']],
      loop: [
        [55, 'M7', [[0, 78, 3], [4, 76, 2], [6, 74, 2], [8, 76, 6]]],
        [54, 'm7', [[0, 73, 2], [2, 74, 2], [4, 76, 4], [10, 69, 6]]],
        [52, 'm7', [[0, 74, 3], [4, 73, 2], [6, 71, 2], [8, 73, 4], [12, 76, 4]]],
        [57, 'd7', [[0, 79, 6], [8, 78, 2], [10, 76, 2], [12, 73, 4]]],
        [50, 'M7', [[0, 78, 4], [4, 81, 4], [8, 78, 2], [10, 76, 2], [12, 74, 4]]],
        [59, 'm7', [[0, 74, 2], [2, 76, 2], [4, 78, 4], [8, 71, 8]]],
        [52, 'm7', [[0, 71, 2], [2, 74, 2], [4, 76, 4], [8, 79, 4], [12, 78, 4]]],
        [57, 'd7', [[0, 76, 8], [8, 73, 4], [12, 69, 4]]]
      ]
    },
    title: {
      bpm: 100, drums: 'wave', bass: 'pulse', arp: true, pad: true, leadWave: 'saw', soft: true,
      intro: [[52, 'm'], [48, 'M'], [55, 'M'], [50, 'M']],
      loop: [
        [52, 'm', [[0, 79, 8], [8, 78, 4], [12, 76, 4]]],
        [48, 'M', [[0, 76, 12], [12, 72, 4]]],
        [55, 'M', [[0, 74, 8], [8, 79, 8]]],
        [50, 'M', [[0, 78, 16]]],
        [52, 'm', [[0, 79, 4], [4, 83, 4], [8, 81, 4], [12, 79, 4]]],
        [48, 'M', [[0, 76, 8], [8, 79, 8]]],
        [55, 'M', [[0, 83, 8], [8, 81, 4], [12, 79, 4]]],
        [50, 'M', [[0, 78, 12], [12, 74, 4]]]
      ]
    },
    story: {
      bpm: 72, drums: null, bass: 'sustain', piano: true, pad: true, leadWave: 'piano', soft: true,
      intro: [[57, 'm'], [53, 'M']],
      loop: [
        [57, 'm', [[0, 76, 6], [6, 74, 2], [8, 72, 8]]],
        [53, 'M', [[0, 77, 6], [6, 76, 2], [8, 72, 8]]],
        [48, 'M', [[0, 79, 8], [8, 76, 4], [12, 74, 4]]],
        [55, 'M', [[0, 74, 16]]],
        [57, 'm', [[0, 76, 4], [4, 79, 4], [8, 81, 8]]],
        [53, 'M', [[0, 77, 4], [4, 76, 4], [8, 72, 8]]],
        [55, 'M', [[0, 74, 6], [6, 72, 2], [8, 71, 8]]],
        [52, 'M', [[0, 68, 16]]]
      ]
    },
    school: {
      bpm: 128, drums: 'pop', bass: 'walk', ep: true, pad: true, leadWave: 'tri',
      intro: [[48, 'M'], [55, 'M'], [57, 'm'], [53, 'M']],
      loop: [
        [48, 'M', [[0, 76, 2], [2, 79, 2], [4, 84, 4], [8, 83, 2], [10, 79, 2], [12, 76, 4]]],
        [55, 'M', [[0, 74, 2], [2, 79, 2], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 74, 4]]],
        [57, 'm', [[0, 76, 2], [2, 81, 2], [4, 84, 4], [8, 83, 2], [10, 81, 2], [12, 76, 4]]],
        [53, 'M', [[0, 77, 4], [4, 81, 4], [8, 79, 4], [12, 77, 4]]],
        [48, 'M', [[0, 84, 4], [4, 83, 2], [6, 81, 2], [8, 79, 4], [12, 76, 4]]],
        [55, 'M', [[0, 79, 2], [2, 83, 2], [4, 86, 4], [8, 83, 4], [12, 79, 4]]],
        [53, 'M', [[0, 81, 4], [4, 84, 4], [8, 81, 2], [10, 79, 2], [12, 77, 4]]],
        [55, 'M', [[0, 79, 8], [8, 74, 8]]]
      ]
    },
    sad: {
      bpm: 66, drums: null, bass: 'sustain', piano: true, pad: true, leadWave: 'piano', soft: true,
      intro: [[53, 'M'], [55, 'M']],
      loop: [
        [53, 'M7', [[0, 77, 8], [8, 76, 4], [12, 72, 4]]],
        [52, 'm7', [[0, 71, 6], [6, 72, 2], [8, 76, 8]]],
        [50, 'm7', [[0, 74, 8], [8, 72, 4], [12, 69, 4]]],
        [55, 'd7', [[0, 71, 16]]],
        [53, 'M7', [[0, 77, 6], [6, 79, 2], [8, 81, 8]]],
        [52, 'm7', [[0, 79, 4], [4, 76, 4], [8, 72, 8]]],
        [57, 'm', [[0, 76, 8], [8, 72, 4], [12, 69, 4]]],
        [55, 'sus', [[0, 74, 10], [10, 71, 6]]]
      ]
    },
    festival: {
      bpm: 124, drums: 'pop', bass: 'pulse', arp: true, pad: true, leadWave: 'square',
      intro: [[50, 'm'], [50, 'm'], [53, 'M'], [55, 'M']],
      loop: [
        [50, 'm', [[0, 74, 2], [2, 77, 2], [4, 79, 2], [6, 81, 2], [8, 84, 4], [12, 81, 4]]],
        [50, 'm', [[0, 79, 2], [2, 81, 2], [4, 79, 2], [6, 77, 2], [8, 74, 8]]],
        [53, 'M', [[0, 77, 2], [2, 79, 2], [4, 81, 2], [6, 84, 2], [8, 86, 4], [12, 84, 4]]],
        [55, 'M', [[0, 84, 2], [2, 81, 2], [4, 79, 2], [6, 77, 2], [8, 79, 8]]],
        [50, 'm', [[0, 86, 4], [4, 84, 2], [6, 81, 2], [8, 79, 4], [12, 77, 4]]],
        [53, 'M', [[0, 79, 2], [2, 77, 2], [4, 74, 4], [8, 77, 4], [12, 79, 4]]],
        [55, 'M', [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 79, 4], [12, 81, 4]]],
        [50, 'm', [[0, 74, 12]]]
      ]
    },
    night: {
      bpm: 96, drums: 'wave', bass: 'walk', ep: true, pad: true, leadWave: 'tri', soft: true,
      intro: [[57, 'm7'], [50, 'm7'], [55, 'M7'], [52, 'm7']],
      loop: [
        [57, 'm7', [[0, 76, 4], [4, 79, 4], [8, 81, 6], [14, 79, 2]]],
        [50, 'm7', [[0, 77, 4], [4, 74, 4], [8, 72, 8]]],
        [55, 'M7', [[0, 71, 4], [4, 74, 4], [8, 76, 8]]],
        [52, 'm7', [[0, 79, 6], [6, 76, 2], [8, 74, 8]]],
        [57, 'm7', [[0, 81, 4], [4, 83, 4], [8, 84, 6], [14, 81, 2]]],
        [50, 'm7', [[0, 81, 4], [4, 77, 4], [8, 74, 8]]],
        [55, 'M7', [[0, 79, 4], [4, 76, 4], [8, 74, 4], [12, 71, 4]]],
        [52, 'm7', [[0, 76, 12]]]
      ]
    },
    ending: {
      bpm: 84, drums: null, bass: 'sustain', piano: true, pad: true, leadWave: 'tri',
      intro: [[55, 'M'], [52, 'm']],
      loop: [
        [55, 'M', [[0, 79, 4], [4, 83, 4], [8, 86, 8]]],
        [52, 'm', [[0, 83, 4], [4, 79, 4], [8, 76, 8]]],
        [48, 'M', [[0, 79, 6], [6, 76, 2], [8, 72, 8]]],
        [50, 'M', [[0, 78, 8], [8, 74, 8]]],
        [55, 'M', [[0, 86, 4], [4, 83, 4], [8, 79, 8]]],
        [57, 'm', [[0, 84, 4], [4, 81, 4], [8, 76, 8]]],
        [48, 'M', [[0, 84, 8], [8, 79, 4], [12, 76, 4]]],
        [55, 'M', [[0, 83, 16]]]
      ]
    },
    final: {
      bpm: 160, drums: 'euro', bass: 'octave', arp: true, pad: true, leadWave: 'saw', dark: true,
      intro: [[52, 'm'], [48, 'M'], [50, 'M'], [52, 'm']],
      loop: [
        [52, 'm', [[0, 79, 2], [2, 79, 2], [4, 83, 2], [6, 86, 2], [8, 83, 4], [12, 79, 4]]],
        [48, 'M', [[0, 79, 2], [2, 76, 2], [4, 79, 2], [6, 84, 2], [8, 83, 8]]],
        [50, 'M', [[0, 78, 2], [2, 81, 2], [4, 86, 4], [8, 85, 4], [12, 81, 4]]],
        [52, 'm', [[0, 83, 8], [8, 79, 4], [12, 76, 4]]],
        [52, 'm', [[0, 88, 4], [4, 86, 2], [6, 83, 2], [8, 86, 4], [12, 91, 4]]],
        [48, 'M', [[0, 88, 4], [4, 84, 4], [8, 79, 4], [12, 84, 4]]],
        [50, 'M', [[0, 90, 4], [4, 88, 2], [6, 86, 2], [8, 85, 8]]],
        [47, 'd7', [[0, 83, 12], [12, 86, 2], [14, 83, 2]]]
      ]
    },
    tension: {
      bpm: 130, drums: 'tension', bass: 'sixteen', pad: true, dark: true, soft: true,
      intro: [[49, 'm'], [45, 'M']],
      loop: [[49, 'm', []], [45, 'M', []], [42, 'm', []], [44, 'M', [[8, 80, 4], [12, 79, 4]]], [49, 'm', [[0, 73, 16]]], [45, 'M', []], [42, 'm', [[0, 78, 8], [8, 76, 8]]], [44, 'd7', [[0, 75, 16]]]]
    }
  };

  /* ---------- 演奏 ---------- */
  var ac = null, bus = null, comp = null, delay = null, noiseBuf = null;
  var cur = null, timer = 0, next = 0, step = 0, barIdx = 0, inIntro = true, stopAt = 0;
  function level() {
    var s = R.load ? R.load() : {};
    var bgm = s.bgm === undefined ? 0.6 : s.bgm;
    var sv = TB.Sfx && TB.Sfx.volume ? TB.Sfx.volume() : 0.05;
    return bgm * sv * 3.2;
  }
  function setup() {
    if (ac) return ac;
    if (!TB.Sfx || !TB.Sfx.ctx || (TB.Sfx.enabled && !TB.Sfx.enabled())) return null;
    ac = TB.Sfx.ctx(); if (!ac) return null;
    bus = ac.createGain(); bus.gain.value = level();
    comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    bus.connect(comp); comp.connect(ac.destination);
    delay = ac.createDelay(1); var fb = ac.createGain(); fb.gain.value = 0.28; var dl = ac.createGain(); dl.gain.value = 0.22;
    delay.connect(fb); fb.connect(delay); delay.connect(dl); dl.connect(bus);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }
  function env(g, t, a, peak, dcy, sus, rel, end) {
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + dcy);
    g.gain.setValueAtTime(Math.max(0.0001, peak * sus), end); g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
  }
  function osc(type, f, t, dur, peak, opt) {
    opt = opt || {};
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (opt.detune) o.detune.value = opt.detune;
    var out = g;
    if (opt.cut) {
      var fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = opt.q || 1;
      fl.frequency.setValueAtTime(opt.cut * (opt.cutEnv || 1), t); fl.frequency.exponentialRampToValueAtTime(opt.cut, t + Math.min(dur, 0.25));
      o.connect(fl); fl.connect(g);
    } else o.connect(g);
    env(g, t, opt.a || 0.005, peak, opt.d || 0.1, opt.s === undefined ? 0.6 : opt.s, opt.r || 0.08, t + dur);
    out.connect(bus); if (opt.send) out.connect(delay);
    o.start(t); o.stop(t + dur + (opt.r || 0.08) + 0.05);
    if (opt.vib) { var l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5.5; lg.gain.value = opt.vib; l.connect(lg); lg.connect(o.frequency); l.start(t + 0.12); l.stop(t + dur + 0.2); }
  }
  function noise(t, dur, peak, type, freq) {
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    s.connect(f); f.connect(g); g.connect(bus);
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t); s.stop(t + dur + 0.02);
  }
  function kick(t, p) { var o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); g.gain.setValueAtTime(p || 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.3); }
  function snare(t, p) { noise(t, 0.18, (p || 0.5), 'bandpass', 1800); osc('triangle', 190, t, 0.05, 0.25, { d: 0.05, s: 0.2, r: 0.05 }); }
  function hat(t, open, p) { noise(t, open ? 0.2 : 0.045, (p || 0.18) * (open ? 1.1 : 1), 'highpass', 7500); }
  function clap(t) { noise(t, 0.12, 0.3, 'bandpass', 1300); noise(t + 0.012, 0.1, 0.25, 'bandpass', 1500); }

  var DR = {
    euro: { k: 'x...x...x...x...', s: '....x.......x...', h: '..o...o...o...o.', c: '................' },
    pop: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xo', c: '............x...' },
    wave: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.', c: '................' },
    tension: { k: 'x..x..x.x..x..x.', s: '................', h: 'xxxxxxxxxxxxxxxx', c: '............x...' }
  };

  function playStep(t) {
    var S = cur, dur = 60 / S.bpm / 4, list = inIntro ? S.intro : S.loop, bar = list[barIdx % list.length];
    var root = bar[0], chord = CH[bar[1]] || CH.m, mel = bar[2] || [];
    var soft = S.soft ? 0.6 : 1;
    // ドラム
    if (S.drums && !(inIntro && barIdx === 0 && step < 8 && S.drums === 'euro')) {
      var d = DR[S.drums];
      if (d.k[step] === 'x') kick(t, 0.85 * soft);
      if (d.s[step] === 'x') snare(t, 0.45 * soft);
      if (d.h[step] === 'x') hat(t, false, 0.12 * soft); else if (d.h[step] === 'o') hat(t, true, 0.12 * soft);
      if (d.c[step] === 'x') clap(t);
      if (step === 0 && barIdx % 8 === 0 && !inIntro) noise(t, 1.2, 0.18 * soft, 'highpass', 5000);   // シンバル
    }
    // ベース
    var b = root - 12;
    if (S.bass === 'octave') { if (step % 2 === 0) osc('sawtooth', mf(step % 4 === 0 ? b : b + 12), t, dur * 1.6, 0.34, { cut: 900, cutEnv: 3, q: 4, d: 0.08, s: 0.3 }); }
    else if (S.bass === 'walk') { var wk = [0, 0, 7, 0, 12, 0, 7, 10][Math.floor(step / 2)]; if (step % 2 === 0 && step !== 6 && step !== 14) osc('triangle', mf(b + wk), t, dur * 1.8, 0.5, { d: 0.1, s: 0.5 }); }
    else if (S.bass === 'pulse') { if (step % 2 === 0) osc('sawtooth', mf(b), t, dur * 1.5, 0.22, { cut: 600, cutEnv: 2.5, q: 3 }); }
    else if (S.bass === 'sixteen') osc('sawtooth', mf(b), t, dur * 0.8, 0.2, { cut: 500, cutEnv: 2, q: 5, s: 0.3 });
    else if (S.bass === 'sustain' && step === 0) osc('sine', mf(b), t, dur * 16, 0.35, { a: 0.05, d: 0.5, s: 0.7, r: 0.4 });
    // パッド（和音）
    if (S.pad && step === 0) chord.slice(0, 3).forEach(function (iv) {
      [-7, 7].forEach(function (dt) { osc('sawtooth', mf(root + iv), t, dur * 16, (S.dark ? 0.035 : 0.045) * soft, { detune: dt, cut: S.dark ? 900 : 1500, a: 0.25, d: 0.4, s: 0.8, r: 0.5 }); });
    });
    // アルペジオ
    if (S.arp) { var ai = chord[step % chord.length] + (step % 8 >= 4 ? 12 : 0); osc('square', mf(root + 12 + ai), t, dur * 0.7, 0.05 * soft, { cut: 2600, d: 0.05, s: 0.2, send: true }); }
    // エレピ（裏拍で和音）
    if (S.ep && (step === 3 || step === 7 || step === 11 || step === 14)) chord.forEach(function (iv) { osc('triangle', mf(root + 12 + iv), t, dur * 1.2, 0.07, { d: 0.12, s: 0.25, send: true }); });
    // ピアノ（8 分の分散和音）
    if (S.piano && step % 2 === 0) { var pi = [0, 1, 2, 1, 2, 1, 0, 2][step / 2]; osc('triangle', mf(root + 12 + chord[pi % chord.length]), t, dur * 3, 0.12, { d: 0.4, s: 0.15, r: 0.3, send: true }); }
    // 旋律
    if (!inIntro) mel.forEach(function (n) {
      if (n[0] !== step) return;
      var len = n[2] * dur;
      if (S.leadWave === 'piano') { osc('triangle', mf(n[1]), t, len, 0.22, { d: 0.6, s: 0.25, r: 0.4, send: true }); osc('sine', mf(n[1] + 12), t, len * 0.5, 0.05, { d: 0.3, s: 0.1 }); }
      else if (S.leadWave === 'tri') { osc('triangle', mf(n[1]), t, len, 0.2, { a: 0.01, d: 0.2, s: 0.7, vib: 3, send: true }); osc('sine', mf(n[1] + 12), t, len, 0.05, {}); }
      else {
        var w = S.leadWave === 'square' ? 'square' : 'sawtooth';
        osc(w, mf(n[1]), t, len, 0.09 * soft, { detune: -9, cut: 3200, a: 0.01, d: 0.1, s: 0.8, vib: 4, send: true });
        osc(w, mf(n[1]), t, len, 0.09 * soft, { detune: 9, cut: 3200, a: 0.01, d: 0.1, s: 0.8, vib: 4, send: true });
      }
    });
    step++;
    if (step >= 16) {
      step = 0; barIdx++;
      if (inIntro && barIdx >= S.intro.length) { inIntro = false; barIdx = 0; }
    }
  }
  function tick() {
    if (!cur || !ac) return;
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) { /* ignore */ } }
    var la = ac.currentTime + 0.15;
    if (next < ac.currentTime - 0.3) next = ac.currentTime + 0.05;   // 裏画面に回っていたあと、遅れた分を一気に鳴らさない
    while (next < la) { playStep(next); next += 60 / cur.bpm / 4; }
  }

  var M = R.Music = { current: null };
  M.play = function (name) {
    if (M.current === name) return;
    M.stop(true);
    if (!SONGS[name] || !setup()) { M.current = null; return; }
    if (level() <= 0) { M.current = name; return; }
    cur = SONGS[name]; M.current = name;
    bus.gain.cancelScheduledValues(ac.currentTime); bus.gain.setValueAtTime(0.0001, ac.currentTime); bus.gain.linearRampToValueAtTime(level(), ac.currentTime + 0.8);
    step = 0; barIdx = 0; inIntro = true; next = ac.currentTime + 0.08;
    clearInterval(timer); timer = setInterval(tick, 25);
  };
  M.stop = function (quick) {
    clearInterval(timer); timer = 0;
    if (ac && bus) { var t = ac.currentTime; bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0.0001, t + (quick ? 0.25 : 0.8)); }
    cur = null; M.current = null;
    // 次の曲のために新しいバスを用意する（鳴り残りは古いバスごと消える）
    if (ac) { var old = bus; setTimeout(function () { try { old.disconnect(); } catch (e) { /* ignore */ } }, 1200); bus = ac.createGain(); bus.gain.value = 0.0001; bus.connect(comp); delay.disconnect(); var dl = ac.createGain(); dl.gain.value = 0.22; delay.connect(dl); dl.connect(bus); var fb = ac.createGain(); fb.gain.value = 0.28; delay.connect(fb); fb.connect(delay); }
  };
  M.refresh = function () { if (M.current && !cur && level() > 0) { var nm = M.current; M.current = null; M.play(nm); return; } if (bus && cur && ac) bus.gain.setTargetAtTime(Math.max(0.0001, level()), ac.currentTime, 0.1); if (cur && level() <= 0) M.stop(true); };
  M.jingle = function (kind) {
    var keep = M.current; M.stop(true);
    if (!setup() || level() <= 0) return;
    bus.gain.setValueAtTime(level(), ac.currentTime);
    var t = ac.currentTime + 0.05, notes = kind === 'win'
      ? [[0, 72, 0.12], [0.12, 76, 0.12], [0.24, 79, 0.12], [0.36, 84, 0.5], [0.9, 81, 0.12], [1.02, 84, 0.9]]
      : [[0, 72, 0.25], [0.3, 71, 0.25], [0.6, 70, 0.25], [0.9, 69, 1.0]];
    notes.forEach(function (n) {
      osc(kind === 'win' ? 'square' : 'triangle', mf(n[1]), t + n[0], n[2], 0.12, { cut: 3000, d: 0.1, s: 0.6, send: true });
      osc('sawtooth', mf(n[1] - 12), t + n[0], n[2], 0.05, { cut: 1500, d: 0.1, s: 0.5 });
    });
    if (kind === 'win') [0, 0.36, 0.9].forEach(function (d) { kick(t + d, 0.7); noise(t + d, 0.6, 0.1, 'highpass', 6000); });
    return keep;
  };
  /** モードからふさわしい曲を選ぶ */
  M.forRace = function (cfg) {
    if (!cfg) return 'battle';
    if (cfg.mode === 'world') return 'drive';
    var boss = (cfg.field || []).some(function (d) { return d.boss; });
    if (boss || cfg.mode === 'sp' || cfg.mode === 'chase') return 'boss';
    if (cfg.mode === 'time' || cfg.mode === 'brake' || cfg.mode === 'drag' || cfg.mode === 'gymkhana') return 'drive';
    return 'battle';
  };

  /* ---------- アルバム（曲を順に聴く） ---------- */
  var TRACKLIST = [
    ['title', 'タイトル', 'メニューで流れる、静かなシンセウェイブ。'],
    ['school', '放課後の坂道', '学校の場面。明るくて軽い、昼下がりのポップ。'],
    ['story', 'ピアノの小さな部屋', '会話の場面のピアノ。ゆっくり、静かに。'],
    ['sad', '雨のあとで', 'しんみりした場面。切ないピアノ。'],
    ['night', '夜の高速を降りて', '夜景を眺める、シティポップ風の曲。'],
    ['drive', 'ドライブ・ウェイ', 'オープンワールドを走るときの、涼しい曲。'],
    ['festival', '提灯の夜', '祭りの夜の、和風のにぎやかな曲。'],
    ['tension', '張りつめた空気', '緊迫した場面。低く、せまってくる曲。'],
    ['battle', 'バトル・ライン', 'レースで流れる、ユーロビート風の曲。'],
    ['boss', 'ボス戦', '強敵との勝負。暗く、激しい曲。'],
    ['final', '最後の勝負', '最終決戦の曲。速く、高く駆け上がる。'],
    ['ending', 'その先へ', 'エンディングの曲。明るく、おだやかに終わる。']
  ];
  function songSecs(name) { var S = SONGS[name]; return (S.intro.length + S.loop.length * 2) * 16 * 60 / S.bpm / 4; }
  var alb = { active: false, idx: 0, repeat: 'all', timer: 0 };
  function albPlay(i) {
    clearTimeout(alb.timer);
    alb.active = true; alb.idx = (i + TRACKLIST.length) % TRACKLIST.length;
    var id = TRACKLIST[alb.idx][0];
    M.stop(true); M.play(id);
    // 一曲ぶん（前奏 + 本編 1 周）が終わったら、次へ（または同じ曲をもう一度）
    alb.timer = setTimeout(function () {
      if (!alb.active) return;
      if (alb.repeat === 'one') albPlay(alb.idx); else if (alb.repeat === 'all' || alb.idx < TRACKLIST.length - 1) albPlay(alb.idx + 1); else alb.stop();
      if (alb.onChange) alb.onChange();
    }, (songSecs(id) + 1.2) * 1000);
    if (alb.onChange) alb.onChange();
  }
  alb.tracks = TRACKLIST.map(function (t) { return { id: t[0], name: t[1], desc: t[2], secs: Math.round(songSecs(t[0])) }; });
  alb.play = albPlay;
  alb.next = function () { albPlay(alb.idx + 1); };
  alb.prev = function () { albPlay(alb.idx - 1); };
  alb.stop = function () { clearTimeout(alb.timer); var was = alb.active; alb.active = false; if (was) M.stop(true); if (alb.onChange) alb.onChange(); };
  alb.setRepeat = function (r) { alb.repeat = r; };
  M.album = alb;
  M.SONGS = SONGS;
  M.tap = function () { return comp; };   // テスト用（出力の手前）
})();
