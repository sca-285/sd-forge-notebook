"""Markdown to HTML for the preview, with markdown-it-py (a Gradio dependency,
so every WebUI has it). Raw HTML in a note is shown as text, never run.

Block elements carry data-line="<first source line, 0-based>", so a click
on the rendered note can put the cursor on the matching line, and a click
on a task checkbox can tick it in the source. [[Note name]] links to
another note; a ```params block holds generation parameters.
"""

from __future__ import annotations

import html
import re

try:
    from markdown_it import MarkdownIt
    _MD = MarkdownIt("commonmark", {"html": False, "breaks": True, "linkify": False}).enable(["table", "strikethrough"])
except Exception:  # markdown-it-py missing: plain text preview
    _MD = None

_TASK = re.compile(r'<li([^>]*)>(<p[^>]*>)?\[( |x|X)\]\s')
_LINK = re.compile(r'<a href="(?!#)')
_WIKI = re.compile(r"\[\[([^\[\]\n<>]{1,120})\]\]")
_CODE = re.compile(r"(<pre[\s>].*?</pre>|<code[\s>].*?</code>)", re.S)


def _note_links(out: str) -> str:
    """[[Note name]] links to another note (not inside code)."""
    parts = _CODE.split(out)
    for i in range(0, len(parts), 2):
        parts[i] = _WIKI.sub(lambda m: f'<a href="#note:{m.group(1).strip()}" class="nb-note-link" '
                                        f'title="Open the note {m.group(1).strip()}">{m.group(1).strip()}</a>', parts[i])
    return "".join(parts)


def render(text: str, ext: str = ".md") -> str:
    text = str(text or "")
    if ext.lower() != ".md" or _MD is None:
        return f'<pre class="notebook-plain">{html.escape(text)}</pre>'
    env = {}
    tokens = _MD.parse(text, env)
    for token in tokens:
        if token.map and token.nesting in (0, 1) and token.block and token.type != "inline":
            token.attrSet("data-line", str(token.map[0]))
    out = _MD.renderer.render(tokens, _MD.options, env)
    # task lists: "- [ ] todo" / "- [x] done"
    out = _TASK.sub(lambda m: f'<li{m.group(1)} class="task">{m.group(2) or ""}<input type="checkbox" class="nb-task"'
                              f'{" checked" if m.group(3).lower() == "x" else ""}> ', out)
    out = _note_links(out)
    # links open outside the WebUI
    return _LINK.sub('<a target="_blank" rel="noopener noreferrer" href="', out)
