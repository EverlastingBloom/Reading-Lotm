(() => {
  "use strict";

  const cfg = window.LOTM_CONFIG || {};
  const LANG_NAMES = { en: "English", id: "Bahasa Indonesia" };
  const LANG_SHORT = { en: "EN", id: "ID" };
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");

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
  const settings = Object.assign({ theme: "auto", font: "serif", size: 19, width: "normal", lang: "en" }, store.get("settings", {}));
  const progress = Object.assign({ last: null, scroll: 0, read: [] }, store.get("progress", {}));
  const readSet = new Set(progress.read);

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
        const page = await this.get("chapters?select=id,lang,kind,num,volume,title&order=id,lang", from, from + 999);
        rows.push(...page);
        if (page.length < 1000) break;
      }
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
      return {
        title: "Lord of the Mysteries",
        langs: Object.fromEntries([...langs].sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b))).map((l) => [l, LANG_NAMES[l] || l])),
        volumes: entries.filter((e) => e.k === "v").map((e) => e.t.en),
        entries,
      };
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
  const shownLang = (e) => (has(e, settings.lang) ? settings.lang : "en");
  const fullTitle = (e, lang = shownLang(e)) => e.t[lang] || e.t.en;
  const shortTitle = (e) => fullTitle(e).replace(/^(Chapter|Bab)\s+\d+\s*:\s*/i, "");
  const volumeName = (v) => (v === 0 ? "Front matter" : meta.volumes[v - 1] || "Part " + v);

  function saveSettings() { store.set("settings", settings); }
  function saveProgress() { progress.read = [...readSet]; store.set("progress", progress); }

  function applySettings() {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.font;
    root.dataset.width = settings.width;
    root.style.setProperty("--reader-size", settings.size + "px");
    $("#size-val").textContent = settings.size + "px";
    document.querySelectorAll("#settings [data-setting]").forEach((seg) => {
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", settings[seg.dataset.setting] === b.dataset.v));
    });
  }

  function renderLangSwitch(entry) {
    const el = $("#lang-switch");
    const langs = Object.keys(meta.langs);
    if (langs.length < 2) { el.innerHTML = ""; return; }
    el.innerHTML = langs.map((l) => {
      const avail = !entry || has(entry, l);
      const on = entry ? shownLang(entry) === l : settings.lang === l;
      return `<button data-lang="${l}" class="${on ? "on" : ""}" ${avail ? "" : "disabled"} title="${esc(meta.langs[l])}${avail ? "" : " (not translated yet)"}">${LANG_SHORT[l] || l.toUpperCase()}</button>`;
    }).join("");
  }

  // ---------- home ----------
  let homeState = { q: "", onlyTranslated: false };

  function renderHome() {
    document.title = meta.title;
    renderLangSwitch(null);
    $("#bar").classList.remove("hide");
    $("#progress").style.width = "0";
    const last = progress.last != null ? byId.get(progress.last) : null;
    const first = meta.entries.find((e) => e.k === "c");
    const otherLangs = Object.keys(meta.langs).filter((l) => l !== "en");
    const translatedCount = meta.entries.filter((e) => otherLangs.some((l) => has(e, l))).length;
    const firstTranslated = meta.entries.find((e) => e.k === "c" && has(e, settings.lang) && settings.lang !== "en");
    const chapters = meta.entries.filter((e) => e.k === "c").length;

    app.innerHTML = `
      <div class="home">
        <section class="hero">
          <h1>${esc(meta.title)}</h1>
          <p>${chapters.toLocaleString()} chapters${translatedCount ? ` · ${translatedCount} translated to ${otherLangs.map((l) => meta.langs[l]).join(", ")}` : ""}</p>
          <div class="actions">
            ${last ? `<a class="btn primary" href="#/read/${last.id}">Continue · ${esc(last.n ? (settings.lang === "id" ? "Bab " : "Chapter ") + last.n : shortTitle(last))}</a>` : ""}
            <a class="btn ${last ? "" : "primary"}" href="#/read/${first.id}">Start from Chapter 1</a>
            ${firstTranslated ? `<a class="btn" href="#/read/${firstTranslated.id}">Mulai Bab ${firstTranslated.n} (Indonesia)</a>` : ""}
          </div>
        </section>
        <div class="tools">
          <input type="search" id="q" placeholder="Chapter number or title…" value="${esc(homeState.q)}" autocomplete="off" />
          ${translatedCount ? `<label><input type="checkbox" id="only-tr" ${homeState.onlyTranslated ? "checked" : ""}/> Translated only</label>` : ""}
        </div>
        <div id="toc"></div>
      </div>`;

    $("#q").addEventListener("input", (ev) => { homeState.q = ev.target.value; renderToc(); });
    $("#q").addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      const n = parseInt(ev.target.value, 10);
      const hit = meta.entries.find((e) => e.n === n);
      if (hit) location.hash = "#/read/" + hit.id;
    });
    const only = $("#only-tr");
    if (only) only.addEventListener("change", (ev) => { homeState.onlyTranslated = ev.target.checked; renderToc(); });
    renderToc();
  }

  function renderToc() {
    const q = homeState.q.trim().toLowerCase();
    const num = /^\d+$/.test(q) ? parseInt(q, 10) : null;
    const otherLangs = Object.keys(meta.langs).filter((l) => l !== "en");
    const match = (e) => {
      if (homeState.onlyTranslated && !otherLangs.some((l) => has(e, l))) return false;
      if (!q) return true;
      if (num != null) return e.n != null && String(e.n).startsWith(q);
      return Object.values(e.t).some((t) => t.toLowerCase().includes(q));
    };
    const filtering = q || homeState.onlyTranslated;
    const lastV = progress.last != null && byId.get(progress.last) ? byId.get(progress.last).v : 1;

    const groups = new Map();
    for (const e of meta.entries) {
      if (e.k === "v" && !filtering) continue;
      if (!match(e)) continue;
      if (!groups.has(e.v)) groups.set(e.v, []);
      groups.get(e.v).push(e);
    }
    if (!groups.size) { $("#toc").innerHTML = `<p class="empty">Nothing matches “${esc(homeState.q)}”.</p>`; return; }

    let html = "";
    for (const [v, list] of groups) {
      const open = filtering || v === lastV;
      const items = list.map((e) => {
        const badges = otherLangs.filter((l) => has(e, l)).map((l) => `<span class="badge">${LANG_SHORT[l] || l.toUpperCase()}</span>`).join(" ");
        const cls = [e.id === progress.last ? "current" : "", readSet.has(e.id) ? "read" : ""].join(" ").trim();
        return `<li><a href="#/read/${e.id}" class="${cls}"><span class="n">${e.n ?? ""}</span><span class="t">${esc(shortTitle(e))}</span>${badges}</a></li>`;
      }).join("");
      html += `<details class="vol" ${open ? "open" : ""}><summary><span>${esc(volumeName(v))}</span><span class="count">${list.length}</span></summary><ul class="list">${items}</ul></details>`;
    }
    $("#toc").innerHTML = html;
    if (!filtering) {
      const cur = $("#toc a.current");
      if (cur) cur.scrollIntoView({ block: "center" });
    }
  }

  // ---------- reader ----------
  let currentId = null;
  let renderToken = 0;

  async function renderReader(id) {
    const entry = byId.get(id);
    if (!entry) { app.innerHTML = `<p class="status">Chapter not found. <a href="#/">Back to the list</a></p>`; return; }
    const token = ++renderToken;
    const lang = shownLang(entry);
    const fresh = currentId !== id;
    currentId = id;
    renderLangSwitch(entry);
    if (fresh) app.innerHTML = `<p class="status">Loading…</p>`;

    let body;
    try { body = await loadChapter(id, lang); }
    catch (err) {
      if (token !== renderToken) return;
      app.innerHTML = `<p class="status">${esc(err.message)}. <a href="#/read/${id}">Try again</a></p>`;
      return;
    }
    if (token !== renderToken) return;

    const idx = meta.entries.indexOf(entry);
    const prev = meta.entries[idx - 1];
    const next = meta.entries[idx + 1];
    const kicker = entry.k === "c" ? volumeName(entry.v) : entry.k === "v" ? "" : volumeName(entry.v);
    const fallback = settings.lang !== "en" && lang === "en"
      ? `<p class="note">This chapter isn’t translated to ${esc(meta.langs[settings.lang] || settings.lang)} yet, so it’s shown in English.</p>` : "";
    const navHtml = `
      <nav class="nav">
        <a class="btn ${prev ? "" : "disabled"}" href="${prev ? "#/read/" + prev.id : "#/"}" rel="prev">← Prev</a>
        <a class="btn list-btn" href="#/" aria-label="Chapter list">☰</a>
        <a class="btn ${next ? "" : "disabled"}" href="${next ? "#/read/" + next.id : "#/"}" rel="next">Next →</a>
      </nav>`;

    document.title = fullTitle(entry) + " · " + meta.title;
    document.documentElement.lang = lang;
    app.innerHTML = `
      <article class="reader">
        <header class="chap-head">
          ${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ""}
          <h1>${esc(fullTitle(entry))}</h1>
          ${fallback}
        </header>
        ${navHtml}
        <div class="content">${body}</div>
        ${navHtml}
      </article>`;

    if (fresh) {
      const resume = progress.last === id && progress.scroll > 0 ? progress.scroll : 0;
      window.scrollTo(0, resume * (document.documentElement.scrollHeight - innerHeight));
    }
    progress.last = id;
    saveProgress();
    if (next) loadChapter(next.id, shownLang(next)).catch(() => {});
    onScroll();
  }

  // ---------- scroll: progress bar, hide bar, remember position ----------
  let lastY = 0, saveTimer = null;
  function onScroll() {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    const reading = currentId != null && location.hash.startsWith("#/read/");
    const frac = reading && max > 0 ? Math.min(1, y / max) : 0;
    $("#progress").style.width = reading ? frac * 100 + "%" : "0";
    if (reading && $("#settings").hidden) $("#bar").classList.toggle("hide", y > lastY && y > 120);
    lastY = y;
    if (!reading) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      progress.last = currentId;
      progress.scroll = frac;
      if (frac > 0.9) readSet.add(currentId);
      saveProgress();
    }, 250);
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ---------- router ----------
  function route() {
    const m = location.hash.match(/^#\/read\/(\d+)/);
    $("#settings").hidden = true;
    if (m) renderReader(parseInt(m[1], 10));
    else { currentId = null; renderHome(); window.scrollTo(0, 0); }
  }
  window.addEventListener("hashchange", route);

  // ---------- events ----------
  $("#settings-btn").addEventListener("click", (ev) => { ev.stopPropagation(); $("#settings").hidden = !$("#settings").hidden; });
  document.addEventListener("click", (ev) => {
    const panel = $("#settings");
    if (!panel.hidden && !panel.contains(ev.target)) panel.hidden = true;
  });
  $("#settings").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const seg = b.closest("[data-setting]");
    if (seg) settings[seg.dataset.setting] = b.dataset.v;
    if (b.id === "size-up") settings.size = Math.min(28, settings.size + 1);
    if (b.id === "size-down") settings.size = Math.max(14, settings.size - 1);
    applySettings();
    saveSettings();
  });
  $("#lang-switch").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-lang]");
    if (!b || b.disabled) return;
    settings.lang = b.dataset.lang;
    saveSettings();
    if (currentId != null) renderReader(currentId); else renderHome();
  });
  document.addEventListener("keydown", (ev) => {
    if (currentId == null || ev.target.matches("input, textarea") || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const rel = ev.key === "ArrowLeft" ? "prev" : ev.key === "ArrowRight" ? "next" : null;
    const a = rel && $(`a[rel="${rel}"]:not(.disabled)`);
    if (a) location.hash = a.getAttribute("href");
  });

  // ---------- boot ----------
  applySettings();
  source.index().then((m) => {
    meta = m;
    byId = new Map(meta.entries.map((e) => [e.id, e]));
    if (!meta.langs[settings.lang]) settings.lang = "en";
    route();
  }).catch((err) => {
    app.innerHTML = `<p class="status">Couldn’t load the book: ${esc(err.message)}</p>`;
  });
})();
