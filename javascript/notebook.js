/* Notebook: notes in a tab and in a floating window, in two storages.
 *
 *   Markdown   shown formatted; click to edit, click outside to see it formatted
 *   Rich text  a word-processor editor (javascript/notebook-rich.js)
 *
 * The tab and the floating window are two "views" over one shared set of
 * open notes, so a note open in both stays in step while you type. Notes are
 * read and written through /notebook/api (scripts/notebook.py).
 *
 * Also here: pins, tags and sorting in the note list, templates, capturing
 * the last generated image with its parameters (Alt+G), snippets (Ctrl+;),
 * links between notes, converting a note to the other storage, backups,
 * version differences, and Undo after deleting.
 */
(function () {
  "use strict";
  if (window.__NOTEBOOK__) return;
  window.__NOTEBOOK__ = true;

  const API = "/notebook/api";
  const SAVE_DELAY = 1200;
  const RENDER_DELAY = 250;
  const POLL_EVERY = 3000;
  const UNDO_DELETE = 7000;          // ms before a deleted note is really deleted
  const X = window.NotebookExtras;
  const STORE_KEY = "sd-notebook";
  const STORAGES = {
    md: { label: "Markdown", ext: ".md", short: "MD" },
    rich: { label: "Rich text", ext: ".html", short: "RICH" },
  };
  const EXPORTS = {
    md: [["md", "Markdown (.md)"], ["html", "Web page (.html)"]],
    rich: [["html", "Web page (.html, opens in Word)"], ["txt", "Plain text (.txt)"]],
  };

  // ------------------------------------------------------------------ helpers

  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) if (child != null) node.append(child);
    return node;
  };

  const ICONS = {
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    save: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v6h8V3M7 21v-7h10v7"/>',
    import: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    export: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    braces: '<path d="M8 4c-2 0-2.5 1-2.5 3v2.5C5.5 11 4.5 12 3 12c1.5 0 2.5 1 2.5 2.5V17c0 2 .5 3 2.5 3M16 4c2 0 2.5 1 2.5 3v2.5c0 1.5 1 2.5 2.5 2.5-1.5 0-2.5 1-2.5 2.5V17c0 2-.5 3-2.5 3"/>',
    pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v7"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    printer: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  };
  const icon = (name, size = 19) => {
    const span = el("span", { class: "nb-icon" });
    span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
    return span;
  };
  const button = (name, title, onclick, label) =>
    el("button", { class: "nb-btn", type: "button", title, "aria-label": title, onclick }, icon(name), label ? el("span", { text: label }) : null);

  const webuiOpts = () => (typeof opts !== "undefined" ? opts : window.opts) || {};
  const option = (key, fallback) => {
    const value = webuiOpts()[key];
    return value === undefined ? fallback : value;
  };

  const local = {
    get() {
      try {
        return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      } catch {
        return {};
      }
    },
    set(patch) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ ...local.get(), ...patch }));
      } catch {
        /* storage off: nothing to remember */
      }
    },
  };

  async function api(method, path, body) {
    const response = await fetch(API + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      /* empty body */
    }
    if (!response.ok) {
      const error = new Error(data.error || `${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  const q = (params) => new URLSearchParams(params).toString();

  const stem = (name) => name.replace(/\.(md|html|txt)$/i, "");
  const when = (mtimeNs) => {
    const date = new Date(Number(BigInt(mtimeNs) / 1000000n));
    const today = new Date();
    return date.toDateString() === today.toDateString()
      ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString();
  };
  const newer = (a, b) => (BigInt(b.mtime) > BigInt(a.mtime) ? 1 : -1);
  const keyOf = (storage, name) => `${storage}:${name}`;
  const cleanTag = (t) => String(t || "").trim().replace(/^#/, "").toLowerCase().replace(/[^a-z0-9_\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  const SORTS = {
    newest: ["Newest first", (a, b) => (BigInt(b.mtime) > BigInt(a.mtime) ? 1 : BigInt(b.mtime) < BigInt(a.mtime) ? -1 : 0)],
    oldest: ["Oldest first", (a, b) => (BigInt(a.mtime) > BigInt(b.mtime) ? 1 : BigInt(a.mtime) < BigInt(b.mtime) ? -1 : 0)],
    az: ["Name A–Z", (a, b) => stem(a.name).localeCompare(stem(b.name), undefined, { numeric: true, sensitivity: "base" })],
    za: ["Name Z–A", (a, b) => stem(b.name).localeCompare(stem(a.name), undefined, { numeric: true, sensitivity: "base" })],
  };

  // ------------------------------------------------------------------ shared notes

  const Notes = {
    lists: { md: [], rich: [] },
    docs: new Map(),           // "storage:name" -> {storage, name, text, mtime, dirty, saving, conflict}
    listeners: new Set(),      // views, told when a list or a note changes

    emit(kind, doc, source) {
      for (const view of this.listeners) view.onChange(kind, doc, source);
    },

    pending: new Map(),        // "storage:name" -> {doc, timer}: deleted, still undoable

    async refresh() {
      const data = await api("GET", "/notes");
      this.lists = { md: data.md || [], rich: data.rich || [] };
      this.folder = data.folder;
      this.stamp = data.stamp;
      this.emit("list");
      for (const [key, doc] of [...this.docs.entries()]) {
        if (this.pending.has(key)) continue;
        const item = (this.lists[doc.storage] || []).find((n) => n.name === doc.name);
        if (!item) {
          if (doc.dirty || doc.saving) {
            doc.missing = true;
            this.emit("status", doc);
          } else {
            this.docs.delete(key);
            this.emit("removed", doc);
          }
        } else {
          if (doc.missing) {
            doc.missing = false;
            this.emit("status", doc);
          }
          if (!doc.dirty && !doc.saving && item.mtime !== doc.mtime) {
            // changed elsewhere, nothing unsaved here: show the new text
            this.reload(doc).catch(() => undefined);
          }
        }
      }
    },

    // the note list is fetched again only when something changed on disk
    async poll() {
      if (this.polling) return;
      this.polling = true;
      try {
        const data = await api("GET", "/stamp");
        if (data.stamp !== this.stamp) await this.refresh();
      } finally {
        this.polling = false;
      }
    },

    visible(storage) {
      return (this.lists[storage] || []).filter((item) => !this.pending.has(keyOf(storage, item.name)));
    },

    allTags() {
      const tags = new Set();
      for (const storage of Object.keys(STORAGES)) for (const item of this.lists[storage] || []) for (const t of item.tags || []) tags.add(t);
      return [...tags].sort();
    },

    item(storage, name) {
      return (this.lists[storage] || []).find((n) => n.name === name) || null;
    },

    async setMeta(doc, patch) {
      await api("POST", "/meta", { storage: doc.storage, name: doc.name, ...patch });
      await this.refresh();
      this.emit("status", doc);
    },

    async open(storage, name) {
      const key = keyOf(storage, name);
      if (this.docs.has(key)) return this.docs.get(key);
      const data = await api("GET", "/note?" + q({ storage, name }));
      const doc = { storage, name: data.name, text: data.text, mtime: data.mtime, dirty: false, saving: false, conflict: false };
      this.docs.set(keyOf(storage, doc.name), doc);
      return doc;
    },

    edit(doc, text, source) {
      if (doc.text === text) return;
      doc.text = text;
      doc.dirty = true;
      this.emit("text", doc, source);
      clearTimeout(doc.timer);
      if (option("notebook_autosave", true)) doc.timer = setTimeout(() => this.save(doc), SAVE_DELAY);
      else this.emit("status", doc);
    },

    async save(doc, { force = false, snapshot = false } = {}) {
      clearTimeout(doc.timer);
      if (doc.saving) {
        doc.again = true;
        return;
      }
      if (!doc.dirty && !force && !snapshot) return;
      doc.saving = true;
      const text = doc.text;
      this.emit("status", doc);
      try {
        const result = await api("PUT", "/note", { storage: doc.storage, name: doc.name, text, base_mtime: doc.mtime, force, snapshot });
        doc.mtime = result.mtime;
        doc.conflict = false;
        doc.missing = false;
        doc.error = null;
        if (doc.text === text) doc.dirty = false;
        const list = this.lists[doc.storage];
        const item = list.find((n) => n.name === doc.name);
        if (item) {
          item.mtime = result.mtime;
          list.sort(newer);
          this.emit("list");
        }
      } catch (error) {
        if (error.status === 409) doc.conflict = true;
        else doc.error = error.message;
      } finally {
        doc.saving = false;
        this.emit("status", doc);
        if (doc.again) {
          doc.again = false;
          if (doc.dirty) this.save(doc);
        }
      }
    },

    async reload(doc) {
      const data = await api("GET", "/note?" + q({ storage: doc.storage, name: doc.name }));
      Object.assign(doc, { text: data.text, mtime: data.mtime, dirty: false, conflict: false, error: null });
      this.emit("text", doc);
      this.emit("status", doc);
    },

    async create(storage, name, template) {
      const text = storage === "md" ? `# ${stem(name)}\n\n` : "<p><br></p>";
      const result = await api("POST", "/note", { storage, name, text, template: template || undefined });
      await this.refresh();
      return result.name;
    },

    async rename(doc, newName) {
      await this.flush(doc);
      const result = await api("POST", "/rename", { storage: doc.storage, name: doc.name, new_name: newName });
      this.docs.delete(keyOf(doc.storage, doc.name));
      const old = doc.name;
      doc.name = result.name;
      doc.mtime = result.mtime;
      this.docs.set(keyOf(doc.storage, doc.name), doc);
      await this.refresh();
      this.emit("renamed", doc, old);
      return doc.name;
    },

    // Deleting waits a few seconds, so it can be undone; then the file goes for good.
    async remove(doc) {
      clearTimeout(doc.timer);
      await this.flush(doc);
      const key = keyOf(doc.storage, doc.name);
      const timer = setTimeout(() => this.commitDelete(key), UNDO_DELETE);
      this.pending.set(key, { doc, timer });
      this.emit("list");
      this.emit("removed", doc);
      return key;
    },

    undoDelete(key) {
      const pending = this.pending.get(key);
      if (!pending) return null;
      clearTimeout(pending.timer);
      this.pending.delete(key);
      this.emit("list");
      return pending.doc;
    },

    async commitDelete(key) {
      const pending = this.pending.get(key);
      if (!pending) return;
      this.pending.delete(key);
      try {
        await api("POST", "/delete", { storage: pending.doc.storage, name: pending.doc.name });
      } catch {
        /* already gone */
      }
      this.docs.delete(key);
      await this.refresh().catch(() => undefined);
    },

    async flush(doc) {
      if (doc && doc.dirty && !doc.conflict) await this.save(doc);
    },

    async importFiles(files) {
      const done = [];
      const failed = [];
      for (const file of files) {
        try {
          if (/\.zip$/i.test(file.name)) {
            // a Notebook backup
            const result = await api("POST", "/import-backup", { data: X.toBase64(await file.arrayBuffer()) });
            const a = result.added;
            done.push({ backup: true, text: `${file.name}: ${a.md} Markdown and ${a.rich} rich-text notes, ${a.pictures} pictures, ${a.templates} templates, ${a.snippets} snippets` });
            continue;
          }
          const content = await file.text();
          done.push(await api("POST", "/import", { filename: file.name, content }));
        } catch (error) {
          failed.push(`${file.name}: ${error.message}`);
        }
      }
      await this.refresh();
      return { done, failed };
    },

    dirtyDocs() {
      return [...this.docs.values()].filter((d) => d.dirty);
    },
  };

  // ------------------------------------------------------------------ one editor

  class View {
    constructor(root, { compact = false, key }) {
      this.root = root;
      this.compact = compact;
      this.key = key;                          // what this view remembers in localStorage
      const saved = local.get()[key] || {};
      this.storage = STORAGES[saved.storage] ? saved.storage : "md";
      this.mdMode = compact ? "note" : saved.mdMode || "note";   // note (click to edit) | split
      this.showList = !compact;
      this.sort = saved.sort || "newest";
      this.tagFilter = null;
      this.doc = null;
      this.build();
      Notes.listeners.add(this);
      if (saved.note) this.openNote(this.storage, saved.note).catch(() => undefined);
    }

    build() {
      this.root.textContent = "";
      this.root.classList.add("nb", this.compact ? "nb-compact" : "nb-full");

      // side: storages, search, list
      this.tabs = el("div", { class: "nb-storages", role: "tablist" });
      for (const [storage, spec] of Object.entries(STORAGES)) {
        this.tabs.append(el("button", {
          class: "nb-storage", type: "button", role: "tab", "data-storage": storage,
          onclick: () => this.setStorage(storage),
        }, spec.label));
      }
      this.search = el("input", { class: "nb-search", type: "search", placeholder: "Search all notes", "aria-label": "Search notes" });
      this.search.addEventListener("input", () => {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.runSearch(), 200);
      });
      this.search.addEventListener("keydown", (event) => event.stopPropagation());
      this.fileInput = el("input", { type: "file", multiple: true, accept: ".md,.markdown,.txt,.text,.html,.htm,.zip", hidden: true });
      this.fileInput.addEventListener("change", () => this.importFiles([...this.fileInput.files]));
      this.listBox = el("div", { class: "nb-list", role: "listbox" });
      this.newRow = el("div", { class: "nb-new", hidden: true });
      this.notice = el("div", { class: "nb-notice", hidden: true });
      this.side = el("div", { class: "nb-side" },
        this.tabs,
        el("div", { class: "nb-side-top" }, el("span", { class: "nb-search-wrap" }, icon("search"), this.search),
          button("import", "Import .md, .txt or .html files, or a Notebook backup .zip (or drop them here)", () => this.fileInput.click()),
          button("plus", "New note", () => this.showNew())),
        this.filters = el("div", { class: "nb-filters" }),
        this.newRow, this.notice, this.listBox, this.fileInput,
        el("div", { class: "nb-folder", title: "Where the notes are kept" }));
      this.side.addEventListener("dragover", (event) => {
        if ([...event.dataTransfer.types].includes("Files")) {
          event.preventDefault();
          this.side.classList.add("nb-drop");
        }
      });
      this.side.addEventListener("dragleave", () => this.side.classList.remove("nb-drop"));
      this.side.addEventListener("drop", (event) => {
        event.preventDefault();
        this.side.classList.remove("nb-drop");
        this.importFiles([...event.dataTransfer.files]);
      });

      // main: toolbar, banner, editors
      this.title = el("button", { class: "nb-title", type: "button", title: "Rename", onclick: () => this.startRename() });
      this.status = el("span", { class: "nb-status" });
      this.splitButton = this.compact ? null : button("split", "Markdown source and formatted note side by side", () => this.setMdMode(this.mdMode === "split" ? "note" : "split"));
      this.toolbar = el("div", { class: "nb-toolbar" },
        this.compact ? button("list", "Notes", () => this.toggleList()) : null,
        this.title, this.status, this.tagChips = el("span", { class: "nb-tag-chips" }), el("span", { class: "nb-spacer" }),
        this.captureButton = button("camera", "Put the last generated image and its parameters here (Alt+G)", () => this.captureGeneration()),
        this.snippetButton = button("braces", "Snippets (Ctrl+;)", () => this.openSnippets()),
        this.pinButton = button("pin", "Pin to the top of the list", () => this.togglePin()),
        this.tagButton = button("tag", "Tags", (event) => this.showTags(event.currentTarget)),
        this.splitButton,
        this.saveButton = button("save", "Save now (Ctrl+S), and keep this version", () => this.doc && Notes.save(this.doc, { snapshot: true })),
        button("export", "Export", (event) => this.showExport(event.currentTarget)),
        button("history", "Earlier versions", () => this.toggleHistory()),
        this.moreButton = button("more", "More", (event) => this.showMore(event.currentTarget)),
        button("trash", "Delete", () => this.deleteNote()));
      for (const b of [this.snippetButton, this.tagButton, this.moreButton]) b.classList.add("nb-popup-opener");
      // the floating window keeps its title bar short: these move into More
      for (const b of [this.pinButton, this.tagButton, this.saveButton]) b.classList.add("nb-wide-only");

      // Markdown: source + formatted note
      this.source = el("textarea", { class: "nb-source", spellcheck: "false", placeholder: "Write Markdown here…", "aria-label": "Markdown" });
      this.source.addEventListener("input", () => {
        if (!this.doc) return;
        Notes.edit(this.doc, this.source.value, this);
        this.schedulePreview();
      });
      this.source.addEventListener("keydown", (event) => this.onSourceKey(event));
      this.source.addEventListener("blur", () => {
        if (this.mdMode === "note" && this.editing && !this.keepEditing) this.stopEditing();
      });
      this.rendered = el("div", { class: "nb-rendered markdown-body", tabindex: "0", title: "Click to edit" });
      this.rendered.addEventListener("click", (event) => this.onRenderedClick(event));
      this.rendered.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.startEditing();
        }
      });
      this.mdPane = el("div", { class: "nb-md" }, this.source, this.rendered);
      this.mdPane.addEventListener("dragover", (event) => {
        const types = [...(event.dataTransfer ? event.dataTransfer.types : [])];
        if (this.doc && (types.includes("Files") || types.includes("text/uri-list"))) event.preventDefault();
      });
      this.mdPane.addEventListener("drop", (event) => this.onMdDrop(event));
      this.source.addEventListener("paste", (event) => {
        const file = [...(event.clipboardData ? event.clipboardData.files : [])].find((f) => f.type.startsWith("image/"));
        if (!file) return;
        event.preventDefault();
        this.addPicturesToMarkdown([file]);
      });

      // Rich text: ribbon + page, in its own frame (javascript/notebook-rich.js)
      this.rich = new window.NotebookRich.RichEditor({
        compact: this.compact,
        onChange: (html) => this.doc && this.doc.storage === "rich" && Notes.edit(this.doc, html, this),
        onKey: (event) => this.commonKeys(event) || globalKeys(event),
        onSend: (infotext, tab) => this.send(infotext, tab),
        onNoteLink: (name) => this.openLinkedNote(name),
        noteNames: () => [...new Set(Object.keys(STORAGES).flatMap((k) => Notes.visible(k).map((n) => stem(n.name))))].sort((a, b) => a.localeCompare(b)),
        onCapture: () => this.captureGeneration(),
        onSnippet: () => this.openSnippets(),
      });
      this.rich.setDarkPage(Boolean(local.get().darkPage));
      this.richPane = el("div", { class: "nb-rich" }, this.rich.element);

      this.history = el("div", { class: "nb-history" });
      this.banner = el("div", { class: "nb-banner", hidden: true });
      this.popup = el("div", { class: "nb-popup", hidden: true });
      this.popup.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Escape") this.closePopup();
      });
      this.empty = el("div", { class: "nb-empty" }, el("p", { class: "nb-empty-text" }),
        el("div", { class: "nb-empty-actions" },
          el("button", { class: "nb-btn nb-primary", type: "button", onclick: () => this.showNew() }, icon("plus"), el("span", { text: "New note" })),
          el("button", { class: "nb-btn nb-outline", type: "button", onclick: () => this.fileInput.click() }, icon("import"), el("span", { text: "Import files" }))));
      this.panes = el("div", { class: "nb-panes" }, this.mdPane, this.richPane, this.history);
      this.toasts = el("div", { class: "nb-toasts", "aria-live": "polite" });
      this.main = el("div", { class: "nb-main" }, this.toolbar, this.banner, this.panes, this.empty, this.popup, this.toasts);
      this.root.append(this.side, this.main);
      this.root.addEventListener("pointerdown", (event) => {
        if (!this.popup.hidden && !this.popup.contains(event.target) && !event.target.closest(".nb-popup-opener")) this.closePopup();
      });
      this.applyLayout();
      this.renderList();
    }

    // -------------------------------------------------------------- layout

    setStorage(storage) {
      if (!STORAGES[storage]) return;
      this.storage = storage;
      this.newRow.hidden = true;
      this.remember();
      this.applyLayout();
      this.renderList();
    }

    setMdMode(mode) {
      this.mdMode = mode;
      this.editing = false;
      this.remember();
      this.applyLayout();
      this.schedulePreview(0);
    }

    toggleList(force) {
      this.showList = force === undefined ? !this.showList : force;
      this.applyLayout();
    }

    applyLayout() {
      this.root.classList.toggle("nb-list-open", this.showList);
      this.root.classList.toggle("nb-has-doc", Boolean(this.doc));
      for (const tab of this.tabs.children) {
        const on = tab.dataset.storage === this.storage;
        tab.classList.toggle("nb-active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
      }
      const kind = this.doc ? this.doc.storage : this.storage;
      this.panes.dataset.kind = kind;
      this.panes.dataset.mode = this.historyOpen ? "history" : kind === "md" ? (this.mdMode === "split" ? "split" : this.editing ? "editing" : "note") : "rich";
      if (this.splitButton) {
        this.splitButton.hidden = kind !== "md";
        this.splitButton.classList.toggle("nb-active", this.mdMode === "split");
      }
      const text = this.empty.querySelector(".nb-empty-text");
      text.textContent = this.storage === "md"
        ? "Markdown notes: written in Markdown, shown formatted. Click a note to edit it."
        : "Rich-text notes: fonts, colours, lists and tables, like a word processor.";
    }

    remember() {
      local.set({ [this.key]: { storage: this.doc ? this.doc.storage : this.storage, mdMode: this.mdMode, note: this.doc ? this.doc.name : null, sort: this.sort } });
    }

    // -------------------------------------------------------------- list, search, import

    async runSearch() {
      const query = this.search.value.trim();
      if (!query) {
        this.results = null;
        return this.renderList();
      }
      try {
        this.results = (await api("GET", "/search?" + q({ q: query }))).results;
      } catch {
        this.results = [];
      }
      this.renderList();
    }

    renderList() {
      let items;
      if (this.results) {
        items = this.results.filter((item) => !Notes.pending.has(keyOf(item.storage, item.name)));
      } else {
        items = Notes.visible(this.storage).map((item) => ({ ...item, storage: this.storage }));
        if (this.tagFilter) items = items.filter((item) => (item.tags || []).includes(this.tagFilter));
        items.sort(SORTS[this.sort] ? SORTS[this.sort][1] : SORTS.newest[1]);
        items.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));     // pinned first, the order kept
      }
      this.listBox.textContent = "";
      if (!items.length) {
        this.listBox.append(el("div", { class: "nb-list-empty", text: this.results ? "Nothing found." : this.tagFilter ? `No notes tagged #${this.tagFilter} here.` : "No notes here yet." }));
      }
      for (const item of items) {
        const current = this.doc && this.doc.storage === item.storage && this.doc.name === item.name;
        const row = el("button", {
          class: "nb-item" + (current ? " nb-current" : "") + (item.pinned ? " nb-pinned" : ""), type: "button", role: "option", title: item.name,
          onclick: () => this.openNote(item.storage, item.name, item.hits && item.hits[0] ? item.hits[0].line : null),
        },
        el("span", { class: "nb-item-name" }, item.pinned ? el("span", { class: "nb-pin-mark", title: "Pinned" }, icon("pin", 13)) : null,
          this.results ? el("span", { class: "nb-ext", text: STORAGES[item.storage].short }) : null, el("span", { class: "nb-item-title", text: stem(item.name) })),
        el("span", { class: "nb-item-meta", text: when(item.mtime) }),
        item.hits && item.hits.length
          ? item.hits.map((hit) => el("span", { class: "nb-hit", text: hit.text }))
          : item.first_line ? el("span", { class: "nb-item-first", text: item.first_line }) : null,
        item.tags && item.tags.length ? el("span", { class: "nb-item-tags" }, item.tags.map((t) => el("span", { class: "nb-chip", text: "#" + t }))) : null);
        this.listBox.append(row);
      }
      this.renderFilters();
      const folder = this.side.querySelector(".nb-folder");
      if (folder && Notes.folder) folder.textContent = Notes.folder;
    }

    // sorting, and the tags of every note as filters
    renderFilters() {
      const tags = Notes.allTags();
      if (this.tagFilter && !tags.includes(this.tagFilter)) this.tagFilter = null;
      const key = JSON.stringify([tags, this.tagFilter, this.sort, Boolean(this.results)]);
      if (this.filters.dataset.key === key) return;
      this.filters.dataset.key = key;
      this.filters.textContent = "";
      this.filters.hidden = Boolean(this.results);
      const sort = el("select", { class: "nb-select nb-sort", "aria-label": "Sort notes", title: "Sort notes (pinned notes stay on top)" },
        Object.entries(SORTS).map(([value, [label]]) => el("option", { value, text: label })));
      sort.value = this.sort;
      sort.addEventListener("change", () => {
        this.sort = sort.value;
        this.remember();
        this.renderList();
      });
      this.filters.append(sort);
      if (!tags.length) return;
      const chip = (label, value) => el("button", {
        class: "nb-chip nb-chip-filter" + (this.tagFilter === value ? " nb-active" : ""), type: "button", text: label,
        onclick: () => {
          this.tagFilter = this.tagFilter === value ? null : value;
          this.renderList();
        },
      });
      this.filters.append(el("div", { class: "nb-chip-row", role: "group", "aria-label": "Filter by tag" },
        chip("All", null), tags.map((t) => chip("#" + t, t))));
    }

    showNotice(lines, isError) {
      this.notice.hidden = false;
      this.notice.className = "nb-notice" + (isError ? " nb-notice-error" : "");
      this.notice.textContent = "";
      for (const line of lines) this.notice.append(el("div", { text: line }));
      clearTimeout(this.noticeTimer);
      this.noticeTimer = setTimeout(() => (this.notice.hidden = true), isError ? 9000 : 4000);
    }

    async importFiles(files) {
      this.fileInput.value = "";
      if (!files.length) return;
      const { done: all, failed } = await Notes.importFiles(files);
      const done = all.filter((d) => !d.backup);
      const lines = all.filter((d) => d.backup).map((d) => "Backup restored: " + d.text);
      if (done.length) lines.push(`Imported ${done.length} file${done.length > 1 ? "s" : ""}: ` + done.map((d) => `${stem(d.name)} (${STORAGES[d.storage].label})`).join(", "));
      lines.push(...failed);
      this.showNotice(lines, failed.length > 0);
      if (done.length) {
        const last = done[done.length - 1];
        this.setStorage(last.storage);
        await this.openNote(last.storage, last.name);
      }
    }

    showNew() {
      if (this.compact) this.toggleList(true);
      this.newRow.hidden = false;
      this.newRow.textContent = "";
      const storage = this.storage;
      const name = el("input", { class: "nb-new-name", type: "text", placeholder: `New ${STORAGES[storage].label.toLowerCase()} note`, "aria-label": "Note name" });
      const template = el("select", { class: "nb-select nb-template", "aria-label": "Template", title: "Start from a template" },
        el("option", { value: "", text: "Blank note" }));
      api("GET", "/templates?" + q({ storage })).then((data) => {
        for (const t of data.templates || []) template.append(el("option", { value: t.id, text: t.builtin ? t.label : `${t.label} (saved)` }));
      }).catch(() => undefined);
      const error = el("div", { class: "nb-error" });
      const create = async () => {
        const value = name.value.trim() || (template.value ? template.selectedOptions[0].textContent.replace(/ \(saved\)$/, "") : "");
        if (!value) return name.focus();
        try {
          const created = await Notes.create(storage, stem(value) + STORAGES[storage].ext, template.value);
          this.newRow.hidden = true;
          await this.openNote(storage, created);
          this.focusEditor(true);
        } catch (e) {
          error.textContent = e.message;
        }
      };
      name.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") create();
        if (event.key === "Escape") this.newRow.hidden = true;
      });
      this.newRow.append(el("div", { class: "nb-new-row" }, name,
        el("button", { class: "nb-btn nb-primary", type: "button", onclick: create, text: "Create" })), template, error);
      name.focus();
    }

    // -------------------------------------------------------------- the open note

    async openNote(storage, name, line) {
      if (this.doc && (this.doc.storage !== storage || this.doc.name !== name)) Notes.flush(this.doc);
      // until the note is loaded, nothing typed can land in the previous one
      const ticket = (this.ticket = (this.ticket || 0) + 1);
      this.doc = null;
      this.source.readOnly = true;
      this.rich.setEditable(false);
      let doc;
      try {
        doc = await Notes.open(storage, name);
      } catch {
        if (ticket !== this.ticket) return;
        this.remember();
        this.applyLayout();
        return;
      }
      if (ticket !== this.ticket) return;
      this.doc = doc;
      this.storage = storage;
      this.source.readOnly = false;
      this.rich.setEditable(true);
      this.historyOpen = false;
      this.editing = false;
      this.closePopup();
      this.title.textContent = stem(doc.name);
      this.title.title = `${doc.name} (click to rename)`;
      if (storage === "md") {
        this.source.value = doc.text;
        this.schedulePreview(0);
      } else {
        this.rich.setHTML(doc.text);
      }
      this.remember();
      this.applyLayout();
      this.renderStatus();
      this.renderList();
      if (this.compact) this.toggleList(false);
      if (line) this.goToLine(line);
    }

    focusEditor(atEnd) {
      if (!this.doc) return;
      if (this.doc.storage === "md") {
        this.startEditing();
        if (atEnd) this.source.selectionStart = this.source.selectionEnd = this.source.value.length;
      } else {
        this.rich.focus(atEnd);
      }
    }

    goToLine(line) {
      if (!this.doc || this.doc.storage !== "md") return;
      this.startEditing(line - 1);
      const lines = this.source.value.split("\n");
      const start = lines.slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
      this.source.setSelectionRange(start, start + (lines[line - 1] || "").length);
    }

    // -------------------------------------------------------------- Markdown

    startEditing(line) {
      if (!this.doc || this.doc.storage !== "md") return;
      this.editing = true;
      this.applyLayout();
      this.source.focus({ preventScroll: true });
      if (line !== undefined && line !== null) {
        const lines = this.source.value.split("\n");
        const start = lines.slice(0, line).join("\n").length + (line > 0 ? 1 : 0);
        this.source.setSelectionRange(start, start);
        const lineHeight = parseFloat(getComputedStyle(this.source).lineHeight) || 20;
        this.source.scrollTop = Math.max(0, (line - 3) * lineHeight);
      }
    }

    stopEditing() {
      this.editing = false;
      this.applyLayout();
      this.schedulePreview(0);
    }

    onRenderedClick(event) {
      if (!this.doc) return;
      const noteLink = event.target.closest("a.nb-note-link");
      if (noteLink) {
        event.preventDefault();
        this.openLinkedNote(decodeURIComponent(noteLink.getAttribute("href").slice(6)));
        return;
      }
      if (event.target.closest(".nb-params-bar")) return;
      if (event.target.closest("a[href]")) return;           // links open, they do not start editing
      const box = event.target.closest(".nb-task");
      if (box) {
        const item = box.closest("[data-line]");
        if (item) this.toggleTask(Number(item.dataset.line));
        return;
      }
      if (window.getSelection().toString()) return;          // selecting text to copy
      if (this.mdMode === "split") return;
      const block = event.target.closest("[data-line]");
      this.startEditing(block ? Number(block.dataset.line) : null);
    }

    toggleTask(line) {
      const lines = this.doc.text.split("\n");
      const text = lines[line] || "";
      const flipped = text.replace(/\[( |x|X)\]/, (m, c) => (c === " " ? "[x]" : "[ ]"));
      if (flipped === text) return;
      lines[line] = flipped;
      this.source.value = lines.join("\n");
      Notes.edit(this.doc, this.source.value, this);
      this.schedulePreview(0);
    }

    schedulePreview(delay = RENDER_DELAY) {
      if (!this.doc || this.doc.storage !== "md") return;
      clearTimeout(this.renderTimer);
      this.renderTimer = setTimeout(async () => {
        if (!this.doc || this.doc.storage !== "md") return;
        const doc = this.doc;
        const text = doc.text;
        if (!text.trim()) {
          this.rendered.innerHTML = '<p class="nb-placeholder">Empty note. Click to write.</p>';
          return;
        }
        try {
          const data = await api("POST", "/render", { text, ext: ".md" });
          if (this.doc === doc && doc.text === text) {
            this.rendered.innerHTML = data.html;
            this.decorateRendered();
          }
        } catch (error) {
          this.rendered.textContent = error.message;
        }
      }, delay);
    }

    onSourceKey(event) {
      if (this.commonKeys(event)) return;
      if (event.key === "Escape" && this.mdMode === "note") {
        event.preventDefault();
        this.source.blur();
      } else if (event.key === "Tab" && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        const { selectionStart: start, selectionEnd: end, value } = this.source;
        this.source.value = value.slice(0, start) + "  " + value.slice(end);
        this.source.selectionStart = this.source.selectionEnd = start + 2;
        this.source.dispatchEvent(new Event("input"));
      }
      // the WebUI's own shortcuts (Ctrl+Enter = generate, ...) stay out of the note
      event.stopPropagation();
    }

    // -------------------------------------------------------------- shared

    commonKeys(event) {
      const ctrl = (event.ctrlKey || event.metaKey) && !event.altKey;
      const key = event.key.toLowerCase();
      if (ctrl && key === "s") {
        event.preventDefault();
        event.stopPropagation();
        if (this.doc) Notes.save(this.doc, { snapshot: true });
        return true;
      }
      if (ctrl && event.key === ";") {
        event.preventDefault();
        this.openSnippets();
        return true;
      }
      if (ctrl && event.key === "/") {
        event.preventDefault();
        this.openPopup(this.moreButton, X.shortcutsPanel());
        return true;
      }
      return false;
    }

    renderMeta() {
      const item = this.doc ? Notes.item(this.doc.storage, this.doc.name) : null;
      this.pinButton.classList.toggle("nb-active", Boolean(item && item.pinned));
      this.pinButton.title = item && item.pinned ? "Unpin" : "Pin to the top of the list";
      this.tagChips.textContent = "";
      for (const t of (item && item.tags) || []) this.tagChips.append(el("span", { class: "nb-chip", text: "#" + t }));
    }

    renderStatus() {
      const doc = this.doc;
      this.banner.hidden = true;
      this.renderMeta();
      if (!doc) return (this.status.textContent = "");
      let text = "Saved";
      if (doc.saving) text = "Saving…";
      else if (doc.conflict) text = "Changed elsewhere";
      else if (doc.error) text = "Not saved";
      else if (doc.dirty) text = option("notebook_autosave", true) ? "Editing…" : "Unsaved (Ctrl+S)";
      this.status.textContent = text;
      this.status.dataset.state = doc.conflict || doc.error ? "error" : doc.dirty || doc.saving ? "busy" : "ok";
      if (doc.missing) {
        this.banner.hidden = false;
        this.banner.textContent = "";
        this.banner.append(el("span", { text: "This note was deleted from the folder." }),
          el("button", { class: "nb-btn", type: "button", text: "Save again", onclick: () => Notes.save(doc, { force: true }) }),
          el("button", { class: "nb-btn", type: "button", text: "Close", onclick: () => {
            Notes.docs.delete(keyOf(doc.storage, doc.name));
            Notes.emit("removed", doc);
          } }));
      } else if (doc.conflict) {
        this.banner.hidden = false;
        this.banner.textContent = "";
        this.banner.append(el("span", { text: "This note was changed in another window or on disk." }),
          el("button", { class: "nb-btn", type: "button", text: "Load theirs", onclick: () => Notes.reload(doc) }),
          el("button", { class: "nb-btn", type: "button", text: "Keep mine", onclick: () => Notes.save(doc, { force: true }) }));
      } else if (doc.error) {
        this.banner.hidden = false;
        this.banner.textContent = "";
        this.banner.append(el("span", { text: doc.error }),
          el("button", { class: "nb-btn", type: "button", text: "Try again", onclick: () => { doc.error = null; Notes.save(doc); } }));
      }
    }

    onChange(kind, doc, extra) {
      if (kind === "list") {
        this.renderMeta();
        return this.results ? undefined : this.renderList();
      }
      if (kind === "renamed" && this.doc === doc) {
        this.title.textContent = stem(doc.name);
        this.remember();
        return this.renderList();
      }
      if (kind === "removed" && this.doc === doc) {
        this.doc = null;
        this.source.value = "";
        this.rendered.textContent = "";
        this.rich.setHTML("");
        this.remember();
        return this.applyLayout();
      }
      if (!this.doc || this.doc !== doc) return;
      if (kind === "text" && extra !== this) {
        if (doc.storage === "md") {
          const { selectionStart, selectionEnd } = this.source;
          this.source.value = doc.text;
          if (document.activeElement === this.source) this.source.setSelectionRange(selectionStart, selectionEnd);
          this.schedulePreview();
        } else if (!this.rich.hasFocus()) {
          this.rich.setHTML(doc.text);
        }
      }
      if (kind === "status" || kind === "text") this.renderStatus();
    }

    async startRename() {
      if (!this.doc) return;
      const doc = this.doc;
      const input = el("input", { class: "nb-rename", type: "text", value: stem(doc.name), "aria-label": "New name" });
      let done = false;
      const finish = async (commit) => {
        if (done) return;
        done = true;
        const value = input.value.trim();
        input.replaceWith(this.title);
        if (!commit || !value || value === stem(doc.name)) return;
        try {
          await Notes.rename(doc, stem(value) + STORAGES[doc.storage].ext);
          this.title.textContent = stem(doc.name);
          this.remember();
        } catch (error) {
          this.flash(error.message);
        }
      };
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(true);
        if (event.key === "Escape") finish(false);
      });
      input.addEventListener("blur", () => finish(true), { once: true });
      this.title.replaceWith(input);
      input.focus();
      input.select();
    }

    async deleteNote() {
      if (!this.doc) return;
      const doc = this.doc;
      try {
        const key = await Notes.remove(doc);
        X.toast(this.toasts, `Deleted “${stem(doc.name)}”.`, {
          label: "Undo", ms: UNDO_DELETE - 400, run: async () => {
            const back = Notes.undoDelete(key);
            if (!back) return;
            this.setStorage(back.storage);
            await this.openNote(back.storage, back.name);
          },
        });
      } catch (error) {
        this.flash(error.message);
      }
    }

    // -------------------------------------------------------------- export

    openPopup(anchor, content) {
      this.popup.textContent = "";
      this.popup.append(content);
      this.popup.hidden = false;
      const main = this.main.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      this.popup.style.top = `${a.bottom - main.top + 4}px`;
      const width = Math.min(360, main.width - 16);
      this.popup.style.width = `${width}px`;
      this.popup.style.left = `${Math.max(8, Math.min(a.right - main.left - width, main.width - width - 8))}px`;
      anchor.classList.add("nb-popup-opener");
    }

    closePopup() {
      const wasOpen = !this.popup.hidden;
      this.popup.hidden = true;
      this.popup.textContent = "";
      if (this.keepEditing) {
        this.keepEditing = false;
        if (wasOpen && this.doc && this.doc.storage === "md" && this.editing) {
          const [a, b] = this.mdSel || [this.source.value.length, this.source.value.length];
          this.source.focus({ preventScroll: true });
          this.source.setSelectionRange(a, b);
        }
      }
    }

    showExport(anchor) {
      if (!this.doc) return;
      const doc = this.doc;
      const saved = local.get();
      const format = el("select", { class: "nb-select", "aria-label": "Format" },
        EXPORTS[doc.storage].map(([value, label]) => el("option", { value, text: label })));
      const folder = el("input", { class: "nb-folder-input", type: "text", value: saved.exportFolder || "", placeholder: "Folder, e.g. D:\\Notes", "aria-label": "Folder" });
      folder.addEventListener("keydown", (event) => event.stopPropagation());
      const message = el("div", { class: "nb-export-msg" });
      const browser = el("div", { class: "nb-browser", hidden: true });
      const say = (text, isError) => {
        message.textContent = text;
        message.classList.toggle("nb-error", Boolean(isError));
      };

      const download = async () => {
        await Notes.flush(doc);
        try {
          const data = await api("GET", "/export?" + q({ storage: doc.storage, name: doc.name, format: format.value }));
          const type = data.filename.endsWith(".html") ? "text/html" : data.filename.endsWith(".md") ? "text/markdown" : "text/plain";
          const url = URL.createObjectURL(new Blob([data.text], { type: type + ";charset=utf-8" }));
          const a = el("a", { href: url, download: data.filename });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          say(`Downloaded ${data.filename}.`);
        } catch (error) {
          say(error.message, true);
        }
      };
      const print = async () => {
        await Notes.flush(doc);
        try {
          const data = await api("GET", "/export?" + q({ storage: doc.storage, name: doc.name, format: "html" }));
          X.printPage(data.text);
          say("The print dialog can also save it as PDF.");
        } catch (error) {
          say(error.message, true);
        }
      };
      const toFolder = async (overwrite = false) => {
        await Notes.flush(doc);
        local.set({ exportFolder: folder.value.trim() });
        try {
          const data = await api("POST", "/export", { storage: doc.storage, name: doc.name, format: format.value, folder: folder.value, overwrite });
          say(`Saved ${data.path}`);
        } catch (error) {
          if (error.status === 409 && confirm(`${error.message} Replace it?`)) return toFolder(true);
          say(error.message, true);
        }
      };
      const browse = async (path) => {
        browser.hidden = false;
        browser.textContent = "Loading…";
        try {
          const data = await api("GET", "/folders?" + q({ path: path || "" }));
          folder.value = data.path;
          browser.textContent = "";
          const row = (label, target, iconName) => el("button", { class: "nb-item nb-folder-row", type: "button", onclick: () => browse(target) },
            el("span", { class: "nb-item-name" }, icon(iconName), el("span", { text: label })));
          if (data.drives.length) browser.append(el("div", { class: "nb-drives" },
            data.drives.map((d) => el("button", { class: "nb-btn nb-outline", type: "button", text: d, onclick: () => browse(d) }))));
          if (data.parent) browser.append(row("..", data.parent, "up"));
          for (const name of data.folders) browser.append(row(name, data.path.replace(/[\\/]$/, "") + (data.path.includes("\\") ? "\\" : "/") + name, "folder"));
          if (!data.folders.length) browser.append(el("div", { class: "nb-list-empty", text: "No folders inside." }));
        } catch (error) {
          browser.textContent = error.message;
        }
      };

      this.openPopup(anchor, el("div", { class: "nb-popup-body" },
        el("strong", { text: `Export "${stem(doc.name)}"` }),
        el("label", {}, el("span", { text: "Format" }), format),
        el("button", { class: "nb-btn nb-primary nb-wide", type: "button", onclick: download }, icon("import"), el("span", { text: "Download" })),
        el("button", { class: "nb-btn nb-outline nb-wide", type: "button", onclick: print }, icon("printer"), el("span", { text: "Print or save as PDF" })),
        el("div", { class: "nb-or", text: "or save into a folder on this computer" }),
        el("div", { class: "nb-folder-row-input" }, folder,
          el("button", { class: "nb-btn nb-outline", type: "button", title: "Browse folders", onclick: () => (browser.hidden ? browse(folder.value) : (browser.hidden = true)) }, icon("folder"))),
        browser,
        el("button", { class: "nb-btn nb-outline nb-wide", type: "button", onclick: () => toFolder(false) }, icon("save"), el("span", { text: "Save to folder" })),
        message));
    }

    // -------------------------------------------------------------- history

    async toggleHistory() {
      if (!this.doc) return;
      const doc = this.doc;
      this.historyOpen = !this.historyOpen;
      this.applyLayout();
      if (!this.historyOpen) return;
      this.history.textContent = "Loading…";
      await Notes.flush(doc);
      let versions = [];
      try {
        versions = (await api("GET", "/history?" + q({ storage: doc.storage, name: doc.name }))).versions;
      } catch (error) {
        this.history.textContent = error.message;
        return;
      }
      const viewer = el("div", { class: "nb-version-text" + (doc.storage === "rich" ? " nb-version-rich" : "") });
      const list = el("div", { class: "nb-versions" });
      let mode = "version";
      let chosen = null;
      const modes = el("div", { class: "nb-segmented", role: "tablist" });
      const show = async () => {
        for (const b of modes.children) b.classList.toggle("nb-active", b.dataset.mode === mode);
        if (!chosen) return;
        viewer.textContent = "Loading…";
        try {
          if (mode === "changes") {
            const data = await api("GET", "/diff?" + q({ storage: doc.storage, name: doc.name, id: chosen.id }));
            viewer.textContent = "";
            viewer.classList.add("nb-diff-view");
            viewer.append(X.renderDiff(data.ops));
            return;
          }
          viewer.classList.remove("nb-diff-view");
          const data = await api("GET", "/version?" + q({ storage: doc.storage, name: doc.name, id: chosen.id }));
          if (doc.storage === "rich") {
            // shown in a sealed frame, the way the page looks in the editor
            viewer.textContent = "";
            viewer.append(el("iframe", {
              class: "nb-version-frame", sandbox: "", title: "Earlier version",
              srcdoc: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${window.NotebookRich.FRAME_CSS}</style></head><body class="nbr-compact">${data.text}</body></html>`,
            }));
          } else {
            viewer.textContent = data.text;
          }
        } catch (error) {
          viewer.textContent = error.message;
        }
      };
      for (const [value, label] of [["version", "This version"], ["changes", "Changes since then"]]) {
        const b = el("button", { class: "nb-btn", type: "button", role: "tab", "data-mode": value, text: label, onclick: () => {
          mode = value;
          show();
        } });
        modes.append(b);
      }
      this.history.textContent = "";
      this.history.append(el("div", { class: "nb-history-head" },
        el("strong", { text: "Earlier versions" }),
        el("span", { class: "nb-hint", text: "Kept every 10 minutes of editing and on Ctrl+S; the newest 10." }),
        el("span", { class: "nb-spacer" }), modes,
        el("button", { class: "nb-btn nb-outline", type: "button", text: "Close", onclick: () => this.toggleHistory() })),
        el("div", { class: "nb-history-body" }, list, viewer));
      if (!versions.length) list.append(el("div", { class: "nb-list-empty", text: "No earlier versions yet." }));
      viewer.append(el("div", { class: "nb-list-empty", text: versions.length ? "Pick a version on the left." : "" }));
      for (const version of versions) {
        const date = new Date(version.time * 1000);
        const pick = el("button", {
          class: "nb-item", type: "button", onclick: () => {
            for (const other of list.querySelectorAll(".nb-item")) other.classList.remove("nb-current");
            pick.classList.add("nb-current");
            chosen = version;
            show();
          },
        }, el("span", { class: "nb-item-name", text: date.toLocaleString() }), el("span", { class: "nb-item-meta", text: `${version.size} bytes` }));
        list.append(el("div", { class: "nb-version" }, pick,
          el("button", {
            class: "nb-btn nb-outline", type: "button", text: "Restore", onclick: async () => {
              const data = await api("POST", "/restore", { storage: doc.storage, name: doc.name, id: version.id });
              Object.assign(doc, { text: data.text, mtime: data.mtime, dirty: false, conflict: false });
              if (doc.storage === "md") this.source.value = data.text;
              else this.rich.setHTML(data.text);
              Notes.emit("text", doc, this);
              Notes.emit("status", doc);
              this.toggleHistory();
              this.schedulePreview(0);
            },
          })));
      }
      modes.firstChild.classList.add("nb-active");
    }

    // -------------------------------------------------------------- the WebUI: parameters in, parameters out

    async captureGeneration() {
      if (!this.doc) return this.flash("Open a note first.");
      const gen = X.lastGeneration();
      if (!gen) return this.flash("No generated image yet: generate one, then capture it.");
      let url = null;
      if (gen.imageSrc) {
        try {
          const blob = await (await fetch(gen.imageSrc, { credentials: "same-origin" })).blob();
          if (blob.type.startsWith("image/")) url = await X.uploadBlob(blob, 768);
        } catch {
          url = null;          // the parameters alone
        }
      }
      this.insertGeneration(gen.infotext, url);
      X.toast(this.toasts, `Added the ${gen.tab} parameters${url ? " and picture" : ""}.`);
    }

    insertGeneration(infotext, url) {
      if (this.doc.storage === "rich") return this.rich.insertParams(infotext, url);
      this.insertMarkdown((url ? `![Generated image](${url})\n\n` : "") + "```params\n" + infotext.trim() + "\n```\n", true);
    }

    send(infotext, tab) {
      try {
        X.sendToTab(infotext, tab);
        if (!Float.box.hidden && this === Float.view) Float.minimise(true);
      } catch (error) {
        this.flash(error.message);
      }
    }

    // text into the Markdown source: at the cursor, or at the end when not editing
    insertMarkdown(text, asBlock = false) {
      const src = this.source;
      const value = src.value;
      let [start, end] = this.mdSel || [value.length, value.length];
      this.mdSel = null;
      if (!this.editing && this.mdMode !== "split" && document.activeElement !== src) start = end = value.length;
      let prefix = "";
      if (asBlock && start > 0) {
        const before = value.slice(0, start);
        prefix = before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      }
      src.value = value.slice(0, start) + prefix + text + value.slice(end);
      const caret = start + prefix.length + text.length;
      src.setSelectionRange(caret, caret);
      Notes.edit(this.doc, src.value, this);
      this.schedulePreview(0);
    }

    async addPicturesToMarkdown(files) {
      if (!this.doc || this.doc.storage !== "md") return;
      this.mdSel = [this.source.selectionStart, this.source.selectionEnd];
      for (const file of files) {
        try {
          const info = /png|jpe?g|webp/.test(file.type) ? await X.readImageInfo(file) : { infotext: "" };
          const url = await X.uploadBlob(file);
          if (info.infotext) this.insertGeneration(info.infotext, url);
          else this.insertMarkdown(`![${(file.name || "picture").replace(/\.[a-z]+$/i, "").replace(/[\[\]]/g, "")}](${url})\n`, true);
          this.mdSel = [this.source.selectionStart, this.source.selectionEnd];
        } catch (error) {
          this.flash(error.message);
        }
      }
    }

    async onMdDrop(event) {
      const dt = event.dataTransfer;
      if (!this.doc || !dt) return;
      let files = [...(dt.files || [])].filter((f) => f.type.startsWith("image/"));
      const url = !files.length && (dt.getData("text/uri-list") || "").split("\n").find((u) => u && !u.startsWith("#"));
      if (!files.length && !url) return;
      event.preventDefault();
      if (!files.length) {
        try {
          const blob = await (await fetch(url.trim(), { credentials: "same-origin" })).blob();
          if (!blob.type.startsWith("image/")) return;
          files = [new File([blob], "image" + (blob.type === "image/png" ? ".png" : ".jpg"), { type: blob.type })];
        } catch {
          return;
        }
      }
      this.addPicturesToMarkdown(files);
    }

    // ```params blocks in the formatted note get their buttons
    decorateRendered() {
      for (const code of this.rendered.querySelectorAll("pre > code.language-params")) {
        const pre = code.parentElement;
        const text = code.textContent.trim();
        const act = (label, title, fn) => el("button", { class: "nb-btn nb-outline", type: "button", title, text: label, onclick: fn });
        const bar = el("div", { class: "nb-params-bar" }, el("span", { class: "nb-params-label", text: "Parameters" }),
          act("Send to txt2img", "Put these parameters into txt2img", () => this.send(text, "txt2img")),
          act("Send to img2img", "Put these parameters into img2img", () => this.send(text, "img2img")),
          act("Copy", "Copy the parameters", () => this.copy(text)));
        const box = el("div", { class: "nb-params-box" });
        pre.replaceWith(box);
        box.append(bar, pre);
      }
    }

    copy(text) {
      const done = () => X.toast(this.toasts, "Copied.");
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => undefined);
      else {
        const area = el("textarea", { style: "position: fixed; left: -9999px" });
        area.value = text;
        document.body.append(area);
        area.select();
        document.execCommand("copy");
        area.remove();
        done();
      }
    }

    // -------------------------------------------------------------- snippets, links between notes

    openSnippets() {
      if (!this.doc) return;
      let selected = "";
      if (this.doc.storage === "md") {
        const { selectionStart: a, selectionEnd: b } = this.source;
        this.mdSel = [a, b];
        selected = this.editing || this.mdMode === "split" ? this.source.value.slice(a, b) : "";
        this.keepEditing = this.editing;        // the Markdown stays open under the panel
      } else {
        selected = this.rich.selectedText();
        this.rich.saveSelection();
      }
      this.openPopup(this.snippetButton, X.snippetPanel({
        selected,
        onPick: (text) => {
          this.closePopup();
          this.insertSnippet(text);
        },
        onClose: () => this.closePopup(),
      }));
    }

    insertSnippet(text) {
      if (this.doc.storage === "rich") return this.rich.insertText(text);
      const sel = [this.source.selectionStart, this.source.selectionEnd];
      this.startEditing();
      this.mdSel = sel;
      this.insertMarkdown(text);
      this.source.focus();
    }

    async openLinkedNote(name) {
      const target = String(name || "").trim();
      if (!target) return;
      const order = [...new Set([this.doc ? this.doc.storage : this.storage, ...Object.keys(STORAGES)])];
      for (const storage of order) {
        const item = Notes.visible(storage).find((n) => stem(n.name).toLowerCase() === target.toLowerCase());
        if (item) {
          this.setStorage(storage);
          return this.openNote(storage, item.name);
        }
      }
      if (!confirm(`There is no note called “${target}”. Create it?`)) return;
      const storage = order[0];
      try {
        const created = await Notes.create(storage, target + STORAGES[storage].ext);
        this.setStorage(storage);
        await this.openNote(storage, created);
      } catch (error) {
        this.flash(error.message);
      }
    }

    // -------------------------------------------------------------- pins, tags, more

    togglePin() {
      if (!this.doc) return;
      const item = Notes.item(this.doc.storage, this.doc.name);
      Notes.setMeta(this.doc, { pinned: !(item && item.pinned) }).catch((error) => this.flash(error.message));
    }

    showTags(anchor) {
      if (!this.doc) return;
      const doc = this.doc;
      const item = Notes.item(doc.storage, doc.name);
      let tags = [...((item && item.tags) || [])];
      const chips = el("div", { class: "nb-chip-row" });
      const input = el("input", { class: "nb-search-input", type: "text", placeholder: "Add a tag and press Enter", "aria-label": "Add a tag" });
      const suggestions = el("div", { class: "nb-chip-row" });
      const save = () => Notes.setMeta(doc, { tags }).catch((error) => this.flash(error.message));
      const draw = () => {
        chips.textContent = "";
        if (!tags.length) chips.append(el("span", { class: "nb-hint", text: "No tags yet." }));
        for (const t of tags) {
          chips.append(el("span", { class: "nb-chip nb-chip-edit" }, "#" + t,
            el("button", { type: "button", class: "nb-chip-x", title: `Remove #${t}`, "aria-label": `Remove #${t}`, text: "×", onclick: () => {
              tags = tags.filter((x) => x !== t);
              save();
              draw();
            } })));
        }
        suggestions.textContent = "";
        const typed = cleanTag(input.value);
        for (const t of Notes.allTags().filter((x) => !tags.includes(x) && (!typed || x.includes(typed))).slice(0, 12)) {
          suggestions.append(el("button", { class: "nb-chip nb-chip-filter", type: "button", text: "#" + t, onclick: () => add(t) }));
        }
      };
      const add = (value) => {
        const t = cleanTag(value);
        input.value = "";
        if (t && !tags.includes(t) && tags.length < 12) {
          tags.push(t);
          save();
        }
        draw();
        input.focus();
      };
      input.addEventListener("input", draw);
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          add(input.value);
        } else if (event.key === "Escape") this.closePopup();
      });
      draw();
      this.openPopup(anchor, el("div", { class: "nb-popup-body" }, el("strong", { text: "Tags" }), chips, input,
        el("div", { class: "nb-or", text: "Used on other notes" }), suggestions,
        el("div", { class: "nb-hint", text: "Search #tag to find tagged notes in both storages." })));
      input.focus();
    }

    showMore(anchor) {
      if (!this.doc) return;
      const doc = this.doc;
      const other = doc.storage === "md" ? "rich" : "md";
      const item = (label, fn, extra) => el("button", { class: "nb-menu-item", type: "button", onclick: () => fn() }, el("span", { text: label }), extra || null);
      const darkOn = Boolean(local.get().darkPage);
      const pinned = Boolean((Notes.item(doc.storage, doc.name) || {}).pinned);
      const body = el("div", { class: "nb-popup-body nb-menu" },
        this.compact ? item("Save now and keep this version (Ctrl+S)", () => {
          Notes.save(doc, { snapshot: true });
          this.closePopup();
        }) : null,
        this.compact ? item(pinned ? "Unpin" : "Pin to the top of the list", () => {
          this.togglePin();
          this.closePopup();
        }) : null,
        this.compact ? item("Tags…", () => this.showTags(anchor)) : null,
        item(`Copy as a ${STORAGES[other].label.toLowerCase()} note`, () => this.convertNote()),
        item("Save as a template…", () => this.showSaveTemplate(anchor)),
        doc.storage === "rich" ? item("Dark page", () => {
          local.set({ darkPage: !darkOn });
          for (const view of Notes.listeners) if (view.rich) view.rich.setDarkPage(!darkOn);
          this.closePopup();
        }, el("span", { class: "nb-check-mark", text: darkOn ? "✓" : "" })) : null,
        item("Keyboard shortcuts (Ctrl+/)", () => this.openPopup(anchor, X.shortcutsPanel())),
        item("Back up all notes (.zip)", () => {
          const a = el("a", { href: API + "/backup", download: "" });
          document.body.append(a);
          a.click();
          a.remove();
          this.closePopup();
        }),
        el("div", { class: "nb-hint", text: "Import a backup .zip with the import button above the list." }));
      this.openPopup(anchor, body);
    }

    async convertNote() {
      const doc = this.doc;
      this.closePopup();
      try {
        await Notes.flush(doc);
        const made = await api("POST", "/convert", { storage: doc.storage, name: doc.name });
        await Notes.refresh();
        this.setStorage(made.storage);
        await this.openNote(made.storage, made.name);
        X.toast(this.toasts, `Made “${stem(made.name)}” in ${STORAGES[made.storage].label}; the original is kept.`);
      } catch (error) {
        this.flash(error.message);
      }
    }

    async showSaveTemplate(anchor) {
      const doc = this.doc;
      const title = el("input", { class: "nb-search-input", type: "text", value: stem(doc.name), "aria-label": "Template name" });
      const list = el("div", { class: "nb-template-list" });
      const message = el("div", { class: "nb-export-msg" });
      const drawList = async () => {
        list.textContent = "";
        const data = await api("GET", "/templates?" + q({ storage: doc.storage }));
        for (const t of data.templates.filter((x) => !x.builtin)) {
          list.append(el("div", { class: "nb-template-row" }, el("span", { text: t.label }),
            el("button", { class: "nb-btn nb-snippet-del", type: "button", text: "×", title: `Delete the template ${t.label}`, "aria-label": `Delete the template ${t.label}`,
              onclick: async () => {
                await api("POST", "/template/delete", { id: t.id, storage: doc.storage });
                drawList();
              } })));
        }
        if (!list.children.length) list.append(el("div", { class: "nb-hint", text: "No saved templates yet." }));
      };
      const save = async () => {
        await Notes.flush(doc);
        try {
          const made = await api("POST", "/template", { storage: doc.storage, name: doc.name, title: title.value.trim() });
          message.textContent = `Saved. New ${STORAGES[doc.storage].label.toLowerCase()} notes can start from “${made.label}”.`;
          drawList();
        } catch (error) {
          message.textContent = error.message;
        }
      };
      title.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") save();
      });
      this.openPopup(anchor, el("div", { class: "nb-popup-body" }, el("strong", { text: "Save as a template" }),
        el("div", { class: "nb-folder-row-input" }, title, el("button", { class: "nb-btn nb-primary", type: "button", text: "Save", onclick: save })),
        message, el("div", { class: "nb-or", text: `Saved ${STORAGES[doc.storage].label.toLowerCase()} templates` }), list));
      drawList().catch(() => undefined);
      title.select();
    }

    flash(message) {
      this.banner.hidden = false;
      this.banner.textContent = message;
      setTimeout(() => this.renderStatus(), 4000);
    }
  }

  // ------------------------------------------------------------------ floating window

  const Float = {
    build() {
      const saved = local.get().float || {};
      this.box = el("div", { id: "notebook-float", class: "nb-float", hidden: true, role: "dialog", "aria-label": "Notebook" });
      const header = el("div", { class: "nb-float-head" },
        icon("note"), el("span", { class: "nb-float-title", text: "Notebook" }), el("span", { class: "nb-spacer" }),
        button("minus", "Minimise", () => this.minimise()),
        button("close", "Close (Alt+N)", () => this.toggle(false)));
      this.body = el("div", { class: "nb-float-body" });
      this.box.append(header, this.body);
      document.body.append(this.box);
      const width = saved.width || 480;
      const height = saved.height || 500;
      Object.assign(this.box.style, {
        width: width + "px",
        height: height + "px",
        left: (saved.left ?? window.innerWidth - width - 24) + "px",
        top: (saved.top ?? window.innerHeight - height - 84) + "px",
      });
      this.keepInside();
      this.view = new View(this.body, { compact: true, key: "floatView" });
      this.drag(header);
      new ResizeObserver(() => this.rememberGeometry()).observe(this.box);
      window.addEventListener("resize", () => this.keepInside());

      this.fab = el("button", { id: "notebook-fab", class: "nb-fab", type: "button", title: "Notebook (Alt+N)", "aria-label": "Notebook", onclick: () => this.toggle() }, icon("note"));
      document.body.append(this.fab);
      this.fab.hidden = !option("notebook_float_button", true);
      if (saved.open) this.toggle(true);
      if (saved.minimised) this.minimise(true);
    },

    toggle(force) {
      const open = force === undefined ? this.box.hidden : force;
      this.box.hidden = !open;
      this.fab.classList.toggle("nb-active", open);
      local.set({ float: { ...local.get().float, open } });
      if (open) {
        this.keepInside();
        if (!this.view.doc) this.view.toggleList(true);
      }
    },

    minimise(force) {
      const min = force === undefined ? !this.box.classList.contains("nb-min") : force;
      this.box.classList.toggle("nb-min", min);
      local.set({ float: { ...local.get().float, minimised: min } });
    },

    drag(handle) {
      let start = null;
      handle.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        const rect = this.box.getBoundingClientRect();
        start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener("pointermove", (event) => {
        if (!start) return;
        this.box.style.left = start.left + event.clientX - start.x + "px";
        this.box.style.top = start.top + event.clientY - start.y + "px";
        this.keepInside();
      });
      handle.addEventListener("pointerup", () => {
        start = null;
        this.rememberGeometry();
      });
      handle.addEventListener("dblclick", (event) => {
        if (!event.target.closest("button")) this.minimise();
      });
    },

    keepInside() {
      const box = this.box;
      const left = parseFloat(box.style.left) || 0;
      const top = parseFloat(box.style.top) || 0;
      const width = box.offsetWidth || parseFloat(box.style.width) || 200;
      const maxLeft = Math.max(0, window.innerWidth - Math.min(width, window.innerWidth));
      const maxTop = Math.max(0, window.innerHeight - 40);
      box.style.left = Math.min(Math.max(0, left), maxLeft) + "px";
      box.style.top = Math.min(Math.max(0, top), maxTop) + "px";
    },

    rememberGeometry() {
      if (this.box.hidden || this.box.classList.contains("nb-min")) return;
      const rect = this.box.getBoundingClientRect();
      local.set({ float: { ...local.get().float, left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } });
    },
  };

  // ------------------------------------------------------------------ start

  // Alt+N, from the page or from inside a rich-text note's frame
  function globalKeys(event) {
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyN") {
      Float.toggle();
      return true;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyG") {
      captureToOpenNote();
      return true;
    }
    return false;
  }

  // Alt+G: into the note open in the floating window, else the one in the tab
  function captureToOpenNote() {
    const tabView = window.notebook && window.notebook.tabView;
    const tabOnScreen = tabView && tabView.root.offsetParent;
    let target = null;
    if (!Float.box.hidden && Float.view.doc) target = Float.view;
    else if (tabOnScreen && tabView.doc) target = tabView;
    else if (Float.view.doc) target = Float.view;
    else if (tabView && tabView.doc) target = tabView;
    if (!target || target === Float.view) Float.toggle(true);
    if (!target) return Float.view.flash("Open a note first, then press Alt+G.");
    target.captureGeneration();
  }

  function start() {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    const mount = app.querySelector("#notebook-root");
    // Gradio's "prose" text styles are meant for its Markdown and HTML blocks, not for an editor
    if (mount) for (let node = mount.parentElement; node && node !== app; node = node.parentElement) node.classList.remove("prose");
    let tabView = null;
    if (mount) tabView = new View(mount, { compact: false, key: "tabView" });
    Float.build();
    Notes.refresh().catch((error) => {
      if (mount) mount.textContent = "Notebook: " + error.message;
    });
    setInterval(() => {
      if (!document.hidden) Notes.poll().catch(() => undefined);
    }, POLL_EVERY);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) Notes.poll().catch(() => undefined);
    });
    window.addEventListener("focus", () => Notes.poll().catch(() => undefined));

    document.addEventListener("keydown", (event) => {
      if (globalKeys(event)) event.preventDefault();
    }, true);
    window.addEventListener("beforeunload", (event) => {
      // deletes waiting for Undo happen now
      for (const [key, pending] of Notes.pending) {
        clearTimeout(pending.timer);
        Notes.pending.delete(key);
        fetch(API + "/delete", {
          method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storage: pending.doc.storage, name: pending.doc.name }),
        });
      }
      const dirty = Notes.dirtyDocs();
      if (!dirty.length) return;
      for (const doc of dirty) {
        // one last try; the browser may not wait for it
        fetch(API + "/note", {
          method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storage: doc.storage, name: doc.name, text: doc.text, base_mtime: doc.mtime }),
        });
      }
      event.preventDefault();
      event.returnValue = "";
    });
    window.notebook = { Notes, Float, tabView, cleanHtml: window.NotebookRich.cleanHtml };     // for other extensions and for tests
  }

  if (typeof onUiLoaded === "function") onUiLoaded(start);
  else document.addEventListener("DOMContentLoaded", start);
})();
