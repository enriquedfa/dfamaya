/* Brief demo — one glance state, drawn on every surface on the page.
 *
 * Like the app: a single "winning" source at a time, and the complications,
 * the tile and the phone widget all show it in lock-step. On its own it
 * cycles like the app's onboarding; while the visitor scrolls through the
 * list of sources, the step in the middle of the screen takes over. The
 * clock, the countdown and the song position are live.
 *
 * Surfaces are opt-in by markup, so one script runs the landing page and the
 * small watch on the home page:
 *   [data-cx="long|ranged|short"]  complication slots on the watch face
 *   [data-surface="tile|widget"]   the tile and the phone widget
 *   [data-chip="<id>"]             source picker buttons
 *   [data-step="<id>"]             scroll-story steps (pin the watch)
 *   [data-caption]                 name + one-liner for the current source
 *   [data-clock]                   the time
 *   [data-demo-toggle]             pause / play
 *   [data-tilt]                    area whose pointer tilts the watch inside
 *   [data-song-toggle]             play / pause the song preview
 */
(() => {
  "use strict";

  const HOLD_MS = 3400; // time each glance stays up
  const PICKED_HOLD_MS = 8000; // longer hold after someone picks a source

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const wide = matchMedia("(min-width: 900px)");

  // ---------------------------------------------------------------------------
  // Locale bits: 12/24 h clock, °F/°C, date wording
  // ---------------------------------------------------------------------------
  const region = (() => {
    try {
      return new Intl.Locale(navigator.language).maximize().region || "US";
    } catch {
      return "US";
    }
  })();
  const fahrenheit = ["US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH"].includes(region);
  const hour12 = (() => {
    const hc = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
    return hc ? hc === "h12" || hc === "h11" : true;
  })();
  const dateLocale = region === "US" ? "en-US" : "en-GB";

  const fmtTime = new Intl.DateTimeFormat(dateLocale, { hour: "numeric", minute: "2-digit", hour12 });
  const fmtShortDate = new Intl.DateTimeFormat(dateLocale, { weekday: "short", month: "short", day: "numeric" });
  const fmtWeekday = new Intl.DateTimeFormat(dateLocale, { weekday: "long" });
  const fmtWeekdayShort = new Intl.DateTimeFormat(dateLocale, { weekday: "short" });
  const fmtMonthDay = new Intl.DateTimeFormat(dateLocale, { month: "long", day: "numeric" });

  // "10:54 AM" -> "10:54am", the compact form Brief uses on the wrist
  const time = (ms) => fmtTime.format(ms).replace(/\s?([AP])\.?M\.?$/i, (_, a) => `${a.toLowerCase()}m`);

  // ---------------------------------------------------------------------------
  // Live state behind the glances
  // ---------------------------------------------------------------------------
  const MIN = 60_000;
  const LOOKAHEAD_MIN = 30;
  let eventStart = Date.now() + 12 * MIN;

  const TRACK_LEN_S = 248; // 4:08
  const trackStartedAt = Date.now() - 62_000;

  // The one real song: Apple's official 30 s preview, streamed from Apple
  // (never hosted here), credited with a link back to Apple Music. It only
  // plays when someone presses play.
  const SONG = {
    title: "storm",
    artist: "Night Tapes",
    album: "portals//polarities",
    preview:
      "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/6a/f8/89/6af88923-480d-0a6f-ee50-d83f8a968a32/mzaf_1016940614169845687.plus.aac.p.m4a",
    art: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/f8/59/e2/f859e2a3-3d98-98b4-0c01-d8007e77093e/067003173155.png/600x600bb.jpg",
  };
  const SONG_VOLUME = 0.35; // background level, not a blast
  let audio = null; // created on first play
  // Sound belongs to the "Now playing" glance: once the song starts it plays
  // whenever music is on the watch, pauses when another glance takes over,
  // and stops following the glance when someone pauses it themselves.
  let wantSound = false;
  // On the Brief page ▶ starts the song. If someone skips that and music
  // comes up anyway (scrolling to it, say), the song tries to start by
  // itself. Browsers only allow that once the visitor has clicked or tapped
  // something on the page; until then the glance runs silently, and it tries
  // again on the next music turn. Once it has played (or been paused), it
  // never starts by itself again.
  let autoplayArmed = !!document.querySelector("[data-song-autoplay]") && !navigator.connection?.saveData;
  let songFailed = false;
  // Apple's previews are AAC; every major browser plays them, but some builds
  // (open-source Chromium, for one) can't, and then there's no button at all.
  const canPlaySong = (() => {
    try {
      return new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"') !== "";
    } catch {
      return false;
    }
  })();
  const songLive = () => !!audio && !songFailed && (!audio.paused || audio.currentTime > 0);
  const songPlaying = () => !!audio && !songFailed && !audio.paused && !audio.ended;

  const temps = fahrenheit ? { now: 68, lo: 57, hi: 77, unit: "F" } : { now: 18, lo: 14, hi: 25, unit: "C" };

  const pad = (n) => String(n).padStart(2, "0");
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // bg / fg are each source's identity colours from the app's Theme.kt (tone 30 / tone 90).
  // `icon` is the source's badge on the page; `face` is the glyph the complication draws.
  const SOURCES = [
    {
      id: "music",
      name: "Now playing",
      blurb: canPlaySong ? "Tap the watch to play or pause." : "Track and artist, with play and pause.",
      bg: "#7B2949",
      fg: "#FFD9E2",
      icon: "music",
      face: "play",
      glance(now) {
        // While the preview is loaded, everything follows the audio itself.
        const live = songLive();
        const progress = live
          ? audio.currentTime / (audio.duration || 30)
          : (((now - trackStartedAt) / 1000) % TRACK_LEN_S) / TRACK_LEN_S;
        const paused = live && !songPlaying();
        return {
          // Like the watch: ▶ while playing, ⏸ while paused (a status glyph)
          face: paused ? "pause" : "play",
          long: { title: SONG.artist, text: SONG.title },
          ranged: { lines: [SONG.title], value: progress },
          short: { lines: [SONG.title] },
          tile: {
            title: paused ? "Paused" : "Now playing",
            ring: progress,
            card: { kind: "music", title: SONG.title, artist: SONG.artist },
            edge: { text: "Player" },
          },
          widget: { title: SONG.title, text: SONG.artist, bar: progress, button: paused ? "play" : "pause" },
        };
      },
    },
    {
      id: "notification",
      name: "Notifications",
      blurb: "An alert from an app you picked. Every other app is ignored.",
      bg: "#00504B",
      fg: "#BCECE5",
      icon: "notification",
      face: "notification",
      glance() {
        return {
          long: { title: "Messages", text: "Alex: On my way" },
          ranged: { lines: ["Messages"], value: 0.7 },
          short: { lines: ["Messages"] },
          tile: {
            title: "Notification",
            card: { kind: "notification", app: "Messages", headline: "Alex", body: "On my way, 5 min out" },
            edge: { icon: "brief" },
          },
          widget: { title: "Weekend plans: Alex", text: "On my way, 5 min out" },
        };
      },
    },
    {
      id: "event",
      name: "Calendar",
      blurb: "Your next event, counting down.",
      bg: "#50378A",
      fg: "#E9DDFF",
      icon: "event",
      face: "event",
      glance(now) {
        const mins = Math.max(1, Math.ceil((eventStart - now) / MIN));
        const inWords = mins === 1 ? "In 1 minute" : `In ${mins} mins`; // the wrist's wording
        const range = `${time(eventStart)} – ${time(eventStart + 15 * MIN)}`;
        return {
          long: { title: inWords, text: "Standup" },
          ranged: { lines: [`${mins}m`], value: clamp01(mins / LOOKAHEAD_MIN) },
          short: { lines: [`${mins}m`] },
          tile: {
            title: "Up next",
            ring: clamp01(mins / LOOKAHEAD_MIN),
            card: { kind: "event", title: "Standup", range, location: "Room 4B" },
            edge: { text: "Calendar" },
          },
          widget: { title: "Standup", text: range, pill: `${mins} min` },
        };
      },
      onShow(now) {
        // Keep the countdown believable however long the page stays open.
        if (eventStart - now < 3 * MIN) eventStart = now + 12 * MIN;
      },
    },
    {
      id: "battery",
      name: "Phone battery",
      blurb: "A heads-up when your phone gets low.",
      bg: "#00531D",
      fg: "#CAEBC7",
      icon: "phone-battery",
      face: "battery",
      glance() {
        return {
          long: { title: "15%", text: "Phone battery low" },
          ranged: { lines: ["15%"], value: 0.15 },
          short: { lines: ["15%"] },
          tile: {
            title: "Battery",
            card: { kind: "battery", big: "15%", label: "Phone battery low" },
            edge: { icon: "brief" },
          },
          widget: { title: "Phone battery low", text: "15%", bar: 0.15 },
        };
      },
    },
    {
      id: "weather",
      name: "Weather",
      blurb: "What it's doing outside, and a heads-up before rain.",
      bg: "#004D64",
      fg: "#C2E8FC",
      icon: "sun",
      face: "sun",
      glance(now) {
        const { now: t, lo, hi, unit } = temps;
        const pos = (t - lo) / (hi - lo);
        return {
          long: { title: fmtShortDate.format(now), text: `${t}°${unit} · Today ${lo}°/${hi}°` },
          ranged: { lines: [`${t}°`], value: pos, marker: true },
          short: { lines: [`${t}°`] },
          tile: {
            title: "Weather",
            card: { kind: "weather", temp: `${t}°${unit}`, sub: "Sunny", rain: "20%", hi, lo },
            foot: "Updated 4m ago",
          },
          widget: { title: `${t}°${unit}`, text: "Sunny", hilo: [hi, lo], bar: pos, marker: true },
        };
      },
    },
    {
      id: "reminder",
      name: "Reminders",
      blurb: "Your own nudges, on your schedule.",
      bg: "#604100",
      fg: "#FFDEAE",
      icon: "reminder",
      face: "pill",
      glance() {
        return {
          long: { title: null, text: "Meds" },
          ranged: { lines: ["Meds"], value: 0.62 },
          short: { lines: ["Meds"] },
          tile: {
            title: "Reminder",
            card: { kind: "reminder", text: "Meds" },
            edge: { icon: "brief" },
          },
          widget: { title: "Meds", text: "Reminder" },
        };
      },
    },
    {
      id: "date",
      name: "Default",
      blurb: "The date, when nothing else needs you.",
      bg: "#3B494F",
      fg: "#DCE4E8",
      icon: "calendar",
      face: "event",
      glance(now) {
        const d = new Date(now);
        const midnight = new Date(d).setHours(0, 0, 0, 0);
        const day = String(d.getDate());
        return {
          long: { title: fmtWeekday.format(d), text: day },
          ranged: { lines: [fmtWeekdayShort.format(d), day], value: (now - midnight) / (24 * 60 * MIN) },
          short: { lines: [fmtWeekdayShort.format(d), day] },
          tile: {
            title: "Today",
            card: { kind: "date", big: fmtWeekday.format(d), sub: fmtMonthDay.format(d) },
            edge: { icon: "brief" },
          },
          widget: { title: fmtWeekday.format(d), text: fmtMonthDay.format(d) },
        };
      },
    },
  ];

  const indexOf = (id) => SOURCES.findIndex((s) => s.id === id);

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const svgIcon = (name, cls = "") =>
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  const setText = (root, key, value) => {
    const n = root?.querySelector(`[data-k="${key}"]`);
    if (n && n.textContent !== (value ?? "")) n.textContent = value ?? "";
  };

  /** Slides the new glance in from below and the old one out the top, like the app's onboarding. */
  function swap(stack, node, animate) {
    const old = $$(":scope > .swap-item:not(.leaving)", stack);
    node.classList.add("swap-item");
    stack.appendChild(node);
    if (!animate || !node.animate) {
      old.forEach((n) => n.remove());
      return;
    }
    const soft = reduceMotion.matches;
    const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
    node.animate(
      soft
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(40%)", filter: "blur(4px)" },
            { opacity: 1, transform: "none", filter: "blur(0)" },
          ],
      { duration: soft ? 200 : 520, easing: ease, delay: soft ? 0 : 60, fill: "backwards" }
    );
    old.forEach((n) => {
      n.classList.add("leaving");
      n.animate(
        soft
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { opacity: 1, transform: "none", filter: "blur(0)" },
              { opacity: 0, transform: "translateY(-40%)", filter: "blur(4px)" },
            ],
        { duration: soft ? 200 : 280, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }
      ).finished.then(
        () => n.remove(),
        () => n.remove()
      );
    });
  }

  // A glance can swap the complication glyph while it's showing (music's play/pause).
  const setFace = (node, face) => {
    const use = face && node?.querySelector(".cx-icon use");
    if (use && use.getAttribute("href") !== `#i-${face}`) use.setAttribute("href", `#i-${face}`);
  };

  const linesHtml = (lines) =>
    lines.map((l, i) => `<span class="cx-line${i ? " cx-line-2" : ""}" data-k="l${i}">${esc(l)}</span>`).join("");

  // ---------------------------------------------------------------------------
  // Surfaces
  // ---------------------------------------------------------------------------
  const surfaces = [];

  // LONG_TEXT: icon, then the title (accent) over the text (white). With no
  // title, the text alone takes the accent and the row centres, as on the wrist.
  $$('[data-cx="long"]').forEach((host) => {
    const stack = host.querySelector(".swap-stack");
    surfaces.push({
      host,
      mount(src, g, animate) {
        const { title, text } = g.long;
        this.node = el(`
          <div class="cx-long-item${title ? "" : " single"}">
            ${svgIcon(g.face || src.face, "cx-icon")}
            <span class="cx-lines">
              ${title ? `<span class="cx-title" data-k="title">${esc(title)}</span>` : ""}
              <span class="cx-text" data-k="text">${esc(text)}</span>
            </span>
          </div>`);
        swap(stack, this.node, animate);
      },
      patch(g) {
        setFace(this.node, g.face);
        setText(this.node, "title", g.long.title);
        setText(this.node, "text", g.long.text);
      },
    });
  });

  // RANGED_VALUE: 270° ring with the gap at the bottom for the icon. Weather
  // draws the whole range with a dot at today's temperature.
  $$('[data-cx="ranged"]').forEach((host) => {
    const stack = host.querySelector(".swap-stack");
    const bar = host.querySelector(".ring-value");
    const thumb = host.querySelector(".ring-thumb");
    const setRing = (r) => {
      const p = clamp01(r.value);
      const fill = r.marker ? 1 : p;
      bar?.style.setProperty("stroke-dasharray", `${(fill * 100).toFixed(2)} 100`);
      thumb?.style.setProperty("transform", `rotate(${(p * 270).toFixed(2)}deg)`);
      host.classList.toggle("has-marker", !!r.marker);
    };
    surfaces.push({
      host,
      mount(src, g, animate) {
        this.node = el(`
          <div class="cx-ranged-item${g.ranged.lines.length > 1 ? " two" : ""}">
            <span class="cx-lines">${linesHtml(g.ranged.lines)}</span>
            ${svgIcon(g.face || src.face, "cx-icon")}
          </div>`);
        swap(stack, this.node, animate);
        setRing(g.ranged);
      },
      patch(g) {
        setFace(this.node, g.face);
        g.ranged.lines.forEach((l, i) => setText(this.node, `l${i}`, l));
        setRing(g.ranged);
      },
    });
  });

  // SHORT_TEXT: icon on top, text under it
  $$('[data-cx="short"]').forEach((host) => {
    const stack = host.querySelector(".swap-stack");
    surfaces.push({
      host,
      mount(src, g, animate) {
        this.node = el(`
          <div class="cx-short-item${g.short.lines.length > 1 ? " two" : ""}">
            ${svgIcon(g.face || src.face, "cx-icon")}
            <span class="cx-lines">${linesHtml(g.short.lines)}</span>
          </div>`);
        swap(stack, this.node, animate);
      },
      patch(g) {
        setFace(this.node, g.face);
        g.short.lines.forEach((l, i) => setText(this.node, `l${i}`, l));
      },
    });
  });

  // Tile: Material 3 primaryLayout, after the watch's BriefTileRenderer. A
  // title up top, one card per source, an edge button (or, for weather, when
  // it was updated) and, for music and events, a progress ring round the rim.
  const tileCard = (src, c) => {
    const k = (key, v, cls) => `<span class="${cls}" data-k="${key}">${esc(v)}</span>`;
    switch (c.kind) {
      case "event":
        return `<div class="t-card t-start">
          <span class="t-row">${svgIcon("event", "t-ico")}${k("t-title", c.title, "t-title clamp2")}</span>
          ${k("t-range", c.range, "t-label")}
          ${k("t-loc", c.location, "t-body")}
        </div>`;
      case "music":
        return `<div class="t-card t-start">
          <span class="t-row">${svgIcon("music", "t-ico")}${k("t-title", c.title, "t-title clamp2")}</span>
          <span class="t-row t-gap">${svgIcon("artist", "t-ico-sm")}${k("t-artist", c.artist, "t-label-sm")}</span>
        </div>`;
      case "notification":
        return `<div class="t-card t-start">
          <span class="t-row">${svgIcon("notification", "t-ico")}${k("t-app", c.app, "t-label")}</span>
          ${k("t-head", c.headline, "t-title")}
          ${k("t-bodytext", c.body, "t-body")}
        </div>`;
      case "battery":
        return `<div class="t-card">
          <span class="t-row t-row-hero">${svgIcon("battery", "t-ico-hero")}
            <span class="t-col">${k("t-big", c.big, "t-display")}${k("t-lbl", c.label, "t-label")}</span>
          </span>
        </div>`;
      case "reminder":
        return `<div class="t-card">
          <span class="t-row t-row-hero">${svgIcon(src.face, "t-ico-rem")}${k("t-title", c.text, "t-title t-grow")}${svgIcon("check", "t-ico-check")}</span>
        </div>`;
      case "date":
        return `<div class="t-card t-center">${k("t-big", c.big, "t-display-sm")}${k("t-sub", c.sub, "t-title")}</div>`;
      case "weather":
        return `<div class="t-weather">
          <div class="t-card t-center t-hero">
            ${svgIcon("sun", "t-ico-hero")}${k("t-temp", c.temp, "t-display")}${k("t-cond", c.sub, "t-label-sm")}
          </div>
          <div class="t-side">
            <div class="t-pill t-rain">${svgIcon("rain", "t-ico-rain")}${esc(c.rain)}</div>
            <div class="t-pill t-hilo">
              <span>${svgIcon("arrow-up", "t-ico-hilo")}${c.hi}°</span>
              <span>${svgIcon("arrow-down", "t-ico-hilo")}${c.lo}°</span>
            </div>
          </div>
        </div>`;
    }
    return "";
  };

  $$('[data-surface="tile"]').forEach((host) => {
    const stack = host.querySelector(".swap-stack");
    const ring = host.querySelector(".tile-ring");
    const bar = host.querySelector(".tr-value");
    const setRing = (v) => {
      ring?.classList.toggle("on", v != null);
      if (v != null) bar?.style.setProperty("stroke-dasharray", `${(clamp01(v) * 100).toFixed(2)} 100`);
    };
    surfaces.push({
      host,
      mount(src, g, animate) {
        const t = g.tile;
        const bottom = t.foot
          ? `<div class="tile-foot">${esc(t.foot)}</div>`
          : t.edge?.text
            ? `<div class="tile-edge text">${esc(t.edge.text)}</div>`
            : `<div class="tile-edge">${svgIcon(t.edge?.icon || "brief")}</div>`;
        this.node = el(`
          <div class="tile-item">
            <div class="tile-title" data-k="t-top">${esc(t.title)}</div>
            <div class="tile-main">${tileCard(src, t.card)}</div>
            ${bottom}
          </div>`);
        swap(stack, this.node, animate);
        setRing(t.ring);
      },
      patch(g) {
        setText(this.node, "t-top", g.tile.title);
        const c = g.tile.card;
        if (c.kind === "event") setText(this.node, "t-range", c.range);
        if (c.kind === "date") {
          setText(this.node, "t-big", c.big);
          setText(this.node, "t-sub", c.sub);
        }
        setRing(g.tile.ring);
      },
    });
  });

  // Phone widget: badge, two lines, and whatever the glance carries on the
  // right (a countdown pill, today's high/low, play/pause) and underneath
  // (a progress bar, or the temperature's place in today's range).
  $$('[data-surface="widget"]').forEach((host) => {
    const stack = host.querySelector(".swap-stack");
    const setBar = (node, w) => {
      const b = node?.querySelector(".pw-bar");
      if (b && w.bar != null) b.style.setProperty("--v", clamp01(w.bar).toFixed(4));
    };
    surfaces.push({
      host,
      mount(src, g, animate) {
        const w = g.widget;
        const right = w.button
          ? `<span class="pw-btn">${svgIcon(w.button)}</span>`
          : w.hilo
            ? `<span class="pw-pill">${svgIcon("arrow-up")}${w.hilo[0]}°<span class="gap"></span>${svgIcon("arrow-down")}${w.hilo[1]}°</span>`
            : w.pill
              ? `<span class="pw-pill" data-k="pill">${esc(w.pill)}</span>`
              : "";
        this.node = el(`
          <div class="pw-item${w.bar != null ? " has-bar" : ""}${w.button ? " has-btn" : ""}">
            <span class="pw-badge">${svgIcon(src.icon)}</span>
            <span class="pw-lines">
              <span class="pw-title" data-k="title">${esc(w.title)}</span>
              <span class="pw-text" data-k="text">${esc(w.text)}</span>
            </span>
            ${right}
            ${w.bar != null ? `<span class="pw-bar${w.marker ? " marker" : ""}"><i></i></span>` : ""}
          </div>`);
        setBar(this.node, w);
        swap(stack, this.node, animate);
      },
      patch(g) {
        setText(this.node, "title", g.widget.title);
        setText(this.node, "text", g.widget.text);
        setText(this.node, "pill", g.widget.pill);
        setBar(this.node, g.widget);
        if (g.widget.button) this.node?.querySelector(".pw-btn use")?.setAttribute("href", `#i-${g.widget.button}`);
      },
    });
  });

  const chips = $$("[data-chip]");
  const steps = $$("[data-step]");
  const captions = $$("[data-caption]");
  const toggles = $$("[data-demo-toggle]");
  const clocks = $$("[data-clock]");

  if (!surfaces.length && !clocks.length) return;

  // ---------------------------------------------------------------------------
  // The cycle
  // ---------------------------------------------------------------------------
  const startId = document.querySelector("[data-demo-start]")?.dataset.demoStart || "event";
  let index = Math.max(0, indexOf(startId));
  let current = null;
  let timer = 0;
  // The Brief page opens on Now playing and waits for a tap on ▶. That tap
  // starts the song (a tap is what browsers want before a page may play
  // sound), the watch holds on music while it plays, and the demo rolls on
  // from there once it ends.
  const waitForTap = toggles.length > 0 && !!document.querySelector("[data-demo-wait]");
  let paused = waitForTap; // by the play/pause button
  let pinned = null; // source held by the scroll story
  let visible = true; // some surface is on screen
  const root = document.documentElement;

  function show(i, { animate = true, hold = HOLD_MS } = {}) {
    index = (i + SOURCES.length) % SOURCES.length;
    const src = SOURCES[index];
    if (src.id !== "music" && songPlaying()) pauseSong();
    if (src === current && animate) {
      schedule(hold);
      return;
    }
    const now = Date.now();
    src.onShow?.(now);
    const g = src.glance(now);
    current = src;

    root.style.setProperty("--src-bg", src.bg);
    root.style.setProperty("--src-fg", src.fg);
    root.dataset.source = src.id;
    surfaces.forEach((s) => s.mount(src, g, animate));
    const waiting = root.classList.contains("demo-waiting");
    if (src.id === "music" && (wantSound || (autoplayArmed && !waiting))) startAudio({ auto: !wantSound });

    chips.forEach((c) => {
      const on = c.dataset.chip === src.id;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", String(on));
      c.classList.remove("tick");
      if (on) {
        c.style.setProperty("--hold", `${hold}ms`);
        void c.offsetWidth; // restart the progress ring
        c.classList.add("tick");
      }
    });
    captions.forEach((cap) => {
      setText(cap, "name", src.name);
      setText(cap, "blurb", src.blurb);
    });

    schedule(hold);
  }

  function schedule(hold = HOLD_MS) {
    clearTimeout(timer);
    if (!Number.isFinite(hold)) return; // held: the scroll story or the song decides
    if (paused || pinned || songPlaying() || !visible || document.hidden) return;
    timer = setTimeout(() => show(index + 1), hold);
  }

  function syncToggles() {
    root.classList.toggle("demo-paused", paused);
    toggles.forEach((t) => {
      t.setAttribute("aria-pressed", String(paused));
      t.setAttribute("aria-label", paused ? "Play the demo" : "Pause the demo");
      t.title = paused ? "Play the demo" : "Pause the demo";
      t.querySelector("use")?.setAttribute("href", paused ? "#i-play" : "#i-pause");
    });
  }

  function setPaused(p) {
    paused = p;
    syncToggles();
    if (p) clearTimeout(timer);
    else show(index + 1);
  }

  chips.forEach((c) =>
    c.addEventListener("click", () => {
      const i = indexOf(c.dataset.chip);
      if (i >= 0) show(i, { hold: PICKED_HOLD_MS });
    })
  );
  toggles.forEach((t) =>
    t.addEventListener("click", () => {
      const first = root.classList.contains("demo-waiting");
      root.classList.remove("demo-waiting"); // the wave is only for the first tap
      if (!paused) {
        // ⏸ holds the demo, and the song with it
        setPaused(true);
        if (songPlaying()) stopFollowing();
      } else if (canPlaySong && !songFailed && (first || current?.id === "music")) {
        // ▶ on Now playing (or the first ▶ anywhere) plays the song; the
        // watch holds on music until it ends
        paused = false;
        syncToggles();
        playSong();
      } else {
        setPaused(false);
      }
    })
  );
  if (waitForTap) root.classList.add("demo-waiting");
  syncToggles();

  // ---------------------------------------------------------------------------
  // The song preview: starts on the first music turn (when the browser lets
  // it) or on a tap, drives the music glance, and tells the OS what's playing
  // (Media Session), so a phone with Brief on it would put this very track on
  // its watch.
  // ---------------------------------------------------------------------------
  const songToggles = $$("[data-song-toggle]");
  const musicIndex = indexOf("music");
  if (!canPlaySong) root.classList.add("no-song");

  // Resolves true when the fade finishes, false when a newer fade took over
  // (e.g. music came straight back while it was fading out).
  let fadeGen = 0;
  const fadeTo = (target, ms) =>
    new Promise((done) => {
      if (!audio) return done(false);
      const gen = ++fadeGen;
      const from = audio.volume;
      const t0 = performance.now();
      const step = (t) => {
        if (gen !== fadeGen) return done(false);
        const k = Math.min(1, (t - t0) / ms);
        try {
          audio.volume = from + (target - from) * k;
        } catch {}
        k < 1 ? requestAnimationFrame(step) : done(true);
      };
      requestAnimationFrame(step);
    });

  const patchMusic = () => {
    if (current?.id !== "music") return;
    const g = current.glance(Date.now());
    surfaces.forEach((s) => s.patch(g));
  };

  const refreshSongUi = () => {
    const on = songPlaying();
    if (on) clearTimeout(timer); // the watch stays on music while it plays
    root.classList.toggle("song-playing", on);
    songToggles.forEach((b) => {
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", on ? `Pause ${SONG.title} by ${SONG.artist}` : `Play ${SONG.title} by ${SONG.artist}`);
      b.title = on ? "Tap to pause" : "Tap to play";
    });
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = on ? "playing" : audio ? "paused" : "none";
    patchMusic();
  };

  const ensureAudio = () => {
    if (audio) return audio;
    audio = new Audio(SONG.preview);
    audio.preload = "auto";
    audio.addEventListener("play", refreshSongUi);
    audio.addEventListener("pause", () => {
      refreshSongUi();
      // Paused on the music glance: let the demo move on. (Paused because the
      // glance changed: show() already set the timer. Paused because it
      // ended: "ended" handles it.)
      if (current?.id === "music" && !audio.ended) schedule();
    });
    audio.addEventListener("playing", () => {
      autoplayArmed = false;
    });
    audio.addEventListener("ended", () => {
      wantSound = false;
      // The song was the hold: go straight to the next glance, unless the
      // scroll story or the pause button is holding the watch here.
      const advance = current?.id === "music" && !paused && !pinned && visible && !document.hidden;
      if (advance) show(index + 1);
      audio.currentTime = 0;
      refreshSongUi();
      if (!advance) schedule();
    });
    audio.addEventListener("timeupdate", () => {
      patchMusic();
      if ("mediaSession" in navigator && audio.duration) {
        try {
          navigator.mediaSession.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: 1 });
        } catch {}
      }
    });
    audio.addEventListener("error", () => {
      // Couldn't stream it: say so, and hand the watch back to the demo.
      songFailed = true;
      wantSound = false;
      autoplayArmed = false;
      refreshSongUi();
      songToggles.forEach((b) => (b.disabled = true));
      schedule();
    });
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: SONG.title,
        artist: SONG.artist,
        album: SONG.album,
        artwork: [{ src: SONG.art, sizes: "600x600", type: "image/jpeg" }],
      });
      navigator.mediaSession.setActionHandler("play", () => playSong());
      navigator.mediaSession.setActionHandler("pause", () => stopFollowing());
      navigator.mediaSession.setActionHandler("stop", () => stopFollowing());
    }
    return audio;
  };

  // Starts the audio (the glance is already music). `auto`: nobody asked, so
  // a blocked start is expected and the demo just carries on.
  function startAudio({ auto = false } = {}) {
    if (!canPlaySong || songFailed) return;
    wantSound = true;
    if (songPlaying()) return void fadeTo(SONG_VOLUME, 300); // cancel a fade-out
    const a = ensureAudio();
    a.volume = 0;
    a.play().then(
      // The glance may have moved on while the stream was loading.
      () => (wantSound && current?.id === "music" ? fadeTo(SONG_VOLUME, 450) : pauseSong()),
      (err) => {
        // AbortError is just our own pause() landing before the stream
        // started. Anything else: blocked or failed, so wait for a tap.
        if (err?.name === "AbortError") return refreshSongUi();
        wantSound = false;
        refreshSongUi();
        if (!auto) schedule();
      }
    );
  }

  // Someone asked for the song: put music on the watch, and play.
  function playSong() {
    wantSound = true;
    if (current?.id !== "music") show(musicIndex, { hold: Infinity });
    else startAudio();
  }

  // Leaving the music glance: fade out, but keep following the glance.
  async function pauseSong() {
    if (!songPlaying()) return;
    if (await fadeTo(0, 220)) audio.pause();
  }

  // Someone paused it themselves: stop following the glance.
  function stopFollowing() {
    wantSound = false;
    autoplayArmed = false;
    pauseSong();
  }

  songToggles.forEach((b) =>
    b.addEventListener("click", () => {
      if (songPlaying()) return stopFollowing();
      // The first tap on the watch (its ▶) starts the demo too, straight
      // away, so the ▶ goes before the stream has loaded.
      if (root.classList.contains("demo-waiting")) {
        root.classList.remove("demo-waiting");
        paused = false;
        syncToggles();
      }
      playSong();
    })
  );

  // ---------------------------------------------------------------------------
  // Scroll story: the step nearest the reading line holds the watch
  // ---------------------------------------------------------------------------
  if (steps.length) {
    const list = steps[0].parentElement;
    const stage = document.querySelector(".story-visual");

    const setPinned = (id) => {
      if (id === pinned) return;
      pinned = id;
      root.classList.toggle("demo-pinned", !!id);
      list.classList.toggle("has-active", !!id);
      steps.forEach((s) => s.classList.toggle("is-active", s.dataset.step === id));
      if (id) show(indexOf(id), { hold: Infinity });
      else schedule();
    };

    const update = () => {
      const vh = innerHeight;
      let line = vh * 0.5;
      if (!wide.matches && stage) {
        const bottom = stage.getBoundingClientRect().bottom;
        line = bottom + (vh - bottom) * 0.42;
      }
      const first = steps[0].getBoundingClientRect();
      const last = steps[steps.length - 1].getBoundingClientRect();
      if (line < first.top - 24 || line > last.bottom + 24) return setPinned(null);
      let best = steps[0];
      let bestD = Infinity;
      for (const s of steps) {
        const r = s.getBoundingClientRect();
        const d = Math.abs((r.top + r.bottom) / 2 - line);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      setPinned(best.dataset.step);
    };

    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update();
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });

    steps.forEach((s) =>
      s.addEventListener("click", () => {
        s.scrollIntoView({ block: "center", behavior: reduceMotion.matches ? "auto" : "smooth" });
        const i = indexOf(s.dataset.step);
        if (i >= 0) show(i, { hold: Infinity });
      })
    );
  }

  // Only cycle while something is on screen and the tab is in front.
  if ("IntersectionObserver" in window && surfaces.length) {
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target)));
      const was = visible;
      visible = seen.size > 0;
      if (visible && !was) schedule();
      if (!visible) clearTimeout(timer);
    });
    surfaces.forEach((s) => io.observe(s.host));
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(timer);
    else schedule();
  });

  // ---------------------------------------------------------------------------
  // Pointer tilt, for mice and trackpads only
  // ---------------------------------------------------------------------------
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion.matches) {
    $$("[data-tilt]").forEach((area) => {
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

  // ---------------------------------------------------------------------------
  // Clock + live text (countdown, song position), once a second
  // ---------------------------------------------------------------------------
  function tick() {
    const d = new Date();
    let h = d.getHours();
    if (hour12) h = h % 12 || 12;
    const hh = hour12 ? String(h) : pad(h);
    const mm = pad(d.getMinutes());
    clocks.forEach((c) => {
      setText(c, "h", hh);
      setText(c, "m", mm);
      if (c.tagName === "TIME") c.setAttribute("datetime", `${pad(d.getHours())}:${mm}`);
    });
    if (current) {
      const g = current.glance(d.getTime());
      surfaces.forEach((s) => s.patch(g));
    }
  }

  function loop() {
    tick();
    setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
  }

  show(index, { animate: false });
  loop();
})();
