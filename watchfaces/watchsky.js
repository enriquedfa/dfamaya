/* ============================================================================
   WatchSky — the watch face, redrawn for the web.

   Everything here is lifted from the face's own watchface.xml (WatchSky repo,
   watchface/src/main/res/raw/watchface.xml) and drawn into the same 450×450
   canvas, so coordinates, colours and timings read 1:1 against the XML:

   - the solar model: a latitude band and the date give the sun's hour angle
     and height (tools/wff_solar_expressions.py in that repo generates the
     XML's side of it)
   - the sky: a base gradient plus five layers, each fading in over its own
     band of solar altitude, with a palette per weather bucket for the civil,
     golden and day layers, and the optional dark ground below the horizon
   - the sun or moon riding the dashed arc, the sun's colour and glow, the
     moon's phase, and the stars wheeling about the pole below the horizon
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
       [data-ws-moment]    buttons that jump to a moment of today's sun:
                           "rise:-7" / "set:0" (the sun crossing that altitude,
                           in degrees), "noon" or "midnight"
       input[name=ws-*]    the settings (radios, checkboxes, the latitude range)
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
  const BASE = ["#01030C", "#0D0548"]; // 1. midnight ink, always on

  // Layers 4–6 swap palette on the weather bucket; 2 and 3 are fixed.
  const CIVIL = {
    clear: ["#4E518B", "#E5793F"], partly: ["#4A4078", "#FF6B3D"],
    overcast: ["#551F60", "#A05F38"], stormy: ["#2A2E3A", "#5A3038"],
  };
  const GOLDEN = {
    clear: ["#54AAD1", "#F2C460"], partly: ["#6FA8C8", "#FFB347"],
    overcast: ["#6A4670", "#B58A55"], stormy: ["#3A4250", "#6E5A50"],
  };
  const DAY = {
    clear: ["#2B5C8F", "#54AAD1"], partly: ["#4D7AA8", "#8FB6D8"],
    overcast: ["#6A7480", "#9DA8B2"], stormy: ["#353C45", "#52595E"],
  };

  // [from, to] in degrees of solar altitude, colours. Each layer fades in
  // across its band (linearly in sin(altitude), like the XML's clamp() ramps)
  // and stays on above it, so evening is the morning in reverse.
  const LAYERS = [
    [-18, -12, ["#0D0548", "#202B7A"]], // 2. nautical twilight
    [-12, -6, ["#202B7A", "#063AB0"]],  // 3. blue hour
    [-6, -1, CIVIL],                    // 4. civil twilight: sunrise and sunset
    [-1, 8, GOLDEN],                    // 5. golden hour
    [8, 25, DAY],                       // 6. day
  ];

  // Radial gradients as the XML writes them: ARGB colours, evenly spaced.
  const SUN_GLOW = "#D9FFF3D6 #BDFFEEC4 #9EFFE4A8 #80FFD98E #61F7C978 #45ECB763 #2BDFA452 #14D09244 #00C48238";
  const MOON_HALO = "#8CD2E0FF #75C6D8FF #60BACFFF #4CADC6FF #3A9FBDFF #2A91B4FF #1B83ABFF #0D74A1FF #006598FF";

  // The star field (star_field): [x, y, size] inside its 890×890 group at
  // x = −220. Size 2 is #99E8EEF9, size 3 (the bright ones) #C8E8EEF9.
  const STARS = [
    [548, 789, 2], [407, 631, 3], [830, 463, 2], [651, 646, 2], [663, 234, 2], [659, 153, 2],
    [322, 393, 2], [206, 126, 2], [452, 575, 2], [285, 586, 2], [249, 84, 2], [601, 368, 2],
    [392, 222, 3], [689, 673, 2], [399, 732, 2], [208, 308, 2], [597, 728, 2], [50, 426, 2],
    [354, 293, 2], [211, 343, 2], [180, 476, 3], [569, 584, 2], [422, 465, 2], [181, 270, 2],
    [657, 378, 2], [348, 72, 2], [115, 579, 2], [206, 410, 3], [214, 278, 2], [554, 433, 2],
    [206, 742, 3], [499, 122, 2], [288, 366, 2], [221, 501, 3], [642, 478, 2], [336, 234, 2],
    [616, 231, 2], [547, 848, 2], [818, 596, 2], [529, 144, 2], [309, 59, 2], [473, 385, 2],
    [753, 668, 3], [385, 473, 2], [427, 587, 2], [196, 713, 2], [51, 236, 2], [494, 26, 2],
    [535, 287, 2], [339, 513, 2], [871, 464, 3], [491, 726, 2], [325, 96, 2], [690, 591, 2],
    [873, 365, 2], [814, 195, 2], [562, 710, 2], [362, 260, 3], [124, 484, 3], [274, 424, 2],
    [547, 211, 2], [363, 40, 2], [589, 650, 3], [263, 189, 2], [565, 404, 2], [724, 665, 2],
    [402, 381, 2], [516, 532, 2], [331, 615, 2], [432, 121, 2], [561, 289, 2], [303, 519, 2],
    [772, 359, 2], [359, 567, 2], [754, 710, 2], [472, 324, 3], [326, 278, 2], [526, 673, 2],
    [583, 67, 2], [319, 544, 2], [271, 158, 3], [294, 247, 2], [720, 735, 2], [228, 140, 2],
    [426, 835, 2], [359, 604, 2], [453, 817, 2], [108, 333, 2], [35, 456, 2], [564, 174, 2],
    [290, 827, 2], [70, 321, 2], [440, 159, 2], [321, 786, 2], [337, 868, 2], [470, 757, 3],
    [125, 299, 2], [819, 333, 3], [199, 791, 2], [717, 545, 3], [265, 104, 3], [115, 543, 2],
    [810, 569, 2], [437, 521, 3], [714, 153, 2], [92, 596, 2], [763, 499, 2], [784, 599, 2],
    [362, 363, 2], [425, 97, 2], [733, 344, 3], [98, 447, 2], [477, 148, 2], [713, 421, 3],
    [827, 275, 2], [443, 349, 2], [627, 306, 2], [511, 418, 2], [285, 795, 2], [529, 387, 2],
    [116, 271, 3], [440, 418, 3], [293, 24, 2], [661, 460, 2], [803, 466, 3], [608, 202, 3],
    [820, 679, 2], [676, 708, 2], [15, 309, 3], [48, 622, 2], [543, 820, 2], [112, 358, 2]
  ];

  // z6_latitude: the watch's 25 bands and the cities on their labels.
  const CITIES = {
    70: "Tromsø, Murmansk", 65: "Reykjavík, Fairbanks", 60: "Oslo, Helsinki, Anchorage",
    55: "Copenhagen, Moscow, Edinburgh", 50: "London, Prague, Vancouver",
    45: "Milan, Montreal, Minneapolis", 40: "Madrid, New York, Beijing",
    35: "Tokyo, Tehran, Los Angeles", 30: "Cairo, Houston, New Delhi", 25: "Miami, Taipei, Riyadh",
    20: "Mexico City, Mumbai, Hanoi", 15: "Manila, Dakar, Guatemala City", 10: "Caracas, Panama City",
    5: "Bogotá, Lagos, Colombo", 0: "Quito, Singapore, Nairobi", "-5": "Jakarta, Kinshasa, Manaus",
    "-10": "Lima, Recife, Luanda", "-15": "Brasília, La Paz, Lusaka", "-20": "Belo Horizonte, Harare",
    "-25": "São Paulo, Johannesburg, Asunción", "-30": "Porto Alegre, Durban, Perth",
    "-35": "Buenos Aires, Cape Town, Sydney", "-40": "Melbourne, Wellington",
    "-45": "Christchurch, Hobart", "-50": "Río Gallegos, Stanley",
  };

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
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const sinD = (d) => Math.sin(rad(d));

  function el(name, attrs = {}, parent) {
    const n = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent?.appendChild(n);
    return n;
  }

  // Gradient stops from the XML's "#AARRGGBB …" colours and positions
  function stops(grad, colors, positions) {
    const cs = colors.split(" ");
    cs.forEach((c, i) => el("stop", {
      offset: positions ? positions[i] : i / (cs.length - 1),
      "stop-color": `#${c.slice(3)}`,
      "stop-opacity": (parseInt(c.slice(1, 3), 16) / 255).toFixed(3),
    }, grad));
  }

  const hour12 = (() => {
    try {
      const hc = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
      return hc ? hc === "h12" || hc === "h11" : true;
    } catch { return true; }
  })();
  const fahrenheit = /-(US|LR|MM|BS|BZ|KY|PW)\b/i.test(navigator.language || "");

  // [IS_DAYLIGHT_SAVING_TIME]: the clock is ahead of the zone's standard time
  function isDst(d) {
    const jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
    const jul = new Date(d.getFullYear(), 6, 1).getTimezoneOffset();
    return d.getTimezoneOffset() < Math.max(jan, jul);
  }

  // ---------------------------------------------------------------------------
  // The sun. The face knows a latitude band and the date, not a location, so
  // solar noon is taken as 12:00 local, as on the watch.
  // ---------------------------------------------------------------------------

  // What depends on the day, not the hour.
  function sunDay(date, lat) {
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const doy = Math.round((midnight - new Date(date.getFullYear(), 0, 0)) / 864e5); // [DAY_OF_YEAR]
    const g = rad((360 * (doy - 81)) / 365); // 0 at the March equinox
    const sd = 0.3978 * Math.sin(g);         // sin(declination); 0.3978 = sin(23.44°)
    const cd = Math.sqrt(1 - sd * sd);
    const A = sinD(lat) * sd;
    const B = Math.cos(rad(lat)) * cd;
    return {
      A,
      B,
      eot: 9.87 * Math.sin(2 * g) - 7.53 * Math.cos(g) - 1.5 * Math.sin(g), // equation of time, minutes
      dst: isDst(date) ? 1 : 0,
      // Half the day in hour angle. The horizon is −0.833° (refraction and
      // half the disc), sin = −0.0145; the clamp gives polar day (180) and
      // polar night (0).
      H0: deg(Math.acos(clamp((-0.0145 - A) / B, -1, 1))),
    };
  }

  // At clock hour t: the hour angle H (15° an hour from solar noon, wrapped
  // into [−180, 180)), sin(altitude), and whether the sun is up.
  function sunAt(t, day) {
    const H = ((15 * (t - day.dst + day.eot / 60 - 12) + 540) % 360) - 180;
    return { H, sinAlt: day.A + day.B * Math.cos(rad(H)), up: day.H0 > Math.abs(H) };
  }

  // And back: the clock hour of hour angle H, and of the sun crossing
  // altitude a (degrees) rising (side −1) or setting (+1). Null if it doesn't
  // today at this latitude.
  const clockAt = (H, day) => (((12 + H / 15 - day.eot / 60 + day.dst) % 24) + 24) % 24;
  function crossing(a, side, day) {
    const c = (sinD(a) - day.A) / day.B;
    return Math.abs(c) > 1 ? null : clockAt(side * deg(Math.acos(c)), day);
  }

  const ramp = (sinAlt, lo, hi) => clamp((sinAlt - sinD(lo)) / (sinD(hi) - sinD(lo)));

  // The sky at this altitude: the base, then every layer composited over it
  // at its alpha, exactly as the stacked PartDraws paint on the watch.
  function sky(sinAlt, bucket) {
    let top = hex(BASE[0]);
    let bot = hex(BASE[1]);
    for (const [lo, hi, pal] of LAYERS) {
      const a = ramp(sinAlt, lo, hi);
      if (a <= 0) continue;
      const [ct, cb] = Array.isArray(pal) ? pal : pal[bucket || "clear"];
      top = mix(top, hex(ct), a);
      bot = mix(bot, hex(cb), a);
    }
    return [top, bot];
  }

  // The sun's place on the arc: −90° at sunrise, 0 at solar noon, +90° at
  // sunset. At night the moon makes the same trip, sunset to sunrise.
  function orbit(sun, day) {
    if (sun.up) return (90 * sun.H) / day.H0;
    const night = 360 - 2 * day.H0;
    return night > 0 ? (((sun.H + 360 - day.H0) % 360) / night) * 180 - 90 : 90;
  }

  // Stars: all out once the sun is 18° down, gone by 6° down
  const starAlpha = (sinAlt) => clamp((sinD(-6) - sinAlt) / (sinD(-6) - sinD(-18)));

  // What the sky looks like right now: the highest layer that is at least
  // halfway in, named for the morning or the evening.
  const PHASES = [["First light", "Dusk"], ["Blue hour", "Blue hour"], ["Sunrise", "Sunset"],
    ["Golden hour", "Golden hour"], ["Daytime", "Daytime"]];
  function phaseName(sun) {
    let name = "Night";
    LAYERS.forEach(([lo, hi], i) => {
      if (ramp(sun.sinAlt, lo, hi) >= 0.5) name = PHASES[i][sun.H < 0 ? 0 : 1];
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
  function spokenHour(t) {
    const mins = Math.round(t * 60) % 1440;
    return spokenTime(Math.floor(mins / 60), mins % 60);
  }

  // "40° N", "0°", "5° S" and "40 degrees north", "Equator"
  const latName = (lat) => `${Math.abs(lat)}°${lat > 0 ? " N" : lat < 0 ? " S" : ""}`;
  const latSpoken = (lat) => (lat ? `${Math.abs(lat)} degrees ${lat > 0 ? "north" : "south"}` : "Equator");

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

      stops(el("radialGradient", { id: `${id}sun` }, defs), SUN_GLOW);
      stops(el("radialGradient", { id: `${id}halo` }, defs), MOON_HALO);
      stops(el("radialGradient", { id: `${id}edge`, cx: 225, cy: 225, r: 225, gradientUnits: "userSpaceOnUse" }, defs),
        "#00000000 #00000000 #66000000 #FF000000", [0, 0.95, 0.985, 1]);
      stops(el("linearGradient", { id: `${id}ground`, x1: 0, y1: 270, x2: 0, y2: 315, gradientUnits: "userSpaceOnUse" }, defs),
        "#61000000 #A6000000 #D7000000 #F5000000 #FF000000");
      el("circle", { cx: 225, cy: 60, r: 15 }, el("clipPath", { id: `${id}moon` }, defs));
      el("rect", { width: 450, height: 270 }, el("clipPath", { id: `${id}above` }, defs));
      const shadow = el("filter", { id: `${id}shadow`, x: "-20%", y: "-40%", width: "140%", height: "180%" }, defs);
      el("feDropShadow", { dx: 0, dy: 2, stdDeviation: 6, "flood-color": "#000", "flood-opacity": 0.4 }, shadow);

      // Hidden in always-on, like the day_layers group.
      this.day = el("g", { class: "ws-day" }, svg);
      // The sky wrapper: Dark ground squeezes it into the top 315 px.
      this.sky = el("g", { class: "ws-sky" }, this.day);
      el("rect", { width: 450, height: 450, fill: `url(#${id}sky)` }, this.sky);
      // Dark ground: the sky's last 45 px below the horizon fade to black
      this.ground = el("rect", { y: 270, width: 450, height: 50, fill: `url(#${id}ground)`, class: "ws-ground" }, this.day);
      el("rect", { y: 270, width: 450, height: 1, fill: "#fff", "fill-opacity": 0.12 }, this.day);
      el("path", {
        d: "M60 225A165 165 0 0 1 390 225", fill: "none", stroke: "#fff", "stroke-opacity": 0.15,
        "stroke-width": 2, "stroke-dasharray": "2 4",
      }, this.day);

      // Stars, clipped to the sky above the horizon, wheeling about the pole
      this.stars = el("g", { "clip-path": `url(#${id}above)` }, this.day);
      this.starField = el("g", {}, this.stars);
      for (const [x, y, s] of STARS) {
        el("circle", { cx: x - 220 + s / 2, cy: y + s / 2, r: s / 2, fill: "#E8EEF9", "fill-opacity": s > 2 ? 0.784 : 0.6 }, this.starField);
      }

      this.orbit = el("g", {}, this.day);
      this.sun = el("g", {}, this.orbit);
      this.glow = el("circle", { cx: 225, cy: 60, r: 40, fill: `url(#${id}sun)`, class: "ws-plus" }, this.sun);
      el("circle", { cx: 225, cy: 60, r: 15, fill: "#E8A54A" }, this.sun);
      this.sunCream = el("circle", { cx: 225, cy: 60, r: 15, fill: "#FFF5D8" }, this.sun);

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

    // s: { date, lat, weather, moon, bar, showDate, aod, cxAod, shadow, ground, battery }
    render(s, ease = false) {
      const d = s.date;
      const h = d.getHours();
      const m = d.getMinutes();
      const t = h + m / 60 + d.getSeconds() / 3600;
      const wx = WEATHER[s.weather] || WEATHER.off;
      const day = sunDay(d, s.lat);
      const sun = sunAt(t, day);

      // Sky
      const target = sky(sun.sinAlt, wx.bucket);
      if (ease && this.shown && !reduceMotion.matches) this.ease(target);
      else this.paint(target);
      this.sky.classList.toggle("is-squeezed", !!s.ground);
      this.ground.classList.toggle("is-hidden", !s.ground);

      // Stars: 15° an hour, clockwise about the pole |latitude| below the horizon
      this.stars.setAttribute("opacity", starAlpha(sun.sinAlt).toFixed(3));
      this.starField.setAttribute("transform", `rotate(${((15 * t) % 360).toFixed(2)} 225 ${270 + 2.5 * Math.abs(s.lat)})`);

      // Sun or moon on the arc
      this.orbit.setAttribute("transform", `rotate(${orbit(sun, day).toFixed(2)} 225 225)`);
      this.sun.style.display = sun.up ? "" : "none";
      this.moon.style.display = sun.up ? "none" : "";
      if (sun.up) {
        // Ochre on the horizon, whitening as it climbs; the glow grows from
        // half size to full by 25° up.
        this.sunCream.setAttribute("opacity", clamp(sun.sinAlt).toFixed(3));
        const k = 0.5 + 0.5 * clamp(sun.sinAlt / sinD(25));
        this.glow.setAttribute("r", (40 * k).toFixed(2));
      } else {
        this.drawMoon(s.moon === "live" ? moonPhase(d) : +s.moon / 1000, s.moon === "0");
      }

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

      return { t, top: target[0], bottom: target[1], wx, phase: phaseName(sun) };
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

    // A short crossfade when the palette changes (weather, latitude).
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
    lat: 40,
    weather: faces[0].face.host.dataset.wsWeather || "partly",
    moon: "live",
    bar: "0",
    showDate: true,
    aod: false,
    cxAod: true,
    shadow: false,
    ground: false,
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
  const latRange = page?.querySelector("input[name=ws-lat]");
  const playBtn = page?.querySelector("[data-ws-play]");
  const nowBtn = page?.querySelector("[data-ws-now]");
  const caption = page?.querySelector("[data-ws-caption]");
  const moments = page ? [...page.querySelectorAll("[data-ws-moment]")] : [];

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

  // The time slider's track is today's sky at this latitude, left to right.
  // The latitude slider's is today's length of day, south to north: night
  // ink where the sun stays down, midday blue where it never sets.
  function paintTracks() {
    const today = displayDate();
    if (range) {
      const bucket = (WEATHER[state.weather] || WEATHER.off).bucket;
      const day = sunDay(today, state.lat);
      const cols = [];
      for (let i = 0; i <= 48; i++) {
        const [top, bot] = sky(sunAt(i / 2, day).sinAlt, bucket);
        cols.push(`${rgb(mix(top, bot, 0.55))} ${((i / 48) * 100).toFixed(2)}%`);
      }
      range.style.setProperty("--track", `linear-gradient(90deg, ${cols.join(", ")})`);
    }
    if (latRange) {
      const min = +latRange.min;
      const max = +latRange.max;
      const cols = [];
      for (let lat = min; lat <= max; lat += 5) {
        const f = sunDay(today, lat).H0 / 180;
        cols.push(`${rgb(mix(hex(BASE[1]), hex(DAY.clear[1]), f))} ${(((lat - min) / (max - min)) * 100).toFixed(2)}%`);
      }
      latRange.style.setProperty("--track", `linear-gradient(90deg, ${cols.join(", ")})`);
    }
  }

  // The latitude is a number; every other setting stays a string, like the
  // option ids in the XML.
  function readInput(n) {
    if (n.type === "checkbox") return n.checked;
    return n.name === "ws-lat" ? +n.value : n.value;
  }

  function setValue(key, text) {
    page?.querySelectorAll(`[data-ws-value="${key}"]`).forEach((n) => { n.textContent = text; });
  }

  // Today's sunrise and sunset at this latitude, in words
  function sunTimes(day) {
    if (day.H0 >= 180) return "Today the sun doesn't set here.";
    if (day.H0 <= 0) return "Today the sun doesn't rise here.";
    return `Today the sun rises at ${spokenHour(clockAt(-day.H0, day))} and sets at ${spokenHour(clockAt(day.H0, day))}.`;
  }

  function momentHour(spec, day) {
    if (spec === "noon") return clockAt(0, day);
    if (spec === "midnight") return clockAt(-180, day);
    const [, side, a] = spec.match(/^(rise|set):(-?[\d.]+)$/) || [];
    return side ? crossing(+a, side === "rise" ? -1 : 1, day) : null;
  }

  function syncValues() {
    setValue("weather", (WEATHER[state.weather] || WEATHER.off).name);
    setValue("moon", MOON[state.moon]);
    setValue("bar", BAR[state.bar]);
    setValue("lat", latName(state.lat));
    setValue("cities", CITIES[state.lat]);
    const day = sunDay(displayDate(), state.lat);
    setValue("sun", sunTimes(day));
    latRange?.setAttribute("aria-valuetext", `${latSpoken(state.lat)}. ${CITIES[state.lat]}.`);
    // A moment the sun skips today at this latitude (no blue hour under the
    // midnight sun, no sunrise in the polar night) can't be jumped to.
    for (const b of moments) b.disabled = momentHour(b.dataset.wsMoment, day) === null;
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

    for (const b of moments) {
      b.addEventListener("click", () => {
        const h = momentHour(b.dataset.wsMoment, sunDay(displayDate(), state.lat));
        if (h === null) return;
        stopPlay();
        state.live = false;
        state.minutes = Math.round(h * 60) % 1440;
        render();
      });
    }

    // Radios and checkboxes on change; the latitude slider as it moves.
    const onSetting = (e) => {
      const n = e.target;
      if (!(n instanceof HTMLInputElement) || !n.name.startsWith("ws-")) return;
      if ((e.type === "input") !== (n.type === "range")) return;
      const key = n.name.slice(3);
      state[key] = readInput(n);
      if (key === "weather" || key === "lat") paintTracks();
      syncValues();
      render(true);
    };
    page.addEventListener("change", onSetting);
    page.addEventListener("input", onSetting);

    // Start from whatever the form holds (the browser may restore it).
    page.querySelectorAll("input[name^='ws-']").forEach((n) => {
      if (n.type !== "radio" || n.checked) state[n.name.slice(3)] = readInput(n);
    });
    paintTracks();
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
