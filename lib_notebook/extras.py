"""What Notebook keeps besides the notes, all under notes/:

    meta.json        pinned notes and tags, per storage
    snippets.json    saved prompt snippets
    assets/          pictures used by notes, one file each, named by content
    templates/       templates saved from notes (.md and .html)

and the helpers that work across storages: a change stamp for the note
list, differences between versions, backups, and reading generation
parameters from a picture.
"""

from __future__ import annotations

import base64
import difflib
import hashlib
import io
import json
import os
import re
import time
import zipfile
from pathlib import Path

from lib_notebook.store import MAX_SIZE, NoteError, check_name

ASSET_URL = "/notebook/api/asset/"
ASSET_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}
ASSET_MIME = {ext: mime for mime, ext in ASSET_TYPES.items()} | {".jpeg": "image/jpeg"}
ASSET_NAME = re.compile(r"^[a-f0-9]{8,64}\.(png|jpg|jpeg|webp|gif)$")
_DATA_URL = re.compile(r"^data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$")
_ASSET_SRC = re.compile(r'src="' + re.escape(ASSET_URL) + r'([A-Za-z0-9._-]+)"')
_TAG = re.compile(r"[^a-z0-9_\-]+")
MAX_TAGS = 12
MAX_BACKUP = 400 * 1024 * 1024


def _write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def _read_json(path: Path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, type(default)) else default
    except (OSError, ValueError):
        return default


def clean_tag(tag: str) -> str:
    return _TAG.sub("-", str(tag or "").strip().lstrip("#").lower()).strip("-")[:24]


# --------------------------------------------------------------------- pins and tags

class Meta:
    def __init__(self, root: Path):
        self.path = Path(root) / "meta.json"

    def load(self) -> dict:
        return _read_json(self.path, {})

    def get(self, storage: str, name: str) -> dict:
        return self.load().get(storage, {}).get(name, {})

    def update(self, storage: str, name: str, pinned=None, tags=None) -> dict:
        data = self.load()
        entry = data.setdefault(storage, {}).setdefault(name, {})
        if pinned is not None:
            entry["pinned"] = bool(pinned)
        if tags is not None:
            seen = []
            for tag in tags if isinstance(tags, list) else []:
                tag = clean_tag(tag)
                if tag and tag not in seen:
                    seen.append(tag)
            entry["tags"] = seen[:MAX_TAGS]
        entry = {k: v for k, v in entry.items() if v}
        if entry:
            data[storage][name] = entry
        else:
            data[storage].pop(name, None)
        _write_json(self.path, data)
        return entry

    def rename(self, storage: str, old: str, new: str):
        data = self.load()
        entry = data.get(storage, {}).pop(old, None)
        if entry:
            data[storage][new] = entry
            _write_json(self.path, data)

    def remove(self, storage: str, name: str):
        data = self.load()
        if data.get(storage, {}).pop(name, None) is not None:
            _write_json(self.path, data)

    def decorate(self, storage: str, items: list) -> list:
        """List items with their 'pinned' and 'tags'."""
        mine = self.load().get(storage, {})
        for item in items:
            entry = mine.get(item["name"], {})
            item["pinned"] = bool(entry.get("pinned"))
            item["tags"] = list(entry.get("tags", []))
        return items


# --------------------------------------------------------------------- snippets

class Snippets:
    def __init__(self, root: Path):
        self.path = Path(root) / "snippets.json"

    def list(self) -> list:
        return [s for s in _read_json(self.path, []) if isinstance(s, dict) and s.get("name")]

    def save(self, snippets) -> list:
        out, names = [], set()
        for s in snippets if isinstance(snippets, list) else []:
            if not isinstance(s, dict):
                continue
            name = str(s.get("name", "")).strip()[:80]
            text = str(s.get("text", ""))[:20000]
            if name and text and name.lower() not in names:
                names.add(name.lower())
                out.append({"name": name, "text": text})
        _write_json(self.path, out[:500])
        return out


# --------------------------------------------------------------------- pictures

class Assets:
    def __init__(self, root: Path):
        self.root = Path(root) / "assets"

    def save_data_url(self, data_url: str) -> str:
        match = _DATA_URL.match(str(data_url or "").strip())
        if not match:
            raise NoteError("Only PNG, JPEG, WebP and GIF pictures can be added.")
        data = base64.b64decode(re.sub(r"\s", "", match.group(2)))
        if len(data) > MAX_SIZE:
            raise NoteError(f"A picture can be at most {MAX_SIZE // (1024 * 1024)} MB.", 413)
        return self.save_bytes(data, ASSET_TYPES[match.group(1)])

    def save_bytes(self, data: bytes, ext: str) -> str:
        name = hashlib.sha1(data).hexdigest()[:20] + ext
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / name
        if not path.exists():
            tmp = path.with_name(name + ".tmp")
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, path)
        return name

    def path(self, name: str) -> Path:
        name = str(name or "")
        if not ASSET_NAME.match(name):
            raise NoteError("Unknown picture.", 404)
        path = self.root / name
        if not path.is_file():
            raise NoteError("Unknown picture.", 404)
        return path

    def inline(self, text: str) -> str:
        """Pictures written into the page itself, so an exported file stands on its own."""
        def swap(match):
            try:
                path = self.path(match.group(1))
            except NoteError:
                return match.group(0)
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            return f'src="data:{ASSET_MIME[path.suffix.lower()]};base64,{data}"'
        return _ASSET_SRC.sub(swap, text)


