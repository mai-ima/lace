# TUI-BASE

ブラウザの中で動く、ターミナル風のウェブサイトです。
ビルド不要・依存ゼロ。HTML / CSS / JavaScript だけでできています。

```
guest@tui-base:~$ help
```

## できること

- **コマンド入力** — `help` `about` `projects` `skills` `contact` など
- **使い方の早見表** — `manual` で全コマンドの書式・使用例・別名・キー操作をまとめて表示
- **仮想ファイルシステム** — `ls` `cd` `cat` `tree` `pwd`
- **入力補助** — Tab 補完、`↑`/`↓` で履歴、`→` で候補の確定、打ち間違いの候補提示
- **テーマ 5 種** — `theme midnight | amber | matrix | synth | paper`（選択は保存されます）
- **日本語 / 英語の切り替え** — `lang ja` / `lang en`
- **CRT 風の効果** — `crt on` / `crt off`
- **メニュー操作** — 左（スマートフォンでは上）のメニューはクリックでも動きます
- **ゲーム 13 種** — `race` `tetris` `rogue` `snake` `2048` `mine` `sokoban` ほか（`games` で一覧）
- **本格レースゲーム** — `race` は疑似 3D（WebGL の 3D も選べます）のウィンドウ版。デイリーレースと実績もあります
- **限定的な GUI** — ドラッグで動かせるウィンドウ。`settings` `paint` `gcalc` `sound` `windows` `closeall`
- **コマンド 231 個** — Windows / Unix / macOS / Linux / Android / iOS 風、文字の道具、お遊び
- **かくれコマンド 48 個** — `help` には出さず、`manual` にだけ ◆ 印で載せています
- **おまけ** — `neofetch` `fortune` `matrix` `cowsay` `figlet` `clock` など
- JavaScript が無効でも、主要な文章は `<noscript>` で読めます

キー操作: `Tab` 補完 / `↑` `↓` 履歴 / `Ctrl+L` 画面消去 / `Ctrl+C` 入力取消 / `Ctrl+U` 行削除

`help` は名前と一行説明の一覧、`manual` は書式（`<必須>` `[省略可]` `a|b`）と使用例まで含む
全コマンドの説明です。1 つだけ読みたいときは `man <名前>` または `manual <名前>`。

## 遊ぶ

`games` で一覧と自己記録が出ます。記録はブラウザに保存されます。

### キーで直接操作するもの

| コマンド | 内容 |
| --- | --- |
| `race` | 本格レースゲーム「TUI RACING」。ウィンドウ内のメニュー（据え置き機風） |
| `taxi` | タクシーのアルバイト（`race job taxi` と同じ） |

**TUI RACING の中身**

- **ストーリー**「天竜の白い亡霊」全 24 話＋番外編。章タイトル・背景・表情つき立ち絵・揺れ／フラッシュ／集中線／擬音・VS 画面の演出、レース中の無線、SP バトル
- **オープンワールド** 浜松市の主要道路と地区（37 地点・50 路線）〜東名／新東名〜名古屋市。信号交差点（右左折・交差車両）、左側通行と対向車、パトカーの追跡、オービス
- **アルバイト** タクシー・宅配便（こわれもの）・うなぎ弁当の出前
- **デイリーレース** 日付で決まる全員共通のコース・天気・周回。表彰台で連続日数とボーナス（`race daily`）
- **実績** 24 種のトロフィーを解除すると賞金（`race achievements`）
- **グランプリ** 8 カップ（峠キング決定戦、公道 GP 箱根シリーズ、GT サーキットなど）
- **峠バトル** ガードレールの狭いダウンヒルで 1 対 1（後追いスタート・150m 引き離しで勝ち）
- **チャレンジ** エリミネーション／デュエル／アーケード／ポリスチェイス／ハイウェイ・サバイバル、**タイムアタック**（ゴースト）
- **ミニゲーム** ジムカーナ・ゼロヨン（手動シフト）・ピタッと停止
- **カジュアル** パーティレース・コインラッシュ（コインと加速パネルはここだけ）
- **コース 23 本**（峠 5 本・サーキット・高速道路・ご当地コースを含む）、**車 36 台**（AE86・FC/FD・R32 系などのモチーフ車、スーパーカー、ゴーカートやトラクターなどのお遊び車両）
- **音** 車種ごとに合成したエンジン音（直 3／直 4／直 6／水平対向／ロータリー／V8／V12／ディーゼル／2 ストローク／電気）、自動変速、ターボとブローオフ、スキール、風切り、雨音
- 天気（雨・雪・霧・砂嵐・降灰）、トンネル、ミラー（左右反転）コース、改造と塗装
- **3D 表示（試験版）** 設定またはレース中の `v` キーで WebGL（three.js）の立体描画に切り替え。標準は疑似 3D

