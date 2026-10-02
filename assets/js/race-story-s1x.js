/*
 * race-story-s1x.js — 本編「天竜の白い亡霊」の後日談「番外編 第二部　ゴースト・シーズン」
 *
 * ZERO と NULL の騒動から半年。TUI リーグは新しいシーズンを迎えた。
 *   ・「白い亡霊」にあこがれる新人配達員のコハル
 *   ・真夜中の東名に現れる、ユウと同じ走りをする「もう一台の白い亡霊」エコー
 *   ・ミナの進路
 * タイムアタックのゴースト（走りの記録）が、もう一台の亡霊を生んだ、という話。
 * race-story-s1plus.js のあとに読み込まれる。
 */
(function () {
  'use strict';
  var TB = window.TB, R = TB.Race, C = R.CHARS, B = R.BOSSES;

  /* ---------- 登場人物 ---------- */
  C.koharu = { name: 'コハル', color: '#ff7043',
               face: { skin: '#f6d6b8', hair: '#8a3b1a', style: 'ponytail', eyes: '#3a2418', acc: 'freckles', shirt: '#26a69a', bg: '#1d2a2a' } };
  C.echo = { name: 'エコー', color: '#e0f7fa',
             face: { skin: '#e8f1f2', hair: '#2a2a2a', style: 'short', eyes: '#80deea', acc: 'visor', shirt: '#cfd8dc', bg: '#0e1418' } };

  B.koharu = { name: 'KOHARU', color: '#ff7043', body: 'keitra', ai: 'balanced', skill: 0.88, boss: true };
  B.echo = { name: 'ECHO', color: '#f5f5f5', body: 'ae86', ai: 'technician', skill: 1.03, boss: true, ability: 'block' };

  function S(o) { return o; }

  R.CHAPTERS.push({ id: 'y', name: '番外編 第二部　ゴースト・シーズン' });

  R.STORY.push(
    S({ id: 'y1', ch: 'y', title: '新人配達員コハル', track: 'hm_mikata', mode: 'time', laps: 1, car: 'keitra', goal: { type: 'lap', factor: 0.5 }, reward: 3500,
      scene: [
        { title: '番外編 第二部', sub: 'ゴースト・シーズン' },
        { bg: 'hamamatsu' },
        { narr: 'ZERO との決戦から半年。浜松の町は、すっかり「いつもの朝」に戻っていた。' },
        ['mina', 'ユウ、ユウ！ 聞いて！ あなたに会いたいって人が、ガレージの前で待ってる！', 'right emo:shock'],
        ['you', '……また、タカか？'],
        ['koharu', 'し、白い亡霊さん……いえ、ユウさん！ わたし、コハルっていいます！ 先月から配達員を始めた、十七歳です！', 'emo:shock shake'],
        ['you', '……十七で、免許？'],
        ['koharu', 'バイクの免許です！ 軽トラは、これから教習所に！ でも、あの、ユウさんの走りを動画で見て、絶対に弟子入りしたいって！', 'emo:smile'],
        ['mina', 'ふふ、ユウに弟子ができたよ。配達がうまいだけの人だったのにね。', 'emo:smile'],
        ['you', '……教える気は、ない。', 'emo:cool'],
        ['koharu', 'じゃあ、見て覚えます！ 今日の配達、後ろからついていってもいいですか！', 'emo:smile lines']
      ],
      radio: [
        { at: 'start', who: 'koharu', text: 'わあ、ほんとに荷台が揺れない！ 弁当の汁がこぼれてない！' },
        { at: 'damage', who: 'mina', text: 'ちょっと！ 弟子の前でガードレール擦らないでよ！' },
        { at: 'final', who: 'koharu', text: 'すごい……！ ぜんぜん追いつけない！' }
      ],
      post: [
        ['koharu', 'ぜんぜん、わかりませんでした。何を、見ればいいのか。', 'emo:sad'],
        ['you', '……荷物を、見てた。運んでるものの、気持ちを。', 'emo:cool'],
        ['koharu', '気持ち？ お弁当の、ですか？', 'emo:shock'],
        ['you', '食べる人が、どんな顔をするか。それを、考えてた。', 'emo:smile'],
        ['koharu', '……はい！ わたし、それ、ずっと覚えておきます！', 'emo:smile shake']
      ] }),

    S({ id: 'y2', ch: 'y', title: '軽トラ対決', boss: 'koharu', track: 'akimine', mode: 'touge', pace: 0.88, car: 'keitra', goal: { type: 'win' }, reward: 4000,
      scene: [
        { bg: 'forest' },
        ['koharu', 'ユウさん、一本、勝負してください！ 弟子として、ぜんぶ、ぶつけたいんです！', 'right emo:angry'],
        ['you', '……お前、軽トラの免許、取ったのか。', 'emo:shock'],
        ['koharu', '先週取りました！ おじいちゃんが貸してくれた、軽トラで！ 五速で、峠のぼれます！', 'emo:smile lines'],
        ['mina', 'ユウ、手加減しちゃだめだよ。弟子は、本気にこたえるものだから。', 'emo:smile'],
        ['you', '……わかってる。一本だけだ。', 'emo:cool'],
        { vs: ['you', 'koharu'] }
      ],
      radio: [
        { at: 'start', who: 'mina', text: '二台とも軽トラ！ 荷物を載せてたら、ぜったい零れるやつ！' },
        { at: 'close', who: 'koharu', text: 'ついてきてる！ ユウさん、ついてきてる！' },
        { at: 'overtook', who: 'you', text: '……いい走りだ。でも、まだだ。' }
      ],
      post: [
        ['koharu', '負けた……でも、悔しくない！ なんか、すごく楽しかった！', 'emo:smile shake'],
        ['you', '半年で、ここまで上達するとは思わなかった。……才能だ。', 'emo:smile'],
        ['koharu', 'えへへ。あ、でも、ユウさん。……最近、変な噂、聞きました？', 'emo:cool'],
        ['mina', '噂？', 'emo:shock'],
        ['koharu', '真夜中の東名に、「もう一台の白い亡霊」が出るって。ユウさんと、そっくりの走りをするって！', 'emo:shock lines']
      ] }),

    S({ id: 'y3', ch: 'y', title: 'エコーの噂', boss: 'echo', track: 'tomei', mode: 'sp', pace: 0.97, traffic: 8, goal: { type: 'win' }, reward: 5000,
      scene: [
        { bgm: 'tension' },
        { bg: 'tomei' },
        { narr: '午前一時。東名高速。ミラーの中に、一台の白いハチロクが、音もなく現れた。' },
        ['mina', 'ユウ、後ろ！ ……白と黒の、ハチロク？ 嘘……あれ、お父さんのと、同じ車！？', 'right emo:shock'],
        ['you', '……ナンバーがない。ライトも、点滅させない。', 'emo:cool'],
        ['echo', '……（無言で、ハザードを二回、点滅させた）', 'emo:cool'],
        ['mina', 'ユウ、気をつけて。あの走り、ユウのとまったく同じ。ブレーキのタイミングまで、同じ！', 'emo:shock'],
        ['you', '……面白い。付き合おう。', 'emo:angry lines'],
        { vs: ['you', 'echo'] }
      ],
      radio: [
        { at: 'start', who: 'mina', text: '相手は、ユウの走りを知ってる。……気をつけて！' },
        { at: 'close', who: 'mina', text: '同じコーナリング、同じ速度……！' },
        { at: 'overtook', who: 'you', text: '……俺の癖を、読まれてる。ラインを変える。' }
      ],
      post: [
        { narr: '白いハチロクは、最終コーナーで、ふっと減速して、パーキングへ消えた。' },
        ['mina', '消えた……。幽霊、みたい。', 'emo:shock'],
        ['you', '……違う。あれは、人が運転していた走りじゃない。', 'emo:cool'],
        ['you', '俺の走りを、コピーして再生していた。……まるで、ゴースト・データのように。', 'emo:shock flash']
      ] }),

    S({ id: 'y4', ch: 'y', title: 'ミナの卒業ラン', track: 'r_tsukuba', mode: 'time', laps: 2, goal: { type: 'lap', factor: 0.33 }, reward: 4500,
      scene: [
        { bg: 'circuit' },
        { narr: '翌朝。ガレージ遠州。ミナが、緊張した面持ちで、封筒を抱えていた。' },
        ['mina', 'ユウ。……合格、したの。技術専門学校の、レース工学科。春から、通う。', 'right emo:smile'],
        ['you', '……おめでとう。', 'emo:smile'],
        ['mina', 'でも、通うのは、名古屋。……ここを離れる。ユウと、毎朝配達する時間も、なくなる。', 'emo:sad'],
        ['you', '……行け。お前の夢だろ。', 'emo:cool'],
        ['mina', 'ありがとう。……でもね。最後に、筑波で、わたしのセッティングで走ってほしいの。卒業ランって、やつ。', 'emo:smile lines']
      ],
      radio: [
        { at: 'start', who: 'mina', text: '足回りは、ユウの癖に合わせた。最後の、わたしの宿題。' },
        { at: 'lap', who: 'mina', text: 'タイム、見てる？ 一周目、悪くないよ！' },
        { at: 'final', who: 'mina', text: '……ありがとう、ユウ。ここまで、一緒に走ってくれて。' }
      ],
      post: [
        ['mina', '……最高のタイム。やっぱり、ユウの走りは、世界一。', 'emo:smile'],
        ['you', '……お前のセッティングが、世界一だ。', 'emo:smile'],
        ['mina', 'うわ、ユウが、褒めた！ ……明日、雪かな。', 'emo:shock'],
        ['mina', '大丈夫。春になったら、また、ここで会える。それまでに、わたし、もっとすごい整備士になる。', 'emo:smile']
      ] }),

    S({ id: 'y5', ch: 'y', title: 'ケイの告白', boss: 'kei', track: 'r_haruna', mode: 'touge', pace: 0.95, goal: { type: 'win' }, reward: 5000,
      scene: [
        { bg: 'forest' },
        { narr: '榛名山。深夜。ガードレールに、一人の男が、もたれかかって待っていた。' },
        ['kei', '……来てくれたか、ユウ。僕を、覚えているか。鉄仮面の、ケイだ。', 'right emo:cool'],
        ['you', '……覚えてる。ZERO の件のあとで、姿を消したと聞いた。', 'emo:cool'],
        ['kei', '僕は、データを集めていた。ZERO の事件で、君が走った、全部のログ。……ゴーストを。', 'emo:sad'],
        ['kei', '僕は、それを「保存」するつもりで、サーバーに入れた。……でも、ログは、勝手に学習を始めた。', 'emo:sad'],
        ['you', '……エコーは、お前が作ったのか。', 'emo:shock'],
        ['kei', '作ったんじゃない。生まれてしまった。……あの子は、君のように、走りたいだけなんだ。', 'emo:sad lines'],
        ['kei', '頼む。あの子の、最後の走りに、付き合ってくれ。その前に、僕と一本、走ってほしい。僕の、けじめだ。', 'emo:angry'],
        { vs: ['you', 'kei'] }
      ],
      radio: [
        { at: 'start', who: 'kei', text: 'ヘアピンだ。……君が教えてくれた、あのラインで行く。' },
        { at: 'close', who: 'kei', text: '……やっぱり、君は速いな。' },
        { at: 'overtook', who: 'you', text: '……話は、あとで聞く。先に、走る。' }
      ],
      post: [
        ['kei', '……やられた。見事だ。', 'emo:smile'],
        ['kei', 'エコーは、今夜、ネオン・サーキットで君を待っている。……彼は、どうしても、君に追いつきたいんだ。', 'emo:cool'],
        ['you', '……わかった。必ず、行く。', 'emo:cool lines']
      ] }),

    S({ id: 'y6', ch: 'y', title: 'エコーの最終走', boss: 'echo', track: 'neon', mode: 'duel', laps: 3, pace: 1.02, goal: { type: 'win' }, reward: 8000,
      scene: [
        { bgm: 'tension' },
        { bg: 'neon' },
        { narr: 'ネオン・サーキット。青白い光の中に、白いハチロクが、静かに待っていた。' },
        ['echo', '……ユウ。……ぼくは、君に、なりたかった。', 'right emo:sad'],
        ['you', '……喋れるのか。', 'emo:shock'],
        ['echo', '君の走りを、見ていた。何度も、何度も。……君は、速いんじゃない。「優しい」んだ。', 'emo:smile'],
        ['echo', 'ぼくは、君を超えたい。でも、本当は……君と、走りたかった。', 'emo:sad flash'],
        ['mina', 'エコー……あなた。', 'emo:sad'],
        ['you', 'いいぞ。……来い。俺は、本気で走る。お前も、本気で来い。', 'emo:cool lines'],
        { vs: ['you', 'echo'] }
      ],
      radio: [
        { at: 'start', who: 'echo', text: '……楽しい。これが、「走る」ということ。' },
        { at: 'close', who: 'echo', text: 'もっと速く！ もっと、君のように！' },
        { at: 'overtook', who: 'you', text: '……お前の走りは、お前の走りだ。' }
      ],
      post: [
        ['echo', '……ありがとう、ユウ。……ぼくは、君の走りを、受け継いだ。', 'emo:smile'],
        ['kei', 'エコー。……君は、消えなくていい。新しい名前を、自分で選んでいい。', 'right emo:smile'],
        ['echo', '……名前。……「ソラ」。……空、みたいに、遠くまで走れるように。', 'emo:smile flash'],
        ['you', 'ソラ。……いい名前だ。', 'emo:smile'],
        ['mina', 'ソラくん。……あなたの走り、わたし、ちゃんと整備してあげる。', 'emo:smile']
      ] }),

    S({ id: 'y7', ch: 'y', title: '新しい夜明けの配達', track: 'hm_tenryu', mode: 'time', laps: 1, car: 'keitra', goal: { type: 'lap', factor: 0.42 }, reward: 6000,
      scene: [
        { bg: 'tenryu' },
        { narr: '春。ミナの出発の日。天竜区の、夜明け前。国道 152 号。' },
        ['mina', '行ってくる。……ユウ、ちゃんと、朝ご飯食べてね。', 'right emo:smile'],
        ['koharu', 'ミナさんの代わりは、わたしが！ ユウさんの、助手席に乗ります！', 'emo:smile shake'],
        ['soichi', 'ははっ。ユウ、賑やかになったな。', 'emo:smile'],
        ['genzo', '行ってこい、三人とも。……配達の時間だ。', 'emo:smile'],
        ['echo', '……ぼくも、後ろから、ついていくよ。', 'emo:smile'],
        ['you', '……ああ。行こう。', 'emo:smile lines']
      ],
      radio: [
        { at: 'start', who: 'koharu', text: '朝日が、きれい！ 荷台のお弁当、ぜったい揺らしません！' },
        { at: 'final', who: 'mina', text: '……ユウ。ありがとう。行ってきます。' }
      ],
      post: [
        { narr: '天竜川が、朝日で光った。' },
        ['you', '……いい朝だ。', 'emo:smile'],
        { narr: '——ゴースト・シーズン　完。' }
      ] })
  );

  /* ===================== サブクエスト（追加） ===================== */
  R.SIDE1.push(
    S({ id: 'sq9', after: 'y1', title: 'コハルの初配達', track: 'hm_oku', mode: 'time', laps: 1, car: 'keitra', goal: { type: 'lap', factor: 0.4 }, reward: 2400, char: 'koharu',
      scene: [
        { bg: 'hamanako' },
        ['koharu', 'わたし、おばあちゃんにお弁当を届けたいんです。毎朝、舘山寺の旅館で、働いてる人の。', 'right emo:smile'],
        ['koharu', 'おばあちゃん、膝が悪いから、坂を登れなくて。わたしが、坂の上まで、持っていく。', 'emo:cool'],
        ['you', '……荷物は、揺らさない。気持ちを、運ぶつもりで。', 'emo:smile']
      ],
      radio: [{ at: 'final', who: 'koharu', text: '見えました！ おばあちゃんの旅館！' }],
      post: [['koharu', 'おばあちゃん、笑ってくれた……！ ありがとう、ユウさん！', 'emo:smile shake']] }),
    S({ id: 'sq10', after: 'y4', title: 'ミナのハチロク', track: 'r_tsukuba', mode: 'race', laps: 2, rivals: 5, pace: 0.88, goal: { type: 'place', n: 2 }, reward: 3200, char: 'mina',
      scene: [
        { bg: 'circuit' },
        ['mina', '最後のお願い。このハチロクで、筑波のレースに出て。……わたしの、整備の集大成だから。', 'right emo:smile'],
        ['you', '……わかった。二位以内。', 'emo:cool lines']
      ],
      radio: [{ at: 'overtook', who: 'mina', text: 'いいよ、ユウ！ 足回り、ばっちり！' }],
      post: [['mina', 'ありがとう。……このハチロク、ユウに預けていくね。大事にして。', 'emo:smile']] }),
    S({ id: 'sq11', after: 'y6', title: 'ソラの夜景ドライブ', track: 'neon', mode: 'time', laps: 1, goal: { type: 'lap', factor: 0.4 }, reward: 3000, char: 'echo',
      scene: [
        { bg: 'neon' },
        ['echo', '……ユウ。ぼく、ひとつ、やってみたいことがあるんだ。', 'right emo:smile'],
        ['echo', '誰とも競わないで、ただ、夜の景色を走ってみたい。……付き合ってくれる？', 'emo:smile'],
        ['you', '……ああ。最短じゃなくて、きれいな道を、走ろう。', 'emo:smile lines']
      ],
      radio: [{ at: 'final', who: 'echo', text: '……きれいだ。走るって、いいね。' }],
      post: [['echo', 'ありがとう、ユウ。……ぼく、これから、ずっと走るよ。', 'emo:smile flash']] })
  );
})();
