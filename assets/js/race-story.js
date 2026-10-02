/*
 * race-story.js — TENRYU RACING 本編ストーリー「天竜の白い亡霊」。
 *
 * 台本の書き方
 *   ['mina', 'せりふ', 'fx']        … 話す人・せりふ・演出（空白区切り）
 *       fx: shake（揺れ）/ flash（白く光る）/ lines（集中線）/ zoom / right（右から登場）
 *           emo:angry|smile|shock|sad|cool（表情）/ sfx:ドンッ（擬音）
 *   { title: '第一章', sub: '浜松の夜' } … 章タイトルのカード
 *   { narr: '十年前——' }                … ナレーション
 *   { bg: 'akimine', weather: 'rain' }   … 背景（コースの景色）を変える
 *   { vs: ['you', 'taka'] }              … VS 画面
 *   radio: レース中の無線。at は start / lap / final / overtook / overtaken / close / ahead / damage / win / lose
 */
(function () {
  'use strict';

  var TB = window.TB;
  var R = TB.Race;

  /* ---------- 新しい登場人物 ---------- */
  var C = R.CHARS;
  C.you = { name: 'ユウ', color: '#5ccfa0',
            face: { skin: '#f1cfae', hair: '#2a2a2a', style: 'swept', eyes: '#2b1d14', acc: 'none', shirt: '#2e4a3a', bg: '#16261e' } };
  C.taka = { name: 'タカ', color: '#ff7043',
             face: { skin: '#e8c09c', hair: '#e0a030', style: 'spiky', eyes: '#222', acc: 'none', shirt: '#5a2a18', bg: '#2a1810' } };
  C.yoiyami = { name: '宵闇（ヨイヤミ）', color: '#7986cb',
                face: { skin: '#d8b8a0', hair: '#1a1a2e', style: 'long', eyes: '#9fa8ff', acc: 'shades', shirt: '#1a1a2e', bg: '#0d0d1a' } };
  C.tekkamen = { name: '鉄仮面', color: '#90a4ae',
                 face: { skin: '#9e9e9e', hair: '#37474f', style: 'hood', eyes: '#ffeb3b', acc: 'mask', shirt: '#263238', bg: '#101418' } };
  C.soichi = { name: 'ソウイチ（父）', color: '#fafafa',
               face: { skin: '#e8c8aa', hair: '#dcdcdc', style: 'swept', eyes: '#3a2a1a', acc: 'scar', shirt: '#eceff1', bg: '#1a1a24' } };
  C.null = { name: 'NULL', color: '#ff1744',
             face: { skin: '#111111', hair: '#111111', style: 'bald', eyes: '#ff1744', acc: 'visor', shirt: '#000000', bg: '#050505' } };
  C.hayate = { name: 'HAYATE', color: '#ffd200',
               face: { skin: '#e9c3a0', hair: '#ffd200', style: 'spiky', eyes: '#222', acc: 'none', shirt: '#3a3000', bg: '#2a2400' } };
  C.kaze = { name: 'KAZE', color: '#f5f5f5',
             face: { skin: '#efd3bb', hair: '#d8d8e0', style: 'swept', eyes: '#223', acc: 'glasses', shirt: '#f0f0f0', bg: '#1a1d24' } };
  C.narr = { name: '', color: '#ccc', face: C.mina.face };

  /* ---------- 新しいボス ---------- */
  var B = R.BOSSES;
  B.taka = { name: 'TAKA', color: '#ff7043', body: 's13', ai: 'aggressive', skill: 0.8, boss: true, ability: 'ram' };
  B.gen2 = { name: 'GEN', color: '#f2f2f2', body: 'ae86', ai: 'technician', skill: 1, boss: true, ability: 'block' };
  B.yoiyami = { name: 'YOIYAMI', color: '#303f9f', body: 'fc', ai: 'technician', skill: 1, boss: true, ability: 'block' };
  B.tekkamen = { name: 'TEKKAMEN', color: '#546e7a', body: 'r32', ai: 'aggressive', skill: 1, boss: true, ability: 'ram' };
  B.hayate2 = { name: 'HAYATE', color: '#ffd200', body: 'fd', ai: 'speedster', skill: 1, boss: true, ability: 'burst' };
  B.nullcar = { name: 'NULL', color: '#101010', body: 'proto', ai: 'technician', skill: 1.1, boss: true, ability: 'all' };

  /* ---------- 物語専用のコース ---------- */
  R.TRACKS.tenryu = {
    name: { ja: '天竜・夜明けの山道', en: 'Tenryu Dawn Pass' }, diff: 3, laps: 1, reps: 2, touge: true, rails: true, weather: 'clear',
    pal: { sky: ['#2a3a6a', '#d88a6a', '#ffd9b0'], sun: { x: 0.8, y: 0.44, r: 20, c: '#ffcf8a' }, far: '#45506e', hill: '#2e4a3a', fog: '#e8c0a0',
           grass: ['#35592f', '#31532b'], road: ['#4d4f55', '#494b51'], rumble: ['#a8a9ad', '#9d9ea2'], lane: '#e6e6e6', water: '#3a6f9a' },
    water: 'right', deco: ['cedar', 'cedar', 'house', 'cedar', 'tea', 'rock'],
    desc: { ja: '天竜川に沿って下る朝焼けの山道。主人公の原点。', en: 'The dawn road down along the Tenryu river.' },
    build: function (b) {
      b.straight(20); b.curve(30, 4, -15); b.curve(25, -5, -10); b.road(10, 16, 10, 7, -8); b.road(10, 10, 10, 0, -4);
      b.road(10, 16, 10, -7, -8); b.sCurves(4); b.curve(35, 3, -10); b.straight(40); b.curve(25, -6, -8); b.straight(60);
    }
  };
  R.TRACKS.grand = {
    name: { ja: '東海道グランドルート（嵐の夜）', en: 'Tokaido Grand Route (Storm)' }, diff: 5, laps: 1, p2p: true, weather: 'rain', night: true, skyline: true,
    pal: { sky: ['#05070f', '#0d1426', '#26324f'], far: '#101828', hill: '#0b1220', fog: '#1d2638', wall: '#3a3f4f',
           grass: ['#1a1f28', '#171b24'], road: ['#2a2c33', '#272930'], rumble: ['#cccccc', '#555'], lane: '#e8e8e8' },
    deco: ['lamp', 'soundwall', 'greensign', 'lamp', 'billboard'], traffic: 10,
    desc: { ja: '浜松から名古屋まで、嵐の東名を一気に駆け抜ける最終決戦の舞台。', en: 'Hamamatsu to Nagoya through a storm — the final stage.' },
    build: function (b) {
      b.straight(80); b.curve(60, 2, 10); b.straight(100);
      b.tunnel(function () { b.curve(70, -2, 0); b.straight(60); });
      b.curve(80, 3, -10); b.straight(140); b.curve(60, -3, 20);
      b.tunnel(function () { b.straight(90); b.curve(50, 2, 0); });
      b.straight(120); b.curve(70, -2, -20); b.sCurves(3); b.straight(150); b.curve(40, 5, 0); b.straight(80);
    }
  };
  R.MODES.sp = { name: { ja: 'SP バトル', en: 'SP Battle' },
                 desc: { ja: '夜の高速で 1 対 1。後ろにいる方の SP（気力）が減り、0 になったら負け。', en: 'Highway 1v1. The car behind drains its spirit gauge; zero means defeat.' } };

  /* ---------- 章 ---------- */
  R.CHAPTERS = [
    { id: 'p', name: '序章　夜明けの配達' },
    { id: '1', name: '第一章　浜松の夜' },
    { id: '2', name: '第二章　峠の主と白い亡霊' },
    { id: '3', name: '第三章　サイレンの夜' },
    { id: '4', name: '第四章　東名の四つの影' },
    { id: '5', name: '第五章　白と赤の試練' },
    { id: '6', name: '第六章　公道の祭典' },
    { id: '7', name: '第七章　ZERO' },
    { id: 'f', name: '最終章　NULL' },
    { id: 'x', name: '番外編　峠の走り屋たち' }
  ];

  function S(o) { return o; }

  R.STORY = [
    /* ===================== 序章 ===================== */
    S({ id: 'p1', ch: 'p', title: '夜明けの配達', track: 'tenryu', mode: 'time', laps: 1, car: 'keitra', goal: { type: 'lap', factor: 0.62 }, reward: 500,
      scene: [
        { title: '序章', sub: '夜明けの配達' },
        { bg: 'tenryu' },
        { narr: '静岡県浜松市、天竜区。' },
        { narr: '山と川しかないこの町で、俺は毎朝、夜明け前に新聞とうなぎ弁当を配っている。' },
        ['you', 'よし、今日も四時半。いつもの軽トラ、いつもの山道。'],
        ['mina', 'ユウー！ また荷台のロープ、ゆるんでたよ！', 'right'],
        ['you', 'ミナ……朝から元気だな。'],
        ['mina', 'あんたが荷物ひとつ落とさずに山を下りられるの、ほんと不思議。', 'emo:smile'],
        ['mina', 'あの山道、地元のおじさんたちでも「朝は怖い」って言うのに。'],
        ['you', '別に。荷台の弁当が偏らないように、揺らさずに曲がってるだけだ。'],
        { narr: 'その「揺らさずに曲がる」が、どれほど異常なことなのか。俺はまだ知らなかった。' },
        ['mina', '今日は配達時間がギリギリだよ。基準タイムを切れなきゃ、お弁当が冷めちゃう！'],
        ['you', 'わかってる。……行くぞ。', 'lines']
      ],
      radio: [
        { at: 'start', who: 'mina', text: '荷台のお弁当、揺らさないでよ！' },
        { at: 'final', who: 'mina', text: 'あと少し！ 橋を渡ったらすぐだよ！' },
        { at: 'damage', who: 'mina', text: 'ちょっと！ 今ガードレール擦ったでしょ！' }
      ],
      post: [
        ['mina', '……え、うそ。いつもより二分も早い。', 'emo:shock'],
        ['you', 'ちょっと急いだだけだ。'],
        { narr: 'その朝、山道の脇で、一台の車が俺たちを見ていたことに、誰も気づかなかった。' }
      ] }),

    S({ id: 'p2', ch: 'p', title: '白いハチロク', boss: 'taka', unlock: 'ae86', track: 'akimine', mode: 'touge', car: 'ae86', pace: 0.84, goal: { type: 'win' }, reward: 1200,
      scene: [
        { bg: 'city', weather: 'clear' },
        { narr: 'その夜。ミナの家の整備工場「ガレージ遠州」。' },
        ['mina', 'ユウ、ちょっと来て！ 奥の倉庫、片付けてたら……', 'emo:shock'],
        ['you', 'なんだよ、ネズミでも出たか。'],
        ['mina', '違う！ これ……ブルーシートの下に、車が。'],
        { narr: 'シートの下から現れたのは、白と黒のツートンの、古いハチロクだった。' },
        ['you', '……この車。', 'zoom'],
        ['mina', 'おじいちゃんが言ってた。十年前、あんたのお父さんが最後に預けていった車だって。'],
        ['you', '親父の……。'],
        { narr: '十年前。親父は天竜の山で事故を起こし、そのまま姿を消した。' },
        { narr: '走り屋たちは今でも噂している。夜明けの天竜を走る「白い亡霊」の話を。' },
        ['taka', 'おいおい、こんなところに骨董品が眠ってたとはな！', 'right sfx:ブォォン'],
        ['mina', 'タカ……！ 秋峰山で幅をきかせてる走り屋だよ。', 'emo:angry'],
        ['taka', '毎朝、軽トラで山を下りてくる「配達屋」ってのはお前か。見てたぜ、今朝。', 'emo:cool'],
        ['taka', '軽トラであのラインはありえねえ。だが、所詮は配達屋だ。'],
        ['taka', '今夜、秋峰山に来い。そのハチロクで俺の S13 についてこられたら、認めてやるよ。', 'emo:angry shake'],
        ['you', '……ミナ。この車、走れるか。'],
        ['mina', 'エンジンはおじいちゃんが毎月回してた。走れる。……走れるけど！', 'emo:shock'],
        ['you', 'なら、行く。', 'lines'],
        { vs: ['you', 'taka'] }
      ],
      radio: [
        { at: 'start', who: 'mina', text: '峠バトルは後追いスタート！ 150m 離されたら負けだよ！' },
        { at: 'close', who: 'taka', text: 'なんだと、ぴったり後ろに……！？' },
        { at: 'overtook', who: 'taka', text: 'ば、馬鹿な！ インから！？' },
        { at: 'overtaken', who: 'mina', text: '焦らないで！ 下りのヘアピンで詰められる！' },
        { at: 'damage', who: 'mina', text: 'ガードレールに当てないで！ 大事な車なんだから！' }
      ],
      post: [
        ['taka', '……ハチロクで、あの突っ込み……。お前、何者だ。', 'emo:shock'],
        ['you', 'ただの配達屋だ。'],
        ['taka', 'ちっ……覚えてろ。浜松の「TUI リーグ」に出てこい。そこで決着をつける。', 'emo:angry'],
        ['mina', 'TUI リーグ……。配信で全国に流れる、公道レースの大会だよ。'],
        ['you', '……親父も、出てたのか。'],
        ['mina', 'うん。伝説のチャンピオンだった。……それが、十年前に。', 'emo:sad']
      ] }),

    /* ===================== 第一章 ===================== */
    S({ id: '1a', ch: '1', title: '予選ノックアウト', track: 'hamamatsu', mode: 'time', laps: 2, goal: { type: 'lap', factor: 0.7 }, reward: 1000,
      scene: [
        { title: '第一章', sub: '浜松の夜' },
        { bg: 'hamamatsu' },
        ['bit', 'レディース・アンド・ジェントルメン！ 今夜も始まるぜ、TUI リーグ浜松ラウンド！', 'shake sfx:ワアアア'],
        ['bit', '実況はおなじみ DJ ビット！ 配信の同接はすでに十万人突破だァ！'],
        ['bit', 'まずは予選！ 1 周のタイムアタックで、基準タイムを切った者だけが本戦に進める！'],
        ['mina', '市街地は交差点のコーナーが直角に近いの。ブレーキを我慢しすぎないで。'],
        ['you', '見た目より道が狭いな。'],
        ['mina', 'それとね。予選の配信コメント、もう騒ぎになってる。「白いハチロクが出てる」って。', 'emo:shock'],
        ['you', '……親父の車を、覚えてるやつがいるのか。'],
        ['mina', '十年たっても、みんな忘れてないんだよ。']
      ],
      radio: [
        { at: 'start', who: 'bit', text: 'エントリーナンバー 86！ 謎の白いハチロクがコースイン！' },
        { at: 'lap', who: 'mina', text: 'いいペース！ 次の周で基準を切れる！' }
      ],
      post: [
        ['bit', '出たァ！ ハチロクが予選通過！ コメント欄が「亡霊だ」「亡霊の再来だ」で埋め尽くされてる！', 'shake'],
        ['ray', '……ふん。古い車に、古い噂か。', 'right emo:cool']
      ] }),

    S({ id: '1b', ch: '1', title: '湖畔の本戦', track: 'hamanako', mode: 'race', laps: 2, rivals: 7, pace: 0.8, goal: { type: 'place', n: 3 }, reward: 1500,
      scene: [
        { bg: 'hamanako' },
        ['bit', '本戦第一レースは浜名湖ベイ！ 湖を左に見ながらの高速コースだ！'],
        ['ray', 'お前が噂の「亡霊の息子」か。', 'right emo:cool'],
        ['you', '……誰だ。'],
        ['ray', 'レイ。このリーグの現ランキング 2 位だ。', 'emo:cool'],
        ['ray', '親の七光りで走れるほど、ここは甘くない。せいぜいタイヤの跡でも拾ってろ。'],
        ['mina', 'なによあいつ！ ユウ、表彰台に乗って見返してやろう！', 'emo:angry'],
        ['you', 'ああ。']
      ],
      radio: [
        { at: 'start', who: 'mina', text: 'スタートで無理しないで！ 集団の後ろでスリップを使って！' },
        { at: 'overtook', who: 'bit', text: 'ハチロクが一台抜いたァ！' },
        { at: 'final', who: 'mina', text: 'ファイナルラップ！ 3 位以内、いける！' }
      ],
      post: [['bit', 'ルーキーが表彰台だァ！ 浜松に新しい風が吹いてるぜ！', 'shake sfx:ワアアア']] }),

    S({ id: '1c', ch: '1', title: '雨のデュエル', boss: 'ray', track: 'coast', mode: 'duel', laps: 3, pace: 0.86, weather: 'rain', goal: { type: 'win' }, reward: 2500,
      scene: [
        { bg: 'coast', weather: 'rain' },
        { narr: '一週間後。海岸線に雨が降っていた。' },
        ['ray', '雨の日を選んだのは俺だ。言い訳はさせない。', 'right emo:cool'],
        ['ray', 'お前の親父は、雨の天竜で死にかけて消えた。'],
        ['ray', '俺は、雨の中で勝つためだけに、この十年を走ってきた。', 'emo:angry lines'],
        ['you', '……親父のことを、知ってるのか。'],
        ['ray', '知ってるさ。俺の兄貴は、あの夜、お前の親父と走っていた。', 'emo:angry shake'],
        ['mina', 'え……？', 'emo:shock'],
        ['ray', '続きは勝ったら話してやる。', 'emo:cool'],
        { vs: ['you', 'ray'] }
      ],
      radio: [
        { at: 'start', who: 'mina', text: '雨は滑るよ！ アクセルは丁寧に！' },
        { at: 'close', who: 'ray', text: 'しつこい……！ 雨の中で、このペースについてくるだと！？' },
        { at: 'overtook', who: 'ray', text: 'くっ……！ そのラインは、あの人と同じ……！' },
        { at: 'overtaken', who: 'ray', text: '雨は俺の舞台だ。どけ！' },
        { at: 'final', who: 'mina', text: '最後の直線、スリップからニトロ！' }
      ],
      post: [
        ['ray', '……負けた、か。', 'emo:sad'],
        ['ray', '十年前の夜。天竜の下りで、兄貴とお前の親父はバトルをしていた。'],
        ['ray', '兄貴はコースアウトして、今も車椅子だ。お前の親父は……そのまま消えた。', 'emo:sad'],
        ['you', '……。'],
        ['ray', '俺は、真実を知りたい。お前もそうだろう。……次は負けない。', 'emo:cool'],
        ['mina', 'ユウ……。', 'emo:sad']
      ] }),

    /* ===================== 第二章 ===================== */
    S({ id: '2a', ch: '2', title: '紅葉の九十九折り', track: 'iroha', mode: 'touge', pace: 0.88, boss: 'hayate2', goal: { type: 'win' }, reward: 2200,
      scene: [
        { title: '第二章', sub: '峠の主と白い亡霊' },
        { bg: 'iroha' },
        ['mina', '次は遠征。「峠を制する者がリーグを制する」って、みんな言うでしょ。'],
        ['gen', '……その車、どこで手に入れた。', 'right'],
        ['you', 'あんたは……？'],
        ['gen', 'ゲン。ただの年寄りだ。昔、少しだけ速かった。', 'emo:cool'],
        ['gen', '今日の相手は黄色い FD の HAYATE。立ち上がりの鋭さなら関東一だ。'],
        ['gen', 'ハチロクの馬力じゃ出口では勝てん。入口で勝て。ブレーキを遅らせるんじゃない、早く曲がり始めろ。'],
        ['you', '……早く曲がり始める。'],
        { vs: ['you', 'hayate'] }
      ],
      radio: [
        { at: 'start', who: 'gen', text: 'ヘアピンの手前で向きを変えろ。ハンドルは早く、アクセルは我慢だ。' },
        { at: 'close', who: 'gen', text: 'そうだ。出口で離されても、次の入口で追いつける。' },
        { at: 'overtook', who: 'mina', text: '抜いた！ 紅葉の中でハチロクが FD を抜いた！' }
      ],
      post: [
        ['gen', '……やはりな。お前の走りは、あいつにそっくりだ。', 'emo:sad'],
        ['you', 'あいつ……？ 親父を知ってるのか！', 'shake emo:shock'],
        ['gen', '峠の主、デーモンに勝て。そうしたら話してやる。']
      ] }),

    S({ id: '2b', ch: '2', title: '砂漠のサバイバル', track: 'desert', mode: 'elim', rivals: 5, pace: 0.88, goal: { type: 'survive' }, reward: 1800,
      scene: [
        { bg: 'desert' },
        ['bit', 'リーグ名物、サバイバル戦！ 各周回の最下位はその場で脱落だァ！'],
        ['mina', 'デーモンに挑戦するには、このサバイバルを生き残るのが条件なんだって。'],
        ['taka', 'また会ったな、配達屋！ 今度こそ先に消えるのはお前だ！', 'right emo:angry']
      ],
      radio: [
        { at: 'start', who: 'mina', text: '周回の終わりにビリだと脱落！ 気を抜かないで！' },
        { at: 'lap', who: 'bit', text: 'また一台、砂漠に消えていったァ！' },
        { at: 'final', who: 'mina', text: 'あと一人！ 最後まで踏んで！' }
      ],
      post: [['taka', 'ちくしょう……また負けかよ……！', 'emo:angry'], ['taka', '……おい配達屋。デーモンは本物だ。死ぬなよ。', 'emo:cool']] }),

    S({ id: '2c', ch: '2', title: 'ボス：峠の主デーモン', boss: 'daemon', track: 'ridge', mode: 'duel', laps: 3, pace: 0.9, goal: { type: 'win' }, reward: 3500,
      scene: [
        { bg: 'ridge' },
        { narr: '夕暮れの山岳路。峠の主が待っていた。' },
        ['daemon', '……亡霊の息子か。', 'right emo:cool'],
        ['daemon', '十年前、わしはあの男に一度も勝てなかった。', 'emo:sad'],
        ['daemon', 'だから、この峠でずっと待っていた。あの男が戻ってくるのを。'],
        ['daemon', '来たのが息子だというなら……息子ごと、ねじ伏せる。', 'emo:angry shake sfx:ゴゴゴゴ'],
        ['mina', 'デーモンは絶対にインを開けないブロックの名人だよ。'],
        ['gen', '壁のような相手ほど、一瞬だけ扉が開く。見逃すな。'],
        { vs: ['you', 'daemon'] }
      ],
      radio: [
        { at: 'start', who: 'gen', text: '焦るな。三周ある。二周はあいつの癖を見ろ。' },
        { at: 'close', who: 'daemon', text: 'この圧力……あの男と同じだ……！' },
        { at: 'overtook', who: 'gen', text: '扉が開いた！ 行け！' },
        { at: 'overtaken', who: 'mina', text: 'ブロックに引っかからないで！ 外から並んで！' },
        { at: 'final', who: 'gen', text: '最後の下り。お前の親父なら、ここで決める。' }
      ],
      post: [
        ['daemon', '……見事。主の名は、お前のものだ。', 'emo:smile'],
        ['gen', '約束だ。話そう。', 'emo:sad'],
        ['gen', '十年前の夜、わしはお前の親父——ソウイチのチームメイトだった。'],
        ['gen', 'あの夜のバトルの後、ソウイチは自分の足で山を下りた。事故を起こしたのは相手の方だった。'],
        ['you', 'じゃあ、どうして親父は消えたんだ！', 'shake emo:angry'],
        ['gen', '……あいつは言っていた。「このままだと、走り屋は消される」と。', 'emo:sad'],
        ['gen', '名古屋のある男が、公道のレースを全部、自動運転に置き換えようとしている、と。'],
        { narr: 'その名は——カーネル。' }
      ] }),

    S({ id: '2d', ch: '2', title: '師との一本勝負', boss: 'gen2', track: 'tenryu', mode: 'touge', pace: 0.9, goal: { type: 'win' }, reward: 3000,
      scene: [
        { bg: 'tenryu' },
        ['gen', 'ユウ。名古屋へ行く前に、一本だけ付き合え。', 'emo:cool'],
        ['you', 'ゲンさんも……ハチロク！？'],
        ['gen', 'ソウイチと同じ車だ。あいつと並んで、この天竜を毎晩下っていた。'],
        ['gen', 'わしに勝てんようなら、名古屋へは行かせん。', 'emo:angry lines'],
        { vs: ['you', 'gen'] }
      ],
      radio: [
        { at: 'close', who: 'gen', text: '……軽トラで覚えたラインか。あいつと同じ育ち方をしおって。' },
        { at: 'overtook', who: 'gen', text: 'ふっ……それでいい。' },
        { at: 'overtaken', who: 'gen', text: 'まだだ、ユウ。荷台の弁当を思い出せ。' }
      ],
      post: [['gen', '行け、ユウ。お前は、もうわしより速い。', 'emo:smile'], ['mina', 'ゲンさん……泣いてる？', 'emo:shock'], ['gen', '目にゴミが入っただけだ。']] }),

    /* ===================== 第三章 ===================== */
    S({ id: '3a', ch: '3', title: '署長の腕試し', track: 'nagoya', mode: 'arcade', laps: 3, traffic: 14, goal: { type: 'arcade' }, reward: 1800,
      scene: [
        { title: '第三章', sub: 'サイレンの夜' },
        { bg: 'nagoya' },
        ['gamma', '君がソウイチの息子か。私は愛知県警の交通機動隊長、ガンマだ。', 'right'],
        ['gamma', '十年前、ソウイチは私に一つの情報を残して消えた。「ZERO-DAY に気をつけろ」と。'],
        ['gamma', 'ZERO-DAY——このリーグを裏で操る組織だ。君の力を借りたい。'],
        ['you', '……警察が、走り屋に？'],
        ['gamma', '正直に言おう。我々には、あの連中に追いつける人間がいない。', 'emo:sad'],
        ['gamma', 'まずは腕を見せてくれ。夜の名古屋を制限時間内に 3 周だ。']
      ],
      radio: [{ at: 'start', who: 'gamma', text: '一般車に気をつけろ。市民に怪我をさせたら、この話はなしだ。' }],
      post: [['gamma', '合格だ。……あの男の走りを見ているようだ。', 'emo:smile']] }),

    S({ id: '3b', ch: '3', title: '追跡：ファントム', boss: 'phantom', track: 'highway', mode: 'chase', pace: 0.88, traffic: 9, car: 'police', goal: { type: 'catch' }, reward: 3000, unlock: 'police',
      scene: [
        { bg: 'highway' },
        ['gamma', '密輸車「ファントム」が湾岸を逃走中。積み荷は——自動運転 AI のチップだ。', 'right'],
        ['gamma', 'この覆面パトカーを使え。体当たりで止めろ！', 'shake'],
        ['phantom', 'サツの犬が一匹増えたか。追いつけるもんならな！', 'right emo:cool sfx:キュアアア']
      ],
      radio: [
        { at: 'start', who: 'gamma', text: '全車に告ぐ、覆面が一台追跡に入る！' },
        { at: 'close', who: 'phantom', text: 'ちっ、なんでついてこられる……！' },
        { at: 'damage', who: 'gamma', text: '無理をするな！ 君が壊れたら元も子もない！' }
      ],
      post: [
        ['phantom', 'くっ……俺はただの運び屋だ。チップの届け先は……カーネル。', 'emo:sad'],
        ['gamma', 'やはりか。その車は君に預けよう。', 'emo:cool']
      ] }),

    S({ id: '3c', ch: '3', title: 'ボス：港のスドー', boss: 'sudo', track: 'harbor', mode: 'race', laps: 2, rivals: 4, pool: 'gang', pace: 0.92, goal: { type: 'win' }, reward: 3500,
      scene: [
        { bg: 'harbor', weather: 'fog' },
        ['sudo', 'ファントムを捕まえたのはお前か。港は俺たち ZERO-DAY の縄張りだ。', 'right emo:angry'],
        ['sudo', '霧の中で潰してやる。遠慮なくぶつけさせてもらうぜ！', 'shake sfx:ガンッ'],
        ['mina', '赤い車は全部スドーの手下！ 囲まれないで！']
      ],
      radio: [
        { at: 'start', who: 'sudo', text: 'ヒャッハー！ まずは囲め！' },
        { at: 'damage', who: 'mina', text: 'ぶつけられてる！ 外側に逃げて！' },
        { at: 'overtook', who: 'sudo', text: 'なにィ！？ 霧の中で見えてるのか！？' }
      ],
      post: [['sudo', 'ちっ……カーネルの旦那に報告しねえと。「亡霊の息子が来た」ってな。', 'emo:angry']] }),

    /* ===================== 第四章 ===================== */
    S({ id: '4a', ch: '4', title: '宵闇のセブン', boss: 'yoiyami', track: 'tomei', mode: 'sp', pace: 0.94, traffic: 10, weather: 'clear', goal: { type: 'win' }, reward: 3500,
      scene: [
        { title: '第四章', sub: '東名の四つの影' },
        { bg: 'highway' },
        { narr: '深夜二時。東名高速。' },
        { narr: '走り屋の間には、こんな噂がある。「東名には四つの影がいる」と。' },
        ['bit', '特別配信！ 今夜は「SP バトル」だ！ 前を走る者が相手の気力——SP を削る！', 'shake'],
        ['bit', '後ろに離されるほど SP は減る！ ゼロになったら負けだァ！'],
        ['yoiyami', '……月が綺麗な夜ね。こんな夜は、誰にも抜かれたくないの。', 'right emo:cool'],
        ['mina', '「宵闇のセブン」……紺色の FC。ラインが一ミリもぶれないって有名だよ。'],
        { vs: ['you', 'yoiyami'] }
      ],
      radio: [
        { at: 'start', who: 'mina', text: '前に出て SP を削って！ 一般車の間をうまく抜けて！' },
        { at: 'ahead', who: 'yoiyami', text: '……この私の前を、走るのね。' },
        { at: 'overtaken', who: 'mina', text: 'SP が減ってる！ 前に出て！' }
      ],
      post: [['yoiyami', '……素敵な走り。三つ目の影は、もっと荒っぽいわよ。', 'emo:smile']] }),

    S({ id: '4b', ch: '4', title: '鉄仮面', boss: 'tekkamen', track: 'highway', mode: 'sp', pace: 0.96, traffic: 12, goal: { type: 'win' }, reward: 4000,
      scene: [
        { bg: 'highway' },
        ['tekkamen', '……………………。', 'right sfx:ゴォォォ'],
        ['mina', '鉄仮面。一言もしゃべらないで、体当たりしてくる R32 だって……。', 'emo:shock'],
        ['tekkamen', '……ツブス。', 'shake emo:angry lines'],
        { vs: ['you', 'tekkamen'] }
      ],
      radio: [
        { at: 'damage', who: 'mina', text: '当てられてる！ SP も車も削られるよ！' },
        { at: 'ahead', who: 'tekkamen', text: '……ニガサナイ。' }
      ],
      post: [['tekkamen', '……ツヨイ。', 'emo:cool'], { narr: '鉄仮面の下から聞こえたのは、驚くほど若い声だった。' }] }),

    S({ id: '4c', ch: '4', title: '真夜中のすり抜け', track: 'tomei', mode: 'traffic', traffic: 22, goal: { type: 'score', n: 9000 }, reward: 2500,
      scene: [
        { bg: 'highway' },
        ['bit', '四つ目の影に挑む条件は「東名を 9000 点で抜けること」！ ニアミスで稼げ！'],
        ['mina', '一般車のすぐ横を抜けるとニアミス。続けるほど倍率が上がる。でも、ぶつけたら終わりだよ。']
      ],
      radio: [{ at: 'start', who: 'mina', text: '集中して。車と車の隙間を、線でつなぐように。' }],
      post: [['bit', '条件クリア！ そして……来たぞ、四つ目の影が！', 'shake']] }),

    S({ id: '4d', ch: '4', title: 'ボス：最速の男ルート', boss: 'root', track: 'tomei', mode: 'sp', pace: 0.98, traffic: 10, goal: { type: 'win' }, reward: 5000,
      scene: [
        { bg: 'highway' },
        ['root', '俺はルート。東名の四つの影の、最後の一人だ。', 'right emo:cool'],
        ['root', 'そしてカーネルの右腕でもある。……だった、と言うべきか。'],
        ['root', 'あいつは走り屋を全員、機械に置き換えるつもりだ。俺はそれが気に入らねえ。', 'emo:angry'],
        ['root', 'だが、手加減はしない。お前が本物なら、俺を抜いてみせろ！', 'shake lines sfx:ドンッ'],
        { vs: ['you', 'root'] }
      ],
      radio: [
        { at: 'start', who: 'root', text: '直線で俺の前にいられた奴はいない！' },
        { at: 'overtook', who: 'mina', text: '前に出た！ ルートの SP が減ってる！' },
        { at: 'overtaken', who: 'root', text: 'これが本物の加速だ！' }
      ],
      post: [
        ['root', '……速さの意味が、少しわかった気がするぜ。', 'emo:smile'],
        ['root', 'ひとつ教えてやる。ZERO は……お前の親父の知り合いだ。いや、もっと近い何かだ。']
      ] }),

    /* ===================== 第五章 ===================== */
    S({ id: '5a', ch: '5', title: '雪山の解析', track: 'snow', mode: 'race', laps: 2, rivals: 7, pace: 0.93, goal: { type: 'place', n: 3 }, reward: 3000,
      scene: [
        { title: '第五章', sub: '白と赤の試練' },
        { bg: 'snow', weather: 'snow' },
        ['kernel', '初めまして。ZERO-DAY の参謀、カーネルです。', 'right emo:cool'],
        ['kernel', 'あなたの走行データは解析済みです。人間の運転には、ばらつきがある。無駄がある。'],
        ['kernel', 'いずれ全ての車は、私の AI が走らせる。事故のない、美しい世界です。', 'emo:smile'],
        ['you', '……走るのは、人間だ。', 'emo:angry'],
        ['kernel', 'では証明してください。この雪山で。']
      ],
      radio: [{ at: 'start', who: 'mina', text: '雪はとにかく滑る！ アクセルを抜く勇気も技術だよ！' }],
      post: [['kernel', '興味深い。……予測誤差、四パーセント。', 'emo:cool']] }),

    S({ id: '5b', ch: '5', title: 'ボス：参謀カーネル', boss: 'kernel', track: 'volcano', mode: 'race', laps: 2, rivals: 4, pace: 0.97, goal: { type: 'win' }, reward: 5000,
      scene: [
        { bg: 'volcano' },
        ['kernel', '火山ルートでは私の計算が上回る。', 'right emo:cool'],
        ['mina', 'あいつ、後ろにオイルをまいてくる！ 黒いしみはよけて！', 'emo:angry'],
        ['kernel', '汚い、とお思いですか？ 勝率を上げるための、合理的な選択です。'],
        { vs: ['you', 'kernel'] }
      ],
      radio: [
        { at: 'start', who: 'kernel', text: '勝率は私が 87 パーセント。' },
        { at: 'close', who: 'kernel', text: '誤差が……広がっている……？' },
        { at: 'overtook', who: 'kernel', text: 'ありえない。計算に……ない……！' }
      ],
      post: [
        ['kernel', '……いいでしょう。人間の「ばらつき」とやらを、最後にもう一度だけ見せてもらいます。', 'emo:angry'],
        ['kernel', '完成したのですよ。私の最高傑作——完全自律走行マシン「NULL」が。', 'shake lines sfx:ゴゴゴゴ']
      ] }),

    /* ===================== 第六章 ===================== */
    S({ id: '6a', ch: '6', title: '公道 GP 予選', track: 'ashinoko', mode: 'time', laps: 2, goal: { type: 'lap', factor: 0.68 }, reward: 2500,
      scene: [
        { title: '第六章', sub: '公道の祭典' },
        { bg: 'ashinoko' },
        ['bit', '箱根で開催、公道 GP！ ドローン 300 機で全世界に生配信だァ！', 'shake sfx:ワアアア'],
        ['bit', '予選はタイムアタック！ 上位だけが決勝へ進む、ノックアウト方式だ！'],
        ['mina', 'ここで勝てば、ZERO への挑戦権がもらえる。……ユウ、ハチロクで行くの？', 'emo:shock'],
        ['you', 'ああ。この車で、行けるところまで。']
      ],
      radio: [{ at: 'start', who: 'mina', text: '湖畔の区間は全開！ 峠の区間で稼いで！' }],
      post: [['bit', 'ハチロクが予選突破！ スーパーカー軍団がざわついてるぜ！', 'shake']] }),

    S({ id: '6b', ch: '6', title: '公道のスーパーカー', track: 'hakone', mode: 'race', laps: 1, rivals: 5, pool: 'super', pace: 0.97, goal: { type: 'place', n: 3 }, reward: 6000,
      scene: [
        { bg: 'hakone' },
        ['mina', '直線じゃ絶対に勝てない。下りのコーナーで詰めて！'],
        ['taka', 'よう配達屋。応援に来てやったぜ。', 'right emo:smile'],
        ['ray', '俺もだ。……勝てよ。', 'emo:cool'],
        ['you', '……ああ！', 'lines']
      ],
      radio: [
        { at: 'start', who: 'bit', text: '決勝スタート！ 並み居るスーパーカーに小さな FR が挑む！' },
        { at: 'overtook', who: 'taka', text: 'いけえええ配達屋！' },
        { at: 'final', who: 'ray', text: '最後の下りだ。お前ならいける。' }
      ],
      post: [['bit', '表彰台ァ！ 世界中が見たぞ、日本の峠の走りを！', 'shake sfx:ワアアア']] }),

    /* ===================== 第七章 ===================== */
    S({ id: '7a', ch: '7', title: '最終戦 TUI サーキット', boss: 'ray', track: 'circuit', mode: 'race', laps: 3, rivals: 6, pace: 0.99, goal: { type: 'win' }, reward: 6000,
      scene: [
        { title: '第七章', sub: 'ZERO' },
        { bg: 'circuit' },
        ['bit', 'ついに TUI リーグ最終戦！ ここで勝った者だけが ZERO に挑める！'],
        ['ray', '約束通り、最後に俺と走れ。兄貴にも見せたいんだ。', 'right emo:cool'],
        ['ray', 'お前の親父を追いかけた兄貴の走りを。それを継いだ、俺の走りを！', 'emo:angry lines'],
        { vs: ['you', 'ray'] }
      ],
      radio: [
        { at: 'start', who: 'mina', text: 'スタートで前に出て、そのまま逃げ切ろう！' },
        { at: 'overtaken', who: 'ray', text: '見てるか兄貴！' },
        { at: 'overtook', who: 'ray', text: '……いい走りだ、ユウ。' },
        { at: 'final', who: 'mina', text: 'ラストラップ！ 全部出し切って！' }
      ],
      post: [['ray', '完敗だ。……行けよ。ZERO が待ってる。', 'emo:smile'], ['ray', '兄貴が、お前の親父によろしくってさ。']] }),

    S({ id: '7b', ch: '7', title: 'ZERO', boss: 'zero', track: 'neon', mode: 'duel', laps: 3, pace: 1.0, goal: { type: 'win' }, reward: 10000,
      scene: [
        { bg: 'neon' },
        { narr: '光の柱が並ぶ、電脳の回廊。' },
        ['zero', 'よく来た。私は ZERO。このリーグを最初に起動した者だ。', 'right emo:cool'],
        ['zero', '速さとは、止まらないプロセスだ。君はそれを証明できるか。'],
        ['you', '……一つだけ聞かせてくれ。あんた、親父のことを知ってるんだろ。'],
        ['zero', '勝てば、全てを話そう。', 'emo:cool'],
        ['mina', 'ここまで一緒に来たんだ。最後まで全開で！', 'emo:smile'],
        { vs: ['you', 'zero'] }
      ],
      radio: [
        { at: 'start', who: 'zero', text: '見せてもらおう。天竜で育った走りを。' },
        { at: 'close', who: 'zero', text: '……そのブレーキの抜き方。誰に教わった。' },
        { at: 'overtook', who: 'zero', text: 'ふ……ふふ。そうか。そうだったな。' },
        { at: 'final', who: 'mina', text: 'ユウ！ 行けえええ！' }
      ],
      post: [
        { narr: 'ZERO のマシンが止まる。ゆっくりと、ヘルメットが外された。' },
        ['soichi', '……大きくなったな、ユウ。', 'right emo:smile flash'],
        ['you', '……親父……！？', 'shake emo:shock sfx:ドクン'],
        ['soichi', '十年前、私は死んだことにして、ZERO-DAY の中に入った。カーネルの計画を止めるために。', 'emo:sad'],
        ['soichi', 'だが、あの男は私の想像を超えた。NULL は完成してしまった。'],
        ['soichi', '明日の夜、カーネルは NULL で東海道を走り、「人間はもう要らない」と全世界に配信する。'],
        ['soichi', '止められるのは——人間の走りで NULL に勝つことだけだ。', 'lines'],
        ['you', '……勝手に消えて、勝手に現れて……！', 'emo:angry shake'],
        ['you', '文句は、NULL をぶっ倒してから言ってやる！', 'lines sfx:ドンッ'],
        ['soichi', '……ああ。聞いてやる。', 'emo:smile']
      ] }),

    /* ===================== 最終章 ===================== */
    S({ id: 'f1', ch: 'f', title: '嵐の東海道', boss: 'nullcar', track: 'grand', mode: 'race', laps: 1, rivals: 3, pace: 1.02, weather: 'rain', goal: { type: 'win' }, reward: 20000, unlock: 'proto',
      scene: [
        { title: '最終章', sub: 'NULL' },
        { bg: 'grand', weather: 'rain' },
        { narr: '嵐の夜。東名高速、浜松。' },
        ['kernel', '全世界の皆さん。今夜、人間の運転の時代は終わります。', 'right emo:smile'],
        ['kernel', 'NULL は疲れない。怖がらない。迷わない。——そして、負けない。'],
        ['null', 'SYSTEM ONLINE. TARGET: HUMAN DRIVERS. WIN PROBABILITY 99.8%', 'right flash sfx:ピピピ'],
        ['mina', 'ユウのハチロク、できる限り仕上げたよ。……帰ってきてね。', 'emo:sad'],
        ['gen', '天竜の夜明けを思い出せ。荷台の弁当を、揺らさずに運ぶ走りだ。'],
        ['ray', 'ルートとタカと、宵闇と鉄仮面も来てる。道はみんなで開ける。', 'emo:cool'],
        ['gamma', '一般車の通行止めは完了した。名古屋までの道は、君たちのものだ。'],
        ['soichi', 'ユウ。無線は私がつなぐ。最後まで、一緒に走ろう。', 'emo:smile'],
        ['you', '……行くぞ、ハチロク。', 'lines sfx:ブォォン'],
        { vs: ['you', 'null'] }
      ],
      radio: [
        { at: 'start', who: 'soichi', text: '焦るな。NULL は完璧だが、完璧すぎて「予想外」に弱い。' },
        { at: 'overtaken', who: 'null', text: 'HUMAN ERROR DETECTED.' },
        { at: 'close', who: 'soichi', text: 'そうだ、その距離だ。スリップに入れ。' },
        { at: 'overtook', who: 'null', text: 'ERROR... ERROR... UNPREDICTABLE LINE.' },
        { at: 'damage', who: 'mina', text: 'ユウ！ 車が悲鳴を上げてる！ でも、あと少し！' },
        { at: 'ahead', who: 'kernel', text: 'なぜだ……なぜ計算が合わない……！' }
      ],
      post: [
        { narr: '名古屋の夜明け。雨が上がった。' },
        ['bit', '勝ったァァァ！！ 人間が、AI に勝ったァァ！！', 'shake flash sfx:ワアアアア'],
        ['kernel', '……ばらつき、ですか。それが、人間の……。', 'emo:sad'],
        ['soichi', 'よくやった、ユウ。お前はもう、私よりずっと速い。', 'emo:smile'],
        ['you', '……で、文句だけど。', 'emo:cool'],
        ['you', '明日の朝、配達、手伝えよ。天竜の山道、一緒に下ろうぜ。', 'emo:smile'],
        ['soichi', '……ああ。十年ぶりの、夜明けの配達だ。', 'emo:smile'],
        ['mina', 'おかえり、ソウイチおじさん。……おかえり、ユウ。', 'emo:smile'],
        { narr: '——TENRYU RACING　完。' },
        { narr: 'だが、道はどこまでも続いている。' }
      ] }),

    /* ===================== 番外編 ===================== */
    S({ id: 'x1', ch: 'x', title: '白いロータリー', boss: 'kaze', track: 'akimine', mode: 'touge', pace: 0.94, goal: { type: 'win' }, reward: 4000,
      scene: [
        { title: '番外編', sub: '峠の走り屋たち' },
        { bg: 'akimine' },
        ['gen', '全国から挑戦者が来とるぞ。「亡霊の息子と走りたい」とな。', 'emo:smile'],
        ['mina', '最初は白い FC の KAZE。コーナーの理論が完璧なんだって。'],
        { vs: ['you', 'kaze'] }
      ],
      radio: [{ at: 'start', who: 'mina', text: '後追いスタート！ 150m 離されたら負け！' }],
      post: [['gen', '悪くない。次は夕方の臼井だ。黄色いのが待っとる。', 'emo:smile']] }),
    S({ id: 'x2', ch: 'x', title: '夕暮れの黄色い閃光', boss: 'hayate', track: 'usui', mode: 'touge', pace: 0.97, goal: { type: 'win' }, reward: 5000,
      scene: [['mina', 'HAYATE の FD は立ち上がりが速い。出口で離されないで！'], ['gen', '臼井はコーナーの数で勝負が決まる。一つ一つ、丁寧にな。']],
      radio: [{ at: 'overtook', who: 'mina', text: '抜いた！ そのまま！' }],
      post: [['gen', 'さて……最後は箱根だ。公道でスーパーカーどもと走ってこい。']] }),
    S({ id: 'x3', ch: 'x', title: '伝説の二台', track: 'tenryu', mode: 'touge', boss: 'gen2', pace: 1.0, goal: { type: 'win' }, reward: 8000,
      scene: [
        { bg: 'tenryu' },
        ['soichi', 'ユウ。夜明けの天竜で、一本勝負だ。', 'right emo:smile'],
        ['gen', 'わしが代わりに走ろう。ソウイチのハチロクは、もうお前のものだからな。'],
        ['you', 'ゲンさん、本気で来いよ。'],
        { vs: ['you', 'gen'] }
      ],
      radio: [{ at: 'close', who: 'soichi', text: 'いいぞ。夜明けの光が、道を教えてくれる。' }],
      post: [['soichi', '……いい朝だ。', 'emo:smile'], { narr: '番外編　完。' }] })
  ];

  // 古いセーブの進み具合は、新しい物語では最初から
  var oldLoad = R.load;
  R.load = function () {
    var s = oldLoad();
    if (!s.storyV3) { s.storyV3 = true; s.story = 0; s.bosses = s.bosses || {}; R.save(s); }
    return s;
  };
})();
