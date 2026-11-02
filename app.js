(() => {
  "use strict";

  const cfg = window.LOTM_CONFIG || {};
  const LANG_NAMES = { en: "English", id: "Bahasa Indonesia" };
  const LANG_SHORT = { en: "EN", id: "ID" };
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");
  const root = document.documentElement;

  // ---------- UI text (follows the chosen reading language) ----------
  const STRINGS = {
    en: {
      webNovel: "Web novel", chapters: "chapters", volumes: "volumes", inLang: "in Bahasa Indonesia",
      continue: "Continue", start: "Start reading", startId: "Read in Indonesian", more: "Show more", less: "Show less",
      contents: "Contents", search: "Search chapter number or title", translatedOnly: "Indonesian only",
      front: "Front matter", library: "Library", settings: "Reading settings", theme: "Theme",
      auto: "Auto", light: "Light", sepia: "Sepia", dark: "Dark", font: "Font", serif: "Serif", sans: "Sans",
      size: "Text size", leading: "Line spacing", tight: "Tight", normal: "Normal", loose: "Loose",
      width: "Page width", narrow: "Narrow", wide: "Wide", preview: "The crimson moon hung high in the sky.",
      next: "Next", prev: "Previous", minRead: "min read", chapter: "Chapter", notTranslated: "Not translated yet — showing the English text.",
      nothing: "Nothing matches “{q}”.", results: "{n} results", showMore: "Show {n} more", theEnd: "The end.",
      keys: "Keys: ← → change chapter · T contents · Esc close", lastRead: "Last read", loading: "Loading…",
      retry: "Try again", notFound: "Chapter not found.", backToList: "Back to the library", close: "Close",
      reading: "Reading", items: "{n} items",
    },
    id: {
      webNovel: "Novel web", chapters: "bab", volumes: "volume", inLang: "dalam Bahasa Indonesia",
      continue: "Lanjutkan", start: "Mulai membaca", startId: "Baca dalam B. Indonesia", more: "Selengkapnya", less: "Ringkas",
      contents: "Daftar isi", search: "Cari nomor atau judul bab", translatedOnly: "Hanya B. Indonesia",
      front: "Bagian awal", library: "Pustaka", settings: "Pengaturan baca", theme: "Tema",
      auto: "Otomatis", light: "Terang", sepia: "Sepia", dark: "Gelap", font: "Huruf", serif: "Serif", sans: "Sans",
      size: "Ukuran teks", leading: "Jarak baris", tight: "Rapat", normal: "Normal", loose: "Longgar",
      width: "Lebar halaman", narrow: "Sempit", wide: "Lebar", preview: "Bulan merah tua tergantung tinggi di langit.",
      next: "Berikutnya", prev: "Sebelumnya", minRead: "menit baca", chapter: "Bab", notTranslated: "Belum diterjemahkan — menampilkan teks bahasa Inggris.",
      nothing: "Tidak ada yang cocok dengan “{q}”.", results: "{n} hasil", showMore: "Tampilkan {n} lagi", theEnd: "Tamat.",
      keys: "Tombol: ← → ganti bab · T daftar isi · Esc tutup", lastRead: "Terakhir dibaca", loading: "Memuat…",
      retry: "Coba lagi", notFound: "Bab tidak ditemukan.", backToList: "Kembali ke pustaka", close: "Tutup",
      reading: "Dibaca", items: "{n} entri",
    },
  };
  const t = (key, vars) => {
    let s = (STRINGS[settings.lang] || STRINGS.en)[key] || STRINGS.en[key] || key;
    if (vars) for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
    return s;
  };

  const ICONS = {
    back: '<path d="m15 18-6-6 6-6"/>',
    left: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  // ---------- storage (best effort; the site works without it) ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem("lotm." + key); return v ? JSON.parse(v) : fallback; }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("lotm." + key, JSON.stringify(value)); } catch (e) {}
    },
  };
  const settings = Object.assign(
    { theme: "auto", font: "serif", size: 19, width: "normal", leading: "normal", lang: "en" },
    store.get("settings", {})
  );
  const progress = Object.assign({ last: null, scroll: 0, read: [] }, store.get("progress", {}));
  const readSet = new Set(progress.read);
  const saveSettings = () => store.set("settings", settings);
  const saveProgress = () => { progress.read = [...readSet]; store.set("progress", progress); };

  // ---------- data sources ----------
  const staticSource = {
    async index() {
      const r = await fetch("data/index.json");
      if (!r.ok) throw new Error("Could not load data/index.json");
      return r.json();
    },
    async chapter(id, lang) {
      const r = await fetch(`data/${lang}/${id}.html`);
      if (!r.ok) throw new Error(`Chapter ${id} (${lang}) not found`);
      return r.text();
    },
  };

  const supabaseSource = {
    async get(path, from, to) {
      const headers = { apikey: cfg.supabaseAnonKey, Authorization: "Bearer " + cfg.supabaseAnonKey };
      if (from != null) Object.assign(headers, { "Range-Unit": "items", Range: `${from}-${to}` });
      const r = await fetch(cfg.supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + path, { headers });
      if (!r.ok) throw new Error("Supabase: " + r.status + " " + (await r.text()));
      return r.json();
    },
    async index() {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const page = await this.get("chapters?select=id,lang,kind,num,volume,title&kind=neq.meta&order=id,lang", from, from + 999);
        rows.push(...page);
        if (page.length < 1000) break;
      }
      const extra = await this.get("chapters?select=content&kind=eq.meta&limit=1").catch(() => []);
      const info = extra.length ? JSON.parse(extra[0].content) : {};
      const byId = new Map();
      const langs = new Set();
      for (const r of rows) {
        langs.add(r.lang);
        let e = byId.get(r.id);
        if (!e) {
          e = { id: r.id, k: r.kind, v: r.volume, t: {} };
          if (r.num != null) e.n = r.num;
          byId.set(r.id, e);
        }
        e.t[r.lang] = r.title;
      }
      const entries = [...byId.values()].sort((a, b) => a.id - b.id);
      return Object.assign({
        title: "Lord of the Mysteries",
        volumes: entries.filter((e) => e.k === "v").map((e) => e.t.en),
        volumeCovers: [],
      }, info, {
        langs: Object.fromEntries([...langs].sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b))).map((l) => [l, LANG_NAMES[l] || l])),
        entries,
      });
    },
    async chapter(id, lang) {
      const rows = await this.get(`chapters?select=content&id=eq.${id}&lang=eq.${lang}`);
      if (!rows.length) throw new Error(`Chapter ${id} (${lang}) not found`);
      return rows[0].content;
    },
  };

  const source = cfg.supabaseUrl && cfg.supabaseAnonKey ? supabaseSource : staticSource;
  const cache = new Map();
  function loadChapter(id, lang) {
    const key = lang + ":" + id;
    if (!cache.has(key)) cache.set(key, source.chapter(id, lang).catch((e) => { cache.delete(key); throw e; }));
    return cache.get(key);
  }

  let meta = null;
  let byId = new Map();

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const has = (e, lang) => e.t[lang] != null;
  const otherLangs = () => Object.keys(meta.langs).filter((l) => l !== "en");
  const translated = (e) => otherLangs().some((l) => has(e, l));
  const shownLang = (e) => (has(e, settings.lang) ? settings.lang : "en");
  const fullTitle = (e, lang = shownLang(e)) => e.t[lang] || e.t.en;
  const shortTitle = (e) => fullTitle(e).replace(/^(Chapter|Bab)\s+\d+\s*:\s*/i, "");
  const volumeName = (v) => (v === 0 ? t("front") : meta.volumes[v - 1] || "Part " + v);
  const volumeShort = (v) => {
    if (v === 0) return t("front");
    const m = (meta.volumes[v - 1] || "").match(/^Volume (\d+):\s*(.+)$/);
    return m ? `${m[1]} · ${m[2]}` : meta.volumes[v - 1];
  };
  const chapterLabel = (e) => (e.n != null ? `${t("chapter")} ${e.n}` : "");
  const volumesInUse = () => [...new Set(meta.entries.map((e) => e.v))].sort((a, b) => a - b);
  const listable = (e) => e.k !== "v";

  function applySettings() {
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.font;
    root.dataset.width = settings.width;
    root.dataset.leading = settings.leading;
    root.style.setProperty("--reader-size", settings.size + "px");
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (bg) $('meta[name="theme-color"]').setAttribute("content", bg);
  }

  // ---------- top bar ----------
  function renderTopbar(view, entry) {
    $("#tb-left").innerHTML = view === "read"
      ? `<a class="back" href="#/">${icon("back")}<span>${esc(t("library"))}</span></a>`
      : `<a class="brand" href="#/"><span class="brand-mark"></span><span>LOTM</span></a>`;
    $("#tb-title").textContent = entry ? [entry.n, shortTitle(entry)].filter((x) => x != null).join(" · ") : "";
    const toc = $("#toc-btn");
    toc.hidden = view !== "read";
    toc.innerHTML = icon("list");
    toc.setAttribute("aria-label", t("contents"));
    toc.title = t("contents") + " (T)";
    const st = $("#settings-btn");
    st.innerHTML = icon("type");
    st.setAttribute("aria-label", t("settings"));
    st.title = t("settings");

    const el = $("#lang-switch");
    const langs = Object.keys(meta.langs);
    if (langs.length < 2) { el.innerHTML = ""; return; }
    el.innerHTML = langs.map((l) => {
      const avail = !entry || has(entry, l);
      const on = entry ? shownLang(entry) === l : settings.lang === l;
      const title = meta.langs[l] + (avail ? "" : " — " + t("notTranslated"));
      return `<button type="button" data-lang="${l}" class="${on ? "on" : ""}" aria-pressed="${on}" ${avail ? "" : "disabled"} title="${esc(title)}">${LANG_SHORT[l] || l.toUpperCase()}</button>`;
    }).join("");
  }

  // ---------- chapter list (shared by the library and the contents drawer) ----------
  function filterEntries({ q, vol, onlyTr }) {
    const query = q.trim().toLowerCase();
    const num = /^\d+$/.test(query) ? query : null;
    return meta.entries.filter((e) => {
      if (!listable(e)) return false;
      if (onlyTr && !translated(e)) return false;
      if (!query) return e.v === vol;
      if (num) return e.n != null && String(e.n).startsWith(num);
      return Object.values(e.t).some((s) => s.toLowerCase().includes(query));
    });
  }

  function rowHtml(e) {
    const cls = ["row", e.id === progress.last ? "current" : "", readSet.has(e.id) ? "read" : ""].join(" ").trim();
    const tags = otherLangs().filter((l) => has(e, l)).map((l) => `<span class="tag">${LANG_SHORT[l] || l.toUpperCase()}</span>`).join("");
    const here = e.id === progress.last ? `<span class="here">${esc(t("reading"))}</span>` : "";
    return `<li><a class="${cls}" href="#/read/${e.id}"><span class="n">${e.n ?? "·"}</span><span class="t">${esc(shortTitle(e))}</span>${tags}${here}</a></li>`;
  }

  function volHeadHtml(v, count) {
    const cover = meta.volumeCovers && meta.volumeCovers[v - 1];
    const page = meta.entries.find((e) => e.k === "v" && e.v === v);
    const img = cover ? `<img src="${esc(cover)}" alt="" loading="lazy" />` : "";
    const inner = `${img}<div><strong>${esc(volumeName(v))}</strong><span>${esc(t("items", { n: count }))}</span></div>`;
    return page ? `<a class="vol-head" href="#/read/${page.id}">${inner}</a>` : `<div class="vol-head">${inner}</div>`;
  }

  const PAGE = 300;
  function renderList(container, state) {
    const list = filterEntries(state);
    const searching = state.q.trim() !== "";
    if (!list.length) {
      container.innerHTML = `<p class="empty">${esc(searching ? t("nothing", { q: state.q }) : "—")}</p>`;
      return;
    }
    const shown = list.slice(0, state.limit || PAGE);
    let html = "";
    if (searching) {
      html += `<p class="eyebrow" style="padding-top:14px">${esc(t("results", { n: list.length }))}</p><ul class="list">${shown.map(rowHtml).join("")}</ul>`;
    } else {
      html += volHeadHtml(state.vol, list.length) + `<ul class="list">${shown.map(rowHtml).join("")}</ul>`;
    }
    if (list.length > shown.length) {
      html += `<button type="button" class="more-row" data-more>${esc(t("showMore", { n: list.length - shown.length }))}</button>`;
    }
    container.innerHTML = html;
    const more = $("[data-more]", container);
    if (more) more.addEventListener("click", () => { state.limit = (state.limit || PAGE) + PAGE; renderList(container, state); });
  }

  function chipsHtml(state) {
    return volumesInUse().map((v) =>
      `<button type="button" class="chip ${state.vol === v ? "on" : ""}" data-vol="${v}" ${state.q.trim() ? "disabled" : ""}>${esc(volumeShort(v))}</button>`
    ).join("");
  }

  // ---------- library ----------
  const libState = { q: "", vol: null, onlyTr: false, limit: PAGE };
  let descOpen = false;

  function renderLibrary() {
    document.title = meta.title;
    root.lang = settings.lang;
    renderTopbar("home");
    setProgressBar(0);
    const last = progress.last != null ? byId.get(progress.last) : null;
    if (libState.vol == null) libState.vol = last ? last.v : 1;
    const chapters = meta.entries.filter((e) => e.k === "c");
    const first = chapters[0];
    const trCount = meta.entries.filter(translated).length;
    const firstTr = settings.lang !== "en" && chapters.find((e) => has(e, settings.lang));
    const vols = meta.volumes.filter((v) => /^Volume/.test(v)).length;
    const pct = last && progress.scroll ? Math.round(progress.scroll * 100) : 0;

    app.innerHTML = `
      <div class="library">
        <section class="book">
          ${meta.cover ? `<img class="cover" src="${esc(meta.cover)}" alt="${esc(meta.title)}" />` : ""}
          <div>
            <p class="eyebrow">${esc(t("webNovel"))}</p>
            <h1>${esc(meta.title)}</h1>
            ${meta.author ? `<p class="author">${esc(meta.author)}</p>` : ""}
            <ul class="stats">
              <li>${chapters.length.toLocaleString()} ${esc(t("chapters"))}</li>
              <li>${vols} ${esc(t("volumes"))}</li>
              ${trCount ? `<li>${icon("globe")} ${trCount} ${esc(t("inLang"))}</li>` : ""}
            </ul>
          </div>
        </section>
        ${last ? `
          <a class="resume" href="#/read/${last.id}">
            <div class="resume-text">
              <span>${esc(t("continue"))} · ${esc(volumeName(last.v))}</span>
              <strong>${esc(fullTitle(last))}</strong>
              <div class="meter"><span style="width:${pct}%"></span></div>
            </div>
            <span class="resume-go">${pct}%${icon("right")}</span>
          </a>
          <p class="quiet-links">
            <a href="#/read/${first.id}">${esc(t("start"))}</a>
            ${firstTr && firstTr.id !== last.id ? `<a href="#/read/${firstTr.id}">${esc(t("startId"))} · ${esc(chapterLabel(firstTr))}</a>` : ""}
          </p>` : `
          <div class="actions">
            <a class="btn primary" href="#/read/${first.id}">${icon("book")}${esc(t("start"))}</a>
            ${firstTr ? `<a class="btn" href="#/read/${firstTr.id}">${esc(t("startId"))}</a>` : ""}
          </div>`}
        ${meta.description ? `
          <p class="desc ${descOpen ? "" : "clamp"}" id="desc">${esc(meta.description)}</p>
          <button type="button" class="link-btn" id="desc-toggle">${esc(descOpen ? t("less") : t("more"))}</button>` : ""}
        <section class="contents" aria-labelledby="contents-h">
          <div class="contents-head">
            <div class="contents-title"><h2 id="contents-h">${esc(t("contents"))}</h2></div>
            <label class="search">${icon("search")}<input type="search" id="q" placeholder="${esc(t("search"))}" value="${esc(libState.q)}" autocomplete="off" aria-label="${esc(t("search"))}" /></label>
            <div class="filters">
              <div class="chips" id="chips" role="tablist">${chipsHtml(libState)}</div>
              ${trCount ? `<label class="toggle"><input type="checkbox" id="only-tr" ${libState.onlyTr ? "checked" : ""} /> ${esc(t("translatedOnly"))}</label>` : ""}
            </div>
          </div>
          <div id="lib-list"></div>
        </section>
      </div>`;

    const listEl = $("#lib-list");
    const refresh = () => { libState.limit = PAGE; $("#chips").innerHTML = chipsHtml(libState); renderList(listEl, libState); };
    $("#q").addEventListener("input", (ev) => { libState.q = ev.target.value; refresh(); });
    $("#q").addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      const hit = meta.entries.find((e) => String(e.n) === ev.target.value.trim());
      if (hit) location.hash = "#/read/" + hit.id;
    });
    $("#chips").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-vol]");
      if (!b) return;
      libState.vol = +b.dataset.vol;
      refresh();
      b.scrollIntoView({ inline: "nearest", block: "nearest" });
    });
    const only = $("#only-tr");
    if (only) only.addEventListener("change", (ev) => { libState.onlyTr = ev.target.checked; refresh(); });
    const dt = $("#desc-toggle");
    if (dt) dt.addEventListener("click", () => {
      descOpen = !descOpen;
      $("#desc").classList.toggle("clamp", !descOpen);
      dt.textContent = descOpen ? t("less") : t("more");
    });
    renderList(listEl, libState);
    const on = $("#chips .chip.on");
    if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
  }

  // ---------- reader ----------
  let currentId = null;
  let renderToken = 0;

  function minutes(html) {
    const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 230));
  }

  async function renderReader(id) {
    const entry = byId.get(id);
    if (!entry) { app.innerHTML = `<p class="status">${esc(t("notFound"))} <a href="#/">${esc(t("backToList"))}</a></p>`; return; }
    const token = ++renderToken;
    const lang = shownLang(entry);
    const fresh = currentId !== id;
    currentId = id;
    renderTopbar("read", entry);
    if (fresh) app.innerHTML = `<p class="status">${esc(t("loading"))}</p>`;

    let body;
    try { body = await loadChapter(id, lang); }
    catch (err) {
      if (token !== renderToken) return;
      app.innerHTML = `<p class="status">${esc(err.message)}. <a href="#/read/${id}">${esc(t("retry"))}</a></p>`;
      return;
    }
    if (token !== renderToken) return;

    const idx = meta.entries.indexOf(entry);
    const prev = meta.entries[idx - 1];
    const next = meta.entries[idx + 1];
    const eyebrow = [chapterLabel(entry), volumeName(entry.v)].filter(Boolean).join(" · ");
    const notice = settings.lang !== "en" && lang === "en" ? `<p class="notice">${esc(t("notTranslated"))}</p>` : "";
    const nextLabel = next ? [next.n, shortTitle(next)].filter((x) => x != null).join(" · ") : "";

    document.title = fullTitle(entry) + " · " + meta.title;
    root.lang = lang;
    app.innerHTML = `
      <article class="reader">
        <header class="chap-head">
          <p class="eyebrow">${esc(eyebrow)}</p>
          <h1>${esc(entry.k === "c" ? shortTitle(entry) : fullTitle(entry))}</h1>
          <div class="chap-meta">
            <span>${icon("clock")}${minutes(body)} ${esc(t("minRead"))}</span>
            <span>${icon("globe")}${esc(meta.langs[lang] || lang)}</span>
          </div>
          ${notice}
        </header>
        <div class="content" id="content">${body}</div>
        <footer class="chap-end">
          ${next
            ? `<a class="next-card" href="#/read/${next.id}" rel="next"><div><span>${esc(t("next"))}</span><strong>${esc(nextLabel)}</strong></div>${icon("right")}</a>`
            : `<p class="the-end">${esc(t("theEnd"))}</p>`}
          <div class="end-links">
            <a class="${prev ? "" : "disabled"}" href="${prev ? "#/read/" + prev.id : "#/"}" rel="prev">${icon("left")}${esc(t("prev"))}</a>
            <button type="button" data-open-toc>${icon("list")}${esc(t("contents"))}</button>
          </div>
        </footer>
      </article>`;

    if (fresh) {
      const resume = progress.last === id && progress.scroll > 0 && progress.scroll < 0.98 ? progress.scroll : 0;
      window.scrollTo(0, resume * (document.documentElement.scrollHeight - innerHeight));
      setChrome(true);
    }
    progress.last = id;
    saveProgress();
    if (next) loadChapter(next.id, shownLang(next)).catch(() => {});
    onScroll();
  }

  // ---------- chrome: progress bar, auto-hiding top bar ----------
  let lastY = 0, saveTimer = null, chromeVisible = true;
  const reading = () => currentId != null && location.hash.startsWith("#/read/");
  function setProgressBar(frac) { $("#progress-bar").style.width = frac * 100 + "%"; }
  function setChrome(visible) {
    chromeVisible = visible;
    $("#topbar").classList.toggle("hide", !visible && !anyPanelOpen());
  }
  function onScroll() {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    $("#topbar").classList.toggle("scrolled", y > 8);
    if (!reading()) { setProgressBar(0); return; }
    const frac = max > 0 ? Math.min(1, y / max) : 1;
    setProgressBar(frac);
    if (Math.abs(y - lastY) > 6) setChrome(y < lastY || y < 120 || frac > 0.985);
    lastY = y;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      progress.last = currentId;
      progress.scroll = frac;
      if (frac > 0.9) readSet.add(currentId);
      saveProgress();
    }, 300);
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // Tap the text (not a link or image) to show/hide the top bar, like most reading apps.
  app.addEventListener("click", (ev) => {
    if (!reading() || !ev.target.closest(".content") || ev.target.closest("a, img, button")) return;
    if (String(window.getSelection())) return;
    setChrome(!chromeVisible);
  });

  // ---------- panels ----------
  let lastFocus = null;
  const anyPanelOpen = () => !$("#settings").hidden || !$("#toc").hidden;
  function openPanel(panel) {
    closePanels(true);
    lastFocus = document.activeElement;
    $("#topbar").classList.remove("hide");
    const scrim = $("#scrim");
    scrim.hidden = false;
    panel.hidden = false;
    requestAnimationFrame(() => { scrim.classList.add("open"); panel.classList.add("open"); });
    // The contents drawer is for jumping, so put the cursor in its search box; settings just takes focus itself.
    const target = panel.querySelector('input[type="search"]') || panel;
    setTimeout(() => target.focus({ preventScroll: true }), 50);
  }
  function closePanels(instant) {
    const scrim = $("#scrim");
    for (const p of [$("#settings"), $("#toc")]) {
      if (p.hidden) continue;
      p.classList.remove("open");
      if (instant) p.hidden = true; else setTimeout(() => { if (!p.classList.contains("open")) p.hidden = true; }, 250);
    }
    scrim.classList.remove("open");
    if (instant) scrim.hidden = true; else setTimeout(() => { if (!scrim.classList.contains("open")) scrim.hidden = true; }, 200);
    if (!instant && lastFocus) { lastFocus.focus({ preventScroll: true }); lastFocus = null; }
  }
  $("#scrim").addEventListener("click", () => closePanels());
  document.querySelectorAll("[data-close]").forEach((b) => {
    b.innerHTML = icon("close");
    b.addEventListener("click", () => closePanels());
  });

  // Settings
  function segHtml(key, options) {
    return `<div class="seg" role="group">${options.map((o) =>
      `<button type="button" data-set="${key}" data-v="${o}" class="${settings[key] === o ? "on" : ""}" aria-pressed="${settings[key] === o}">${esc(t(o))}</button>`
    ).join("")}</div>`;
  }
  function renderSettings() {
    $("#settings-title").textContent = t("settings");
    $("#settings").querySelector("[data-close]").setAttribute("aria-label", t("close"));
    $("#settings-body").innerHTML = `
      <div class="field">
        <div class="field-label">${esc(t("theme"))}</div>
        <div class="swatches" role="group">${["auto", "light", "sepia", "dark"].map((th) =>
          `<button type="button" class="swatch sw-${th} ${settings.theme === th ? "on" : ""}" data-set="theme" data-v="${th}" aria-pressed="${settings.theme === th}"><i>Aa</i>${esc(t(th))}</button>`
        ).join("")}</div>
      </div>
      <div class="field">
        <div class="field-label"><span>${esc(t("size"))}</span><span id="size-val">${settings.size}px</span></div>
        <div class="range"><span style="font-size:13px">A</span><input type="range" id="size" min="14" max="28" step="1" value="${settings.size}" aria-label="${esc(t("size"))}" /><span style="font-size:20px">A</span></div>
      </div>
      <div class="field"><div class="field-label">${esc(t("font"))}</div>${segHtml("font", ["serif", "sans"])}</div>
      <div class="field"><div class="field-label">${esc(t("leading"))}</div>${segHtml("leading", ["tight", "normal", "loose"])}</div>
      <div class="field"><div class="field-label">${esc(t("width"))}</div>${segHtml("width", ["narrow", "normal", "wide"])}</div>
      <div class="field"><p class="preview">${esc(t("preview"))}</p></div>
      <p class="kbd-help">${t("keys").replace("← →", "<kbd>←</kbd> <kbd>→</kbd>").replace(" T ", " <kbd>T</kbd> ").replace("Esc", "<kbd>Esc</kbd>")}</p>`;
  }
  $("#settings-body").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-set]");
    if (!b) return;
    settings[b.dataset.set] = b.dataset.v;
    applySettings();
    saveSettings();
    b.parentElement.querySelectorAll("[data-set]").forEach((x) => {
      const on = x === b;
      x.classList.toggle("on", on);
      x.setAttribute("aria-pressed", on);
    });
  });
  $("#settings-body").addEventListener("input", (ev) => {
    if (ev.target.id !== "size") return;
    settings.size = +ev.target.value;
    $("#size-val").textContent = settings.size + "px";
    applySettings();
    saveSettings();
  });
  $("#settings-btn").addEventListener("click", () => ($("#settings").hidden ? (renderSettings(), openPanel($("#settings"))) : closePanels()));

  // Contents drawer
  const tocState = { q: "", vol: 1, onlyTr: false, limit: PAGE };
  function renderToc() {
    $("#toc-title").textContent = t("contents");
    $("#toc").querySelector("[data-close]").setAttribute("aria-label", t("close"));
    $("#toc-tools").innerHTML = `
      <label class="search">${icon("search")}<input type="search" id="toc-q" placeholder="${esc(t("search"))}" value="${esc(tocState.q)}" autocomplete="off" aria-label="${esc(t("search"))}" /></label>
      <select id="toc-vol" aria-label="${esc(t("volumes"))}" ${tocState.q.trim() ? "disabled" : ""}>${volumesInUse().map((v) =>
        `<option value="${v}" ${tocState.vol === v ? "selected" : ""}>${esc(volumeName(v))}</option>`).join("")}</select>`;
    const listEl = $("#toc-list");
    renderList(listEl, tocState);
    $("#toc-q").addEventListener("input", (ev) => {
      tocState.q = ev.target.value; tocState.limit = PAGE;
      $("#toc-vol").disabled = !!tocState.q.trim();
      renderList(listEl, tocState);
    });
    $("#toc-q").addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      const hit = meta.entries.find((e) => String(e.n) === ev.target.value.trim());
      if (hit) location.hash = "#/read/" + hit.id;
    });
    $("#toc-vol").addEventListener("change", (ev) => { tocState.vol = +ev.target.value; tocState.limit = PAGE; renderList(listEl, tocState); listEl.scrollTop = 0; });
  }
  function openToc() {
    const cur = byId.get(currentId);
    if (cur) { tocState.vol = cur.v; tocState.q = ""; tocState.limit = PAGE; }
    renderToc();
    openPanel($("#toc"));
    const c = $("#toc-list .current");
    if (c) c.scrollIntoView({ block: "center" });
  }
  $("#toc-btn").addEventListener("click", openToc);
  app.addEventListener("click", (ev) => { if (ev.target.closest("[data-open-toc]")) openToc(); });
  $("#toc-list").addEventListener("click", (ev) => { if (ev.target.closest("a")) closePanels(true); });

  // Language
  $("#lang-switch").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-lang]");
    if (!b || b.disabled) return;
    settings.lang = b.dataset.lang;
    saveSettings();
    if (reading()) renderReader(currentId); else renderLibrary();
  });

  // Keyboard
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && anyPanelOpen()) { closePanels(); return; }
    if (ev.target.matches("input, textarea, select") || ev.altKey || ev.ctrlKey || ev.metaKey || anyPanelOpen()) return;
    if (reading()) {
      const rel = ev.key === "ArrowLeft" ? "prev" : ev.key === "ArrowRight" ? "next" : null;
      const a = rel && $(`a[rel="${rel}"]:not(.disabled)`);
      if (a) { location.hash = a.getAttribute("href"); return; }
      if (ev.key === "t" || ev.key === "T") { ev.preventDefault(); openToc(); }
    } else if (ev.key === "/") {
      const q = $("#q");
      if (q) { ev.preventDefault(); q.focus(); }
    }
  });

  // ---------- router ----------
  function route() {
    closePanels(true);
    const m = location.hash.match(/^#\/read\/(\d+)/);
    if (m) {
      renderReader(parseInt(m[1], 10));
    } else {
      currentId = null;
      setChrome(true);
      renderLibrary();
      window.scrollTo(0, 0);
    }
  }
  window.addEventListener("hashchange", route);

  // ---------- boot ----------
  applySettings();
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applySettings);
  }
  source.index().then((m) => {
    meta = m;
    byId = new Map(meta.entries.map((e) => [e.id, e]));
    if (!meta.langs[settings.lang]) settings.lang = "en";
    route();
  }).catch((err) => {
    app.innerHTML = `<p class="status">Couldn’t load the book: ${esc(err.message)}</p>`;
  });
})();
