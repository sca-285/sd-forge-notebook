"""Rich-text notes: stored as small HTML documents, edited as an HTML fragment.

Everything that comes in (the editor, an imported file, a file edited
elsewhere) goes through `sanitize`, which keeps only formatting: a fixed
set of tags, attributes and CSS properties. Scripts, event handlers,
iframes, images with remote sources and javascript: links are dropped.
"""

from __future__ import annotations

import html
import re
from html.parser import HTMLParser

ALLOWED_TAGS = {
    "p", "div", "br", "span", "b", "strong", "i", "em", "u", "s", "strike", "del", "sub", "sup",
    "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "a", "font", "hr", "mark", "img",
    "svg", "path", "g",
}
VOID_TAGS = {"br", "hr", "col", "img"}
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "noscript", "template", "math",
                     "head", "title", "textarea", "select", "button", "canvas", "video", "audio",
                     "foreignobject", "use", "animate", "set", "handler", "script"}
ALLOWED_ATTRS = {
    "*": {"style"},
    "a": {"href", "title"},
    "img": {"src", "alt", "title", "width", "height"},
    "font": {"face", "size", "color"},
    "td": {"colspan", "rowspan", "align", "valign"},
    "th": {"colspan", "rowspan", "align", "valign"},
    "table": {"border", "cellpadding", "cellspacing"},
    "p": {"align"}, "div": {"align", "lang", "data-nb-sheet", "data-nb-params", "data-nb-canvas"},
    "h1": {"align"}, "h2": {"align"}, "h3": {"align"},
    "ol": {"start", "type"}, "ul": {"type", "data-nb-checklist"}, "li": {"data-checked"}, "col": {"span"},
    "svg": {"viewbox", "width", "height", "xmlns", "preserveaspectratio", "data-nb-ink"},
    "path": {"d", "stroke", "fill", "opacity", "stroke-width", "stroke-linecap", "stroke-linejoin", "data-brush"},
    "g": {"opacity"},
}
ALLOWED_CSS = {
    "color", "background-color", "background", "font-family", "font-size", "font-weight", "font-style",
    "text-decoration", "text-decoration-line", "text-align", "vertical-align", "line-height",
    "border", "border-top", "border-right", "border-bottom", "border-left", "border-color", "border-style",
    "border-width", "border-collapse", "border-spacing", "padding", "padding-left", "padding-right",
    "padding-top", "padding-bottom", "margin-left", "margin-top", "margin-bottom", "width", "min-width", "height", "text-transform",
    "list-style-type", "white-space", "writing-mode", "table-layout",
    "column-count", "column-gap", "column-width", "column-rule", "column-rule-width",
    "column-rule-style", "column-rule-color", "hyphens", "-webkit-hyphens",
    "overflow-wrap", "word-break", "max-width",
} | {f"border-{side}-{part}" for side in ("top", "right", "bottom", "left") for part in ("width", "style", "color")}
_BAD_CSS_VALUE = re.compile(r"url\s*\(|expression\s*\(|javascript:|@import|\\", re.I)
_SAFE_HREF = re.compile(r"^(https?:|mailto:|#)", re.I)
_SAFE_SRC = re.compile(r"^(https?:|data:image/(?:png|jpe?g|gif|webp);base64,|/notebook/api/asset/[A-Za-z0-9._-]+$)", re.I)


def _clean_style(style: str) -> str:
    kept = []
    for part in style.split(";"):
        if ":" not in part:
            continue
        name, value = part.split(":", 1)
        name, value = name.strip().lower(), value.strip()
        if name in ALLOWED_CSS and value and not _BAD_CSS_VALUE.search(value) and len(value) < 200:
            kept.append(f"{name}: {value}")
    return "; ".join(kept)


