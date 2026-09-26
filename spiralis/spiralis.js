/* ============================================================================
   Spiralis — the watch face, redrawn for the web.

   The geometry is the design prototype's (Spiralis repo,
   reference/claude-design/spiralis/, the renderVals() logic), which the face's
   watchface.xml follows, drawn into the same 450×450 canvas so the numbers
   read 1:1 against both:

   - the spiral r = 5·φ^(2θ/π), turning clockwise 30° an hour
   - the 12 hour lines, each a piece of that same spiral, with the numerals
     slid along them; the current hour lights up (or fills, minute by minute)
   - the center minute index, the optional red seconds hand
   - the four complication slots (two rings, two edge arcs), with the spiral
     hidden in a tight halo around each one
   - the seven palettes and the always-on look

   Markup hooks:
     [data-sp-face]        a .dial to draw the face into. Optional
                           data-sp-palette and data-sp-preset set how it starts.
     [data-sp-page]        the landing page: wires every control below to the
                           first face on the page
       [data-sp-range]     time slider (minutes 0–1439)
       [data-sp-play]      play a whole turn (12 hours)
       [data-sp-now]       back to the real time
       [data-sp-caption]   hour + time readout
       [data-sp-moment]    buttons that jump to a time (data-sp-moment="11:23")
       input[name=sp-*]    the settings (radios and checkboxes)
       [data-sp-value=…]   shows the chosen option's name
   The glow behind each watch follows the palette through --sp-glow, and the
   landing page's headline through --sp-pri / --sp-ter.
============================================================================ */
(() => {
  "use strict";

  const SVG = "http://www.w3.org/2000/svg";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------------------------------------------------------------------------
  // The face's constants (prototype + watchface.xml)
  // ---------------------------------------------------------------------------
  const C = 225;
  const PHI = (1 + Math.sqrt(5)) / 2;
  const R0 = 5;

  // [primary, dim, container, tertiary]: the XML's ColorOption colors.
  // dim → spiral, center dot, icons, progress; tertiary → current hour line;
  // container → custom-range track; primary → ring text, range marker.
  const PALETTES = {
    violet: { name: "Violet", c: ["#E9DDFF", "#D0BCFF", "#4D3D76", "#FFB77A"] },
    purple: { name: "Purple", c: ["#E4C2FF", "#CE96FE", "#602C8D", "#FF959E"] },
    blue: { name: "Blue", c: ["#94D7FF", "#60C9FF", "#004C69", "#9D9FFF"] },
    orange: { name: "Orange", c: ["#FDC799", "#EEB98C", "#633F1C", "#DCD794"] },
    golden: { name: "Golden", c: ["#FFDEA0", "#F3BF48", "#5C4300", "#FFB599"] },
    green: { name: "Green", c: ["#B7EDE2", "#A9DFD4", "#194F47", "#A9DCF0"] },
    monochrome: { name: "Monochrome", c: ["#E2E2E2", "#D4D4D4", "#454747", "#D4D4D5"] },
  };

  // The phone app's presets (the XML's Flavors): a palette and which of the
  // four slots are filled. tr = top arc, bl = bottom arc, l / r = the rings.
  const PRESETS = {
    full: { name: "Full", palette: "orange", slots: ["tr", "bl", "l", "r"] },
    rings: { name: "Rings", palette: "green", slots: ["l", "r"] },
    arcs: { name: "Arcs", palette: "blue", slots: ["tr", "bl"] },
    minimal: { name: "Minimal", palette: "monochrome", slots: [] },
  };

  const MINUTES = { 0: "Center dial", 1: "Hour line fill", 2: "Dial and fill" };

  const rad = (deg) => (deg * Math.PI) / 180;
  const pol = (r, deg) => ({ x: C + r * Math.cos(rad(deg)), y: C + r * Math.sin(rad(deg)) });
  const f1 = (n) => +n.toFixed(1);
  const pad = (n) => String(n).padStart(2, "0");

  // Golden spiral r = R0·φ^(2θ/π). It grows counterclockwise (polar angle
  // a = rot − θ), so it turns clockwise as rot grows.
  const thetaAt = (r) => ((Math.PI / 2) * Math.log(r / R0)) / Math.log(PHI);
  const rAt = (th) => R0 * PHI ** (th / (Math.PI / 2));
  function seg(rot, th0, th1, n) {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const th = th0 + ((th1 - th0) * i) / n;
      const r = rAt(th);
      const a = rot - th;
      d += `${i ? " L" : "M"}${f1(C + r * Math.cos(a))} ${f1(C + r * Math.sin(a))}`;
    }
    return d;
  }

  // Hour lines. The spiral turns 30° an hour, so its crossing of a fixed ray
  // grows ×φ^(1/3) an hour: 86, 101, 118, 139, 163, 192 (1–6 above the
  // center, 7–12 below). Line k is the spiral at the rotation it has on hour
  // k, ±45° of spiral angle around that crossing, cut at the rim (r 222).
  const RAD = [0, 1, 2, 3, 4, 5].map((i) => 86 * PHI ** (i / 3));
  const rotAt = (k) => rad(k <= 6 ? 270 : 90) + thetaAt(RAD[(k - 1) % 6]);
  const TH_MAX = thetaAt(222);
  const HALF = rad(45);
  // Numerals slide along their own line so together they trace a spiral:
  // 1 and 7 sit 36° clockwise of the vertical axis, each later hour 9.5° less.
  const SLIDE_FIRST = 36;
  const SLIDE_STEP = 9.5;
  const MIN_PIECE = rad(5);

  const LINES = [];
  for (let k = 1; k <= 12; k++) {
    const r = RAD[(k - 1) % 6];
    const thK = thetaAt(r);
    const rot = rotAt(k);
    const thN = thK - rad(SLIDE_FIRST - ((k - 1) % 6) * SLIDE_STEP);
    const g = Math.asin((k >= 10 ? 16.5 : 10.5) / rAt(thN)); // gap for the numeral
    const pieces = [[thK - HALF, thN - g], [thN + g, Math.min(thK + HALF, TH_MAX)]].filter(([a, b]) => b - a >= MIN_PIECE);
    const rn = rAt(thN);
    LINES[k] = {
      rot, pieces, outer: thK + HALF,
      d: pieces.map(([a, b]) => seg(rot, a, b, 36)).join(" "),
      num: { x: f1(C + rn * Math.cos(rot - thN)), y: f1(C + rn * Math.sin(rot - thN)) },
    };
  }

  // Minutes = line fill: the current line fills clockwise over the hour, the
  // way the spiral sweeps it, from its outer end to its inner end: 90° of
  // spiral angle in all (lines 6 and 12 are cut at the rim, so theirs shows
  // up a little later).
  function lineFill(k, frac) {
    const L = LINES[k];
    const lo = L.outer - HALF * 2 * frac;
    return L.pieces
      .map(([a, b]) => [Math.max(a, lo), b])
      .filter(([a, b]) => b - a > 0.004)
      .map(([a, b]) => seg(L.rot, a, b, Math.max(2, Math.ceil(((b - a) / (HALF * 2)) * 36))))
      .join(" ");
  }

  const FIB = [1, 2, 3, 5, 8];

  // Edge arcs: r 208, 60° long, point-symmetric. Each starts at its outer end
  // (345° top right, 165° bottom left), next to its icon.
  const arcD = (r, a0, a1) => {
    const s = pol(r, a0);
    const e = pol(r, a1);
    return `M${f1(s.x)} ${f1(s.y)} A${r} ${r} 0 0 ${a1 > a0 ? 1 : 0} ${f1(e.x)} ${f1(e.y)}`;
  };

  // Rings: 149 px from the center, 15° off the horizontal axis (left up, right
  // down). Track r 44 with a 25° gap either side of 12 o'clock for the icon.
  const RING_L = pol(149, 195);
  const RING_R = pol(149, 15);
  const ICON_TR = pol(205, 351);
  const ICON_BL = pol(205, 171);

  // Sample weather for the left ring and the bottom-left text (°F where
  // the browser's locale uses it). frac places the ring's marker in
  // today's low–high range.
  const fahrenheit = /-(US|LR|MM|BS|BZ|KY|PW)\b/i.test(navigator.language || "");
  const WX = fahrenheit
    ? { now: 86, lo: 77, hi: 99, unit: "°F" }
    : { now: 30, lo: 25, hi: 37, unit: "°C" };
  WX.frac = (WX.now - WX.lo) / (WX.hi - WX.lo);

  // Filled Material Symbols, 24 px, drawn in the palette's dim color
  const SUN_RAYS = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((a) => `<rect x="11" y="1" width="2" height="4" rx="1" transform="rotate(${a} 12 12)"/>`).join("");
  const ICONS = {
    sun: `<circle cx="12" cy="12" r="4.5"/>${SUN_RAYS}`,
    schedule: '<circle cx="12" cy="12" r="10"/><path d="M12 7v5.4l3.4 2" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    battery: '<rect x="10" y="1.5" width="4" height="2.5" rx="0.8"/><rect x="7" y="3.5" width="10" height="19" rx="1.8"/>',
  };

  const hour12 = (() => {
    try {
      const hc = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
      return hc ? hc === "h12" || hc === "h11" : true;
    } catch { return true; }
  })();
  function spokenTime(h, m) {
    return hour12 ? `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}` : `${h}:${pad(m)}`;
  }

  function el(name, attrs = {}, parent) {
    const n = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent?.appendChild(n);
    return n;
  }

  // ---------------------------------------------------------------------------
  // One face
  // ---------------------------------------------------------------------------
  let uid = 0;

  class Face {
    constructor(dial) {
      const id = `sp${++uid}-`;
      this.host = dial;
      dial.replaceChildren();

      const svg = el("svg", { viewBox: "0 0 450 450", class: "sp-face", "aria-hidden": "true", focusable: "false" }, dial);
      const defs = el("defs", {}, svg);

      // The spiral is hidden in a tight halo around each filled slot
      const mask = el("mask", { id: `${id}mask`, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 450, height: 450 }, defs);
      el("rect", { width: 450, height: 450, fill: "#fff" }, mask);
      const hole = (cx, cy, r) => el("circle", { cx: f1(cx), cy: f1(cy), r, fill: "#000" }, mask);
      const band = (a0, a1) => el("path", { d: arcD(213, a0, a1), fill: "none", stroke: "#000", "stroke-width": 25, "stroke-linecap": "round" }, mask);
      this.masks = {
        l: [hole(RING_L.x, RING_L.y, 50), hole(RING_L.x, RING_L.y - 44, 17)],
        r: [hole(RING_R.x, RING_R.y, 50), hole(RING_R.x, RING_R.y - 44, 17)],
        tr: [band(285, 345), hole(ICON_TR.x, ICON_TR.y, 17)],
        bl: [hole(ICON_BL.x, ICON_BL.y, 17)], // its text carries its own black outline
      };
      el("path", { id: `${id}trl`, d: arcD(185, 285, 345) }, defs);
      el("path", { id: `${id}bl1`, d: arcD(185, 165, 95) }, defs); // inner line: the date
      el("path", { id: `${id}bl2`, d: arcD(207, 165, 95) }, defs); // outer line: the temperatures

      // The complications of the Play Store captures (and the later design
      // iteration in the Spiralis repo, reference/claude-design/spiralis-face/).
      // Top right: battery, a ranged value filling from the icon end.
      // Bottom left: the weather as long text, two lines along the edge.
      this.slots = {};
      const tr = (this.slots.tr = el("g", { class: "sp-slot" }, svg));
      el("path", { d: arcD(208, 285, 345), class: "sp-track" }, tr);
      this.battery = el("path", { class: "sp-prog" }, tr);
      this.batteryText = el("textPath", { href: `#${id}trl`, startOffset: "100%", "text-anchor": "end" }, el("text", { class: "sp-arc-label" }, tr));
      this.icon(tr, "battery", ICON_TR);

      const bl = (this.slots.bl = el("g", { class: "sp-slot" }, svg));
      this.wxDate = el("textPath", { href: `#${id}bl1`, startOffset: "0%", "text-anchor": "start" }, el("text", { class: "sp-arc-label sp-long" }, bl));
      el("textPath", { href: `#${id}bl2`, startOffset: "0%", "text-anchor": "start" }, el("text", { class: "sp-arc-label sp-long" }, bl)).textContent =
        `${WX.now}${WX.unit} · Today ${WX.lo}°/${WX.hi}°`;
      this.icon(bl, "sun", ICON_BL);

      // Hour lines: the 12 dim ones, then the current hour over them
      const lines = el("g", {}, svg);
      for (let k = 1; k <= 12; k++) el("path", { d: LINES[k].d, class: "sp-line" }, lines);
      this.cur = el("path", { class: "sp-line sp-cur" }, lines);

      // The spiral, drawn once at rotation 0 and turned with a transform
      // (the mask sits on a group, so it stays put while the spiral turns)
      this.spiral = el("path", { d: seg(0, thetaAt(0.5), thetaAt(720), 340), class: "sp-spiral" },
        el("g", { mask: `url(#${id}mask)` }, svg));

      // Center minute index
      this.index = el("g", { class: "sp-index" }, svg);
      el("circle", { cx: C, cy: C, r: 50, class: "sp-dial" }, this.index);
      for (let k = 0; k < 12; k++) {
        const a = pol(44, k * 30);
        const b = pol(49, k * 30);
        el("line", { x1: f1(a.x), y1: f1(a.y), x2: f1(b.x), y2: f1(b.y), class: "sp-dial" }, this.index);
      }
      this.hand = el("line", { x1: C, y1: C, x2: C, y2: C - 38, class: "sp-hand" }, this.index);
      this.sec = el("line", { x1: C, y1: C, x2: C, y2: C - 46, class: "sp-sec" }, svg);
      el("circle", { cx: C, cy: C, r: 3, class: "sp-dot" }, svg);

      // Left ring: the weather as a ranged value with a custom range (today's
      // low to high), so the track stays in the container colour and a dot
      // marks the temperature. The icon sits in a gap at the top.
      const lr = (this.slots.l = el("g", { class: "sp-slot sp-ring" }, svg));
      const ringArc = (c, a0, a1) => {
        const p = (a) => ({ x: c.x + 44 * Math.sin(rad(a)), y: c.y - 44 * Math.cos(rad(a)) });
        const [a, b] = [p(a0), p(a1)];
        return `M${f1(a.x)} ${f1(a.y)} A44 44 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f1(b.x)} ${f1(b.y)}`;
      };
      el("path", { d: ringArc(RING_L, 25, 335), class: "sp-range" }, lr);
      const at = { x: RING_L.x + 44 * Math.sin(rad(25 + 310 * WX.frac)), y: RING_L.y - 44 * Math.cos(rad(25 + 310 * WX.frac)) };
      el("circle", { cx: f1(at.x), cy: f1(at.y), r: 7.5, fill: "#000" }, lr);
      el("circle", { cx: f1(at.x), cy: f1(at.y), r: 4.5, class: "sp-marker" }, lr);
      this.icon(lr, "sun", { x: RING_L.x, y: RING_L.y - 44 });
      el("text", { x: f1(RING_L.x), y: f1(RING_L.y + 1), class: "sp-ring-text sp-ring-value", "font-size": 28 }, lr).textContent = `${WX.now}°`;

      // Right ring: time and date as short text on a dark disk, with a
      // notch for the icon
      this.ringText = {};
      for (const [key, c, icon] of [["r", RING_R, "schedule"]]) {
        const g = (this.slots[key] = el("g", { class: "sp-slot sp-ring" }, svg));
        el("circle", { cx: f1(c.x), cy: f1(c.y), r: 46.5, class: "sp-disk" }, g);
        const s = { x: c.x + 44 * Math.sin(rad(25)), y: c.y - 44 * Math.cos(rad(25)) };
        const e = { x: c.x - 44 * Math.sin(rad(25)), y: s.y };
        el("path", { d: `M${f1(s.x)} ${f1(s.y)} A44 44 0 1 1 ${f1(e.x)} ${f1(e.y)}`, class: "sp-ring-aod" }, g);
        el("circle", { cx: f1(c.x), cy: f1(c.y - 44), r: 16, fill: "#000", class: "sp-notch" }, g);
        this.icon(g, icon, { x: c.x, y: c.y - 44 });
        const text = el("text", { x: f1(c.x), y: f1(c.y - 4), class: "sp-ring-text" }, g);
        const title = el("text", { x: f1(c.x), y: f1(c.y + 20), class: "sp-ring-title" }, g);
        this.ringText[key] = { text, title };
      }

      // Numerals on top
      this.nums = [];
      for (let k = 1; k <= 12; k++) {
        const t = el("text", { x: LINES[k].num.x, y: LINES[k].num.y, class: "sp-num" }, svg);
        t.textContent = k;
        this.nums[k] = t;
      }
      this.last = {};
    }

    icon(parent, name, at) {
      const g = el("g", { class: "sp-icon", transform: `translate(${f1(at.x - 12)} ${f1(at.y - 12)})` }, parent);
      g.innerHTML = ICONS[name];
    }

    // s: { date, palette, slots, minutes, seconds, aod, cxAod, battery }
    render(s) {
      const d = s.date;
      const h = d.getHours();
      const m = d.getMinutes();
      const sec = d.getSeconds() + d.getMilliseconds() / 1000;
      const minF = m / 60 + sec / 3600;
      const hourF = (h % 12) + minF;
      const cur = h % 12 || 12;
      const host = this.host;

      // Palette, through the CSS custom properties (they ease between palettes)
      if (this.last.palette !== s.palette) {
        const [pri, acc, con, ter] = (PALETTES[s.palette] || PALETTES.violet).c;
        host.style.setProperty("--sp-pri", pri);
        host.style.setProperty("--sp-acc", acc);
        host.style.setProperty("--sp-con", con);
        host.style.setProperty("--sp-ter", ter);
        this.last.palette = s.palette;
      }
      host.classList.toggle("is-aod", !!s.aod);

      // The spiral: 30° an hour, landing on line k at k o'clock
      const rot = rotAt(1) + ((hourF - 1) * Math.PI) / 6;
      this.spiral.setAttribute("transform", `rotate(${((rot * 180) / Math.PI).toFixed(3)} ${C} ${C})`);

      // Current hour: the whole line, or filling over the hour
      const fill = s.minutes !== "0";
      const curD = fill ? lineFill(cur, minF) : LINES[cur].d;
      if (curD !== this.last.curD) this.cur.setAttribute("d", (this.last.curD = curD));

      // Numerals: the current hour brightens; during 11:23 the Fibonacci
      // numerals 1, 2, 3, 5 and 8 light up too (11:23:58 reads 1 1 2 3 5 8)
      const egg = h % 12 === 11 && m === 23;
      const key = `${cur}|${egg}`;
      if (key !== this.last.nums) {
        this.last.nums = key;
        for (let k = 1; k <= 12; k++) {
          this.nums[k].classList.toggle("is-cur", k === cur);
          this.nums[k].classList.toggle("is-lit", egg && k !== cur && FIB.includes(k));
        }
      }

      // Center index, minute hand, seconds hand
      this.index.classList.toggle("is-off", s.minutes === "1");
      this.hand.setAttribute("transform", `rotate(${(minF * 360).toFixed(2)} ${C} ${C})`);
      this.sec.setAttribute("transform", `rotate(${(Math.floor(sec) * 6).toFixed(0)} ${C} ${C})`);
      this.sec.classList.toggle("is-off", !s.seconds);

      // Complications. Empty slots draw nothing, halo included, so the
      // spiral runs through their space; so does always-on with them off.
      const hideAll = s.aod && !s.cxAod;
      for (const k of ["tr", "bl", "l", "r"]) {
        const on = !hideAll && s.slots.includes(k);
        this.slots[k].classList.toggle("is-off", !on);
        for (const n of this.masks[k]) n.style.display = on ? "" : "none";
      }

      const b = Math.max(0, Math.min(100, s.battery));
      const bKey = `${b}`;
      if (bKey !== this.last.battery) {
        this.last.battery = bKey;
        this.battery.setAttribute("d", b > 0 ? arcD(208, 345 - 0.6 * b, 345) : "M0 0");
        this.batteryText.textContent = b;
      }

      // Time and date on the right ring, the date in the weather text
      const month = d.toLocaleDateString("en-US", { month: "short" });
      const time = hour12 ? `${h % 12 || 12}:${pad(m)}${h < 12 ? "AM" : "PM"}` : `${pad(h)}:${pad(m)}`;
      const rk = `${time}|${month}|${d.getDate()}`;
      if (rk !== this.last.rings) {
        this.last.rings = rk;
        const fit = (t) => Math.min(28, Math.floor(80 / (t.length * 0.6)));
        const { r } = this.ringText;
        r.text.textContent = time;
        r.text.setAttribute("font-size", fit(time));
        r.title.textContent = `${month} ${d.getDate()}`;
        this.wxDate.textContent = `${d.toLocaleDateString("en-US", { weekday: "short" })}, ${month} ${d.getDate()}`;
      }

      return { h, m, cur, egg };
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  const faces = [...document.querySelectorAll("[data-sp-face]")].map((dial) => ({
    face: new Face(dial),
    watch: dial.closest(".watch"),
    glow: dial.closest("[data-sp-glow]") || dial.closest(".watch")?.parentElement,
    preset: dial.dataset.spPreset,
    palette: dial.dataset.spPalette,
  }));
  if (!faces.length) return;

  const page = document.querySelector("[data-sp-page]");
  const first = PRESETS[faces[0].preset] || PRESETS.full;
  const state = {
    live: true,
    minutes: 0, // the time shown when not live, in minutes (fractional)
    preset: faces[0].preset || "full",
    palette: faces[0].palette || first.palette,
    slots: first.slots,
    minutesMode: "0",
    seconds: false,
    aod: false,
    cxAod: true,
    battery: 72,
  };

  navigator.getBattery?.().then((b) => {
    const read = () => { state.battery = Math.round(b.level * 100); render(); };
    b.addEventListener("levelchange", read);
    read();
  }).catch(() => {});

  function displayDate() {
    const now = new Date();
    if (state.live) return now;
    const d = new Date(now);
    const mins = ((state.minutes % 1440) + 1440) % 1440;
    d.setHours(Math.floor(mins / 60), Math.floor(mins % 60), Math.floor((mins * 60) % 60), 0);
    return d;
  }

  let lastLabel = "";
  function render() {
    const date = displayDate();
    faces.forEach((f, i) => {
      // The home page's face keeps its own palette and slots
      const own = i > 0 || !page;
      const r = f.face.render({
        date,
        palette: own ? f.palette || (PRESETS[f.preset] || PRESETS.full).palette : state.palette,
        slots: own ? (PRESETS[f.preset] || PRESETS.full).slots : state.slots,
        minutes: own ? "0" : state.minutesMode,
        seconds: own ? false : state.seconds,
        aod: own ? false : state.aod,
        cxAod: state.cxAod,
        battery: state.battery,
      });
      f.glow?.style.setProperty("--sp-glow", f.face.host.style.getPropertyValue("--sp-acc"));
      if (f.watch) {
        const spoken = spokenTime(r.h, r.m);
        const label = state.aod && !own
          ? `Spiralis in always-on mode at ${spoken}`
          : `Spiralis at ${spoken}: the spiral on ${r.cur}${r.egg ? ", with the Fibonacci numerals lit" : ""}`;
        if (label !== f.label) f.watch.setAttribute("aria-label", (f.label = label));
      }
      if (i === 0) updatePage(date, r);
    });
  }

  // ------ Landing-page controls ------
  const range = page?.querySelector("[data-sp-range]");
  const playBtn = page?.querySelector("[data-sp-play]");
  const nowBtn = page?.querySelector("[data-sp-now]");
  const caption = page?.querySelector("[data-sp-caption]");

  function updatePage(date, r) {
    if (!page) return;
    // The headline and glow follow the palette (see spiralis.css)
    const host = faces[0].face.host;
    page.style.setProperty("--sp-pri", host.style.getPropertyValue("--sp-pri"));
    page.style.setProperty("--sp-ter", host.style.getPropertyValue("--sp-ter"));
    const mins = r.h * 60 + r.m;
    const spoken = spokenTime(r.h, r.m);
    if (range) {
      if (state.live || document.activeElement !== range) range.value = mins;
      range.setAttribute("aria-valuetext", `${spoken}, the spiral on ${r.cur}`);
    }
    if (caption) {
      const label = `${r.cur}|${spoken}|${state.live}|${r.egg}`;
      if (label !== lastLabel) {
        lastLabel = label;
        caption.querySelector("[data-k=hour]").textContent = r.egg ? "1 · 1 · 2 · 3 · 5 · 8" : `The spiral on ${r.cur}`;
        caption.querySelector("[data-k=time]").textContent = state.live ? `${spoken}, now` : spoken;
      }
    }
    nowBtn?.setAttribute("aria-pressed", String(state.live));
  }

  function setValue(key, text) {
    page?.querySelectorAll(`[data-sp-value="${key}"]`).forEach((n) => { n.textContent = text; });
  }
  function syncValues() {
    setValue("preset", PRESETS[state.preset]?.name || "Custom");
    setValue("palette", PALETTES[state.palette]?.name || "");
    setValue("minutes", MINUTES[state.minutesMode]);
  }
  function check(name, value) {
    const n = page?.querySelector(`input[name="${name}"][value="${value}"]`);
    if (n) n.checked = true;
  }

  // Playing a whole turn: 12 hours in 12 seconds, then stop where it started.
  let playing = null;
  function stopPlay() {
    if (!playing) return;
    cancelAnimationFrame(playing.raf);
    playing = null;
    playBtn?.setAttribute("aria-pressed", "false");
  }
  function startPlay() {
    const d = displayDate();
    const from = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    state.live = false;
    playing = { t0: performance.now(), from };
    playBtn?.setAttribute("aria-pressed", "true");
    const step = (now) => {
      const k = Math.min(1, (now - playing.t0) / 12000);
      state.minutes = (playing.from + k * 720) % 1440;
      render();
      if (k < 1) playing.raf = requestAnimationFrame(step);
      else stopPlay();
    };
    playing.raf = requestAnimationFrame(step);
  }

  if (page) {
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

    // data-sp-moment="11:23" (24-hour); "+1h" means the next hour on the dot
    page.querySelectorAll("[data-sp-moment]").forEach((b) => {
      b.addEventListener("click", () => {
        stopPlay();
        const v = b.dataset.spMoment;
        const d = displayDate();
        state.minutes = v === "+1h"
          ? (d.getHours() + 1) * 60
          : (([hh, mm]) => hh * 60 + mm)(v.split(":").map(Number));
        state.live = false;
        render();
      });
    });

    page.addEventListener("change", (e) => {
      const n = e.target;
      if (!(n instanceof HTMLInputElement) || !n.name.startsWith("sp-")) return;
      const key = n.name.slice(3);
      if (key === "preset") {
        const p = PRESETS[n.value];
        state.preset = n.value;
        state.palette = p.palette;
        state.slots = p.slots;
        check("sp-palette", p.palette);
      } else if (key === "palette") {
        state.palette = n.value;
      } else if (key === "minutes") {
        state.minutesMode = n.value;
      } else {
        state[key] = n.checked;
      }
      syncValues();
      render();
    });

    // Start from whatever the form holds (the browser may restore it).
    const checked = (name) => page.querySelector(`input[name="${name}"]:checked`)?.value;
    const preset = checked("sp-preset");
    if (preset && PRESETS[preset]) {
      state.preset = preset;
      state.slots = PRESETS[preset].slots;
    }
    state.palette = checked("sp-palette") || state.palette;
    state.minutesMode = checked("sp-minutes") || state.minutesMode;
    page.querySelectorAll("input[type=checkbox][name^='sp-']").forEach((n) => { state[n.name.slice(3)] = n.checked; });
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

  // ------ Ticking: once a second, only while a face is on screen ------
  let onScreen = true;
  let timer = 0;
  function tick() {
    clearTimeout(timer);
    if (document.hidden || !onScreen) return;
    if (!playing) render();
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  }

  if ("IntersectionObserver" in window) {
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? seen.add(e.target) : seen.delete(e.target);
      const was = onScreen;
      onScreen = seen.size > 0;
      if (onScreen && !was) tick();
    });
    faces.forEach((f) => io.observe(f.face.host));
  }
  document.addEventListener("visibilitychange", tick);

  render();
  tick();
})();
