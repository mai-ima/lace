/*
 * race-story5c.js — ストーリー5「グリッドの向こうの夏」  その 3 / 3
 * 第四章（全国への道）・最終章（グリッドの向こう）・サイド・6 つのエンディング・登録
 */
(function () {
  'use strict';
  var R = window.TB.Race, P = R.S5, EV = P.EV, SIDE = P.SIDE, CH = P.CH, S = P.S;

  EV.push(
    /* ===================== 第四章 ===================== */
    S({ id: 's5_t15', ch: '4', title: '全国への道', talk: true, track: 'circuit', goal: { type: 'talk' }, reward: 1200,
      scene: [
        { title: '全国への道', sub: '第四章' },
        { bg: 'coast' },
        { narr: '県大会の翌週。全国大会は、八月の終わり、三重県の鈴鹿サーキット・カート場。部員たちは、マイクロバスで、会場の下見に向かった。' },
        { narr: '窓の外を、浜名湖の水面が、流れていく。ユウタが、後ろの席で、コナツと、お菓子を取り合っていた。' },
        ['akane', '……ハルカちゃん。ちょっと、隣、いい？', 'right emo:cool'],
        { narr: 'アカネは、窓の外を見たまま、ぽつりと言った。いつもの凛とした声が、少しだけ、揺れていた。' },
        ['akane', '私ね。東京の大学の、工学部を、受けようと思ってる。……カートの、車体設計を、勉強したくて。', 'emo:cool'],
        ['haruka', '東京……。じゃあ、部活は。', 'emo:shock'],
        ['akane', '全国が、最後の大会。……そのあとは、受験。だから、この夏が、私の、全部なの。', 'emo:smile'],
        { when: 'senpai', lines: [
          ['akane', 'あなたが、県大会前に、私に、頼ってくれたでしょう。……あれ、嬉しかった。先輩に、なれた気がしたの。', 'emo:smile'],
          ['haruka', '先輩は、ずっと、私の先輩です。……東京に行っても。', 'emo:smile flash']
        ], otherwise: [
          ['akane', 'あなたは、何でも、一人で、抱え込むから。……最後くらい、先輩を、頼って、ほしかったな。', 'emo:sad'],
          ['haruka', '……すみません。次は、ちゃんと、頼ります。', 'emo:sad']
        ] },
        { narr: '会場の下見。鈴鹿のカート場は、潮見台の、倍以上の幅があった。観客席。計時塔。何もかもが、大きかった。' },
        ['koki', 'うわー……でけえな。俺、全国は、初めてなんだ。', 'right emo:shock'],
        { narr: 'コウキが、右手を、ズボンのポケットに、隠した。ハルカは、その動作を、見逃さなかった。' },
        ['kishimoto', '……お前たち。ここは、私が、昔、走った、コースだ。', 'right emo:cool'],
        ['koki', 'え。先生が！？', 'emo:shock'],
        ['kishimoto', '二十年前。私は、ここで、全国の決勝を、走った。……最終コーナーで、転倒して、ゴールできなかった。', 'emo:cool'],
        { narr: '岸本先生は、ヘルメットの代わりに、野球帽を、深く被り直した。' },
        ['kishimoto', 'だから、教師に、なったんだ。……私の、できなかったことを、お前たちに、託すために。', 'emo:smile'],
        ['haruka', '（先生にも、グリッドの向こうに、置いてきたものが、あるんだ）', 'emo:smile']
      ] }),

    S({ id: 's5_t16', ch: '4', title: '前夜', talk: true, track: 'circuit', goal: { type: 'talk' }, reward: 1400,
      scene: [
        { bg: 'circuit' },
        { narr: '全国大会前夜。鈴鹿近くの、古い旅館。大部屋で、部員全員が、布団を並べた。' },
        ['yuta', '先輩ー！ 枕投げ、やりましょう！', 'right emo:smile shake'],
        ['konatsu', 'ユウタ、うるさい！ 明日、早いんだから！', 'emo:angry'],
        { narr: '消灯の少し前。ハルカは、一人で、廊下に出た。窓の外に、遠くの、サーキットの照明が、白く、浮かんでいた。' },
        { narr: 'ポケットの中の、祖父の、小さなスパナ。祖父が、亡くなる前の夏に、渡してくれた、お守りだった。' },
        ['haruka', '（……こわい。第一コーナーの時とは、違う怖さ。みんなの、夏を、背負ってる、怖さ）', 'emo:sad'],
        ['minato', '星野さん。……眠れないんですか。', 'right emo:cool'],
        ['haruka', 'ミナト君。……うん。ちょっとだけ。', 'emo:smile'],
        { when: 'friend', lines: [
          ['minato', '僕も、です。……でも、データは、嘘をつきません。星野さんの、ラップは、確実に、速くなってる。', 'emo:smile'],
          ['minato', '……もう一つ。僕、決めたんです。来年、僕も、ドライバーとして、出ます。星野さんと、同じ、コースで。', 'emo:cool lines'],
          ['haruka', '本当！？ ……うん。待ってる。', 'emo:smile flash']
        ], otherwise: [
          ['minato', '僕は、……星野さんに、まだ、うまく、話せていない気がします。データの話しか、できなくて。', 'emo:sad'],
          ['haruka', 'そんなこと、ないよ。ミナト君の、データがあったから、ここまで、来れたんだよ。', 'emo:smile'],
          ['minato', '……ありがとう、ございます。明日、全力で、サポートします。', 'emo:smile']
        ] },
        { when: 'brave', lines: [
          ['haruka', '第一コーナーの、恐怖と、向き合えた。だから、今度の恐怖にも、向き合える。……そんな気がするの。', 'emo:cool']
        ], otherwise: [
          ['haruka', '正直、まだ、コーナーの入口で、ブレーキを、踏み過ぎちゃう時があるの。……明日も、そうかも。', 'emo:sad']
        ] },
        { narr: '廊下の、突き当たり。浴衣姿の、レンが、一人で、立っていた。' },
        ['ren', '……星野さん。僕も、眠れなくて。', 'right emo:cool'],
        { when: 'rival', lines: [
          ['ren', '全国は、県大会とは、違います。知らない選手が、たくさん、います。……僕は、あなたと、同じ側で、戦いたい。', 'emo:smile'],
          ['haruka', '同じ側……？', 'emo:shock'],
          ['ren', '決勝で、僕と、星野さんが、並んだら。……お互いに、全力を、出し合って、それから、握手を、しましょう。', 'emo:smile flash']
        ], otherwise: [
          ['ren', '僕は、勝つことしか、知りません。……あなたに、勝たなければ、僕の存在意義は、ないと、思っていた。', 'emo:sad'],
          ['ren', '……でも、今は、わからなくなりました。勝つって、何なのか。', 'emo:cool']
        ] },
        { narr: '眠れない夜は、長かった。それでも、夜明けは、必ず、やってくる。' }
      ] })
  );

  EV.push(
    S({ id: 's5_9', ch: '4', title: '全国大会・予選', track: 'isetec', mode: 'race', laps: 4, rivals: 9, pace: 0.93, car: 'kart_s3', goal: { type: 'place', n: 4 }, reward: 6000,
      scene: [
        { bgm: 'tension' },
        { bg: 'circuit' },
        { narr: '全国大会、予選。全国から集まった、四十台の、カート。ハルカは、グリッドの、後方から、スタートする。' },
        ['announcer', '全国中学・高校カート選手権、予選第三組。……ジュニアクラス、スタート五分前です。', 'right emo:cool'],
        ['haruka', '（大丈夫。……ミナト君のデータ。アカネ先輩の車体。コウキ先輩のライン。……全部、私の、中にある）', 'emo:cool lines'],
        { narr: 'レッドシグナルが、一つずつ、消えていく。' }
      ],
      radio: [
        { at: 'start', who: 'minato', text: '落ち着いて！ 一周目は、ポジションを、守るだけでいい！' },
        { at: 'damage', who: 'akane', text: '大丈夫！ 車体は、頑丈にしてある！ 続けて！' },
        { at: 'final', who: 'koki', text: '上位四台が、決勝に残れる！ ラスト一周、ハルカ、行けー！' }
      ],
      post: [
        { narr: 'ハルカの、カートは、四位で、ゴールラインを、通過した。決勝進出が、決まった。' },
        ['konatsu', '……やった！ やったあああ！', 'right emo:smile shake'],
        ['ren', '……僕も、決勝です。星野さん。……決勝で。', 'emo:smile']
      ] }),

    S({ id: 's5_t17', ch: '4', title: '決勝前のピット', talk: true, track: 'circuit', goal: { type: 'talk' }, reward: 1500,
      scene: [
        { bg: 'circuit' },
        { narr: '決勝を、三十分後に控えた、ピット。部員全員が、ハルカの、カートの周りに、集まっていた。' },
        ['akane', '最後の、調整。……ギア比は、このまま。タイヤの空気圧は、ミナト君の、数字で。', 'right emo:cool'],
        ['minato', '路面温度、三十八度。……空気圧、〇・一、下げましょう。', 'emo:cool'],
        { when: 'secret', lines: [
          ['koki', 'ハルカ。……俺の手首のこと、黙っててくれて、ありがとな。', 'emo:smile'],
          ['koki', '決勝は、お前の走りに、全部、預ける。……もう、いい。俺は、お前の、先輩で、よかった。', 'emo:smile flash']
        ], otherwise: [
          ['koki', '俺は、全国は、見るだけに、しとくよ。……手首は、もう、限界だった。先生にも、みんなにも、バレたしな。', 'emo:sad'],
          ['koki', 'でも、悔いは、ない。ハルカ、俺の分も、頼んだ。', 'emo:smile']
        ] },
        { narr: 'ヘルメットを、被る前に、ハルカは、祖父の、スパナを、シートの下に、そっと、貼り付けた。' },
        ['kishimoto', '星野。……楽しんで、こい。それが、一番、速い。', 'emo:smile'],
        ['haruka', 'はい！ ……行ってきます！', 'emo:smile flash']
      ] })
  );

  /* ===================== 最終章 ===================== */
  EV.push(
    S({ id: 's5_10', ch: '5', title: '全国決勝', boss: 'ren', track: 'fujisp', mode: 'duel', laps: 5, pace: 1.04, car: 'kart_s3', goal: { type: 'win' }, reward: 10000, unlock: 'kart_s3',
      scene: [
        { title: 'グリッドの向こう', sub: '最終章' },
        { bgm: 'final' },
        { bg: 'circuit' },
        { narr: '全国決勝。スタンドの、最前列に、潮見台学園の、部員と、家族と、校長先生の姿があった。垂れ幕には、大きく、「ハルカ、グリッドの、向こうへ」。' },
        ['announcer', '……ポールポジション、藤堂レン、潮見台学園。二番手、星野ハルカ、潮見台学園。……同じ学校の、二人です！', 'right emo:shock'],
        ['ren', '星野さん。……手加減は、一切、なしです。', 'emo:cool'],
        ['haruka', '望むところです。……藤堂さん。いえ、レン。……全力で、行こう。', 'emo:cool lines flash'],
        { vs: ['haruka', 'ren'] }
      ],
      radio: [
        { at: 'start', who: 'minato', text: 'S字の出口、右から！ 藤堂さんは、内側を、狙ってる！' },
        { at: 'overtaken', who: 'akane', text: '大丈夫、まだ、離れてない！ 次の、ヘアピンで！' },
        { at: 'close', who: 'ren', text: '……ついてくる。これが、星野さんの、本当の走りか。' },
        { at: 'final', who: 'koki', text: 'ラスト一周！ グリッドの向こうで、待ってるぞ、ハルカ！' }
      ],
      post: [
        { narr: 'チェッカーフラッグが、振られた。二台は、並んで、ゴールラインに、飛び込んだ。ハルカの、カートの、ノーズが、わずかに、先だった。' },
        ['announcer', '——優勝！ 潮見台学園、星野ハルカ！ 全国中学・高校カート選手権、ジュニアクラス！ 史上最年少の、優勝です！', 'right emo:smile shake flash'],
        { narr: 'ハルカは、コース上で、マシンを止めた。ヘルメットを脱ぐと、汗と涙で、顔が、ぐしゃぐしゃだった。' },
        ['ren', '……完敗、です。……ありがとう、星野さん。', 'emo:smile'],
        ['haruka', 'こっちこそ。……レンが、いたから、ここまで、来れた。', 'emo:smile']
      ] }),

    S({ id: 's5_t18', ch: '5', title: '表彰式のあと', talk: true, track: 'circuit', goal: { type: 'talk' }, reward: 3000, final: true,
      scene: [
        { bg: 'coast' },
        { narr: '表彰式のあと。夕暮れの、鈴鹿の、パドック。ハルカは、トロフィーを、胸に抱えて、一人、ベンチに座っていた。' },
        ['kishimoto', '星野。……ここ、いいか。', 'right emo:smile'],
        ['haruka', '先生。……先生が、二十年前に、置いてきたもの。私、拾えましたか？', 'emo:smile'],
        ['kishimoto', '……ああ。完璧にな。……私は、今日、ようやく、あの最終コーナーを、走り終えた気がする。', 'emo:smile flash'],
        { narr: '岸本先生は、そっと、ハンカチで、目頭を押さえた。' },
        ['principal', '（拍手しながら）星野さん、おめでとう。……カート部の、存続、決定です。それどころか、来年度から、「モータースポーツ科学」の、選択授業を、新設します。', 'right emo:smile'],
        ['haruka', 'えっ。……本当ですか！？', 'emo:shock'],
        { narr: '夕焼けの空に、グリッドの、白線が、浮かんで見えた。スタートした、あの日。恐怖の、先にあった、景色。' },
        ['haruka', '……おじいちゃん。見てた？ グリッドの向こう、私、行けたよ。', 'emo:smile'],
        { narr: '胸ポケットの、スパナが、夕陽を、反射して、小さく、光った。' }
      ] })
  );

  /* ===================== サイド ===================== */
  SIDE.push(
    S({ id: 's5_sq1', after: 's5_2', title: 'コナツの応援歌', track: 'circuit', mode: 'time', laps: 1, car: 'kart_s1', goal: { type: 'lap', factor: 0.46 }, reward: 1500, char: 'konatsu',
      scene: [
        { bg: 'circuit' },
        ['konatsu', 'ハルカ、見て！ 応援団に、頼んで、応援歌を、作ってもらったの！', 'right emo:smile'],
        ['haruka', 'ええっ。恥ずかしいよ！', 'emo:shock'],
        ['konatsu', '歌に、合わせて、走ってみて！ リズムに、乗るのが、コツ！', 'emo:smile lines']
      ],
      radio: [{ at: 'final', who: 'konatsu', text: 'いいよ、いいよ、ハルカ！ ラストー！' }],
      post: [['konatsu', '今の、走り、すっごく、リズムが、良かった！ 本番も、この歌で、行こう！', 'emo:smile']] }),
    S({ id: 's5_sq2', after: 's5_4', title: 'ユウタの特訓', track: 'isetec', mode: 'race', laps: 2, rivals: 4, pace: 0.8, car: 'kart_s1', goal: { type: 'place', n: 2 }, reward: 2000, char: 'yuta',
      scene: [
        { bg: 'circuit' },
        ['yuta', 'ハルカ先輩……いや、同期！ 俺と、勝負してください！ 俺、強くなりたいんす！', 'right emo:angry'],
        ['haruka', 'いいよ。ユウタ君が、本気なら、私も、本気で、行く。', 'emo:cool']
      ],
      radio: [{ at: 'close', who: 'yuta', text: 'うおおお！ 負けねえっす！' }],
      post: [['yuta', 'うう……負けたっす。でも、楽しかったっす！ 来年は、勝ちますから！', 'emo:smile']] }),
    S({ id: 's5_sq3', after: 's5_6', title: 'アカネ先輩の車体', boss: 'akane', track: 'circuit', mode: 'duel', laps: 3, pace: 0.9, car: 'kart_s2', goal: { type: 'win' }, reward: 3200, char: 'akane',
      scene: [
        { bg: 'circuit' },
        ['akane', 'ハルカちゃん。……最後に、一度だけ、本気で、走らせて。先輩として、ね。', 'right emo:cool'],
        ['haruka', '……はい。胸を、お借りします。', 'emo:cool'],
        { vs: ['haruka', 'akane'] }
      ],
      radio: [{ at: 'close', who: 'akane', text: '……やるじゃない。でも、まだよ！' }],
      post: [['akane', '……強くなったわね。私の、自慢の後輩よ。', 'emo:smile']] }),
    S({ id: 's5_sq4', after: 's5_8', title: 'コウキ先輩の最後の一周', boss: 'koki', track: 'isetec', mode: 'duel', laps: 3, pace: 0.9, car: 'kart_s2', goal: { type: 'win' }, reward: 3500, char: 'koki',
      scene: [
        { bg: 'circuit' },
        ['koki', 'ハルカ。……最後に、一回だけ、俺と、走ってくれ。部長として、お前に、見せたいんだ。', 'right emo:cool'],
        { narr: 'コウキの右手には、テーピングが、何重にも、巻かれていた。それでも、その目は、真っ直ぐだった。' },
        { vs: ['haruka', 'koki'] }
      ],
      radio: [{ at: 'final', who: 'koki', text: '……ありがとな、ハルカ。いい、最後の、一周だ。' }],
      post: [['koki', '……ははっ。やっぱり、お前は、速いな。……全国、頼んだぞ。', 'emo:smile']] }),
    S({ id: 's5_sq5', after: 's5_t16', title: 'ミナトの夜間データ取り', track: 'circuit', mode: 'time', laps: 2, car: 'kart_s3', goal: { type: 'lap', factor: 0.6 }, reward: 3000, char: 'minato',
      scene: [
        { bg: 'circuit' },
        ['minato', '星野さん。……明日の、本番前に、もう一度だけ、データを、取らせてください。', 'right emo:cool'],
        ['haruka', 'うん。……何周でも、付き合うよ。', 'emo:smile']
      ],
      radio: [{ at: 'final', who: 'minato', text: '……最高の、データです。明日は、必ず、勝てます。' }],
      post: [['minato', '……ありがとうございます。僕は、この夏を、一生、忘れません。', 'emo:smile']] })
  );

  /* ===================== エンディング ===================== */
  var ENDINGS = [
    { id: 'peak', name: { ja: 'グリッドの頂点', en: 'The Summit of the Grid' }, hint: { ja: '恐怖に向き合い、仲間とライバルを信じ抜いた夏', en: '' }, when: 'brave && friend && senpai && rival',
      scene: [
        { bg: 'coast' },
        { narr: '——翌年の春。潮見台学園の坂道に、また、桜の花びらが降っていた。' },
        { narr: 'カート部の、部室の前には、新入部員の、長い列。校長先生が、「モータースポーツ科学」の、第一回の授業を、始めていた。' },
        ['minato', '星野さん……いえ、キャプテン。新入部員の、登録、全部、終わりました。', 'right emo:smile'],
        ['haruka', 'ありがとう、ミナト君。……もう、「君」づけは、やめない？', 'emo:smile'],
        { narr: 'ミナトは、ドライバー登録を、済ませていた。今年の県大会の、ジュニアクラスには、ハルカと、ミナトと、レンが、並んで、エントリーする。' },
        { narr: 'アカネは、東京の大学で、車体設計を、学んでいる。毎月、研究室の、新しい図面を、写真つきで、送ってくる。' },
        { narr: 'コウキは、手首の手術を、成功させた。今は、マネージャーとして、部員たちに、檄を、飛ばしている。' },
        ['ren', '星野さん。……今年は、僕が、勝ちます。', 'emo:smile'],
        ['haruka', '望むところ。……何度でも、受けて立つよ。', 'emo:smile flash'],
        { narr: '赤い屋根の下、七番のカートに、ハルカは、そっと、触れた。ポケットの中の、祖父の、スパナ。' },
        { narr: 'グリッドの向こうには、いつだって、次のグリッドが、待っている。——その先へ。' },
        { narr: '——グリッドの向こうの夏　グリッドの頂点　完。' }
      ] },
    { id: 'rivals', name: { ja: '同じ空の下で', en: 'Under the Same Sky' }, hint: { ja: 'レンと、本当のライバルになる', en: '' }, when: 'rival && friend',
      scene: [
        { bg: 'circuit' },
        { narr: '——それから、三年後。夏の、全日本ジュニア・カート選手権。' },
        { narr: '表彰台の一番上には、ハルカ。二番目には、レン。三番目には、ミナト。三人とも、潮見台の、ユニフォームだった。' },
        ['ren', '……また、負けた。これで、通算、七勝、七敗。', 'emo:smile'],
        ['haruka', '次は、レンが、八勝目だね。', 'emo:smile'],
        ['minato', '二人とも、データに、頼りすぎです。……いえ、僕が、言うのも、変ですが。', 'emo:smile'],
        { narr: '観客席で、コナツが、応援歌を、歌っていた。ユウタが、旗を、振り回していた。' },
        { narr: '同じ空の下で、走り続ける。——勝っても、負けても、隣には、仲間がいる。' },
        { narr: '——グリッドの向こうの夏　同じ空の下で　完。' }
      ] },
    { id: 'study', name: { ja: '受験生の夏', en: 'An Exam Summer' }, hint: { ja: '勉強と部活を両立し、進学を選ぶ', en: '' }, when: 'study',
      scene: [
        { bg: 'coast' },
        { narr: '——全国大会のあと。ハルカは、カートを、いったん、置いた。' },
        { narr: '潮見台学園の、図書室。机の上には、過去問と、物理の参考書。隣には、同じように、勉強するミナト。' },
        ['haruka', '……車体設計、って、物理が、こんなに、必要なんだね。', 'emo:smile'],
        ['minato', 'アカネ先輩の、受けた、大学ですね。……星野さんなら、行けますよ。', 'emo:smile'],
        { narr: '春。ハルカは、東京の大学の、工学部に、合格した。入学式の日、校門の前に、アカネが、待っていた。' },
        ['akane', 'おかえりなさい、後輩。……ここから、また、一緒に、グリッドに、並びましょう。', 'emo:smile flash'],
        { narr: '走ることと、学ぶこと。二つの夏が、ハルカの、これからを、支えていく。' },
        { narr: '——グリッドの向こうの夏　受験生の夏　完。' }
      ] },
    { id: 'duo', name: { ja: 'ミナトとの二人乗り', en: 'Two-Seater with Minato' }, hint: { ja: 'ミナトを信じ、二人で夢を追う', en: '' }, when: 'friend',
      scene: [
        { bg: 'circuit' },
        { narr: '——大会の翌年。ハルカとミナトは、二人で、小さな、チームを、立ち上げた。名前は、「グリッド・ツー」。' },
        { narr: 'ハルカが、ドライバー。ミナトが、データ解析と、メカニック。放課後の、赤い屋根の下が、二人の、研究所になった。' },
        ['minato', '……星野さん。次の、セッティング、ちょっと、変わった提案、していいですか。', 'emo:smile'],
        ['haruka', 'もちろん。ミナトの提案は、いつも、面白いから。', 'emo:smile flash'],
        { narr: '二人は、いつか、本物の、レーシングチームを、作ると、約束した。' },
        { narr: '——グリッドの向こうの夏　ミナトとの二人乗り　完。' }
      ] },
    { id: 'alone', name: { ja: '廃部の夕暮れ', en: 'Sunset of the Disbanded Club' }, hint: { ja: '誰にも頼れなかった夏の、苦い結末', en: '' }, when: '!friend && !senpai && !rival',
      scene: [
        { bg: 'coast' },
        { narr: '——全国大会は、ハルカにとって、悔しい結果に、終わった。結局、一人で、走り切ろうとした、夏だった。' },
        { narr: '秋。三年生の引退で、部員が、数人に、減った。校長先生は、静かに、「カート部の、休部」を、告げた。' },
        ['haruka', '……私が、もっと、みんなに、頼っていれば。', 'emo:sad'],
        { narr: '赤い屋根の整備小屋には、鍵が、かけられた。夕暮れの校庭に、七番のカートが、ぽつんと、置かれていた。' },
        ['konatsu', 'ハルカ。……まだ、終わりじゃないよ。来年、また、新しい部員を、集めようよ。', 'emo:smile'],
        { narr: 'ハルカは、頷いた。夕陽の中、ポケットの、スパナを、握りしめた。' },
        { narr: '——グリッドの向こうの夏　廃部の夕暮れ　完。' }
      ] },
    { id: 'last', name: { ja: '最後の一周', en: 'The Last Lap' }, hint: { ja: '誰かが欠けても、走り続けた夏', en: '' },
      scene: [
        { bg: 'coast' },
        { narr: '——夏の終わり。ハルカの、最後の一周は、夕暮れの、潮見台の、サーキットだった。' },
        { narr: 'ギャラリーは、いない。けれど、コースの縁に、部員たちの、荷物が、並んでいた。みんな、遠くから、見守っていた。' },
        ['haruka', '（……この一周を、一生、忘れない）', 'emo:smile'],
        { narr: 'ゴールラインを、越えた。ヘルメットを、脱ぐ。風が、頬を、撫でた。' },
        ['haruka', 'ありがとう。……また、来年。', 'emo:smile flash'],
        { narr: '——グリッドの向こうの夏　最後の一周　完。' }
      ] }
  ];

  R.STORIES = R.STORIES || [];
  R.STORIES.push({ id: 's5', name: { ja: 'ストーリー5　グリッドの向こうの夏（中高生）', en: 'Story 5: Summer Beyond the Grid' }, hero: 'haruka', era: '2015 年', place: '静岡・潮見台学園／鈴鹿',
                   desc: { ja: '廃部寸前のカート部と、中学三年のハルカ。恐怖、友情、ライバル、受験。仲間との選択で、6 つの結末に分かれる青春の物語。', en: 'A junior-high girl joins a kart club on the brink of closure. Six endings.' },
                   chapters: CH, events: EV, side: SIDE, endings: ENDINGS, filter: 'saturate(1.12) contrast(1.04) brightness(1.02)' });
})();
