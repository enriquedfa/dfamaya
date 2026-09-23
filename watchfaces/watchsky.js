/* ============================================================================
   WatchSky — the watch face, redrawn for the web.

   Everything here is lifted from the face's own watchface.xml (WatchSky repo,
   watchface/src/main/res/raw/watchface.xml) and drawn into the same 450×450
   canvas, so coordinates, colours and timings read 1:1 against the XML:

   - the sky: a base gradient plus ten layers, each fading in over its own
     slice of the day (anchored to the sunrise hour S or sunset hour E), with a
     palette per weather bucket for the sunrise/day/sunset layers
   - the sun or moon riding the dashed arc, the moon's phase, the stars
   - the weather glyph and temperature, the date, the middle bar, the bottom
     complication, the clock, the border shadow and the always-on look

   Markup hooks:
     [data-ws-face]        a .dial to draw the face into. Optional
                           data-ws-weather sets its starting weather.
     [data-ws-page]        the landing page: wires every control below to the
                           first face on the page
       [data-ws-range]     time-of-day slider (minutes 0–1439)
       [data-ws-play]      play a whole day
       [data-ws-now]       back to the real time
       [data-ws-caption]   phase + time readout
       [data-ws-moment]    buttons that jump to a moment (data-ws-moment="S+1")
       input[name=ws-*]    the settings (radios and checkboxes)
       [data-ws-value=…]   shows the chosen option's name
   The glow behind each watch follows the sky through --ws-glow, and the
   landing page's headline through --ws-horizon / --ws-zenith.
============================================================================ */
(() => {
  "use strict";

  const SVG = "http://www.w3.org/2000/svg";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------------------------------------------------------------------------
  // The sky (watchface.xml, day_layers). Colours are the XML's ARGB with the
  // opaque alpha dropped. [top, bottom] of a vertical gradient.
  // ---------------------------------------------------------------------------
  const BASE = ["#01030C", "#0D0548"]; // 1. Astronomical twilight / midnight ink

  // Layers 4–8 swap palette on the weather bucket; the others are fixed.
  const SUNRISE = {
    clear: ["#4E518B", "#E5793F"], partly: ["#4A4078", "#FF6B3D"],
    overcast: ["#551F60", "#A05F38"], stormy: ["#2A2E3A", "#5A3038"],
  };
  const GOLDEN_AM = {
    clear: ["#54AAD1", "#F2C460"], partly: ["#6FA8C8", "#FFB347"],
    overcast: ["#6A4670", "#B58A55"], stormy: ["#3A4250", "#6E5A50"],
  };
  const ZENITH = {
    clear: ["#2B5C8F", "#54AAD1"], partly: ["#4D7AA8", "#8FB6D8"],
    overcast: ["#6A7480", "#9DA8B2"], stormy: ["#353C45", "#52595E"],
  };
  const GOLDEN_PM = { ...GOLDEN_AM, partly: ["#6FA8C8", "#FFAA52"] };
  const SUNSET = { ...SUNRISE, partly: ["#4A4078", "#FF5A3D"] };

  // [anchor, start offset (h), fade length (h), colours]
  const LAYERS = [
    ["S", -1, 1, ["#0D0548", "#202B7A"]],   //  2. nautical twilight
    ["S", 0, 0.5, ["#202B7A", "#063AB0"]],  //  3. blue hour
    ["S", 0.5, 1, SUNRISE],                 //  4. civil twilight / sunrise
    ["S", 1.5, 1.5, GOLDEN_AM],             //  5. golden hour
    ["S", 3, 2, ZENITH],                    //  6. zenith
    ["E", -4, 2, GOLDEN_PM],                //  7. golden hour
    ["E", -2, 1, SUNSET],                   //  8. sunset
    ["E", -1, 0.5, ["#202B7A", "#063AB0"]], //  9. blue hour
    ["E", -0.5, 1, ["#0D0548", "#202B7A"]], // 10. nautical twilight
    ["E", 0.5, 1.5, ["#01030C", "#0D0548"]], // 11. astronomical twilight
  ];

  // Stars: hand-placed in the XML as [x, y, size, alpha].
  const STARS = [
    [61, 38, 2, 0.6], [117, 74, 3, 0.78], [204, 28, 2, 0.6], [309, 60, 2, 0.6],
    [387, 45, 2, 0.6], [74, 105, 2, 0.6], [154, 110, 2, 0.6], [367, 105, 2, 0.6],
    [34, 130, 2, 0.6], [89, 165, 2, 0.6], [249, 145, 2, 0.6], [424, 140, 2, 0.6],
    [397, 177, 3, 0.78], [44, 214, 2, 0.6], [159, 224, 2, 0.6], [214, 194, 3, 0.78],
    [274, 220, 2, 0.6], [359, 210, 2, 0.6],
  ];

  // WEATHER.CONDITION as the face groups it: which sky bucket, which glyph
  // (the BitmapFont), and the glyph's alpha. Clear skies draw no glyph so the
  // sun stays unobstructed. Temperatures are just sample readings.
  const WEATHER = {
    off: { name: "Off" },
    clear: { name: "Clear", bucket: "clear", alpha: 0, temp: 24 },
    partly: { name: "Partly cloudy", bucket: "partly", icon: "weather_cloudy", alpha: 220, temp: 21 },
    cloudy: { name: "Cloudy", bucket: "overcast", icon: "weather_cloudy", alpha: 220, temp: 17 },
    fog: { name: "Fog", bucket: "overcast", icon: "weather_fog", alpha: 215, temp: 11 },
    rain: { name: "Rain", bucket: "stormy", icon: "weather_rain", alpha: 235, temp: 14 },
    storm: { name: "Thunderstorm", bucket: "stormy", icon: "weather_storm", alpha: 245, temp: 19 },
    snow: { name: "Snow", bucket: "overcast", icon: "weather_snow", alpha: 235, temp: -2 },
  };

  const MOON = {
    live: "Live", 0: "New moon", 125: "Waxing crescent", 250: "First quarter",
    375: "Waxing gibbous", 500: "Full moon", 625: "Waning gibbous",
    750: "Last quarter", 875: "Waning crescent",
  };
  const BAR = { 0: "Seconds", 1: "Minutes", 2: "Battery", 3: "Off" };

  // Sample calendar for the bottom complication (the default provider is
  // NEXT_EVENT: the time as the title, the event as the text).
  const EVENTS = [[9.5, "Standup"], [12.5, "Lunch with Sam"], [16, "Dentist"], [19.5, "Dinner with friends"]];

  const IMG = (document.currentScript?.src || location.href).replace(/[^/]*$/, "") + "img/";

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgb = (c) => `rgb(${c.map((v) => Math.round(v)).join(" ")})`;
  const pad = (n) => String(n).padStart(2, "0");

  function el(name, attrs = {}, parent) {
    const n = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent?.appendChild(n);
    return n;
  }

  const hour12 = (() => {
    try {
      const hc = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
      return hc ? hc === "h12" || hc === "h11" : true;
    } catch { return true; }
  })();
  const fahrenheit = /-(US|LR|MM|BS|BZ|KY|PW)\b/i.test(navigator.language || "");

  // The sky at hour t (0–24): the base, then every layer composited over it
  // at its alpha, exactly as the stacked PartDraws paint on the watch.
  function sky(t, S, E, bucket) {
    let top = hex(BASE[0]);
    let bot = hex(BASE[1]);
    for (const [anchor, off, span, pal] of LAYERS) {
      const a = clamp((t - ((anchor === "S" ? S : E) + off)) / span);
      if (a <= 0) continue;
      const [ct, cb] = Array.isArray(pal) ? pal : pal[bucket || "clear"];
      top = mix(top, hex(ct), a);
      bot = mix(bot, hex(cb), a);
    }
    return [top, bot];
  }

  // Sun/moon position on the arc: day runs S → E, night E → S.
  function orbit(t, S, E) {
    const day = t >= S && t < E;
    const progress = day ? (t - S) / (E - S) : (t >= E ? t - E : t + 24 - E) / (24 - (E - S));
    return { day, angle: clamp(progress) * 180 - 90 };
  }

  const starAlpha = (t, S, E) => clamp(clamp((t - E) / 0.5) + clamp((S - t) / 0.5));

  // What the sky looks like right now: the newest layer that is at least
  // halfway in. Before any has faded in (after midnight) it is night.
  const PHASES = ["First light", "Blue hour", "Sunrise", "Golden hour", "Daytime", "Golden hour",
    "Sunset", "Blue hour", "Dusk", "Night"];
  function phaseName(t, S, E) {
    let name = "Night";
    LAYERS.forEach(([anchor, off, span], i) => {
      if (t - ((anchor === "S" ? S : E) + off) >= span / 2) name = PHASES[i];
    });
    return name;
  }

  // Moon age as a fraction of the synodic month (0 new, 0.5 full), which is
  // [MOON_PHASE_POSITION] / 28 on the watch.
  function moonPhase(date) {
    const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5;
    const p = (days / 29.530588853) % 1;
    return p < 0 ? p + 1 : p;
  }

  function timeText(h, m) {
    const hh = hour12 ? h % 12 || 12 : h;
    return `${pad(hh)}:${pad(m)}`;
  }
  function spokenTime(h, m) {
    return hour12 ? `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}` : `${h}:${pad(m)}`;
  }

  function nextEvent(t) {
    const e = EVENTS.find(([at]) => at > t);
    if (!e) return { title: "Tomorrow", text: EVENTS[0][1] };
    const h = Math.floor(e[0]);
    return { title: spokenTime(h, Math.round((e[0] - h) * 60)), text: e[1] };
  }

  // ---------------------------------------------------------------------------
  // One face
  // ---------------------------------------------------------------------------
  let uid = 0;

  class Face {
    constructor(dial) {
      const id = `ws${++uid}-`;
      this.host = dial;
      this.shown = null; // colours on screen, for easing between palettes
      dial.replaceChildren();

      const svg = el("svg", { viewBox: "0 0 450 450", class: "ws-face", "aria-hidden": "true", focusable: "false" }, dial);
      const defs = el("defs", {}, svg);

      const skyGrad = el("linearGradient", { id: `${id}sky`, x1: 0, y1: 0, x2: 0, y2: 450, gradientUnits: "userSpaceOnUse" }, defs);
      this.skyTop = el("stop", { offset: 0 }, skyGrad);
      this.skyBot = el("stop", { offset: 1 }, skyGrad);

      const radial = (name, stops, attrs = {}) => {
        const g = el("radialGradient", { id: id + name, ...attrs }, defs);
        for (const [o, c, a] of stops) el("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g);
      };
      radial("sun", [[0, "#FFEDC4", 0.8], [0.55, "#FFE7B0", 0.27], [1, "#FFE7B0", 0]]);
      radial("halo", [[0, "#C8DCFF", 0.53], [0.55, "#C8DCFF", 0.13], [1, "#C8DCFF", 0]]);
      radial("edge", [[0, "#000", 0], [0.95, "#000", 0], [0.985, "#000", 0.4], [1, "#000", 1]],
        { cx: 225, cy: 225, r: 225, gradientUnits: "userSpaceOnUse" });
      el("circle", { cx: 225, cy: 60, r: 15 }, el("clipPath", { id: `${id}moon` }, defs));
      const shadow = el("filter", { id: `${id}shadow`, x: "-20%", y: "-40%", width: "140%", height: "180%" }, defs);
      el("feDropShadow", { dx: 0, dy: 2, stdDeviation: 6, "flood-color": "#000", "flood-opacity": 0.4 }, shadow);

      // Hidden in always-on, like the day_layers group.
      this.day = el("g", { class: "ws-day" }, svg);
      el("rect", { width: 450, height: 450, fill: `url(#${id}sky)` }, this.day);
      el("rect", { y: 270, width: 450, height: 1, fill: "#fff", "fill-opacity": 0.12 }, this.day);
      el("path", {
        d: "M60 225A165 165 0 0 1 390 225", fill: "none", stroke: "#fff", "stroke-opacity": 0.15,
        "stroke-width": 2, "stroke-dasharray": "2 4",
      }, this.day);

      this.stars = el("g", {}, this.day);
      for (const [x, y, s, a] of STARS) {
        el("circle", { cx: x + s / 2, cy: y + s / 2, r: s / 2, fill: "#E8EEF9", "fill-opacity": a }, this.stars);
      }

      this.orbit = el("g", {}, this.day);
      this.sun = el("g", {}, this.orbit);
      el("circle", { cx: 225, cy: 60, r: 40, fill: `url(#${id}sun)` }, this.sun);
      el("circle", { cx: 225, cy: 60, r: 15, fill: "#FFF5D8" }, this.sun);

      this.moon = el("g", {}, this.orbit);
      this.halo = el("circle", { cx: 225, cy: 60, r: 40, fill: `url(#${id}halo)`, class: "ws-screen" }, this.moon);
      const disk = el("g", { "clip-path": `url(#${id}moon)` }, this.moon);
      this.moonDark = el("circle", { cx: 225, cy: 60, r: 15 }, disk);
      this.moonHalf = el("rect", { y: 45, width: 15, height: 30, fill: "#E8EEF9" }, disk);
      this.moonCut = el("ellipse", { cx: 225, cy: 60, ry: 15 }, disk);

      this.weather = el("g", {}, this.day);
      this.wxIcon = el("image", { x: 170, y: 20, width: 96, height: 96 }, this.weather);
      this.temp = el("text", { x: 225, y: 138, class: "ws-text", "font-size": 28, "fill-opacity": 0.9 }, this.weather);

      this.date = el("text", { x: 225, y: 305, class: "ws-text", "font-size": 28, "fill-opacity": 0.85 }, this.day);

      // Lifted out of the day group, like the XML: minutes and battery stay
      // up in always-on.
      this.bar = el("rect", { y: 270, width: 450, height: 2, fill: "#fff", "fill-opacity": 0.6, class: "ws-bar" }, svg);

      this.cx = el("g", { class: "ws-cx" }, svg);
      this.cxTitle = el("text", { x: 225, class: "ws-text" }, this.cx);
      this.cxText = el("text", { x: 225, class: "ws-text" }, this.cx);

      this.clock = el("text", { x: 225, y: 260, class: "ws-clock", filter: `url(#${id}shadow)` }, svg);
      this.clockAod = el("text", { x: 225, y: 260, class: "ws-clock ws-clock-aod" }, svg);

      this.edge = el("rect", { width: 450, height: 450, fill: `url(#${id}edge)`, class: "ws-edge" }, svg);
    }

    // s: { date, S, E, weather, moon, bar, showDate, aod, cxAod, shadow, battery }
    render(s, ease = false) {
      const d = s.date;
      const h = d.getHours();
      const m = d.getMinutes();
      const t = h + m / 60 + d.getSeconds() / 3600;
      const wx = WEATHER[s.weather] || WEATHER.off;
      const { S, E } = s;

      // Sky
      const target = sky(t, S, E, wx.bucket);
      if (ease && this.shown && !reduceMotion.matches) this.ease(target);
      else this.paint(target);

      this.stars.setAttribute("opacity", starAlpha(t, S, E).toFixed(3));

      // Sun or moon on the arc
      const o = orbit(t, S, E);
      this.orbit.setAttribute("transform", `rotate(${o.angle.toFixed(2)} 225 225)`);
      this.sun.style.display = o.day ? "" : "none";
      this.moon.style.display = o.day ? "none" : "";
      if (!o.day) this.drawMoon(s.moon === "live" ? moonPhase(d) : +s.moon / 1000, s.moon === "0");

      // Weather
      this.weather.style.display = wx.bucket ? "" : "none";
      if (wx.bucket) {
        if (wx.icon) this.wxIcon.setAttribute("href", `${IMG}${wx.icon}.webp`);
        this.wxIcon.setAttribute("opacity", (wx.alpha / 255).toFixed(3));
        this.temp.textContent = fahrenheit ? `${Math.round(wx.temp * 1.8 + 32)}°F` : `${wx.temp}°C`;
      }

      // Date, e.g. "Wed · Sep 23"
      this.date.style.display = s.showDate ? "" : "none";
      this.date.textContent = `${d.toLocaleDateString("en", { weekday: "short" })} · ${d.toLocaleDateString("en", { month: "short" })} ${d.getDate()}`;

      // Middle bar. Seconds sweep smoothly on the compositor, pinned to the
      // real clock; the rest are static.
      const sec = s.bar === "0";
      this.bar.classList.toggle("is-hidden", s.bar === "3" || (sec && s.aod));
      if (sec && !reduceMotion.matches && this.bar.animate) {
        this.sweep ||= this.bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 60000, iterations: Infinity });
        this.sweep.currentTime = Date.now() % 60000;
      } else {
        this.sweep?.cancel();
        this.sweep = null;
        const f = sec ? d.getSeconds() / 60 : s.bar === "1" ? (m + d.getSeconds() / 60) / 60 : s.bar === "2" ? s.battery / 100 : 0;
        this.bar.style.transform = `scaleX(${f.toFixed(4)})`;
      }

      // Bottom complication: title + text, or just the text
      const ev = nextEvent(t);
      this.cxTitle.textContent = ev.title;
      this.cxTitle.setAttribute("y", 339);
      this.cxTitle.setAttribute("font-size", 28);
      this.cxText.textContent = ev.text;
      this.cxText.setAttribute("y", 370);
      this.cxText.setAttribute("font-size", 26);
      this.cx.classList.toggle("is-hidden", s.aod && !s.cxAod);

      // Clock
      this.clock.textContent = this.clockAod.textContent = timeText(h, m);

      this.host.classList.toggle("is-aod", !!s.aod);
      this.edge.style.opacity = s.shadow ? 1 : 0;

      return { t, top: target[0], bottom: target[1], wx, phase: phaseName(t, S, E) };
    }

    drawMoon(p, isNew) {
      const c = Math.cos(2 * Math.PI * p);
      this.halo.setAttribute("opacity", ((1 - c) / 2).toFixed(3));
      if (isNew) {
        // The fixed "New moon" option is a flat disk, a shade lighter than the
        // live shadow so it still reads against the night sky.
        this.moonDark.setAttribute("fill", "#121C2F");
        this.moonHalf.style.display = this.moonCut.style.display = "none";
        return;
      }
      this.moonDark.setAttribute("fill", "#030B1C");
      this.moonHalf.style.display = this.moonCut.style.display = "";
      this.moonHalf.setAttribute("x", p < 0.5 ? 225 : 210); // waxing lights the right half
      this.moonCut.setAttribute("rx", (15 * Math.abs(c)).toFixed(2));
      this.moonCut.setAttribute("fill", c > 0 ? "#030B1C" : "#E8EEF9"); // crescent eats in, gibbous fills out
    }

    paint([top, bot]) {
      this.shown = [top, bot];
      this.skyTop.setAttribute("stop-color", rgb(top));
      this.skyBot.setAttribute("stop-color", rgb(bot));
    }

    // A short crossfade when the palette changes (weather, sunrise, sunset).
    ease(target) {
      const from = this.shown;
      const start = performance.now();
      cancelAnimationFrame(this.raf);
      const step = (now) => {
        const k = clamp((now - start) / 450);
        const e = 1 - (1 - k) ** 3;
        this.paint([mix(from[0], target[0], e), mix(from[1], target[1], e)]);
        if (k < 1) this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  const faces = [...document.querySelectorAll("[data-ws-face]")].map((dial) => ({
    face: new Face(dial),
    watch: dial.closest(".watch"),
    glow: dial.closest("[data-ws-glow]") || dial.closest(".watch")?.parentElement,
  }));
  if (!faces.length) return;

  const page = document.querySelector("[data-ws-page]");
  const state = {
    live: true,
    minutes: 0,
    S: 5,
    E: 19,
    weather: faces[0].face.host.dataset.wsWeather || "partly",
    moon: "live",
    bar: "0",
    showDate: true,
    aod: false,
    cxAod: true,
    shadow: false,
    battery: 76,
  };

  navigator.getBattery?.().then((b) => {
    const read = () => { state.battery = Math.round(b.level * 100); if (state.bar === "2") render(); };
    b.addEventListener("levelchange", read);
    read();
  }).catch(() => {});

  function displayDate() {
    const now = new Date();
    if (state.live) return now;
    const d = new Date(now);
    d.setHours(Math.floor(state.minutes / 60), state.minutes % 60, now.getSeconds(), 0);
    return d;
  }

  let lastLabel = "";
  function render(ease = false) {
    const date = displayDate();
    for (const f of faces) {
      const r = f.face.render({ ...state, date }, ease);
      const mid = mix(r.top, r.bottom, 0.5);
      f.glow?.style.setProperty("--ws-glow", rgb(mid));
      if (f.watch) {
        const wx = r.wx.bucket ? `, ${r.wx.name.toLowerCase()}` : "";
        const label = state.aod
          ? `WatchSky in always-on mode at ${spokenTime(date.getHours(), date.getMinutes())}`
          : `WatchSky at ${spokenTime(date.getHours(), date.getMinutes())}: ${r.phase.toLowerCase()}${wx}`;
        if (label !== f.label) f.watch.setAttribute("aria-label", (f.label = label));
      }
      if (f === faces[0]) updatePage(date, r);
    }
  }

  // ------ Landing-page controls ------
  const range = page?.querySelector("[data-ws-range]");
  const playBtn = page?.querySelector("[data-ws-play]");
  const nowBtn = page?.querySelector("[data-ws-now]");
  const caption = page?.querySelector("[data-ws-caption]");

  function updatePage(date, r) {
    if (!page) return;
    // The headline's highlight follows this sky (see watchsky.css)
    page.style.setProperty("--ws-horizon", rgb(r.bottom));
    page.style.setProperty("--ws-zenith", rgb(r.top));
    const mins = date.getHours() * 60 + date.getMinutes();
    const spoken = spokenTime(date.getHours(), date.getMinutes());
    if (range) {
      if (state.live || document.activeElement !== range) range.value = mins;
      range.setAttribute("aria-valuetext", `${spoken}, ${r.phase.toLowerCase()}`);
      range.style.setProperty("--pos", `${(mins / 1439) * 100}%`);
    }
    if (caption) {
      const label = `${r.phase}|${spoken}`;
      if (label !== lastLabel) {
        lastLabel = label;
        caption.querySelector("[data-k=phase]").textContent = r.phase;
        caption.querySelector("[data-k=time]").textContent = state.live ? `${spoken}, now` : spoken;
      }
    }
    nowBtn?.setAttribute("aria-pressed", String(state.live));
  }

  // The slider's track is the day's sky, left to right.
  function paintTrack() {
    if (!range) return;
    const bucket = (WEATHER[state.weather] || WEATHER.off).bucket;
    const stops = [];
    for (let i = 0; i <= 48; i++) {
      const [top, bot] = sky(i / 2, state.S, state.E, bucket);
      stops.push(`${rgb(mix(top, bot, 0.55))} ${((i / 48) * 100).toFixed(2)}%`);
    }
    range.style.setProperty("--track", `linear-gradient(90deg, ${stops.join(", ")})`);
  }

  // Sunrise and sunset hours are numbers; every other setting stays a string,
  // like the option ids in the XML.
  function readInput(n) {
    if (n.type === "checkbox") return n.checked;
    return n.name === "ws-S" || n.name === "ws-E" ? +n.value : n.value;
  }

  function setValue(key, text) {
    page?.querySelectorAll(`[data-ws-value="${key}"]`).forEach((n) => { n.textContent = text; });
  }

  function syncValues() {
    setValue("weather", (WEATHER[state.weather] || WEATHER.off).name);
    setValue("moon", MOON[state.moon]);
    setValue("bar", BAR[state.bar]);
    setValue("hours", `${state.S} AM · ${state.E - 12} PM`);
  }

  // Playing a day: 24 hours in about 14 seconds, then stop where it started.
  let playing = null;
  function stopPlay() {
    if (!playing) return;
    cancelAnimationFrame(playing.raf);
    playing = null;
    playBtn?.setAttribute("aria-pressed", "false");
  }
  function startPlay() {
    const from = state.live ? displayDate().getHours() * 60 + displayDate().getMinutes() : state.minutes;
    state.live = false;
    playing = { t0: performance.now(), from };
    playBtn?.setAttribute("aria-pressed", "true");
    const step = (now) => {
      const k = Math.min(1, (now - playing.t0) / 14000);
      state.minutes = Math.round(playing.from + k * 1440) % 1440;
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

    page.querySelectorAll("[data-ws-moment]").forEach((b) => {
      b.addEventListener("click", () => {
        stopPlay();
        const [, anchor, off] = b.dataset.wsMoment.match(/^([SE]?)([+-]?[\d.]+)$/) || [];
        const h = (anchor === "S" ? state.S : anchor === "E" ? state.E : 0) + +off;
        state.live = false;
        state.minutes = Math.round((((h % 24) + 24) % 24) * 60);
        render();
      });
    });

    page.addEventListener("change", (e) => {
      const n = e.target;
      if (!(n instanceof HTMLInputElement) || !n.name.startsWith("ws-")) return;
      const key = n.name.slice(3);
      state[key] = readInput(n);
      if (key === "weather" || key === "S" || key === "E") paintTrack();
      syncValues();
      render(true);
    });

    // Start from whatever the form holds (the browser may restore it).
    page.querySelectorAll("input[name^='ws-']").forEach((n) => {
      if (n.type === "checkbox" || n.checked) state[n.name.slice(3)] = readInput(n);
    });
    paintTrack();
    syncValues();
  }

  // ------ Pointer tilt on the landing page, for mice and trackpads only ------
  // (Same feel as the Brief watch. On the home page brief/demo.js already
  // tilts every [data-tilt], so this stays inside [data-ws-page].)
  if (page && matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion.matches) {
    page.querySelectorAll("[data-tilt]").forEach((area) => {
      const watch = area.querySelector(".watch");
      if (!watch) return;
      let raf = 0;
      area.addEventListener("pointermove", (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = watch.getBoundingClientRect();
          const dx = clamp((e.clientX - (r.left + r.width / 2)) / r.width, -1, 1);
          const dy = clamp((e.clientY - (r.top + r.height / 2)) / r.height, -1, 1);
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
  reduceMotion.addEventListener?.("change", () => render());

  render();
  tick();
})();