class _Sanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.open = []          # allowed tags currently open
        self.skip = 0           # inside a tag dropped with its content

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if self.skip:
            if tag in DROP_WITH_CONTENT:
                self.skip += 1
            return
        if tag in DROP_WITH_CONTENT:
            self.skip = 1
            return
        if tag not in ALLOWED_TAGS:
            return
        allowed = ALLOWED_ATTRS.get(tag, set()) | ALLOWED_ATTRS["*"]
        parts = []
        for name, value in attrs:
            name = (name or "").lower()
            if name not in allowed or value is None:
                continue
            if name == "style":
                value = _clean_style(value)
                if not value:
                    continue
            elif name == "href":
                value = value.strip()
                if not _SAFE_HREF.match(value):
                    continue
            elif name == "src":
                value = value.strip()
                if not _SAFE_SRC.match(value):
                    continue
            elif name in ("colspan", "rowspan", "span", "start", "size", "border", "cellpadding", "cellspacing"):
                if not re.fullmatch(r"\d{1,3}", value.strip()):
                    continue
            elif name in ("width", "height") and tag != "svg" and not re.fullmatch(r"\d{1,4}(px)?", value.strip()):
                continue
            elif name in ("stroke", "fill") and not re.fullmatch(r"#?[0-9a-zA-Z]+|none|rgb\([\d\s,.%]+\)", value.strip()):
                continue
            elif name in ("d", "viewbox") and len(value) > 400000:
                continue
            elif name not in ("src", "d", "viewbox") and len(value) > 200:
                continue
            parts.append(f' {name}="{html.escape(value, quote=True)}"')
        if tag == "a" and not any(p.startswith(' href="#') for p in parts):
            parts.append(' target="_blank" rel="noopener noreferrer"')
        if tag == "img" and not any(p.startswith(" src=") for p in parts):
            return
        self.out.append(f"<{tag}{''.join(parts)}>")
        if tag not in VOID_TAGS:
            self.open.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        tag = tag.lower()
        if tag not in VOID_TAGS and self.open and self.open[-1] == tag and not self.skip:
            self.open.pop()
            self.out.append(f"</{tag}>")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.skip:
            if tag in DROP_WITH_CONTENT:
                self.skip -= 1
            return
        if tag not in ALLOWED_TAGS or tag in VOID_TAGS or tag not in self.open:
            return
        while self.open:            # close anything left open inside it
            top = self.open.pop()
            self.out.append(f"</{top}>")
            if top == tag:
                break

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))

    def result(self):
        while self.open:
            self.out.append(f"</{self.open.pop()}>")
        return "".join(self.out)


def sanitize(fragment: str) -> str:
    parser = _Sanitizer()
    parser.feed(str(fragment or ""))
    parser.close()
    return parser.result()


# --------------------------------------------------------------------- the file

_BODY = re.compile(r"<body[^>]*>(.*)</body\s*>", re.I | re.S)
_STYLE = ("body { position: relative; box-sizing: border-box; max-width: 820px; margin: 2em auto; padding: 28px 36px;"
          " font-family: Segoe UI, Arial, sans-serif; font-size: 11pt; line-height: 1.5; }\n"
          "p { margin: 0 0 0.35em; }\n"
          "table { border-collapse: collapse; }\n"
          "td, th { border: 1px solid #888; padding: 4px 8px; vertical-align: top; }\n"
          "img { max-width: 100%; height: auto; }\n"
          "hr { border: 0; border-top: 1px solid #c9ccd1; }\n"
          "pre { padding: 8px 10px; white-space: pre-wrap; background: #f5f6f8; border-radius: 4px; }\n"
          "svg[data-nb-ink] { position: absolute; left: 36px; top: 28px; width: 1px; height: 1px; overflow: visible; }\n"
          "[data-nb-canvas] { position: relative; margin: 0.5em 0; }\n"
          "[data-nb-canvas] > svg[data-nb-ink] { left: 0; top: 0; }\n"
          "[data-nb-params] { display: flex; gap: 12px; margin: 0.5em 0; padding: 10px; background: #f8f9fb; border: 1px solid #d7dbe0; border-radius: 8px; }\n"
          "[data-nb-params] img { flex-shrink: 0; align-self: flex-start; width: 160px; border-radius: 6px; }\n"
          "[data-nb-params] pre { flex: 1; margin: 0; padding: 0; font-size: 9.5pt; background: none; }\n"
          "ul[data-nb-checklist] { padding-left: 1.6em; list-style: none; }\n"
          "ul[data-nb-checklist] > li::before { content: '\\2610'; margin: 0 0.4em 0 -1.4em; }\n"
          "ul[data-nb-checklist] > li[data-checked=true]::before { content: '\\2611'; }\n"
          "ul[data-nb-checklist] > li[data-checked=true] { color: #6b7280; text-decoration: line-through; }")


