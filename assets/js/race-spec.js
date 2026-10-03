/*
 * race-spec.js — 日本の道路・交通の公式の仕様値（ゲームで使う値と、その根拠）。
 * 出典と、ゲーム用に縮めた値の理由は docs/spec/README.md の仕様表にまとめてある。
 * ここの値を変えるときは、仕様表も一緒に直すこと。
 */
(function () {
  'use strict';
  var R = (window.TB = window.TB || {}).Race = window.TB.Race || {};

  var SPEC = {
    /* 信号（JSTE「平面交差の計画と設計」表3-1、警察庁 通達。黄は縮めない） */
    signal: {
      green: 14,          // 主道路の青（公式の最小 15 秒。ゲームのテンポで 14 秒）
      yellow: 3,          // 40km/h 以下の道路の黄（公式 3 秒）
      yellowArterial: 4,  // 50km/h 以上（幹線）の黄（公式 4 秒）
      allRed: 2,          // 全赤（公式 1〜4 秒、黄との合計 7 秒以下）
      crossGreen: 9,      // 交差道路の青（公式の従現示の最小 5 秒以上）
      pedFlash: 4         // 歩行者の青点滅（公式の目安 4〜10 秒）
    },
    /* 規制速度（施行令 第11条・第27条、交通規制基準 第33。OSM に maxspeed がない道の推定に使う） */
    speed: {
      motorway: 100, shinTomei: 120, ramp: 50, trunk: 60, primary: 50, secondary: 50,
      urbanCenterLine: 40,   // 市街地で中央線のある道（基準速度表の市街地・歩行者の多い道）
      noCenterLine: 30       // 中央線のない一般道（2026-09-01 からの法定速度）
    },
    /* 反則金（普通車、施行令 別表第六）。点数は別表第二 */
    fines: {
      signal: 9000,
      speed: [[15, 9000], [20, 12000], [25, 15000], [30, 18000]],   // 超過 km/h 未満 → 金額（一般道・高速共通の部分）
      speedHwy: [[35, 25000], [40, 35000]],                          // 高速の 30〜40 未満
      criminal: 80000,      // 一般道 30 以上・高速 40 以上は反則金がなく刑事手続き（ゲームでは高額の罰金で表す。推定）
      stopSign: 7000, crossing: 9000, turnMethod: 4000,
      busted: 15000         // 追跡の末に確保（ゲーム独自）
    },
    /* 区画線と道路標示（標識令、設計基準。単位 m） */
    marking: {
      centerLine: 0.15, centerLineWide: 0.20, laneLine: 0.15, edgeLine: 0.15,
      laneDash: [6, 9], laneDashHwy: [8, 12], centerDash: [5, 5],
      stopLine: 0.45, crosswalkStripe: 0.45, crosswalkGap: 0.45, crosswalkLen: 4,
      diamond: [5, 1.5], speedDigits: [5, 1.2], zebra: 0.45,
      solidBeforeJunction: 30,   // 交差点の手前 30m は中央線を実線に
      stopToCrosswalk: 2         // 停止線は横断歩道の 2m 手前
    },
    /* 信号機（施行規則 第4条、岐阜県 施工基準、コイト電工 低コスト灯器） */
    signalHead: { lens: 0.25, width: 1.05, height: 0.37, minBottom: 5.6, minBottomArrow: 5.0, arm: 2.0, armMax: 6.0, ped: [0.36, 0.708], pedBottom: 2.7 }
  };

  /** 信号の 1 周期（主道路側から見て 青→黄→全赤→交差道路の青→黄→全赤） */
  SPEC.cycle = function (arterial) {
    var S = SPEC.signal, y = arterial ? S.yellowArterial : S.yellow;
    return { g: S.green, y: y, ar: S.allRed, cg: S.crossGreen, cy: y, len: S.green + y + S.allRed + S.crossGreen + y + S.allRed };
  };
  /** 周期の中の時刻 t（秒）から、自分の側の信号の色。cross は交差道路に車が流れている時間か */
  SPEC.phaseAt = function (t, arterial) {
    var c = SPEC.cycle(arterial);
    t = ((t % c.len) + c.len) % c.len;
    var ph = t < c.g ? 'green' : t < c.g + c.y ? 'yellow' : 'red';
    var cs = c.g + c.y + c.ar;
    var cp = t >= cs && t < cs + c.cg ? 'green' : t >= cs + c.cg && t < cs + c.cg + c.cy ? 'yellow' : 'red';
    return { phase: ph, cross: cp === 'green', crossPhase: cp, t: t, len: c.len };
  };
  /**
   * n 現示（交差点の腕を向きでまとめた n 個のグループ）の信号。グループ 0 が主道路（青 14 秒）、ほかは青 9 秒。
   * 各グループの青のあとに黄（幹線 4 秒、その他 3 秒）と全赤 2 秒を入れる。返り値: グループごとの色の配列
   */
  SPEC.phasesAt = function (t, n, arterial) {
    var S = SPEC.signal, y = arterial ? S.yellowArterial : S.yellow, len = 0, i, d = [];
    for (i = 0; i < n; i++) { d.push(i === 0 ? S.green : S.crossGreen); len += d[i] + y + S.allRed; }
    t = ((t % len) + len) % len;
    var out = [], acc = 0;
    for (i = 0; i < n; i++) {
      var a = t - acc, col = a >= 0 && a < d[i] ? 'green' : a >= d[i] && a < d[i] + y ? 'yellow' : 'red';
      out.push(col); acc += d[i] + y + S.allRed;
    }
    return out;
  };
  /** OSM の maxspeed がない道の規制速度の推定（道路の種類 c と車線数） */
  SPEC.limitFor = function (e) {
    if (e.ms) return e.ms;
    var S = SPEC.speed;
    if (e.c === 0) return S.motorway;
    if (e.c >= 5) return S.ramp;
    if (e.c === 1) return S.trunk;
    if (e.c === 2) return S.primary;
    if (e.c === 3) return S.secondary;
    return (e.lanes || 0) >= 2 || !e.one ? S.urbanCenterLine : S.noCenterLine;
  };
  /** 速度超過の反則金（over: 超過 km/h、hwy: 高速道路か） */
  SPEC.speedFine = function (over, hwy) {
    var F = SPEC.fines, i;
    for (i = 0; i < F.speed.length; i++) if (over < F.speed[i][0]) return F.speed[i][1];
    if (hwy) for (i = 0; i < F.speedHwy.length; i++) if (over < F.speedHwy[i][0]) return F.speedHwy[i][1];
    return F.criminal;
  };

  R.SPEC = SPEC;
})();
