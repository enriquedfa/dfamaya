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

  const TRACK_LEN_S = 243; // 4:03
  const trackStartedAt = Date.now() - 62_000;

  const temps = fahrenheit ? { now: 68, lo: 57, hi: 77, unit: "F" } : { now: 18, lo: 14, hi: 25, unit: "C" };

  const pad = (n) => String(n).padStart(2, "0");
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // bg / fg are each source's identity colours from the app's Theme.kt (tone 30 / tone 90).
  // `icon` is the source's badge on the page; `face` is the glyph the complication draws.
  const SOURCES = [
    {
      id: "music",
      name: "Now playing",
      blurb: "Track and artist, with play and pause.",
      bg: "#7B2949",
      fg: "#FFD9E2",
      icon: "music",
      face: "play",
      glance(now) {
        const pos = ((now - trackStartedAt) / 1000) % TRACK_LEN_S;
        return {
          long: { title: "M83", text: "Midnight City" },
          ranged: { lines: ["Midnight City"], value: pos / TRACK_LEN_S },
          short: { lines: ["Midnight City"] },
          tile: { label: "Now playing", main: "Midnight City", sub: "M83", edge: "pause" },
          widget: { title: "Midnight City", text: "M83", bar: pos / TRACK_LEN_S, button: "pause" },
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
          tile: { label: "Messages", main: "Alex", sub: "On my way", edge: "brief" },
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
          tile: { label: inWords, main: "Standup", sub: range, edge: "brief" },
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
          tile: { label: "Phone battery", main: "15%", sub: "Battery low", edge: "brief" },
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
          tile: { label: "Sunny", main: `${t}°`, sub: `Today ${lo}° / ${hi}°`, edge: "brief" },
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
          tile: { label: "Reminder", main: "Meds", sub: "Tap when done", edge: "check" },
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
          tile: { label: "Today", main: fmtWeekday.format(d), sub: fmtMonthDay.format(d), edge: "brief" },
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
            ${svgIcon(src.face, "cx-icon")}
            <span class="cx-lines">
              ${title ? `<span class="cx-title" data-k="title">${esc(title)}</span>` : ""}
              <span class="cx-text" data-k="text">${esc(text)}</span>
            </span>
          </div>`);
        swap(stack, this.node, animate);
      },
      patch(g) {
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
            ${svgIcon(src.face, "cx-icon")}
          </div>`);
        swap(stack, this.node, animate);
        setRing(g.ranged);
      },
      patch(g) {
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
            ${svgIcon(src.face, "cx-icon")}
            <span class="cx-lines">${linesHtml(g.short.lines)}</span>
          </div>`);
        swap(stack, this.node, animate);
      },
      patch(g) {
        g.short.lines.forEach((l, i) => setText(this.node, `l${i}`, l));
      },
    });
  });

  // Tile
  $$('[data-surface="tile"]').forEach((host) => {
    const stack = host.querySelector(".swap-stack");
    surfaces.push({
      host,
      mount(src, g, animate) {
        const t = g.tile;
        this.node = el(`
          <div class="tile-item">
            <div class="tile-label" data-k="label">${esc(t.label)}</div>
            <div class="tile-card">
              <div class="tile-main" data-k="main">${esc(t.main)}</div>
              <div class="tile-sub" data-k="sub">${esc(t.sub)}</div>
            </div>
            <div class="tile-edge">${svgIcon(t.edge)}</div>
          </div>`);
        swap(stack, this.node, animate);
      },
      patch(g) {
        setText(this.node, "label", g.tile.label);
        setText(this.node, "main", g.tile.main);
        setText(this.node, "sub", g.tile.sub);
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
  let paused = false; // by the pause button
  let pinned = null; // source held by the scroll story
  let visible = true; // some surface is on screen
  const root = document.documentElement;

  function show(i, { animate = true, hold = HOLD_MS } = {}) {
    index = (i + SOURCES.length) % SOURCES.length;
    const src = SOURCES[index];
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
    if (paused || pinned || !visible || document.hidden) return;
    timer = setTimeout(() => show(index + 1), hold);
  }

  function setPaused(p) {
    paused = p;
    root.classList.toggle("demo-paused", p);
    toggles.forEach((t) => {
      t.setAttribute("aria-pressed", String(p));
      t.setAttribute("aria-label", p ? "Play the demo" : "Pause the demo");
      t.querySelector("use")?.setAttribute("href", p ? "#i-play" : "#i-pause");
    });
    if (p) clearTimeout(timer);
    else show(index + 1);
  }

  chips.forEach((c) =>
    c.addEventListener("click", () => {
      const i = indexOf(c.dataset.chip);
      if (i >= 0) show(i, { hold: PICKED_HOLD_MS });
    })
  );
  toggles.forEach((t) => t.addEventListener("click", () => setPaused(!paused)));

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
