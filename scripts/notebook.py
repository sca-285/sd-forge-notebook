"""Notebook: a tab and a floating window for notes, in two storages kept in
this extension's notes/ folder:

    Markdown   notes/markdown/*.md   shown formatted, click to edit
    Rich text  notes/rich/*.html     a word-processor style editor

The page talks to a small JSON API under /notebook/api (registered on the
WebUI's own server), so the tab and the floating window share one editor
and work the same on Gradio 3 (reForge) and Gradio 4 (Forge, Neo).
"""

import time
from pathlib import Path

import gradio as gr
from fastapi import Request
from fastapi.responses import FileResponse, JSONResponse, Response

from modules import script_callbacks, shared

from lib_notebook import convert as C
from lib_notebook import extras as X
from lib_notebook import render as R
from lib_notebook import transfer as T
from lib_notebook.store import NoteError, default_root, open_storages
from lib_notebook.templates import Templates

ROOT = default_root()
STORES = open_storages(ROOT)
META = X.Meta(ROOT)
SNIPPETS = X.Snippets(ROOT)
ASSETS = X.Assets(ROOT)
TEMPLATES = Templates(ROOT)
LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}


def on_ui_tabs():
    with gr.Blocks(analytics_enabled=False) as tab:
        gr.HTML('<div id="notebook-root" class="notebook-root">Loading notes…</div>', elem_id="notebook-mount")
    return [(tab, "Notebook", "notebook")]


def on_ui_settings():
    section = ("notebook", "Notebook")
    shared.opts.add_option("notebook_float_button", shared.OptionInfo(
        True, "Show the floating Notebook button on every tab", section=section).info("Alt+N opens and closes it too"))
    shared.opts.add_option("notebook_autosave", shared.OptionInfo(
        True, "Save notes automatically while typing", section=section))
    shared.opts.add_option("notebook_remote_folders", shared.OptionInfo(
        False, "Allow export to folders from other computers", section=section).info(
        "off: only a browser on the computer running the WebUI can write into its folders; others can still download"))


def _authorised(app, request: Request) -> bool:
    """When the WebUI has a login (--gradio-auth), only its logged-in users may use the notes."""
    if not getattr(app, "auth", None):
        return True
    tokens = getattr(app, "tokens", {}) or {}
    cookie_id = getattr(app, "cookie_id", None)
    names = ["access-token", "access-token-unsecure"]
    if cookie_id:
        names = [f"access-token-{cookie_id}", f"access-token-unsecure-{cookie_id}"] + names
    return any(request.cookies.get(n) in tokens for n in names if request.cookies.get(n))


def _local(request: Request) -> bool:
    if getattr(shared.opts, "notebook_remote_folders", False):
        return True
    client = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for")
    return client in LOCAL_HOSTS and not forwarded


def _store(q, b):
    key = b.get("storage") or q.get("storage") or "md"
    if key not in STORES:
        raise NoteError("Unknown storage.")
    return STORES[key]


def _stamp():
    return X.stamp(STORES, META.path)


def _tagged(query):
    """(words, tags) of a search query: '#sdxl portrait' looks for the tag sdxl and the word portrait."""
    words = [w for w in str(query or "").split() if w]
    tags = [X.clean_tag(w) for w in words if w.startswith("#") and len(w) > 1]
    return " ".join(w for w in words if not w.startswith("#")), [t for t in tags if t]


