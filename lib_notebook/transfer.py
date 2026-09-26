"""Import from and export to files outside the notes folder.

Import takes the file's name and text (sent by the browser):
    .md          -> the Markdown storage, as it is
    .txt         -> the rich-text storage, one paragraph per line
    .html / .htm -> the rich-text storage, cleaned by rich.sanitize

Export turns a note into a file:
    Markdown note  -> .md (as it is) or .html (the rendered page)
    rich-text note -> .html (as it looks) or .txt (plain text)
and either hands it to the browser (download) or writes it into a folder
on the computer the WebUI runs on.
"""

from __future__ import annotations

import os
import string
from pathlib import Path

from lib_notebook import rich
from lib_notebook.convert import md_to_rich
from lib_notebook.store import MAX_SIZE, NoteError, check_name

IMPORTS = {".md": "md", ".markdown": "md", ".txt": "rich", ".text": "rich", ".html": "rich", ".htm": "rich"}
FORMATS = {"md": ("md", "html"), "rich": ("html", "txt")}


def import_file(stores, filename: str, content: str):
    """Add an imported file as a new note. Returns {'storage', 'name'}."""
    filename = os.path.basename(str(filename or "").replace("\\", "/")).strip()
    stem, ext = os.path.splitext(filename)
    storage = IMPORTS.get(ext.lower())
    if storage is None:
        raise NoteError(f"{filename or 'This file'}: only .md, .txt and .html files can be imported.")
    text = str(content or "")
    if text.startswith("\ufeff"):
        text = text[1:]
    if len(text.encode("utf-8")) > MAX_SIZE:
        raise NoteError(f"{filename} is larger than {MAX_SIZE // (1024 * 1024)} MB.", 413)
    stem = (stem.strip(" .") or "Imported")[:100]
    for bad in '<>:"/\\|?*':
        stem = stem.replace(bad, "_")
    stem = "".join(ch for ch in stem if ch >= " ")
    store = stores[storage]
    if storage == "md":
        name = store.free_name(stem + ".md")
        store.create(name, text)
    else:
        body = rich.from_text(text) if ext.lower() in (".txt", ".text") else rich.from_document(text)
        name = store.free_name(stem + ".html")
        store.create(name, body)
    return {"storage": storage, "name": name}


def export(stores, storage: str, name: str, fmt: str):
    """(file name, file text) of a note in format `fmt`."""
    if storage not in FORMATS or fmt not in FORMATS[storage]:
        raise NoteError("That export format is not available for this note.")
    store = stores[storage]
    note = store.read(name)
    stem = Path(note["name"]).stem
    if storage == "md":
        if fmt == "md":
            return f"{stem}.md", note["text"]
        return f"{stem}.html", rich.to_document(md_to_rich(note["text"]), stem)
    if fmt == "html":
        return f"{stem}.html", rich.to_document(note["text"], stem)
    return f"{stem}.txt", rich.to_text(note["text"])


def write_to_folder(folder: str, filename: str, text: str, overwrite=False):
    """Write an exported file into `folder` (an existing folder, absolute path)."""
    folder = str(folder or "").strip().strip('"')
    if not folder:
        raise NoteError("Choose a folder first.")
    path = Path(os.path.expanduser(folder))
    if not path.is_absolute():
        raise NoteError("Give the full path of the folder, e.g. C:\\Users\\me\\Documents or /home/me/notes.")
    if not path.is_dir():
        raise NoteError(f"There is no folder {path}.", 404)
    target = path / check_name(filename, (".md", ".txt", ".html"))
    if target.exists() and not overwrite:
        raise NoteError(f"{target.name} already exists in that folder.", 409)
    try:
        tmp = target.with_name(target.name + ".tmp")
        with open(tmp, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp, target)
    except PermissionError:
        raise NoteError(f"No permission to write in {path}.", 403)
    return {"path": str(target)}


def list_folders(folder: str = ""):
    """Sub-folders of `folder` for the folder picker; the home folder (and drives on Windows) by default."""
    folder = str(folder or "").strip().strip('"')
    if not folder:
        path = Path.home()
    else:
        path = Path(os.path.expanduser(folder))
        if not path.is_absolute() or not path.is_dir():
            raise NoteError(f"There is no folder {folder}.", 404)
    path = path.resolve()
    try:
        entries = sorted((p.name for p in path.iterdir() if p.is_dir() and not p.name.startswith((".", "$"))),
                         key=str.lower)
    except PermissionError:
        entries = []
    drives = []
    if os.name == "nt":
        drives = [f"{d}:\\" for d in string.ascii_uppercase if os.path.exists(f"{d}:\\")]
    parent = str(path.parent) if path.parent != path else None
    return {"path": str(path), "parent": parent, "folders": entries[:500], "drives": drives, "home": str(Path.home())}