操作: `←` `→` ハンドル、`↑` アクセル、`↓` ブレーキ、スペースでニトロ（ゼロヨンではシフトアップ）、`p` 一時停止。


操作は共通で、矢印キー（または `hjkl`）で動かし、`q` でやめます。
テトリスは `↑` 回転・スペースでハードドロップ・`c` でホールド・`p` で一時停止、
ローグライクは `y u b n` で斜め移動・`p` で薬・`.` で待機です。
スマートフォンでは画面の中に方向キーが出ます。

ローグライクの記号は `@` あなた、`#` 壁、`>` 下り階段、`!` 薬、`$` 金貨、
`)` `[` 装備、`*` 護符。アルファベットはすべてモンスターで、深いほど強くなります。

### 1 行ずつ入力して遊ぶもの

| コマンド | 内容 |
| --- | --- |
| `guess` | 数当て。残りの範囲がバーで出る |
| `ttt` | 三目並べ。`easy` / `normal` / `hard`（hard は最善手なので引き分けが最高） |
| `rps` | じゃんけん。`r` `s` `p` または「ぐー」「ちょき」「ぱー」 |
| `hangman` | 言葉当て。1 文字ずつ、または単語まるごと |
| `blackjack` | ブラックジャック。`h` で引く、`s` で止める |
| `quiz` | コマンドの豆知識クイズ。`quiz 12` で問題数を指定 |

## 動かし方

動作環境は 2 通りあります。どちらでも同じように動きます。

### 1. HTML としてそのまま開く

`index.html` をブラウザで開くだけです（`file://` でも動きます）。

ローカルサーバで見たい場合:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

### 2. Vercel に置く

このリポジトリをそのまま Vercel にインポートすれば静的サイトとして公開されます。
ビルド設定は不要です（Framework Preset は **Other**、ビルドコマンドは空のままで構いません）。

CLI から公開する場合:

```bash
npx vercel        # プレビュー環境
npx vercel --prod # 本番環境
```

`vercel.json` にはキャッシュとセキュリティヘッダだけを書いてあります。

## コマンド

`help` で一覧、`manual` で全 235 個の使い方（書式・例・別名）が読めます。
分類は次のとおりです。

| 分類 | 数 | 例 |
| --- | --- | --- |
| 内容 | 6 | `about` `projects` `skills` `contact` `help` `manual` |
| ファイル | 5 | `ls` `cd` `cat` `pwd` `tree` |
| ゲーム | 13 | `tetris` `rogue` `snake` `2048` `mine` `sokoban` `quiz` ほか |
| Windows / DOS | 27 | `dir` `type` `ver` `vol` `ipconfig` `ping` `tracert` `tasklist` `title` `color` `pause` `set` `chkdsk` |
| Unix 風 | 40 | `uname` `uptime` `ps` `top` `df` `du` `find` `grep` `head` `tail` `wc` `sort` `stat` `which` `alias` `apropos` `cal` `seq` `sl` |
| macOS | 15 | `sw_vers` `say` `pbcopy` `pbpaste` `mdfind` `brew` `diskutil` `caffeinate` `osascript` `launchctl` `airport` |
| Linux | 23 | `apt` `pacman` `dnf` `systemctl` `journalctl` `dmesg` `lsblk` `lscpu` `lsusb` `ip` `mount` `snap` `lolcat` `vim` `emacs` `nano` |
| Android | 14 | `adb` `fastboot` `pm` `am` `getprop` `logcat` `dumpsys` `input` `wm` `battery` `vibrate` `share` `toast` |
| iOS | 12 | `ideviceinfo` `xcrun` `simctl` `siri` `shortcuts` `springboard` `airdrop` `facetime` `haptic` `icloud` |
| 文字を扱う | 18 | `calc` `figlet` `base64` `rot13` `morse` `nato` `hash` `uuid` `password` `lorem` `upper` `rev` |
| お遊び | 10 | `cowsay` `8ball` `roll` `flip` `choose` `joke` `weather` `coffee` `clock` |
| かくれているもの | 27 | `manual` にだけ載っています（下記） |
| 設定・その他 | 17 | `theme` `lang` `crt` `banner` `neofetch` `history` `open` `beep` `fullscreen` |

### 本当に動くもの

