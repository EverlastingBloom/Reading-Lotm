"""Build the reader's data from the EPUB plus any translations.

Usage:
  python tools/build.py                      # writes data/ and img/
  python tools/build.py --export 200-300 DIR # dump English chapters as .md for translating

Translation files live in translations/<lang>/NNNN.md (NNNN = chapter number):
  # Bab 200: Judul
  Paragraph one, with *italics* and **bold**.

  Paragraph two.
  ---                       (scene break)
  [note] Footnote text      (footnote)
  [img file31.webp | Caption]
"""
import html
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
IMG = ROOT / "img"
TRANS = ROOT / "translations"
LANG_NAMES = {"en": "English", "id": "Bahasa Indonesia"}


def find_epub():
    epubs = sorted(ROOT.glob("*.epub"))
    if not epubs:
        sys.exit("No .epub found in " + str(ROOT))
    return epubs[0]


def spine(z):
    opf = z.read("EPUB/content.opf").decode("utf-8")
    items = dict(re.findall(r'<item id="([^"]+)" href="([^"]+)"', opf))
    for idref in re.findall(r'<itemref idref="([^"]+)"', opf):
        href = items[idref]
        if href.startswith("text/ch"):
            yield "EPUB/" + href


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def clean_body(raw, images):
    body = re.search(r"<body[^>]*>(.*)</body>", raw, re.S).group(1)
    # Drop the "Read Comments / Discord" footer and its separator.
    body = re.sub(r"<hr />\s*<ul>\s*<li><a href=\"https://github.com/Bittu5134.*?</ul>", "", body, flags=re.S)
    body = re.sub(r"<h[12][^>]*>.*?</h[12]>", "", body, count=1, flags=re.S)
    body = re.sub(r"<h[12] class=\"epub-invis\">.*?</h[12]>", "", body, flags=re.S)
    body = re.sub(r"</?section[^>]*>", lambda m: "" if "footnotes" not in m.group(0) else '<div class="footnotes">', body)
    body = body.replace("</div>", "")  # sections were the only closers we turned into divs
    if '<div class="footnotes">' in body:
        body += "</div>"
    body = re.sub(r'\s(epub:type|role|aria-hidden|fetchpriority)="[^"]*"', "", body)

    def img(m):
        name = m.group(1)
        images.add(name)
        return f'src="img/{name}" loading="lazy"'

    body = re.sub(r'src="\.\./media/([^"]+)"', img, body)
    body = re.sub(r"\n{2,}", "\n", body).strip()
    return body


def html_to_md(body):
    out = []
    for m in re.finditer(r"<hr\s*/>|<(p|figure|aside)\b[^>]*>(.*?)</\1>", body, re.S):
        tag, inner = m.group(1) or "hr", m.group(2)
        if tag == "hr":
            out.append("---")
        elif tag == "figure":
            src = re.search(r'src="img/([^"]+)"', inner)
            cap = re.search(r"<figcaption>(.*?)</figcaption>", inner, re.S)
            out.append(f"[img {src.group(1)} | {strip_tags(cap.group(1)) if cap else ''}]")
        elif tag == "aside":
            out.append("[note] " + inline_to_md(re.sub(r"</?p>", "", inner).strip()))
        else:
            if "<img" in inner:
                src = re.search(r'src="img/([^"]+)"', inner)
                out.append(f"[img {src.group(1)} | ]")
            else:
                out.append(inline_to_md(inner))
    return "\n\n".join(out)


def inline_to_md(s):
    s = re.sub(r"</?strong>", "**", s)
    s = re.sub(r"</?em>", "*", s)
    return strip_tags(s)


def md_inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\*(.+?)\*", r"<em>\1</em>", s)
    return s


def md_to_html(text):
    lines = [l.strip() for l in text.strip().splitlines()]
    title = lines[0].lstrip("# ").strip() if lines and lines[0].startswith("#") else None
    if title:
        lines = lines[1:]
    paras, notes = [], []
    for l in lines:
        if not l:
            continue
        if l == "---":
            paras.append("<hr />")
        elif l.startswith("[note]"):
            notes.append(f"<aside><p>{md_inline(l[6:].strip())}</p></aside>")
        elif l.startswith("[img "):
            name, _, cap = l[5:-1].partition("|")
            cap = cap.strip()
            fig = f'<img src="img/{name.strip()}" loading="lazy" alt="{html.escape(cap)}" />'
            paras.append(f"<figure>{fig}<figcaption>{md_inline(cap)}</figcaption></figure>" if cap else f"<p>{fig}</p>")
        else:
            paras.append(f"<p>{md_inline(l)}</p>")
    body = "\n".join(paras)
    if notes:
        body += '\n<div class="footnotes"><hr />' + "".join(notes) + "</div>"
    return title, body


