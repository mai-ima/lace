/*
 * race-story4.js — ストーリー4「星の砂漠 1983 ―グレート・サンド・ラリー―」（新規）
 *
 * 1983 年。日本の小さな整備工場「ナナホシ」の娘・神谷リン（21）は、
 * 四年前の砂漠横断ラリーで消息を絶った伝説のドライバーの父・剛（ゴウ）の足跡を追って、
 * 継ぎはぎの車で「グレート・サンド・ラリー」に初出場する。
 * 砂漠、峡谷、火山、雪の山脈、そして地図にない「星の井戸」へ。
 *
 * 真相（ネタバレ）
 *   1979 年の大砂嵐の中、ゴウは遭難した遊牧民の一家を見つけて、
 *   「先に行け」とヴィクトル（当時のナビ）をレースに送り出し、自分はその場に残った。
 *   ゴウは生き延び、井戸に風車ポンプを作って暮らし、八一年に病で亡くなる。
 *   彼が残したのは「星の地図」と、リンへの手紙。最終ステージは、その地図の道。
 */
(function () {
  'use strict';
  var TB = window.TB, R = TB.Race, C = R.CHARS, B = R.BOSSES;

  /* ---------- 登場人物 ---------- */
  C.rin = { name: 'リン', color: '#ff8a65',
            face: { skin: '#f3cfb0', hair: '#6d3b24', style: 'ponytail', eyes: '#3a1f14', acc: 'goggles', shirt: '#e65100', bg: '#2a1a10' } };
  C.daigo = { name: 'ダイゴ', color: '#a1887f',
              face: { skin: '#d4a373', hair: '#9e9e9e', style: 'buzz', eyes: '#2a1a10', acc: 'mustache', shirt: '#455a64', bg: '#222222' } };
  C.minoru = { name: 'ミノル', color: '#81d4fa',
               face: { skin: '#f0d0b4', hair: '#222', style: 'bob', eyes: '#222', acc: 'glasses', shirt: '#eceff1', bg: '#16222e' } };
  C.yasmin = { name: 'ヤスミン', color: '#ce93d8',
               face: { skin: '#c68e5e', hair: '#1a1a1a', style: 'long', eyes: '#2a1a10', acc: 'bandana', shirt: '#7b1fa2', bg: '#2a1a2a' } };
  C.viktor = { name: 'ヴィクトル', color: '#e0e0e0',
               face: { skin: '#f1d9c2', hair: '#d9c58a', style: 'swept', eyes: '#2a4a6a', acc: 'scar', shirt: '#b71c1c', bg: '#1a1a1e' } };
  C.rose = { name: 'マダム・ローズ', color: '#ef9a9a',
             face: { skin: '#e8c8aa', hair: '#8e2a2a', style: 'wavy', eyes: '#3a2a20', acc: 'earring', shirt: '#4a148c', bg: '#1f1226' } };
  C.go = { name: '剛（父）', color: '#ffcc80',
           face: { skin: '#d9ab86', hair: '#3a2a20', style: 'short', eyes: '#2a1a10', acc: 'mustache', shirt: '#8d6e63', bg: '#2b2418' } };
  C.hakim = { name: 'ハキム（ヤスミンの祖父）', color: '#d7ccc8',
              face: { skin: '#b9835a', hair: '#eeeeee', style: 'bald', eyes: '#2a1a10', acc: 'mustache', shirt: '#6d4c41', bg: '#2a2218' } };
  C.radio83 = { name: '本部（無線）', color: '#80cbc4',
                face: { skin: '#e7bb96', hair: '#455a64', style: 'short', eyes: '#222', acc: 'headset', shirt: '#37474f', bg: '#14202a' } };

  /* ---------- ボスと車 ---------- */
  B.viktor = { name: 'VIKTOR', color: '#c62828', body: 'wedge', ai: 'speedster', skill: 1.02, boss: true, ability: 'burst' };
  B.rose = { name: 'ROSE', color: '#8e24aa', body: 'gt', ai: 'technician', skill: 0.95, boss: true, ability: 'block' };
  B.hakim = { name: 'HAKIM', color: '#6d4c41', body: 'pickup', ai: 'technician', skill: 0.85, boss: true, ability: 'block' };
  B.runaway = { name: 'RUNAWAY', color: '#fbc02d', body: 'truck', ai: 'balanced', skill: 0.9, boss: true };
  B.gosts = { name: 'GO', color: '#fafafa', body: 'rally', ai: 'technician', skill: 1.02, boss: true, ability: 'block' };
  [
    { id: 'safari0', name: { ja: 'ナナホシ号（廃車の山から）', en: 'Nanahoshi (from the scrapyard)' }, cls: 'D', price: 0, body: 'rally', paint: 4, offroad: true, unlock: true, era: 1983,
      stats: { spd: 3, acc: 4, grp: 5, arm: 5, nit: 3 }, desc: { ja: '父の古い車の部品を、ミノルがかき集めて組んだ。見た目はひどいが、よく走る。', en: 'Pieced together from scrap. Ugly, but it runs.' } },
    { id: 'safari1', name: { ja: 'ナナホシ Mk.1', en: 'Nanahoshi Mk.1' }, cls: 'B', price: 0, body: 'rally', paint: 3, offroad: true, unlock: true, era: 1983,
      stats: { spd: 6, acc: 7, grp: 8, arm: 7, nit: 5 }, desc: { ja: 'ダイゴとミノルが改造した砂漠仕様。足回りが長く、砂に強い。', en: 'Desert-spec, long-travel suspension.' } },
    { id: 'safari2', name: { ja: 'ナナホシ Mk.2（星の地図号）', en: 'Nanahoshi Mk.2' }, cls: 'A', price: 0, body: 'rally', paint: 1, offroad: true, unlock: true, era: 1983,
      stats: { spd: 8, acc: 8, grp: 9, arm: 8, nit: 7 }, desc: { ja: '父の遺した設計図で作り直した決戦仕様。星の道を走るための車。', en: "The final car, rebuilt from her father's drawings." } }
  ].forEach(function (c) { if (!R.CARS.some(function (x) { return x.id === c.id; })) R.CARS.push(c); });

  function S(o) { return o; }

  var CH = [
    { id: '0', name: '序章　ナナホシ整備工場' },
    { id: '1', name: '第一章　港から砂漠へ' },
    { id: '2', name: '第二章　砂の海' },
    { id: '3', name: '第三章　赤い峡谷' },
    { id: '4', name: '第四章　火山の夜' },
    { id: '5', name: '第五章　白い山脈' },
    { id: '6', name: '最終章　星の井戸' }
  ];

  var EV = [
    /* ===================== 序章 ===================== */
    S({ id: 's4_1', ch: '0', title: '廃車置場の夜明け', track: 'coast', mode: 'time', laps: 1, car: 'safari0', goal: { type: 'lap', factor: 0.6 }, reward: 600,
      scene: [
        { title: '星の砂漠 1983', sub: '序章　ナナホシ整備工場' },
        { bg: 'coast' },
        { narr: '1983 年、夏。静岡県の海ぞいの町。潮風の中に、油と鉄と、少しだけ夢のにおいがした。' },
        { narr: '町はずれの廃車置場。その奥に、半分錆びた、ひどい見た目のラリーカーが眠っていた。' },
        ['minoru', 'で、できた……！ 徹夜で組んだんだ。エンジン、かかるはずなんだけど。', 'right emo:smile'],
        ['rin', 'ほんとにこれが、父さんの車？ ドアは違う色だし、シートは長椅子だし。', 'emo:shock'],
        ['minoru', 'ぼ、僕のせいじゃないよ！ 部品が、足りなかったんだ！ ネジ一本から、探したんだから！', 'emo:shock'],
        ['daigo', 'ははっ。見た目なんざ関係ねえ。……リン、一回、回してみろ。', 'emo:smile'],
        ['rin', '……かかった。……音が、父さんの音だ。', 'emo:smile flash'],
        ['daigo', '行ってこい。ここの海岸線で、慣らしだ。俺の整備した車は、止まらねえ。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'minoru', text: '水温と油圧、ちゃんと見ててね！ 何かあったら、すぐ止まって！' },
        { at: 'damage', who: 'daigo', text: '擦ったか。部品は消耗品だ、気にすんな。' },
        { at: 'final', who: 'rin', text: '……走れてる。この車、ちゃんと、走ってる。' }
      ],
      post: [
        ['minoru', 'や、やった！ 動いた、走った、壊れなかった！', 'emo:smile shake'],
        ['daigo', 'よくやった、ミノル。……リン。明日、海外に出る船の切符が取れた。', 'emo:smile'],
        ['rin', '……ほんとに行くんだね。「グレート・サンド・ラリー」に。', 'emo:cool'],
        ['daigo', '行くさ。お前の父さんが走って、消えたレースだ。……今度は、お前が最後まで走る番だ。', 'emo:cool']
      ] }),

    S({ id: 's4_2', ch: '0', title: '父のカセットテープ', track: 'ridge', mode: 'time', laps: 1, car: 'safari0', goal: { type: 'lap', factor: 0.55 }, reward: 900,
      scene: [
        { bg: 'ridge' },
        { narr: '出発前夜。リンは、父のカーステレオに入ったままだったカセットを、はじめて再生した。' },
        ['go', '……リン。もし、これを聴いてるなら、父さんは、まだ帰れてないんだろうな。', 'right emo:smile'],
        ['go', '砂漠はな、世界で一番静かなところだ。夜になると、空いっぱいに星が出る。一つだけ、動かない星がある。'],
        ['go', '父さんは、その星の下に、地図にない井戸があるって聞いた。……いつか、お前と見に行きたい。'],
        ['rin', '「星の井戸」……。父さん、そこに、いるの？', 'emo:sad'],
        ['daigo', 'テープは、それで終わりだ。……ゴウは、四年前、砂嵐の日に、レースから消えた。遺体も、車も、見つかってねえ。', 'emo:sad'],
        ['rin', 'だったら、私が見つける。星の井戸を。……絶対に。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'daigo', text: '尾根道で、最後のテストだ。車を信じろ。' },
        { at: 'final', who: 'rin', text: '星の井戸。……待ってて、父さん。' }
      ],
      post: [
        ['minoru', 'リ、リンさん。これ、僕からの餞別。ゴウさんの設計ノートの、コピー。', 'emo:smile'],
        ['rin', 'ミノル……こんなの、いつの間に。', 'emo:shock'],
        ['minoru', 'ダイゴさんの倉庫に、あったんだ。ええと、砂漠仕様のサスペンションの図面。役に立つかもって。', 'emo:smile'],
        ['rin', 'ありがとう。……行ってくる。', 'emo:smile']
      ] }),

    /* ===================== 第一章 ===================== */
    S({ id: 's4_3', ch: '1', title: '港の積み込み', track: 'harbor', mode: 'arcade', laps: 3, traffic: 10, car: 'safari0', goal: { type: 'arcade' }, reward: 1500,
      scene: [
        { title: '第一章', sub: '港から砂漠へ' },
        { bg: 'harbor' },
        { narr: '横浜港。出港まで、あと三十分。トラックの故障で、肝心の予備エンジンが港に届いていなかった。' },
        ['daigo', 'まずい。予備エンジンが、倉庫にある。船は、待っちゃくれねえ。', 'right emo:shock'],
        ['rin', '私が取りに行く。港の中を、一周して戻ってくるだけでしょう。', 'emo:cool'],
        ['minoru', 'で、でも、フォークリフトも、コンテナも、いっぱい走ってるよ！', 'emo:shock'],
        ['daigo', 'リン、制限時間に間に合わせろ。三周でチェックポイントを回る。……荷物を落とすなよ。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'daigo', text: 'チェックポイントごとに時間が増える。止まらず、周れ！' },
        { at: 'damage', who: 'minoru', text: 'エンジンが傷ついたらどうするの！ ゆっくり！' },
        { at: 'final', who: 'daigo', text: 'ラスト！ 船はもう動き出す！' }
      ],
      post: [
        ['daigo', '積み込み完了だ！ ぎりぎりセーフ！', 'emo:smile shake'],
        { narr: '汽笛が鳴った。ナナホシの三人を乗せて、船はゆっくりと、日本を離れていく。' },
        ['rin', '……行ってきます、父さん。', 'emo:smile']
      ] }),

    S({ id: 's4_4', ch: '1', title: '砂漠の少女', track: 'desert', mode: 'race', laps: 2, rivals: 5, pace: 0.82, car: 'safari0', goal: { type: 'place', n: 3 }, reward: 2200,
      scene: [
        { bg: 'desert' },
        { narr: '二週間後。砂漠の入り口の町。照りつける太陽、乾いた風、そして、聞き慣れない言葉。' },
        ['yasmin', 'あなた、日本の人？ この車、変な形。……でも、いい足をしてる。', 'right emo:smile'],
        ['rin', 'あなたは？ この辺の人？', 'emo:shock'],
        ['yasmin', 'ヤスミン。わたし、砂漠の案内人。砂の道を、全部知ってる。……お茶、飲む？', 'emo:smile'],
        ['daigo', '嬢ちゃん、砂漠のガイドなら、仕事を頼みたい。この辺の地元レースで、うちの車を試したい。', 'emo:cool'],
        ['yasmin', 'いいよ。その代わり、約束して。レースで勝ったら、わたしの村に、お水を運んでくれる？', 'emo:cool'],
        ['rin', '約束する。……三位以内に入ったら、必ず。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'yasmin', text: '風が吹いたら、砂が流れる方向を見て。ライン、変わるから！' },
        { at: 'overtook', who: 'yasmin', text: 'いいよ！ 砂の上、上手！' },
        { at: 'final', who: 'yasmin', text: 'もう少し！ 水のため、頑張って！' }
      ],
      post: [
        ['yasmin', '三位……すごい！ 約束、守ってくれた！', 'emo:smile shake'],
        ['rin', 'もちろん。……ねえ、ヤスミン。あなた、星の井戸って、聞いたことある？', 'emo:cool'],
        ['yasmin', '……！ どこで、その名前を。', 'emo:shock'],
        ['yasmin', '井戸のことは、おじいちゃんしか知らない。……今夜、うちに来て。話してくれるって。', 'emo:cool']
      ] }),

    /* ===================== 第二章 ===================== */
    S({ id: 's4_5', ch: '2', title: 'サンド・ステージ 1', track: 'desert', mode: 'race', laps: 2, rivals: 7, pace: 0.88, car: 'safari1', unlock: 'safari1', goal: { type: 'place', n: 3 }, reward: 3500,
      scene: [
        { title: '第二章', sub: '砂の海' },
        { bg: 'desert' },
        { narr: '開会式。世界中から集まった、百台のラリーカー。大会の主催者、マダム・ローズが、壇上に立った。' },
        ['rose', '皆さま、ようこそ、グレート・サンド・ラリーへ。ここは、世界で最も過酷な、砂のレース。', 'right emo:cool'],
        ['rose', '完走できるのは、半分以下。……覚悟のない者は、今のうちに帰りなさい。'],
        ['viktor', '……私は、この砂漠に、決着をつけにきた。', 'emo:cool'],
        ['rin', 'あれが、ヴィクトル。四年前、父さんと組んでた、ナビゲーター……。', 'emo:shock'],
        ['daigo', 'ゴウと一緒に走って、一人で戻ってきた男だ。……何か知ってるに違いねえ。', 'emo:cool lines'],
        ['minoru', 'ナナホシ Mk.1、ばっちり仕上がったよ！ 砂漠の足、見せてやろう！', 'emo:smile']
      ],
      radio: [
        { at: 'start', who: 'daigo', text: '砂は、止まったら終わりだ。足を出し続けろ。' },
        { at: 'overtook', who: 'minoru', text: '順位が上がった！ いいぞ、いいぞ！' },
        { at: 'final', who: 'daigo', text: '最終周！ 三位以内なら、次のステージだ！' }
      ],
      post: [
        ['rose', '第一ステージ、三位以内。……日本の、ナナホシ。名前を覚えておきましょう。', 'right emo:smile'],
        ['viktor', 'あの娘、ゴウの顔に、似ている。', 'emo:shock'],
        ['rin', '……！', 'emo:shock']
      ] }),

    S({ id: 's4_6', ch: '2', title: '嵐の前', track: 'desert', mode: 'time', laps: 1, car: 'safari1', weather: 'sand', goal: { type: 'lap', factor: 0.68 }, reward: 3000,
      scene: [
        { bg: 'desert', weather: 'sand' },
        { narr: '夜、ヤスミンの村。祖父ハキムが、焚き火の前で、静かに語り始めた。' },
        ['hakim', '四年前の砂嵐。……わしの家族の車が、砂に埋まった。そこへ、一人の日本人が車を止めた。', 'right emo:cool'],
        ['hakim', '名前は、ゴウ。ゴウは、「ここは自分に任せろ」と言って、同乗のナビを先に行かせた。わしらを、掘り出すために。'],
        ['rin', '……父さん。やっぱり、そうだったんだ。', 'emo:sad'],
        ['hakim', 'ゴウは、わしらを助けた。……そして、その後のことは、星の井戸で、おまえが確かめるといい。'],
        ['hakim', '明日、砂嵐が来る。夜明け前に走らねば、星の道には、たどり着けない。', 'emo:cool lines'],
        ['yasmin', 'わたしが、砂の目を教える。リン、風を読んで！', 'emo:cool']
      ],
      radio: [
        { at: 'start', who: 'yasmin', text: '砂が舞う。ミラーを見ないで、前だけ！' },
        { at: 'damage', who: 'yasmin', text: '砂に足を取られないで！ アクセルを抜かないで！' },
        { at: 'final', who: 'hakim', text: '風が、止んだ。……行け。' }
      ],
      post: [
        ['rin', '……風の音で、道がわかった。砂が、教えてくれた。', 'emo:smile'],
        ['yasmin', 'リン、すごい。やっぱり、ゴウさんの娘だ。', 'emo:smile'],
        ['hakim', 'ゴウも、そう走った。……風と、話すように。', 'emo:smile']
      ] }),

    S({ id: 's4_7', ch: '2', title: '砂嵐の脱落戦', track: 'desert', mode: 'elim', rivals: 6, pace: 0.9, weather: 'sand', car: 'safari1', goal: { type: 'survive' }, reward: 4200,
      scene: [
        { bgm: 'tension' },
        { bg: 'desert', weather: 'sand' },
        { narr: '第二ステージ。突然の砂嵐が、全車を襲った。視界は数メートル。一周ごとに、最下位が足切りになる。' },
        ['rose', '嵐のステージ。……ここで、本物のドライバーが、決まります。', 'right emo:cool'],
        ['viktor', '……リン、といったな。勝ち残れ。そうしたら、教えてやる。四年前のことを。', 'emo:cool'],
        ['rin', '本当ですか。……約束してください。', 'emo:angry lines']
      ],
      radio: [
        { at: 'start', who: 'daigo', text: '視界ゼロだ。前のテールランプだけ追え！' },
        { at: 'overtook', who: 'minoru', text: '一台抜いた！ 順位、上がってる！' },
        { at: 'final', who: 'yasmin', text: '風が弱まる！ あと少しで、抜ける！' }
      ],
      post: [
        ['rin', '……生き残った。ヴィクトルさん、話してください。', 'emo:cool'],
        ['viktor', '約束だったな。……四年前、私は、ゴウの後ろに乗っていた。ナビゲーターとして。', 'emo:sad'],
        ['viktor', 'ゴウは、私を車から降ろした。「お前は先に行け」と。私は、行った。……行って、しまった。', 'emo:sad flash'],
        ['rin', '父さんは、あなたを、レースに戻したんですね。……優しい人だった。', 'emo:sad'],
        ['viktor', '私は、それからずっと、逃げていた。……今度こそ、決着をつけたい。', 'emo:cool']
      ] }),

    /* ===================== 第三章 ===================== */
    S({ id: 's4_8', ch: '3', title: '赤い峡谷', track: 'canyon', mode: 'race', laps: 2, rivals: 7, pace: 0.9, car: 'safari1', goal: { type: 'place', n: 3 }, reward: 4500,
      scene: [
        { title: '第三章', sub: '赤い峡谷' },
        { bg: 'canyon' },
        { narr: '砂漠を抜けると、赤茶けた岩の迷路が広がっていた。落石、断崖、狭い道。' },
        ['rose', '第三ステージは、赤い峡谷。……一歩間違えば、谷底です。', 'right emo:cool'],
        ['rin', '父さんが、見た景色。……きれいな赤。', 'emo:smile'],
        ['minoru', 'ブレーキの温度、危ないよ！ 下りで焼き付かないように！', 'emo:shock'],
        ['daigo', '下りでブレーキを使うな。ギアで落とせ。……ゴウの口癖だ。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'minoru', text: '谷の下り坂、ブレーキ温度に気をつけて！' },
        { at: 'overtook', who: 'daigo', text: 'いいぞ。順位を保て。' },
        { at: 'final', who: 'minoru', text: 'ラスト！ 谷の出口まで！' }
      ],
      post: [
        ['rose', '三位以内……ナナホシは、勢いがありますね。', 'right emo:smile'],
        ['rin', '次は、誰ですか。', 'emo:cool'],
        ['rose', '……あなたのお父さんの、最後の相棒。ヴィクトルが、あなたに勝負を、挑むそうです。', 'emo:cool']
      ] }),

    S({ id: 's4_9', ch: '3', title: 'ヴィクトルの挑戦', boss: 'viktor', track: 'canyon', mode: 'duel', laps: 2, pace: 0.96, car: 'safari1', goal: { type: 'win' }, reward: 5500,
      scene: [
        { bgm: 'tension' },
        { bg: 'canyon' },
        ['viktor', '一本、走ろう。……私が勝てば、ゴウは本当の意味で、救われないままだ。', 'right emo:cool'],
        ['rin', 'どういう意味ですか。', 'emo:shock'],
        ['viktor', '私は、あの日から、一度もゴウに勝てたことがない。……娘のきみに勝って、それを終わりにしたい。', 'emo:cool'],
        ['rin', '私は、勝つために走ってるんじゃない。……父さんの道を、最後まで、確かめに来たんです。', 'emo:angry'],
        ['viktor', 'ならば、その走りで、私を止めてみせろ。', 'emo:angry lines'],
        { vs: ['rin', 'viktor'] }
      ],
      radio: [
        { at: 'start', who: 'viktor', text: '谷を抜けるまでが勝負だ。……行くぞ。' },
        { at: 'close', who: 'viktor', text: 'ゴウの走りだ。……その後ろ姿。' },
        { at: 'overtook', who: 'rin', text: '父さんの道は、私が走る！' }
      ],
      post: [
        ['viktor', '……負けた。ゴウと、同じ走りだ。', 'emo:smile'],
        ['viktor', '地図を一枚、渡しておく。ゴウが私に託した、「星の地図」の半分だ。', 'emo:cool'],
        ['rin', '半分……？', 'emo:shock'],
        ['viktor', '残りの半分は、井戸にあるはずだ。……きみが、そこに辿り着いたとき、全部つながる。', 'emo:cool']
      ] }),

    S({ id: 's4_10', ch: '3', title: '暴走トラック', boss: 'runaway', track: 'canyon', mode: 'chase', pace: 0.9, traffic: 6, car: 'safari1', goal: { type: 'catch' }, reward: 4800,
      scene: [
        { bg: 'canyon' },
        { narr: '峡谷の下り。参加車両の給水トラックが、ブレーキの故障で、暴走を始めた。' },
        ['radio83', '本部より全車。給水トラックが制御を失い、谷の下へ暴走中！ 運転手は無事だが、ブレーキが効かない！', 'right emo:shock'],
        ['rin', '追いかけて、止める。……ミノル、ブレーキ、全開で行く！', 'emo:angry'],
        ['minoru', 'ええっ！？ で、できるけど……無理しちゃだめだよ！', 'emo:shock'],
        ['daigo', 'リン、体当たりは、横から。優しく、押して止めろ。ゴウの技を、思い出せ！', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'radio83', text: 'トラックは、谷の底に向かっている！ 急いで！' },
        { at: 'close', who: 'daigo', text: 'あと少し。横から、そっと押せ！' },
        { at: 'final', who: 'radio83', text: '谷の出口が近い！ そこまでに止めなければ！' }
      ],
      post: [
        ['rin', '止まった……！ 運転手さん、大丈夫ですか！', 'emo:shock'],
        ['yasmin', 'すごい……リン、本当にすごい！', 'emo:smile shake'],
        ['rose', '……素晴らしい判断力。あなたのお父さんも、同じことをしました。', 'right emo:smile'],
        ['rose', '四年前。このレースで、あなたのお父さんは、勝利を捨てて人を助けた。……私は、それを、忘れていません。', 'emo:cool']
      ] }),

    /* ===================== 第四章 ===================== */
    S({ id: 's4_11', ch: '4', title: '溶岩台地の夜行', track: 'volcano', mode: 'race', laps: 2, rivals: 7, pace: 0.92, car: 'safari1', goal: { type: 'place', n: 3 }, reward: 5000,
      scene: [
        { title: '第四章', sub: '火山の夜' },
        { bg: 'volcano' },
        { narr: '夜。赤く光る溶岩台地。足元の地面は熱を持ち、タイヤのゴムが焼けるにおいがした。' },
        ['minoru', 'タイヤの温度が上がりやすい！ 地面が熱いんだ。……あまり長く、アクセルを踏み続けないで！', 'right emo:shock'],
        ['daigo', '火山は、昔ゴウと一緒に走った。……あいつ、笑ってた。「この道は、生きてる」ってな。', 'emo:smile'],
        ['rin', '生きてる……か。たしかに、地面が、息をしてるみたい。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'minoru', text: 'タイヤ、焼けやすいから、コーナーで休ませて！' },
        { at: 'overtook', who: 'daigo', text: 'いいぞ。夜の道は、焦るな。' },
        { at: 'final', who: 'minoru', text: 'ラストラップ！ タイヤ、まだもつよ！' }
      ],
      post: [
        ['rin', '三位以内……！ 溶岩の熱気、すごかった。', 'emo:smile'],
        ['daigo', 'ああ。……リン、少し、話がある。', 'emo:cool']
      ] }),

    S({ id: 's4_12', ch: '4', title: 'ダイゴの告白', track: 'volcano', mode: 'time', laps: 1, car: 'safari1', goal: { type: 'lap', factor: 0.62 }, reward: 4000,
      scene: [
        { bg: 'volcano' },
        { narr: '野営地。溶岩の赤い光が、ダイゴの横顔を照らしていた。' },
        ['daigo', '四年前、俺も、あの日あの場所にいた。……サービスカーで、ゴウの後ろを走ってた。', 'right emo:sad'],
        ['daigo', '嵐がひどくて、ゴウの車を見失った。……見つけたとき、あいつは砂漠の真ん中で、遊牧民の車を、ジャッキで持ち上げてた。'],
        ['daigo', '「ダイゴ、お前は先に行け」。……あいつ、そう言って、笑ったんだ。俺は、その場を離れた。', 'emo:sad'],
        ['rin', 'ダイゴさんも……。みんな、父さんに「先に行け」って、言われたんだね。', 'emo:sad'],
        ['daigo', '情けねえ。ずっと、後ろめたくて、お前に言えなかった。……すまん。', 'emo:sad'],
        ['rin', '謝らないで。ダイゴさんがいなかったら、私は、ここに来られなかった。……一緒に、行こう。', 'emo:smile']
      ],
      radio: [
        { at: 'start', who: 'daigo', text: '……俺の後悔、お前の走りで、消してくれ。' },
        { at: 'final', who: 'rin', text: 'ダイゴさん、ありがとう。……見てて。' }
      ],
      post: [
        ['daigo', '……いい走りだった。ゴウを見てる気がしたよ。', 'emo:smile'],
        ['minoru', 'ぼ、僕も、ダイゴさんに言いたいことがあります。ありがとうございます、ここまで連れてきてくれて。', 'emo:smile'],
        ['daigo', 'バカ野郎。泣かせるんじゃねえ。', 'emo:smile']
      ] }),

    /* ===================== 第五章 ===================== */
    S({ id: 's4_13', ch: '5', title: 'ハキムの峠', boss: 'hakim', track: 'tenryu', mode: 'touge', pace: 0.85, car: 'safari1', goal: { type: 'win' }, reward: 5200,
      scene: [
        { title: '第五章', sub: '白い山脈' },
        { bg: 'forest' },
        { narr: '砂漠の北。雪をかぶった山脈の峠。そこに、見覚えのある古いピックアップが止まっていた。' },
        ['hakim', 'リンよ。……ここから先は、星の道へ通じる最後の山だ。', 'right emo:cool'],
        ['hakim', 'わしは、ゴウから、ひとつ頼まれていた。「娘が来たら、峠で、車の走りを試してくれ」とな。'],
        ['rin', '……父さんが、そんなことを。', 'emo:shock'],
        ['hakim', '勝負しよう。わしの年で、ゴウの娘と走れるとは、光栄だ。', 'emo:smile lines'],
        { vs: ['rin', 'hakim'] }
      ],
      radio: [
        { at: 'start', who: 'hakim', text: '山の風を読め。わしの方が、この山を知っとる。' },
        { at: 'close', who: 'hakim', text: 'ほう、やりおる。' },
        { at: 'overtook', who: 'rin', text: 'ハキムさん、ありがとう！' }
      ],
      post: [
        ['hakim', '……よい走りだ。ゴウの娘だ。', 'emo:smile'],
        ['hakim', 'これを持っていけ。ゴウが残した、星の地図の、もう半分だ。', 'emo:smile'],
        ['rin', '……ありがとうございます、ハキムさん。', 'emo:smile']
      ] }),

    S({ id: 's4_14', ch: '5', title: '白い嵐', track: 'snow', mode: 'time', laps: 1, car: 'safari1', weather: 'snow', goal: { type: 'lap', factor: 0.63 }, reward: 5000,
      scene: [
        { bg: 'snow', weather: 'snow' },
        { narr: '雪の山脈。猛吹雪が、視界を白く塗りつぶしていた。' },
        ['yasmin', '雪って、初めて見た。……きれい。でも、冷たいね。', 'right emo:smile'],
        ['rin', 'ヤスミン、ここは危ない。ミノル、タイヤは？', 'emo:cool'],
        ['minoru', 'スタッドレスにしたよ！ でも、凍結路は、本当に滑るから、気をつけて！', 'emo:shock'],
        ['daigo', 'リン。雪は、砂と同じだ。止まらず、静かに、滑らせろ。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'yasmin', text: '白い風、こわい……でも、リンなら、大丈夫！' },
        { at: 'damage', who: 'minoru', text: 'ボディ、ぶつけてない！？ 大丈夫！？' },
        { at: 'final', who: 'daigo', text: '最後の一息！ 星の道は、すぐそこだ！' }
      ],
      post: [
        ['rin', '……抜けた。雪の山を、越えた。', 'emo:smile'],
        { narr: '吹雪の向こうに、一本のまっすぐな道。そして、満天の星。' },
        ['yasmin', '……見て。あの星。動いてない。', 'emo:shock'],
        ['rin', '北極星……。星の井戸は、あの星の下に。', 'emo:shock lines']
      ] }),

    /* ===================== 最終章 ===================== */
    S({ id: 's4_15', ch: '6', title: '最終ステージ', boss: 'viktor', track: 'grand', mode: 'race', laps: 1, rivals: 5, pace: 1.0, car: 'safari2', unlock: 'safari2', goal: { type: 'win' }, reward: 12000,
      scene: [
        { title: '最終章', sub: '星の井戸' },
        { bgm: 'tension' },
        { bg: 'grand' },
        { narr: '最終ステージ。砂漠・峡谷・火山・雪山を貫く、グレート・サンド・ラリーの総決算。' },
        ['minoru', 'で、できたよ……！ ナナホシ Mk.2。ゴウさんの図面通りに、作り直した。', 'right emo:smile'],
        ['rin', 'これが、父さんの設計……。全部のパーツが、一つになってる。', 'emo:smile'],
        ['viktor', 'リン。……最後に、本気で走ろう。ゴウの遺した車と、私とで。', 'emo:cool'],
        ['rose', '最終ステージ、スタートを許可します。……全員、無事に、ゴールへ。', 'emo:smile'],
        ['rin', '行ってきます。みんな……ありがとう。', 'emo:cool lines'],
        { vs: ['rin', 'viktor'] }
      ],
      radio: [
        { at: 'start', who: 'daigo', text: '全部の足を、使え。砂も、岩も、雪も、お前の味方だ。' },
        { at: 'close', who: 'viktor', text: '……これが、ゴウの娘の走りか。' },
        { at: 'overtook', who: 'yasmin', text: '行って、リン！ 星の道が見えてる！' },
        { at: 'final', who: 'minoru', text: '最後の直線！ 車を信じて！' }
      ],
      post: [
        ['rose', '優勝は……ナナホシ、神谷リン。日本の、小さな工場の車が、グレート・サンド・ラリーを制しました。', 'right emo:smile flash'],
        ['viktor', '見事だ、リン。……ゴウは、きみの背中を、押している。', 'emo:smile'],
        ['rin', 'ヴィクトルさん……ありがとう。でも、まだ終わってません。', 'emo:cool'],
        ['rin', 'ゴールは、ここじゃない。……星の井戸です。', 'emo:cool lines']
      ] }),

    S({ id: 's4_16', ch: '6', title: '星の井戸', track: 'desert', mode: 'time', laps: 1, car: 'safari2', goal: { type: 'lap', factor: 0.72 }, reward: 8000, final: true,
      scene: [
        { bg: 'desert' },
        { narr: '星の地図、二枚。ハキムの半分と、ヴィクトルの半分。重ねると、一本の線が、砂漠の奥へ延びていた。' },
        ['yasmin', 'ここから先は、わたしでも行ったことがない。……リン、一緒に行こう。', 'right emo:smile'],
        ['viktor', '私は、ここまでだ。……ゴウに、よろしく伝えてくれ。', 'emo:smile'],
        ['rose', '大会の記録は、私が守ります。……行ってらっしゃい、星の井戸へ。', 'emo:smile'],
        ['daigo', 'リン。……行け。お前の親父に、会ってこい。', 'emo:smile lines']
      ],
      radio: [
        { at: 'start', who: 'yasmin', text: '星が、道を教えてくれる！ まっすぐ！' },
        { at: 'final', who: 'rin', text: '見えた……あの光！' }
      ],
      post: [
        { narr: '砂丘の向こうに、一基の風車。風に回る羽根が、星の光を、ゆっくりと切り裂いていた。' },
        { narr: '井戸のそばに、小さな墓標と、古い手紙。' },
        ['go', '（手紙）リンへ。もし、お前が、ここまで来たのなら。……父さんは、お前の走りを、見たかった。', 'emo:smile flash'],
        ['go', '（手紙）井戸は、約束の場所だ。砂漠の人たちは、ここの水で、命をつないでいる。父さんの仕事は、レースじゃなくて、これだった。'],
        ['go', '（手紙）レースは楽しかった。……でも、最後に走ったのは、人のためだった。お前も、いつか、自分の「走る理由」を見つけろ。', 'emo:smile'],
        ['rin', '……父さん。……見つけたよ。……私の、走る理由。', 'emo:smile'],
        ['yasmin', 'この風車、まだ回ってる。ゴウさん、ずっと、ここにいたんだね。', 'emo:smile'],
        ['rin', 'うん。……帰ろう、みんなのところへ。そして、また、走ろう。', 'emo:smile lines'],
        { narr: '——星の砂漠 1983　完。' }
      ] })
  ];

  var SIDE = [
    S({ id: 's4_sq1', after: 's4_4', title: 'ヤスミンのお茶', track: 'desert', mode: 'time', laps: 1, car: 'safari0', goal: { type: 'lap', factor: 0.6 }, reward: 1800, char: 'yasmin',
      scene: [
        { bg: 'desert' },
        ['yasmin', '砂漠のお茶はね、三杯飲むの。一杯目は人生みたいに苦くて、二杯目は愛みたいに甘くて、三杯目は、死みたいに優しいの。', 'right emo:smile'],
        ['rin', '……素敵な言葉。', 'emo:smile'],
        ['yasmin', 'お茶が冷めないうちに、村まで運んでほしいの。揺らさず、でも、急いで。', 'emo:smile lines']
      ],
      radio: [{ at: 'final', who: 'yasmin', text: 'まだ温かい！ すごい、リン！' }],
      post: [['yasmin', 'ありがとう。……三杯目まで、一緒に、飲もうね。', 'emo:smile']] }),
    S({ id: 's4_sq2', after: 's4_6', title: 'ミノルの設計', track: 'canyon', mode: 'time', laps: 1, car: 'safari1', goal: { type: 'lap', factor: 0.65 }, reward: 2200, char: 'minoru',
      scene: [
        { bg: 'canyon' },
        ['minoru', 'ぼ、僕ね、本当は、車を作る人になりたかったんだ。でも、自信がなくて……。', 'right emo:sad'],
        ['minoru', 'ゴウさんの図面を、見て思った。「この人は、乗る人のことを、ずっと考えてる」って。'],
        ['minoru', 'この新しいサスペンション、峡谷で試して。僕の、初めての、自分の設計だから。', 'emo:smile']
      ],
      radio: [{ at: 'final', who: 'minoru', text: '足が、動いてる……！ 設計通りだ！' }],
      post: [['minoru', 'やった……！ 僕の設計が、本当に走った！', 'emo:smile shake'], ['rin', 'ミノル。あなたは、立派な設計者だよ。', 'emo:smile']] }),
    S({ id: 's4_sq3', after: 's4_10', title: 'ダイゴの昔', boss: 'gosts', track: 'tenryu', mode: 'touge', pace: 0.92, car: 'safari1', goal: { type: 'win' }, reward: 3500, char: 'daigo',
      scene: [
        { bg: 'forest' },
        { narr: 'ガレージの奥から、古い 8mm フィルムが見つかった。ゴウとダイゴが、若いころに走った峠の映像。' },
        ['daigo', 'ゴースト、ってやつだ。ゴウの走りを、車に覚えさせた。……リン、一緒に走ってやってくれ。', 'right emo:smile'],
        ['rin', '……父さん、一緒に走ろう。', 'emo:smile lines'],
        { vs: ['rin', 'go'] }
      ],
      radio: [{ at: 'close', who: 'rin', text: '父さん……ここまで来たよ。' }],
      post: [{ narr: 'フィルムの最後に、若いゴウの笑顔が映っていた。' }, ['go', '……リン。お前の方が、きっと速いよ。', 'emo:smile flash']] }),
    S({ id: 's4_sq4', after: 's4_16', title: 'ヴィクトルの一本', boss: 'viktor', track: 'canyon', mode: 'duel', laps: 2, pace: 0.98, car: 'safari2', goal: { type: 'win' }, reward: 5000, char: 'viktor',
      scene: [
        { bg: 'canyon' },
        ['viktor', '最後に、もう一本。……今度は、ゴウの代わりではなく、きみ自身と、走りたい。', 'right emo:smile'],
        ['rin', '喜んで。……ヴィクトルさん、今度は、笑って走りましょう。', 'emo:smile lines'],
        { vs: ['rin', 'viktor'] }
      ],
      radio: [{ at: 'close', who: 'viktor', text: '……楽しいな。レースは、こんなに楽しかったのか。' }],
      post: [['viktor', 'ありがとう、リン。やっと、砂漠から、帰れそうだ。', 'emo:smile']] })
  ];

  R.STORIES = R.STORIES || [];
  R.STORIES.push({ id: 's4', name: { ja: 'ストーリー4　星の砂漠 1983', en: 'Story 4: Desert of Stars 1983' }, hero: 'rin', era: '1983 年（昭和 58 年）', place: '砂漠・峡谷・火山・雪の山脈',
                   desc: { ja: '行方不明の伝説のラリードライバーの娘リンが、継ぎはぎの車で砂漠横断ラリーに挑む。父が消えた日の真実と、地図にない「星の井戸」を探して。', en: "A rally legend's daughter enters the desert race her father vanished from, hunting for the Star Well." },
                   chapters: CH, events: EV, side: SIDE, filter: 'sepia(0.2) saturate(1.2) hue-rotate(-10deg) contrast(1.04)' });
})();