- `grep` `head` `tail` `wc` `sort` `uniq` `find` `du` `stat` `mdfind` — この中の仮想ファイルを実際に読みます
- `calc` — `eval` を使わない自前の式解釈（`calc 12*(3+4)-5/2` → `81.5`）
- `cal` — 本物の今月のカレンダー。今日の日付が反転して出ます
- `title` — ウィンドウ名を変えます。`color 0a` など DOS の色コードはテーマを変えます
- `say` — 読み上げ、`beep` — 短い音、`fullscreen` — 全画面
- `pbcopy` / `pbpaste` — クリップボード（ブラウザの許可が要ります）
- `battery` `vibrate` `share` `toast` `wm` — スマートフォンで実際に動きます
- `input text <文字>` — 入力欄に文字を流し込みます
- `am start tetris` のようにゲーム名を渡すと、そのゲームが本当に始まります

### 表示だけのもの（演出）

`ipconfig` `ping` `tracert` `netstat` `ps` `df` `free` `tasklist` `adb` `fastboot`
`systemctl` `journalctl` `dmesg` `apt` `brew` `simctl` などは、本物の機械や
ネットワークを覗いているわけではありません。`manual` の説明文にも（演出）と
書いてあります。

### かくれコマンド

`help` には出てきません。`manual` で ◆ の印が付いているものがそれです。

```
xyzzy  42  hello  please  make  :q  cake  tea  telnet  zen  love  404  boo
moon  credits  secret  konami  tux  apple  droid  win  nyan  snow  dance
upside  sudo  rm
```

`↑ ↑ ↓ ↓ ← → ← → b a` と押すと、隠しテーマが開きます（`theme konami`）。
`upside` は画面をひっくり返し、もう一度打つと戻ります。

## 中身を書き換える

サイトの文章・項目は **`assets/js/content.js` の 1 ファイルにまとまっています**。
ここを書き換えれば自分のサイトになります。

```js
projects: [
  {
    name: 'my-project',
    year: '2026',
    tags: ['rust', 'cli'],
    url: 'https://example.com',
    desc: { ja: '日本語の説明', en: 'English description' }
  }
]
```

- 文字列は `{ ja: '…', en: '…' }` と書くと言語切替に対応します。ただの文字列でも構いません。
- `{accent:強調したい文字}` と書くと色が付きます（`accent` `accent-2` `dim` `warn` `err` `bold` `inv`）。
- URL は自動でリンクになります。
- `contact` と `projects` に `url` を入れると `open <名前>` で開けます。

テーマの色は `assets/css/tui.css` の先頭、`[data-theme="..."]` にまとまっています。
コマンドを足したいときは `assets/js/commands.js` の `def('名前', { ... })` を真似してください。
`help` の一覧には自動で載ります。

## ファイル構成

```
index.html              画面の骨組みと、JavaScript 無効時の代替表示
vercel.json             Vercel 用の設定（静的配信・ヘッダ）
assets/css/tui.css      テーマ、レイアウト、CRT 効果
assets/js/content.js    サイトの中身（ここだけ編集すれば OK）
assets/js/fs.js         言語・保存まわりと仮想ファイルシステム
assets/js/term.js       画面描画と入力（履歴・補完・カーソル）
assets/js/commands.js   コマンドの定義
assets/js/games.js      rogue / guess / ttt と games 一覧
assets/js/gamekit.js    ゲームの共通部品（枠・入力・記録）
assets/js/games-arcade.js  tetris / snake / 2048 / mine / sokoban
assets/js/games-mini.js    rps / hangman / blackjack / quiz
assets/js/commands-extra.js  追加コマンド（Windows 風・Unix 風・文字・お遊び）
assets/js/commands-os.js     macOS / Linux / Android / iOS 風のコマンド
assets/js/easter-eggs.js     かくれコマンドと、コナミコマンド
assets/js/gui.js             ウィンドウ・効果音と GUI アプリ（settings / paint / gcalc）
assets/js/race-data.js       レースのデータ（コース・車・物語・地図・保存）
assets/js/race-audio.js      エンジン音などの合成
assets/js/race-story.js      ストーリーの台本と登場人物
assets/js/race-engine.js     レースの物理・敵・描画（Canvas と文字）
assets/js/race-3d.js         3D 描画（WebGL）
assets/vendor/three.min.js   three.js r149（MIT、3D 表示を選んだときだけ読み込む）
assets/js/race-front.js      メニュー・物語・オープンワールド・race コマンド
assets/js/app.js        起動処理、メニュー、ステータスバー
```

## 対応環境

モダンブラウザ（Chrome / Firefox / Safari / Edge の現行版）で動作します。
画像もフォントも外部から読み込まないため、オフラインでも動きます。
`prefers-reduced-motion` を有効にしている場合、起動演出とアニメーションは省略されます。
