/*
 * commands.js — コマンドの定義。
 * 追加するには registry に 1 項目足すだけ。help には自動で載ります。
 */
(function () {
  'use strict';

  var TB = window.TB;
  var C = window.CONTENT;
  var t = TB.t;
  var ui = TB.ui;

  function ja() { return TB.state.lang === 'ja'; }

  /* ---------- バナー ---------------------------------------------------- */

  var BANNER_LG = [
    '████████╗██╗   ██╗██╗  ██████╗  █████╗ ███████╗███████╗',
    '╚══██╔══╝██║   ██║██║  ██╔══██╗██╔══██╗██╔════╝██╔════╝',
    '   ██║   ██║   ██║██║  ██████╔╝███████║███████╗█████╗  ',
    '   ██║   ██║   ██║██║  ██╔══██╗██╔══██║╚════██║██╔══╝  ',
    '   ██║   ╚██████╔╝██║  ██████╔╝██║  ██║███████║███████╗',
    '   ╚═╝    ╚═════╝ ╚═╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝'
  ].join('\n');

  /* 幅の狭い画面用。どのフォントでも崩れない 21 桁。 */
  var BANNER_SM = [
    '╔═══════════════════╗',
    '║  T U I - B A S E  ║',
    '╚═══════════════════╝'
  ].join('\n');

  function bannerLines() {
    var lg = document.createElement('div');
    lg.className = 'banner banner-lg';
    lg.textContent = BANNER_LG;
    var sm = document.createElement('div');
    sm.className = 'banner banner-sm';
    sm.textContent = BANNER_SM;
    return [{ node: lg }, { node: sm }, [{ t: t(C.meta.tagline), c: 'dim' }]];
  }

  /* ---------- 共通の見出し --------------------------------------------- */

  function head(title) {
    return [[{ t: '── ' + title + ' ', c: 'accent bold' }, { t: '─'.repeat(Math.max(2, 28 - title.length)), c: 'dim' }], ''];
  }

  /* ---------- 各セクション --------------------------------------------- */

  function aboutLines() {
    return head('about').concat(t(C.about), ['']);
  }

  function projectLines() {
    var out = head('projects');
    (C.projects || []).forEach(function (p) {
      var headRow = [{ t: p.name, c: 'name' }];
      if (p.year) headRow.push({ t: p.year, c: 'year' });
      if (p.tags && p.tags.length) headRow.push({ t: '[' + p.tags.join(' ') + ']', c: 'tags' });
      var lines = [
        { block: { cls: 'head', lines: [headRow] } },
        [{ t: t(p.desc), c: 'desc' }]
      ];
      if (p.url) lines.push([{ t: p.url, c: 'dim', link: p.url }]);
      out.push({ block: { cls: 'card', lines: lines } });
    });
    out.push([{ t: ja() ? '詳しく見るには: cat projects/<名前>.md' : 'see more: cat projects/<name>.md', c: 'dim' }], '');
    return out;
  }

  function skillLines() {
    var out = head('skills');
    (C.skills || []).forEach(function (g) {
      out.push({ row: [t(g.group), [{ t: (g.items || []).join('  ·  ') }]] });
    });
    out.push('');
    return out;
  }

  function contactLines() {
    var out = head('contact');
    (C.contact || []).forEach(function (c) {
      out.push({ row: [c.label, c.url ? [{ t: c.value, link: c.url }] : [{ t: c.value }]] });
    });
    out.push('', [{ t: ja() ? 'open <名前> でも開けます (例: open github)' : 'try: open <name>  (e.g. open github)', c: 'dim' }], '');
    return out;
  }

  /* ---------- ファイル読み出し ------------------------------------------ */

  function readNode(node) {
    if (node.cmd) {
      var c = registry[node.cmd];
      return c ? c.run([], {}) : [];
    }
    return node.body ? node.body() : [];
  }

  /* ---------- コマンド本体 ---------------------------------------------- */

  var registry = {};

  function def(name, opts) { registry[name] = opts; }

  /* help と manual で共通の分類。[id, 日本語, 英語] の順で並ぶ */
  var GROUPS = [
    ['info', '内容', 'content'],
    ['fs', 'ファイル', 'files'],
    ['game', 'ゲーム', 'games'],
    ['gui', 'GUI アプリ', 'GUI apps'],
    ['dos', 'コマンドプロンプト風', 'Windows / DOS'],
    ['unix', 'Unix 風', 'UNIX-style'],
    ['mac', 'macOS 風', 'macOS'],
    ['linux', 'Linux 風', 'Linux'],
    ['android', 'Android 風', 'Android'],
    ['ios', 'iOS 風', 'iOS'],
    ['egg', 'かくれているもの', 'easter eggs'],
    ['text', '文字を扱う', 'text tools'],
    ['fun', 'お遊び', 'fun'],
    ['sys', '設定・その他', 'system']
  ];

  function groupLabels() {
    var o = {};
    GROUPS.forEach(function (g) { o[g[0]] = ja() ? g[1] : g[2]; });
    return o;
  }

  function shortcutRows() {
    return [
      { row: ['Tab', ja() ? '入力を補完する' : 'complete input'] },
      { row: ['↑ / ↓', ja() ? '履歴をたどる' : 'walk through history'] },
      { row: ['→', ja() ? '薄く出ている候補を確定する' : 'accept the ghost suggestion'] },
      { row: ['Ctrl+L', ja() ? '画面を消す' : 'clear the screen'] },
      { row: ['Ctrl+C', ja() ? '入力を取り消す' : 'cancel the line'] },
      { row: ['Ctrl+U', ja() ? '入力中の行をまとめて消す' : 'erase the whole line'] }
    ];
  }

  /* manual に載せる使用例。ここに無いコマンドは引数なしで使える。 */
  var EXAMPLES = {
    ls: ['ls', 'ls -a', 'ls projects'],
    cd: ['cd projects', 'cd ..', 'cd ~'],
    cat: ['cat README.md', 'cat projects/tui-base.md'],
    theme: ['theme', 'theme amber'],
    lang: ['lang en', 'lang ja'],
    crt: ['crt on', 'crt off'],
    open: ['open github', 'open https://example.com'],
    man: ['man ls'],
    manual: ['manual', 'manual cat'],
    echo: ['echo hello'],
    ttt: ['ttt', 'ttt hard'],
    race: ['race', 'race story', 'race world', 'race job taxi', 'race touge akimine', 'race quick fujisp 3 hard', 'race gp', 'race mini drag', 'race party', 'race garage', 'race daily', 'race achievements'],
    taxi: ['taxi', 'taxi ng_meieki'],
    tetris: ['tetris', 'tetris sprint', 'tetris ultra'],
    snake: ['snake', 'snake wrap'],
    settings: ['settings'],
    paint: ['paint', 'paint 48 24'],
    gcalc: ['gcalc'],
    sound: ['sound on', 'sound off'],
    mine: ['mine', 'mine easy', 'mine hard'],
    sokoban: ['sokoban', 'sokoban 3'],
    quiz: ['quiz', 'quiz 12'],
    grep: ['grep TUI', 'grep 端末 README.md'],
    find: ['find md'],
    head: ['head README.md', 'head -n 3 README.md'],
    tail: ['tail -n 2 skills.txt'],
    wc: ['wc README.md'],
    sort: ['sort skills.txt'],
    which: ['which cat'],
    apropos: ['apropos file'],
    calc: ['calc 12*(3+4)', 'calc 2^10', 'calc (1+2)/3'],
    seq: ['seq 5', 'seq 3 9'],
    sleep: ['sleep 2'],
    figlet: ['figlet TUI', 'figlet 2026'],
    morse: ['morse sos'],
    nato: ['nato abc'],
    base64: ['base64 hello'],
    unbase64: ['unbase64 aGVsbG8='],
    rot13: ['rot13 hello'],
    hash: ['hash hello'],
    repeat: ['repeat 3 ha'],
    password: ['password', 'password 24'],
    lorem: ['lorem 5'],
    urlencode: ['urlencode a b&c'],
    roll: ['roll', 'roll 2d6', 'roll 3d20'],
    choose: ['choose A B C'],
    cowsay: ['cowsay hello'],
    '8ball': ['8ball ...?'],
    ping: ['ping example.com'],
    tracert: ['tracert example.com'],
    title: ['title my terminal', 'title'],
    color: ['color 0a', 'color f0'],
    type: ['type README.md'],
    dir: ['dir', 'dir projects'],
    file: ['file README.md'],
    stat: ['stat README.md'],
    uname: ['uname -a'],
    basename: ['basename /a/b/c.txt'],
    dirname: ['dirname /a/b/c.txt'],
    upper: ['upper hello'],
    lower: ['lower HELLO'],
    rev: ['rev hello'],
    count: ['count hello world'],
    yes: ['yes ok'],
    rogue: ['rogue']
  };

  def('help', {
    group: 'info',
    desc: { ja: 'コマンドの一覧を表示する', en: 'list available commands' },
    run: function () {
      var out = head(ui('commands'));
      out.push([{ t: ui('helphead'), c: 'dim' }]);
      out.push([{ t: ja() ? '使い方まで全部見るには ' : 'for the full reference with usage, type ', c: 'dim' },
                { t: 'manual', c: 'accent' },
                { t: ja() ? ' と入力してください。' : '.', c: 'dim' }], '');
      var groups = groupLabels();
      Object.keys(groups).forEach(function (g) {
        var names = Object.keys(registry).filter(function (name) {
          var c = registry[name];
          return !c.hidden && (c.group || 'sys') === g;
        });
        if (!names.length) return;          // 隠しだけの分類は見出しも出さない
        out.push([{ t: groups[g], c: 'accent-2' }]);
        names.forEach(function (name) {
          out.push({ row: [[{ t: name, cmd: name }], t(registry[name].desc)], sub: false });
        });
        out.push('');
      });
      out.push([{ t: ui('shortcuts'), c: 'accent-2' }]);
      out = out.concat(shortcutRows());
      out.push('');
      return out;
    }
  });

  def('manual', {
    group: 'info',
    usage: 'manual [command]',
    desc: {
      ja: '全コマンドの使い方を一覧で読む',
      en: 'the full reference: every command and how to use it'
    },
    run: function (args) {
      // 引数があれば、その 1 つだけを man と同じ形で見せる
      if (args.length) return registry.man.run(args);

      var out = head(ja() ? '取扱説明' : 'manual');
      out.push([{ t: ja()
        ? 'すべてのコマンドと、その使い方です。1 つだけ見たいときは man <名前>。'
        : 'Every command and how to use it. For just one, use man <name>.', c: 'dim' }]);
      out.push([{ t: ja()
        ? '◆ の付いたものは help には出てきません。ここだけに載せています。'
        : 'Entries marked ◆ never appear in help — they are listed only here.', c: 'dim' }], '');

      var groups = groupLabels();
      Object.keys(groups).forEach(function (g) {
        var names = Object.keys(registry).filter(function (n) {
          return (registry[n].group || 'sys') === g;
        });
        if (!names.length) return;

        out.push([{ t: '[' + groups[g] + ']', c: 'accent-2 bold' }]);
        names.forEach(function (name) {
          var c = registry[name];
          var title = [{ t: '  ' + (c.usage || name), c: 'accent' }];
          if (c.hidden) title.push({ t: ja() ? '   ◆ help には出ないコマンド' : '   ◆ hidden from help', c: 'warn' });
          out.push(title);
          out.push([{ t: '      ' + t(c.desc) }]);
          if (EXAMPLES[name] && EXAMPLES[name].length > 1) {
            out.push([{ t: '      ' + (ja() ? '例: ' : 'e.g. ') + EXAMPLES[name].join('   '), c: 'dim' }]);
          }
        });
        out.push('');
      });

      // 別名
      out.push([{ t: '[' + (ja() ? '別名' : 'aliases') + ']', c: 'accent-2 bold' }]);
      out.push({ block: { cls: 'alias-grid', lines: Object.keys(ALIAS).sort().map(function (a) {
        return [{ t: a, c: 'accent' }, { t: ' → ' + ALIAS[a], c: 'dim' }];
      }) } });
      out.push('');

      // キー操作
      out.push([{ t: '[' + ui('shortcuts') + ']', c: 'accent-2 bold' }]);
      out = out.concat(shortcutRows());
      out.push('');

      // 書き方の約束
      out.push([{ t: '[' + (ja() ? '読み方' : 'notation') + ']', c: 'accent-2 bold' }]);
      out.push({ row: ['<...>', ja() ? '必ず書くもの' : 'required'] });
      out.push({ row: ['[...]', ja() ? '省いてもよいもの' : 'optional'] });
      out.push({ row: ['a|b', ja() ? 'どちらかを選ぶ' : 'choose one'] });
      out.push('');
      return out;
    }
  });

  def('about', {
    group: 'info',
    desc: { ja: 'このサイトについて', en: 'what this site is' },
    run: aboutLines
  });

  def('projects', {
    group: 'info',
    desc: { ja: '作ったものの一覧', en: 'things I have built' },
    run: projectLines
  });

  def('skills', {
    group: 'info',
    desc: { ja: '使える道具', en: 'tools I use' },
    run: skillLines
  });

  def('contact', {
    group: 'info',
    desc: { ja: '連絡先とリンク', en: 'how to reach me' },
    run: contactLines
  });

  def('ls', {
    group: 'fs',
    usage: 'ls [-a] [path]',
    desc: { ja: 'ディレクトリの中身を見る', en: 'list directory contents' },
    run: function (args) {
      var all = args.indexOf('-a') !== -1;
      var target = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];
      var parts = TB.fs.resolve(target === undefined ? '.' : target, TB.state.cwd);
      var node = TB.fs.get(parts);
      if (!node) return [[{ t: ui('nosuchfile')(target), c: 'err' }]];
      if (node.type === 'file') return [target];

      var names = Object.keys(node.children).filter(function (n) {
        return all || !node.children[n].hidden;
      }).sort();
      if (!names.length) return [[{ t: ui('empty'), c: 'dim' }]];

      var items = names.map(function (n) {
        var child = node.children[n];
        return { t: n + (child.type === 'dir' ? '/' : ''), c: child.type === 'dir' ? 'accent-2 bold' : '' };
      });
      return [{ block: { cls: 'grid-tags', lines: items.map(function (i) { return [i]; }) } }, ''];
    }
  });

  def('cd', {
    group: 'fs',
    usage: 'cd [path]',
    desc: { ja: 'ディレクトリを移動する', en: 'change directory' },
    run: function (args) {
      var parts = TB.fs.resolve(args[0] === undefined ? '~' : args[0], TB.state.cwd);
      var node = TB.fs.get(parts);
      if (!node) return [[{ t: ui('nosuchfile')(args[0]), c: 'err' }]];
      if (node.type !== 'dir') return [[{ t: ui('notdir')(args[0]), c: 'err' }]];
      TB.state.cwd = parts;
      TB.Term.renderPrompt();
      TB.refreshStatus();
      return [];
    }
  });

  def('cat', {
    group: 'fs',
    usage: 'cat <file>',
    desc: { ja: 'ファイルの中身を読む', en: 'print a file' },
    run: function (args) {
      if (!args.length) return [[{ t: ui('usage') + ': cat <file>', c: 'warn' }]];
      var parts = TB.fs.resolve(args[0], TB.state.cwd);
      var node = TB.fs.get(parts);
      if (!node) return [[{ t: ui('nosuchfile')(args[0]), c: 'err' }]];
      if (node.type === 'dir') return [[{ t: ui('isdir')(args[0]), c: 'err' }]];
      return [].concat(readNode(node), ['']);
    }
  });

  def('pwd', {
    group: 'fs',
    desc: { ja: '今いる場所を表示する', en: 'print working directory' },
    run: function () { return [TB.fs.display(TB.state.cwd)]; }
  });

  def('tree', {
    group: 'fs',
    desc: { ja: 'ファイルの構成を木で表示する', en: 'show the file tree' },
    run: function () {
      var out = [[{ t: TB.fs.display(TB.state.cwd), c: 'accent-2 bold' }]];
      var node = TB.fs.get(TB.state.cwd);
      (function walk(n, prefix) {
        if (!n || n.type !== 'dir') return;
        var names = Object.keys(n.children).filter(function (k) { return !n.children[k].hidden; }).sort();
        names.forEach(function (name, i) {
          var last = i === names.length - 1;
          var child = n.children[name];
          out.push([
            { t: prefix + (last ? '└── ' : '├── '), c: 'dim' },
            { t: name + (child.type === 'dir' ? '/' : ''), c: child.type === 'dir' ? 'accent-2' : '' }
          ]);
          if (child.type === 'dir') walk(child, prefix + (last ? '    ' : '│   '));
        });
      })(node, '');
      out.push('');
      return out;
    }
  });

  def('theme', {
    group: 'sys',
    usage: 'theme [name]',
    desc: { ja: '見た目を変える', en: 'change the colour scheme' },
    run: function (args) {
      var names = TB.themes;
      if (!args.length) {
        var out = [[{ t: ui('themelist'), c: 'dim' }]];
        names.forEach(function (n) {
          var cur = n === TB.currentTheme();
          out.push([
            { t: cur ? '  ● ' : '  ○ ', c: cur ? 'accent' : 'dim' },
            { t: n, c: cur ? 'accent' : '' }
          ]);
        });
        out.push('', [{ t: ja() ? '例: theme amber' : 'e.g. theme amber', c: 'dim' }], '');
        return out;
      }
      var name = args[0].toLowerCase();
      if (names.indexOf(name) === -1) {
        return [[{ t: ja() ? 'そのテーマはありません: ' + name : 'unknown theme: ' + name, c: 'err' }],
                [{ t: names.join('  '), c: 'dim' }]];
      }
      TB.setTheme(name);
      return [[{ t: ui('themeset')(name), c: 'accent' }]];
    }
  });

  def('lang', {
    group: 'sys',
    usage: 'lang [ja|en]',
    desc: { ja: '表示言語を切り替える (ja / en)', en: 'switch language (ja / en)' },
    run: function (args) {
      var next = (args[0] || (TB.state.lang === 'ja' ? 'en' : 'ja')).toLowerCase();
      if (next !== 'ja' && next !== 'en') {
        return [[{ t: ui('usage') + ': lang [ja|en]', c: 'warn' }]];
      }
      TB.setLang(next);
      return [[{ t: ui('langset'), c: 'accent' }]];
    }
  });

  def('crt', {
    group: 'sys',
    usage: 'crt [on|off]',
    desc: { ja: 'ブラウン管っぽい効果の切り替え', en: 'toggle the CRT effect' },
    run: function (args) {
      var on;
      if (args[0] === 'on') on = true;
      else if (args[0] === 'off') on = false;
      else on = !document.body.classList.contains('crt-on');
      TB.setCRT(on);
      return [[{ t: on ? ui('crton') : ui('crtoff'), c: 'accent' }]];
    }
  });

  def('banner', {
    group: 'sys',
    desc: { ja: 'ロゴを表示する', en: 'print the logo' },
    run: function () { return bannerLines().concat(['']); }
  });

  def('neofetch', {
    group: 'sys',
    desc: { ja: 'この環境の情報', en: 'system information' },
    run: function () {
      var wrap = document.createElement('div');
      wrap.className = 'neofetch';

      var logo = document.createElement('div');
      logo.className = 'logo';
      logo.textContent = [
        '   ,--.   ',
        '  ( >o< ) ',
        '   `--\'   ',
        '  /|__|\\  ',
        ' |______| '
      ].join('\n');

      var info = document.createElement('div');
      info.className = 'info';
      var rows = [
        [C.meta.user + '@' + C.meta.host, ''],
        ['os', 'TUI-BASE ' + C.meta.version],
        ['host', location.protocol === 'file:' ? 'local file' : location.hostname],
        ['shell', 'tuish 1.0'],
        ['theme', TB.currentTheme()],
        ['lang', TB.state.lang],
        ['engine', (navigator.userAgent.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/) || ['unknown'])[0]],
        ['screen', window.innerWidth + 'x' + window.innerHeight]
      ];
      rows.forEach(function (r) {
        var line = document.createElement('div');
        line.className = 'line' + (r[1] ? ' row' : '');
        if (r[1]) {
          var k = document.createElement('span'); k.className = 'k'; k.textContent = r[0];
          var v = document.createElement('span'); v.className = 'v'; v.textContent = r[1];
          line.appendChild(k); line.appendChild(v);
        } else {
          var b = document.createElement('span'); b.className = 'accent bold'; b.textContent = r[0];
          line.appendChild(b);
        }
        info.appendChild(line);
      });

      wrap.appendChild(logo);
      wrap.appendChild(info);
      return [{ node: wrap }, ''];
    }
  });

  def('date', {
    group: 'sys',
    desc: { ja: '今の日時', en: 'current date and time' },
    run: function () {
      var d = new Date();
      return [d.toLocaleString(ja() ? 'ja-JP' : 'en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      })];
    }
  });

  def('whoami', {
    group: 'sys',
    desc: { ja: 'あなたは誰か', en: 'who you are' },
    run: function () {
      return [C.meta.user, [{ t: ja() ? '(このサイトを見に来てくれた人)' : '(a welcome visitor)', c: 'dim' }]];
    }
  });

  def('echo', {
    group: 'sys',
    usage: 'echo <text>',
    desc: { ja: '書いたものをそのまま返す', en: 'print the given text' },
    hidden: true,
    run: function (args) { return [args.join(' ')]; }
  });

  def('history', {
    group: 'sys',
    desc: { ja: '入力したコマンドの履歴', en: 'command history' },
    run: function () {
      var h = TB.Term.history();
      if (!h.length) return [[{ t: ui('empty'), c: 'dim' }]];
      return h.map(function (c, i) {
        return { row: [[{ t: String(i + 1), c: 'dim' }], [{ t: c }]] };
      }).concat(['']);
    }
  });

  def('man', {
    group: 'sys',
    usage: 'man <command>',
    desc: { ja: 'コマンドの説明を読む', en: 'read about a command' },
    run: function (args) {
      var name = args[0];
      if (!name) return [[{ t: ui('usage') + ': man <command>', c: 'warn' }]];
      var c = registry[name];
      if (!c) return [[{ t: ui('notfound')(name), c: 'err' }]];
      return [
        [{ t: name.toUpperCase() + '(1)', c: 'accent bold' }],
        '',
        { row: [ui('usage'), c.usage || name] },
        { row: [ja() ? '説明' : 'description', t(c.desc)] },
        ''
      ];
    }
  });

  def('open', {
    group: 'sys',
    usage: 'open <name|url>',
    desc: { ja: 'リンクを新しいタブで開く', en: 'open a link in a new tab' },
    run: function (args) {
      if (!args.length) return [[{ t: ui('usage') + ': open <name|url>', c: 'warn' }]];
      var key = args[0].toLowerCase();
      var url = '';
      if (/^https?:\/\//.test(args[0]) || /^mailto:/.test(args[0])) url = args[0];
      if (!url) {
        (C.contact || []).forEach(function (c) {
          if (c.label.toLowerCase() === key && c.url) url = c.url;
        });
      }
      if (!url) {
        (C.projects || []).forEach(function (p) {
          if (TB.slug(p.name) === key && p.url) url = p.url;
        });
      }
      if (!url) return [[{ t: ui('nourl'), c: 'err' }]];
      window.open(url, '_blank', 'noopener');
      return [[{ t: ui('opened')(url), c: 'accent' }]];
    }
  });

  def('fortune', {
    group: 'sys',
    desc: { ja: '短い一言をひとつ', en: 'a short saying' },
    run: function () {
      var list = C.fortunes || [];
      if (!list.length) return [];
      var f = t(list[Math.floor(Math.random() * list.length)]);
      return ['', [{ t: '  “' + f + '”', c: 'accent' }], ''];
    }
  });

  def('clear', {
    group: 'sys',
    desc: { ja: '画面を消す', en: 'clear the screen' },
    run: function () { TB.Term.clear(); return []; }
  });

  def('matrix', {
    group: 'sys',
    hidden: true,
    desc: { ja: '降らせる', en: 'make it rain' },
    run: function () {
      var el = document.createElement('div');
      el.className = 'rain';
      var chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789';
      var cols = Math.min(60, Math.floor(window.innerWidth / 12));
      var frames = 28;
      TB.Term.print({ node: el });
      return new Promise(function (resolve) {
        var i = 0;
        var timer = setInterval(function () {
          var rows = [];
          for (var r = 0; r < 8; r++) {
            var s = '';
            for (var c = 0; c < cols; c++) {
              s += Math.random() < 0.22 ? chars.charAt(Math.floor(Math.random() * chars.length)) : ' ';
            }
            rows.push(s);
          }
          el.textContent = rows.join('\n');
          if (++i >= frames) {
            clearInterval(timer);
            el.textContent = '';
            el.className = '';
            TB.Term.printAll([[{ t: ja() ? '…目を覚ましてください。' : '…wake up.', c: 'accent' }], '']);
            resolve([]);
          }
        }, 70);
      });
    }
  });

  def('sudo', {
    group: 'sys',
    hidden: true,
    desc: { ja: '管理者として実行する', en: 'run as root' },
    run: function () { return [[{ t: ui('sudo'), c: 'err' }]]; }
  });

  def('exit', {
    group: 'sys',
    hidden: true,
    desc: { ja: 'セッションを閉じる', en: 'close the session' },
    run: function () {
      TB.Term.printAll([[{ t: ui('bye'), c: 'dim' }]]);
      document.getElementById('inputline').style.visibility = 'hidden';
      var restore = function () {
        document.getElementById('inputline').style.visibility = '';
        TB.Term.printAll(['', [{ t: ja() ? '再接続しました。' : 'reconnected.', c: 'accent' }], '']);
        window.removeEventListener('keydown', restore);
        window.removeEventListener('click', restore);
      };
      setTimeout(function () {
        window.addEventListener('keydown', restore);
        window.addEventListener('click', restore);
      }, 100);
      return [];
    }
  });

  /* エイリアス */
  var ALIAS = {
    'll': 'ls', 'cls': 'clear', 'h': 'help', '?': 'help',
    links: 'contact', me: 'about', work: 'projects', logo: 'banner',
    ja: 'lang ja', en: 'lang en',
    usage: 'manual', commands: 'manual', guide: 'manual',
    'ヘルプ': 'help', '使い方': 'manual'
  };

  /* ---------- 行 → 素のテキスト ------------------------------------------ */
  /* grep や wc のように、表示用の行を文字として扱いたいときに使う */

  function plainSeg(seg) {
    if (typeof seg === 'string') return seg.replace(/\{[a-z0-9-]+:([^}]*)\}/gi, '$1');
    if (seg && seg.t !== undefined) return String(seg.t);
    return '';
  }

  function plainLine(line) {
    if (line === '' || line === null || line === undefined) return [''];
    if (typeof line === 'string') return [plainSeg(line)];
    if (Array.isArray(line)) return [line.map(plainSeg).join('')];
    if (line.hr) return ['────────────────────'];
    if (line.row) {
      var k = Array.isArray(line.row[0]) ? line.row[0].map(plainSeg).join('') : plainSeg(line.row[0]);
      var v = Array.isArray(line.row[1]) ? line.row[1].map(plainSeg).join('') : plainSeg(line.row[1]);
      return [k + '  ' + v];
    }
    if (line.block) {
      var out = [];
      (line.block.lines || []).forEach(function (l) { out = out.concat(plainLine(l)); });
      return out;
    }
    if (line.node) return String(line.node.textContent || '').split('\n');
    if (line.t !== undefined) return [String(line.t)];
    return [String(line)];
  }

  function plain(lines) {
    var out = [];
    (Array.isArray(lines) ? lines : [lines]).forEach(function (l) { out = out.concat(plainLine(l)); });
    return out;
  }

  /* ---------- 実行 ------------------------------------------------------ */

  function tokenize(input) {
    var m = input.trim().match(/"[^"]*"|'[^']*'|\S+/g) || [];
    return m.map(function (s) { return s.replace(/^["']|["']$/g, ''); });
  }

  function nearest(name) {
    // 編集距離 1〜2 の近いコマンドを探す（軽い実装）
    var best = null, bestScore = 3;
    Object.keys(registry).concat(Object.keys(ALIAS)).forEach(function (c) {
      var d = distance(name, c);
      if (d < bestScore) { bestScore = d; best = c; }
    });
    return best;
  }

  function distance(a, b) {
    var m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 99;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur.slice();
    }
    return prev[n];
  }

  /** games.js などから使う、行の受け取り役の差し替え */
  function setLineHandler(fn, label) {
    TB.lineHandler = fn || null;
    TB.Term.setPromptLabel(fn ? (label || '>') : null);
  }

  function run(input) {
    var raw = input.trim();
    if (!raw) return Promise.resolve();

    // 別名より、同じ名前の本物のコマンドを優先する
    if (!registry[raw.toLowerCase()] && ALIAS[raw.toLowerCase()]) raw = ALIAS[raw.toLowerCase()];
    var tokens = tokenize(raw);
    var name = tokens[0].toLowerCase();
    if (!registry[name] && ALIAS[name] && ALIAS[name].indexOf(' ') === -1) name = ALIAS[name];
    var args = tokens.slice(1);

    var cmd = registry[name];
    if (!cmd) {
      var guess = nearest(name);
      var out = [[{ t: ui('notfound')(tokens[0]), c: 'err' }]];
      if (guess) out.push([{ t: ui('didyoumean')(guess), c: 'dim' }]);
      else out.push([{ t: ja() ? 'help と入力すると一覧が出ます。' : 'type help for a list.', c: 'dim' }]);
      out.push('');
      TB.Term.printAll(out);
      return Promise.resolve();
    }

    var result;
    try {
      result = cmd.run(args, {});
    } catch (e) {
      TB.Term.printAll([[{ t: 'error: ' + e.message, c: 'err' }], '']);
      return Promise.resolve();
    }

    if (result && typeof result.then === 'function') {
      TB.Term.setBusy(true);
      return result.then(function (lines) {
        TB.Term.setBusy(false);
        if (lines && lines.length) TB.Term.printAll(lines);
      });
    }
    if (result && result.length) return TB.Term.typeAll(result, 14);
    return Promise.resolve();
  }

  /* ---------- 補完 ------------------------------------------------------ */

  function pathCandidates(prefix) {
    var slash = prefix.lastIndexOf('/');
    var dirPart = slash === -1 ? '.' : prefix.slice(0, slash + 1);
    var basePart = slash === -1 ? prefix : prefix.slice(slash + 1);
    var node = TB.fs.get(TB.fs.resolve(dirPart, TB.state.cwd));
    if (!node || node.type !== 'dir') return [];
    return Object.keys(node.children)
      .filter(function (n) { return n.indexOf(basePart) === 0 && (!node.children[n].hidden || basePart.charAt(0) === '.'); })
      .map(function (n) {
        return (slash === -1 ? '' : dirPart) + n + (node.children[n].type === 'dir' ? '/' : '');
      });
  }

  function candidates(value) {
    var trailingSpace = /\s$/.test(value);
    var tokens = tokenize(value);
    if (!tokens.length || (tokens.length === 1 && !trailingSpace)) {
      var pre = (tokens[0] || '').toLowerCase();
      return {
        start: value.length - (tokens[0] || '').length,
        list: Object.keys(registry).filter(function (c) {
          return !registry[c].hidden && c.indexOf(pre) === 0;
        })
      };
    }
    var cur = trailingSpace ? '' : tokens[tokens.length - 1];
    var cmd = tokens[0].toLowerCase();
    var list = [];
    if (cmd === 'cd' || cmd === 'cat' || cmd === 'ls') list = pathCandidates(cur);
    else if (cmd === 'theme') list = TB.themes.filter(function (n) { return n.indexOf(cur) === 0; });
    else if (cmd === 'lang') list = ['ja', 'en'].filter(function (n) { return n.indexOf(cur) === 0; });
    else if (cmd === 'crt') list = ['on', 'off'].filter(function (n) { return n.indexOf(cur) === 0; });
    else if (cmd === 'man' || cmd === 'manual') list = Object.keys(registry).filter(function (n) { return n.indexOf(cur) === 0; });
    else if (cmd === 'open') {
      list = (C.contact || []).map(function (c) { return c.label; })
        .concat((C.projects || []).filter(function (p) { return p.url; }).map(function (p) { return TB.slug(p.name); }))
        .filter(function (n) { return n.indexOf(cur) === 0; });
    }
    return { start: value.length - cur.length, list: list };
  }

  function commonPrefix(list) {
    if (!list.length) return '';
    var p = list[0];
    list.forEach(function (s) {
      while (s.indexOf(p) !== 0) p = p.slice(0, -1);
    });
    return p;
  }

  function complete() {
    var value = TB.Term.getValue();
    var c = candidates(value);
    if (!c.list.length) return;
    if (c.list.length === 1) {
      TB.Term.setValue(value.slice(0, c.start) + c.list[0] + (c.list[0].slice(-1) === '/' ? '' : ' '));
      return;
    }
    var p = commonPrefix(c.list);
    if (p && c.start + p.length > value.length) {
      TB.Term.setValue(value.slice(0, c.start) + p);
    } else {
      TB.Term.echo(value);
      TB.Term.printAll([{ block: { cls: 'grid-tags', lines: c.list.map(function (n) { return [[{ t: n, c: 'dim' }]]; }) } }]);
    }
  }

  /** 入力中に薄く出る候補（履歴 → コマンド名の順で探す） */
  function suggest(value) {
    if (!value.trim() || /\s$/.test(value)) return '';
    var h = TB.Term.history();
    for (var i = h.length - 1; i >= 0; i--) {
      if (h[i].indexOf(value) === 0 && h[i] !== value) return h[i];
    }
    if (!/\s/.test(value)) {
      var names = Object.keys(registry).filter(function (c) {
        return !registry[c].hidden && c.indexOf(value) === 0 && c !== value;
      }).sort();
      if (names.length === 1) return names[0];
    }
    return '';
  }

  TB.commands = registry;
  TB.groups = GROUPS;
  TB.plain = plain;
  TB.readNode = readNode;
  TB.def = def;
  TB.head = head;
  TB.alias = ALIAS;
  TB.setLineHandler = setLineHandler;
  TB.lineHandler = null;
  TB.run = run;
  TB.complete = complete;
  TB.suggest = suggest;
  TB.bannerLines = bannerLines;
})();
