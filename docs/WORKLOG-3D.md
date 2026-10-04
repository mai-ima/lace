# 3D 浜松（world3d.html）作業メモ

コンテキストの圧縮で情報が失われないよう、決まりごと・作業の手順・残りのタスクをここにまとめる。作業を再開するときは最初にこのファイルを読む。

## ユーザーの指定（必ず守る）
- 回答は必ず日本語。絵文字は使わない（アイコンは SVG）。
- 既存キャラの顔は変えない。架空コースを実在の道路に置き換えない。他のモードを壊さない。
- 軽量化で品質を落とさない。ファイルの編集には作業に合ったツール（Edit / Write）を使う。
- 目標: Forza Horizon 6 級（AAA）の品質で浜松市を完全に再現する。実データ（PLATEAU・国土地理院・OSM）と、日本の実際の交通ルールを使う。
- 区切りごとに監査エージェント（画像を複数使って厳しく判定）を動かす。5 時間枠の使用率が 70% 以上なら 1 本、それ未満なら最大 3 本。
- 浜松全域への拡張（最後の段階）の前に、エージェントで監査する。合格の基準は「AAA 級と同レベルで、浜松を高品質に完全再現した」と言えること。
- 中断せずに完成まで続ける。使用制限で止まったら、回復後にそのまま再開する。
- コミットは `claude/remove-tui-expand-race-mrunmh` に置き、main にも push する。
  `git push -q origin claude/remove-tui-expand-race-mrunmh && git push -q origin HEAD:refs/heads/main`
  コミットの末尾には次の 2 行を付ける。
  - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_01XE76ehNav5Ps8iLoRt71ne`
- PR は頼まれるまで作らない。リポジトリにモデル名を書かない。
- トークン（MAPILLARY_TOKEN・SKETCHFAB_TOKEN）は環境の設定に入れてもらう。チャットに貼らせない。
- 市販ゲームからの素材の抜き出しはしない。車のエンブレムは残す（外すのは STRIP_BADGE=1 のときだけ）。

## 確認の手順
- テスト: `node tools/test/run.js`（golden・invariants・world・menus・w3）と `node tools/test/phys.mjs`。
  w3 の予算は、中画質で描画 300 回以下・三角形 150 万以下。renderer.info は影の描画も数えるので、影を落とす物は 2 倍になる。
- コンテナが再起動したら、ローカルのサーバーを立て直す: `cd /home/user/lace && nohup python3 -m http.server 8123 &`
- 作業用のスクリプト（スクラッチパッド）
  - street.js: 路上視点（POSES・OUT・Q・TIER）
  - cmp.js: 真上から（PTS・OUT・HALF）
  - orthocrop.py: 航空写真の切り抜き
  - dbg2.js: EXPR を評価する
  - tribreak.js: 三角形の内訳
- データを作り直す道具: tools/world/ にある。
  - build_center.py・build_tran.py・dump_net.mjs: 道路網
  - build_water.py: 川
  - dem_bldg.py: 標高に残った建物の塊を除く
  - photo_cross.py: 写真から横断歩道を補う
  - build_parking.py: 駐車場
  - vehicles.mjs: 車
- 座標: x が東、z が南。LAT0 = 34.7037、LON0 = 137.7351。

## 済んだこと（直近）
- 車輪: cars.js の extractWheels で、名前に頼らず形で切り出す（4 隅の円い塊がタイヤ。トー角は直す）。確認は tools/world/wheelview.html。
- 車の LOD（tools/world/vehicles.mjs）
  - sloppy は使わない。法線も考えた間引き（simplifyWithAttributes、実寸の誤差）を使う。
  - 面ごとに頂点が分かれたモデルは、位置で頂点をまとめてから滑らかな法線を作る（lod2、lod1 のテクスチャの無い部品）。
  - 面の向きがそろっていないモデル（レクサス ES・アコード 2019）は、この方法で壊れるので採用しない。
- ガレージ: assets/js/w3/garage.js（C キー・一時停止画面）。写真は assets/data/world/cars/thumb_<key>.jpg（scratchpad の thumbs.js で作る）。
- 平面駐車場: build_parking.py（OSM と PLATEAU 土地利用）。道路の上の屋根: bldg_over.py（柱つき）。
- 橋の端の高さは道路に合わせる（world.js の最初）。標高に残った建物の塊は dem_bldg.py で除く。

## 残りのタスク（作業量の小さい順。完了したら消す）
- [急3] 高架の高さ（鉄道の実際の高さの資料が無い。遠州の layer の誤りは直した）と、上下の動きの確認の残り。
- [中2] 塀・庭・沿道。駐車場に止まっている車（三角形の予算に注意）。
- [中4] 高架下・ピロティの通り抜けを、路上視点で確認する。
- [中6・中12] 一般車の遠くの形（LOD2）の崩れを直す。リアルな車種（軽トールワゴン・ミニバン・軽トラ・タクシー・バス・トラック）を複数足す。
- [中7] 建物の 1 階の店構え・屋上・看板と、住宅の外壁。
- [中8・中9] 案内標識（青看板・門型）を作る。中身は場所ごとの実際の行先にする（全部同じにしない）。
- [中10] アーケード・渡り廊下が地面まで伸びている。下を開けて描く。
- [中11] 駐車場のゲート（発券機・精算機・開閉バー）・車止め・止まっている車。バス停（標識柱・屋根・ベンチ）。
- [大1] IC・JCT・料金所・SA/PA
- [大2] 路上写真・点群で照合する（Mapillary・Commons・VIRTUAL SHIZUOKA）。
- [大3] 天候・季節・歩行者
- [大4] 新しい疑似 3D
- [大5] 本編に組み込む。
- [大6] チェーン店の看板・ロゴ（後の段階）
- [大7] UI の全面改修（後の段階）
- [確認] 以前のストーリー・モードの指示が終わっているか確かめる。
- [最後] 浜松市全域（拡張の前に監査する）

## 分かっている課題
- カスケード影（CSM、world3d.html?csm=1）: 手前の路面が一様に暗くなる。ずらし量・既存の太陽を外す、では直らない。原因を調べてから既定にする。
- 駅前の複雑な交差点の横断歩道と、分離帯の形
- 2022 年の土地利用で駐車場だった工事中の土地に、区画の線が出る。
- 標識が遠くで小さい。
