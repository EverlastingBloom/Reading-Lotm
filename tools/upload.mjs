// Upload data/ (built by tools/build.py) into the Supabase `chapters` table.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=... node tools/upload.mjs [lang ...]
//
// With no languages given, every language in data/index.json is uploaded.
// Re-running is safe: rows are upserted on (id, lang).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY (the service_role key, from Project Settings → API).");
  process.exit(1);
}

const meta = JSON.parse(await readFile(path.join(root, "data", "index.json"), "utf8"));
const langs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(meta.langs);

const rows = [];
for (const e of meta.entries) {
  for (const lang of langs) {
    if (e.t[lang] == null) continue;
    rows.push({
      id: e.id, lang, kind: e.k, num: e.n ?? null, volume: e.v, title: e.t[lang],
      content: await readFile(path.join(root, "data", lang, `${e.id}.html`), "utf8"),
    });
  }
}

// Book-level info (description, covers) rides along as a single "meta" row.
const info = { title: meta.title, author: meta.author, description: meta.description, cover: meta.cover, volumes: meta.volumes, volumeCovers: meta.volumeCovers };
rows.push({ id: 0, lang: "en", kind: "meta", num: null, volume: 0, title: "meta", content: JSON.stringify(info) });

const BATCH = 50;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const res = await fetch(`${url}/rest/v1/chapters?on_conflict=id,lang`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    console.error(`Batch at row ${i} failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  process.stdout.write(`\r${Math.min(i + BATCH, rows.length)} / ${rows.length} rows`);
}
console.log(`\nDone (${langs.join(", ")}).`);
