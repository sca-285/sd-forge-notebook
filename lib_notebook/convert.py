"""Turning a Markdown note into a rich-text note, and back.

Markdown -> rich text: the rendered page, with checklists, parameter
blocks and links between notes kept as the rich editor has them.

Rich text -> Markdown: headings, paragraphs, bold / italic / strikethrough,
code, links, pictures, lists and checklists, quotes, lines, tables and
parameter blocks. What Markdown has no way to write (colours, fonts, sizes,
alignment, borders, drawings) is left out.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser

from lib_notebook import rich
from lib_notebook.render import render

_TASK_ITEM = re.compile(r'<li( [^>]*)? class="task">(<p[^>]*>)?<input type="checkbox" class="nb-task"( checked)?> ?')
_PARAMS = re.compile(r'<pre[^>]*><code class="language-params">(.*?)</code></pre>', re.S)
_NOTE_LINK = re.compile(r'<a href="#note:([^"]*)" class="nb-note-link"[^>]*>')


def md_to_rich(text: str) -> str:
    out = render(text, ".md")
    out = re.sub(r' data-line="\d+"', "", out)
    out = _PARAMS.sub(lambda m: f'<div data-nb-params=""><pre>{m.group(1).rstrip()}</pre></div>', out)
    # a picture just above a parameter block goes into it
    out = re.sub(r'<p><img ([^>]*?) ?/?></p>\s*<div data-nb-params="">', r'<div data-nb-params=""><img \1>', out)
    out = _TASK_ITEM.sub(lambda m: f'<li data-checked="{"true" if m.group(3) else "false"}">{m.group(2) or ""}', out)
    # a list whose items are all tasks becomes a checklist
    out = re.sub(r'<ul>(\s*<li data-checked=)', r'<ul data-nb-checklist="">\1', out)
    out = _NOTE_LINK.sub(lambda m: f'<a href="#note:{m.group(1)}">', out)
    return rich.sanitize(out) or "<p><br></p>"


class _Markdown(HTMLParser):
    BLOCKS = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "table", "ul", "ol", "hr", "li"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines = []          # finished lines
        self.line = []           # the line being written
        self.lists = []          # [kind, counter]
        self.quote = 0
        self.pre = 0
        self.params = 0
        self.skip = 0            # inside a drawing
        self.link = []
        self.table = None        # rows of cells while in a table
        self.cell = None

    # ---- output
    def text(self, s):
        if self.skip:
            return
        if self.cell is not None:
            self.cell.append(s)
        else:
            self.line.append(s)

    def flush(self, blank=False):
        line = "".join(self.line).rstrip()
        self.line = []
        prefix = "> " * self.quote
        if line or self.pre:
            self.lines.extend(prefix + part if not self.pre else part for part in line.split("\n"))
        if blank and self.lines and self.lines[-1] != "":
            self.lines.append("")

    # ---- parsing
    def handle_starttag(self, tag, attrs):
        a = {(n or "").lower(): v or "" for n, v in attrs}
        if tag == "svg":
            self.skip += 1
        if self.skip:
            return
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.flush(True)
            self.text("#" * int(tag[1]) + " ")
        elif tag in ("p", "div") and self.cell is None:
            if "data-nb-params" in a:
                self.flush(True)
                self.params += 1
            elif not self.lists:
                self.flush(True)
        elif tag == "br":
            if self.pre:
                self.text("\n")
            elif self.cell is not None:
                self.text(" ")
            else:
                self.text("  ")
                self.flush()
        elif tag in ("b", "strong"):
            self.text("**")
        elif tag in ("i", "em"):
            self.text("*")
        elif tag in ("s", "strike", "del"):
            self.text("~~")
        elif tag == "code" and not self.pre:
            self.text("`")
        elif tag == "pre":
            self.flush(True)
            self.pre += 1
            self.lines.append("```params" if self.params else "```")
        elif tag == "a":
            href = a.get("href", "")
            if href.startswith("#note:"):
                self.text("[[")
                self.link.append("]]")
            else:
                self.text("[")
                self.link.append(f"]({href})")
        elif tag == "img":
            alt = a.get("alt", "").replace("]", "")
            if a.get("src") and not a["src"].startswith("data:"):
                self.text(f"![{alt}]({a['src']})")
                if self.params:
                    self.flush(True)
        elif tag in ("ul", "ol"):
            if not self.lists:
                self.flush(True)
            else:
                self.flush()
            self.lists.append(["check" if "data-nb-checklist" in a else tag, 0])
        elif tag == "li":
            self.flush()
            depth = "   " * (len(self.lists) - 1)
            kind = self.lists[-1] if self.lists else ["ul", 0]
            if kind[0] == "ol":
                kind[1] += 1
                self.text(f"{depth}{kind[1]}. ")
            elif kind[0] == "check":
                self.text(f"{depth}- [{'x' if a.get('data-checked') == 'true' else ' '}] ")
            else:
                self.text(f"{depth}- ")
        elif tag == "blockquote":
            self.flush(True)
            self.quote += 1
        elif tag == "hr":
            self.flush(True)
            self.lines.extend(["---", ""])
        elif tag == "table":
            self.flush(True)
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.table.append([])
        elif tag in ("td", "th") and self.table is not None:
            self.cell = []

    def handle_endtag(self, tag):
        if tag == "svg":
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6", "p"):
            if self.cell is None:
                self.flush(not self.lists)
        elif tag == "div" and self.params:
            self.params -= 1
            self.flush(True)
        elif tag in ("b", "strong"):
            self.text("**")
        elif tag in ("i", "em"):
            self.text("*")
        elif tag in ("s", "strike", "del"):
            self.text("~~")
        elif tag == "code" and not self.pre:
            self.text("`")
        elif tag == "pre":
            self.flush()
            self.pre = max(0, self.pre - 1)
            self.lines.extend(["```", ""])
        elif tag == "a" and self.link:
            self.text(self.link.pop())
        elif tag == "li":
            self.flush()
        elif tag in ("ul", "ol") and self.lists:
            self.lists.pop()
            self.flush(not self.lists)
        elif tag == "blockquote":
            self.flush(True)
            self.quote = max(0, self.quote - 1)
        elif tag in ("td", "th") and self.cell is not None:
            cell = re.sub(r"\s+", " ", "".join(self.cell)).strip().replace("|", "\\|")
            if self.table:
                self.table[-1].append(cell)
            self.cell = None
        elif tag == "table" and self.table is not None:
            rows = [r for r in self.table if r]
            self.table = None
            if rows:
                width = max(len(r) for r in rows)
                rows = [r + [""] * (width - len(r)) for r in rows]
                self.lines.append("| " + " | ".join(rows[0]) + " |")
                self.lines.append("|" + "---|" * width)
                self.lines.extend("| " + " | ".join(r) + " |" for r in rows[1:])
                self.lines.append("")

    def handle_data(self, data):
        if self.pre:
            self.text(data)
        elif data.strip() or (self.line and not self.line[-1].endswith(" ")):
            self.text(re.sub(r"\s+", " ", data))

    def result(self):
        self.flush()
        text = "\n".join(self.lines).strip("\n")
        return re.sub(r"\n{3,}", "\n\n", text) + "\n"


def rich_to_md(fragment: str) -> str:
    parser = _Markdown()
    parser.feed(rich.sanitize(fragment))
    parser.close()
    return parser.result()
