/* Notebook: what the tab, the floating window and the rich-text editor share
 * beyond the notes themselves:
 *
 *   pictures     kept as files in notes/assets/, uploaded once, shown by URL
 *   WebUI        the parameters of the image just generated, and sending
 *                parameters back to txt2img / img2img
 *   snippets     saved bits of prompt, inserted anywhere
 *   small UI     the snippet panel, version differences, keyboard shortcuts,
 *                a toast with Undo, printing
 */
(function () {
  "use strict";
  if (window.NotebookExtras) return;

  const API = "/notebook/api";

  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) if (child != null) node.append(child);
    return node;
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

  // ------------------------------------------------------------------ pictures

  const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The picture could not be read."));
      img.src = src;
    });
  }

  // a smaller JPEG (or the original when it is small already)
  async function shrink(blob, maxEdge = 1600, maxBytes = 350000) {
    const original = await readAsDataUrl(blob);
    const img = await loadImage(original);
    const w0 = img.naturalWidth || 1;
    const h0 = img.naturalHeight || 1;
    if (blob.size <= maxBytes && Math.max(w0, h0) <= maxEdge && /^data:image\/(png|jpeg|webp|gif)/.test(original)) return original;
    const scale = Math.min(1, maxEdge / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  }

  async function uploadDataUrl(dataUrl) {
    return (await api("POST", "/asset", { data: dataUrl })).url;
  }

  async function uploadBlob(blob, maxEdge = 1600) {
    return uploadDataUrl(await shrink(blob, maxEdge));
  }

  async function readImageInfo(blob) {
    try {
      return await api("POST", "/image-info", { data: await readAsDataUrl(blob) });
    } catch {
      return { infotext: "" };
    }
  }

  // ------------------------------------------------------------------ the WebUI

  const app = () => (typeof gradioApp === "function" ? gradioApp() : document);
  const visible = (node) => Boolean(node && (node.offsetParent || node.getClientRects().length));
  const GEN_TABS = ["txt2img", "img2img"];

  function currentTab() {
    return GEN_TABS.find((tab) => visible(app().querySelector(`#tab_${tab}`))) || null;
  }

  function galleryImages(tab) {
    const root = app().querySelector(`#${tab}_gallery`);
    if (!root) return { thumbs: [], all: [] };
    const all = [...root.querySelectorAll("img")].filter((img) => img.src && !img.src.startsWith("data:image/svg"));
    const thumbs = [...root.querySelectorAll(".thumbnail-item img, .thumbnails img, button.thumbnail-item img")];
    return { thumbs, all };
  }

  // The parameters (and picture) of the image generated last: the selected one
  // in the gallery of the tab on screen, else of the other tab.
  function lastGeneration() {
    const here = currentTab();
    const order = here ? [here, ...GEN_TABS.filter((t) => t !== here)] : GEN_TABS;
    for (const tab of order) {
      const box = app().querySelector(`#generation_info_${tab} textarea, #generation_info_${tab} input`);
      let data = null;
      try {
        data = box && box.value ? JSON.parse(box.value) : null;
      } catch {
        data = null;
      }
      const infotexts = (data && data.infotexts) || [];
      let index = -1;
      if (tab === here && typeof selected_gallery_index === "function") {
        try {
          index = selected_gallery_index();
        } catch {
          index = -1;
        }
      }
      const first = (data && data.index_of_first_image) || 0;
      let infotext = infotexts[index] || infotexts[first] || (data && data.infotext) || "";
      if (!infotext) {
        const html = app().querySelector(`#html_info_${tab}`);
        infotext = html ? (html.innerText || "").trim() : "";
        if (infotext && !/Steps:/.test(infotext)) infotext = "";
      }
      if (!infotext) continue;
      const { thumbs, all } = galleryImages(tab);
      const img = (index >= 0 && thumbs[index]) || thumbs[first] || all[0] || null;
      return { tab, infotext: infotext.trim(), imageSrc: img ? img.src : null };
    }
    return null;
  }

  // Put parameters into txt2img / img2img, the way PNG Info's "Send to" does:
  // the text goes into the prompt box, and the ↙ button spreads it over the fields.
  function sendToTab(infotext, tab) {
    const prompt = app().querySelector(`#${tab}_prompt textarea`);
    // the ↙ button of that tab ("Read generation parameters from prompt")
    const paste = app().querySelector(`#${tab}_toprow #paste, #tab_${tab} #paste, #${tab}_paste`);
    if (!prompt || !paste) throw new Error(`The ${tab} tab was not found.`);
    const switcher = window[`switch_to_${tab}`];
    if (typeof switcher === "function") switcher();
    else {
      const button = [...app().querySelectorAll("#tabs button")].find((b) => b.textContent.trim().toLowerCase() === tab);
      if (button) button.click();
    }
    prompt.value = infotext;
    if (typeof updateInput === "function") updateInput(prompt);
    else prompt.dispatchEvent(new Event("input", { bubbles: true }));
    setTimeout(() => paste.click(), 60);
  }

  // prompt / negative prompt / the rest, for display
  function splitInfotext(text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    let paramsAt = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) if (/^(Steps|Sampler|Seed|Size|Model|CFG scale): /.test(lines[i])) { paramsAt = i; break; }
    const head = lines.slice(0, paramsAt);
    const neg = head.findIndex((l) => l.startsWith("Negative prompt:"));
    return {
      prompt: (neg >= 0 ? head.slice(0, neg) : head).join("\n").trim(),
      negative: neg >= 0 ? head.slice(neg).join("\n").replace(/^Negative prompt:\s*/, "").trim() : "",
      params: lines.slice(paramsAt).join("\n").trim(),
    };
  }

  // ------------------------------------------------------------------ snippets

  const Snippets = {
    list: null,
    async load() {
      if (!this.list) this.list = (await api("GET", "/snippets")).snippets || [];
      return this.list;
    },
    async save(list) {
      this.list = (await api("PUT", "/snippets", { snippets: list })).snippets || [];
      return this.list;
    },
  };

  // A panel: search the snippets, Enter or a click inserts one; the selected
  // text can be saved as a new snippet.
  function snippetPanel({ selected = "", onPick, onClose }) {
    const box = el("div", { class: "nb-popup-body nb-snippets" });
    const search = el("input", { class: "nb-search-input", type: "search", placeholder: "Find a snippet", "aria-label": "Find a snippet" });
    const list = el("div", { class: "nb-snippet-list", role: "listbox" });
    const footer = el("div", { class: "nb-snippet-new" });
    let items = [];
    let active = 0;
    const draw = () => {
      const query = search.value.trim().toLowerCase();
      items = (Snippets.list || []).filter((s) => !query || s.name.toLowerCase().includes(query) || s.text.toLowerCase().includes(query));
      active = Math.min(active, Math.max(0, items.length - 1));
      list.textContent = "";
      if (!items.length) list.append(el("div", { class: "nb-list-empty", text: Snippets.list && Snippets.list.length ? "No snippet matches." : "No snippets yet. Select some text and save it below." }));
      items.forEach((s, i) => {
        const row = el("div", { class: "nb-snippet" + (i === active ? " nb-current" : ""), role: "option", title: s.text },
          el("button", { class: "nb-snippet-main", type: "button", onclick: () => onPick(s.text) },
            el("span", { class: "nb-snippet-name", text: s.name }), el("span", { class: "nb-snippet-text", text: s.text })),
          el("button", {
            class: "nb-btn nb-snippet-del", type: "button", title: `Delete the snippet ${s.name}`, "aria-label": `Delete the snippet ${s.name}`, text: "×",
            onclick: async () => {
              await Snippets.save(Snippets.list.filter((x) => x !== s));
              draw();
            },
          }));
        row.firstChild.addEventListener("mousedown", (e) => e.preventDefault());
        list.append(row);
      });
    };
    search.addEventListener("input", draw);
    search.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        active = (active + (event.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length);
        draw();
      } else if (event.key === "Enter" && items[active]) {
        event.preventDefault();
        onPick(items[active].text);
      } else if (event.key === "Escape") {
        onClose && onClose();
      }
    });
    if (selected.trim()) {
      const name = el("input", { class: "nb-search-input", type: "text", placeholder: "Name for the selected text", "aria-label": "Snippet name",
        value: selected.trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 40) });
      const add = async () => {
        const n = name.value.trim();
        if (!n) return name.focus();
        await Snippets.load();
        await Snippets.save([...Snippets.list.filter((s) => s.name.toLowerCase() !== n.toLowerCase()), { name: n, text: selected }]);
        draw();
      };
      name.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") add();
        else if (event.key === "Escape") onClose && onClose();
      });
      footer.append(el("div", { class: "nb-or", text: "Save the selected text as a snippet" }),
        el("div", { class: "nb-folder-row-input" }, name, el("button", { class: "nb-btn nb-primary", type: "button", text: "Save", onclick: add })));
    }
    box.append(el("strong", { text: "Snippets" }), search, list, footer);
    Snippets.load().then(draw).catch((e) => (list.textContent = e.message));
    setTimeout(() => search.focus(), 0);
    return box;
  }

  // ------------------------------------------------------------------ small UI

  function renderDiff(ops) {
    const out = el("div", { class: "nb-diff" });
    if (!ops.some(([op]) => op !== "=")) {
      out.append(el("div", { class: "nb-list-empty", text: "No differences: this version is the same as the note now." }));
      return out;
    }
    // unchanged stretches longer than 6 lines are folded
    let run = [];
    const flushRun = () => {
      if (run.length > 6) {
        run.slice(0, 2).forEach((l) => out.append(el("div", { class: "nb-diff-line", text: l || " " })));
        out.append(el("div", { class: "nb-diff-fold", text: `… ${run.length - 4} unchanged lines …` }));
        run.slice(-2).forEach((l) => out.append(el("div", { class: "nb-diff-line", text: l || " " })));
      } else {
        run.forEach((l) => out.append(el("div", { class: "nb-diff-line", text: l || " " })));
      }
      run = [];
    };
    for (const [op, line] of ops) {
      if (op === "=") {
        run.push(line);
        continue;
      }
      flushRun();
      out.append(el("div", { class: "nb-diff-line " + (op === "+" ? "nb-diff-add" : "nb-diff-del"), text: (op === "+" ? "+ " : "− ") + (line || " ") }));
    }
    flushRun();
    return out;
  }

  const SHORTCUTS = [
    ["Everywhere", [["Alt+N", "Open or close the floating Notebook"], ["Alt+G", "Put the last generated image and its parameters into the open note"]]],
    ["In a note", [["Ctrl+S", "Save now and keep a version"], ["Ctrl+;", "Snippets"], ["Ctrl+/", "This list"], ["Ctrl+F / Ctrl+H", "Find / find and replace"], ["Esc", "Markdown: show the note formatted · Rich text: stop drawing"]]],
    ["Rich text", [["Ctrl+B / I / U", "Bold / italic / underline"], ["Ctrl+= / Ctrl+Shift+=", "Subscript / superscript"], ["Ctrl+L / E / R / J", "Align left / center / right / justify"],
      ["Ctrl+K", "Link"], ["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Tab / Shift+Tab", "Next / previous cell; indent in a list"], ["Ctrl+click", "Open a link"]]],
  ];

  function shortcutsPanel() {
    const box = el("div", { class: "nb-popup-body nb-shortcuts" }, el("strong", { text: "Keyboard shortcuts" }));
    for (const [title, rows] of SHORTCUTS) {
      box.append(el("div", { class: "nb-or", text: title }),
        el("div", { class: "nb-keys" }, rows.flatMap(([keys, what]) => [el("kbd", { text: keys }), el("span", { text: what })])));
    }
    return box;
  }

  function toast(container, text, action) {
    const node = el("div", { class: "nb-toast", role: "status" }, el("span", { text }));
    if (action) node.append(el("button", { class: "nb-btn nb-toast-action", type: "button", text: action.label, onclick: () => {
      node.remove();
      action.run();
    } }));
    container.append(node);
    setTimeout(() => node.remove(), action && action.ms ? action.ms : 4500);
    return node;
  }

  // print an exported page (the browser's print dialog can save it as PDF)
  function printPage(html) {
    const frame = el("iframe", { class: "nb-print-frame", title: "Print", "aria-hidden": "true" });
    frame.srcdoc = html;
    frame.addEventListener("load", () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } finally {
        setTimeout(() => frame.remove(), 60000);
      }
    });
    document.body.append(frame);
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = "";
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(out);
  }

  window.NotebookExtras = {
    api, el, readAsDataUrl, shrink, uploadDataUrl, uploadBlob, readImageInfo,
    lastGeneration, sendToTab, splitInfotext, currentTab,
    Snippets, snippetPanel, renderDiff, shortcutsPanel, toast, printPage, toBase64,
  };
})();
