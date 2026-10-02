/*
 * race-story2.js — ストーリー2「湾岸 1989 ―眠らない環状線―」（全面改修版）
 *
 * 1989 年、平成元年の秋。バブル景気のまっただ中の東京。
 * 昼は救命救急センターの看護師、夜は亡き兄の Z で首都高を走る神崎トウコ（22）。
 * 兄・修は三か月前の八月、湾岸線で事故死した。警察は「単独事故」。
 * ただ、目撃者はこう言う。「黒いポルシェと並んで走っていた」と。
 *
 * 真相（ネタバレ）
 *   修は銀行の融資課で、地上げ屋・久我興産への不正融資を見つけて録音を残した。
 *   口封じに後藤（赤いカウンタック）が湾岸で追い、修の Z を押し出した。
 *   黒いポルシェ「夜鴉」は、その場に居合わせて修を助けた真堂先生。
 *   病院へ運んだのも、救えなかったのも、先生だった。
 *   カセットは修の Z のスピーカーの裏に隠されていた。最後にはトウコへの声も入っている。
 */
(function () {
  'use strict';
  var TB = window.TB, R = TB.Race, C = R.CHARS, B = R.BOSSES;

  /* ---------- 登場人物 ---------- */
  C.touko = { name: 'トウコ', color: '#f06292',
              face: { skin: '#f6d2b8', hair: '#3b2418', style: 'ponytail', eyes: '#3a1f14', acc: 'none', shirt: '#26324a', bg: '#1a1426' } };
  C.touko_n = { name: 'トウコ（看護師）', color: '#f06292',
                face: { skin: '#f6d2b8', hair: '#3b2418', style: 'bun', eyes: '#3a1f14', acc: 'nurse', shirt: '#fafafa', bg: '#e3eef5' } };
  C.shu = { name: '修（兄）', color: '#81d4fa',
            face: { skin: '#eccaa8', hair: '#222', style: 'swept', eyes: '#222', acc: 'glasses', shirt: '#37474f', bg: '#1c2430' } };
  C.yaegashi = { name: '八重樫', color: '#ffcc80',
                 face: { skin: '#dcae8c', hair: '#9e9e9e', style: 'bun', eyes: '#2a1a10', acc: 'cig', shirt: '#4e342e', bg: '#2a1f18' } };
  C.jin = { name: 'ジン', color: '#ffd54f',
            face: { skin: '#e2b58f', hair: '#1a1a1a', style: 'pompadour', eyes: '#222', acc: 'earring', shirt: '#b71c1c', bg: '#2a1010' } };
  C.mari = { name: 'マリ', color: '#aed581',
             face: { skin: '#f3cfb0', hair: '#8d5a2b', style: 'wavy', eyes: '#3b2a20', acc: 'bandana', shirt: '#33691e', bg: '#1b2a12' } };
  C.shindo = { name: '真堂先生', color: '#b0bec5',
               face: { skin: '#eed2bd', hair: '#263238', style: 'swept', eyes: '#1a2a3a', acc: 'glasses', shirt: '#eceff1', bg: '#12181f' } };
  C.goto = { name: '後藤', color: '#ef5350',
             face: { skin: '#d9ab86', hair: '#111', style: 'buzz', eyes: '#111', acc: 'shades', shirt: '#212121', bg: '#1a0808' } };
  C.kurosawa = { name: '黒沢', color: '#ffb300',
                 face: { skin: '#e0b48f', hair: '#3e2723', style: 'swept', eyes: '#1b1b1b', acc: 'mustache', shirt: '#4e3b00', bg: '#2b2100' } };
  C.radio89 = { name: 'FM 湾岸（DJ）', color: '#ce93d8',
                face: { skin: '#e7bb96', hair: '#6a1b9a', style: 'wavy', eyes: '#222', acc: 'headset', shirt: '#311b92', bg: '#1a0d33' } };
  C.yuri = { name: 'ユリ（修の同僚）', color: '#80cbc4',
             face: { skin: '#f6d9c3', hair: '#2c2018', style: 'bob', eyes: '#3a2a20', acc: 'glasses', shirt: '#455a64', bg: '#1d2a2a' } };
  C.kuga = { name: '久我', color: '#bdbdbd',
             face: { skin: '#e3c3a5', hair: '#cfcfcf', style: 'swept', eyes: '#222', acc: 'monocle', shirt: '#212121', bg: '#15151a' } };
  C.yogarasu = { name: '夜鴉', color: '#b0bec5',
                 face: { skin: '#cfd8dc', hair: '#111', style: 'hood', eyes: '#eceff1', acc: 'visor', shirt: '#111', bg: '#05050a' } };
  C.hasegawa = { name: '長谷川婦長', color: '#f8bbd0',
                 face: { skin: '#f0cdb0', hair: '#555', style: 'bun', eyes: '#3a2a20', acc: 'glasses', shirt: '#fafafa', bg: '#e3eef5' } };

  /* ---------- ボスと車 ---------- */
  B.jin = { name: 'JIN', color: '#fdd835', body: 'muscle', ai: 'aggressive', skill: 0.9, boss: true, ability: 'burst' };
  B.mari = { name: 'MARI', color: '#7cb342', body: 'rally', ai: 'technician', skill: 0.95, boss: true, ability: 'block' };
  B.yogarasu = { name: 'YOGARASU', color: '#0d0d0d', body: 'rr', ai: 'speedster', skill: 1.02, boss: true, ability: 'burst' };
  B.goto = { name: 'GOTO', color: '#b71c1c', body: 'wedge', ai: 'aggressive', skill: 1.02, boss: true, ability: 'ram' };
  B.yaegashi = { name: 'YAEGASHI', color: '#ffb74d', body: 'classic', ai: 'technician', skill: 1, boss: true, ability: 'block' };
  B.shu = { name: 'SHU', color: '#1c1c1c', body: 'gt', ai: 'technician', skill: 1, boss: true, ability: 'block' };
  B.kurosawa = { name: 'KUROSAWA', color: '#eceff1', body: 'r32', ai: 'blocker', skill: 0.97, boss: true, ability: 'block' };
  [
    { id: 'z31', name: { ja: '修の Z（Z31）', en: "Shu's Z (Z31)" }, cls: 'B', price: 0, body: 'gt', paint: 5, unlock: true, era: 1989,
      stats: { spd: 7, acc: 6, grp: 6, arm: 6, nit: 6 }, desc: { ja: '兄の形見。3 リッターのターボ。黒いボディに白いピンストライプ。', en: "Her late brother's turbo Z." } },
    { id: 'z31t', name: { ja: 'Z（八重樫チューン）', en: 'Z (Yaegashi tune)' }, cls: 'A', price: 0, body: 'gt', paint: 5, unlock: true, era: 1989,
      stats: { spd: 9, acc: 8, grp: 7, arm: 6, nit: 8 }, desc: { ja: '八重樫が組んだ最高速仕様。湾岸で 300km/h を目指す。', en: 'Tuned by Yaegashi for 300 km/h on the Wangan.' } }
  ].forEach(function (c) { if (!R.CARS.some(function (x) { return x.id === c.id; })) R.CARS.push(c); });

  function S(o) { return o; }

  var CH = [
    { id: '0', name: '序章　修の Z' },
    { id: '1', name: '第一章　辰巳の夜' },
    { id: '2', name: '第二章　箱根の上り坂' },
    { id: '3', name: '第三章　夜鴉' },
    { id: '4', name: '第四章　バブルの影' },
    { id: '5', name: '第五章　二つの夜' },
    { id: '6', name: '最終章　環状線の夜明け' }
  ];

  var EV = [
    /* ===================== 序章 ===================== */
    S({ id: 's2_1', ch: '0', title: '兄の車', track: 'highway', mode: 'time', laps: 1, car: 'z31', goal: { type: 'lap', factor: 0.55 }, reward: 800,
      scene: [
        { title: '湾岸 1989', sub: '序章　修の Z' },
        { bg: 'highway' },
        { narr: '1989 年、秋。年号が「平成」に変わったその年、日本は史上最高に浮かれていた。' },
        { narr: '土地は毎日値上がりし、株は上がり続け、夜の街は朝まで光っていた。' },
        { bg: 'city' },
        { narr: '三か月前。八月十一日、金曜日の深夜。晴海中央病院、救命救急センター。' },
        ['hasegawa', '搬入、あと三分！ 神崎さん、一番ベッド空けて！ 交通外傷、二十代男性、意識レベル三桁！', 'right emo:shock'],
        ['touko_n', 'はい！ ……ストレッチャー、入ります！'],
        ['shindo', '血圧、触れない。挿管、急いで。……この患者、誰か——', 'emo:sad shake'],
        ['touko_n', '……え。……お、にい、ちゃん……？', 'emo:shock flash'],
        { narr: '運ばれてきたのは、たったひとりの兄だった。' },
        ['shindo', '……戻ってこい。頼む、戻ってこい……！', 'emo:sad lines'],
        { narr: '午前三時十二分。兄・神崎修は、二十七歳で死んだ。' },
        { bg: 'highway' },
        { narr: '——それから、三か月。' },
        ['touko', '警察は「単独事故」だって言った。ガードレールに一人で突っ込んだんだ、って。', 'emo:sad'],
        ['touko', 'でも、救急隊員が教えてくれた。現場にいた人が、こう言ってたって。「黒いポルシェと、並んで走ってた」。'],
        ['touko', '兄さんは銀行員。毎晩、背広で帰ってきて、日曜は洗車するだけの人だった。……走り屋なんかじゃ、なかった。'],
        ['touko', 'なのに、どうして夜の湾岸で、あんなスピードを出してたの？', 'emo:angry'],
        ['touko', '兄さんの Z。キーは、ずっと引き出しの中。……乗ってみる。マニュアル、教習所以来だけど。', 'lines'],
        ['radio89', 'こんばんは、FM 湾岸。午前一時。眠らない街の、眠れないあなたへ。', 'right']
      ],
      radio: [
        { at: 'start', who: 'radio89', text: 'リクエストは「真夜中のドア」。それでは、安全運転で。' },
        { at: 'damage', who: 'touko', text: '……ごめん、兄さん。擦っちゃった。' },
        { at: 'final', who: 'touko', text: '兄さん……こんな景色を、毎晩見てたの？' }
      ],
      post: [
        ['touko', '……こわい。でも、きれい。夜の高速って、光の川みたい。', 'emo:sad'],
        { narr: '辰巳パーキングエリアに戻ると、一台のマッスルカーが、トウコの Z の真横に静かに停まった。' },
        ['jin', 'よう。その Z、修のだろ。……ナンバーの下二桁まで、覚えてるぜ。', 'right emo:cool'],
        ['touko', '兄を……知ってるんですか！', 'emo:shock']
      ] }),

    S({ id: 's2_2', ch: '0', title: '辰巳のジン', boss: 'jin', track: 'highway', mode: 'sp', pace: 0.86, traffic: 8, car: 'z31', goal: { type: 'win' }, reward: 1500,
      scene: [
        { bg: 'highway' },
        ['jin', '俺はジン。辰巳じゃ、ちょっとは知られた顔だ。家は町工場。昼はネジを削って、夜は湾岸だ。', 'right emo:cool'],
        ['jin', '修は、半年前からここに来るようになった。走りはヘタクソだったけどな。', 'emo:smile'],
        ['jin', 'あいつ、毎晩こう訊くんだ。「黒い車を見なかったか」ってな。'],
        ['touko', '黒い……ポルシェ、ですか。', 'emo:shock'],
        ['jin', '「夜鴉」って呼ばれてる。湾岸で一番速くて、誰も正体を知らねえ。……修の事故の夜も、そいつが居たって噂だ。'],
        ['touko', '教えてください。そのポルシェのこと、全部。', 'emo:angry'],
        ['jin', '知りたきゃ、俺に勝ってみな。修の妹が、どのくらい走れるか見てやるよ。', 'emo:angry lines'],
        { vs: ['touko', 'jin'] }
      ],
      radio: [
        { at: 'start', who: 'jin', text: 'SP バトルだ。前に出た方が相手の気力を削る。ついてこいよ、ナースさん！' },
        { at: 'ahead', who: 'jin', text: 'おいおい……マジかよ、初心者だろ！？' },
        { at: 'overtaken', who: 'touko', text: '……まだ。兄さんの Z は、こんなもんじゃない。' }
      ],
      post: [
        ['jin', 'はは……参った。ハンドルの切り方が、修とそっくりだ。', 'emo:smile'],
        ['jin', '夜鴉と並んで走れたのは、湾岸でただ一人。……修だけだった。', 'emo:sad'],
        ['touko', '兄さんが、夜鴉と？ どうして、銀行員の兄さんが……', 'emo:shock'],
        ['jin', 'そこまでは知らねえ。ただ、Z をちゃんと仕上げな。八重樫のばあさんの店を教えてやる。', 'emo:cool'],
        ['jin', 'あと一つ。湾岸で赤いカウンタックを見たら、関わるな。あれは、走り屋じゃねえ。', 'emo:angry']
      ] }),

    /* ===================== 第一章 ===================== */
    S({ id: 's2_3', ch: '1', title: '筑波のサンデーレース', track: 'r_tsukuba', mode: 'race', laps: 3, rivals: 7, pace: 0.82, car: 'z31', goal: { type: 'place', n: 3 }, reward: 3000,
      scene: [
        { title: '第一章', sub: '辰巳の夜' },
        { bg: 'circuit' },
        { narr: '京浜運河ぞいの高架下。看板の文字が半分剥げた、「八重樫モータース」。' },
        ['yaegashi', '修の妹かい。……あの子の Z をいじってたのは、あたしだよ。', 'right emo:cool'],
        ['yaegashi', 'チューンしてやってもいい。ただし、部品代はきっちりもらう。タダ働きは、昭和で終わりにしたんだ。'],
        ['touko', 'お金……看護師の給料じゃ、とても。夜勤手当を全部つぎ込んでも。', 'emo:sad'],
        ['yaegashi', 'なら稼ぎな。日曜の筑波で、素人のレースがある。三位までなら賞金が出る。'],
        ['yaegashi', 'サーキットは首都高より、ずっと正直だよ。ぶつけたら自分が痛い。それだけさ。', 'emo:smile'],
        ['touko', '……やります。', 'emo:cool']
      ],
      radio: [
        { at: 'start', who: 'yaegashi', text: '一コーナーは焦るんじゃないよ。筑波は、最終コーナーが命だ。' },
        { at: 'overtook', who: 'yaegashi', text: 'そう、そのブレーキ。修と同じ癖だね。' },
        { at: 'final', who: 'yaegashi', text: '最後の一周。三位以内なら、あんたの Z に火を入れてやる。' }
      ],
      post: [
        ['yaegashi', '合格だ。……修はね、あんたの話ばかりしてたよ。「妹は俺より度胸がある」ってさ。', 'emo:smile'],
        ['touko', '……兄さん。', 'emo:sad'],
        ['yaegashi', 'ただし、あの子は走る前によく言ってた。「ヤエさん、俺、どうしても勝ちたい相手がいるんだ」って。', 'emo:cool'],
        ['touko', '勝ちたい、相手……。']
      ] }),

    S({ id: 's2_4', ch: '1', title: '湾岸のマナー', track: 'tomei', mode: 'traffic', traffic: 20, car: 'z31', goal: { type: 'score', n: 600 }, reward: 2200,
      scene: [
        { bg: 'tomei' },
        ['jin', '湾岸ってのはな、速けりゃいいってもんじゃねえ。流れを読むのが、先だ。', 'right emo:cool'],
        ['jin', 'トラックの影から飛び出さない。ブレーキランプが三つ並んだら、前の前の車を見る。'],
        ['touko', '……救急車の運転と、同じですね。周りを全部見て、道を空けさせる。', 'emo:smile'],
        ['jin', 'ははっ、そりゃ心強い。じゃあ今夜の課題だ。一般車の間をすり抜けて、ぶつけずに六百点。'],
        ['jin', 'ギリギリで抜くほど、点は高い。ただし、一発でも当てたら終わりだ。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'jin', text: '走行車線のトラックには、ぜったい張りつくな。風に持ってかれるぞ！' },
        { at: 'damage', who: 'jin', text: '擦ったか！？ 焦るな、もう一回立て直せ！' },
        { at: 'final', who: 'jin', text: 'あと少しだ。ラスト、流れに乗れ！' }
      ],
      post: [
        ['jin', 'やるじゃねえか。……いい運転だ。修より、ずっと無駄がねえ。', 'emo:smile'],
        ['touko', 'ジンさん。兄は、どうして走り屋たちと付き合ってたんでしょう。', 'emo:sad'],
        ['jin', '本人は「運転を習ってる」って笑ってた。……でもな、あいつ、俺たちの顔を見るたび、誰かを探してた。', 'emo:cool'],
        ['jin', '黒いポルシェ。……そいつを見つけたら、何かを渡す、って言ってた気がする。', 'emo:shock']
      ] }),

    S({ id: 's2_5', ch: '1', title: '兄のノート', track: 'harbor', mode: 'time', laps: 1, car: 'z31', goal: { type: 'lap', factor: 0.6 }, reward: 2500,
      scene: [
        { bg: 'harbor' },
        { narr: '八重樫モータースの片隅で、一冊の古いノートが見つかった。表紙には、几帳面な字。「走行記録　神崎修」。' },
        ['yaegashi', 'ガレージの引き出しに、置いてったんだ。あの子は、あたしにしか見せなかったよ。', 'right emo:cool'],
        ['touko', '……ラップタイム。コースごとに、天気、気温、タイヤの空気圧まで。銀行員の字だ。', 'emo:smile'],
        ['touko', 'でも、ここ。最後のページだけ、タイムじゃない。……「Y に勝つ」。それから、三桁の数字がたくさん。'],
        ['yaegashi', '数字？ 見せてごらん。……電話番号でも、ナンバーでもないね。帳簿の金額みたいだ。', 'emo:shock'],
        ['touko', '兄さんの仕事場の、言葉……？ ……ねえ、ヤエさん。兄さんは、走るために走ってたんじゃないのかもしれない。', 'emo:cool'],
        ['yaegashi', 'ともかく、書いてある通りに走ってごらん。ここの港のコース、兄さんの最速ラップが載ってる。', 'lines']
      ],
      radio: [
        { at: 'start', who: 'yaegashi', text: 'ノートには、一コーナーの進入が「奥まで我慢」って書いてある。' },
        { at: 'lap', who: 'touko', text: '……兄さんの字が、頭の中で喋ってるみたい。' },
        { at: 'final', who: 'touko', text: 'ここだ。……兄さん、あなたの走り、わかってきたよ。' }
      ],
      post: [
        ['touko', '兄さんのタイムに、届いた。……ねえ、ヤエさん。', 'emo:smile'],
        ['yaegashi', 'ん？', 'emo:cool'],
        ['touko', 'あの最後のページの数字。ちゃんと調べてみます。私、兄の仕事のこと、なんにも知らなかったから。', 'emo:cool'],
        { narr: 'その数字が、バブルの裏側につながっていることを、トウコはまだ知らない。' }
      ] }),

    /* ===================== 第二章 ===================== */
    S({ id: 's2_6', ch: '2', title: 'ターンパイクのマリ', boss: 'mari', track: 'r_turnpike', mode: 'touge', pace: 0.9, car: 'z31', goal: { type: 'win' }, reward: 3200,
      scene: [
        { title: '第二章', sub: '箱根の上り坂' },
        { bg: 'forest' },
        { narr: '夜明け前の箱根ターンパイク。海から大観山まで、一気に駆け上がる。' },
        ['mari', 'あんたが修の妹？ ……似てない。あいつは、もっと目が死んでた。', 'right emo:cool'],
        ['touko', '初対面で、ずいぶんな挨拶ですね。', 'emo:angry'],
        ['mari', 'あたしはマリ。引っ越し屋のトラックで毎日箱根を越えてる。修はね、ナビ席に乗せたことがある。', 'emo:smile'],
        ['mari', '「このコーナーで抜けるのは無理だ」って言ったら、あいつ、メモを取ってたんだ。……真面目な男だった。'],
        ['touko', '……兄さん、夜鴉のことを、あなたにも訊きましたか。', 'emo:cool'],
        ['mari', '訊かれた。だから言ったよ。「箱根まで来たら、あたしを抜いてから聞け」って。……あんたも同じさ。', 'emo:angry lines'],
        { vs: ['touko', 'mari'] }
      ],
      radio: [
        { at: 'start', who: 'mari', text: '上りのヘアピンは、立ち上がりが全て。アクセル、遅れないでね。' },
        { at: 'close', who: 'mari', text: 'ついてくるじゃん……！' },
        { at: 'overtook', who: 'touko', text: 'ごめんなさい。急ぐ理由が、あるんです。' }
      ],
      post: [
        ['mari', '……っはあ。負けた。久しぶりに、胸がすっとしたよ。', 'emo:smile'],
        ['mari', '約束だ。夜鴉のこと、あたしが知ってる分だけ話す。修が一度だけ、あいつと走ったのは、榛名だよ。', 'emo:cool'],
        ['touko', '榛名……。', 'emo:shock'],
        ['mari', '霧の深い夜だった。……あたし、ナビ席で見てた。夜鴉の運転は、人間の速さじゃなかった。でも、妙に優しかったんだ。', 'emo:cool']
      ] }),

    S({ id: 's2_7', ch: '2', title: '霧の榛名', track: 'r_haruna', mode: 'time', laps: 1, car: 'z31', weather: 'fog', goal: { type: 'lap', factor: 0.27 }, reward: 2800,
      scene: [
        { bg: 'forest', weather: 'fog' },
        { narr: '群馬、榛名山。標高が上がるにつれて、ヘッドライトの先が白く溶けていく。' },
        ['mari', 'ここのヘアピンの立ち上がりに、石の地蔵があってさ。修は、毎回手を合わせてから走ってた。', 'right emo:smile'],
        ['touko', '兄さん……怖がりだったから。', 'emo:smile'],
        ['mari', 'そう。怖がりなのに、夜鴉の後ろだけは、ぴったりくっついて離れなかった。理由は、あたしにもわかんない。'],
        ['mari', '——見えたの。榛名湖の手前で、夜鴉が、わざとスピードを落としたの。まるで、修を待ってるみたいに。', 'emo:shock'],
        ['touko', '待ってた……？ 勝負じゃなくて？', 'emo:shock'],
        ['mari', '今夜は霧が出てる。あの夜と同じだ。……感じてごらん。兄さんの見てた景色を。', 'lines']
      ],
      radio: [
        { at: 'start', who: 'mari', text: '霧のときは、白線だけ見て。左端の白線を、命綱にして。' },
        { at: 'damage', who: 'mari', text: 'おっと。ガードレールは、友達じゃないよ。' },
        { at: 'final', who: 'touko', text: '……地蔵。ここだ。兄さんも、ここで手を合わせたんだ。' }
      ],
      post: [
        ['touko', '……榛名湖。湖面に、霧が立ってる。', 'emo:smile'],
        ['mari', '修の最速ラップより、二秒速い。……やっぱり、血だね。', 'emo:smile'],
        ['touko', 'マリさん。兄さんが亡くなる前の晩、何か言ってませんでしたか。', 'emo:sad'],
        ['mari', '「近いうちに、全部片付く。そうしたらトウコに、ちゃんと話す」って。……言ってた。', 'emo:cool'],
        ['touko', '……何を、話すつもりだったの、兄さん。', 'emo:sad']
      ] }),

    S({ id: 's2_8', ch: '2', title: '椿ラインの夜明け', track: 'r_tsubaki', mode: 'time', laps: 1, car: 'z31', goal: { type: 'lap', factor: 0.23 }, reward: 3000,
      scene: [
        { bg: 'forest' },
        { narr: '湯河原から箱根へ。椿ラインは、中低速のコーナーが延々と続く。' },
        ['mari', 'ねえトウコ。あたし、修のことが好きだったんだ。……ううん、そういう好きじゃない。弟みたいな好き。', 'right emo:smile'],
        ['touko', '……わかります。兄さん、放っておけない人でしたから。', 'emo:smile'],
        ['mari', 'あのね。修が死んだ日、あたしの携帯……じゃなくて、ポケベルが鳴ったの。「ヒミツ ノ テープ アズケル」って。', 'emo:shock'],
        ['touko', 'テープ！？ ……その、テープは？', 'emo:shock lines'],
        ['mari', '預かってない。あいつ、渡す前に……。ごめん。今まで言えなかった。あたし、自分のせいだって思ってた。', 'emo:sad'],
        ['touko', 'マリさんのせいじゃない。……ありがとう、話してくれて。それ、最大の手がかりです。', 'emo:cool']
      ],
      radio: [
        { at: 'start', who: 'mari', text: '椿は、リズムで走る道。ガツガツ踏まないで、流れるように。' },
        { at: 'final', who: 'touko', text: 'テープ。兄さんが遺した、秘密のテープ。……絶対に、探し出す。' }
      ],
      post: [
        ['mari', 'ポケベル、まだ持ってるんだ。ほら。……ちゃんと残ってる。', 'right emo:smile'],
        ['touko', '「ヒミツ ノ テープ アズケル」。……兄さんの、最後のメッセージ。', 'emo:sad'],
        ['mari', '夜鴉が持ってるのかな。それとも、赤いカウンタックの方か……。', 'emo:cool'],
        ['touko', 'どっちにしても、会わなきゃ。夜鴉に。', 'emo:cool lines']
      ] }),

    /* ===================== 第三章 ===================== */
    S({ id: 's2_9', ch: '3', title: '夜鴉', boss: 'yogarasu', track: 'tomei', mode: 'sp', pace: 1.0, traffic: 10, car: 'z31', goal: { type: 'finish' }, reward: 2500,
      scene: [
        { title: '第三章', sub: '夜鴉' },
        { bgm: 'tension' },
        { bg: 'tomei' },
        { narr: '午前二時。東名高速、横浜町田から厚木へ。ミラーの中に、一つだけ光の点が増えた。' },
        ['touko', '……来た。黒い、ポルシェ。ヘッドライトが、全然ぶれない。', 'emo:shock'],
        ['jin', 'おい……マジで夜鴉だ！ トウコ、無理に勝とうとするな！ 食らいついて、最後まで走れ！', 'right emo:shock'],
        ['yogarasu', '……（ライトを二度、点滅させた）', 'emo:cool'],
        ['touko', '話がしたい。あなたを、ずっと探してた！', 'emo:angry lines'],
        { vs: ['touko', 'yogarasu'] }
      ],
      radio: [
        { at: 'start', who: 'jin', text: '勝たなくていい。最後まで、離れるな！' },
        { at: 'ahead', who: 'touko', text: '……速い。離される。でも、まだ見えてる。' },
        { at: 'final', who: 'touko', text: 'お願い。止まって。兄を知ってるんでしょう！' }
      ],
      post: [
        ['touko', '……ついていけた。最後まで、テールランプが見えてた。', 'emo:cool'],
        { narr: '夜鴉は、パーキングで一度だけ減速した。そして窓から、白い手袋の腕が出て、小さく手を振った。' },
        ['jin', '今の……挨拶か？ 夜鴉が、誰かに？ 初めて見たぜ。', 'right emo:shock'],
        ['touko', '怖い人じゃ、ない。……そんな気がする。どうしてだろう。', 'emo:cool']
      ] }),

    S({ id: 's2_10', ch: '3', title: 'ネオン街のサバイバル', track: 'city', mode: 'elim', rivals: 5, pace: 0.9, car: 'z31', goal: { type: 'survive' }, reward: 3000,
      scene: [
        { bg: 'city' },
        { narr: '芝浦のウォーターフロント。ディスコのネオンが、運河に揺れている。' },
        ['jin', '厄介なことになった。後藤の手下どもが、辰巳の仲間に難癖をつけてきた。「修の妹を出せ」ってな。', 'right emo:angry'],
        ['touko', '私のせいで……みんなに迷惑を。', 'emo:sad'],
        ['jin', '迷惑なもんか。連中は、湾岸の走り屋を地上げに使いたいだけだ。気に入らねえんだよ。', 'emo:angry'],
        ['jin', '今夜は連中が「公道レース」を仕掛けてくる。一周ごとに最下位が脱落。最後の一台まで残れば、俺たちの勝ちだ。'],
        ['touko', '……ケンカ、売られたなら買います。ナースは、止血と度胸だけは人一倍なので。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'jin', text: '周ごとに最下位が消える！ 絶対に、ビリにはなるな！' },
        { at: 'overtook', who: 'jin', text: 'そうだ、その調子！ 地上げ屋の車なんか、置いていけ！' },
        { at: 'final', who: 'touko', text: '残り二台……。もう一台、片づける。' }
      ],
      post: [
        ['jin', 'やった！ ざまあみろ、後藤の犬ども！', 'right emo:smile shake'],
        ['touko', 'ジンさん。……その、後藤って人は、何者なんですか。', 'emo:cool'],
        ['jin', '久我興産の用心棒。元はレーサー志望だったらしい。腕は本物だ。……だから余計に、危ねえ。', 'emo:cool'],
        ['jin', '久我興産。聞いたことねえか？ 辰巳の商店街、半分はあいつらに潰された。', 'emo:angry'],
        ['touko', '……久我、興産。……兄さんのノートに、その名前、あった気がする。', 'emo:shock']
      ] }),

    S({ id: 's2_11', ch: '3', title: '検問突破', boss: 'kurosawa', track: 'highway', mode: 'arcade', laps: 3, traffic: 14, car: 'z31', goal: { type: 'arcade' }, reward: 3200,
      scene: [
        { bg: 'highway' },
        { narr: '湾岸線、午前三時。路肩に、見慣れない白い覆面パトカーが止まっていた。' },
        ['kurosawa', '神崎トウコさんだな。警視庁交通機動隊、黒沢だ。……ああ、取り締まりじゃない。話がしたくてね。', 'right emo:cool'],
        ['touko', '刑事さん……が、私に何を。', 'emo:cool'],
        ['kurosawa', '修くんの事故。調書は「単独事故」で閉じたが、俺は納得してない。上から、早く閉じろと言われた。', 'emo:angry'],
        ['kurosawa', '誰が、なぜ。……だからあんたが湾岸を走り回ってると聞いて、見に来た。腕前を、見せてもらいたい。'],
        ['kurosawa', '三周。制限時間内に、チェックポイントを通って走りきれ。今夜だけは、スピード違反は見逃す。', 'emo:smile'],
        ['touko', '……試験、ですか。刑事さんの。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'kurosawa', text: 'チェックポイントごとに時間が延びる。とにかく止まらず、走り続けろ。' },
        { at: 'damage', who: 'kurosawa', text: '減速するな。ぶつけたなら、次で取り戻せ。' },
        { at: 'final', who: 'kurosawa', text: '残り一周。……やるな。' }
      ],
      post: [
        ['kurosawa', '合格だ。……俺は、君の味方になれる。ただし、証拠がいる。一つでも、確かな物がな。', 'emo:smile'],
        ['touko', '証拠……。兄が遺した、テープ。それが鍵だと思います。', 'emo:cool'],
        ['kurosawa', 'テープ？ ……なるほど。持っている人間は、必ず狙われる。気をつけろ。', 'emo:shock'],
        ['kurosawa', 'これを渡しておく。俺の署の直通電話だ。何かあったら、迷わずかけろ。', 'emo:cool']
      ] }),

    /* ===================== 第四章 ===================== */
    S({ id: 's2_12', ch: '4', title: '八重樫のチューン', track: 'r_fuji', mode: 'race', laps: 2, rivals: 7, pace: 0.92, car: 'z31t', unlock: 'z31t', goal: { type: 'place', n: 2 }, reward: 5000,
      scene: [
        { title: '第四章', sub: 'バブルの影' },
        { bg: 'circuit' },
        { narr: '八重樫モータース。深夜まで、エンジンの音が止まらなかった。' },
        ['yaegashi', '終わったよ。最高速仕様、二百九十キロまで伸びる。……ただし、気難しいよ。', 'right emo:smile'],
        ['yaegashi', 'あと、ひとつ。リアのスピーカーを外したら、こんなのが出てきた。', 'emo:cool'],
        ['touko', '……カセットテープ。ラベルは、白紙。', 'emo:shock flash'],
        ['yaegashi', 'あの子、スピーカーの箱に隠してたんだね。……たぶん、これだ。聴くかい？', 'emo:cool'],
        ['touko', '……いいえ。今は聴けません。聴いたら、立ち止まっちゃうから。', 'emo:sad'],
        ['touko', 'この車が、ちゃんと走れるって確かめてから。……兄さんの声を聴くのは、そのあとにします。', 'emo:cool lines'],
        ['yaegashi', '強情なところまで、そっくりだね。……試走は富士だ。耐久の日曜レースがある。二位に入りな。']
      ],
      radio: [
        { at: 'start', who: 'yaegashi', text: '富士の最終コーナーは、ブレーキを遅らせすぎるんじゃないよ。' },
        { at: 'overtook', who: 'yaegashi', text: '加速、いいじゃないか。あたしのチューンは、嘘をつかない。' },
        { at: 'final', who: 'yaegashi', text: 'ラスト一周！ 2 位以内、獲ってきな！' }
      ],
      post: [
        ['touko', '……最高。この車、翼が生えたみたい。', 'emo:smile'],
        ['yaegashi', '褒め言葉として受け取っておくよ。……でもね、トウコ。気をつけな。', 'emo:cool'],
        ['yaegashi', '店の前に、昼間から黒いセダンが停まってる。たぶん、探してる物があるんだよ。', 'emo:shock'],
        ['touko', '……カセット。守らなきゃ。', 'emo:cool']
      ] }),

    S({ id: 's2_13', ch: '4', title: '赤いカウンタック', boss: 'goto', track: 'harbor', mode: 'duel', laps: 2, pace: 0.98, weather: 'fog', car: 'z31t', goal: { type: 'win' }, reward: 6000,
      scene: [
        { bgm: 'tension' },
        { bg: 'harbor', weather: 'fog' },
        { narr: '霧の大黒ふ頭。一台の赤いスーパーカーが、低いエンジン音を響かせて待っていた。' },
        ['goto', '神崎トウコ。……兄貴に、よく似た走りをする。', 'right emo:cool'],
        ['touko', '後藤、さん。……あなたが、兄さんを。', 'emo:angry'],
        ['goto', 'さあな。ただ、一つ教えてやる。久我さんは、お前が持ってる「物」を欲しがってる。素直に渡せば、痛い目は見ない。'],
        ['touko', '渡しません。……あれは、兄さんが命がけで遺した物。あなたたちの手に、渡さない。', 'emo:angry lines'],
        ['goto', '強情だな。……なら、走りで決めよう。俺は、負けたことがない。お前の兄貴にもな。', 'emo:cool shake'],
        { vs: ['touko', 'goto'] }
      ],
      radio: [
        { at: 'start', who: 'goto', text: '二周だ。ドアが擦れるくらいで、いこうぜ。' },
        { at: 'close', who: 'goto', text: 'ほう……ついてくるか。' },
        { at: 'overtook', who: 'touko', text: '兄さんは、遅くなんかない！' },
        { at: 'damage', who: 'goto', text: 'ハハ、いい音だ。ボディが泣いてるぜ！' }
      ],
      post: [
        ['goto', '……負けた、か。久しぶりだ、この感じ。', 'emo:cool'],
        ['touko', '約束です。兄さんの事故の夜のこと、話してください。', 'emo:angry'],
        ['goto', '……俺が話すのは、ここまでだ。久我さんに逆らえば、俺の居場所は消える。', 'emo:sad'],
        ['goto', 'ただ、これだけは言っておく。お前の兄貴は、遅くなかった。……あの夜、俺は殺すつもりじゃ、なかったんだ。', 'emo:sad flash'],
        ['touko', '……え。今、なんて——', 'emo:shock'],
        { narr: '赤いカウンタックは、霧の中に消えた。トウコの耳に、最後の言葉だけが残った。' }
      ] }),

    S({ id: 's2_14', ch: '4', title: 'ユリの告白', track: 'tomei', mode: 'arcade', laps: 3, traffic: 12, car: 'z31t', goal: { type: 'arcade' }, reward: 4500,
      scene: [
        { bg: 'tomei' },
        { narr: '深夜、病院の裏口。白衣のトウコに、一人の女性が駆け寄ってきた。' },
        ['yuri', '神崎トウコさん……ですよね。修さんの、同僚の篠宮ユリです。', 'right emo:shock'],
        ['touko', '兄の……。どうして、ここに。', 'emo:shock'],
        ['yuri', '私、修さんの共犯でした。久我興産への融資が、おかしいって最初に気づいたのは、私なんです。', 'emo:sad'],
        ['yuri', '鑑定書の偽造。実体のない物件への、何百億円もの融資。上司に逆らえなくて、私は……逃げた。'],
        ['yuri', '修さんは、最後まで証拠を集めようとしてた。……そして、あの夜。'],
        ['yuri', '私、いま尾けられてるんです。お願いします。湾岸の辰巳まで、送ってください。そこに、私が隠した「もう一つの証拠」があります。', 'emo:cool lines'],
        ['touko', '……乗って。制限時間は、あなたが捕まるまで。', 'emo:cool']
      ],
      radio: [
        { at: 'start', who: 'yuri', text: '後ろの黒いセダン、さっきから離れません……！' },
        { at: 'damage', who: 'yuri', text: 'きゃっ！ ……大丈夫、続けてください！' },
        { at: 'final', who: 'yuri', text: 'もうすぐ辰巳です。あと少し……！' }
      ],
      post: [
        ['yuri', '……着いた。ここの貸しロッカーに、融資の稟議書のコピーが。', 'emo:cool'],
        ['touko', 'これで、テープと合わせれば、久我興産の不正が全部——', 'emo:shock'],
        ['yuri', 'ええ。……ただ、これを警察に出す前に、確かめたいことがあるんです。夜鴉のこと。', 'emo:cool'],
        ['yuri', '修さんが死んだ夜、一一九番に通報したのは、辰巳の公衆電話からでした。……黒いポルシェを見た、って。', 'emo:shock'],
        ['touko', '通報した、のは、夜鴉……？', 'emo:shock flash']
      ] }),

    /* ===================== 第五章 ===================== */
    S({ id: 's2_15', ch: '5', title: '夜鴉の正体', boss: 'yogarasu', track: 'tomei', mode: 'sp', pace: 1.0, traffic: 8, car: 'z31t', goal: { type: 'win' }, reward: 6000,
      scene: [
        { title: '第五章', sub: '二つの夜' },
        { bgm: 'tension' },
        { bg: 'tomei' },
        { narr: '午前一時。ミラーの中に、あの黒いポルシェが、静かに寄り添ってきた。' },
        ['touko', '通報したのは、あなた。兄を病院へ運ぶきっかけを作ってくれたのも、あなた。……だったら、なぜ姿を隠すの！', 'emo:angry'],
        ['yogarasu', '……（無言で、ライトをパッシングした。「ついてこい」の合図だ）', 'emo:cool'],
        ['touko', 'いいわ。今夜、止めてみせる。……話を聞くまで、逃がさない！', 'emo:angry lines'],
        { vs: ['touko', 'yogarasu'] }
      ],
      radio: [
        { at: 'start', who: 'touko', text: '修の Z、八重樫チューン。全開で行きます！' },
        { at: 'close', who: 'touko', text: '……見える。ブレーキを踏むタイミングまで、まるで兄さんみたい。' },
        { at: 'overtook', who: 'touko', text: '前に出た……！ 今度こそ、止まって！' }
      ],
      post: [
        { narr: '黒いポルシェは、大黒パーキングで静かに停まった。運転席のドアが開き、一人の男が降りてきた。' },
        ['touko', '……あ。え……？', 'emo:shock flash'],
        { narr: '白衣ではなく黒いレーシンググローブ。それでも、トウコが見間違えるはずはなかった。' },
        ['shindo', '……見つかってしまいましたね、神崎さん。', 'right emo:sad'],
        ['touko', '真堂……先生？ どうして。', 'emo:shock']
      ] }),

    S({ id: 's2_16', ch: '5', title: 'あの夜の道', track: 'highway', mode: 'time', laps: 1, car: 'z31t', goal: { type: 'lap', factor: 0.72 }, reward: 5000,
      scene: [
        { bg: 'highway' },
        ['shindo', '八月十一日の夜、私は非番でした。ここで、走っていた。……あの日も。', 'right emo:sad'],
        ['shindo', '大黒ジャンクションの手前。赤いスーパーカーが、一台の Z を、後ろから追っていた。'],
        ['shindo', '修くんは、必死でした。ミラーを何度も見て、右へ左へ、振り切ろうとして。……私は、横に並んだ。「逃げろ」と叫んだ。'],
        ['touko', '兄は、逃げてたんですね。……何かから。', 'emo:sad'],
        ['shindo', '次の瞬間、カウンタックが彼の Z の後部に接触した。弾かれて、壁に。……音が、今でも耳から離れない。', 'emo:sad shake'],
        ['shindo', '私は車を止めて、彼を引きずり出した。公衆電話で一一九番して、……そして、自分の病院へ。'],
        ['shindo', '運び込まれたとき、私は初めて気づいたんです。彼が、神崎さんの兄だと。……あなたの、お兄さんだと。', 'emo:sad'],
        ['touko', '……あの夜の当直医は、先生でした。手が、震えてた。ずっと不思議だったんです。', 'emo:sad'],
        ['shindo', '救えなかった。私が、もう少し速く走っていれば。……あなたに合わせる顔がなくて、黙っていました。', 'emo:sad lines'],
        ['touko', '……走ります。あの夜の道。先生が、見た景色を、私にも見せてください。', 'emo:cool']
      ],
      radio: [
        { at: 'start', who: 'shindo', text: '大黒の手前の長い右カーブ。そこが、あの場所です。' },
        { at: 'final', who: 'touko', text: '……ここで。ここで、兄さんは。' }
      ],
      post: [
        { narr: '大黒ジャンクションの右カーブ。ガードレールは新しく塗り替えられていたが、一か所だけ、色が違っていた。' },
        ['touko', '……兄さん。ここで、頑張ったんだね。', 'emo:sad'],
        ['shindo', '神崎さん。……責めてください。いくらでも。', 'emo:sad'],
        ['touko', '責めません。……ありがとう、先生。兄さんを、一人にしないでくれて。', 'emo:smile flash'],
        ['shindo', '……っ。', 'emo:sad']
      ] }),

    S({ id: 's2_17', ch: '5', title: '最後の一本', boss: 'yogarasu', track: 'ridge', mode: 'duel', laps: 3, pace: 0.97, car: 'z31t', goal: { type: 'win' }, reward: 6000,
      scene: [
        { bg: 'ridge' },
        ['shindo', '一つ、お願いがあります。……私と、走ってください。', 'right emo:cool'],
        ['touko', '今、ですか。', 'emo:shock'],
        ['shindo', '修くんが亡くなる前の夜、彼は私に勝負を挑んできました。「僕が勝ったら、あなたに預けたい物がある」と。'],
        ['shindo', '勝負は、決着がつかなかった。彼はそのまま、あの夜に向かってしまった。……だから、決着をつけたい。'],
        ['touko', '兄さんの、代わりに。……私が、先生と。', 'emo:cool'],
        ['shindo', '私に勝てなければ、久我の側にも、後藤にも、勝てません。……本気で行きます。', 'emo:angry lines'],
        { vs: ['touko', 'shindo'] }
      ],
      radio: [
        { at: 'start', who: 'shindo', text: '三周です。遠慮なく、来なさい。' },
        { at: 'close', who: 'shindo', text: '……いいブレーキだ。修くんより、ずっと思い切りがいい。' },
        { at: 'overtook', who: 'touko', text: '兄さん、見てて！' }
      ],
      post: [
        ['shindo', '……参りました。完敗です。', 'emo:smile'],
        ['shindo', '修くんが言っていました。「妹は、僕より度胸がある」。……本当だった。', 'emo:smile'],
        ['touko', 'それ、ヤエさんからも聞きました。兄さん、私のこと、あちこちで自慢してたんですね。', 'emo:smile'],
        ['shindo', '一緒に聴きましょうか。あのテープを。……今度は、私も逃げません。', 'emo:cool']
      ] }),

    /* ===================== 最終章 ===================== */
    S({ id: 's2_18', ch: '6', title: '久我の罠', track: 'neon', mode: 'elim', rivals: 6, pace: 0.95, car: 'z31t', goal: { type: 'survive' }, reward: 6500,
      scene: [
        { title: '最終章', sub: '環状線の夜明け' },
        { bgm: 'tension' },
        { bg: 'neon' },
        { narr: '八重樫モータースのシャッターが、何者かに壊された。テープは、無事だった。トウコが持ち歩いていたからだ。' },
        ['yaegashi', '店はいいさ。命より大事な物はないよ。……それより、あんたが狙われてる。', 'right emo:angry'],
        ['kurosawa', '久我が動いた。今夜、湾岸線を封鎖して、君の車を捕まえるつもりだ。', 'emo:cool'],
        ['jin', '湾岸の走り屋、総出で道を作る！ 俺たちが、囮になって奴らを引きつける！', 'emo:smile shake'],
        ['mari', 'トウコ、一番後ろから抜けて。みんなで道を空ける！', 'emo:smile'],
        ['touko', '……みんな。ありがとう。……絶対、ここを突破する。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'jin', text: '先に行け！ 背中は俺たちが守る！' },
        { at: 'overtook', who: 'mari', text: 'いいよ、その調子！ 道は空いてる！' },
        { at: 'final', who: 'kurosawa', text: '警察無線で、追手の動きを流す。……あと少しだ！' }
      ],
      post: [
        ['jin', 'やった！ 突破したぜ！', 'right emo:smile'],
        ['kurosawa', '追手は撒いた。だが、後藤は別ルートで動いている。……やつは、ケリをつけたがっている。', 'emo:cool'],
        ['touko', '……私も、同じです。', 'emo:cool lines']
      ] }),

    S({ id: 's2_19', ch: '6', title: '二台の夜', boss: 'goto', track: 'highway', mode: 'sp', pace: 1.0, traffic: 8, car: 'z31t', goal: { type: 'win' }, reward: 7000,
      scene: [
        { bgm: 'tension' },
        { bg: 'highway' },
        ['goto', '来たか。……黒いポルシェも、一緒か。', 'right emo:cool'],
        ['shindo', '後藤さん。あなたは、あの夜、本当に彼を殺すつもりがなかったんですか。', 'emo:cool'],
        ['goto', '……久我さんに言われたのは、「Z を止めろ」だけだった。あんなスピードで、あんな場所だとは。', 'emo:sad'],
        ['goto', 'でも、遅かった。……もう、戻れない。俺は、走るしか、能がない。', 'emo:sad'],
        ['touko', '戻れます。……今夜、全てを話してくれるなら。私と、勝負してください。', 'emo:cool'],
        ['goto', '……ははっ。いい女だ。神崎修の、妹だな。', 'emo:smile'],
        ['goto', '最後の勝負だ。……これで負けたら、俺は、お前に従おう。', 'emo:angry lines'],
        { vs: ['touko', 'goto'] }
      ],
      radio: [
        { at: 'start', who: 'goto', text: '湾岸の夜は短い。……行くぞ！' },
        { at: 'close', who: 'shindo', text: '神崎さん、後ろは私が見ています。前だけを見て！' },
        { at: 'overtook', who: 'touko', text: '兄さんの Z は、まだ終わってない！' }
      ],
      post: [
        ['goto', '……見事だ。負けたよ。', 'emo:smile'],
        ['goto', 'テープを渡せ。……いや、違う。そうじゃない。俺が、警察に出頭する。久我さんの命令だったと、全て話す。', 'emo:sad'],
        ['kurosawa', '……その言葉、聞いたぞ。後藤。', 'right emo:cool'],
        ['goto', '黒沢さんか。……ああ。連れて行ってくれ。', 'emo:sad']
      ] }),

    S({ id: 's2_20', ch: '6', title: '夜明けの逃走', boss: 'goto', track: 'highway', mode: 'chase', pace: 0.95, traffic: 10, car: 'z31t', goal: { type: 'catch' }, reward: 6500,
      scene: [
        { bg: 'highway' },
        { narr: '出頭する途中の後藤を、久我の差し向けた車が襲った。テープを奪おうとする一団と、後藤の赤いカウンタックが、湾岸線を駆け抜ける。' },
        ['kurosawa', '大変だ！ 後藤が撃たれた！ 彼は、証言用のコピーを持ったまま逃げた！', 'right emo:shock'],
        ['touko', 'コピーは、私の手にもある。でも、それより先に、後藤さんを助けなきゃ。', 'emo:cool'],
        ['shindo', '神崎さん、救急車は私が呼びます。あなたは、追跡を。……止めてください。', 'emo:cool'],
        ['touko', 'はい。体当たりで、確保します。……看護師、舐めないでください。', 'emo:angry lines']
      ],
      radio: [
        { at: 'start', who: 'kurosawa', text: '対象は前方。車線を縫って逃げている！' },
        { at: 'close', who: 'touko', text: 'あと少し……！ 止まって、後藤さん！' },
        { at: 'final', who: 'shindo', text: '血圧が下がっているはずです。急いで！' }
      ],
      post: [
        ['touko', '後藤さん！ しっかりして！ 意識、ありますか！', 'emo:shock'],
        ['goto', '……はは。ナースさんに、介抱されるとは、な。', 'emo:smile'],
        ['shindo', '傷は浅い。大丈夫です。……よく、逃げ切らずに止まってくれましたね。', 'emo:smile'],
        ['kurosawa', '久我興産は、今朝から家宅捜索だ。君たちの証拠が、決め手になった。', 'emo:smile'],
        { narr: '東の空が、ゆっくりと白んでいく。長い夜が、ようやく終わろうとしていた。' }
      ] }),

    S({ id: 's2_21', ch: '6', title: '大観山の朝', track: 'r_turnpike', mode: 'time', laps: 1, car: 'z31t', goal: { type: 'lap', factor: 0.42 }, reward: 8000, final: true,
      scene: [
        { bg: 'forest' },
        { narr: '事件から一週間。新聞の一面には、「東亜信用銀行　不正融資事件」の文字が踊った。' },
        ['shindo', '神崎さん。お兄さんが最後に行きたがっていた場所へ、行きませんか。', 'right emo:smile'],
        ['touko', '……大観山。富士山が見えるところ。', 'emo:smile'],
        ['touko', '兄さん、いつか私を連れて行くって言ってた。「峠の上から見る富士は、東京のどのビルより高い」って。'],
        ['touko', '先生。……テープ、聴きましょう。今日、あの景色のなかで。', 'emo:cool']
      ],
      radio: [
        { at: 'start', who: 'touko', text: '兄さんの Z。ここまで連れてきてくれて、ありがとう。' },
        { at: 'final', who: 'touko', text: '……見えた。兄さん、富士山だよ。' }
      ],
      post: [
        { narr: '朝日の中の富士山は、バブルのビルよりもずっと高く、ずっと静かだった。' },
        { narr: 'カーステレオに、ラベルのないカセットを入れる。ザザ、とノイズが走り、そして、聞き慣れた声がした。' },
        ['shu', '……トウコ。もし、これを聴いているなら、僕はたぶん、ヘマをした。ごめんな。', 'emo:smile flash'],
        ['shu', '銀行の仕事は、全部ここに入ってる。でも、本当に残したかったのは、そこじゃない。'],
        ['shu', 'お前に、ちゃんと言ったことがなかった。……ありがとう。父さんと母さんがいなくなってから、お前がいたから、僕は頑張れた。', 'emo:smile'],
        ['shu', 'Z、乗ってやってくれ。たまには、思いきり走れ。……お前は、僕より速い。', 'emo:smile'],
        ['touko', '……兄さん。……うん。……うん。ちゃんと、走ってるよ。', 'emo:sad'],
        ['touko', '兄さん。私、これからも走る。夜勤明けに、たまにね。', 'emo:smile'],
        ['shindo', '次の夜勤、一緒ですね。', 'emo:smile'],
        ['touko', '先生、救急車より速く走らないでくださいね。', 'emo:smile'],
        { narr: '——湾岸 1989　完。' }
      ] })
  ];

  var SIDE = [
    S({ id: 's2_sq1', after: 's2_3', title: '夜勤明けの救急車', track: 'city', mode: 'time', laps: 1, car: 'ambulance', goal: { type: 'lap', factor: 0.5 }, reward: 1800, char: 'touko_n',
      scene: [
        { bg: 'city' },
        ['hasegawa', '救急隊が足りないの！ 神崎さん、運転できる！？', 'right emo:shock'],
        ['touko', '……できます。この街の道なら、夜の間に全部覚えました。', 'emo:cool'],
        { narr: '患者は、心臓の発作を起こした老人。一分でも早く、病院へ。' }
      ],
      radio: [
        { at: 'start', who: 'shindo', text: '揺らさず、でも急いで。患者さんは寝ている。' },
        { at: 'final', who: 'hasegawa', text: '受け入れ準備できてます！ あと少し！' }
      ],
      post: [
        ['shindo', '……間に合いました。あなたの運転で、ひとり助かった。', 'right emo:smile'],
        ['touko', '兄さんの時は、間に合わなかったから。……今度は、間に合った。', 'emo:sad'],
        ['hasegawa', '神崎さん。あなた、うちの救急車の専属ドライバーになる気はない？', 'emo:smile']
      ] }),
    S({ id: 's2_sq2', after: 's2_5', title: 'ジンの町工場', track: 'canyon', mode: 'race', laps: 2, rivals: 5, pace: 0.86, car: 'z31', goal: { type: 'place', n: 2 }, reward: 2600, char: 'jin',
      scene: [
        { bg: 'canyon' },
        ['jin', 'うちの親父の工場が、売りに出されるかもしれねえ。久我興産に目をつけられた。', 'right emo:sad'],
        ['jin', 'でもな、最後まで走るぜ。俺は、町工場の誇りを背負って、湾岸を走ってるんだ。'],
        ['touko', '私にできることが、あれば言ってください。', 'emo:cool'],
        ['jin', 'じゃあ今夜、俺の車の後ろを走れ。……親父に、湾岸のスピードを見せてやりてえんだ。', 'emo:smile']
      ],
      radio: [{ at: 'overtook', who: 'jin', text: 'いいぞ！ 町工場の意地、見せてやれ！' }],
      post: [['jin', 'ありがとな。……親父、スタンドで見ててくれた。「速えじゃねえか」って、笑ってた。', 'emo:smile']] }),
    S({ id: 's2_sq3', after: 's2_8', title: 'マリの引っ越しトラック', track: 'r_tsubaki', mode: 'time', laps: 1, car: 'pickup', goal: { type: 'lap', factor: 0.22 }, reward: 3000, char: 'mari',
      scene: [
        { bg: 'forest' },
        ['mari', 'あたしの会社のトラック、一台貸してあげる。……いつもの荷物の気持ちで、走ってみな。', 'right emo:smile'],
        ['mari', '荷物を傷つけない運転ってのはね、実は、一番速い走り方なんだよ。', 'emo:cool'],
        ['touko', '丁寧に、でも急ぐ。……救急車と同じですね。', 'emo:smile']
      ],
      radio: [{ at: 'final', who: 'mari', text: 'ほらね、揺れてないでしょ？ それが、プロの運転。' }],
      post: [['mari', '修にも、同じこと教えたんだ。あいつ、「荷物は命ですね」って言ってた。', 'emo:smile']] }),
    S({ id: 's2_sq4', after: 's2_10', title: '八重樫の若いころ', boss: 'yaegashi', track: 'r_usui', mode: 'touge', pace: 0.95, car: 'z31', goal: { type: 'win' }, reward: 3500, char: 'yaegashi',
      scene: [
        { bg: 'forest' },
        ['yaegashi', '昔、あたしも碓氷を走ってた。女だからって、誰も相手にしなかった時代にね。', 'right emo:cool'],
        ['yaegashi', 'だからメカニックになった。男どもの車を、あたしが速くしてやるって。'],
        ['yaegashi', '一本だけ、付き合いな。あたしの最後の峠だ。', 'emo:cool lines'],
        { vs: ['touko', 'yaegashi'] }
      ],
      radio: [{ at: 'close', who: 'yaegashi', text: 'ふん……やるじゃないか。' }],
      post: [['yaegashi', '……負けたよ。最後に、いい峠だった。', 'emo:smile'], ['touko', 'ヤエさん、たばこ、やめてくださいね。看護師として言ってます。', 'emo:smile']] }),
    S({ id: 's2_sq5', after: 's2_13', title: 'ジンの最後の夏', boss: 'jin', track: 'tomei', mode: 'sp', pace: 0.93, traffic: 10, car: 'z31t', goal: { type: 'win' }, reward: 3000, char: 'jin',
      scene: [
        { bg: 'highway' },
        ['jin', '俺、来月から親父の工場を継ぐ。走り屋は卒業だ。', 'right emo:cool'],
        ['jin', '最後に、修の妹と本気で一本。……いいだろ？', 'emo:smile'],
        { vs: ['touko', 'jin'] }
      ],
      radio: [{ at: 'ahead', who: 'jin', text: '……ああ、速えな。夏が終わるみてえだ。' }],
      post: [['jin', 'ありがとな。……修にも、こうやって負けたかったぜ。', 'emo:smile']] }),
    S({ id: 's2_sq6', after: 's2_21', title: '修の走り', boss: 'shu', track: 'r_tsukuba', mode: 'duel', laps: 3, pace: 0.96, car: 'z31t', goal: { type: 'win' }, reward: 5000, char: 'shu',
      scene: [
        { bg: 'circuit' },
        { narr: '八重樫の店に残っていた、一本のビデオテープ。修が筑波で走った、最後の練習の映像だった。' },
        ['yaegashi', 'ゴーストってやつだ。修の走りを、Z に覚えさせた。', 'right emo:cool'],
        ['touko', '……兄さん。一緒に走ろう。', 'emo:smile lines'],
        { vs: ['touko', 'shu'] }
      ],
      radio: [{ at: 'overtook', who: 'touko', text: '兄さん……私、ここまで来たよ。' }],
      post: [{ narr: 'ビデオの最後に、修の声が残っていた。' }, ['shu', '……トウコ。お前の方が、きっと速いよ。', 'emo:smile flash'], ['touko', '……うん。', 'emo:sad']] })
  ];

  R.STORIES = R.STORIES || [];
  R.STORIES.push({ id: 's2', name: { ja: 'ストーリー2　湾岸 1989', en: 'Story 2: Wangan 1989' }, hero: 'touko', era: '1989 年（平成元年）', place: '東京・首都高／箱根・群馬',
                   desc: { ja: '亡き兄の Z で夜の高速を走る看護師トウコ。兄はなぜ死んだのか。黒いポルシェ「夜鴉」の正体と、兄が遺したカセットテープの秘密。', en: "A nurse drives her late brother's Z through the Tokyo night to learn why he died — and who the black Porsche really is." },
                   chapters: CH, events: EV, side: SIDE, filter: 'sepia(0.12) saturate(1.15) hue-rotate(-6deg) contrast(1.05)' });
})();
