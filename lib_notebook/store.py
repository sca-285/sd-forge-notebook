"""The notes on disk, in two storages:

    notes/markdown/              Markdown notes (.md)
    notes/rich/                  rich-text notes (.html)
    <storage>/.history/<note>/   earlier versions of each note (newest 10 kept)
    <storage>/.trash/            deleted notes

Every name coming from the browser goes through `check_name`, so nothing
outside a storage folder can be read or written.
"""

from __future__ import annotations

import os
import re
import shutil
import time
from pathlib import Path

EXTENSIONS = (".md", ".txt", ".html")      # every extension any storage uses
HISTORY_KEEP = 10
HISTORY_EVERY = 10 * 60        # seconds: autosaves closer together than this share one version
MAX_NAME = 120
MAX_SIZE = 12 * 1024 * 1024    # bytes per note (images live inside rich notes)

_BAD_CHARS = re.compile(r'[\x00-\x1f<>:"/\\|?*]')
_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}


class NoteError(Exception):
    """A request that cannot be done, with a message for the user."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def check_name(name: str, extensions=EXTENSIONS) -> str:
    """A safe file name with one of `extensions`, or NoteError."""
    name = str(name or "").strip()
    if not name:
        raise NoteError("The note needs a name.")
    if _BAD_CHARS.search(name):
        raise NoteError('A note name cannot contain / \\ : * ? " < > | or control characters.')
    if name.startswith("."):
        raise NoteError("A note name cannot start with a dot.")
    if len(name) > MAX_NAME:
        raise NoteError(f"A note name can have at most {MAX_NAME} characters.")
    stem, ext = os.path.splitext(name)
    if ext.lower() not in extensions:
        raise NoteError(f"Notes here are {' or '.join(extensions)} files.")
    if not stem.strip(" ."):
        raise NoteError("The note needs a name before the extension.")
    if stem.strip().lower() in _RESERVED or name.endswith((" ", ".")):
        raise NoteError("That name is reserved by the system.")
    return name


class Codec:
    """How a storage turns what the editor sends into the file, and back."""

    def encode(self, text: str, name: str) -> str:       # editor -> file
        return text

    def decode(self, raw: str) -> str:                   # file -> editor
        return raw

    def plain(self, text: str) -> str:                   # editor text -> searchable text
        return text


class Store:
    def __init__(self, root, extensions=(".md", ".txt"), codec: Codec | None = None):
        self.extensions = tuple(extensions)
        self.codec = codec or Codec()
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.history_root = self.root / ".history"
        self.trash_root = self.root / ".trash"

    # ------------------------------------------------------------------ paths

    def path(self, name: str) -> Path:
        name = check_name(name, self.extensions)
        self.root.mkdir(parents=True, exist_ok=True)     # the folder may have been removed meanwhile
        path = (self.root / name).resolve()
        if path.parent != self.root.resolve():
            raise NoteError("That note is outside the notes folder.")
        return path

    def _existing(self, name: str) -> Path:
        path = self.path(name)
        if not path.is_file():
            raise NoteError(f"There is no note called {name}.", 404)
        return path

    @staticmethod
    def _mtime(path: Path) -> str:
        # a string: nanoseconds do not fit in a JavaScript number
        return str(path.stat().st_mtime_ns)

    @staticmethod
    def _read(path: Path) -> str:
        # newline="": line endings come back exactly as written (CRLF stays CRLF)
        with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
            return f.read()

    @staticmethod
    def _write(path: Path, text: str):
        data = text.encode("utf-8")
        if len(data) > MAX_SIZE:
            raise NoteError(f"A note can be at most {MAX_SIZE // (1024 * 1024)} MB.", 413)
        tmp = path.with_name(path.name + ".tmp")
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)       # a note is never left half written

    # ------------------------------------------------------------------ notes

    def list(self):
        items = []
        self.root.mkdir(parents=True, exist_ok=True)
        for path in self.root.iterdir():
            if path.is_file() and path.suffix.lower() in self.extensions and not path.name.startswith("."):
                try:
                    text = self._plain_of(path)
                except OSError:
                    continue
                first = next((line.strip().lstrip("#").strip() for line in text.splitlines() if line.strip()), "")
                items.append({"name": path.name, "size": path.stat().st_size, "mtime": self._mtime(path),
                              "first_line": first[:120]})
        items.sort(key=lambda item: int(item["mtime"]), reverse=True)
        return items

    def _text_of(self, path: Path) -> str:
        return self.codec.decode(self._read(path))

    def _plain_of(self, path: Path) -> str:
        return self.codec.plain(self._text_of(path))

    def read(self, name: str):
        path = self._existing(name)
        return {"name": path.name, "text": self._text_of(path), "mtime": self._mtime(path)}

    def create(self, name: str, text: str = ""):
        path = self.path(name)
        if path.exists() or self._exists_case_insensitive(path.name):
            raise NoteError(f"A note called {path.name} already exists.", 409)
        self._write(path, self.codec.encode(text, path.stem))
        return {"name": path.name, "mtime": self._mtime(path)}

    def free_name(self, name: str) -> str:
        """`name`, or 'name (2)', 'name (3)'... when it is taken."""
        path = self.path(name)
        stem, ext = path.stem, path.suffix
        candidate, n = path.name, 2
        while self._exists_case_insensitive(candidate):
            candidate = f"{stem} ({n}){ext}"
            n += 1
        return check_name(candidate, self.extensions)

    def save(self, name: str, text: str, base_mtime=None, force=False, snapshot=False):
        """Write a note. With base_mtime, refuse (409) when the file changed on disk since then."""
        path = self.path(name)
        if path.exists():
            current = self._mtime(path)
            if base_mtime is not None and not force and str(base_mtime) != current:
                raise NoteError("This note was changed somewhere else.", 409)
            raw_old = self._read(path)
            raw_new = self.codec.encode(text, path.stem)
            if raw_old == raw_new:
                return {"name": path.name, "mtime": current, "unchanged": True}
            self._snapshot(path, raw_old, always=snapshot)
            self._write(path, raw_new)
            return {"name": path.name, "mtime": self._mtime(path)}
        self._write(path, self.codec.encode(text, path.stem))
        return {"name": path.name, "mtime": self._mtime(path)}

    def rename(self, name: str, new_name: str):
        path = self._existing(name)
        target = self.path(new_name)
        if target.exists() and target.name.lower() != path.name.lower():
            raise NoteError(f"A note called {target.name} already exists.", 409)
        os.replace(path, target)
        old_history, new_history = self.history_root / path.name, self.history_root / target.name
        if old_history.is_dir() and not new_history.exists():
            os.replace(old_history, new_history)
        return {"name": target.name, "mtime": self._mtime(target)}

    def delete(self, name: str):
        """Permanently delete a note and its earlier versions."""
        path = self._existing(name)
        path.unlink()
        history = self.history_root / path.name
        if history.is_dir():
            shutil.rmtree(history, ignore_errors=True)
        return {"deleted": path.name}

    def _exists_case_insensitive(self, name: str) -> bool:
        lower = name.lower()
        return any(p.name.lower() == lower for p in self.root.iterdir())

    # ------------------------------------------------------------------ search

    def search(self, query: str, limit_hits=3):
        """Notes whose name or text contains every word of the query (case-insensitive)."""
        words = [w for w in str(query or "").lower().split() if w]
        if not words:
            return []
        results = []
        for item in self.list():
            text = self._plain_of(self.root / item["name"])
            haystack = (item["name"] + "\n" + text).lower()
            if not all(w in haystack for w in words):
                continue
            hits = []
            for number, line in enumerate(text.splitlines(), 1):
                low = line.lower()
                if any(w in low for w in words):
                    hits.append({"line": number, "text": line.strip()[:200]})
                    if len(hits) >= limit_hits:
                        break
            results.append({**item, "hits": hits})
        return results

    # ------------------------------------------------------------------ history

    def _history_dir(self, name: str) -> Path:
        return self.history_root / check_name(name, self.extensions)

    def _snapshot(self, path: Path, text: str, always=False):
        folder = self.history_root / path.name
        versions = sorted(folder.glob("*" + path.suffix)) if folder.is_dir() else []
        if versions and not always:
            newest = versions[-1].stat().st_mtime
            if time.time() - newest < HISTORY_EVERY:
                return
        folder.mkdir(parents=True, exist_ok=True)
        # the id sorts in time order: date-time-microseconds, bumped on a clash
        now = time.time()
        stamp, us = time.strftime("%Y%m%d-%H%M%S", time.localtime(now)), int(now * 1e6) % 1000000
        target = folder / f"{stamp}-{us:06d}{path.suffix}"
        while target.exists():
            us += 1
            target = folder / f"{stamp}-{us:06d}{path.suffix}"
        with open(target, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        versions = sorted(folder.glob("*" + path.suffix))
        for old in versions[:-HISTORY_KEEP]:
            old.unlink(missing_ok=True)

    def history(self, name: str):
        folder = self._history_dir(name)
        if not folder.is_dir():
            return []
        out = []
        for path in sorted(folder.iterdir(), reverse=True):
            if path.is_file():
                out.append({"id": path.name, "size": path.stat().st_size, "time": path.stat().st_mtime})
        return out

    def _version_path(self, name: str, version_id: str) -> Path:
        folder = self._history_dir(name)
        vid = str(version_id or "")
        if not vid or _BAD_CHARS.search(vid) or vid.startswith("."):
            raise NoteError("Unknown version.", 404)
        path = folder / vid
        if not path.is_file():
            raise NoteError("Unknown version.", 404)
        return path

    def version(self, name: str, version_id: str):
        return {"id": version_id, "text": self.codec.decode(self._read(self._version_path(name, version_id)))}

    def restore(self, name: str, version_id: str):
        """Put an earlier version back; the text it replaces becomes a version itself."""
        raw = self._read(self._version_path(name, version_id))
        path = self.path(name)
        if path.exists():
            self._snapshot(path, self._read(path), always=True)
        text = self.codec.decode(raw)
        self._write(path, self.codec.encode(text, path.stem))
        return {"name": path.name, "mtime": self._mtime(path), "text": text}


def default_root():
    """<this extension>/notes"""
    return Path(__file__).resolve().parent.parent / "notes"


class RichCodec(Codec):
    def encode(self, text, name):
        from lib_notebook import rich
        return rich.to_document(text, name)

    def decode(self, raw):
        from lib_notebook import rich
        return rich.from_document(raw)

    def plain(self, text):
        from lib_notebook import rich
        return rich.to_text(text)


STORAGES = {
    "md": {"folder": "markdown", "extensions": (".md",), "codec": Codec},
    "rich": {"folder": "rich", "extensions": (".html",), "codec": RichCodec},
}


def open_storages(root=None):
    """{'md': Store, 'rich': Store} under `root` (notes/), after moving notes
    kept by earlier layouts (straight in notes/) into their storage."""
    root = Path(root or default_root())
    root.mkdir(parents=True, exist_ok=True)
    stores = {key: Store(root / spec["folder"], spec["extensions"], spec["codec"]()) for key, spec in STORAGES.items()}
    migrate(root, stores)
    return stores


def migrate(root: Path, stores):
    """notes/*.md -> markdown/, notes/*.txt -> rich/ as .html (the .txt is kept in notes/.imported/)."""
    from lib_notebook import rich
    for path in sorted(root.iterdir()):
        if not path.is_file() or path.name.startswith("."):
            continue
        ext = path.suffix.lower()
        try:
            if ext == ".md":
                store = stores["md"]
                target = store.path(store.free_name(path.name))
                os.replace(path, target)
                old_history = root / ".history" / path.name
                if old_history.is_dir() and not (store.history_root / target.name).exists():
                    store.history_root.mkdir(parents=True, exist_ok=True)
                    os.replace(old_history, store.history_root / target.name)
            elif ext == ".txt":
                store = stores["rich"]
                name = store.free_name(path.stem + ".html")
                store.create(name, rich.from_text(Store._read(path)))
                keep = root / ".imported"
                keep.mkdir(exist_ok=True)
                os.replace(path, keep / path.name)
        except (NoteError, OSError):
            continue