def main():
    z = zipfile.ZipFile(find_epub())
    entries, bodies, images = [], {}, set()
    volume = 0
    for i, path in enumerate(spine(z), start=1):
        raw = z.read(path).decode("utf-8")
        h = re.search(r"<h([123])([^>]*)>(.*?)</h\1>", raw, re.S)
        title = strip_tags(h.group(3)) if h else f"Section {i}"
        part_page = h and h.group(1) == "1" and "epub-invis" in h.group(2) and re.match(r"Volume|Side Stories", title)
        num = re.match(r"Chapter (\d+)", title)
        if part_page:
            volume += 1
            kind = "v"
        elif num:
            kind = "c"
        else:
            kind = "x"
        e = {"id": i, "k": kind, "t": {"en": title}, "v": volume}
        if num:
            e["n"] = int(num.group(1))
        entries.append(e)
        bodies[i] = clean_body(raw, images)

    if "--export" in sys.argv:
        a, b = map(int, sys.argv[sys.argv.index("--export") + 1].split("-"))
        out = Path(sys.argv[sys.argv.index("--export") + 2])
        out.mkdir(parents=True, exist_ok=True)
        for e in entries:
            if e["k"] == "c" and a <= e["n"] <= b:
                (out / f"{e['n']:04d}.md").write_text(f"# {e['t']['en']}\n\n{html_to_md(bodies[e['id']])}\n", encoding="utf-8")
        print("exported to", out)
        return

    by_num = {e["n"]: e for e in entries if "n" in e}
    translated = {}
    for lang_dir in sorted(p for p in TRANS.glob("*") if p.is_dir()):
        lang = lang_dir.name
        for f in sorted(lang_dir.glob("*.md")):
            e = by_num.get(int(f.stem))
            if not e:
                continue
            title, body = md_to_html(f.read_text(encoding="utf-8"))
            e["t"][lang] = title or e["t"]["en"]
            translated.setdefault(lang, {})[e["id"]] = body

    if DATA.exists():
        shutil.rmtree(DATA)
    (DATA / "en").mkdir(parents=True)
    for i, body in bodies.items():
        (DATA / "en" / f"{i}.html").write_text(body, encoding="utf-8")
    for lang, items in translated.items():
        (DATA / lang).mkdir(exist_ok=True)
        for i, body in items.items():
            (DATA / lang / f"{i}.html").write_text(body, encoding="utf-8")

    volumes = [e["t"]["en"] for e in entries if e["k"] == "v"]
    covers = [(re.search(r'src="(img/[^"]+)"', bodies[e["id"]]) or [None, None])[1] for e in entries if e["k"] == "v"]
    opf = z.read("EPUB/content.opf").decode("utf-8")
    desc = re.search(r"<dc:description>(.*?)</dc:description>", opf, re.S)
    cover = re.search(r'<item properties="cover-image"[^>]*href="media/([^"]+)"', opf)
    if cover:
        images.add(cover.group(1))
    meta = {
        "title": "Lord of the Mysteries",
        "author": "Cuttlefish That Loves Diving",
        "description": html.unescape(desc.group(1)).strip() if desc else "",
        "cover": "img/" + cover.group(1) if cover else None,
        "langs": {l: LANG_NAMES.get(l, l) for l in ["en", *translated]},
        "volumes": volumes,
        "volumeCovers": covers,
        "entries": entries,
    }
    (DATA / "index.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    IMG.mkdir(exist_ok=True)
    for name in images:
        target = IMG / name
        if not target.exists():
            target.write_bytes(z.read("EPUB/media/" + name))

    chapters = sum(e["k"] == "c" for e in entries)
    print(f"{len(entries)} entries ({chapters} chapters, {len(volumes)} parts), {len(images)} images")
    for lang, items in translated.items():
        print(f"  {lang}: {len(items)} translated")


if __name__ == "__main__":
    main()