# --------------------------------------------------------------------- the note list's stamp

def stamp(stores, *files: Path) -> str:
    """Changes whenever a note is added, removed or written, or pins and tags change."""
    h = hashlib.sha1()
    for key, store in stores.items():
        h.update(key.encode())
        try:
            for entry in sorted(os.scandir(store.root), key=lambda e: e.name):
                if entry.is_file() and not entry.name.startswith("."):
                    st = entry.stat()
                    h.update(f"{entry.name}\0{st.st_mtime_ns}\0{st.st_size}\n".encode())
        except OSError:
            pass
    for path in files:
        try:
            h.update(str(Path(path).stat().st_mtime_ns).encode())
        except OSError:
            h.update(b"-")
    return h.hexdigest()[:16]


# --------------------------------------------------------------------- differences

def diff(old: str, new: str, limit=4000) -> list:
    """[op, line] with op '=', '-' (only in the old text) or '+' (only in the new one)."""
    a, b = old.splitlines(), new.splitlines()
    out = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            out.extend(["=", line] for line in a[i1:i2])
        else:
            out.extend(["-", line] for line in a[i1:i2])
            out.extend(["+", line] for line in b[j1:j2])
        if len(out) > limit:
            out = out[:limit] + [["=", "…"]]
            break
    return out


# --------------------------------------------------------------------- generation parameters

def image_info(data_url: str) -> dict:
    """The generation parameters written into a picture by the WebUI (PNG text, JPEG/WebP EXIF)."""
    match = _DATA_URL.match(str(data_url or "").strip())
    if not match:
        raise NoteError("Only PNG, JPEG, WebP and GIF pictures can be read.")
    from PIL import Image
    raw = base64.b64decode(re.sub(r"\s", "", match.group(2)))
    try:
        image = Image.open(io.BytesIO(raw))
    except Exception:
        raise NoteError("This picture could not be read.")
    info = None
    try:
        from modules import images as webui_images
        info, _ = webui_images.read_info_from_image(image)
    except Exception:
        info = None
    if not info:
        info = (image.info or {}).get("parameters")
    if isinstance(info, bytes):
        info = info.decode("utf-8", errors="ignore")
    return {"infotext": str(info or "").strip(), "width": image.width, "height": image.height}


# --------------------------------------------------------------------- backups

def backup(root: Path) -> bytes:
    """Every note, version, picture, template, snippet and tag, as one .zip."""
    root = Path(root)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted(root.rglob("*")):
            if path.is_file() and not path.name.endswith(".tmp"):
                z.write(path, path.relative_to(root).as_posix())
    return buffer.getvalue()


def restore_backup(stores, root: Path, data_b64: str, meta: Meta, snippets: Snippets, assets: Assets) -> dict:
    """Add the notes of a backup .zip. Nothing is overwritten: a name already taken gets '(2)'."""
    from lib_notebook import rich
    data = base64.b64decode(str(data_b64 or ""))
    if len(data) > MAX_BACKUP:
        raise NoteError("That backup is too large.", 413)
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise NoteError("That is not a Notebook backup (.zip).")
    folders = {"markdown": "md", "rich": "rich"}
    renamed = {"md": {}, "rich": {}}
    added = {"md": 0, "rich": 0, "pictures": 0, "templates": 0, "snippets": 0}
    with z:
        for info in z.infolist():
            if info.is_dir() or info.file_size > MAX_SIZE:
                continue
            parts = info.filename.replace("\\", "/").split("/")
            if len(parts) == 2 and parts[0] in folders and not parts[1].startswith("."):
                key = folders[parts[0]]
                store = stores[key]
                try:
                    name = store.free_name(check_name(parts[1], store.extensions))
                except NoteError:
                    continue
                raw = z.read(info).decode("utf-8", errors="replace")
                store.create(name, rich.from_document(raw) if key == "rich" else raw)
                renamed[key][parts[1]] = name
                added[key] += 1
            elif len(parts) == 2 and parts[0] == "assets" and ASSET_NAME.match(parts[1]):
                target = assets.root / parts[1]
                if not target.exists():
                    assets.root.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(z.read(info))
                    added["pictures"] += 1
            elif len(parts) == 2 and parts[0] == "templates" and not parts[1].startswith("."):
                try:
                    name = check_name(parts[1], (".md", ".html"))
                except NoteError:
                    continue
                target = Path(root) / "templates" / name
                if not target.exists():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(z.read(info))
                    added["templates"] += 1
        names = set(z.namelist())
        if "meta.json" in names:
            try:
                old = json.loads(z.read("meta.json").decode("utf-8"))
            except ValueError:
                old = {}
            for key in ("md", "rich"):
                for name, entry in (old.get(key) or {}).items():
                    if name in renamed[key] and isinstance(entry, dict):
                        meta.update(key, renamed[key][name], entry.get("pinned"), entry.get("tags"))
        if "snippets.json" in names:
            try:
                incoming = json.loads(z.read("snippets.json").decode("utf-8"))
            except ValueError:
                incoming = []
            current = snippets.list()
            have = {s["name"].lower() for s in current}
            new = [s for s in incoming if isinstance(s, dict) and str(s.get("name", "")).lower() not in have]
            snippets.save(current + new)
            added["snippets"] = len(new)
    return {"added": added, "time": time.time()}