def to_document(fragment: str, title: str = "") -> str:
    """A complete HTML file that browsers and Word open as it looks in the editor."""
    return ("<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n"
            f"<title>{html.escape(title)}</title>\n<style>\n{_STYLE}\n</style>\n</head>\n<body>\n"
            f"{sanitize(fragment)}\n</body>\n</html>\n")


def from_document(text: str) -> str:
    """The editable fragment of an HTML file (the whole text when it has no <body>)."""
    match = _BODY.search(text or "")
    return sanitize((match.group(1) if match else text or "").strip())


def from_text(text: str) -> str:
    """Plain text as paragraphs, one per line; blank lines kept."""
    lines = str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return "".join(f"<p>{html.escape(line) if line else '<br>'}</p>" for line in lines) or "<p><br></p>"


class _Text(HTMLParser):
    BLOCKS = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "tr", "table", "ul", "ol", "hr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.lists = []           # ["ul"] / ["ol", n] / ["check"]
        self.cell = 0
        self.pre = 0

    def _newline(self):
        if self.out and not self.out[-1].endswith("\n"):
            self.out.append("\n")

    def handle_starttag(self, tag, attrs):
        if tag in self.BLOCKS:
            self._newline()
        values = {(n or "").lower(): v for n, v in attrs}
        if tag == "pre":
            self.pre += 1
        if tag in ("ul", "ol"):
            self.lists.append(["check" if "data-nb-checklist" in values else tag, 0])
        elif tag == "li":
            self._newline()
            depth = max(0, len(self.lists) - 1)
            if self.lists and self.lists[-1][0] == "ol":
                self.lists[-1][1] += 1
                self.out.append("  " * depth + f"{self.lists[-1][1]}. ")
            elif self.lists and self.lists[-1][0] == "check":
                self.out.append("  " * depth + ("[x] " if values.get("data-checked") == "true" else "[ ] "))
            else:
                self.out.append("  " * depth + "- ")
        elif tag == "br":
            self.out.append("\n")
        elif tag == "img":
            alt = next((v for n, v in attrs if (n or "").lower() == "alt" and v), "") or "[image]"
            self.out.append(alt)
        elif tag == "tr":
            self.cell = 0
        elif tag in ("td", "th"):
            if self.cell:
                self.out.append("\t")
            self.cell += 1

    def handle_endtag(self, tag):
        if tag == "pre":
            self.pre = max(0, self.pre - 1)
        if tag in ("ul", "ol") and self.lists:
            self.lists.pop()
        if tag in self.BLOCKS or tag == "li":
            self._newline()

    def handle_data(self, data):
        if self.pre:
            self.out.append(data)
            return
        self.out.append(data.replace("\n", " ") if data.strip() or not self.out else data.replace("\n", ""))


def to_text(fragment: str) -> str:
    """Plain text of a fragment: blocks on their own lines, list markers, table cells tab-separated."""
    parser = _Text()
    parser.feed(str(fragment or ""))
    parser.close()
    text = "".join(parser.out)
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip("\n") + "\n"
