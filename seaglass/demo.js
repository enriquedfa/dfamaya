/* ============================================================================
   Seaglass — the demo on the landing page.

   Drag a piece (a photo, a link, a message, a PDF) onto the phone's right
   edge, or tap it, and Seaglass's edge sidebar takes it: "Let go to save",
   "Got it", "Saved". Then the piece is filed the way the app files it:

     1. saved first (persist, then enrich: the app's core promise)
     2. enriched: the link preview, the thumbnail, a file's own words
     3. Seaglass's rules: a first kind and tags, on every phone (a port of
        KindRules + HeuristicAnalyzer's table, below)
     4. Gemini Nano: title, kind, tags and summary, overwriting the rules'
        answer wholesale, except a title that outranks it (a page's own)

   The four samples carry the kind of answer Nano gives (copied in shape from
   NanoPrompt's worked examples). A visitor's own drops (files, links, text
   dragged in from elsewhere) get the rules for real, in the browser; nothing
   is uploaded, and pictures stay object URLs in this tab.

   The UI is the app's, rebuilt: see seaglass.css for the dp sizes and colours.
============================================================================ */
(function () {
  'use strict';

  var root = document.querySelector('[data-seaglass-demo]');
  if (!root) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(sel, el) { return (el || root).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, reduce ? Math.min(ms, 120) : ms); }); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#k-' + name + '"></use></svg>'; }

  var screen = $('[data-screen]');
  var libView = $('[data-view="library"]');
  var detView = $('[data-view="detail"]');
  var gridEl = $('[data-grid]');
  var chipsEl = $('[data-kind-chips]');
  var searchEl = $('[data-search]');
  var emptyEl = $('[data-empty]');
  var nomatchEl = $('[data-nomatch]');
  var sidebar = $('[data-sidebar]');
  var sdLabel = $('[data-sd-label]');
  var sdSaved = $('[data-sd-saved]');
  var sdUndo = $('[data-sd-undo]');
  var sdOpen = $('[data-sd-open]');
  var sdBox = $('.sd-box', sidebar);

  function dp() { return screen.clientWidth / 411; }

  /* --------------------------------------------------------------------------
     What the app knows: kinds (Kind.kt, KindLabels.kt), which kinds each type
     may be (kindsFor) and each type's own word (genericFor)
  -------------------------------------------------------------------------- */
  var KINDS = {
    NOTE: ['Note', 'Notes', 'text-fields'], QUOTE: ['Quote', 'Quotes', 'format-quote'], LIST: ['List', 'Lists', 'checklist'],
    ARTICLE: ['Article', 'Articles', 'feed'], VIDEO: ['Video', 'Videos', 'movie'], PRODUCT: ['Product', 'Products', 'shopping-bag'],
    RECIPE: ['Recipe', 'Recipes', 'restaurant'], PLACE: ['Place', 'Places', 'location-on'], EVENT: ['Event', 'Events', 'event'],
    PAGE: ['Page', 'Pages', 'link'], PHOTO: ['Photo', 'Photos', 'image'], SCREENSHOT: ['Screenshot', 'Screenshots', 'screenshot-monitor'],
    MEME: ['Meme', 'Memes', 'sentiment-very-satisfied'], ARTWORK: ['Artwork', 'Artworks', 'palette'],
    DOCUMENT: ['Document', 'Documents', 'description'], APP: ['App', 'Apps', 'android'], AUDIO: ['Audio', 'Audio', 'music-note'],
    FILE: ['File', 'Files', 'draft']
  };
  var KIND_ORDER = Object.keys(KINDS);
  var KINDS_FOR = {
    TEXT: ['NOTE', 'QUOTE', 'LIST'],
    LINK: ['ARTICLE', 'VIDEO', 'PRODUCT', 'RECIPE', 'PLACE', 'EVENT', 'PAGE'],
    IMAGE: ['PHOTO', 'SCREENSHOT', 'MEME', 'ARTWORK', 'DOCUMENT'],
    FILE: ['DOCUMENT', 'APP', 'VIDEO', 'AUDIO', 'FILE']
  };
  var GENERIC = { TEXT: 'NOTE', LINK: 'PAGE', IMAGE: 'PHOTO', FILE: 'FILE' };
  function allowed(type, kind) { return KINDS_FOR[type].indexOf(kind) >= 0; }

  /* The made-up apps the pieces come from. A card's footer takes the
     primaryContainer of a scheme grown from the app's icon colour, light and
     dark, as the app's renders draw it (sampled from them) */
  var APPS = {
    browser: { name: 'Browser', color: '#2F6FDB', band: ['#DEE0FF', '#2C4482'], on: ['#001A43', '#DEE0FF'] },
    gallery: { name: 'Gallery', color: '#E0567A', band: ['#FFD9DF', '#7E2740'], on: ['#3F0017', '#FFD9DF'] },
    messages: { name: 'Messages', color: '#2E9E6A', band: ['#9AF5C5', '#005233'], on: ['#002112', '#9AF5C5'] },
    files: { name: 'Files', color: '#1A9AA8', band: ['#97F0FF', '#004F58'], on: ['#001F24', '#97F0FF'] },
    notes: { name: 'Notes', color: '#8E62D9', band: ['#EBDDFF', '#5B3E96'], on: ['#25005A', '#EBDDFF'] }
  };

  /* --------------------------------------------------------------------------
     Seaglass's rules, ported from KindRules.kt and HeuristicAnalyzer.kt.
     First match wins. Host rows match the host or the URL (www. stripped);
     word rows match whole words in the title, the page's words and the text.
  -------------------------------------------------------------------------- */
  var RULES = [
    { tags: ['video'], mime: 'video/' },
    { tags: ['document'], mime: 'application/pdf' },
    { kind: 'VIDEO', tags: ['video'], hosts: ['youtube.', 'youtu.be', 'vimeo.', 'tiktok.', 'twitch.', 'netflix.', 'dailymotion.'] },
    { kind: 'PRODUCT', tags: ['shopping'], hosts: ['amazon.', 'ebay.', 'aliexpress.', 'etsy.', 'mercadolibre.', 'walmart.', 'liverpool.com', 'target.com', 'bestbuy.', 'shein.', 'temu.', 'ikea.', 'costco.', 'shopify.'] },
    { tags: ['code'], hosts: ['github.', 'gitlab.', 'stackoverflow.', 'developer.android.', 'kotlinlang.', 'android.com', 'npmjs.', 'pypi.', 'docs.python.', 'dev.to', 'news.ycombinator.'] },
    { tags: ['travel'], hosts: ['airbnb.', 'booking.com', 'expedia.', 'tripadvisor.', 'skyscanner.', 'kayak.', 'despegar.'] },
    { kind: 'PLACE', tags: ['place'], hosts: ['maps.google.', 'maps.app.goo.gl', 'goo.gl/maps', 'waze.', 'maps.apple.'] },
    { kind: 'RECIPE', tags: ['recipe'], hosts: ['allrecipes.', 'seriouseats.', 'bonappetit.', 'tasty.co', 'kiwilimon.', 'cookpad.', 'epicurious.'] },
    { kind: 'EVENT', tags: ['event'], hosts: ['eventbrite.', 'meetup.', 'ticketmaster.', 'dice.fm', 'luma.', 'boletia.'] },
    { tags: ['inspiration'], hosts: ['pinterest.', 'dribbble.', 'behance.', 'unsplash.', 'instagram.'] },
    { kind: 'ARTICLE', tags: ['reference'], hosts: ['wikipedia.', 'wikihow.', 'britannica.'] },
    { kind: 'ARTICLE', tags: ['article'], hosts: ['medium.', 'substack.', 'nytimes.', 'theverge.', 'bbc.', 'elpais.', 'theguardian.', 'wired.'] },
    { kind: 'RECIPE', tags: ['recipe'], words: ['recipe', 'receta', 'ingredients', 'ingredientes', 'tbsp', 'cucharada', 'preheat', 'precalienta'] },
    { tags: ['travel'], words: ['flight', 'vuelo', 'boarding pass', 'pase de abordar', 'itinerary', 'itinerario', 'check-in'] },
    { kind: 'EVENT', tags: ['event'], words: ['concert', 'concierto', 'tickets', 'boletos', 'rsvp', 'conference', 'conferencia', 'webinar'] },
    { kind: 'PRODUCT', tags: ['shopping'], words: ['add to cart', 'agregar al carrito', 'buy', 'comprar', 'sale', 'oferta', 'discount', 'descuento', 'free shipping', 'envío gratis'] },
    { tags: ['code'], words: ['```', 'kotlin', 'javascript', 'typescript', 'python', 'stack trace', 'api key', 'regex'] }
  ];

  // A file's kind is a fact: its MIME type or extension (KindRules' table)
  var FACTS = [
    { kind: 'APP', mime: ['application/vnd.android.package-archive'], ext: ['apk', 'apks', 'xapk', 'apkm'] },
    { kind: 'VIDEO', mime: ['video/'], ext: ['mp4', 'mkv', 'webm', 'mov', '3gp', 'avi'] },
    { kind: 'AUDIO', mime: ['audio/'], ext: ['mp3', 'm4a', 'ogg', 'opus', 'wav', 'flac', 'aac', 'amr'] },
    { kind: 'DOCUMENT', mime: ['application/pdf', 'application/msword', 'application/rtf', 'application/vnd.openxmlformats-officedocument.', 'application/vnd.ms-', 'application/vnd.oasis.opendocument.', 'text/plain', 'text/markdown', 'text/csv'], ext: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'md', 'csv'] }
  ];

  var LIST_LINE = /^([-*•·▪◦–]|\d{1,3}[.)]|\[[ xX]?\])\s*\S.*/;
  var QUOTE_SHAPE = /^["“«„].+["”»](\s*[—―–-]\s*\S.*)?$/;
  var SECOND_LEVEL = ['co', 'com', 'org', 'net', 'gob', 'gov', 'ac', 'edu'];

  function hostOf(url) {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function extOf(name) { var m = /\.([a-z0-9]{1,6})$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function siteName(host) {
    var l = host.split('.').filter(Boolean);
    if (l.length < 2) return null;
    var i = l.length - 2;
    if (l.length >= 3 && SECOND_LEVEL.indexOf(l[i]) >= 0) i--;
    return l[i] && l[i].length > 1 ? l[i] : null;
  }
  function wordIn(word, text) {
    if (!/^[\p{L}\p{N}]/u.test(word)) return text.indexOf(word) >= 0;
    var w = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?<![\\p{L}\\p{N}])' + w + '(?![\\p{L}\\p{N}])', 'iu').test(text);
  }
  function normTag(t) {
    var s = String(t).trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, ' ');
    return s.slice(0, 32);
  }
  function factFor(item) {
    if (item.type !== 'FILE') return null;
    var mime = (item.mime || '').toLowerCase(), ext = extOf(item.fileName);
    for (var i = 0; i < FACTS.length; i++) {
      var f = FACTS[i];
      var byMime = f.mime.some(function (m) { return /[\/.]$/.test(m) ? mime.indexOf(m) === 0 : mime === m; });
      if (byMime || f.ext.indexOf(ext) >= 0) return f.kind;
    }
    return 'FILE';
  }
  function firstRule(item) {
    var host = item.url ? hostOf(item.url) : '';
    var url = (item.url || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
    var words = [item.title, item.page && item.page.title, item.page && item.page.description, item.rawText].filter(Boolean).join('\n');
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (r.mime && (item.mime || '').indexOf(r.mime) === 0) return { rule: r, why: 'its type, ' + item.mime };
      if (r.hosts && host) {
        for (var h = 0; h < r.hosts.length; h++) {
          if (host.indexOf(r.hosts[h]) >= 0 || url.indexOf(r.hosts[h]) >= 0) return { rule: r, why: 'the site, ' + host };
        }
      }
      if (r.words && words) {
        for (var w = 0; w < r.words.length; w++) {
          if (wordIn(r.words[w], words)) return { rule: r, why: 'the word “' + r.words[w] + '”' };
        }
      }
    }
    return null;
  }
  function shapeOf(text) {
    var t = (text || '').trim();
    var lines = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (lines.length >= 3 && lines.filter(function (l) { return LIST_LINE.test(l); }).length * 3 >= lines.length * 2) return 'LIST';
    if (QUOTE_SHAPE.test(t)) return 'QUOTE';
    return null;
  }
  // KindRules.decide: a fact, a tag that names a kind, the analyzer's answer, a guess, the type's own word
  function decide(item, answer) {
    var fact = factFor(item);
    if (fact) return { kind: fact, source: 'file', why: 'its file type' };
    var tagged = item.tags.some(function (t) { return t.name === 'meme' || t.name === 'memes'; });
    if (tagged && allowed(item.type, 'MEME')) return { kind: 'MEME', source: 'auto', why: 'the tag “meme”' };
    if (answer && allowed(item.type, answer)) return { kind: answer, source: 'nano', why: 'Gemini Nano' };
    if (item.type === 'TEXT') {
      var shape = shapeOf(item.rawText);
      if (shape) return { kind: shape, source: 'auto', why: shape === 'LIST' ? 'its shape: lines that start like a list' : 'its shape: words in quotes, then who said them' };
    }
    if (item.type === 'IMAGE' && /screenshot|captura[ _]de[ _]pantalla/i.test(item.fileName || '')) {
      return { kind: 'SCREENSHOT', source: 'auto', why: 'its file name' };
    }
    if (item.type === 'LINK' && item.page && item.page.markup && allowed('LINK', item.page.markup)) {
      return { kind: item.page.markup, source: 'auto', why: 'the page’s own markup' };
    }
    var hit = firstRule(item);
    if (hit && hit.rule.kind && allowed(item.type, hit.rule.kind)) return { kind: hit.rule.kind, source: 'auto', why: hit.why };
    return { kind: GENERIC[item.type], source: 'auto', why: 'what it is: ' + { TEXT: 'words', LINK: 'a link', IMAGE: 'a picture', FILE: 'a file' }[item.type] };
  }
  // HeuristicAnalyzer.file: the rule's tags, the site's name, up to three #hashtags; normalised, at most six
  function heuristicTags(item) {
    var out = [];
    var hit = firstRule(item);
    if (hit) out = out.concat(hit.rule.tags);
    if (item.url) { var s = siteName(hostOf(item.url)); if (s) out.push(s); }
    var re = /(?<![\p{L}\p{N}_#])#([\p{L}\p{N}_]{2,30})/gu, m, n = 0;
    while ((m = re.exec(item.rawText || '')) && n < 3) { out.push(m[1]); n++; }
    var seen = {};
    return out.map(normTag).filter(function (t) { if (!t || seen[t]) return false; seen[t] = 1; return true; }).slice(0, 6);
  }
  function firstSentence(text) {
    if (!text) return null;
    var t = text.replace(/\s+/g, ' ').trim();
    t = t.split(/(?<=[.!?])\s/)[0];
    if (t.length > 160) t = t.slice(0, 160).replace(/\s+\S*$/, '') + '…';
    return t;
  }

  /* --------------------------------------------------------------------------
     The four samples. "nano" is the shape of answer Gemini Nano gives
     ({"title","kind","tags","summary"}), written for each by hand.
  -------------------------------------------------------------------------- */
  var NOTE_TEXT = 'Dinner with Ana on Friday at 8pm at Casa Lola, 221 Baker Street. Call 555-0142 to book a table.';
  var SAMPLES = {
    photo: {
      type: 'IMAGE', app: 'gallery', fileName: 'IMG_2041.jpg', mime: 'image/jpeg',
      picture: { src: 'img/samples/beach.svg', aspect: 0.75 },
      nano: { title: 'Sunset over a calm beach', kind: 'PHOTO', tags: ['sunset', 'beach', 'palm tree', 'ocean'], summary: 'A palm tree silhouetted against an orange sunset over the sea.' }
    },
    link: {
      type: 'LINK', app: 'browser', url: 'https://noodlenotes.blog/miso-ramen',
      page: {
        title: 'Miso Ramen at Home (30-Minute Recipe)',
        description: 'A rich miso broth, springy noodles and jammy eggs, with ingredients from any store.',
        image: 'img/samples/ramen.svg', aspect: 0.525, markup: 'RECIPE'
      },
      nano: { title: '30-minute miso ramen', kind: 'RECIPE', tags: ['ramen', 'recipe', 'japanese', 'noodles', 'dinner'], summary: 'A quick miso ramen with a rich broth, springy noodles and jammy eggs.' }
    },
    note: {
      type: 'TEXT', app: 'messages', rawText: NOTE_TEXT,
      marks: [['Friday at 8pm', 'date'], ['221 Baker Street', 'address'], ['555-0142', 'phone']],
      nano: { title: 'Dinner with Ana on Friday', kind: 'NOTE', tags: ['dinner', 'plans', 'casa lola', 'friday'], summary: 'Dinner with Ana at Casa Lola on Friday at 8 pm; call ahead to book.' }
    },
    file: {
      type: 'FILE', app: 'files', fileName: 'lease-agreement.pdf', mime: 'application/pdf', size: '1.2 MB',
      thumb: { src: 'img/samples/lease.svg', aspect: 1.294 },
      words: 'Residential lease agreement. Term: 12 months from November 1, 2026. Monthly rent, deposit and house rules.',
      nano: { title: 'Apartment lease, 2026–27', kind: 'DOCUMENT', tags: ['lease', 'apartment', 'contract', 'rent'], summary: 'A 12-month apartment lease from November 1, with rent and deposit terms.' }
    }
  };

  /* --------------------------------------------------------------------------
     The library
  -------------------------------------------------------------------------- */
  var nextId = 1;
  var DAY = 864e5, now = Date.now();
  function tag(name, source) { return { name: name, source: source || 'AI' }; }
  function makeItem(o) {
    return Object.assign({
      id: nextId++, type: 'TEXT', app: null, createdAt: Date.now(), title: null, titleSource: null,
      rawText: null, url: null, page: null, picture: null, fileName: null, mime: null, kind: null, kindSource: 'auto',
      summary: null, tags: [], state: 'pending', analyzedBy: null, enriched: false, marks: null, snippet: null,
      supporting: null, tile: null
    }, o);
  }

  var items = [
    makeItem({
      type: 'TEXT', app: 'browser', createdAt: now - DAY - 3.2 * 36e5, kind: 'QUOTE', state: 'done', analyzedBy: 'nano',
      rawText: '“The best way to predict the future is to invent it.” — Alan Kay', kindSource: 'nano',
      summary: 'Alan Kay on inventing the future rather than predicting it.', tags: [tag('quote'), tag('alan kay'), tag('future')], key: 'seed-quote'
    }),
    makeItem({
      type: 'IMAGE', app: 'gallery', createdAt: now - 6 * DAY, title: 'Lake below the peaks', fileName: 'IMG_1987.jpg', kind: 'PHOTO',
      picture: { src: 'img/samples/mountains.svg', aspect: 1.333 }, state: 'done', analyzedBy: 'nano', kindSource: 'nano',
      summary: 'A small sailboat on a mountain lake below snowy peaks.', tags: [tag('lake'), tag('mountains'), tag('sailboat')], key: 'seed-lake'
    }),
    makeItem({
      type: 'LINK', app: 'browser', createdAt: now - 2 * DAY, kind: 'ARTICLE', state: 'done', analyzedBy: 'nano', kindSource: 'nano',
      url: 'https://fieldnotes.blog/why-stories-stick', enriched: true, title: 'Why we remember stories better than facts', titleSource: 'PAGE',
      page: { title: 'Why we remember stories better than facts', description: 'Memory researchers on why a narrative sticks when a list of facts slips away.' },
      summary: 'Why a story is easier to remember than a list of facts.', tags: [tag('memory'), tag('reading'), tag('fieldnotes')], key: 'seed-article'
    }),
    makeItem({
      type: 'TEXT', app: 'messages', createdAt: now - 3 * DAY, kind: 'NOTE', state: 'done', analyzedBy: 'nano', kindSource: 'nano',
      rawText: 'Saturday: farmers market at 9, then the ferry at ten. Bring the big tote.', title: 'Saturday plans',
      summary: 'Market at nine, then the ten o’clock ferry.', tags: [tag('weekend'), tag('plans')], key: 'seed-plans'
    }),
    makeItem({
      type: 'TEXT', app: 'notes', createdAt: now - 7 * DAY, kind: 'LIST', state: 'done', analyzedBy: 'nano', kindSource: 'nano',
      rawText: 'Groceries\n- oat milk\n- coffee beans\n- miso paste\n- eggs',
      summary: 'A short grocery list: oat milk, coffee beans, miso paste and eggs.', tags: [tag('groceries'), tag('shopping list')], key: 'seed-list'
    })
  ];

  var filter = { query: '', kinds: [] };

  function shortDate(t) {
    var d = new Date(t), today = new Date();
    var y = new Date(today); y.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    var o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== today.getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString('en-US', o);
  }
  function longDate(t) {
    return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function bandStyle(item) {
    var a = item.app && APPS[item.app];
    if (!a) return '';
    return '--band:light-dark(' + a.band[0] + ',' + a.band[1] + ');--on-band:light-dark(' + a.on[0] + ',' + a.on[1] + ')';
  }
  function appDot(item) {
    var a = item.app && APPS[item.app];
    return a ? '<i class="app-dot" style="--app:' + a.color + '"></i>' : '';
  }
  // Clamp a picture to 1/3 … 1.2 of its width, as ItemPicture does
  function clampAspect(a) { return Math.min(1.2, Math.max(1 / 3, a || 1.2)); }
  function formatWord(item) { var e = extOf(item.fileName); return e ? e.toUpperCase() : null; }

  // What a card says, by type (ItemCard's cardText)
  function cardParts(item) {
    var p = { pic: null, head: null, body: null, supp: null, snippet: null, tile: null };
    if (item.type === 'TEXT') {
      p.body = item.rawText;
      // Its own title, if the analyzer gave one, unless it is the words themselves
      if (item.title && (item.rawText || '').trim() !== item.title.trim()) p.head = item.title;
    } else if (item.type === 'LINK') {
      var host = hostOf(item.url);
      if (item.enriched && item.page) {
        if (item.page.image) p.pic = { src: item.page.image, aspect: item.page.aspect };
        p.head = item.title;
        p.supp = item.page.description;
      } else {
        p.head = item.rawText && item.rawText !== item.url ? item.rawText : host;
        p.supp = item.rawText && item.rawText !== item.url ? host : null;
      }
    } else if (item.type === 'IMAGE') {
      p.pic = item.picture;
      p.head = item.title || item.fileName;
    } else {
      if (item.picture) p.pic = item.picture;
      else if (item.snippet) p.snippet = item.snippet;
      else p.tile = KINDS[item.kind || 'FILE'][2];
      p.head = item.title || item.fileName;
      // The format in caps, unless the name already ends in it ("lease.pdf")
      var fw = formatWord(item);
      p.supp = item.supporting || (fw && !(p.head || '').toUpperCase().endsWith('.' + fw) ? fw : null);
    }
    return p;
  }

  function cardHTML(item) {
    var p = cardParts(item), h = '';
    if (p.pic) {
      h += '<div class="pic' + (p.pic.wait ? ' wait' : '') + '" style="aspect-ratio:1/' + clampAspect(p.pic.aspect) + '">' +
        (p.pic.src ? '<img src="' + esc(p.pic.src) + '" alt="" draggable="false" />' : '') +
        (item.kind === 'VIDEO' ? '<span class="play"></span>' : '') + '</div>';
    } else if (p.tile) {
      h += '<div class="tile-ico">' + icon(p.tile) + '</div>';
    }
    var txt = '';
    if (p.head) txt += '<p class="headline">' + esc(p.head) + '</p>';
    if (p.body) txt += '<p class="body">' + esc(p.body.slice(0, 1500)) + '</p>';
    if (p.snippet) txt += '<pre class="snippet">' + esc(p.snippet) + '</pre>';
    if (p.supp) txt += '<p class="supp">' + esc(p.supp) + '</p>';
    h += '<div class="txt">' + txt + '</div>';
    var k = KINDS[item.kind || GENERIC[item.type]];
    var kw = item.state === 'filing'
      ? '<span class="kw"><i class="loading"></i><span>Filing…</span></span>'
      : '<span class="kw">' + icon(k[2]) + '<span>' + k[0] + '</span></span>';
    h += '<footer class="band">' + kw + '<span class="when">' + appDot(item) + shortDate(item.createdAt) + '</span></footer>';
    return h;
  }

  function matches(item) {
    if (filter.kinds.length && filter.kinds.indexOf(item.kind) < 0) return false;
    var q = filter.query.trim().toLowerCase();
    if (!q) return true;
    // The FTS columns: title, words, description, and a picture's caption
    var hay = [item.title, item.rawText, item.page && item.page.description, item.supporting, item.fileName,
      item.type === 'IMAGE' ? item.summary : null].filter(Boolean).join(' ').toLowerCase();
    return q.split(/\s+/).every(function (w) { return new RegExp('(^|[^\\p{L}\\p{N}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u').test(hay); });
  }

  function renderChips() {
    var present = {};
    items.forEach(function (it) { if (it.kind) present[it.kind] = 1; });
    filter.kinds.forEach(function (k) { present[k] = 1; });
    var kinds = KIND_ORDER.filter(function (k) { return present[k]; });
    chipsEl.innerHTML = kinds.map(function (k) {
      var on = filter.kinds.indexOf(k) >= 0;
      return '<button type="button" class="chip-k" data-kind="' + k + '" aria-pressed="' + on + '">' + icon(on ? 'check' : KINDS[k][2]) + KINDS[k][1] + '</button>';
    }).join('');
  }

  // Two lanes, each card into the shorter one: LazyVerticalStaggeredGrid at 160 dp cells on a phone
  function renderGrid(opts) {
    opts = opts || {};
    var before = {};
    if (!reduce) $$('.kcard', gridEl).forEach(function (c) { before[c.dataset.id] = c.getBoundingClientRect(); });
    var shown = items.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).filter(matches);
    gridEl.innerHTML = '<div class="lane"></div><div class="lane"></div>';
    var lanes = $$('.lane', gridEl);
    shown.forEach(function (item) {
      var el = document.createElement('article');
      el.className = 'kcard' + (opts.fresh === item.id ? ' is-new' : '');
      el.dataset.id = item.id;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', 'Open ' + (item.title || item.fileName || hostOf(item.url || '') || (item.rawText || '').slice(0, 40)));
      el.style.cssText = bandStyle(item);
      el.innerHTML = cardHTML(item);
      var lane = lanes[0].offsetHeight <= lanes[1].offsetHeight ? lanes[0] : lanes[1];
      lane.appendChild(el);
    });
    emptyEl.hidden = items.length > 0;
    nomatchEl.hidden = !(items.length > 0 && shown.length === 0);
    renderChips();
    // FLIP: cards that moved slide from where they were
    if (!reduce) {
      $$('.kcard', gridEl).forEach(function (c) {
        var b = before[c.dataset.id];
        if (!b) return;
        var a = c.getBoundingClientRect();
        var dx = b.left - a.left, dy = b.top - a.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
          { duration: 450, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      });
    }
  }

  // Update one card in place (filing, enrichment) without re-flowing the rest
  function refreshCard(item) {
    var el = gridEl.querySelector('.kcard[data-id="' + item.id + '"]');
    if (!el) return;
    var h = el.offsetHeight;
    el.style.cssText = bandStyle(item);
    el.innerHTML = cardHTML(item);
    if (el.offsetHeight !== h) renderGrid();
    else renderChips();
  }

  /* --------------------------------------------------------------------------
     A piece's screen
  -------------------------------------------------------------------------- */
  var openId = null, autoOpened = false, touchedAt = 0;

  function marked(text, marks) {
    if (!marks || !marks.length) return esc(text);
    var out = '', i = 0;
    var spans = marks.map(function (m) { var s = text.indexOf(m[0]); return [s, s + m[0].length]; })
      .filter(function (s) { return s[0] >= 0; }).sort(function (a, b) { return a[0] - b[0]; });
    spans.forEach(function (s) {
      if (s[0] < i) return;
      out += esc(text.slice(i, s[0])) + '<mark>' + esc(text.slice(s[0], s[1])) + '</mark>';
      i = s[1];
    });
    return out + esc(text.slice(i));
  }

  function kindOverline(item) {
    if (item.state === 'filing') return 'Kind · Gemini Nano is filing…';
    return { file: 'Kind · File type', nano: 'Kind · Gemini Nano', user: 'Kind · Your pick', auto: 'Kind · Auto' }[item.kindSource] || 'Kind · Auto';
  }

  function detailHTML(item, popTags) {
    var h = '', k = KINDS[item.kind || GENERIC[item.type]];
    var hero = item.type === 'IMAGE' ? item.picture
      : item.type === 'LINK' ? (item.enriched && item.page && item.page.image ? { src: item.page.image, aspect: item.page.aspect } : null)
      : item.picture;
    if (hero && hero.src) {
      h += '<div class="hero' + (hero.wait ? ' wait' : '') + '" style="aspect-ratio:1/' + clampAspect(hero.aspect) + '"><img src="' + esc(hero.src) + '" alt="" draggable="false" /></div>';
      h += '<button type="button" class="back" data-back aria-label="Back">' + icon('arrow-back') + '</button>';
    } else {
      h += '<div class="det-top"></div><button type="button" class="back plain" data-back aria-label="Back">' + icon('arrow-back') + '</button>';
    }
    var title = item.title || (item.type === 'LINK' ? hostOf(item.url) : item.type === 'TEXT' ? null : item.fileName);
    if (title) h += '<p class="d-title">' + esc(title) + '</p>';
    var src = item.app ? APPS[item.app].name + ' · ' : '';
    h += '<p class="d-src">' + appDot(item) + '<span>' + esc(src + longDate(item.createdAt)) + '</span></p>';

    // What it holds: the words, what the content says about itself, where it lives
    var g1 = '';
    if (item.type === 'TEXT') g1 += '<div class="tile words">' + marked(item.rawText, item.marks) + '</div>';
    if (item.type === 'LINK' && item.enriched && item.page && item.page.description) g1 += '<div class="tile blurb">' + esc(item.page.description) + '</div>';
    if (item.type === 'FILE' && item.snippet) g1 += '<div class="tile snip">' + esc(item.snippet) + '</div>';
    if (item.type === 'FILE' && item.supporting && !item.snippet) g1 += '<div class="tile blurb">' + esc(item.supporting) + '</div>';
    if (item.type === 'LINK') {
      g1 += '<div class="tile row"><span class="lead">' + icon('language') + '</span><span class="mid"><span class="main">' + esc(hostOf(item.url)) +
        '</span><span class="sub addr">' + esc(item.url) + '</span></span>' + '<svg class="trail" viewBox="0 0 24 24" aria-hidden="true"><use href="#k-open-in-new"></use></svg></div>';
    }
    if (item.type === 'IMAGE' || item.type === 'FILE') {
      g1 += '<div class="tile row"><span class="lead">' + icon('attach-file') + '</span><span class="mid"><span class="main">' + esc(item.fileName) +
        '</span>' + (item.size ? '<span class="sub">' + esc(item.size) + '</span>' : '') + '</span>' +
        '<svg class="trail" viewBox="0 0 24 24" aria-hidden="true"><use href="#k-open-in-new"></use></svg></div>';
    }
    if (g1) h += '<div class="group">' + g1 + '</div>';

    // How it is filed: the kind tile (with the summary) and the tags
    var g2 = '<div class="tile row ktile"><span class="lead' + (item.state === 'filing' ? ' busy' : '') + '">' + icon(k[2]) + '</span><span class="mid">' +
      '<span class="over">' + kindOverline(item) + '</span><span class="main">' + k[0] + '</span>' +
      (item.summary ? '<span class="sub">' + esc(item.summary) + '</span>' : '') + '</span>' +
      '<svg class="trail" viewBox="0 0 24 24" aria-hidden="true"><use href="#k-arrow-drop-down"></use></svg></div>';
    g2 += '<div class="tile tags">' + item.tags.map(function (t) {
      return '<span class="tag' + (popTags && popTags.indexOf(t.name) >= 0 ? ' pop' : '') + '">' + esc(t.name) + icon('close') + '</span>';
    }).join('') + '<span class="tag add">' + icon('add') + 'Add tag</span></div>';
    h += '<div class="group">' + g2 + '</div>';

    // The floating toolbar and its main action (primaryAction)
    var tools = item.type === 'TEXT' ? ['edit', 'share', 'delete'] : item.type === 'IMAGE' ? ['edit', 'share', 'open-in-new', 'delete'] : ['edit', 'content-copy', 'share', 'delete'];
    var fab = item.type === 'TEXT' ? 'content-copy' : item.type === 'IMAGE' ? 'fullscreen' : 'open-in-new';
    return '<div class="det-in">' + h + '</div><div class="fabbar" aria-hidden="true"><div class="toolbar">' +
      tools.map(function (t) { return '<span>' + icon(t) + '</span>'; }).join('') + '</div><span class="fab">' + icon(fab) + '</span></div>';
  }

  var shownTags = [];
  function renderDetail(item, entering) {
    var top = detView.scrollTop;
    var names = item.tags.map(function (t) { return t.name; });
    var fresh = entering ? [] : names.filter(function (n) { return shownTags.indexOf(n) < 0; });
    detView.innerHTML = detailHTML(item, fresh);
    shownTags = names;
    detView.scrollTop = entering ? 0 : top;
    heroStatus();
  }
  function heroStatus() {
    var hero = $('.hero', detView);
    screen.classList.toggle('on-hero', !detView.hidden && !!hero && detView.scrollTop < hero.offsetHeight - 32 * dp());
  }
  detView.addEventListener('scroll', heroStatus, { passive: true });

  function openDetail(id, auto) {
    var item = byId(id);
    if (!item) return;
    openId = id;
    autoOpened = !!auto;
    renderDetail(item, true);
    detView.hidden = false;
    detView.classList.remove('is-entering');
    void detView.offsetWidth;
    detView.classList.add('is-entering');
    heroStatus();
  }
  function closeDetail() {
    openId = null;
    autoOpened = false;
    detView.hidden = true;
    screen.classList.remove('on-hero');
    renderGrid();
  }
  function byId(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }

  // Something changed about a piece: its card, and its screen if open
  function changed(item) {
    refreshCard(item);
    if (openId === item.id) renderDetail(item, false);
  }

  /* --------------------------------------------------------------------------
     The filing log beside the phone
  -------------------------------------------------------------------------- */
  var logPiece = $('[data-log-piece]');
  var logJson = $('[data-log-json]');
  var logEmpty = $('[data-log-empty]');
  var steps = {};
  $$('[data-step]').forEach(function (li) {
    var note = $('[data-note]', li), title = $('strong', li);
    steps[li.dataset.step] = { li: li, note: note, title: title, noteDefault: note.innerHTML, titleDefault: title.textContent };
  });
  var logFor = null;
  function logStart(item, name) {
    logFor = item.id;
    logPiece.textContent = name;
    // The first piece opens the log: until then it is one line, not four empty steps
    if (!logEmpty.hidden) {
      logEmpty.hidden = true;
      logPiece.hidden = false;
      $('[data-log-steps]').hidden = false;
      $('[data-log-fine]').hidden = false;
    }
    Object.keys(steps).forEach(function (k) {
      var s = steps[k];
      s.li.className = '';
      s.note.innerHTML = s.noteDefault;
      s.title.textContent = s.titleDefault;
    });
    logJson.hidden = true;
    logJson.innerHTML = '';
  }
  function logStep(item, name, state, note, title) {
    if (logFor !== item.id) return;
    var s = steps[name];
    s.li.className = state ? 'is-' + state : '';
    if (note != null) s.note.innerHTML = note;
    if (title) s.title.textContent = title;
  }
  function jsonText(a) {
    return '{\n  "title": ' + JSON.stringify(a.title) + ',\n  "kind": ' + JSON.stringify(a.kind) +
      ',\n  "tags": [' + a.tags.map(function (t) { return JSON.stringify(t); }).join(', ') + '],\n  "summary": ' + JSON.stringify(a.summary) + '\n}';
  }
  function jsonHTML(text, done) {
    var h = esc(text).replace(/(&quot;(?:title|kind|tags|summary)&quot;)(:)/g, '<span class="k">$1</span>$2');
    return done ? h : h + '<span class="caret"></span>';
  }
  // Nano streams its answer; so does the log
  async function streamJson(item, answer, alive) {
    if (logFor !== item.id) return;
    var text = jsonText(answer);
    logJson.hidden = false;
    var n = 0, step = Math.max(2, Math.ceil(text.length / 60));
    while (n < text.length) {
      if (!alive() || logFor !== item.id) return;
      n = Math.min(text.length, n + step);
      logJson.innerHTML = jsonHTML(text.slice(0, n), n >= text.length);
      await sleep(26);
    }
  }

  /* --------------------------------------------------------------------------
     Filing: one piece at a time, like TaggingCoordinator draining PENDING
  -------------------------------------------------------------------------- */
  var queue = [], busy = false;
  function enqueue(item) { queue.push(item); if (!busy) drain(); }
  async function drain() {
    busy = true;
    while (queue.length) {
      var item = queue.shift();
      if (byId(item.id)) await file(item);
    }
    busy = false;
  }

  function nameOf(item) {
    return item.fileName || (item.url ? hostOf(item.url) + new URL(item.url).pathname.replace(/\/$/, '') : '“' + (item.rawText || '').slice(0, 28).trim() + ((item.rawText || '').length > 28 ? '…' : '') + '”');
  }

  async function file(item) {
    var alive = function () { return !!byId(item.id); };
    logStart(item, nameOf(item));
    logStep(item, 'saved', 'done', 'In the library before anything else, so a drop is never lost. ' +
      (item.type === 'IMAGE' || item.type === 'FILE' ? 'Its bytes are copied in first, so it keeps working after the other app forgets it.' : ''));

    // A sample opens on its own, as Open in the sidebar does, if nothing else is open
    if (item.sample && openId === null && Date.now() - touchedAt > 2500) {
      await sleep(700);
      if (!alive()) return;
      if (openId === null) openDetail(item.id, true);
    }

    // 2. Enrichment (WorkManager): the unfurl, the thumbnail, a file's words
    if (item.type === 'LINK') {
      if (item.page) {
        logStep(item, 'enrich', 'busy', 'Fetching the page’s head from <b>' + esc(hostOf(item.url)) + '</b>…', 'Link preview');
        await sleep(1100);
        if (!alive()) return;
        item.enriched = true;
        item.title = item.page.title;
        item.titleSource = 'PAGE';
        changed(item);
        logStep(item, 'enrich', 'done', 'The page’s title, description and picture: <b>the one thing Seaglass fetches online</b>, and only with link previews on.', 'Link preview');
      } else {
        logStep(item, 'enrich', 'skip', 'On a phone, Seaglass would fetch this page’s title and picture now. This page can’t reach other sites, so the card keeps the address.', 'Link preview');
      }
    } else if (item.type === 'IMAGE') {
      logStep(item, 'enrich', 'busy', 'Writing the thumbnail…', 'Thumbnail');
      await sleep(600);
      if (!alive()) return;
      if (item.picture) item.picture.wait = false;
      changed(item);
      logStep(item, 'enrich', 'done', 'Thumbnail written, with its shape (' + ratio(item.picture && item.picture.aspect) + '), so the card has its size before the picture loads.', 'Thumbnail');
    } else if (item.type === 'FILE') {
      logStep(item, 'enrich', 'busy', 'Reading what the file says about itself…', 'The file’s own words');
      await sleep(800);
      if (!alive()) return;
      if (item.thumb) { item.picture = { src: item.thumb.src, aspect: item.thumb.aspect }; }
      if (item.words) item.supporting = item.words;
      changed(item);
      logStep(item, 'enrich', 'done', item.thumb ? 'Its first page drawn as the thumbnail, and its opening words kept for the card.'
        : item.snippet ? 'Its first lines kept, shown in a monospace well.' : item.supporting ? esc(item.supporting) + '.' : 'Nothing more to read in this one; the card shows its format.', 'The file’s own words');
    } else {
      logStep(item, 'enrich', 'skip', 'Nothing to fetch for words. When you open it, the phone’s text classifier marks its dates, addresses and numbers.', 'Nothing to fetch');
    }

    // 3. Seaglass's rules, on every phone
    logStep(item, 'rules', 'busy', 'Running the rules…');
    await sleep(650);
    if (!alive()) return;
    var d = decide(item, null);
    var tags = heuristicTags(item);
    var formatTag = item.type === 'FILE' && extOf(item.fileName) ? [tag(extOf(item.fileName), 'FORMAT')] : [];
    item.kind = d.kind;
    item.kindSource = d.source;
    item.tags = formatTag.concat(tags.map(function (t) { return tag(t); }));
    if (item.type === 'LINK' && item.enriched && item.page) item.summary = firstSentence(item.page.description);
    item.analyzedBy = 'rules';
    changed(item);
    logStep(item, 'rules', 'done', 'Kind <b>' + KINDS[d.kind][0] + '</b>, from ' + esc(d.why) + '. ' +
      (tags.length ? 'Tags <b>' + esc(tags.join(', ')) + '</b>.' : 'No tags: nothing in it matches a rule.') +
      (formatTag.length ? ' Plus its format, <b>' + formatTag[0].name + '</b>, a tag of its own.' : ''));

    // 4. Gemini Nano, foreground only, overwriting the rules' answer wholesale
    if (item.nano) {
      await sleep(400);
      if (!alive()) return;
      item.state = 'filing';
      changed(item);
      logStep(item, 'nano', 'busy', 'Reading the piece on the phone…');
      await sleep(500);
      await streamJson(item, item.nano, alive);
      if (!alive()) return;
      await sleep(250);
      var a = item.nano;
      var nd = decide(item, a.kind);
      var kept = [];
      // ADR-0048: a page's title (and a hand edit, a share's subject) outranks an analyzer
      if (item.titleSource === 'PAGE' || item.titleSource === 'USER') kept.push('the page’s own title, which outranks the model');
      else { item.title = a.title; item.titleSource = 'ANALYZER'; }
      if (nd.source === 'file') kept.push('the kind a file type decides');
      item.kind = nd.kind;
      item.kindSource = nd.source === 'file' ? 'file' : 'nano';
      item.tags = item.tags.filter(function (t) { return t.source !== 'AI'; }).concat(a.tags.map(function (t) { return tag(normTag(t)); }));
      item.summary = a.summary;
      item.analyzedBy = 'nano';
      item.state = 'done';
      changed(item);
      logStep(item, 'nano', 'done', 'Its answer replaced the rules’ kind, tags and summary' + (item.titleSource === 'ANALYZER' ? ', and gave it a title' : '') + '.' +
        (kept.length ? ' It kept ' + kept.join(' and ') + '.' : ''));
    } else {
      item.state = 'done';
      changed(item);
      logStep(item, 'nano', 'skip', 'On phones that have it, Gemini Nano would now write a title, a summary and better tags. This browser doesn’t run it, so the rules’ answer stands, as on a phone without Nano.');
    }

    // Back to the library to show the filed card, unless someone is looking around
    if (autoOpened && openId === item.id) {
      await sleep(2600);
      if (autoOpened && openId === item.id && Date.now() - touchedAt > 2500) closeDetail();
    }
  }
  function ratio(a) {
    if (!a) return 'its own';
    var pairs = [[3, 4], [4, 3], [9, 16], [16, 9], [1, 1], [2, 3], [3, 2]];
    for (var i = 0; i < pairs.length; i++) if (Math.abs(pairs[i][1] / pairs[i][0] - a) < 0.02) return pairs[i][0] + ':' + pairs[i][1];
    return '1:' + a.toFixed(2);
  }

  /* --------------------------------------------------------------------------
     Saving: persist first, then file. A repeat moves the piece to the top
     (ADR-0075) and says "Already saved".
  -------------------------------------------------------------------------- */
  var lastSaved = [];
  function save(pieces) {
    var saved = [], already = [];
    pieces.forEach(function (p) {
      var dup = items.filter(function (it) { return it.key === p.key; })[0];
      if (dup) { dup.createdAt = Date.now(); already.push(dup); return; }
      var item = makeItem(p);
      item.createdAt = Date.now();
      item.kind = item.type === 'FILE' ? factFor(item) : GENERIC[item.type];
      item.kindSource = item.type === 'FILE' ? 'file' : 'auto';
      items.push(item);
      saved.push(item);
    });
    renderGrid({ fresh: saved.length ? saved[saved.length - 1].id : null });
    libView.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    saved.forEach(function (it) { $$('.sample[data-sample="' + it.sample + '"]').forEach(function (b) { b.classList.add('is-saved'); }); });
    saved.forEach(enqueue);
    lastSaved = saved.concat(already);
    return { saved: saved, already: already };
  }

  /* --------------------------------------------------------------------------
     The edge sidebar
  -------------------------------------------------------------------------- */
  var sdTimer = 0, sdState = 'idle';
  function setSidebar(state, text) {
    clearTimeout(sdTimer);
    sdState = state;
    sidebar.dataset.state = state;
    if (state === 'open' || state === 'preview') sdLabel.textContent = 'Drop to save';
    if (state === 'hover') sdLabel.textContent = 'Let go to save';
    if (state === 'saving') sdLabel.textContent = 'Got it';
    if (state === 'failed' || state === 'undone') sdLabel.textContent = text;
    if (state !== 'hover') lean(0, 0);
    if (state === 'saved') sdTimer = setTimeout(function () { setSidebar('idle'); }, 4000);
    if (state === 'failed') sdTimer = setTimeout(function () { setSidebar('idle'); }, 2800);
    if (state === 'undone') sdTimer = setTimeout(function () { setSidebar('idle'); }, 900);
    if (state === 'preview') sdTimer = setTimeout(function () { setSidebar('idle'); }, 1500);
  }
  function lean(x, y) {
    sidebar.style.setProperty('--lean-x', x + 'px');
    sidebar.style.setProperty('--lean-y', y + 'px');
  }
  function overSidebar(x, y, slop) {
    if (sdState === 'idle') return false;
    var r = sidebar.getBoundingClientRect(), s = slop || 0;
    return x >= r.left - s && x <= r.right + s && y >= r.top - s && y <= r.bottom + s;
  }
  function hoverAt(x, y) {
    var over = overSidebar(x, y, 14);
    if (over && sdState !== 'hover') setSidebar('hover');
    if (!over && sdState === 'hover') setSidebar('open');
    if (over) {
      // Leans toward the finger: up to 12 dp along the edge, 2 dp in
      var r = sidebar.getBoundingClientRect(), u = dp();
      var t = Math.max(-1, Math.min(1, (y - (r.top + r.height / 2)) / (r.height / 2)));
      lean(2 * u, t * 12 * u);
    }
    return over;
  }

  // Undo takes back what the drop added, never a piece that was already there
  sdUndo.addEventListener('click', function () {
    lastSaved.forEach(function (it) {
      if (!it.__new) return;
      items = items.filter(function (x) { return x.id !== it.id; });
      if (it.sample) $$('.sample[data-sample="' + it.sample + '"]').forEach(function (b) { b.classList.remove('is-saved'); });
      if (openId === it.id) closeDetail();
    });
    lastSaved = [];
    renderGrid();
    setSidebar('undone', 'Removed');
  });
  sdOpen.addEventListener('click', function () {
    var it = lastSaved[lastSaved.length - 1];
    setSidebar('idle');
    if (it && byId(it.id)) openDetail(it.id, false);
  });

  // The piece falls into the box: an arc over 450 ms, emphasized accelerate,
  // down to 0.2 and tilted 8°, faded over its last quarter
  function fall(ghostHTML, fromRect) {
    var s = screen.getBoundingClientRect(), b = sdBox.getBoundingClientRect(), u = dp();
    var el = document.createElement('div');
    el.className = 'fall';
    el.innerHTML = ghostHTML;
    screen.appendChild(el);
    var w = 88 * u;
    var x0 = (fromRect.left + fromRect.width / 2) - s.left - w / 2;
    var y0 = (fromRect.top + fromRect.height / 2) - s.top - el.offsetHeight / 2;
    var x1 = (b.left + b.width / 2) - s.left - w / 2;
    var y1 = (b.top + b.height / 2) - s.top - el.offsetHeight / 2;
    var cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 40 * u;
    var frames = [], ease = function (t) { return cubic(0.3, 0, 0.8, 0.15, t); };
    for (var i = 0; i <= 10; i++) {
      var t = ease(i / 10), mt = 1 - t;
      var x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
      var y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
      frames.push({
        transform: 'translate(' + x + 'px,' + y + 'px) scale(' + (1 - 0.8 * t) + ') rotate(' + (8 * t) + 'deg)',
        opacity: i / 10 < 0.75 ? 1 : 1 - (i / 10 - 0.75) / 0.25
      });
    }
    var anim = el.animate(frames, { duration: reduce ? 1 : 450, easing: 'linear', fill: 'forwards' });
    return anim.finished.then(function () { el.remove(); });
  }
  // A cubic-bezier easing, solved for x
  function cubic(x1, y1, x2, y2, x) {
    var t = x;
    for (var i = 0; i < 8; i++) {
      var cx = 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t - x;
      var dx = 3 * x1 * (1 - t) * (1 - t) + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
      if (Math.abs(cx) < 1e-4 || !dx) break;
      t -= cx / dx;
    }
    t = Math.max(0, Math.min(1, t));
    return 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t;
  }

  // A drop: "Got it", into the box, the box gulps, the lid shuts, "Saved"
  async function drop(pieces, ghostHTML, fromRect, failure) {
    setSidebar('saving');
    if (ghostHTML) await fall(ghostHTML, fromRect);
    if (failure && !pieces.length) {
      setSidebar('failed', failure);
      return;
    }
    sdBox.classList.remove('gulp');
    void sdBox.offsetWidth;
    sdBox.classList.add('gulp');
    var r = save(pieces);
    r.saved.forEach(function (it) { it.__new = true; });
    await sleep(340);
    var n = r.saved.length;
    sdSaved.textContent = n === 0 ? (r.already.length === 1 ? 'Already saved' : 'All ' + r.already.length + ' already saved')
      : n === 1 && !r.already.length ? 'Saved' : 'Saved ' + n;
    sdUndo.classList.toggle('is-hidden', n === 0);
    setSidebar('saved');
  }

  /* --------------------------------------------------------------------------
     Dragging the samples: a drag with a mouse or pen, a long press then a drag
     on touch (as on Android), or a tap / Enter to save straight away
  -------------------------------------------------------------------------- */
  function samplePiece(id) {
    var s = SAMPLES[id];
    var p = JSON.parse(JSON.stringify(s));
    p.sample = id;
    p.key = 'sample-' + id;
    if (p.picture) p.picture.wait = true;
    if (p.type === 'IMAGE') p.title = p.fileName;
    if (p.type === 'FILE') { p.title = p.fileName; p.titleSource = 'FILE_NAME'; }
    return p;
  }
  function ghostFor(id) {
    var s = SAMPLES[id];
    if (s.type === 'IMAGE') return '<img src="' + s.picture.src + '" alt="" />';
    if (s.type === 'LINK') return '<span class="g-text">' + esc(s.url) + '</span>';
    if (s.type === 'TEXT') return '<span class="g-text">' + esc(s.rawText) + '</span>';
    return '<span class="g-text">' + esc(s.fileName) + '</span>';
  }

  var drag = null, raf = 0;
  function startDrag(btn, x, y, touch) {
    var id = btn.dataset.sample;
    var g = document.createElement('div');
    g.className = 'drag-ghost';
    g.innerHTML = ghostFor(id);
    document.body.appendChild(g);
    drag = { btn: btn, id: id, ghost: g, x: x, y: y, touch: touch, over: false };
    btn.classList.add('is-lifted', 'is-away');
    if (navigator.vibrate && touch) try { navigator.vibrate(12); } catch (e) { /* not allowed */ }
    if (sdState === 'idle' || sdState === 'preview' || sdState === 'saved' || sdState === 'undone' || sdState === 'failed') setSidebar('open');
    moveDrag(x, y);
    autoScroll();
  }
  function moveDrag(x, y) {
    if (!drag) return;
    drag.x = x; drag.y = y;
    var w = drag.ghost.offsetWidth, h = drag.ghost.offsetHeight;
    // Under a finger the shadow sits above it, so it can be seen
    var oy = drag.touch ? h + 24 : h / 2;
    drag.ghost.style.transform = 'translate(' + (x - w / 2) + 'px,' + (y - oy) + 'px) rotate(-3deg)';
    drag.over = hoverAt(x, drag.touch ? y - oy / 2 : y);
  }
  function autoScroll() {
    cancelAnimationFrame(raf);
    if (!drag) return;
    var edge = 64, v = 0;
    if (drag.y < edge + 60) v = -Math.ceil((edge + 60 - drag.y) / 6);
    else if (drag.y > window.innerHeight - edge) v = Math.ceil((drag.y - window.innerHeight + edge) / 6);
    if (v) { window.scrollBy(0, v); moveDrag(drag.x, drag.y); }
    raf = requestAnimationFrame(autoScroll);
  }
  function endDrag() {
    if (!drag) return;
    cancelAnimationFrame(raf);
    var d = drag;
    drag = null;
    d.btn.classList.remove('is-lifted', 'is-away');
    var rect = d.ghost.getBoundingClientRect();
    if (d.over) {
      d.ghost.remove();
      drop([samplePiece(d.id)], ghostFor(d.id), rect);
    } else {
      // Not on the edge: the shadow goes home, the sidebar folds
      var b = d.btn.getBoundingClientRect();
      var a = d.ghost.animate([{ transform: d.ghost.style.transform, opacity: 1 },
        { transform: 'translate(' + (b.left + b.width / 2 - rect.width / 2) + 'px,' + (b.top + b.height / 2 - rect.height / 2) + 'px)', opacity: 0 }],
      { duration: reduce ? 1 : 300, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)', fill: 'forwards' });
      a.finished.then(function () { d.ghost.remove(); });
      if (sdState === 'open' || sdState === 'hover') setTimeout(function () { if (!drag && (sdState === 'open')) setSidebar('idle'); }, 250);
    }
  }

  // Tap or Enter: the piece flies to the edge by itself
  async function tapSave(btn) {
    if (drag) return;
    var id = btn.dataset.sample;
    var from = btn.getBoundingClientRect();
    var g = document.createElement('div');
    g.className = 'drag-ghost';
    g.innerHTML = ghostFor(id);
    document.body.appendChild(g);
    var w = g.offsetWidth, h = g.offsetHeight;
    var sx = from.left + from.width / 2 - w / 2, sy = from.top + from.height / 2 - h / 2;
    g.style.transform = 'translate(' + sx + 'px,' + sy + 'px)';
    setSidebar('open');
    var phoneRect = screen.getBoundingClientRect();
    if (phoneRect.bottom < 0 || phoneRect.top > window.innerHeight) screen.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    await sleep(reduce ? 0 : 380);
    var r = sidebar.getBoundingClientRect();
    var tx = r.left + r.width / 2 - w / 2, ty = r.top + r.height / 2 - h / 2;
    var a = g.animate([{ transform: 'translate(' + sx + 'px,' + sy + 'px)' }, { transform: 'translate(' + tx + 'px,' + ty + 'px) rotate(-3deg)' }],
      { duration: reduce ? 1 : 520, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' });
    setTimeout(function () { if (sdState === 'open') setSidebar('hover'); }, reduce ? 0 : 300);
    await a.finished;
    var rect = g.getBoundingClientRect();
    g.remove();
    drop([samplePiece(id)], ghostFor(id), rect);
  }

  // A drag ends somewhere else, so the click that may follow it is not a tap
  var press = null, draggedAt = 0;
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    if (drag && !drag.touch) { moveDrag(e.clientX, e.clientY); return; }
    if (press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
      startDrag(press.btn, e.clientX, e.clientY, false);
      press = null;
    }
  });
  window.addEventListener('pointerup', function (e) {
    if (e.pointerType === 'touch') return;
    press = null;
    if (drag && !drag.touch) { draggedAt = Date.now(); endDrag(); }
  });

  $$('.sample').forEach(function (btn) {
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    btn.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'mouse' && !drag && sdState === 'idle') setSidebar('preview');
    });
    // Mouse and pen: press, then move a few pixels
    btn.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      press = { btn: btn, x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    // Touch: hold, then drag, as on Android. A quick tap is a click.
    var hold = 0, start = null;
    btn.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      hold = setTimeout(function () {
        hold = 0;
        startDrag(btn, start.x, start.y, true);
      }, 280);
    }, { passive: true });
    btn.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (drag && drag.btn === btn) { e.preventDefault(); moveDrag(t.clientX, t.clientY); return; }
      if (hold && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) { clearTimeout(hold); hold = 0; }
    }, { passive: false });
    btn.addEventListener('touchend', function (e) {
      if (hold) { clearTimeout(hold); hold = 0; }
      if (drag && drag.btn === btn) { e.preventDefault(); draggedAt = Date.now(); endDrag(); }
    });
    btn.addEventListener('touchcancel', function () {
      if (hold) { clearTimeout(hold); hold = 0; }
      if (drag && drag.btn === btn) { drag.over = false; draggedAt = Date.now(); endDrag(); }
    });
    btn.addEventListener('click', function () {
      if (Date.now() - draggedAt < 500) return;
      tapSave(btn);
    });
  });

  /* --------------------------------------------------------------------------
     A visitor's own drops: files, links and text dragged in from another tab,
     app or the desktop. Read here, kept as object URLs, never uploaded.
  -------------------------------------------------------------------------- */
  var MAX_BYTES = 256 * 1024 * 1024;
  var TEXTISH = /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|x-sh))|\.(txt|md|csv|json|xml|ya?ml|log|kt|js|ts|py|sh|html|css)$/i;

  function hasPayload(dt) {
    if (!dt || drag) return false;
    var t = Array.prototype.slice.call(dt.types || []);
    return t.indexOf('Files') >= 0 || t.indexOf('text/uri-list') >= 0 || t.indexOf('text/plain') >= 0;
  }
  var depth = 0;
  window.addEventListener('dragenter', function (e) {
    if (!hasPayload(e.dataTransfer)) return;
    depth++;
    if (sdState !== 'saving' && sdState !== 'hover' && sdState !== 'open') setSidebar('open');
  });
  window.addEventListener('dragleave', function (e) {
    if (!hasPayload(e.dataTransfer)) return;
    depth = Math.max(0, depth - 1);
    if ((depth === 0 || !e.relatedTarget) && (sdState === 'open' || sdState === 'hover')) setSidebar('idle');
  });
  window.addEventListener('dragover', function (e) {
    if (!hasPayload(e.dataTransfer)) return;
    e.preventDefault();
    var over = hoverAt(e.clientX, e.clientY);
    e.dataTransfer.dropEffect = over ? 'copy' : 'none';
  });
  window.addEventListener('drop', function (e) {
    if (!hasPayload(e.dataTransfer)) return;
    e.preventDefault();
    depth = 0;
    var over = overSidebar(e.clientX, e.clientY, 14);
    if (!over) { if (sdState === 'open' || sdState === 'hover') setSidebar('idle'); return; }
    var at = { left: e.clientX - 20, top: e.clientY - 20, width: 40, height: 40 };
    readDrop(e.dataTransfer).then(function (r) {
      var ghost = r.ghost || null;
      drop(r.pieces, ghost, at, r.pieces.length ? null : r.failure);
    });
  });

  function readDrop(dt) {
    var files = Array.prototype.slice.call(dt.files || []).slice(0, 6);
    if (files.length) {
      var tooBig = files.filter(function (f) { return f.size > MAX_BYTES; });
      var ok = files.filter(function (f) { return f.size <= MAX_BYTES; });
      return Promise.all(ok.map(readFile)).then(function (pieces) {
        var first = pieces[0];
        return {
          pieces: pieces,
          ghost: first && first.picture && first.picture.src ? '<img src="' + first.picture.src + '" alt="" />' : first ? '<span class="g-text">' + esc(first.fileName) + '</span>' : null,
          failure: tooBig.length ? 'Too big to keep\n(over 256 MB)' : 'Nothing to save'
        };
      });
    }
    var uris = (dt.getData('text/uri-list') || '').split(/\r?\n/).filter(function (l) { return l && l[0] !== '#'; });
    var text = (dt.getData('text/plain') || '').trim();
    var url = uris[0] || (/^https?:\/\/\S+$/i.test(text) ? text : null);
    if (url && /^https?:/i.test(url)) {
      return Promise.resolve({ pieces: [{ type: 'LINK', url: url, rawText: text && text !== url ? text : null, key: 'link:' + url }], ghost: '<span class="g-text">' + esc(url) + '</span>' });
    }
    if (text) {
      return Promise.resolve({ pieces: [{ type: 'TEXT', rawText: text.slice(0, 5000), key: 'text:' + text.replace(/\s+/g, ' '), marks: findMarks(text) }], ghost: '<span class="g-text">' + esc(text) + '</span>' });
    }
    return Promise.resolve({ pieces: [], failure: 'Nothing to save' });
  }

  // Links, email addresses and phone numbers: what Seaglass finds itself on Android 8
  function findMarks(text) {
    var out = [], re = /(https?:\/\/[^\s]+|[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s().-]{6,}\d)/g, m;
    while ((m = re.exec(text)) && out.length < 12) out.push([m[1], 'mark']);
    return out;
  }

  function sizeWord(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return Math.round(b / 1024) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function readFile(f) {
    var base = { type: 'FILE', fileName: f.name || 'Untitled', mime: f.type || '', size: sizeWord(f.size), key: 'file:' + f.name + ':' + f.size + ':' + f.lastModified, title: f.name, titleSource: 'FILE_NAME' };
    var mime = (f.type || '').toLowerCase();
    if (mime.indexOf('image/') === 0) {
      var src = URL.createObjectURL(f);
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () { res(Object.assign(base, { type: 'IMAGE', picture: { src: src, aspect: img.naturalHeight / img.naturalWidth || 1, wait: true } })); };
        img.onerror = function () { res(Object.assign(base, { picture: null })); };
        img.src = src;
      });
    }
    if (mime.indexOf('video/') === 0) return poster(f).then(function (p) { return Object.assign(base, { thumb: p }); });
    if (mime.indexOf('audio/') === 0) {
      return duration(f).then(function (s) { return Object.assign(base, { words: s ? 'Audio · ' + Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0') : null }); });
    }
    if (TEXTISH.test(mime) || TEXTISH.test(f.name)) {
      return f.slice(0, 4096).text().then(function (t) {
        return Object.assign(base, { snippet: t.split(/\r?\n/).slice(0, 6).map(function (l) { return l.slice(0, 80); }).join('\n') });
      }).catch(function () { return base; });
    }
    return Promise.resolve(base);
  }
  function poster(f) {
    return new Promise(function (res) {
      var v = document.createElement('video'), src = URL.createObjectURL(f), done = false;
      var finish = function (p) { if (done) return; done = true; res(p); };
      v.muted = true; v.preload = 'auto'; v.src = src;
      v.addEventListener('loadeddata', function () { try { v.currentTime = Math.min(1, (v.duration || 2) / 3); } catch (e) { finish(null); } });
      v.addEventListener('seeked', function () {
        try {
          var c = document.createElement('canvas'), w = 480;
          c.width = w; c.height = Math.round(w * v.videoHeight / v.videoWidth) || 270;
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          finish({ src: c.toDataURL('image/jpeg', 0.8), aspect: c.height / c.width });
        } catch (e) { finish(null); }
      });
      v.addEventListener('error', function () { finish(null); });
      setTimeout(function () { finish(null); }, 3000);
    });
  }
  function duration(f) {
    return new Promise(function (res) {
      var a = document.createElement('audio');
      a.preload = 'metadata';
      a.onloadedmetadata = function () { res(isFinite(a.duration) ? a.duration : null); };
      a.onerror = function () { res(null); };
      a.src = URL.createObjectURL(f);
      setTimeout(function () { res(null); }, 3000);
    });
  }

  /* --------------------------------------------------------------------------
     The phone's own controls: open a card, back, search, the kind chips
  -------------------------------------------------------------------------- */
  screen.addEventListener('pointerdown', function () { touchedAt = Date.now(); autoOpened = false; });
  gridEl.addEventListener('click', function (e) {
    var c = e.target.closest('.kcard');
    if (c) openDetail(Number(c.dataset.id), false);
  });
  gridEl.addEventListener('keydown', function (e) {
    var c = e.target.closest('.kcard');
    if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(Number(c.dataset.id), false); }
  });
  detView.addEventListener('click', function (e) { if (e.target.closest('[data-back]')) closeDetail(); });
  chipsEl.addEventListener('click', function (e) {
    var c = e.target.closest('[data-kind]');
    if (!c) return;
    var k = c.dataset.kind, i = filter.kinds.indexOf(k);
    if (i >= 0) filter.kinds.splice(i, 1); else filter.kinds.push(k);
    renderGrid();
  });
  searchEl.addEventListener('input', function () { filter.query = searchEl.value; renderGrid(); });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openId !== null) closeDetail();
  });

  // The status bar's clock
  var clock = $('[data-clock]');
  function tick() { clock.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, ''); }
  tick();
  setInterval(tick, 20000);

  renderGrid();

  // First time the phone is on screen, the sidebar shows itself for a moment,
  // as Settings' preview does, so the edge is easy to find
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      setTimeout(function () { if (sdState === 'idle' && !drag) setSidebar('preview'); }, 900);
    }, { threshold: 0.6 });
    io.observe(screen);
  }
})();
