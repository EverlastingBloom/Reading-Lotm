# Lord of the Mysteries — Web Reader

A simple static reader for *Lord of the Mysteries*, built from the EPUB, with a Bahasa Indonesia translation in progress.

- English: all 1,430 chapters
- Bahasa Indonesia: chapters 200–253 (more coming)

## Read it

Open the GitHub Pages site, or run it locally:

```bash
python -m http.server 8765
```

Then open http://localhost:8765.

Features: chapter list grouped by volume, search by number or title, EN/ID switch, light/sepia/dark themes, font size and width, keyboard ←/→ navigation, and it remembers where you stopped (per browser).

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `app.js`, `style.css` | The reader (no build step, no dependencies) |
| `config.js` | Supabase settings; leave empty to read `data/` directly |
| `data/` | Generated chapter HTML + `index.json` (do not edit by hand) |
| `img/` | Illustrations extracted from the EPUB |
| `translations/id/NNNN.md` | Indonesian translations, one file per chapter number |
| `translations/glossary-id.txt` | Terms kept consistent across the translation |
| `tools/build.py` | Rebuilds `data/` and `img/` from the EPUB + translations |
| `tools/upload.mjs` | Uploads `data/` to Supabase |
| `supabase/schema.sql` | Table + read-only policy for Supabase |

## Adding or editing a translation

1. Put the EPUB in the project folder (it is git-ignored).
2. Export English chapters to translate, e.g. `python tools/build.py --export 254-300 work/`.
3. Write `translations/id/0254.md` in the same format:
   - first line `# Bab 254: Judul`
   - paragraphs separated by a blank line, `*italic*`, `**bold**`
   - `---` for a scene break, `[note] text` for a footnote, `[img fileNN.webp | caption]` for an image
4. Run `python tools/build.py` and commit `translations/` and `data/`.

## Using Supabase (optional)

The site works on GitHub Pages without Supabase. To serve chapters from Supabase instead:

1. In the Supabase SQL editor, run `supabase/schema.sql`.
2. Upload the data (needs Node 18+ and the **service_role** key — keep it secret):
   ```bash
   SUPABASE_URL=https://YOURPROJECT.supabase.co SUPABASE_SERVICE_KEY=... node tools/upload.mjs
   ```
   Pass a language to upload only that one, e.g. `node tools/upload.mjs id`.
3. Put the project URL and the **anon** key into `config.js` and push.