def on_app_started(demo, app):
    def allowed(request, local_only):
        if not _authorised(app, request):
            return JSONResponse({"error": "Log in to the WebUI first."}, status_code=401)
        if local_only and not _local(request):
            return JSONResponse({"error": "Writing into folders works only in a browser on the computer that runs "
                                          "the WebUI (Settings > Notebook can allow it). Use Download instead."},
                                status_code=403)
        return None

    def route(method, path, local_only=False):
        def register(fn):
            async def endpoint(request: Request):
                refused = allowed(request, local_only)
                if refused:
                    return refused
                try:
                    body = await request.json() if method in ("POST", "PUT") else {}
                    return JSONResponse(fn(dict(request.query_params), body or {}))
                except NoteError as e:
                    return JSONResponse({"error": str(e)}, status_code=e.status)
                except OSError as e:
                    return JSONResponse({"error": f"The file could not be read or written ({e.strerror or e})."}, status_code=500)
            app.add_api_route("/notebook/api" + path, endpoint, methods=[method])
            return fn
        return register

    @route("GET", "/notes")
    def notes(q, b):
        stamp = _stamp()
        return ({key: META.decorate(key, store.list()) for key, store in STORES.items()}
                | {"folder": str(ROOT), "stamp": stamp})

    @route("GET", "/stamp")
    def stamp(q, b):
        return {"stamp": _stamp()}

    @route("GET", "/note")
    def note(q, b):
        return _store(q, b).read(q.get("name"))

    @route("POST", "/note")
    def create(q, b):
        store = _store(q, b)
        text = b.get("text", "")
        if b.get("template"):
            text = TEMPLATES.text(b.get("template"), "md" if store is STORES["md"] else "rich", Path(str(b.get("name", ""))).stem)
        return store.create(b.get("name"), text)

    @route("POST", "/meta")
    def meta(q, b):
        key = b.get("storage") if b.get("storage") in STORES else "md"
        STORES[key]._existing(b.get("name"))
        return META.update(key, b.get("name"), b.get("pinned"), b.get("tags"))

    @route("PUT", "/note")
    def save(q, b):
        return _store(q, b).save(b.get("name"), str(b.get("text", "")), b.get("base_mtime"), bool(b.get("force")),
                                 bool(b.get("snapshot")))

    @route("POST", "/rename")
    def rename(q, b):
        key = b.get("storage") if b.get("storage") in STORES else "md"
        result = STORES[key].rename(b.get("name"), b.get("new_name"))
        META.rename(key, b.get("name"), result["name"])
        return result

    @route("POST", "/delete")
    def delete(q, b):
        key = b.get("storage") if b.get("storage") in STORES else "md"
        result = STORES[key].delete(b.get("name"))
        META.remove(key, b.get("name"))
        return result

    @route("GET", "/search")
    def search(q, b):
        words, tags = _tagged(q.get("q", ""))
        results = []
        for key, store in STORES.items():
            found = store.search(words) if words else [{**item, "hits": []} for item in store.list()]
            for item in META.decorate(key, found):
                if all(t in item["tags"] for t in tags):
                    results.append({**item, "storage": key})
        return {"results": results}

    @route("GET", "/diff")
    def diff(q, b):
        store = _store(q, b)
        old = store.codec.plain(store.version(q.get("name"), q.get("id"))["text"])
        new = store.codec.plain(store.read(q.get("name"))["text"])
        return {"ops": X.diff(old, new)}

    @route("POST", "/convert")
    def convert(q, b):
        """A copy of a note in the other storage."""
        key = b.get("storage") if b.get("storage") in STORES else "md"
        other = "rich" if key == "md" else "md"
        note = STORES[key].read(b.get("name"))
        stem = Path(note["name"]).stem
        text = C.md_to_rich(note["text"]) if key == "md" else C.rich_to_md(note["text"])
        name = STORES[other].free_name(stem + (".html" if other == "rich" else ".md"))
        STORES[other].create(name, text)
        entry = META.get(key, note["name"])
        if entry:
            META.update(other, name, entry.get("pinned"), entry.get("tags"))
        return {"storage": other, "name": name}

    @route("POST", "/asset")
    def asset(q, b):
        return {"url": X.ASSET_URL + ASSETS.save_data_url(b.get("data"))}

    @route("POST", "/image-info")
    def image_info(q, b):
        return X.image_info(b.get("data"))

    @route("GET", "/snippets")
    def snippets(q, b):
        return {"snippets": SNIPPETS.list()}

    @route("PUT", "/snippets")
    def save_snippets(q, b):
        return {"snippets": SNIPPETS.save(b.get("snippets"))}

    @route("GET", "/templates")
    def templates(q, b):
        return {"templates": TEMPLATES.list(q.get("storage", "md"))}

    @route("POST", "/template")
    def save_template(q, b):
        key = b.get("storage") if b.get("storage") in STORES else "md"
        note = STORES[key].read(b.get("name"))
        return TEMPLATES.save(key, b.get("title"), note["text"])

    @route("POST", "/template/delete")
    def delete_template(q, b):
        return TEMPLATES.delete(b.get("id"), b.get("storage", "md"))

    @route("POST", "/import-backup")
    def import_backup(q, b):
        return X.restore_backup(STORES, ROOT, b.get("data"), META, SNIPPETS, ASSETS)

    async def asset_file(request: Request, name: str):
        refused = allowed(request, False)
        if refused:
            return refused
        try:
            path = ASSETS.path(name)
        except NoteError as e:
            return JSONResponse({"error": str(e)}, status_code=e.status)
        return FileResponse(path, media_type=X.ASSET_MIME.get(path.suffix.lower(), "application/octet-stream"),
                            headers={"Cache-Control": "private, max-age=31536000, immutable"})

    app.add_api_route("/notebook/api/asset/{name}", asset_file, methods=["GET"])

    async def backup_file(request: Request):
        refused = allowed(request, False)
        if refused:
            return refused
        data = X.backup(ROOT)
        filename = time.strftime("notebook-backup-%Y%m%d-%H%M%S.zip")
        return Response(data, media_type="application/zip",
                        headers={"Content-Disposition": f'attachment; filename="{filename}"'})

    app.add_api_route("/notebook/api/backup", backup_file, methods=["GET"])

    @route("GET", "/history")
    def history(q, b):
        return {"versions": _store(q, b).history(q.get("name"))}

    @route("GET", "/version")
    def version(q, b):
        return _store(q, b).version(q.get("name"), q.get("id"))

    @route("POST", "/restore")
    def restore(q, b):
        return _store(q, b).restore(b.get("name"), b.get("id"))

    @route("POST", "/render")
    def render(q, b):
        return {"html": R.render(b.get("text", ""), b.get("ext", ".md"))}

    @route("POST", "/import")
    def import_(q, b):
        return T.import_file(STORES, b.get("filename"), b.get("content", ""))

    def exported(storage, name, fmt):
        filename, text = T.export(STORES, storage, name, fmt)
        if filename.endswith(".html"):
            text = ASSETS.inline(text)        # an exported page carries its pictures
        return filename, text

    @route("GET", "/export")
    def export(q, b):
        filename, text = exported(q.get("storage", "md"), q.get("name"), q.get("format"))
        return {"filename": filename, "text": text}

    @route("POST", "/export", local_only=True)
    def export_to_folder(q, b):
        filename, text = exported(b.get("storage", "md"), b.get("name"), b.get("format"))
        return T.write_to_folder(b.get("folder"), filename, text, bool(b.get("overwrite")))

    @route("GET", "/folders", local_only=True)
    def folders(q, b):
        return T.list_folders(q.get("path", ""))


script_callbacks.on_ui_tabs(on_ui_tabs)
script_callbacks.on_ui_settings(on_ui_settings)
script_callbacks.on_app_started(on_app_started)
