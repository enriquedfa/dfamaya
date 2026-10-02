/* Brief demo — one glance state, drawn on every surface on the page.
 *
 * Like the app: a single "winning" source at a time, and the complications,
 * the tile, the Wear OS widget and the phone widget all show it in
 * lock-step. On its own it cycles like the app's onboarding; while the
 * visitor scrolls through the list of sources, the step in the middle of the
 * screen takes over. The clock, the countdowns and the song position are
 * live, and the surfaces' own buttons (play/pause, skip, mark done) work.
 *
 * Surfaces are opt-in by markup, so one script runs the landing page and the
 * small watch on the home page:
 *   [data-cx="long|ranged|short"]  complication slots on the watch face
 *   [data-surface="tile"]          the tile (BriefTileRenderer)
 *   [data-surface="wear"]          the Wear OS widget, small and large
 *                                  (BriefWearWidget)
 *   [data-surface="phone"]         the phone widget (BriefGlanceWidget), with
 *                                  [data-pw-size] buttons to resize it
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

  // "10:54 AM" -> "10:54am" and "9:00 AM" -> "9am", the compact form Brief
  // uses on the wrist
  const time = (ms) =>
    fmtTime
      .format(ms)
      .replace(/\s?([AP])\.?M\.?$/i, (_, a) => `${a.toLowerCase()}m`)
      .replace(/:00(?=[ap]m$)/, "");

  // The phone draws times and dates the platform's way ("10:20 AM",
  // "Thu, Oct 2"), not the wrist's compact one.
  const phoneTime = (ms) => new Intl.DateTimeFormat(dateLocale, { hour: "numeric", minute: "2-digit", hour12 }).format(ms);
  const fmtPhoneMedium = new Intl.DateTimeFormat(dateLocale, { weekday: "long", month: "short", day: "numeric" });
  const fmtPhoneLong = new Intl.DateTimeFormat(dateLocale, { weekday: "long", month: "long", day: "numeric" });
  const fmtMonthDayShort = new Intl.DateTimeFormat(dateLocale, { month: "short", day: "numeric" });
  const fmtMonth = new Intl.DateTimeFormat(dateLocale, { month: "long" });

  // ---------------------------------------------------------------------------
  // Live state behind the glances
  // ---------------------------------------------------------------------------
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const LOOKAHEAD_MIN = 30;
  const EVENT_LEN = 15 * MIN;
  let eventStart = Date.now() + 12 * MIN;

  // The reminder runs for an hour from the last quarter hour; the tile's ring
  // drains to its end.
  const REM_WINDOW = HOUR;
  const quarter = (ms) => Math.floor(ms / (15 * MIN)) * 15 * MIN;
  let remStart = quarter(Date.now());

  const postedAt = Date.now() - 2 * MIN; // when the message came in

  const TRACK_LEN_S = 248; // 4:08
  let trackStartedAt = Date.now(); // restarts each time music comes on the watch
  // A widget's or the tile's ⏸ pauses the made-up track (silently), at this
  // many seconds in; ▶ then plays the real song.
  let fakePausedAt = null;

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

  // Where the music glance is: the real preview while it's loaded, the
  // made-up track otherwise.
  function musicState(now) {
    if (songLive()) {
      return { elapsed: audio.currentTime, progress: audio.currentTime / (audio.duration || 30), paused: !songPlaying() };
    }
    const elapsed = fakePausedAt ?? ((now - trackStartedAt) / 1000) % TRACK_LEN_S;
    return { elapsed, progress: elapsed / TRACK_LEN_S, paused: fakePausedAt != null };
  }

  // The tile's and the Wear widget's countdown: minutes rounded up, whole
  // hours from 60, never "1 h 5 min", and "Now" at zero.
  const countdown = (ms) => {
    if (ms <= 0) return "Now";
    const min = Math.ceil(ms / MIN);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h`;
  };

  const EVENT = { title: "Standup", place: "Room 4B" };
  const NOTE = { app: "Messages", title: "Alex", text: "On my way, 5 min out" };

  // bg / fg are each source's identity colours from the app's Theme.kt (tone 30 / tone 90).
  // `icon` is the source's badge on the page; `face` is the glyph the complication draws.
  // glance() returns what each surface shows: the three complication types,
  // the tile (title, main card, edge button or foot line) and the Wear
  // widget (its colour role, then a visual, two lines and maybe a bar or a
  // button). The phone widget builds its own card: see phoneCard().
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
        const m = musicState(now);
        const s = Math.floor(m.elapsed);
        // The cover shows once the preview plays: until someone asks for the
        // song, the page fetches nothing from Apple.
        const cover = songLive() ? SONG.art : null;
        return {
          // Like the watch: ▶ while playing, ⏸ while paused (a status glyph)
          face: m.paused ? "pause" : "play",
          long: { title: SONG.artist, text: SONG.title },
          // The ring counts up the song's position, 00:00 onwards
          ranged: { lines: [`${pad(Math.floor(s / 60))}:${pad(s % 60)}`], value: m.progress },
          short: { lines: [SONG.title] },
          tile: {
            title: m.paused ? "Paused" : "Now playing",
            card: { kind: "title", title: SONG.title, text: SONG.artist, cover },
            edge: { icon: m.paused ? "play" : "pause", act: "play", label: m.paused ? "Play" : "Pause" },
          },
          wear: {
            role: "primary",
            music: { title: SONG.title, text: SONG.artist, paused: m.paused, progress: m.progress, cover },
          },
        };
      },
      onShow(now) {
        // Without the preview, the made-up track starts over, so the timer
        // counts up from 00:00 every time music comes on. It starts on the
        // second, like the once-a-second tick, so each tick adds one.
        trackStartedAt = now - (now % 1000);
        fakePausedAt = null;
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
          long: { title: NOTE.app, text: `${NOTE.title}: On my way` },
          ranged: { lines: [NOTE.app], value: 0.7 },
          short: { lines: [NOTE.app] },
          tile: {
            title: "Notification",
            card: { kind: "app", glyph: "chat", app: NOTE.app, time: time(postedAt), title: NOTE.title, text: NOTE.text },
            edge: { icon: "open" },
          },
          // The app over the sender, as the long complication pairs them
          wear: { role: "secondary", visual: "disc", glyph: "chat", title: NOTE.app, text: NOTE.title },
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
        const left = clamp01((eventStart - now) / (LOOKAHEAD_MIN * MIN)); // the ring drains as it nears
        return {
          long: { title: inWords, text: EVENT.title },
          ranged: { lines: [`${mins}m`], value: clamp01(mins / LOOKAHEAD_MIN) },
          short: { lines: [`${mins}m`] },
          tile: {
            title: "Up next",
            min: true,
            card: {
              kind: "data",
              glyph: "event",
              ring: left,
              value: countdown(eventStart - now),
              label: EVENT.title,
              // A large screen shows more: the start and the place
              details: [`At ${time(eventStart)}`, EVENT.place],
            },
            edge: { text: "Calendar" },
          },
          wear: {
            role: "secondary",
            visual: "ring",
            glyph: "event",
            value: left,
            title: EVENT.title,
            text: countdown(eventStart - now),
            detail: EVENT.place,
          },
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
            min: true,
            card: { kind: "data", glyph: "battery", ring: 0.15, value: "15%", label: "Phone battery low" },
            edge: { icon: "brief" },
          },
          wear: { role: "error", visual: "ring", glyph: "battery", value: 0.15, title: "15%", text: "Phone battery low" },
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
            card: { kind: "weather", temp: `${t}°${unit}`, cond: "Clear", rain: "20%", hi, lo },
            foot: "Updated 4m ago",
          },
          wear: { role: "tertiary", visual: "gauge", glyph: "sun", value: pos, title: `${t}°${unit}`, text: "Clear", lo, hi },
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
      glance(now) {
        const left = remStart + REM_WINDOW - now;
        return {
          long: { title: null, text: "Meds" },
          ranged: { lines: ["Meds"], value: clamp01(left / REM_WINDOW) },
          short: { lines: ["Meds"] },
          tile: {
            title: "Reminder",
            min: true,
            card: { kind: "data", glyph: "pill", ring: clamp01(left / REM_WINDOW), value: countdown(left), label: "Meds" },
            edge: { icon: "check", act: "done", label: "Mark done" },
          },
          // No ring: the mark-done button takes its place
          wear: { role: "tertiary", button: "done", title: "Meds", text: phoneTime(remStart) },
        };
      },
      onShow(now) {
        if (remStart + REM_WINDOW - now < 5 * MIN) remStart = quarter(now);
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
        const weekday = fmtWeekday.format(d);
        return {
          long: { title: weekday, text: day },
          ranged: { lines: [fmtWeekdayShort.format(d), day], value: (now - midnight) / (24 * 60 * MIN) },
          short: { lines: [fmtWeekdayShort.format(d), day] },
          // The default date formats: the weekday over "dd"
          tile: {
            title: "Today",
            card: { kind: "title", tonal: true, display: weekday, text: pad(d.getDate()) },
            edge: { icon: "brief" },
          },
          wear: { role: "floor", plain: true, title: weekday, text: pad(d.getDate()) },
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
      n.inert = true;
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

  // The tile and the two widgets are drawn from an HTML string. mount()
  // slides the new glance in; patch() redraws in place only when something
  // visible changed, and keeps keyboard focus on the button it was on.
  function slot(stack, cls, render, after) {
    let src = null;
    let node = null;
    let html = "";
    return {
      mount(s, g, animate) {
        src = s;
        html = render(src, g);
        node = document.createElement("div");
        node.className = cls;
        node.innerHTML = html;
        after?.(node);
        swap(stack, node, animate);
      },
      patch(g, { fade = false } = {}) {
        if (!node) return;
        const next = render(src, g);
        if (next !== html) {
          const focused = document.activeElement?.closest?.("[data-act]");
          const act = focused && node.contains(focused) ? focused.dataset.act : null;
          node.innerHTML = html = next;
          if (act) node.querySelector(`[data-act="${act}"]`)?.focus({ preventScroll: true });
          if (fade && node.animate && !reduceMotion.matches) {
            node.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], {
              duration: 260,
              easing: "cubic-bezier(0.2, 0, 0, 1)",
            });
          }
        }
        after?.(node);
      },
    };
  }

  const pct = (v) => (clamp01(v) * 100).toFixed(2);

  // Tile: Material 3 primaryLayout, after the watch's BriefTileRenderer. A
  // title up top, one card per glance (a data card with its ring, a title
  // card, an app card, or weather's own layout), then the glance's own action
  // on the edge button, or for weather when it was updated.
  const tileRing = (v) =>
    `<svg class="t-ring" viewBox="0 0 100 100" aria-hidden="true">` +
    `<circle class="t-track" cx="50" cy="50" r="45" />` +
    (v > 0.001 ? `<circle class="t-ind" cx="50" cy="50" r="45" pathLength="100" stroke-dasharray="${pct(v)} 100" />` : "") +
    `</svg>`;

  const tileCard = (c) => {
    switch (c.kind) {
      case "data":
        return `<div class="t-data">
          <span class="t-graph">${tileRing(c.ring)}${svgIcon(c.glyph, "t-glyph")}</span>
          <span class="t-text">
            <span class="t-value">${esc(c.value)}</span>
            <span class="t-label">${esc(c.label)}</span>
            ${(c.details || []).map((d) => `<span class="t-detail">${esc(d)}</span>`).join("")}
          </span>
        </div>`;
      case "title":
        if (c.display) {
          return `<div class="t-tcard${c.tonal ? " tonal" : ""}"><span class="t-tc-display">${esc(c.display)}</span><span class="t-tc-text">${esc(c.text)}</span></div>`;
        }
        return `<div class="t-tcard${c.cover ? " cover" : ""}"${c.cover ? ` style="--cover: url('${c.cover}')"` : ""}>
          <span class="t-tc-title">${esc(c.title)}</span><span class="t-tc-text">${esc(c.text)}</span>
        </div>`;
      case "app":
        return `<div class="t-app">
          <span class="t-app-head">${svgIcon(c.glyph)}<span class="t-app-name">${esc(c.app)}</span><span class="t-app-time">${esc(c.time)}</span></span>
          <span class="t-app-title">${esc(c.title)}</span>
          <span class="t-app-text">${esc(c.text)}</span>
        </div>`;
      case "weather":
        return `<div class="t-weather">
          <div class="t-hero">${svgIcon("sun")}<span class="t-temp">${esc(c.temp)}</span><span class="t-cond">${esc(c.cond)}</span></div>
          <div class="t-side">
            <div class="t-chip t-rain">${svgIcon("rain")}<span><span class="sr-only">Rain </span>${esc(c.rain)}</span></div>
            <div class="t-chip t-hilo">
              <span><span class="sr-only">High </span>${svgIcon("w-up")}${c.hi}°</span>
              <span><span class="sr-only">Low </span>${svgIcon("w-down")}${c.lo}°</span>
            </div>
          </div>
        </div>`;
    }
    return "";
  };

  const tileHtml = (src, g) => {
    const t = g.tile;
    const e = t.edge;
    const bottom = t.foot
      ? `<div class="tile-foot">${esc(t.foot)}</div>`
      : e.act
        ? `<button type="button" class="tile-edge" data-act="${e.act}" aria-label="${esc(e.label)}" title="${esc(e.label)}">${svgIcon(e.icon)}</button>`
        : e.text
          ? `<div class="tile-edge">${esc(e.text)}</div>`
          : `<div class="tile-edge">${svgIcon(e.icon)}</div>`;
    return `<div class="tile-title">${esc(t.title)}</div>
      <div class="tile-main${t.min ? " min" : ""}">${tileCard(t.card)}</div>
      ${bottom}`;
  };

  $$('[data-surface="tile"]').forEach((host) => {
    const s = slot(host.querySelector(".swap-stack"), "tile-item", tileHtml);
    surfaces.push({ host, mount: (src, g, animate) => s.mount(src, g, animate), patch: (g) => s.patch(g) });
  });

  // Wear OS widget, after BriefWearWidget: a card that leads with its source
  // (a ring, weather's gauge, or a disc with the glyph) beside two lines. The
  // tall card trades the ring for a disc over a bar; a button (mark done,
  // play/pause) takes the visual's place; music is a player.
  const arc44 = (cls, inner) => `<svg class="ww-arc ${cls}" viewBox="0 0 44 44" aria-hidden="true">${inner}</svg>`;
  const wearRing = (v) =>
    arc44(
      "spin",
      `<circle class="tr" cx="22" cy="22" r="19.5" />` +
        (v > 0.001 ? `<circle class="in" cx="22" cy="22" r="19.5" pathLength="100" stroke-dasharray="${pct(v)} 100" />` : "")
    );
  // An arc open at the bottom (135° round to 45°), and a marker at the
  // temperature's place in today's range, cut out of the arc by a ring of
  // the card's own colour
  const wearGauge = (p) => {
    const a = ((135 + 270 * clamp01(p)) * Math.PI) / 180;
    const x = (22 + 19.5 * Math.cos(a)).toFixed(2);
    const y = (22 + 19.5 * Math.sin(a)).toFixed(2);
    return arc44(
      "gauge",
      `<path class="tr" d="M8.21 35.79A19.5 19.5 0 1 1 35.79 35.79" />` +
        `<circle class="gap" cx="${x}" cy="${y}" r="6" /><circle class="mk" cx="${x}" cy="${y}" r="4.5" />`
    );
  };
  const wearDisc = (glyph) => `<span class="ww-vis disc">${svgIcon(glyph, "ww-glyph")}</span>`;
  const wearLines = (h, s, { two = false, sTwo = two, detail = null } = {}) =>
    `<span class="ww-lines"><span class="ww-h${two ? " two" : ""}">${esc(h)}</span>` +
    `<span class="ww-s${sTwo ? " two" : ""}">${esc(s)}</span>` +
    (detail ? `<span class="ww-d">${esc(detail)}</span>` : "") +
    `</span>`;
  // Every button is a 48 dp target with its filled circle drawn inside
  const wearPlay = (m) =>
    `<button type="button" class="ww-btn play" data-act="play" aria-label="${m.paused ? "Play" : "Pause"}">` +
    `<svg class="ww-arc" viewBox="0 0 48 48" aria-hidden="true"><circle class="tr" cx="24" cy="24" r="22.5" />` +
    (m.progress > 0.001 ? `<circle class="in" cx="24" cy="24" r="22.5" pathLength="100" stroke-dasharray="${pct(m.progress)} 100" />` : "") +
    `</svg><span class="ww-fill">${svgIcon(m.paused ? "play" : "pause")}</span></button>`;
  const wearSkip = (dir) =>
    `<button type="button" class="ww-btn skip" data-act="${dir}" aria-label="${dir === "next" ? "Next track" : "Previous track"}">${svgIcon(dir === "next" ? "skip-next" : "skip-prev")}</button>`;
  const wearDone = `<button type="button" class="ww-btn" data-act="done" aria-label="Mark done"><span class="ww-fill">${svgIcon("check")}</span></button>`;

  function wearHtml(w, tall) {
    // Music: on a tall card, a player (title and artist over ⏮ ⏯ ⏭); on a
    // short one, its lines and the one button, ringed with the song
    if (w.music) {
      const m = w.music;
      const lines = wearLines(m.title, m.text);
      if (!tall) return `<div class="ww-row has-btn">${lines}${wearPlay(m)}</div>`;
      return `<div class="ww-player">${lines}<div class="ww-transport">${wearSkip("prev")}${wearPlay(m)}${wearSkip("next")}</div></div>`;
    }
    // The date is the absence of a glance: just its lines
    if (w.plain) return `<div class="ww-plain"><span class="ww-h">${esc(w.title)}</span><span class="ww-s">${esc(w.text)}</span></div>`;
    if (w.button === "done") return `<div class="ww-row has-btn">${wearLines(w.title, w.text, { two: tall })}${wearDone}</div>`;
    const progress = w.visual === "ring" || w.visual === "gauge";
    if (!tall) {
      const vis = w.visual === "ring" ? wearRing(w.value) : w.visual === "gauge" ? wearGauge(w.value) : null;
      return `<div class="ww-row has-vis">${vis ? `<span class="ww-vis">${vis}${svgIcon(w.glyph, "ww-glyph")}</span>` : wearDisc(w.glyph)}${wearLines(w.title, w.text)}</div>`;
    }
    if (!progress) return `<div class="ww-row has-vis">${wearDisc(w.glyph)}${wearLines(w.title, w.text, { two: true })}</div>`;
    // A tall card with progress: the disc and the lines over a bar. The lines
    // grow into the room the card has: the support line's second line, then a
    // detail (an event's place).
    const bar =
      w.visual === "gauge"
        ? `<div class="ww-mbar" aria-hidden="true"><span>${w.lo}°</span><span class="trk" style="--v:${clamp01(w.value).toFixed(4)}"><i></i></span><span>${w.hi}°</span></div>`
        : `<div class="ww-bar" style="--v:${clamp01(w.value).toFixed(4)}" aria-hidden="true">${w.value > 0.001 ? "<i></i>" : ""}</div>`;
    return `<div class="ww-barbody"><div class="ww-top">${wearDisc(w.glyph)}${wearLines(w.title, w.text, { sTwo: true, detail: w.detail })}</div>${bar}</div>`;
  }

  $$('[data-surface="wear"]').forEach((host) => {
    const cards = $$(".ww", host).map((box) => {
      const tall = box.classList.contains("tall");
      return { box, s: slot(box.querySelector(".swap-stack"), "ww-item", (src, g) => wearHtml(g.wear, tall)) };
    });
    const ground = (w) => {
      const cover = w.music?.cover;
      cards.forEach(({ box }) => {
        box.dataset.role = w.role;
        box.classList.toggle("cover", !!cover);
        if (cover) box.style.setProperty("--cover", `url('${cover}')`);
        else box.style.removeProperty("--cover");
      });
    };
    // Drawn at 1 dp = 1px, then zoomed to the cell (up to 1.4×, about the
    // tile's scale)
    const fit = () => {
      const k = Math.min(1.4, Math.max(0.5, (host.parentElement.clientWidth - 32) / 182));
      host.style.zoom = k.toFixed(3);
    };
    fit();
    if ("ResizeObserver" in window) new ResizeObserver(fit).observe(host.parentElement);
    surfaces.push({
      host,
      mount(src, g, animate) {
        ground(g.wear);
        cards.forEach((c) => c.s.mount(src, g, animate));
      },
      patch(g) {
        ground(g.wear);
        cards.forEach((c) => c.s.patch(g));
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Phone widget: BriefGlanceWidget, after the widget prototype. Sizes are dp
  // at 1:1 (scaled down to fit), and every value below is the app's own.
  // ---------------------------------------------------------------------------
  const ROW_BIN_H = 48;
  const TWO_ROW_BIN_H = 140;
  // SIZE_2X1 … SIZE_4X2: a template applies from the width it fits (120 /
  // 228 / 270 dp wide, 48 / 140 dp tall).
  const BINS = [
    { w: 120, h: ROW_BIN_H }, { w: 228, h: ROW_BIN_H }, { w: 270, h: ROW_BIN_H },
    { w: 120, h: TWO_ROW_BIN_H }, { w: 228, h: TWO_ROW_BIN_H }, { w: 270, h: TWO_ROW_BIN_H },
  ];
  const layoutFor = (bin) => {
    const cols = bin.w >= 270 ? 4 : bin.w >= 228 ? 3 : 2;
    return { cols, stacked: bin.h >= TWO_ROW_BIN_H };
  };
  // How an Android 12+ launcher picks among SizeMode.Responsive bins: a bin
  // fits under ceil(cell) + 1 dp on both axes, the nearest fitting one wins,
  // and with none fitting it falls back to the smallest.
  const hostPickBin = (cell) => {
    let best = null;
    let bestD = Infinity;
    for (const b of BINS) {
      if (!(Math.ceil(cell.w) + 1 > b.w && Math.ceil(cell.h) + 1 > b.h)) continue;
      const d = (b.w - cell.w) ** 2 + (b.h - cell.h) ** 2;
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best || BINS[0];
  };
  const typeScaleFor = (cols) =>
    cols >= 4
      ? { hero: 28, heroNumeral: 57, heroSub: 15, aux: 16 }
      : cols === 3
        ? { hero: 24, heroNumeral: 45, heroSub: 13, aux: 13 }
        : { hero: 20, heroNumeral: 36, heroSub: 12, aux: 13 };
  // A Pixel-like 4-column grid: widget = 91.25 · n − 16 wide, 118 · m − 16 tall
  const cellFor = (n, m) => ({ w: 91.25 * n - 16, h: 118 * m - 16 });

  // Brief's own schemes (BriefLightColors / BriefDarkColors), what the widget
  // draws with the app's default dynamicColor = false.
  const SCHEMES = {
    light: {
      primary: "#006874", onPrimary: "#FFFFFF", primaryContainer: "#9EEFFD", onPrimaryContainer: "#004F58",
      secondaryContainer: "#CDE7EC", onSecondaryContainer: "#334B4F", tertiaryContainer: "#DAE2FF", onTertiaryContainer: "#3B4665",
      errorContainer: "#FFDAD6", onErrorContainer: "#93000A",
      surface: "#F5FAFB", onSurface: "#171D1E", surfaceVariant: "#DBE4E6", onSurfaceVariant: "#3F484A",
    },
    dark: {
      primary: "#82D3E1", onPrimary: "#00363D", primaryContainer: "#004F58", onPrimaryContainer: "#9EEFFD",
      secondaryContainer: "#334B4F", onSecondaryContainer: "#CDE7EC", tertiaryContainer: "#3B4665", onTertiaryContainer: "#DAE2FF",
      errorContainer: "#93000A", onErrorContainer: "#FFDAD6",
      surface: "#0E1415", onSurface: "#DEE3E5", surfaceVariant: "#3F484A", onSurfaceVariant: "#BFC8CA",
    },
  };
  // The countdown is a classic Chronometer: the static brand accent pair
  const ACCENT = { light: { c: "#CDE7EC", on: "#334B4F" }, dark: { c: "#334B4F", on: "#CDE7EC" } };
  const ROLE = {
    primary: ["--primary-container", "--on-primary-container"],
    secondary: ["--secondary-container", "--on-secondary-container"],
    tertiary: ["--tertiary-container", "--on-tertiary-container"],
    error: ["--error-container", "--on-error-container"],
    variant: ["--surface-variant", "--on-surface-variant"],
  };
  const CARD_ALPHA = 0.7; // the default background opacity
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`;
  };
  const schemeVars = (s) =>
    Object.entries(s)
      .map(([k, v]) => `--${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}:${v}`)
      .join(";");

  const fmtChrono = (ms) => {
    let s = Math.trunc(ms / 1000);
    const neg = s < 0;
    if (neg) s = -s;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const t = h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
    return neg ? "−" + t : t;
  };

  // buildCardContent: what each source puts in each slot, by width
  function phoneCard(id, cols, now) {
    const d = new Date(now);
    const base = { showChip: true, detail: [], emphasis: false };
    switch (id) {
      case "music": {
        const media = { playing: !musicState(now).paused };
        return { ...base, icon: "m-music", role: "primary", cd: "Music",
          title: SONG.title, subtitle: SONG.artist, media,
          aux: { type: "controls", media, skips: cols >= 3 },
          hero: { type: "text", text: SONG.title }, heroSub: SONG.artist };
      }
      case "notification":                       // one app, the app's mark and name over the sender
        return { ...base, icon: "i-chat", role: "secondary", cd: "Notification",
          title: NOTE.app, subtitle: NOTE.title,
          trailing: cols >= 4 ? NOTE.text : null, trailingShares: true,
          aux: cols >= 3 ? { type: "label", text: NOTE.app } : null,
          hero: { type: "text", text: NOTE.title }, heroSub: NOTE.text };
      case "event": {
        const startTime = phoneTime(eventStart);
        const range = `${startTime} - ${phoneTime(eventStart + EVENT_LEN)}`;
        // In its last hour, a pill counts down to the start; once it has
        // started, it says "Now"
        const imminence =
          now >= eventStart ? { text: "Now", accent: true } : eventStart - now <= HOUR ? { countdownTo: eventStart } : null;
        return { ...base, icon: "m-event", role: "secondary", cd: "Event",
          title: EVENT.title, subtitle: range, subtitleCompact: startTime,
          detail: imminence ? [imminence] : [], aux: imminence ? { type: "chip", chip: imminence } : null,
          hero: { type: "text", text: EVENT.title }, heroSub: range };
      }
      case "battery":
        return { ...base, icon: "i-phone-battery", role: "error", cd: "Battery",
          title: "15%", subtitle: "Phone battery is low", subtitleCompact: "", emphasis: true,
          aux: null, hero: { type: "numeral", text: "15%" }, heroSub: "Phone battery is low" };
      case "weather": {
        const { now: t, lo, hi, unit } = temps;
        const hiLo = { hiLo: [`${hi}°`, `${lo}°`] };
        return { ...base, icon: "m-sun", role: "tertiary", cd: "Weather",
          title: `${t}°${unit}`, subtitle: "Clear",
          trailing: cols >= 4 ? fmtPhoneMedium.format(d) : cols === 3 ? fmtShortDate.format(d) : null,
          aux: cols >= 4 ? { type: "dateBlock", weekday: fmtWeekday.format(d), monthDay: fmtMonthDay.format(d) }
            : cols === 3 ? { type: "label", text: fmtPhoneMedium.format(d), muted: true }
            : { type: "label", text: fmtMonthDayShort.format(d), muted: true },
          hero: { type: "numeral", text: `${t}°` }, heroSub: "Clear", detail: [hiLo], heroChip: hiLo };
      }
      case "reminder": {
        const fire = phoneTime(remStart);
        return { ...base, icon: "m-pill", role: "tertiary", cd: "Reminder",
          title: "Meds", subtitle: fire, done: true,
          aux: { type: "done" }, hero: { type: "text", text: "Meds" }, heroSub: fire };
      }
      default:                                   // the floor: a calendar page
        return { ...base, icon: "m-event", role: "variant", cd: "Date",
          title: fmtShortDate.format(d), titleFull: fmtPhoneLong.format(d), subtitle: null,
          aux: { type: "label", text: fmtMonth.format(d) },
          hero: { type: "numeral", text: String(d.getDate()) }, heroSub: fmtWeekday.format(d) };
    }
  }

  const VARIANT = "var(--on-surface-variant)";
  const pIcon = (name, size, color) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${color}" aria-hidden="true" focusable="false"><use href="#${name}"></use></svg>`;
  const gapX = (px) => `<span class="bw-gap" style="width:${px}px"></span>`;
  const gapY = (px) => `<span class="bw-gap" style="height:${px}px"></span>`;
  const txt = (t, { size, weight = 400, color = "var(--on-surface)", lines = 1, align = "", cls = "" }) =>
    `<span class="bw-t${lines === 2 ? " l2" : ""}${cls ? " " + cls : ""}" style="font-size:${size}px;font-weight:${weight};color:${color}${align ? ";text-align:" + align : ""}">${esc(t)}</span>`;
  const sourceChip = (c, diameter, iconSize) => {
    const [bg, fg] = ROLE[c.role];
    return `<span class="bw-chip" role="img" aria-label="${esc(c.cd)}" style="width:${diameter}px;height:${diameter}px;background:var(${bg})">${pIcon(c.icon, iconSize, `var(${fg})`)}</span>`;
  };
  const supportChipText = (chip, fs) => {
    if (!chip.hiLo) return txt(chip.text, { size: fs, color: VARIANT, cls: "bw-sct" });
    const a = fs + 2;
    return `<span class="bw-row bw-sct" style="font-size:${fs}px;color:${VARIANT}">` +
      `<span class="sr-only">High </span>${pIcon("i-arrow-up", a, "currentColor")}${txt(chip.hiLo[0], { size: fs, color: "currentColor" })}` +
      gapX(6) +
      `<span class="sr-only">, low </span>${pIcon("i-arrow-down", a, "currentColor")}${txt(chip.hiLo[1], { size: fs, color: "currentColor" })}</span>`;
  };
  // A launcher-ticked Chronometer: a fixed width (54 / 64 dp), filled in by tick()
  const pill = (chip, big = false) => {
    const box = `font-size:${big ? 13 : 11}px;padding:${big ? "5px 12px" : "3px 10px"}`;
    if (chip.countdownTo != null) {
      return `<span class="bw-cd" role="timer" data-countdown="${chip.countdownTo}" style="width:${big ? 64 : 54}px;${box}"></span>`;
    }
    const bg = chip.accent ? "var(--primary-container)" : "var(--surface-variant)";
    const fg = chip.accent ? "var(--on-primary-container)" : VARIANT;
    return `<span class="bw-pill" style="background:${bg};color:${fg};border-radius:${big ? 13 : 11}px;${box}">${esc(chip.text)}</span>`;
  };
  const badge = (t) => `<span class="bw-badge">${esc(t)}</span>`;
  // Every action is one 40 dp disc inside a 48 dp touch target
  const mediaButton = (media) => {
    const bg = media.playing ? "var(--primary)" : "var(--secondary-container)";
    const fg = media.playing ? "var(--on-primary)" : "var(--on-secondary-container)";
    return `<button type="button" class="bw-tt" data-act="play" aria-label="${media.playing ? "Pause" : "Play"}"><span class="bw-disc" style="background:${bg}">${pIcon(media.playing ? "m-pause" : "m-play", 20, fg)}</span></button>`;
  };
  const doneButton = () =>
    `<button type="button" class="bw-tt" data-act="done" aria-label="Mark done"><span class="bw-disc" style="background:var(--secondary-container)">${pIcon("m-check", 20, "var(--on-secondary-container)")}</span></button>`;
  const skipButton = (dir) =>
    `<button type="button" class="bw-tt" data-act="${dir}" aria-label="${dir === "next" ? "Next track" : "Previous track"}">${pIcon(dir === "next" ? "m-skip-next" : "m-skip-prev", 36, VARIANT)}</button>`;

  // CompactCard (2×1): the chip and two lines, nothing else
  const compactCard = (c) => {
    const sub = c.subtitleCompact ?? c.subtitle;
    return `<div class="bw-compact">` +
      (c.showChip ? sourceChip(c, 36, 18) + gapX(8) : "") +
      `<div class="bw-col bw-w1">` +
      txt(c.title, { size: c.emphasis ? 16 : 14, weight: c.emphasis ? 700 : 500 }) +
      (sub ? txt(sub, { size: 12, color: VARIANT }) : "") +
      `</div></div>`;
  };

  // RowCard (3×1, 4×1): chip, two lines, then a trailing line or pill, a badge
  // and a button
  const rowCard = (c) => {
    const tag = c.detail[0];
    let right = "";
    if (c.trailing != null || tag) {
      right = gapX(8) + `<div class="bw-col end ${c.trailingShares ? "bw-w1" : "bw-nf"}">` +
        (c.trailing != null ? txt(c.trailing, { size: 12, color: VARIANT, lines: 2, align: "end" }) : "") +
        (c.trailing != null && tag ? gapY(4) : "") +
        (tag ? (tag.hiLo ? supportChipText(tag, 12) : pill(tag)) : "") +
        `</div>`;
    }
    return `<div class="bw-rowc"><div class="bw-row">` +
      (c.showChip ? sourceChip(c, 40, 22) + gapX(12) : "") +
      `<div class="bw-col bw-w1">` +
      txt(c.titleFull ?? c.title, { size: c.emphasis ? 20 : 16, weight: c.emphasis ? 700 : 500 }) +
      (c.subtitle != null ? txt(c.subtitle, { size: 12, color: VARIANT }) : "") +
      `</div>` +
      right +
      (c.badge ? gapX(8) + badge(c.badge) : "") +
      (c.media ? gapX(8) + mediaButton(c.media) : "") +
      (c.done ? gapX(8) + doneButton() : "") +
      `</div></div>`;
  };

  const auxSlot = (aux, scale) => {
    switch (aux.type) {
      case "label":
        return `<span class="bw-aux">${txt(aux.text, {
          size: aux.muted ? 12 : scale.aux, weight: aux.muted ? 400 : 500,
          color: aux.muted ? VARIANT : "var(--on-surface)", align: "end" })}</span>`;
      case "dateBlock":
        return `<span class="bw-aux bw-col end">${txt(aux.weekday, { size: scale.aux, weight: 500, align: "end" })}${txt(aux.monthDay, { size: 12, color: VARIANT, align: "end" })}</span>`;
      case "chip":
        return pill(aux.chip, true);
      case "controls":
        return `<span class="bw-row bw-nf">${aux.skips ? skipButton("prev") : ""}${mediaButton(aux.media)}${aux.skips ? skipButton("next") : ""}</span>`;
      case "done":
        return doneButton();
    }
    return "";
  };

  const heroSubText = (t, size, narrow, cls = "") => txt(t, { size, color: VARIANT, lines: narrow ? 2 : 1, cls });

  const heroSlot = (c, scale, cols) => {
    const hero = c.hero || { type: "text", text: c.title };
    const narrow = cols <= 2;
    const sub = c.heroSub;
    let out = "";
    if (hero.type === "text") {
      out += `<div class="bw-col">` +
        txt(hero.text, { size: scale.hero, weight: 500, lines: hero.clampTwoLines || narrow ? 2 : 1 }) +
        (sub != null ? gapY(2) + heroSubText(sub, scale.heroSub, narrow) : "") +
        `</div>`;
      if (c.heroChip) out += gapY(2) + supportChipText(c.heroChip, scale.heroSub);
    } else if (cols >= 4 && sub != null) {
      // Four columns: the numeral and its support block share a row, lifted
      // 10 dp onto the baseline
      out += `<div class="bw-row bottom">${txt(hero.text, { size: scale.heroNumeral, cls: "bw-num" })}${gapX(10)}` +
        `<div class="bw-col" style="padding-bottom:10px;min-width:0">${txt(sub, { size: 15, color: VARIANT })}` +
        (c.heroChip ? supportChipText(c.heroChip, 15) : "") + `</div></div>`;
    } else {
      const chip = c.heroChip;
      out += `<div class="bw-col">${txt(hero.text, { size: scale.heroNumeral, cls: "bw-num" })}`;
      if (chip && !narrow) {
        out += gapY(2) + `<div class="bw-row" style="max-width:100%">` +
          (sub != null ? heroSubText(sub, scale.heroSub, false, "bw-share") + gapX(10) : "") +
          supportChipText(chip, scale.heroSub) + `</div>`;
      } else {
        if (sub != null) out += gapY(2) + heroSubText(sub, scale.heroSub, narrow && !chip);
        if (chip) out += gapY(2) + supportChipText(chip, scale.heroSub);
      }
      out += `</div>`;
    }
    return `<div class="bw-col bw-heroslot">${out}</div>`;
  };

  // StackCard (two rows): the chip and the glance's action up top, the hero
  // at the bottom
  const stackCard = (c, cols) => {
    const scale = typeScaleFor(cols);
    return `<div class="bw-stack">` +
      `<div class="bw-hdr">${c.showChip ? sourceChip(c, 40, 22) : ""}<span class="bw-w1"></span>` +
      (c.badge ? badge(c.badge) + gapX(8) : "") +
      (c.aux ? auxSlot(c.aux, scale) : "") +
      `</div>` +
      `<div class="bw-herobox">${heroSlot(c, scale, cols)}</div>` +
      `</div>`;
  };

  const tickChrono = (node) => {
    const now = Date.now();
    node.querySelectorAll("[data-countdown]").forEach((n) => {
      const t = fmtChrono(+n.dataset.countdown - now);
      if (n.textContent !== t) n.textContent = t;
    });
  };

  $$('[data-surface="phone"]').forEach((host) => {
    const card = host.querySelector(".bw");
    const sizeButtons = $$("[data-pw-size]", host.closest(".cell") || document);
    const dark = matchMedia("(prefers-color-scheme: dark)");
    let size = host.dataset.size || "4x1";
    let layout = { cols: 4, stacked: false };
    let last = null;
    const s = slot(
      card.querySelector(".swap-stack"),
      "bw-item",
      (src) => {
        const c = phoneCard(src.id, layout.cols, Date.now());
        return layout.stacked ? stackCard(c, layout.cols) : layout.cols === 2 ? compactCard(c) : rowCard(c);
      },
      tickChrono
    );

    const sizeGlyph = (n, m) => {
      let r = "";
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 4; x++) {
          r += `<rect x="${x * 6}" y="${y * 6.5}" width="4.8" height="5.3" rx="1.2" opacity="${x < n && y < m ? 1 : 0.25}" />`;
        }
      }
      return `<svg viewBox="0 0 23 12" aria-hidden="true">${r}</svg>`;
    };
    sizeButtons.forEach((b) => {
      const [n, m] = b.dataset.pwSize.split("x");
      b.innerHTML = `${sizeGlyph(+n, +m)}<span aria-hidden="true">${n}×${m}</span>`;
    });

    // The launcher's grid cell, the bin it picks, and the theme
    const frame = () => {
      const [n, m] = size.split("x").map(Number);
      const cell = cellFor(n, m);
      layout = layoutFor(hostPickBin(cell));
      const theme = dark.matches ? "dark" : "light";
      const scheme = SCHEMES[theme];
      card.style.cssText =
        `width:${cell.w}px;height:${cell.h}px;${schemeVars(scheme)};` +
        `--accent-c:${ACCENT[theme].c};--on-accent-c:${ACCENT[theme].on};--card:${rgba(scheme.surface, CARD_ALPHA)}`;
      card.setAttribute("aria-label", `Brief's phone widget, ${n} by ${m}`);
      sizeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pwSize === size)));
      fit();
    };
    // Scaled down (never up) to the cell
    const fit = () => {
      const w = parseFloat(card.style.width) || 1;
      card.style.zoom = Math.min(1, host.clientWidth / w).toFixed(3);
    };
    frame();
    if ("ResizeObserver" in window) new ResizeObserver(fit).observe(host);
    dark.addEventListener?.("change", frame);
    sizeButtons.forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.pwSize === size) return;
        size = b.dataset.pwSize;
        frame();
        if (last) s.patch(last, { fade: true });
      })
    );

    surfaces.push({
      host,
      mount(src, g, animate) {
        last = g;
        s.mount(src, g, animate);
      },
      patch(g) {
        last = g;
        s.patch(g);
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
    fakePausedAt = null;
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
      leaveWaiting();
      playSong();
    })
  );

  function leaveWaiting() {
    if (!root.classList.contains("demo-waiting")) return;
    root.classList.remove("demo-waiting");
    paused = false;
    syncToggles();
  }

  // ---------------------------------------------------------------------------
  // The surfaces' own buttons: play/pause, skip, mark done
  // ---------------------------------------------------------------------------
  // ▶/⏸ on the tile or a widget does what tapping the watch does, except
  // that ⏸ on the silent made-up track just pauses it where it is.
  function toggleMusic() {
    if (current?.id !== "music") return;
    if (songPlaying()) return stopFollowing();
    if (!songLive() && fakePausedAt == null) {
      fakePausedAt = musicState(Date.now()).elapsed;
      return patchMusic();
    }
    if (canPlaySong && !songFailed) {
      leaveWaiting();
      playSong();
    } else {
      trackStartedAt = Date.now() - fakePausedAt * 1000;
      fakePausedAt = null;
      patchMusic();
    }
  }

  // ⏮ starts the song over. ⏭ moves on to the next glance, the nearest a
  // one-song demo has to a next track.
  function skipTrack(dir) {
    if (current?.id !== "music") return;
    if (dir > 0) return show(index + 1, { hold: PICKED_HOLD_MS });
    if (songLive()) audio.currentTime = 0;
    else {
      trackStartedAt = Date.now();
      if (fakePausedAt != null) fakePausedAt = 0;
    }
    patchMusic();
  }

  // ✓ marks the reminder done: it steps aside, and with nothing else due
  // Brief falls to the date.
  function markDone() {
    if (current?.id === "reminder") show(indexOf("date"), { hold: PICKED_HOLD_MS });
  }

  const ACTIONS = { play: toggleMusic, prev: () => skipTrack(-1), next: () => skipTrack(1), done: markDone };
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-act]");
    if (b && b.closest("[data-surface]") && !b.closest(".leaving")) ACTIONS[b.dataset.act]?.();
  });

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
