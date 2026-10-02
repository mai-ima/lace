/*
 * race-story3.js — ストーリー3「やらまいか 1964 ―浜松から世界へ―」（全面改修版）
 *
 * 1964 年（昭和 39 年）、東京オリンピックの年。静岡県浜松市。
 * オートバイと織機の工場がひしめく「ものづくりの町」で、
 * 小さな町工場「坂下発動機」の見習い・早瀬イチロー（19）は、
 * 亡き父が遺した幻のエンジンと、仲間たちの手作りの車で、鈴鹿の日本グランプリに挑む。
 * 遠州弁の「やらまいか（やってみよう）」を合言葉に。
 *
 * 筋立て
 *   ・坂下発動機は借金で潰れかけ。大手の北斗自動車は、父の設計「SK-4」ごと会社を買い取りたい。
 *   ・父・清造と、北斗の沢木は、戦時中同じ航空エンジンの研究所にいた旧友だった。
 *   ・鈴鹿の前夜に工場が燃える。町じゅうの町工場が、一晩で車を作り直す。
 *   ・日本グランプリで氷室（北斗のワークス）と競い、勝って、会社を守る。
 */
(function () {
  'use strict';
  var TB = window.TB, R = TB.Race, C = R.CHARS, B = R.BOSSES;

  /* ---------- 登場人物 ---------- */
  C.ichiro = { name: 'イチロー', color: '#ffb74d',
               face: { skin: '#e9c09a', hair: '#1a1a1a', style: 'short', eyes: '#2a1a10', acc: 'hachimaki', shirt: '#546e7a', bg: '#2b2418' } };
  C.tome = { name: 'トメ社長', color: '#a1887f',
             face: { skin: '#d8a882', hair: '#eeeeee', style: 'bun', eyes: '#2a1a10', acc: 'glasses', shirt: '#5d4037', bg: '#2a1f18' } };
  C.natsu = { name: 'ナツ', color: '#f48fb1',
              face: { skin: '#f3cfb0', hair: '#2b1b12', style: 'ponytail', eyes: '#3b2a20', acc: 'freckles', shirt: '#90a4ae', bg: '#2b2a36' } };
  C.himuro = { name: '氷室', color: '#80deea',
               face: { skin: '#f0d0b4', hair: '#101010', style: 'pompadour', eyes: '#1a2a3a', acc: 'shades', shirt: '#eceff1', bg: '#12202a' } };
  C.jack = { name: 'ジャック', color: '#c5e1a5',
             face: { skin: '#f7dccb', hair: '#f0d070', style: 'wavy', eyes: '#3a6a9a', acc: 'none', shirt: '#2e7d32', bg: '#16261a' } };
  C.tetsu = { name: '鉄っつぁん', color: '#bcaaa4',
              face: { skin: '#c9966f', hair: '#6d6d6d', style: 'buzz', eyes: '#222', acc: 'scar', shirt: '#3e4a52', bg: '#1a1d20' } };
  C.okawa = { name: '実況・大川アナ', color: '#fff59d',
              face: { skin: '#e8c3a2', hair: '#222', style: 'swept', eyes: '#222', acc: 'glasses', shirt: '#37474f', bg: '#262626' } };
  C.sawaki = { name: '沢木', color: '#90caf9',
               face: { skin: '#e8c8aa', hair: '#2b2b2b', style: 'swept', eyes: '#16283a', acc: 'mustache', shirt: '#eceff1', bg: '#13202e' } };
  C.seizo = { name: '清造（イチローの父）', color: '#ffcc80',
              face: { skin: '#dcae8c', hair: '#222', style: 'short', eyes: '#2a1a10', acc: 'hachimaki', shirt: '#6d6d6d', bg: '#2b2418' } };
  C.mori = { name: '森支店長', color: '#b0bec5',
             face: { skin: '#e8c8aa', hair: '#555', style: 'bald', eyes: '#222', acc: 'glasses', shirt: '#455a64', bg: '#222a30' } };
  C.ichiro_old = { name: 'イチロー（2024 年）', color: '#ffb74d',
                   face: { skin: '#dcae8c', hair: '#f5f5f5', style: 'short', eyes: '#2a1a10', acc: 'glasses', shirt: '#546e7a', bg: '#2b2418' } };

  /* ---------- ボスと車 ---------- */
  B.himuro = { name: 'HIMURO', color: '#eceff1', body: 'classic', ai: 'technician', skill: 1.02, boss: true, ability: 'block' };
  B.sawaki = { name: 'SAWAKI', color: '#90caf9', body: 'classic', ai: 'aggressive', skill: 0.85, boss: true, ability: 'ram' };
  B.jack = { name: 'JACK', color: '#2e7d32', body: 'classic', ai: 'speedster', skill: 1, boss: true, ability: 'burst' };
  B.tetsu = { name: 'TETSU', color: '#8d6e63', body: 'trike', ai: 'technician', skill: 0.9, boss: true, ability: 'block' };
  B.tome = { name: 'TOME', color: '#6d4c41', body: 'keitra', ai: 'technician', skill: 0.95, boss: true, ability: 'block' };
  [
    { id: 'trike3', name: { ja: '三輪トラック（坂下発動機）', en: 'Three-wheeler truck' }, cls: 'D', price: 0, body: 'trike', paint: 7, unlock: true, era: 1964,
      stats: { spd: 3, acc: 4, grp: 4, arm: 6, nit: 3 }, desc: { ja: '工場の配達用。曲がるときは体を傾けろ。', en: 'The factory delivery trike.' } },
    { id: 'saka1', name: { ja: 'サカシタ号（手作り 1 号）', en: 'Sakashita No.1' }, cls: 'C', price: 0, body: 'kei', paint: 7, unlock: true, era: 1964,
      stats: { spd: 5, acc: 6, grp: 6, arm: 4, nit: 5 }, desc: { ja: 'オートバイの 2 気筒エンジンを積んだ手作りの軽自動車。', en: 'A handmade car with a motorcycle twin.' } },
    { id: 'saka2', name: { ja: 'サカシタ GP（1964 年型）', en: 'Sakashita GP (1964)' }, cls: 'A', price: 0, body: 'classic', paint: 1, unlock: true, era: 1964,
      stats: { spd: 8, acc: 8, grp: 8, arm: 5, nit: 7 }, desc: { ja: 'ナツが設計した流線形のボディ。父の SK-4 を積む 4 気筒・4 キャブ。日本グランプリ仕様。', en: "Natsu's streamlined GP car with her father's SK-4." } }
  ].forEach(function (c) { if (!R.CARS.some(function (x) { return x.id === c.id; })) R.CARS.push(c); });

  function S(o) { return o; }

  var CH = [
    { id: '0', name: '序章　やらまいか' },
    { id: '1', name: '第一章　浜名湖の草レース' },
    { id: '2', name: '第二章　峠を越えて' },
    { id: '3', name: '第三章　鈴鹿へ' },
    { id: '4', name: '第四章　日本グランプリ' },
    { id: '5', name: '終章　世界へ（1966）' }
  ];

  var EV = [
    /* ===================== 序章 ===================== */
    S({ id: 's3_1', ch: '0', title: '三輪トラックの配達', track: 'hm_mikata', mode: 'time', laps: 1, car: 'trike3', goal: { type: 'lap', factor: 0.45 }, reward: 500,
      scene: [
        { title: 'やらまいか 1964', sub: '序章　やらまいか' },
        { bg: 'hamamatsu' },
        { narr: '1964 年、春まだ浅い浜松。オリンピックの年というので、町じゅうが、そわそわと浮かれていた。' },
        { narr: '駅前では織機の音。路地ではオートバイのエンジン音。この町では、子どもの子守唄も、ピストンの音だった。' },
        ['tome', 'イチロー！ いつまで寝とるだ！ 午前中に、細江まで部品を届けるだに！', 'right emo:angry'],
        ['ichiro', 'うわっ、社長！ 今行くって！ ……ふあ、まだ五時半ですよ……。', 'emo:shock'],
        ['tome', '「まだ」じゃないよ。「もう」だ。この町の朝は、五時から始まっとる。', 'emo:cool'],
        ['natsu', 'おはよう、イチロー。三輪、ちゃんとオイル入れといたよ。曲がるときは、体を内側に倒してね。', 'emo:smile'],
        ['ichiro', 'ナツ、ありがとな。……よし、行ってくる。「やらまいか」だ！', 'emo:smile'],
        ['tome', '町の人は、うちの部品を待っとる。一分でも遅れたら、その分だけ、誰かの機械が止まるだに。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'tome', text: '三輪は重心が高い。コーナーでは、絶対に慌てないこと。' },
        { at: 'damage', who: 'natsu', text: 'ちょっと！ 荷物、ぶつけてない！？' },
        { at: 'final', who: 'ichiro', text: '見えた、細江の工場！ ……間に合った！' }
      ],
      post: [
        ['ichiro', '納品、完了です！ ……ふう。今日も、無事に着いた。', 'emo:smile'],
        { narr: '帰り道、浜松城の城下に、見慣れない黒塗りの車が止まっていた。ボンネットに、北斗自動車のエンブレム。' },
        ['sawaki', '……坂下発動機の者かね。社長に、お会いしたい。', 'right emo:cool'],
        ['ichiro', '社長？ ……あんた、誰ですか。', 'emo:shock']
      ] }),

    S({ id: 's3_2', ch: '0', title: '集金の夜', track: 'city', mode: 'arcade', laps: 3, traffic: 10, car: 'trike3', goal: { type: 'arcade' }, reward: 1200,
      scene: [
        { bg: 'city' },
        { narr: 'その夜。坂下発動機の事務所で、トメ社長と、銀行の森支店長が向かい合っていた。' },
        ['mori', 'トメさん。浜松信金としても、これ以上は待てません。返済は、五月までに全額。', 'right emo:cool'],
        ['tome', '……五月。二百万円を、か。', 'emo:cool'],
        ['mori', '北斗自動車が、工場ごと買い取りたいと言っています。悪い話では——', 'emo:cool'],
        ['tome', '悪い話だよ。清造さんの工場を、他人に渡すわけにはいかん。', 'emo:angry'],
        { narr: '部屋の外で聞いていたイチローは、拳を握りしめた。' },
        ['ichiro', '社長。俺が、集金に回ります。いままで貸しっぱなしの売掛金を、夜のうちに全部集めてきます。', 'emo:cool'],
        ['natsu', '三軒、まとめて回るなら、時間が勝負。……遠回りしないでね。', 'emo:smile'],
        ['tome', '……頼んだよ、イチロー。でも、無理はするんじゃないよ。', 'emo:smile lines']
      ],
      radio: [
        { at: 'start', who: 'natsu', text: '制限時間は、お店が閉まるまで。チェックポイントごとに、少し延びるから！' },
        { at: 'final', who: 'ichiro', text: '最後の一軒！ ……頼む、間に合ってくれ！' }
      ],
      post: [
        ['ichiro', '集金、全部回ってきました。……でも、目標には、ぜんぜん足りません。', 'emo:sad'],
        ['tome', '十分だよ。あんたが走り回ってくれたことが、うちの宝だ。', 'emo:smile'],
        ['natsu', 'ねえ、イチロー。レースの賞金なら、一晩で二百万にもなる。……考えたこと、ある？', 'emo:cool'],
        { ask: 'ナツの提案に、イチローは？', choice: [
          { t: '「俺が、レースに？ ……やってみたい」', lines: [
            ['ichiro', '俺が、レースに……？ ……正直、ちょっとだけ、ワクワクしてる。', 'emo:smile'],
            ['natsu', 'でしょ！ 顔に書いてあるもん。', 'emo:smile'] ] },
          { t: '「冗談だろ。俺は配達員だ」', lines: [
            ['ichiro', '冗談だろ。俺は、ただの配達員だ。', 'emo:sad'],
            ['natsu', 'ただの配達員が、三輪トラックであんなに速いの？ ……嘘つき。', 'emo:cool'] ] }
        ] },
        ['ichiro', 'レース……？ 俺が？ ははっ、冗談だろ。', 'emo:shock']
      ] }),

    /* ===================== 第一章 ===================== */
    S({ id: 's3_3', ch: '1', title: '湖畔の草レース', track: 'hm_oku', mode: 'race', laps: 1, rivals: 5, pace: 0.8, car: 'saka1', unlock: 'saka1', goal: { type: 'place', n: 3 }, reward: 2500,
      scene: [
        { title: '第一章', sub: '浜名湖の草レース' },
        { bg: 'hamanako' },
        { narr: '五月の日本グランプリまで、あと二か月。浜名湖畔で、町の青年団が開く草レースがあった。' },
        ['natsu', 'これ見て。……「サカシタ号」。オートバイの二気筒を積んだ、わたしたちの手作りの車。', 'right emo:smile'],
        ['ichiro', 'おお……本当に、できたのか！ ナツ、お前、天才か！', 'emo:shock'],
        ['natsu', 'まだ試作だよ。ブレーキは弱いし、直進安定性も、いまひとつ。……だから走って、確かめるの。'],
        ['tome', '賞金は、三位までに出る。工場の修理代にもなるでね。……気をつけて走るだに。', 'emo:cool'],
        ['ichiro', '任せといてください！ 俺、運転なら誰にも負けません。三輪で、鍛えてますから。', 'emo:smile lines']
      ],
      radio: [
        { at: 'start', who: 'natsu', text: 'エンジンは五千五百まで。それ以上は、回さないで！' },
        { at: 'overtook', who: 'tome', text: 'やるじゃないか！ ガソリンも、無駄にするんじゃないよ！' },
        { at: 'final', who: 'natsu', text: 'あと少し！ ゴールまで、ぜんぶ使って！' }
      ],
      post: [
        ['natsu', '三位……！ やった、やったよ、イチロー！ ちゃんと走った！', 'emo:smile shake'],
        ['ichiro', '手作りの車で、表彰台に乗っちまった……。信じられねえ。', 'emo:smile'],
        { narr: '表彰台の隅で、黒塗りの車から降りてきた男が、静かに拍手をしていた。' },
        ['sawaki', '面白い。……その車、もう少し見せてもらえませんか。', 'right emo:cool']
      ] }),

    S({ id: 's3_4', ch: '1', title: 'ワークスの影', boss: 'sawaki', track: 'hm_bypass', mode: 'duel', laps: 1, pace: 0.86, car: 'saka1', goal: { type: 'win' }, reward: 3000,
      scene: [
        { bg: 'hamamatsu' },
        ['sawaki', '北斗自動車、技術部の沢木と言います。……坂下発動機を、うちに迎えたい。', 'right emo:cool'],
        ['tome', 'お断りだって、先月言ったはずだが。', 'emo:angry'],
        ['sawaki', '承知しています。ただ、その車を見て考えが変わった。……なぜ、二気筒でここまで走るのか、理解できない。', 'emo:cool'],
        ['sawaki', '一本、走りませんか。私が勝てば、あなた方の設計図を、拝見したい。', 'emo:angry'],
        ['ichiro', '設計図なんて、ありません。……あったとしても、あんたには見せない。', 'emo:angry lines'],
        { vs: ['ichiro', 'sawaki'] }
      ],
      radio: [
        { at: 'start', who: 'sawaki', text: '浜名バイパスは、高速で長い。……エンジンの耐久力が、そのまま出る。' },
        { at: 'close', who: 'sawaki', text: '……なぜだ。なぜ、その排気量で追いつける。' },
        { at: 'overtook', who: 'ichiro', text: '見たか、町工場の根性！' }
      ],
      post: [
        ['sawaki', '……負けた。素人に、二気筒に。……認めるしかない。', 'emo:sad'],
        ['sawaki', 'だが、一つだけ教えておく。その車の心臓は、「SK-4」の血を引いているな。', 'emo:cool'],
        ['ichiro', '……SK-4？ 何の話ですか。', 'emo:shock'],
        ['sawaki', '知らない、のか。清造さんは、何も話さなかったのか。', 'emo:shock flash'],
        ['tome', '……もう、帰りな、沢木。', 'right emo:angry']
      ] }),

    S({ id: 's3_5', ch: '1', title: '父の設計図', track: 'hm_oku', mode: 'time', laps: 1, car: 'saka1', goal: { type: 'lap', factor: 0.37 }, reward: 2200,
      scene: [
        { bg: 'hamanako' },
        { narr: 'その夜、イチローは眠れなかった。「SK-4」。聞き覚えのない名前が、頭の中で繰り返された。' },
        ['ichiro', '社長。……俺、知りたいです。SK-4って、何ですか。父さんが、何を作ってたんですか。', 'emo:sad'],
        ['tome', '……ずっと、黙ってたんだがね。ついておいで。', 'right emo:cool'],
        { narr: '工場の奥、古い道具箱の底。油紙に包まれた、一冊の設計ノートがあった。' },
        ['seizo', '（ノートの文字）「SK-4。四気筒、二本カム、四連キャブ。……いつか、日本の車が世界で走るとき、この心臓が、先頭を走るように。」', 'emo:smile'],
        ['natsu', 'すごい……。図面のどのページにも、数字がびっしり。戦時中の航空エンジンの設計が、基になってる。', 'emo:shock'],
        ['tome', '清造さんと沢木は、戦争中、同じ研究所にいた。二人とも、空を飛ぶエンジンを作ってたんだよ。', 'emo:cool'],
        ['tome', '清造さんは、戦後それを「人を殺す道具に、二度とさせない」と言って、町に戻った。……沢木は、東京に残った。'],
        ['ichiro', '父さんは、それでも、この設計を捨てなかったんですね。……俺が、この心臓で走らせます。', 'emo:cool lines'],
        ['natsu', 'わたしが、車体を設計する。……イチロー、湖畔の道で、この設計の足回りを確かめて。', 'emo:smile']
      ],
      radio: [
        { at: 'start', who: 'natsu', text: '父さんのノートの通り。コーナーでは、荷重を後ろへ。' },
        { at: 'final', who: 'ichiro', text: '父さん……あんたの心臓、今、走ってるよ。' }
      ],
      post: [
        ['natsu', '足回り、ばっちり！ ノートに書いてある通りの数字が、ほんとうに出てる！', 'emo:smile shake'],
        ['ichiro', '父さん、ほんとに、すごい人だったんだな。', 'emo:smile'],
        ['tome', 'あの人はね、「俺が死んでも、設計は生きる」って、いつも言ってたよ。', 'emo:smile']
      ] }),

    S({ id: 's3_6', ch: '1', title: '遠州灘のスプリント', track: 'hamamatsu', mode: 'race', laps: 3, rivals: 6, pace: 0.86, car: 'saka1', goal: { type: 'place', n: 2 }, reward: 3500,
      scene: [
        { bg: 'coast' },
        { narr: '遠州灘の海岸線に、地元のオートバイ屋と町工場の若者たちが集まった。毎年恒例の、春のスプリント。' },
        ['ichiro', 'すげえ人だかりだな……。みんな、浜松の工場の連中ばっかりだ。', 'emo:shock'],
        ['natsu', 'ここに出る車は、みんな手作り。だから、ズルも、ごまかしも、通用しない。実力だけ。', 'right emo:cool'],
        ['tome', 'この大会で優勝した車は、翌月の鈴鹿の予選に推薦される。……二位以内。それが条件。', 'emo:cool'],
        ['ichiro', '鈴鹿の予選……。やります。絶対に、二位以内。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'tome', text: '海風が横から吹く。ハンドルは、しっかり握って。' },
        { at: 'overtook', who: 'natsu', text: 'いいよ、イチロー！ 今のライン、完璧！' },
        { at: 'final', who: 'natsu', text: 'ラスト一周。二位以内なら、鈴鹿だよ！' }
      ],
      post: [
        ['natsu', 'やった！ 二位以内……鈴鹿の予選に出られる！', 'emo:smile shake'],
        ['tome', 'ふふ。うちの車は、浜松の誇りだよ。よく頑張ったね。', 'emo:smile'],
        ['ichiro', 'でも、この先は、大手のワークスが相手だ。……もっと、速くなりたい。', 'emo:cool']
      ] }),

    /* ===================== 第二章 ===================== */
    S({ id: 's3_7', ch: '2', title: '碓氷の郵便屋', boss: 'tetsu', track: 'r_usui', mode: 'touge', pace: 0.85, car: 'saka1', goal: { type: 'win' }, reward: 2800,
      scene: [
        { title: '第二章', sub: '峠を越えて' },
        { bg: 'forest' },
        { narr: '群馬県、碓氷峠。かつての中山道の難所。百八十四のカーブが続く旧道で、一人の男が待っていた。' },
        ['tetsu', 'あんたが浜松の坂下のイチローか。わしは、郵便配達の鉄っつぁんだ。', 'right emo:cool'],
        ['ichiro', '郵便屋さん……が、俺に何の用で。', 'emo:shock'],
        ['tetsu', 'トメ婆さんから手紙が来てな。「うちの若いの、峠で鍛えてやってくれ」と。……三輪で、碓氷を三十年走ってきた男に、勝てるか？', 'emo:cool'],
        ['tetsu', '郵便ってのは、速けりゃいいもんじゃねえ。「確実に、時間通りに着く」が勝ちだ。それを、教えてやる。', 'emo:angry lines'],
        { vs: ['ichiro', 'tetsu'] }
      ],
      radio: [
        { at: 'start', who: 'tetsu', text: '碓氷の下りは、ブレーキを使うな。エンジンブレーキで、ゆっくり下れ。' },
        { at: 'close', who: 'tetsu', text: 'ほう、ついてくるか。やるな、坊主。' },
        { at: 'overtook', who: 'ichiro', text: '鉄っつぁん、お先に！' }
      ],
      post: [
        ['tetsu', '……ははっ。負けた。おれの三十年が、小僧に追い抜かれたか。', 'emo:smile'],
        ['tetsu', 'でも、勝った負けたより、ずっと大事なことがある。あんたは、峠の先まで、人を連れていける運転をした。', 'emo:smile'],
        ['ichiro', '人を、連れていける……？', 'emo:shock'],
        ['tetsu', 'まあ、鈴鹿でわかる。あんたに、わしのとっておきの走り方を、全部教えてやる。', 'emo:cool']
      ] }),

    S({ id: 's3_8', ch: '2', title: '榛名の夜', track: 'r_haruna', mode: 'time', laps: 1, car: 'saka1', goal: { type: 'lap', factor: 0.27 }, reward: 2400,
      scene: [
        { bg: 'forest' },
        { narr: '榛名山。夜のヘアピン。ヘッドライトの先に、石畳のような路面が、ぼんやりと浮かぶ。' },
        ['tetsu', '夜の峠はな、「見る」んじゃない。「聞く」んだ。エンジンの音と、タイヤの音と。', 'right emo:cool'],
        ['ichiro', '音を……聞く。', 'emo:cool'],
        ['tetsu', '父ちゃんのエンジンはな、清造さんの音がする。わしは、あの人の工場の前を、毎朝通ってた。', 'emo:smile'],
        ['tetsu', 'その音を覚えとる。……そのエンジンが、今の音で鳴ってるなら、ちゃんと走る。信じて、踏め。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'tetsu', text: '音を聞け。エンジンの機嫌が、道を教えてくれる。' },
        { at: 'damage', who: 'tetsu', text: 'おいおい、焦るなって。ゆっくりでいい。' },
        { at: 'final', who: 'tetsu', text: '最後の直線。……清造さんにも、聞かせてやれ。' }
      ],
      post: [
        ['ichiro', 'できました……！ 音で、走れた！', 'emo:smile shake'],
        ['tetsu', '上出来だ。あんたは、もう半分、清造さんの息子じゃない。……車の息子だ。', 'emo:smile'],
        ['ichiro', '鉄っつぁん……ありがとう。', 'emo:smile']
      ] }),

    S({ id: 's3_9', ch: '2', title: '赤城の朝霧', boss: 'jack', track: 'r_akagi', mode: 'touge', pace: 0.88, weather: 'fog', car: 'saka1', goal: { type: 'win' }, reward: 3200,
      scene: [
        { bg: 'forest', weather: 'fog' },
        { narr: '赤城山。朝霧の立ちこめる、静かな山道。一台の見慣れない英国車が、ヘアピンの前で止まっていた。' },
        ['jack', 'オゥ、ごきげんよう！ キミ、日本の車の運転手ですか？ ボク、ジャック・ウィルソン、イギリスから来ました。', 'right emo:smile'],
        ['ichiro', 'イギリス……？ 外人さんが、なんで赤城に。', 'emo:shock'],
        ['jack', 'ボクは、鈴鹿に来た。日本グランプリ。レースは、国境がないスポーツ。……ボクと、一本、走りませんか？', 'emo:smile'],
        ['ichiro', '言葉は半分もわかんねえけど、……勝負なら、受けて立つ。やらまいか！', 'emo:smile lines'],
        { vs: ['ichiro', 'jack'] }
      ],
      radio: [
        { at: 'start', who: 'jack', text: 'ヘイ！ 霧のレース、サイコーです！' },
        { at: 'close', who: 'jack', text: 'アメイジング……！ やりますネ、キミ！' },
        { at: 'overtook', who: 'ichiro', text: 'ごめんな、ジャック！ 先、行かせてもらう！' }
      ],
      post: [
        ['jack', 'ワンダフル！ 負けました。でも、ボク、嬉しい。こんな楽しいレース、イギリスでもありませんでした。', 'emo:smile'],
        ['jack', 'キミ、名前は？', 'emo:smile'],
        ['ichiro', 'イチローだ。浜松の、坂下発動機。', 'emo:smile'],
        ['jack', 'イチロー。覚えました。鈴鹿で、また会いましょう。……本気のキミと、走りたい。', 'emo:cool lines']
      ] }),

    S({ id: 's3_10', ch: '2', title: '焼きつきの妙義', track: 'r_myogi', mode: 'time', laps: 1, car: 'saka1', goal: { type: 'lap', factor: 0.23 }, reward: 3000,
      scene: [
        { bg: 'forest' },
        ['natsu', '耐久テスト。妙義山で、エンジンを壊れる直前まで回して、弱点を見つけるの。', 'right emo:cool'],
        ['ichiro', 'わざと、壊れる寸前まで……ですか。', 'emo:shock'],
        ['natsu', '鈴鹿で壊れたら、全部おしまい。だから今、壊しておくの。……壊れたら、直せばいい。', 'emo:cool'],
        ['tetsu', '失敗しても、また作ればいいんだよ。それが、浜松の人間の強みだ。', 'emo:smile lines']
      ],
      radio: [
        { at: 'start', who: 'natsu', text: '水温を見てて。九十度を超えたら、教えて！' },
        { at: 'damage', who: 'natsu', text: '音が変わった……！ でも、まだいける！' },
        { at: 'final', who: 'natsu', text: '最後まで回して！ 限界を見せて！' }
      ],
      post: [
        ['natsu', '弱点、見つかった。排気側のバルブスプリング。……材質を変えれば、解決できる。', 'emo:smile'],
        ['ichiro', '町中の工場を回って、ばね鋼を探してきます。', 'emo:cool'],
        ['tome', '町の工場は、みんな仲間だよ。きっと、助けてくれるさ。', 'emo:smile']
      ] }),

    /* ===================== 第三章 ===================== */
    S({ id: 's3_11', ch: '3', title: '鈴鹿・予選', track: 'r_suzuka', mode: 'time', laps: 1, car: 'saka2', unlock: 'saka2', goal: { type: 'lap', factor: 0.36 }, reward: 4500,
      scene: [
        { title: '第三章', sub: '鈴鹿へ' },
        { bg: 'circuit' },
        { narr: '五月。鈴鹿サーキット。八の字に交差する、世界でも珍しいコース。' },
        ['okawa', '本日はいよいよ、第二回日本グランプリ予選です！ 全国から、集まった速い車が、ずらりと並んでおります！', 'right emo:smile'],
        ['natsu', 'これが、完成した「サカシタ GP」。……父さんの SK-4 を、流線形のボディに載せたの。', 'emo:smile'],
        ['ichiro', 'こんなに、きれいな車……。俺が、乗っていいのか。', 'emo:shock'],
        ['tome', '「俺が乗らなきゃ、誰が乗る」と言いな。あんたは、坂下発動機の顔だよ。', 'emo:smile'],
        ['himuro', '……あれが、坂下の車か。遅くはなさそうだ。', 'emo:cool'],
        ['ichiro', '氷室……さん。北斗のワークスの、エース。……俺、負けませんから。', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'natsu', text: '第一ヘアピンまでは、アクセルを抜かないで。SK-4 は、高回転が得意だから。' },
        { at: 'final', who: 'natsu', text: '最終シケイン！ ここで稼げば、決勝のグリッドが決まる！' }
      ],
      post: [
        ['okawa', '予選結果が出ました！ 坂下発動機の早瀬イチロー選手、堂々の四位！ 町工場の車が、ワークス勢に食い込みました！', 'right emo:smile shake'],
        ['natsu', '四位……！ やった！', 'emo:smile shake'],
        ['himuro', '……ほう。よく走る。決勝で、会おう。', 'emo:cool'],
        { narr: '氷室の視線は、イチローではなく、SK-4 のエンジンルームに向けられていた。' }
      ] }),

    S({ id: 's3_12', ch: '3', title: '雨のサポートレース', track: 'r_suzuka', mode: 'race', laps: 1, rivals: 7, pace: 0.88, weather: 'rain', car: 'saka2', goal: { type: 'place', n: 3 }, reward: 4000,
      scene: [
        { bg: 'circuit', weather: 'rain' },
        { narr: '決勝の前日。突然の豪雨。サポートレースが、ずぶ濡れのコースで行われることになった。' },
        ['ichiro', '雨か……。滑るな。ブレーキが、利かなくなる。', 'right emo:sad'],
        ['tetsu', '雨の峠は、毎日走っとる。あんたに教えたろう。「焦らず、早めに、ゆっくり」。', 'emo:cool'],
        ['natsu', '雨ならこっちが有利かも。SK-4 のトルク特性、低いところで粘るから。', 'emo:smile'],
        ['ichiro', '……いい予行練習だ。三位以内。決勝のグリッドを、少しでも前に！', 'emo:cool lines']
      ],
      radio: [
        { at: 'start', who: 'tetsu', text: '雨は、路面の黒い所が危ない。白線の上は避けろ！' },
        { at: 'overtook', who: 'natsu', text: '雨の中、いいペース！ そのままで！' },
        { at: 'damage', who: 'natsu', text: '車体、ぶつけてない！？ 心配だよ！' }
      ],
      post: [
        ['natsu', '三位！ 決勝のスタート位置、いい場所になる！', 'emo:smile'],
        ['ichiro', '雨の中、手が震えてた。でも、ちゃんと走れた。', 'emo:smile'],
        ['tome', 'ご苦労さん。……今夜は、しっかり休みな。明日は、一番長い日になるだで。', 'right emo:smile']
      ] }),

    S({ id: 's3_13', ch: '3', title: '夜の火事', track: 'hm_city', mode: 'time', laps: 1, car: 'trike3', goal: { type: 'lap', factor: 0.38 }, reward: 3500,
      scene: [
        { bgm: 'tension' },
        { bg: 'city' },
        { narr: '決勝前夜。鈴鹿の宿に、浜松から一本の電話が入った。「工場が、燃えている」。' },
        { narr: 'イチローは、借りた三輪トラックで、夜の街道を浜松へ取って返した。着いたとき、空は赤かった。' },
        ['natsu', '火事！ 坂下発動機の工場が、燃えてる！', 'right emo:shock flash'],
        ['ichiro', '嘘だろ！？ 予備のエンジンは！ 治具は！ 図面は！', 'emo:shock'],
        ['tome', 'サカシタ GP は鈴鹿にある、無事だよ。……でも、予備のエンジンも、治具も、半分以上が、燃えちまった。', 'emo:sad'],
        ['natsu', '消防団の人が来てくれてる。でも、水が足りない！ 三輪トラックに、ポンプを積んで！', 'emo:angry'],
        ['ichiro', '任せろ！ 町じゅうの井戸から、水を運ぶ！', 'emo:angry lines']
      ],
      radio: [
        { at: 'start', who: 'tome', text: '消防車が足りない。三輪で、ポンプを運んどくれ！' },
        { at: 'damage', who: 'natsu', text: 'ポンプが落ちる！ 慎重に！' },
        { at: 'final', who: 'ichiro', text: 'もう少しだ……頼む、消えてくれ！' }
      ],
      post: [
        ['tome', '……鎮火したよ。でも、工場は半分、灰になった。', 'emo:sad'],
        ['natsu', '電気配線が、古かったの。放火じゃない。……でも、雨のレースで傷んだ足回りを直す部品が、もう、ない。明日の決勝、このままじゃ。', 'emo:sad'],
        ['ichiro', '……SK-4 の、図面は。ノートは。', 'emo:shock'],
        ['tome', 'ノートは、わたしの懐にあるよ。……あの人の心臓は、燃えてない。', 'emo:smile']
      ] }),

    S({ id: 's3_14', ch: '3', title: '町工場総出', track: 'city', mode: 'arcade', laps: 3, traffic: 8, car: 'trike3', goal: { type: 'arcade' }, reward: 4500,
      scene: [
        { bg: 'city' },
        { narr: '焼け跡に、真夜中から、町じゅうの職人が集まってきた。灯りの下で、旋盤が回りはじめた。' },
        ['tetsu', '清造さんには、昔、世話になった。……浜松の町工場は、仲間だ。', 'right emo:cool'],
        ['mori', '返済の件は、いったん保留にします。……私も、浜松の人間ですから。', 'emo:smile'],
        ['natsu', 'ばね鋼、旋盤、バルブ、キャブ。……町じゅうの工場が、夜どおし部品を作ってくれるって！', 'emo:shock'],
        ['ichiro', '三輪で、一軒ずつ回って、部品を集めてくる。……夜が明ける前に、鈴鹿へ届けなきゃ！', 'emo:cool lines'],
        ['tome', 'みんなで、車を作り直す。……それが、浜松の「やらまいか」だよ。', 'emo:smile']
      ],
      radio: [
        { at: 'start', who: 'natsu', text: '部品のリスト、渡したよ！ 順番に、チェックポイントを回って！' },
        { at: 'damage', who: 'tetsu', text: '部品は丁寧に扱え！ 町のみんなの宝だ！' },
        { at: 'final', who: 'tome', text: 'あと一軒！ 夜が明けるまでに戻っておいで！' }
      ],
      post: [
        { narr: '夜明け前。町じゅうの手で作られた部品は、三輪トラックの荷台に積まれ、鈴鹿へ向けて走り出した。' },
        ['natsu', '（無線）届いた部品で、足回りは全部直せた。……前よりも、ずっと強くなってる気がする！', 'emo:smile shake'],
        ['ichiro', 'みんな……ありがとう。この車は、浜松の町の車だ。', 'emo:sad'],
        { narr: '鈴鹿のピット。朝霧の中へ、部品を山積みにした三輪トラックが滑り込んだ。' },
        ['sawaki', '……失礼。ひとつ、お渡ししたい物があります。', 'right emo:cool'],
        ['sawaki', 'うちの技術部の者が、徹夜で作った、予備のクランクシャフトです。……清造さんの設計通りに。', 'emo:sad'],
        ['tome', '沢木……。あんた。', 'emo:shock'],
        ['sawaki', '勘違いしないでください。明日のレースは、正々堂々、勝負します。……ただ、あの人の心臓を、燃やしたくなかっただけです。', 'emo:cool'],
        { ask: '沢木の差し出したクランクシャフトを、どうする？', choice: [
          { t: '黙って受け取り、深く頭を下げる', lines: [
            ['ichiro', '……ありがとうございます。父のエンジンを、守ってくれて。', 'emo:sad'],
            ['sawaki', '礼には及びません。……明日、いいレースをしましょう。', 'emo:smile'] ] },
          { t: '「勝負の相手の施しは受けない」と断る', lines: [
            ['ichiro', '……勝負の相手から、施しは受けません。', 'emo:angry'],
            ['tome', 'イチロー。これは施しじゃない。「職人同士の、挨拶」だよ。受け取りな。', 'emo:cool'],
            ['ichiro', '……はい。……ありがとうございます、沢木さん。', 'emo:sad'] ] }
        ] },
      ] }),

    /* ===================== 第四章 ===================== */
    S({ id: 's3_15', ch: '4', title: 'ヒート戦', track: 'circuit', mode: 'elim', rivals: 6, pace: 0.94, car: 'saka2', goal: { type: 'survive' }, reward: 5000,
      scene: [
        { title: '第四章', sub: '日本グランプリ' },
        { bg: 'circuit' },
        { narr: '日本グランプリ、決勝の朝。予選の上位者だけが出場できる、ヒート戦。一周ごとに、最下位が脱落する。' },
        ['okawa', '本日は晴天！ 全国から集まった、日本一の車が、いまスタートラインに並びます！', 'right emo:smile'],
        ['himuro', 'イチロー。……お前の車、見事だった。夜のうちに組み直したと聞いた。', 'emo:cool'],
        ['ichiro', '町じゅうの力ですよ。……氷室さん、本気で来てください。', 'emo:cool'],
        ['himuro', '言われなくても。……会社の命令は、「負けるな」だ。でも俺は、ただ、走りたいだけだ。', 'emo:sad lines'],
        ['natsu', 'イチロー、ここを抜ければ決勝。……絶対、最後まで残って！', 'emo:smile']
      ],
      radio: [
        { at: 'start', who: 'natsu', text: '周ごとに最下位が消える！ 絶対にビリにならないで！' },
        { at: 'overtook', who: 'tome', text: 'そうだ、その調子だよ！' },
        { at: 'final', who: 'natsu', text: '残りわずか！ もうひと踏ん張り！' }
      ],
      post: [
        ['okawa', 'ヒートを突破！ 坂下発動機のイチロー選手、決勝進出です！ 町工場のマシンが、日本グランプリの決勝に！', 'right emo:smile shake'],
        ['jack', 'イチロー！ ボクも、突破しました！ 決勝で、一緒に走りましょう！', 'emo:smile'],
        ['himuro', '決勝で会おう。……ただし、手加減はしない。', 'emo:cool']
      ] }),

    S({ id: 's3_16', ch: '4', title: '日本グランプリ決勝', boss: 'himuro', track: 'r_suzuka', mode: 'race', laps: 2, rivals: 7, pace: 0.96, car: 'saka2', goal: { type: 'win' }, reward: 12000,
      scene: [
        { bgm: 'tension' },
        { bg: 'circuit' },
        { narr: '日本グランプリ、決勝。スタンドは、十万人の観客で埋め尽くされていた。' },
        ['sawaki', '氷室。……会社の指示は、取り消す。この勝負は、純粋な技術の競い合いだ。', 'right emo:cool'],
        ['himuro', '……ありがとうございます、沢木さん。全力で、走らせてもらいます。', 'emo:smile'],
        ['okawa', 'さあ、グリッドに並びました！ 四位スタートの早瀬イチロー、浜松の町工場が、ワークスに挑みます！', 'emo:smile'],
        ['natsu', 'イチロー、父さんの SK-4 は、高回転でこそ輝く。……最後のシケイン、全開で！', 'emo:cool lines'],
        ['tome', 'イチロー。……やらまいか。', 'emo:smile'],
        ['ichiro', 'はい！ やらまいか！！', 'emo:smile flash shake'],
        { vs: ['ichiro', 'himuro'] }
      ],
      radio: [
        { at: 'start', who: 'okawa', text: 'スタートしました！ 日本グランプリ決勝、いま、走り出しました！' },
        { at: 'overtook', who: 'natsu', text: '順位が上がった！ そのまま、そのまま！' },
        { at: 'close', who: 'himuro', text: '……いいぞ、イチロー。まだだ、まだ離れるな。' },
        { at: 'final', who: 'natsu', text: '最終ラップ！ 父さんの音が、聞こえる！' }
      ],
      post: [
        ['okawa', '優勝は……坂下発動機、早瀬イチロー！ 町工場の車が、日本グランプリを制しました！！', 'right emo:smile shake flash'],
        ['natsu', 'やった……！ やった、やったよイチロー！', 'emo:smile shake'],
        ['tome', '……清造さん。見とるかい。あんたの心臓が、日本一になったよ。', 'emo:sad'],
        ['himuro', '負けたよ、イチロー。……だが、気持ちがいい。久しぶりに、レースを楽しんだ。', 'emo:smile'],
        ['sawaki', '坂下発動機の、勝ちだ。……清造。お前の言う通りだった。町工場の、魂が勝ったな。', 'emo:smile']
      ] }),

    /* ===================== 終章 ===================== */
    S({ id: 's3_17', ch: '5', title: '富士の約束', track: 'r_fuji', mode: 'race', laps: 2, rivals: 6, pace: 0.98, boss: 'jack', car: 'saka2', goal: { type: 'win' }, reward: 10000,
      scene: [
        { title: '終章', sub: '世界へ（1966）' },
        { bg: 'circuit' },
        { narr: '二年後、1966 年。富士山のふもとに、新しいサーキットができた。' },
        ['jack', 'イチロー！ 約束通り、また来たよ。今度は負けない！', 'right emo:smile'],
        ['himuro', '俺もだ。今は自分のチームで走っている。……町工場の、な。', 'emo:cool'],
        ['tome', '新しい工場もできた。従業員は三十人。……イチロー、あんたのおかげだよ。', 'emo:smile'],
        ['sawaki', '北斗自動車は、坂下発動機と、技術提携を結びました。……買収ではなく、対等の仲間として。', 'emo:smile'],
        ['natsu', 'イチロー、最後のストレートは 1.5 キロ。サカシタ GP の最高速、試してみて！', 'emo:smile lines']
      ],
      radio: [
        { at: 'start', who: 'natsu', text: 'スタート！ 富士のストレートは、ぜんぶ踏んで！' },
        { at: 'overtook', who: 'jack', text: 'ハハ！ やっぱりきみは最高だ！' },
        { at: 'final', who: 'tome', text: '最後の一周だよ！ 浜松のみんなが、見とるでね！' }
      ],
      post: [
        ['jack', 'おめでとう、イチロー。次は、ヨーロッパで会おう。', 'emo:smile'],
        ['ichiro', 'ヨーロッパ……！', 'emo:shock'],
        ['jack', 'ル・マンに、日本の町工場の車が出る。……世界が、きみを待ってるよ。', 'emo:smile']
      ] }),

    S({ id: 's3_18', ch: '5', title: 'ふるさとの凱旋', track: 'hm_city', mode: 'time', laps: 1, car: 'saka2', goal: { type: 'lap', factor: 0.42 }, reward: 6000, final: true,
      scene: [
        { bg: 'city' },
        { narr: '浜松の町は、凱旋パレードで埋め尽くされた。駅前から、鍛冶町、浜松城まで。' },
        ['tome', 'ほら、手を振りな。町じゅうが、あんたたちを見とるよ。', 'right emo:smile'],
        ['natsu', 'イチロー。わたし、決めた。自動車の設計者になる。世界一の。', 'emo:smile'],
        ['ichiro', 'じゃあ俺は、その車で世界一になる。……父さんが、見たかった景色を、見に行く。', 'emo:smile lines']
      ],
      radio: [{ at: 'final', who: 'natsu', text: '浜松城が見えた！ ……ありがとう、みんな！' }],
      post: [
        { narr: '——それから、六十年。' },
        { bg: 'hamamatsu' },
        ['ichiro_old', '……あの年、町工場の小さな車が、世界への道を開いた。', 'right emo:smile'],
        ['ichiro_old', 'この町の人間は、負けても次の日には作り始める。それが、浜松だ。'],
        ['ichiro_old', 'さあ、今度はお前たちの番だ。……やらまいか。', 'emo:smile lines'],
        { narr: '——やらまいか 1964　完。' }
      ] })
  ];

  var SIDE = [
    S({ id: 's3_sq1', after: 's3_3', title: 'トメの戦後', boss: 'tome', track: 'hm_mikata', mode: 'touge', pace: 0.86, car: 'trike3', goal: { type: 'win' }, reward: 1800, char: 'tome',
      scene: [
        { bg: 'hamamatsu' },
        ['tome', '戦争が終わったとき、あたしは焼け野原で、軍の払い下げのトラックを直して走らせた。', 'right emo:cool'],
        ['tome', '食べ物を運んで、部品を運んで、町を作り直した。女がトラックなんて、って笑われたよ。'],
        ['tome', '……一本、付き合いな。あのころの走りを見せてやる。', 'emo:smile lines'],
        { vs: ['ichiro', 'tome'] }
      ],
      radio: [{ at: 'close', who: 'tome', text: 'ほう、ついてくるかい！' }],
      post: [['tome', '……年には勝てんね。', 'emo:smile'], ['ichiro', 'いや、社長、あと一息で負けてましたよ……。', 'emo:shock']] }),
    S({ id: 's3_sq2', after: 's3_5', title: 'ナツの設計図', track: 'hm_oku', mode: 'time', laps: 1, car: 'saka1', goal: { type: 'lap', factor: 0.38 }, reward: 2200, char: 'natsu',
      scene: [
        { bg: 'hamanako' },
        ['natsu', 'わたしね、大学に行きたかった。でも、女の子は工業大学には入れないって言われた。', 'right emo:sad'],
        ['natsu', 'だから、ばあちゃんの工場で、図書館の本で勉強したの。空気の流れも、重心も。'],
        ['natsu', '新しいボディの形、湖畔の道で確かめて。風の音が静かになれば、正解だよ。', 'emo:smile']
      ],
      radio: [{ at: 'final', who: 'natsu', text: '……静かだ。風が、車に沿って流れてる。' }],
      post: [['natsu', '正解だった……！ 本の中の数字が、ほんとうに走った！', 'emo:smile shake']] }),
    S({ id: 's3_sq3', after: 's3_9', title: 'ジャックの故郷', boss: 'jack', track: 'r_iroha', mode: 'touge', pace: 0.93, car: 'saka1', goal: { type: 'win' }, reward: 3000, char: 'jack',
      scene: [
        { bg: 'forest' },
        ['jack', 'ボクの父は、戦争で日本と戦った。父は日本を憎んでいた。', 'right emo:sad'],
        ['jack', 'でもボクは、日本の職人の車に憧れて来たんだ。……日光の九十九折り、一緒に走ろう。', 'emo:smile'],
        { vs: ['ichiro', 'jack'] }
      ],
      radio: [{ at: 'overtook', who: 'jack', text: 'ビューティフル……！' }],
      post: [['jack', '父に手紙を書くよ。「日本には、最高の友達がいる」って。', 'emo:smile']] }),
    S({ id: 's3_sq4', after: 's3_13', title: '沢木の告白', boss: 'sawaki', track: 'hamanako', mode: 'duel', laps: 1, pace: 0.9, car: 'saka2', goal: { type: 'win' }, reward: 4000, char: 'sawaki',
      scene: [
        { bg: 'hamanako' },
        ['sawaki', '清造と私は、戦争中、同じ研究所で、飛行機のエンジンを作っていた。', 'right emo:sad'],
        ['sawaki', '終戦の日、二人で誓ったんです。「いつか、平和の中で、世界一のエンジンを作ろう」と。'],
        ['sawaki', '清造は町に戻り、私は会社に入った。……私は、焦っていたんです。彼の設計を、早く世に出したくて。', 'emo:sad'],
        ['sawaki', '最後に一本、走らせてください。……旧友の息子と、ただ、走ってみたい。', 'emo:smile']
      ],
      radio: [{ at: 'close', who: 'sawaki', text: '……ああ、清造そっくりの、走りだ。' }],
      post: [['sawaki', '……ありがとう。やっと、約束が、果たせた気がします。', 'emo:smile']] }),
    S({ id: 's3_sq5', after: 's3_16', title: '氷室の走り', boss: 'himuro', track: 'r_suzuka', mode: 'duel', laps: 1, pace: 0.97, car: 'saka2', goal: { type: 'win' }, reward: 4000, char: 'himuro',
      scene: [
        { bg: 'circuit' },
        ['himuro', '会社を辞めた。……これからは、自分の意思で走る。', 'right emo:cool'],
        ['himuro', '誰も見ていない鈴鹿で、もう一度だけ。ドライバー同士として。', 'emo:smile'],
        { vs: ['ichiro', 'himuro'] }
      ],
      radio: [{ at: 'close', who: 'himuro', text: '……楽しいな。レースは、本当は楽しいものだった。' }],
      post: [['himuro', 'ありがとう、イチロー。やっと、走るのが好きになれた。', 'emo:smile']] }),
    S({ id: 's3_sq6', after: 's3_17', title: '清造のエンジン', track: 'hm_oku', mode: 'time', laps: 1, car: 'saka2', goal: { type: 'lap', factor: 0.4 }, reward: 5000, char: 'seizo',
      scene: [
        { bg: 'hamanako' },
        { narr: '父のノートの、最後のページ。インクの色が、他と違っていた。' },
        ['seizo', '（ノートの文字）「イチロー、お前がこれを読んでいるなら、もう俺は、いないのだろう。」', 'emo:smile'],
        ['seizo', '「エンジンは、人の心と同じだ。止まったら、また回せ。壊れたら、また作れ。そして、一人で回すな。」'],
        ['seizo', '「町の仲間と、一緒に回せ。……やらまいか。」', 'emo:smile lines'],
        ['ichiro', '……父さん。俺、やったよ。一人じゃなくて、みんなで。', 'emo:smile']
      ],
      radio: [{ at: 'final', who: 'ichiro', text: '父さん。……これで、最後の一周だ。' }],
      post: [['ichiro', '……ありがとう、父さん。', 'emo:smile'], { narr: '湖面に映る夕日が、ゆっくりと、ノートの文字を照らしていた。' }] })
  ];

  R.STORIES = R.STORIES || [];
  R.STORIES.push({ id: 's3', name: { ja: 'ストーリー3　やらまいか 1964', en: 'Story 3: Yaramaika 1964' }, hero: 'ichiro', era: '1964 年（昭和 39 年）', place: '静岡県浜松市・鈴鹿・富士',
                   desc: { ja: '潰れかけの町工場の見習いイチローが、亡き父の幻のエンジンと町じゅうの職人の力で、鈴鹿の日本グランプリに挑む。', en: 'An apprentice at a failing Hamamatsu workshop takes his late father\'s engine and a whole town of craftsmen to the Japanese GP.' },
                   chapters: CH, events: EV, side: SIDE, filter: 'sepia(0.45) saturate(0.85) contrast(1.06) brightness(1.02)' });
})();
