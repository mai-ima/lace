/*
 * 3D 自由走行の車両物理の基準テスト（ブラウザ不要）: node tools/test/phys.mjs
 * 平らな地面で 0-100km/h、制動距離、後退の上限、低速の全切り、定常旋回で横滑りしないことを確かめる。
 */
import { makeCar } from '../../assets/js/w3/vehicle.js';
const g = () => ({ y: 0, mu: 1 }), DT = 1 / 120, fails = [];
const ctl = c => Object.assign({ steer: 0, throttle: 0, brake: 0, hand: 0 }, c);
const check = (name, v, lo, hi) => { const ok = v >= lo && v <= hi; console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + v.toFixed(2) + ' (' + lo + '〜' + hi + ')'); if (!ok) fails.push(name); };
let car = makeCar(), t = 0; while (car.kmh() < 100 && t < 30) { car.step(DT, ctl({ throttle: 1 }), g); t += DT; }
check('0-100km/h 秒', t, 5, 9);
car = makeCar(); for (let i = 0; i < 60 / DT; i++) car.step(DT, ctl({ throttle: 1, reverse: true }), g);
check('後退の最高 km/h', car.kmh(), 15, 21);
car = makeCar(); for (let i = 0; i < 4 / DT; i++) car.step(DT, ctl({ throttle: 0.6, steer: 1 }), g);
check('停止から全切りで 4 秒の向きの変化 rad', Math.abs(car.st.yaw), 1.5, 8);
car = makeCar(); car.st.vx = 100 / 3.6; let d = 0; while (car.st.vx > 0.1 && d < 500) { const x = car.st.x, z = car.st.z; car.step(DT, ctl({ brake: 1 }), g); d += Math.hypot(car.st.x - x, car.st.z - z); }
check('100→0 制動距離 m', d, 30, 50);
for (const [v, s] of [[60, 0.6], [60, 1], [100, 0.4], [100, 1]]) {
  car = makeCar(); car.st.vx = v / 3.6; car.st.gear = 3; let mb = 0;
  for (let i = 0; i < 6 / DT; i++) { car.step(DT, ctl({ steer: s, throttle: 0.35 }), g); mb = Math.max(mb, Math.abs(Math.atan2(car.st.vy, Math.abs(car.st.vx)))); }
  check(v + 'km/h 舵 ' + s + ' の最大横滑り角 度', mb * 57.3, 0, 8);
}
process.exit(fails.length ? 1 : 0);
