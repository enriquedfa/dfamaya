/* ============================================================================
   Concentric+ — the watch face, redrawn for the web.

   Mirrors the face's watchface.xml (Concentric repo) on the watch's own
   450×450 canvas. The face is authored in Google's 456 units and scaled by
   S = 450/456, as the XML is, so the numbers below read 1:1 against it:

   - the minute ring (304 px, sweeping with the minute and second) and the
     second ring, each with twelve counter-rotating digits and the watch's own
     tick images, tinted in colour b at 50 %
   - the hour, the minute in its pill, and the masks that hide the ring digit
     under the pill
   - Dials (the left pill only), Dials and Arcs (four corner arcs plus the
     left pill) and Half Dial (the clock moved left, three round bulbs)
   - the 64 colorways (a = time and text, b = ticks and pill, c = tracks and
     fills, d = icons and bulb text), the three tick styles, the four
     always-on styles and the other switches

   Markup hooks:
     [data-cc-face]        a .dial to draw the face into. Optional
                           data-cc-flavor (porcelain, glacier, …) sets how it
                           starts.
     [data-cc-page]        the landing page: wires every control below to the
                           first face on the page
       [data-cc-range]     time slider (minutes 0–1439)
       [data-cc-play]      run the clock fast (a minute a second)
       [data-cc-now]       back to the real time
       [data-cc-caption]   time + colorway readout
       [data-cc-moment]    buttons that jump to a time (data-cc-moment="10:09")
       [data-cc-colorways] where the 64 colorway chips are drawn
       input[name=cc-*]    the settings (radios and checkboxes)
       [data-cc-value=…]   shows the chosen option's name
   The glow behind each watch follows the colorway through --cc-glow.
============================================================================ */
(() => {
  "use strict";

  const SVG = "http://www.w3.org/2000/svg";
  const IMG = (document.currentScript?.src || location.href).replace(/[^/]*$/, "") + "img/";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------------------------------------------------------------------------
  // The face's constants (watchface.xml)
  // ---------------------------------------------------------------------------
  const S = 450 / 456;
  const sc = (v) => v * S;

  // Google's 64 colorways, in the picker's order: [name, a, b, c, d]
  const COLORWAYS = [
    ["Fog", "#E7F9FB", "#C9D7DE", "#829EA6", "#98E6E3"],
    ["Canyon", "#FFE8E1", "#FFB5A3", "#C37F71", "#FF493F"],
    ["Olive", "#EAF5D9", "#B1C1A9", "#868F8A", "#A0D47D"],
    ["Obsidian", "#DAE2FE", "#B2C8FB", "#7780B1", "#9DB2FF"],
    ["Flare", "#FFDAF7", "#FFA6C1", "#C95D7C", "#FF297C"],
    ["Pistachio", "#FDFBC1", "#DFEE8E", "#7B9357", "#CDEE17"],
    ["Linen", "#F6EFDF", "#CAC6B7", "#7A756C", "#EEC8A0"],
    ["Grapefruit", "#EED1CB", "#FF7888", "#703839", "#FF6B42"],
    ["Pigeon", "#D0D5D5", "#A7B7C7", "#626C74", "#E79182"],
    ["Dusk", "#E0E1F9", "#B7BEF4", "#3C4371", "#FD9D80"],
    ["Moonstone", "#D9DFF7", "#B8C4FF", "#565E77", "#B1A3EF"],
    ["Ivy", "#E3EAE4", "#C6D5CF", "#627770", "#D5EEAE"],
    ["Porcelain", "#E8E2D9", "#C2BEB9", "#73665E", "#EFD0BA"],
    ["Iris", "#B8C5FF", "#7286E4", "#6067A7", "#E3FBA1"],
    ["Lemongrass", "#F9FFE9", "#E7EF9B", "#7D8F6B", "#A6A5FF"],
    ["Jade", "#EFF3E1", "#CADBA2", "#818B6D", "#FDECA0"],
    ["Indigo", "#F0EFFE", "#9AB2F9", "#5B67A2", "#FFAEFA"],
    ["Peony", "#FFF9FA", "#FF7E9C", "#A8677C", "#C0A5FF"],
    ["Terra", "#FFF6E2", "#EAD2C1", "#A18E81", "#E1BDA4"],
    ["Pebble", "#DCD7CA", "#B2AB97", "#9A9A8B", "#C6BAB2"],
    ["Moss", "#D3D7D3", "#889288", "#91AE83", "#ADC3AD"],
    ["Meadow", "#B5E4C2", "#93CC85", "#FCFFB6", "#E3FF8E"],
    ["Glacier", "#7CB3E5", "#4B5EA3", "#A3BDFF", "#2295FF"],
    ["Atlantic", "#C6DFFB", "#A3CCFB", "#708FDF", "#7584B9"],
    ["Azalea", "#FFBDF8", "#D99CD5", "#D1ABE3", "#FF79FA"],
    ["Hibiscus", "#EF80F5", "#FF3232", "#E57F7D", "#D11F49"],
    ["Sunflower", "#DCD7CA", "#7A7A7A", "#A18E81", "#FCFF7A"],
    ["Redeye", "#DCD7CA", "#7A7A7A", "#D0D0D0", "#FF3E32"],
    ["Bloom", "#CFE7D9", "#ACC4B5", "#7BA38B", "#F472FF"],
    ["Autumn", "#DFE0CE", "#FCFFB6", "#B99982", "#FF7253"],
    ["Sonic", "#E4EDF8", "#CADAEB", "#6F8194", "#EDFC92"],
    ["Cottoncandy", "#BED3EC", "#A3CCFB", "#7CC8F3", "#FF61D3"],
    ["Rosebush", "#FFBACF", "#DA7DB5", "#FC64AD", "#9DF89B"],
    ["Icecream", "#FFBDF8", "#DA7DD1", "#FF79FA", "#4DC9FF"],
    ["Cedar", "#CDFFF3", "#84A479", "#EBD7C9", "#FFB891"],
    ["Jester", "#C4C6C1", "#7092EA", "#FFE454", "#CE7FB3"],
    ["Beachball", "#D1FF87", "#52FF95", "#3BAFF0", "#FF5EEF"],
    ["Ooze", "#C5FF97", "#72F95C", "#84D5C1", "#FF774D"],
    ["System", "#C8E2FF", "#FF5942", "#6AC6FA", "#C5FE4B"],
    ["Nocturnal", "#72B8F8", "#6DFFA8", "#83AFC7", "#C273FF"],
    ["Petal", "#FFA6DB", "#B98DFF", "#99F3FF", "#AFFA8B"],
    ["Carnival", "#D6FA8B", "#2BB2FF", "#F94BEC", "#F94968"],
    ["Paradise", "#FFB053", "#0CC5FF", "#8FFFF8", "#F767FA"],
    ["Nightcrawler", "#FFA8FC", "#FF8A00", "#199AE2", "#5FFF26"],
    ["Cosmic", "#00FF6A", "#007EF2", "#FF41F7", "#E4FF41"],
    ["Unicorn", "#FFF6E2", "#D5BEAD", "#3BAFF0", "#FF5EEF"],
    ["Campari", "#FF96A9", "#FF3C6B", "#FF8469", "#FF5E3B"],
    ["Terminus", "#D9D9D9", "#95B5A9", "#ADD63C", "#BBFC02"],
    ["Freeze", "#9DADC0", "#D8E2E2", "#889AA7", "#FFFFFF"],
    ["Aquifer", "#AFD4FF", "#D8E2E2", "#32A9FF", "#FFFFFF"],
    ["Sterling", "#F4F6FF", "#A2A8C0", "#616479", "#B1BEF9"],
    ["Parakeet", "#8C9DB0", "#6F8194", "#CADAEB", "#0BC35F"],
    ["Chlorophyll", "#51FF77", "#8DEF75", "#A4EDB4", "#00C22B"],
    ["Celadon", "#C5E0B1", "#C2FD93", "#A2C984", "#D9F9C0"],
    ["Vermillion", "#E22B41", "#CE3C5F", "#DE3D5A", "#FA3D5F"],
    ["Sunbeam", "#D2E4FF", "#9FAFC7", "#616479", "#FFDDC9"],
    ["Montauk", "#C6DFFB", "#95B5A9", "#708FDF", "#7584B9"],
    ["Algae", "#F9FFEA", "#C5F9C7", "#699156", "#F1FF9E"],
    ["Kiwi", "#D4EBBD", "#BBE096", "#90A07F", "#FFABC9"],
    ["Icy", "#BDBDC5", "#FF3767", "#DEFFCE", "#7FF0FF"],
    ["Beetle", "#B0B7FF", "#C378D5", "#80BCDE", "#B7FF9E"],
    ["Tourmaline", "#B0B7FF", "#FF197A", "#80DECD", "#FFAED0"],
    ["Peacock", "#A3DEFF", "#7CB3E5", "#2D81FF", "#B6FF3E"],
    ["Mariner", "#96CDFF", "#778FB3", "#006BE9", "#23CAFF"],
  ];
  const DEFAULT_COLORWAY = 12; // Porcelain
  const cwIndex = (name) => COLORWAYS.findIndex((c) => c[0] === name);

  // The XML's Flavors: a colorway and a layout
  const FLAVORS = {
    porcelain: { name: "Porcelain", colorway: "Porcelain", mode: 1 },
    glacier: { name: "Glacier", colorway: "Glacier", mode: 0 },
    pebble: { name: "Pebble", colorway: "Pebble", mode: 0 },
    ooze: { name: "Ooze", colorway: "Ooze", mode: 1 },
    jester: { name: "Jester", colorway: "Jester", mode: 1 },
    campari: { name: "Campari", colorway: "Campari", mode: 2 },
    unicorn: { name: "Unicorn", colorway: "Unicorn", mode: 2 },
  };

  const MODES = ["Dials", "Dials and Arcs", "Half Dial"];
  const INDEXES = ["Full", "Partial", "No indexes"];
  const AOD_STYLES = ["Minutes only", "Minutes + seconds ring", "Both rings only", "Only time"];

  // Rotating digit centres: (percent of 456, px offset) pairs, main.css
  const MINUTE_DIGITS = {
    "00": [[75, 2], [50, 0]], "05": [[72, 1], [37, 2]], "10": [[62, 4], [27, 4]], "15": [[50, 0], [24, 3]],
    "20": [[37, 2], [27, 5]], "25": [[27, 5], [37, 2]], "30": [[24, 3], [50, 0]], "35": [[27, 4], [62, 4]],
    "40": [[37, 2], [72, 0]], "45": [[50, 0], [75, 2]], "50": [[62, 4], [72, 0]], "55": [[72, 1], [62, 4]],
  };
  const SECOND_DIGITS_ARCS = {
    "00": [[97, 0], [50, 0]], "05": [[90, 3], [26, 3]], "10": [[73, 3], [9, 2]], "15": [[50, 0], [3, 1]],
    "20": [[26, 3], [9, 2]], "25": [[9, 2], [26, 3]], "30": [[3, 1], [50, 0]], "35": [[9, 2], [73, 3]],
    "40": [[26, 3], [90, 3]], "45": [[50, 0], [97, 0]], "50": [[73, 3], [90, 3]], "55": [[90, 3], [73, 3]],
  };
  const SECOND_DIGITS_DIALS = {
    "00": [[91, 1], [50, 0]], "05": [[85, 3], [29, 2]], "10": [[70, 3], [14, 3]], "15": [[50, 0], [9, 0]],
    "20": [[29, 3], [14, 3]], "25": [[14, 3], [29, 3]], "30": [[9, 0], [50, 0]], "35": [[14, 3], [70, 3]],
    "40": [[29, 2], [85, 3]], "45": [[50, 0], [91, 1]], "50": [[70, 4], [85, 2]], "55": [[85, 2], [70, 4]],
  };
  const pos456 = ([[xp, xo], [yp, yo]]) => [sc((xp * 456) / 100 + xo), sc((yp * 456) / 100 + yo)];

  // A line of text is centred on its box by cap height: the baseline sits
  // this far (× size) below the box centre (the fonts' hhea metrics)
  const BASELINE_K = (1932 - 572) / 2 / 2000;
  const DIGIT_SIZE = 22;

  const MINUTE_RING = 304;
  const CONT_X = -6;
  const T = sc(4); // stroke of the pills, arcs and rings
  const HOUR_BASE = sc(0.58 * 456 + 2);
  const MINUTE_CX = sc(0.73 * 456 + 1 + CONT_X);
  const MINUTE_BASE = sc(0.53 * 456 - 1);
  const HALF_SHIFT = Math.round(sc(-0.33 * 456));

  // The minute pill: its left cap centred 1 px right of the minute, running
  // off the right edge of the screen
  function pillBox(widthPct) {
    const left = 0.73 * 456 + 2 + CONT_X - 40;
    const outer = widthPct * 456 - 43 + 80 + 40;
    return { x: Math.round(sc(left)), y: Math.round(sc(188)), w: Math.round(sc(outer)), h: Math.round(sc(80)) };
  }
  const PILL = pillBox(0.27);
  const PILL_HALF = pillBox(0.22);
  const LEFT_PILL_W = 200;

  // Corner arcs: angles clockwise from 12 o'clock, in degrees
  const R_ARC = sc(180);
  const ARC_TEXT_SIZE = 24;
  const DEG_PER_CHAR = (4.6 * ARC_TEXT_SIZE) / 24;
  const GAP = 3;
  const ICON_W = (sc(24) / sc(180)) * (180 / Math.PI); // the 24 px icon, in degrees
  const ICON_DEG = ICON_W + GAP;
  const TRACK_BG = "#333333";
  // WFF can count characters but not measure them, so the XML estimates a
  // text's width per character, corrected for the usual trailing symbols
  const TRAILING_W = { "%": 2.3, "°": -1.7, M: 3.0, W: 3.3, H: 1.4, D: 1.3 };
  const textW = (t) => t.length * DEG_PER_CHAR + (TRAILING_W[t.slice(-1).toUpperCase()] || 0);
  const titledW = (t, title) => textW(t) + DEG_PER_CHAR * (1 + title.length);

  const ARC_SLOTS = [
    { id: "tl", s: 288, e: 351, flipped: false },
    { id: "tr", s: 9, e: 72, flipped: false },
    { id: "bl", s: 189, e: 252, flipped: true },
    { id: "br", s: 108, e: 171, flipped: true },
  ];

  // Half Dial bulbs: left, top in 456 units, 100 × 100
  const BULB = Math.round(sc(100));
  const BC = BULB / 2;
  const BULB_R = sc(100 - 6) / 2;
  const BULBS = [
    { id: "top", x: Math.round(sc(290)), y: Math.round(sc(50)) },
    { id: "mid", x: Math.round(sc(340)), y: Math.round(sc(176)) },
    { id: "bot", x: Math.round(sc(290)), y: Math.round(sc(306)) },
  ];

  // Material Symbols, as the providers send them
  const ICONS = {
    event: { vb: 24, d: "M5,22q-0.83,0-1.41-0.59T3,20V6Q3,5.18 3.59,4.59T5,4H6V2H8V4h8V2h2V4h1q0.83,0 1.41,0.59Q21,5.18 21,6V20q0,0.82-0.59,1.41T19,22H5Zm0-2H19V10H5V20Zm2-6h5v5H7v-5Z" },
    battery: { vb: 24, d: "M9,2h6v2h2q0.42,0 0.71,0.29T18,5v16q0,0.42-0.29,0.71T17,22H7q-0.42,0-0.71-0.29T6,21V5q0-0.42 0.29-0.71T7,4h2V2Zm-1,4v14h8V6H8Zm1,5h6v8H9v-8Z" },
    heart: { vb: 24, d: "M12,21l-1.45-1.3q-2.53-2.27-4.18-3.92q-1.65-1.65-2.63-2.96Q2.78,11.5 2.39,10.4T2,8.15Q2,5.8 3.58,4.22T7.5,2.65q1.3,0 2.48,0.55T12,4.75q0.85-1 2.03-1.55T16.5,2.65q2.35,0 3.93,1.57T22,8.15q0,1.15-0.39,2.25t-1.36,2.41q-0.97,1.31-2.63,2.96q-1.65,1.65-4.17,3.92L12,21Z" },
    sun: { vb: 960, oy: -960, d: "M440,-760v-160h80v160h-80Zm266,110 -55,-55 112,-115 56,57 -113,113Zm54,210v-80h160v80H760ZM440,-40v-160h80v160h-80ZM254,-652 140,-763l57,-56 113,113 -56,54Zm508,512L651,-255l54,-54 114,110 -57,59ZM40,-440v-80h160v80H40Zm157,300 -56,-57 112,-112 29,27 29,28 -114,114Zm113,-170q-70,-70 -70,-170t70,-170q70,-70 170,-70t170,70q70,70 70,170t-70,170q-70,70 -170,70t-170,-70Z" },
  };

  const rad = (deg) => (deg * Math.PI) / 180;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const f2 = (n) => +n.toFixed(2);
  const pad = (n) => String(n).padStart(2, "0");
  // A point on a circle, the angle clockwise from 12 o'clock
  const pt = (r, a, cx = 225, cy = 225) => [f2(cx + r * Math.sin(rad(a))), f2(cy - r * Math.cos(rad(a)))];

  // Clockwise from a1 to a2 (or counter-clockwise with ccw), up to a full turn
  function arcD(r, a1, a2, cx = 225, cy = 225, ccw = false) {
    const span = Math.abs(a2 - a1);
    if (span >= 359.99) {
      const mid = a1 + (ccw ? -180 : 180);
      return arcD(r, a1, mid, cx, cy, ccw) + arcD(r, mid, a2, cx, cy, ccw).replace(/^M[^A]*/, "");
    }
    const [x1, y1] = pt(r, a1, cx, cy);
    const [x2, y2] = pt(r, a2, cx, cy);
    return `M${x1} ${y1}A${f2(r)} ${f2(r)} 0 ${span > 180 ? 1 : 0} ${ccw ? 0 : 1} ${x2} ${y2}`;
  }

  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(SVG, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  // A provider's icon, painted in colour d, centred on (cx, cy)
  function icon(parent, name, cx, cy, size, attrs = {}) {
    const ic = ICONS[name];
    const k = size / ic.vb;
    const g = el("g", attrs, parent);
    el("path", { d: ic.d, class: "cc-fd", "fill-rule": "evenodd", transform: `translate(${f2(cx - size / 2)} ${f2(cy - size / 2 - (ic.oy || 0) * k)}) scale(${f2(k * 1000) / 1000})` }, g);
    return g;
  }

  let uid = 0;

  class Face {
    constructor(host) {
      this.host = host;
      this.id = `cc${uid++}`;
      this.last = {};
      host.querySelector(".cc-fallback")?.remove();
      const svg = (this.svg = el("svg", { class: "cc-face", viewBox: "0 0 450 450", "aria-hidden": "true" }, host));
      this.defs = el("defs", {}, svg);

      // The tick rings are the watch's own images, tinted through a mask
      const mask = (name, size) => {
        const id = `${this.id}-${name}`;
        const m = el("mask", { id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: size, height: size }, this.defs);
        el("image", { href: `${IMG}${name}.webp`, width: size, height: size }, m);
        return id;
      };
      const ticks = (parent, name, size, extra = {}) =>
        el("rect", { width: size, height: size, class: "cc-fb cc-ticks", mask: `url(#${mask(name, size)})`, ...extra }, parent);

      // ------ The clock: moved left a third of the screen in Half Dial ------
      this.clock = el("g", {}, svg);

      // Minute ring
      const mScale = el("g", { class: "cc-ring" }, this.clock);
      const origin = 225 - MINUTE_RING / 2;
      const mPos = el("g", { transform: `translate(${origin} ${origin})` }, mScale);
      this.minRot = el("g", {}, mPos);
      this.minTicks = [
        ticks(this.minRot, "minutes_indices_0", MINUTE_RING),
        ticks(this.minRot, "minutes_indices_1", MINUTE_RING),
        ticks(this.minRot, "minutes_indices_aod", MINUTE_RING),
      ];
      this.minDigits = el("g", { class: "cc-min-digits" }, this.minRot);
      this.minTexts = Object.entries(MINUTE_DIGITS).map(([label, p]) => {
        const [x, y] = pos456(p);
        const cx = x - origin;
        const cy = y - origin;
        const t = el("text", { x: f2(cx), y: f2(cy + BASELINE_K * DIGIT_SIZE), class: "cc-digit cc-fa" }, this.minDigits, label);
        return { t, cx, cy };
      });

      // Second ring
      const sScale = el("g", { class: "cc-ring cc-ring-s" }, this.clock);
      this.secRot = el("g", {}, sScale);
      this.secTicks = {
        dials: ticks(this.secRot, "seconds_indices_0", 450),
        arcs: ticks(this.secRot, "seconds_indices_2", 450),
        partial: ticks(this.secRot, "seconds_indices_1", 450),
        partialArcs: ticks(this.secRot, "seconds_indices_1", 450, { transform: "rotate(15 225 225)" }),
        aod: ticks(this.secRot, "seconds_indices_aod", 450),
      };
      const secDigits = (table) => {
        const g = el("g", { class: "cc-sec-digits" }, this.secRot);
        const texts = Object.entries(table).map(([label, p]) => {
          const [cx, cy] = pos456(p);
          const t = el("text", { x: f2(cx), y: f2(cy + BASELINE_K * DIGIT_SIZE), class: "cc-digit cc-fa" }, g, label);
          return { t, cx, cy };
        });
        return { g, texts };
      };
      this.secDials = secDigits(SECOND_DIGITS_DIALS);
      this.secArcs = secDigits(SECOND_DIGITS_ARCS);

      // Hour, masks, minute and the pill
      this.time = el("g", {}, this.clock);
      // Google's hour is larger and offset left; Concentric+ centres it
      // between its two pills, sized so "00" fits the gap
      const capCentre = HOUR_BASE - 0.358 * sc(112);
      this.hour = el("text", { x: 225, y: f2(capCentre + 0.358 * 84), class: "cc-hour cc-fa" }, this.time);
      this.hourHalf = el("text", { x: f2(sc(0.48 * 456 + CONT_X)), y: f2(HOUR_BASE), class: "cc-hour cc-hour-half cc-fa" }, this.time);
      // The rect mask hides the ring digit under the pill; the circle mask
      // does it in always-on
      el("rect", {
        x: f2(sc(0.69 * 456 + CONT_X)), y: f2(sc(188)), width: f2(sc(50)), height: f2(sc(80)),
        rx: f2(sc(16)), ry: f2(sc(30)), class: "cc-mask-rect",
      }, this.time);
      el("circle", { cx: f2(MINUTE_CX), cy: f2(sc(228)), r: f2(sc(36)), class: "cc-mask-circle" }, this.time);
      this.minute = el("text", { x: f2(MINUTE_CX), y: f2(MINUTE_BASE), class: "cc-minute cc-fa" }, this.time);
      el("circle", { cx: f2(MINUTE_CX), cy: f2(sc(228)), r: f2(sc(37) - T / 2), class: "cc-pill-aod cc-sb" }, this.time);
      const pill = (box, cls) => el("rect", {
        x: f2(box.x + T / 2), y: f2(box.y + T / 2), width: f2(box.w - T), height: f2(box.h - T),
        rx: f2((box.h - T) / 2), class: `cc-pill cc-sb ${cls}`,
      }, this.time);
      this.pill = pill(PILL, "cc-pill-full");
      this.pillHalf = pill(PILL_HALF, "cc-pill-half");

      // ------ Complications: drawn on demand (see layout()) ------
      this.cx = el("g", {}, svg);
    }

    // Arc text along the corner arc, cap height centred on its radius. Top
    // arcs read clockwise from `low`; bottom ones read counter-clockwise and
    // end at `low`, so the text sits upright on both.
    arcText(parent, low, w, flipped, content, cls) {
      const r = R_ARC + (flipped ? 1 : -1) * BASELINE_K * ARC_TEXT_SIZE;
      const id = `${this.id}-p${this.pathN++}`;
      const d = flipped ? arcD(r, low + w, low - 60, 225, 225, true) : arcD(r, low, low + w + 60);
      el("path", { id, d, fill: "none" }, this.paths);
      const t = el("text", { class: `cc-arc-text ${cls}` }, parent);
      el("textPath", { href: `#${id}` }, t, content.toUpperCase());
    }

    arcIcon(parent, name, angle, flipped) {
      const [x, y] = pt(R_ARC, angle);
      icon(parent, name, x, y, sc(24), { transform: `rotate(${f2(flipped ? angle + 180 : angle)} ${x} ${y})`, class: "cc-cx-keep" });
    }

    track(parent, a1, a2, cls) {
      if (a2 - a1 <= 0.05) return;
      el("path", { d: arcD(R_ARC, a1, a2), class: `cc-track ${cls}` }, parent);
    }

    // One corner slot, as the XML lays it out: the icon, the text, then the
    // track. (Placeholder bars, which centre short text between two
    // tracks, leave this sample as it is: its text fills the arc.)
    arcSlot(slot, data) {
      const g = el("g", {}, this.cx);
      const { s, e, flipped } = slot;
      const a0 = s + (data.icon ? ICON_DEG : 0);
      if (data.kind === "ranged") {
        const w = textW(data.text);
        const ts = clamp(a0 + w + GAP, s, e);
        this.track(g, ts, e, "cc-track-bg");
        this.track(g, ts, ts + data.value * (e - ts), "cc-sc");
        this.arcText(g, a0, w, flipped, data.text, "cc-fa");
      } else {
        const content = data.title ? `${data.text} ${data.title}` : data.text;
        this.arcText(g, a0, data.title ? titledW(data.text, data.title) : textW(data.text), flipped, content, "cc-fa");
      }
      if (data.icon) this.arcIcon(g, data.icon, s + ICON_W / 2, flipped);
    }

    // The left pill (slot 4): an exact mirror of the minute pill, with a
    // title in colour d and the value in colour a
    leftPill(data) {
      const x = 450 - PILL.x - LEFT_PILL_W;
      const g = el("g", { transform: `translate(${x} ${PILL.y})`, class: "cc-left-pill" }, this.cx);
      const shape = { x: f2(T / 2), y: f2(T / 2), width: f2(LEFT_PILL_W - T), height: f2(PILL.h - T), rx: f2((PILL.h - T) / 2) };
      el("rect", { ...shape, fill: "#000" }, g);
      el("rect", { ...shape, class: "cc-left-border cc-sb" }, g);
      const base = 40 + BASELINE_K * 28;
      el("text", { x: 77.5, y: f2(base), class: "cc-pill-text cc-fd" }, g, data.title.toUpperCase());
      el("text", { x: 145.5, y: f2(base), class: "cc-pill-text cc-fa" }, g, data.text.toUpperCase());
    }

    // A Half Dial bulb: a ring (ranged values) or a disc (short text)
    bulb(b, data) {
      const g = el("g", { transform: `translate(${b.x} ${b.y})` }, this.cx);
      // Text shrinks to fit its box (isAutoSize), "100%" included
      const text = (y, size, value, wPct, cls = "cc-fd") => {
        const fit = Math.min(size, (BULB * wPct) / (value.length * 0.62));
        return el("text", { x: BC, y: f2(BULB * y + BASELINE_K * fit), class: `cc-bulb-text ${cls}`, "font-size": f2(fit) }, g, value.toUpperCase());
      };
      if (data.kind === "short") {
        el("circle", { cx: BC, cy: BC, r: BC, class: "cc-disc cc-fc" }, g);
        icon(g, data.icon, BC, BULB * 0.2, BULB * 0.24, { class: "cc-cx-keep" });
        text(0.51, sc(26), data.title, 0.84);
        text(0.77, sc(17), data.text, 0.63);
        return;
      }
      // With an icon the ring opens at the bottom for it
      const [start, sweep] = data.icon ? [210, 300] : [180, 360];
      el("path", { d: arcD(BULB_R, start, start + sweep, BC, BC), class: "cc-track cc-track-bg" }, g);
      if (data.value > 0) el("path", { d: arcD(BULB_R, start, start + data.value * sweep, BC, BC), class: "cc-track cc-sc" }, g);
      if (data.title) {
        text(0.3, sc(20), data.title, 0.56);
        text(0.49, sc(26), data.text, 0.84);
      } else {
        text(0.5, sc(32), data.text, 0.64);
      }
      if (data.icon) icon(g, data.icon, BC, BULB * 0.93, BULB * 0.24, { class: "cc-cx-keep" });
    }

    // The complication layer, rebuilt when the layout or its data change
    layout(s) {
      const key = `${s.mode}|${s.leftPill}|${s.battery}`;
      if (key === this.last.layout) return;
      this.last.layout = key;
      this.cx.replaceChildren();
      this.paths = el("defs", {}, this.cx);
      this.pathN = 0;
      // The sample data: the Play listing's, with this device's battery
      const battery = `${s.battery}%`;
      if (s.mode === 1) {
        const data = {
          tl: { kind: "short", icon: "event", text: "12:30", title: "Lunch" },
          tr: { kind: "ranged", icon: "battery", text: battery, value: s.battery / 100 },
          bl: { kind: "ranged", text: "7400", value: 0.74 },
          br: { kind: "ranged", icon: "heart", text: "72", value: 0.62 },
        };
        for (const slot of ARC_SLOTS) this.arcSlot(slot, data[slot.id]);
      }
      if (s.mode === 2) {
        this.bulb(BULBS[0], { kind: "short", icon: "sun", title: "Sun", text: "12°" });
        this.bulb(BULBS[1], { kind: "ranged", title: "Steps", text: "7400", value: 0.74 });
        this.bulb(BULBS[2], { kind: "ranged", icon: "battery", text: battery, value: s.battery / 100 });
      } else if (s.leftPill) {
        this.leftPill({ title: "Sun", text: "12°" });
      }
    }

    render(s) {
      const host = this.host;
      const cw = COLORWAYS[s.colorway] || COLORWAYS[DEFAULT_COLORWAY];
      if (this.last.cw !== cw) {
        this.last.cw = cw;
        ["a", "b", "c", "d"].forEach((k, i) => host.style.setProperty(`--cc-${k}`, cw[i + 1]));
      }

      const half = s.mode === 2;
      const aod = s.aod;
      host.classList.toggle("is-aod", aod);
      host.classList.toggle("is-half", half);
      host.classList.toggle("cx-aod-off", !s.cxAod);
      this.clock.setAttribute("transform", half ? `translate(${HALF_SHIFT} 0)` : "");
      this.time.setAttribute("transform", half ? `translate(0 ${f2(sc(6))})` : "");
      this.layout(s);

      // Ticks: which image shows, and at what alpha. In always-on, styles
      // Minutes only and Only time drop them.
      const keep = s.aodStyle !== 0 && s.aodStyle !== 3;
      const show = (n, on) => { n.style.display = on ? "" : "none"; };
      const [m0, m1, mAod] = this.minTicks;
      show(m0, s.index === 0 && !aod);
      show(mAod, s.index === 0 && aod && keep);
      show(m1, s.index === 1 && (!aod || keep));
      const st = this.secTicks;
      show(st.dials, s.index === 0 && !aod && s.mode !== 1);
      show(st.arcs, s.index === 0 && !aod && s.mode === 1);
      show(st.aod, s.index === 0 && aod && keep);
      show(st.partial, s.index === 1 && s.mode !== 1 && (!aod || keep));
      show(st.partialArcs, s.index === 1 && s.mode === 1 && (!aod || keep));

      // Digits: the seconds go in always-on (and with Hide seconds); the
      // minutes stay unless the style drops them
      show(this.secDials.g, !aod && !s.hideSeconds && s.mode !== 1);
      show(this.secArcs.g, !aod && !s.hideSeconds && s.mode === 1);
      show(this.minDigits, !(aod && (s.aodStyle === 2 || s.aodStyle === 3)));
      host.classList.toggle("aod-time-only", aod && s.aodStyle === 3);

      // The rings sweep: the minute ring turns with the minute and second,
      // the second ring with the second; their digits turn back to stay
      // upright, so the current minute and second sit at the pill
      const { h, m, sec } = s.time;
      const minA = (m + sec / 60) * 6;
      const secA = (s.smooth ? sec : Math.floor(sec)) * 6;
      this.minRot.setAttribute("transform", `rotate(${f2(minA)} ${MINUTE_RING / 2} ${MINUTE_RING / 2})`);
      for (const d of this.minTexts) d.t.setAttribute("transform", `rotate(${f2(-minA)} ${f2(d.cx)} ${f2(d.cy)})`);
      this.secRot.setAttribute("transform", `rotate(${f2(secA)} 225 225)`);
      const digits = s.mode === 1 ? this.secArcs : this.secDials;
      for (const d of digits.texts) d.t.setAttribute("transform", `rotate(${f2(-secA)} ${f2(d.cx)} ${f2(d.cy)})`);

      const hh = s.h24 ? pad(h) : pad(h % 12 || 12);
      if (hh !== this.last.hh) this.hour.textContent = this.hourHalf.textContent = this.last.hh = hh;
      const mm = pad(m);
      if (mm !== this.last.mm) this.minute.textContent = this.last.mm = mm;
      return { hh, mm, cw };
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  const faces = [...document.querySelectorAll("[data-cc-face]")].map((dial) => {
    const flavor = FLAVORS[dial.dataset.ccFlavor] || FLAVORS.porcelain;
    return {
      face: new Face(dial),
      watch: dial.closest(".watch"),
      glow: dial.closest("[data-cc-glow]") || dial.closest(".watch")?.parentElement,
      flavor,
    };
  });
  if (!faces.length) return;

  const page = document.querySelector("[data-cc-page]");
  const first = faces[0].flavor;
  // The watch follows the phone's 12/24-hour setting; here, the browser's
  const h24 = (() => {
    try { return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle?.startsWith("h2"); } catch { return false; }
  })();
  const state = {
    live: true,
    minutes: 0, // the time shown when not live, in minutes (fractional)
    flavor: Object.keys(FLAVORS).find((k) => FLAVORS[k] === first),
    colorway: cwIndex(first.colorway),
    mode: first.mode,
    index: 0,
    aodStyle: 1,
    aod: false,
    cxAod: true,
    leftPill: true,
    hideSeconds: false,
    battery: 76,
  };

  navigator.getBattery?.().then((b) => {
    const read = () => { state.battery = Math.round(b.level * 100); render(); };
    b.addEventListener("levelchange", read);
    read();
  }).catch(() => {});

  function displayTime() {
    if (state.live) {
      const d = new Date();
      return { h: d.getHours(), m: d.getMinutes(), sec: d.getSeconds() + d.getMilliseconds() / 1000 };
    }
    const mins = ((state.minutes % 1440) + 1440) % 1440;
    return { h: Math.floor(mins / 60), m: Math.floor(mins % 60), sec: (mins * 60) % 60 };
  }

  const smooth = () => !reduceMotion.matches;
  let lastLabel = "";
  function render() {
    const time = displayTime();
    faces.forEach((f, i) => {
      // The home page's faces keep their own flavor
      const own = i > 0 || !page;
      const r = f.face.render(own
        ? { ...state, colorway: cwIndex(f.flavor.colorway), mode: f.flavor.mode, index: 0, aod: false, leftPill: true, hideSeconds: false, time, h24, smooth: smooth() }
        : { ...state, time, h24, smooth: smooth() });
      f.glow?.style.setProperty("--cc-glow", r.cw[4]);
      if (f.watch) {
        const label = `Concentric+ at ${r.hh}:${r.mm}${!own && state.aod ? ", always-on" : ""}`;
        if (label !== f.label) f.watch.setAttribute("aria-label", (f.label = label));
      }
      if (i === 0) updatePage(time, r);
    });
  }

  // ------ Landing-page controls ------
  const range = page?.querySelector("[data-cc-range]");
  const playBtn = page?.querySelector("[data-cc-play]");
  const nowBtn = page?.querySelector("[data-cc-now]");
  const caption = page?.querySelector("[data-cc-caption]");

  function updatePage(time, r) {
    if (!page) return;
    const host = faces[0].face.host;
    page.style.setProperty("--cc-a", host.style.getPropertyValue("--cc-a"));
    page.style.setProperty("--cc-d", host.style.getPropertyValue("--cc-d"));
    const mins = time.h * 60 + time.m;
    const spoken = `${r.hh}:${r.mm}`;
    if (range) {
      if (state.live || document.activeElement !== range) range.value = mins;
      range.setAttribute("aria-valuetext", spoken);
    }
    if (caption) {
      const label = `${spoken}|${state.live}|${r.cw[0]}|${state.mode}`;
      if (label !== lastLabel) {
        lastLabel = label;
        caption.querySelector("[data-k=cw]").textContent = `${r.cw[0]}, ${MODES[state.mode]}`;
        caption.querySelector("[data-k=time]").textContent = state.live ? `${spoken}, now` : spoken;
      }
    }
    nowBtn?.setAttribute("aria-pressed", String(state.live));
  }

  function setValue(key, text) {
    page?.querySelectorAll(`[data-cc-value="${key}"]`).forEach((n) => { n.textContent = text; });
  }
  function syncValues() {
    const fl = Object.values(FLAVORS).find((f) => cwIndex(f.colorway) === state.colorway && f.mode === state.mode);
    setValue("flavor", fl ? fl.name : "Custom");
    setValue("colorway", COLORWAYS[state.colorway]?.[0] || "");
    setValue("mode", MODES[state.mode]);
    setValue("index", INDEXES[state.index]);
    setValue("aodStyle", AOD_STYLES[state.aodStyle]);
  }
  function check(name, value) {
    const n = page?.querySelector(`input[name="${name}"][value="${value}"]`);
    if (n) n.checked = true;
  }

  // Playing: the clock runs a minute a second, so the second ring spins once
  // a second and the minute ring turns as you watch
  let playing = null;
  function stopPlay() {
    if (!playing) return;
    playing = null;
    playBtn?.setAttribute("aria-pressed", "false");
  }
  function startPlay() {
    const t = displayTime();
    state.live = false;
    playing = { t0: performance.now(), from: t.h * 60 + t.m + t.sec / 60 };
    playBtn?.setAttribute("aria-pressed", "true");
    loop();
  }

  if (page) {
    // The 64 colorway chips, in the watch editor's order
    const box = page.querySelector("[data-cc-colorways]");
    if (box) {
      box.replaceChildren(...COLORWAYS.map(([name, a, b, c, d], i) => {
        const label = document.createElement("label");
        label.className = "pg-chip cc-chip";
        label.title = name;
        label.innerHTML = `<input type="radio" name="cc-colorway" value="${i}" aria-label="${name}"${i === state.colorway ? " checked" : ""} /><span class="pg-chip-face cc-swatch" style="--a:${a};--b:${b};--c:${c};--d:${d}"></span>`;
        return label;
      }));
    }

    range?.addEventListener("input", () => {
      stopPlay();
      state.live = false;
      state.minutes = +range.value;
      render();
    });
    playBtn?.addEventListener("click", () => (playing ? stopPlay() : startPlay()));
    nowBtn?.addEventListener("click", () => {
      stopPlay();
      state.live = true;
      render();
    });

    // data-cc-moment="10:09" (24-hour); "+1h" means the next hour on the dot
    page.querySelectorAll("[data-cc-moment]").forEach((b) => {
      b.addEventListener("click", () => {
        stopPlay();
        const v = b.dataset.ccMoment;
        const t = displayTime();
        state.minutes = v === "+1h"
          ? (t.h + 1) * 60
          : (([hh, mm, ss = 0]) => hh * 60 + mm + ss / 60)(v.split(":").map(Number));
        state.live = false;
        render();
      });
    });

    page.addEventListener("change", (e) => {
      const n = e.target;
      if (!(n instanceof HTMLInputElement) || !n.name.startsWith("cc-")) return;
      const key = n.name.slice(3);
      if (key === "flavor") {
        const fl = FLAVORS[n.value];
        state.colorway = cwIndex(fl.colorway);
        state.mode = fl.mode;
        check("cc-colorway", state.colorway);
        check("cc-mode", state.mode);
      } else if (key === "colorway" || key === "mode" || key === "index") {
        state[key] = +n.value;
      } else if (key === "aodStyle") {
        state.aodStyle = +n.value;
        // Picking an always-on style shows it
        if (!state.aod) {
          state.aod = true;
          const aod = page.querySelector('input[name="cc-aod"]');
          if (aod) aod.checked = true;
        }
      } else {
        state[key] = n.checked;
      }
      // The flavor chip stays lit only while its colorway and layout hold
      const fl = Object.keys(FLAVORS).find((k) => cwIndex(FLAVORS[k].colorway) === state.colorway && FLAVORS[k].mode === state.mode);
      page.querySelectorAll('input[name="cc-flavor"]').forEach((r) => { r.checked = r.value === fl; });
      syncValues();
      render();
    });

    // Start from whatever the form holds (the browser may restore it)
    const checked = (name) => page.querySelector(`input[name="${name}"]:checked`)?.value;
    const fl = FLAVORS[checked("cc-flavor")];
    if (fl) {
      state.colorway = cwIndex(fl.colorway);
      state.mode = fl.mode;
    }
    for (const k of ["mode", "index", "aodStyle"]) {
      const v = checked(`cc-${k}`);
      if (v != null) state[k] = +v;
    }
    page.querySelectorAll("input[type=checkbox][name^='cc-']").forEach((n) => { state[n.name.slice(3)] = n.checked; });
    check("cc-colorway", state.colorway);
    check("cc-mode", state.mode);
    syncValues();
  }

  // ------ Pointer tilt on the landing page, for mice and trackpads only ------
  // (On the home page brief/demo.js already tilts every [data-tilt].)
  if (page && matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion.matches) {
    page.querySelectorAll("[data-tilt]").forEach((area) => {
      const watch = area.querySelector(".watch");
      if (!watch) return;
      let raf = 0;
      area.addEventListener("pointermove", (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = watch.getBoundingClientRect();
          const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / r.width));
          const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / r.height));
          watch.classList.add("is-tilting");
          watch.style.setProperty("--ry", `${(dx * 12).toFixed(2)}deg`);
          watch.style.setProperty("--rx", `${(-dy * 12).toFixed(2)}deg`);
          watch.style.setProperty("--gx", `${(-dx * 18).toFixed(1)}px`);
          watch.style.setProperty("--gy", `${(-dy * 18).toFixed(1)}px`);
        });
      });
      area.addEventListener("pointerleave", () => {
        cancelAnimationFrame(raf);
        watch.classList.remove("is-tilting");
        ["--rx", "--ry", "--gx", "--gy"].forEach((p) => watch.style.removeProperty(p));
      });
    });
  }

  // ------ Running: every frame while a face is on screen (the rings sweep),
  // once a second for people who prefer reduced motion ------
  let onScreen = true;
  let raf = 0;
  let timer = 0;
  function loop() {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    if (document.hidden || !onScreen) return;
    if (playing) {
      state.minutes = (playing.from + (performance.now() - playing.t0) / 1000) % 1440;
    }
    render();
    if (smooth() || playing) raf = requestAnimationFrame(loop);
    else timer = setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
  }

  if ("IntersectionObserver" in window) {
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? seen.add(e.target) : seen.delete(e.target);
      const was = onScreen;
      onScreen = seen.size > 0;
      if (onScreen && !was) loop();
    });
    faces.forEach((f) => io.observe(f.face.host));
  }
  document.addEventListener("visibilitychange", loop);
  reduceMotion.addEventListener?.("change", loop);

  loop();
})();
