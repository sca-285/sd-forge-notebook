/* Notebook: the rich-text editor.
 *
 * The page is edited inside its own frame, so the WebUI and its themes cannot
 * restyle it: what you see is what gets saved and exported.
 *
 *   dock     undo / redo, paragraph style, font, size, bold / italic / underline /
 *            strike, sub / superscript, change case, clear, colours (text,
 *            highlight, shading), alignment, lists, indent, line spacing,
 *            insert (link, picture, table, line), draw, layout, find
 *   strips   under the dock, for what you are working on:
 *            Table    rows, columns, merge / split, sizes, cell alignment,
 *                     text direction, borders, shading, selecting cells
 *            Picture  width, delete
 *            Draw     pens, erasers, ink colour and size
 *            Parameters  send generation parameters to txt2img / img2img, copy
 *
 * Cells are selected by dragging across them (or Shift+click); column and
 * row borders can be dragged to resize. Undo and redo cover every change,
 * tables and ink included.
 */
(function () {
  "use strict";
  if (window.NotebookRich) return;

  // ------------------------------------------------------------------ helpers

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

  const ICONS = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M11 5h6M7 19h6M14 5l-4 14"/>',
    underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
    strike: '<path d="M4 12h16M16 6.5A4 4 0 0 0 12 5c-2.5 0-4 1.3-4 3 0 1.4.9 2.4 2.5 3M8 17.5A4.5 4.5 0 0 0 12 19c2.6 0 4.2-1.3 4.2-3.2"/>',
    sub: '<path d="M4 6l7 9M11 6l-7 9M16 20h4c0-1.5-4-2-4-4 0-1 1-1.6 2-1.6s2 .6 2 1.6"/>',
    sup: '<path d="M4 9l7 9M11 9l-7 9M16 9h4c0-1.5-4-2-4-4 0-1 1-1.6 2-1.6s2 .6 2 1.6"/>',
    left: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    center: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    right: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    justify: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
    bullets: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    numbers: '<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 13.5c.4-.9 2.5-1 2.5.3 0 .9-2.5 1.7-2.5 3.2H6"/>',
    indent: '<path d="M10 6h10M10 12h10M10 18h10M3 9l3 3-3 3"/>',
    outdent: '<path d="M10 6h10M10 12h10M10 18h10M6 9l-3 3 3 3"/>',
    clear: '<path d="M6 4h12M12 4l-3 16M4 20l16-16"/>',
    find: '<circle cx="10.5" cy="10.5" r="6"/><path d="m20 20-5-5"/>',
    color: '<path d="M6 16 12 3l6 13M8.5 11h7"/>',
    marker: '<path d="m9 11-4 4v3h3l4-4M13 7l4 4M11 9l6-6 4 4-6 6z"/>',
    shading: '<path d="M4 12 11 5l7 7-7 7z"/><path d="M11 5 8.5 2.5M18 12h1.5a1.5 1.5 0 0 1 1.5 1.5c0 1-1 2.3-1.5 3-.5-.7-1.5-2-1.5-3"/>',
    caret: '<path d="m7 10 5 5 5-5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
    rowAbove: '<rect x="3" y="12" width="18" height="8" rx="1"/><path d="M12 3v6M9 6h6"/>',
    rowBelow: '<rect x="3" y="4" width="18" height="8" rx="1"/><path d="M12 15v6M9 18h6"/>',
    colLeft: '<rect x="12" y="3" width="8" height="18" rx="1"/><path d="M3 12h6M6 9v6"/>',
    colRight: '<rect x="4" y="3" width="8" height="18" rx="1"/><path d="M15 12h6M18 9v6"/>',
    delete: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="m9 9 6 6M15 9l-6 6"/>',
    merge: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 12h10M14 9l3 3-3 3M10 9l-3 3 3 3"/>',
    split: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M5 12h4M7 10l-2 2 2 2M19 12h-4M17 10l2 2-2 2"/>',
    distRows: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 9h16M4 15h16M12 5v2M12 11v2M12 17v2"/>',
    distCols: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M15 4v16M5 12h2M11 12h2M17 12h2"/>',
    autofit: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 12h10M7 12l2-2M7 12l2 2M17 12l-2-2M17 12l-2 2"/>',
    direction: '<path d="M6 4v16M3 17l3 3 3-3M12 6h8M16 6v12"/>',
    borders: '<rect x="3" y="3" width="18" height="18"/><path d="M3 12h18M12 3v18" stroke-dasharray="2 2"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
    select: '<rect x="3" y="4" width="18" height="16" rx="1" stroke-dasharray="3 2"/><path d="M8 12h8"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.1l1.4-1.4a5 5 0 0 0-7.1-7.1L10.5 6"/><path d="M14 11a5 5 0 0 0-7.5-.1L5.1 12.3a5 5 0 0 0 7.1 7.1L13.5 18"/>',
    picture: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5.5-5.5L7 18"/>',
    columns: '<rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/>',
    hyphen: '<path d="M5 8v8M19 8v8M8 12h8"/>',
    unlink: '<path d="M9 13a5 5 0 0 0 7.1.4l.4-.4"/><path d="M15 11a5 5 0 0 0-7.1-.4L7.5 11"/><path d="M4 4l16 16"/>',
    type: '<path d="M4 20h16M8 16V6h8v10M10 6V4h4v2"/>',
    pencil: '<path d="M13 5 19 11M4 20l2.5-2.5L18 6l-2.5-2.5L4 15.5V20z"/>',
    fountain: '<path d="M12 3v4M8 21h8M9 17l3-10 3 10M9 17h6"/>',
    eraser: '<path d="m6 15 7-7 5 5-7 7H6v-5zM8 13l3 3"/>',
    strokeEraser: '<path d="m6 15 7-7 5 5-7 7H6v-5z"/><path d="M3 5c3-2 5 2 8 0s5-2 8 0" stroke-dasharray="2 2"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1.1-1.6-1.1-2.7 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
    spacing: '<path d="M11 6h10M11 12h10M11 18h10M5 4v16M3 6l2-2 2 2M3 18l2 2 2-2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    checklist: '<rect x="3" y="4" width="6" height="6" rx="1"/><path d="m4.5 7 1.2 1.2L8 6M12 7h9M12 17h9"/><rect x="3" y="14" width="6" height="6" rx="1"/>',
    cellAlign: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10h8M9.5 14h5"/>',
  };
  const icon = (name, size = 18) => {
    const span = el("span", { class: "nbr-icon" });
    span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
    return span;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const escapeRegExp = (text) => text.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");

  // ------------------------------------------------------------------ choices

  const TEXT_COLORS = [["#1F2328", "Ink"], ["#6B7280", "Slate"], ["#DC2626", "Red"], ["#EA580C", "Orange"], ["#CA8A04", "Amber"],
    ["#16A34A", "Green"], ["#0D9488", "Teal"], ["#2563EB", "Blue"], ["#7C3AED", "Violet"], ["#DB2777", "Pink"]];
  const HIGHLIGHTS = [["#FEF08A", "Lemon"], ["#FED7AA", "Peach"], ["#FECACA", "Rose"], ["#BBF7D0", "Mint"], ["#A5F3FC", "Sky"],
    ["#BFDBFE", "Cornflower"], ["#DDD6FE", "Lilac"], ["#FBCFE8", "Blush"], ["#E5E7EB", "Fog"]];
  const SHADES = [["#F3F4F6", "Mist"], ["#FEFCE8", "Cream"], ["#FFF7ED", "Apricot"], ["#FEF2F2", "Blossom"], ["#F0FDF4", "Sage"],
    ["#ECFEFF", "Ice"], ["#EFF6FF", "Cloud"], ["#F5F3FF", "Lavender"], ["#FDF2F8", "Petal"], ["#E5E7EB", "Stone"]];
  const CELL_EXTRA = [["#D1D5DB", "Pewter"], ["#1F2328", "Night"]];
  const INK_COLORS = [["#1F2328", "Black"], ["#DC2626", "Red"], ["#2563EB", "Blue"], ["#16A34A", "Green"], ["#EA580C", "Orange"],
    ["#7C3AED", "Violet"], ["#FACC15", "Yellow"], ["#FFFFFF", "White"]];
  const BORDER_COLORS = [["#000000", "Black"], ["#6B7280", "Grey"], ["#D1D5DB", "Light grey"], ["#DC2626", "Red"], ["#2563EB", "Blue"],
    ["#16A34A", "Green"], ["#CA8A04", "Amber"], ["#7C3AED", "Violet"]];
  const BORDER_STYLES = [["solid", "Solid ───"], ["dashed", "Dashed ‐ ‐ ‐"], ["dotted", "Dotted ·····"], ["double", "Double ═══"]];
  const BORDER_WIDTHS = ["1px", "1.5px", "2px", "3px", "4px"];
  const EDGES = [["all", "All borders"], ["outside", "Outside borders"], ["inside", "Inside borders"], ["none", "No border"],
    ["top", "Top border"], ["bottom", "Bottom border"], ["left", "Left border"], ["right", "Right border"],
    ["inside-h", "Inside horizontal border"], ["inside-v", "Inside vertical border"]];
  const BLOCK_STYLES = [["p", "Normal text"], ["h1", "Heading 1"], ["h2", "Heading 2"], ["h3", "Heading 3"], ["blockquote", "Quote"], ["pre", "Code"]];
  const ALIGNS = [["left", "Align left (Ctrl+L)", "justifyLeft"], ["center", "Center (Ctrl+E)", "justifyCenter"],
    ["right", "Align right (Ctrl+R)", "justifyRight"], ["justify", "Justify (Ctrl+J)", "justifyFull"]];
  const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];
  const DEFAULT_LINE = 1.5;
  const PARAGRAPH_GAPS = [["none", "None"], ["normal", "Normal"], ["wide", "Wide"]];
  const GAP_CSS = { none: "0px", wide: "1em" };
  const LANGS = [["en", "English"], ["vi", "Tiếng Việt"], ["fr", "Français"], ["de", "Deutsch"], ["es", "Español"]];
  const SENTINEL = "#010203";           // a colour nobody picks: marks what "no colour" must clear
  const SENTINEL_RGB = "rgb(1, 2, 3)";
  const SVG_NS = "http://www.w3.org/2000/svg";

  // a small square with the chosen edges drawn solid
  function edgeIcon(which) {
    const lines = {
      top: "M3 3h18", bottom: "M3 21h18", left: "M3 3v18", right: "M21 3v18", h: "M3 12h18", v: "M12 3v18",
    };
    const on = {
      all: ["top", "bottom", "left", "right", "h", "v"], outside: ["top", "bottom", "left", "right"], inside: ["h", "v"],
      none: [], top: ["top"], bottom: ["bottom"], left: ["left"], right: ["right"], "inside-h": ["h"], "inside-v": ["v"],
    }[which];
    const faint = Object.keys(lines).filter((k) => !on.includes(k)).map((k) => lines[k]).join("");
    const solid = on.map((k) => lines[k]).join("");
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round">`
      + `<path d="${faint}" stroke-width="1" stroke-dasharray="1.5 2" opacity=".55"/>${solid ? `<path d="${solid}" stroke-width="2.2"/>` : ""}</svg>`;
  }

  // ------------------------------------------------------------------ ink geometry
  // Stroke paths are "M x y L x y ..." (several runs when a stroke was cut).

  function parsePath(d) {
    const runs = [];
    let run = null;
    const tokens = String(d || "").match(/[MLml]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
    let command = "M";
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (/[MLml]/.test(token)) {
        command = token.toUpperCase();
        continue;
      }
      const x = parseFloat(token);
      const y = parseFloat(tokens[++i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) break;
      if (command === "M" || !run) {
        run = [];
        runs.push(run);
        command = "L";
      }
      run.push({ x, y });
    }
    return runs.filter((r) => r.length);
  }

  function pathData(runs) {
    const f = (p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    return runs.map((run) => `M ${f(run[0])} L ${(run.length > 1 ? run.slice(1) : run).map(f).join(" L ")}`).join(" ");
  }

  // where segment a-b is within r of c, as [t1, t2] along it; null when it is not
  function circleHit(a, b, c, r) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const fx = a.x - c.x, fy = a.y - c.y;
    const A = dx * dx + dy * dy;
    const C = fx * fx + fy * fy - r * r;
    if (A < 1e-9) return C < 0 ? [0, 1] : null;
    const B = 2 * (fx * dx + fy * dy);
    const disc = B * B - 4 * A * C;
    if (disc <= 0) return null;
    const s = Math.sqrt(disc);
    const t1 = (-B - s) / (2 * A);
    const t2 = (-B + s) / (2 * A);
    if (t2 <= 0 || t1 >= 1) return null;
    return [Math.max(0, t1), Math.min(1, t2)];
  }

  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  function touches(runs, c, r) {
    for (const run of runs) {
      if (run.length === 1 && circleHit(run[0], run[0], c, r)) return true;
      for (let i = 0; i < run.length - 1; i++) if (circleHit(run[i], run[i + 1], c, r)) return true;
    }
    return false;
  }

  // the runs with the disc (c, r) cut out of them; null when nothing was inside it
  function cutRuns(runs, c, r) {
    const out = [];
    let changed = false;
    for (const run of runs) {
      if (run.length === 1) {
        if (circleHit(run[0], run[0], c, r)) changed = true;
        else out.push(run);
        continue;
      }
      const pieces = [];
      let cut = false;
      let cur = [];
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i];
        const b = run[i + 1];
        const hit = circleHit(a, b, c, r);
        if (!hit) {
          if (!cur.length) cur.push(a);
          cur.push(b);
          continue;
        }
        cut = true;
        if (hit[0] > 0) {
          if (!cur.length) cur.push(a);
          cur.push(lerp(a, b, hit[0]));
        }
        if (cur.length > 1) pieces.push(cur);
        cur = [];
        if (hit[1] < 1) cur.push(lerp(a, b, hit[1]), b);
      }
      if (cur.length > 1) pieces.push(cur);
      if (!cut) {
        out.push(run);
        continue;
      }
      changed = true;
      // crumbs shorter than half a pixel are dropped
      for (const piece of pieces) if (piece.some((p) => Math.hypot(p.x - piece[0].x, p.y - piece[0].y) > 0.5)) out.push(piece);
    }
    return changed ? out : null;
  }

  // ------------------------------------------------------------------ tables as grids
  // A table with merged cells, as a grid of slots: which cell covers row r, column c.

  function tableGrid(table) {
    const rows = [...table.rows];
    const slots = rows.map(() => []);
    const pos = new Map();
    rows.forEach((tr, r) => {
      let c = 0;
      for (const cell of tr.cells) {
        while (slots[r][c]) c++;
        const rs = Math.max(1, cell.rowSpan || 1);
        const cs = Math.max(1, cell.colSpan || 1);
        pos.set(cell, { r, c, rs, cs });
        for (let i = 0; i < rs; i++) {
          if (!slots[r + i]) slots[r + i] = [];
          for (let j = 0; j < cs; j++) slots[r + i][c + j] = cell;
        }
        c += cs;
      }
    });
    const cols = Math.max(0, ...slots.map((row) => row.length));
    return { rows, slots: slots.slice(0, rows.length), pos, nrows: rows.length, ncols: cols };
  }

  // the smallest rectangle holding these cells whole
  function cellRect(grid, cells) {
    let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
    for (const cell of cells) {
      const p = grid.pos.get(cell);
      if (!p) continue;
      r0 = Math.min(r0, p.r); c0 = Math.min(c0, p.c);
      r1 = Math.max(r1, p.r + p.rs - 1); c1 = Math.max(c1, p.c + p.cs - 1);
    }
    if (r1 < 0) return null;
    for (let changed = true; changed;) {
      changed = false;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = grid.slots[r] && grid.slots[r][c];
          if (!cell) continue;
          const p = grid.pos.get(cell);
          if (p.r < r0) { r0 = p.r; changed = true; }
          if (p.c < c0) { c0 = p.c; changed = true; }
          if (p.r + p.rs - 1 > r1) { r1 = p.r + p.rs - 1; changed = true; }
          if (p.c + p.cs - 1 > c1) { c1 = p.c + p.cs - 1; changed = true; }
        }
      }
    }
    return { r0, c0, r1, c1 };
  }

  function cellsIn(grid, rect) {
    const seen = new Set();
    for (let r = rect.r0; r <= rect.r1; r++) for (let c = rect.c0; c <= rect.c1; c++) {
      const cell = grid.slots[r] && grid.slots[r][c];
      if (cell) seen.add(cell);
    }
    return [...seen];
  }

  // ------------------------------------------------------------------ the editor

  const FONTS = ["Arial", "Calibri", "Cambria", "Comic Sans MS", "Consolas", "Courier New", "Georgia",
    "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"];
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
  const CELL_STYLE = "border: 1px solid #888888; padding: 4px 8px; vertical-align: top";
  const BLOCKS = "p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre";

  const FRAME_CSS = `
    html { height: 100%; background: var(--nbr-desk, #e8e8e8); }
    body { position: relative; box-sizing: border-box; max-width: 820px; min-height: max(calc(100% - 28px), var(--nbr-ink-bottom, 0px)); margin: 14px auto; padding: 28px 36px;
      color: #1f1f1f; font: 11pt/1.5 "Segoe UI", Arial, sans-serif; background: #fff; border-radius: 3px;
      box-shadow: 0 1px 4px rgb(0 0 0 / 25%); outline: none; overflow-wrap: anywhere; caret-color: #1f1f1f; }
    body.nbr-compact { margin: 8px; padding: 16px 18px; min-height: max(calc(100% - 16px), var(--nbr-ink-bottom, 0px)); }
    p { margin: 0 0 0.35em; }
    h1 { font-size: 2em; margin: 0.4em 0; } h2 { font-size: 1.5em; margin: 0.4em 0; } h3 { font-size: 1.17em; margin: 0.4em 0; }
    ul, ol { margin: 0 0 0.5em; padding-left: 2em; }
    table { border-collapse: collapse; margin: 0.4em 0; }
    td, th { border: 1px solid #888888; padding: 4px 8px; vertical-align: top; min-width: 18px; }
    td > :last-child, th > :last-child { margin-bottom: 0; }
    a { color: #0b63c5; text-underline-offset: 2px; }
    img { max-width: 100%; height: auto; vertical-align: middle; }
    img.nbr-img-on { outline: 2px solid #3b82f6; outline-offset: 2px; }
    hr { margin: 0.8em 0; border: 0; border-top: 1px solid #c9ccd1; }
    a[href^="#note:"] { color: #7c3aed; text-decoration: none; border-bottom: 1px dashed currentColor; }
    [data-nb-params] { display: flex; gap: 12px; margin: 0.5em 0; padding: 10px; background: #f8f9fb; border: 1px solid #d7dbe0; border-radius: 8px; }
    [data-nb-params] img { flex-shrink: 0; align-self: flex-start; width: 160px; border-radius: 6px; }
    [data-nb-params] pre { flex: 1; min-width: 0; margin: 0; padding: 0; font-size: 9.5pt; background: none; }
    ul[data-nb-checklist] { padding-left: 1.7em; list-style: none; }
    ul[data-nb-checklist] > li { position: relative; }
    ul[data-nb-checklist] > li::before { content: ""; position: absolute; left: -1.55em; top: 0.28em; box-sizing: border-box; width: 1.02em; height: 1.02em;
      background: #fff; border: 1.6px solid #8b929c; border-radius: 4px; cursor: pointer; }
    ul[data-nb-checklist] > li[data-checked="true"]::before { background: #2563eb center / 78% no-repeat
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.2 5 8.6l4.6-5' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); border-color: #2563eb; }
    ul[data-nb-checklist] > li[data-checked="true"] { color: #6b7280; text-decoration: line-through; }
    [data-nb-canvas] { position: relative; margin: 0.5em 0; }
    body[contenteditable="true"] [data-nb-canvas], body.nbr-drawing [data-nb-canvas] { outline: 1px dashed #c3c8d0; outline-offset: -1px; border-radius: 6px; }
    html.nbr-dark-page body { filter: invert(0.9) hue-rotate(180deg); }
    html.nbr-dark-page body img { filter: invert(1) hue-rotate(180deg); }
    pre { margin: 0 0 0.5em; padding: 8px 10px; font: 10pt/1.5 Consolas, "Cascadia Code", monospace; white-space: pre-wrap; background: #f5f6f8; border-radius: 4px; }
    [data-nb-sheet] { min-height: 1em; }
    blockquote { margin: 0 0 0.5em; padding-left: 12px; border-left: 3px solid #ccc; }
    body[contenteditable="true"] :is(td, th) { outline: 1px dashed rgb(0 0 0 / 14%); outline-offset: -1px; }
    td.nbr-sel, th.nbr-sel { box-shadow: inset 0 0 0 999px rgb(49 130 206 / 28%); }
    body.nbr-cells-selected ::selection { background: transparent; }
    ::highlight(nbr-find) { background-color: #ffe066; color: #1f1f1f; }
    ::highlight(nbr-find-current) { background-color: #ff922b; color: #1f1f1f; }
    .nbr-find-fallback { background: #ffe066; }
    /* ink: measured from the top left corner of the text area */
    svg[data-nb-ink] { position: absolute; left: 36px; top: 28px; width: 1px; height: 1px; overflow: visible; pointer-events: none; z-index: 3; }
    body.nbr-compact > svg[data-nb-ink] { left: 18px; top: 16px; }
    [data-nb-canvas] > svg[data-nb-ink] { left: 0; top: 0; }
    svg[data-nb-ink] path { fill: none; }
    body.nbr-drawing { caret-color: transparent; touch-action: none; user-select: none; -webkit-user-select: none; }
    body.nbr-draw-pen { cursor: crosshair; }
    body.nbr-draw-eraser { cursor: none; }
    .nbr-eraser-ring { position: fixed; z-index: 10; display: none; box-sizing: border-box; pointer-events: none;
      border: 1.5px solid rgb(0 0 0 / 60%); border-radius: 50%; box-shadow: 0 0 0 1px rgb(255 255 255 / 85%), inset 0 0 0 1px rgb(255 255 255 / 85%); }
  `;

  class RichEditor {
    /**
     * options: compact, onChange(html), onSave(), onKey(event) -> true when handled (Alt+N ...)
     */
    constructor(options = {}) {
      this.options = options;
      this.compact = Boolean(options.compact);
      this.editable = true;
      this.drawTool = null;
      this.inkColor = "#1F2328";
      this.inkSize = 2;
      this.eraserDiameter = 20;
      this.undoStack = [];
      this.redoStack = [];
      this.typing = null;
      this.build();
    }

    // ---------------------------------------------------------------- building
    //
    //   dock      one row of small clusters: history, text, format, colour,
    //             paragraph, insert / draw / layout, find
    //   context   a strip that appears under the dock for what you are working
    //             on: a table, a picture, or drawing
    //   footer    word and character count

    build() {
      this.element = el("div", { class: "nbr" + (this.compact ? " nbr-compact" : "") });
      this.dock = el("div", { class: "nbr-dock", role: "toolbar", "aria-label": "Formatting" });
      this.context = el("div", { class: "nbr-context", hidden: true });
      this.fileInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp", hidden: true });
      this.fileInput.addEventListener("change", () => {
        const file = this.fileInput.files && this.fileInput.files[0];
        this.fileInput.value = "";
        if (file) this.importImageFile(file, true);
      });
      this.buildDock();
      this.bars = { table: this.buildTableBar(), picture: this.buildPictureBar(), params: this.buildParamsBar(), draw: this.buildDrawBar() };
      for (const bar of Object.values(this.bars)) {
        bar.hidden = true;
        this.context.append(bar);
      }
      this.findBar = this.buildFind();
      this.frame = el("iframe", { class: "nbr-frame", title: "Rich text note" });
      this.count = el("span", { class: "nbr-count" });
      this.modeHint = el("span", { class: "nbr-mode-hint" });
      this.footer = el("div", { class: "nbr-footer" }, this.count, el("span", { class: "nbr-spacer" }), this.modeHint);
      this.menu = el("div", { class: "nbr-menu", hidden: true });
      this.element.append(this.dock, this.context, this.findBar, el("div", { class: "nbr-frame-wrap" }, this.frame), this.footer, this.menu, this.fileInput);
      this.element.addEventListener("pointerdown", (event) => {
        if (!this.menu.hidden && !this.menu.contains(event.target) && !event.target.closest(".nbr-opener")) this.closeMenu();
      });
      this.element.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !this.menu.hidden) {
          event.preventDefault();
          this.closeMenu();
          this.focus();
        } else if (event.key === "Escape" && this.drawTool) {
          event.preventDefault();
          this.setDrawTool(null);
        }
        event.stopPropagation();          // the WebUI's own shortcuts stay out of the editor
      });
      this.pendingHtml = "<p><br></p>";
      this.frame.addEventListener("load", () => this.initFrame());
      this.frame.srcdoc = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body></body></html>";
    }

    initFrame() {
      const doc = this.frame.contentDocument;
      if (!doc || this.doc === doc) return;
      this.doc = doc;
      this.win = this.frame.contentWindow;
      const style = doc.createElement("style");
      style.textContent = FRAME_CSS;
      doc.head.append(style);
      this.body = doc.body;
      this.body.classList.toggle("nbr-compact", this.compact);
      this.body.contentEditable = this.editable ? "true" : "false";
      this.body.spellcheck = true;
      this.syncDesk();
      try {
        doc.execCommand("defaultParagraphSeparator", false, "p");
      } catch {
        /* older browsers */
      }
      this.body.innerHTML = this.pendingHtml;
      this.normalizeInk();
      this.lastHtml = this.getHTML();
      // the eraser's outline lives outside <body>, so it is never saved
      this.ring = doc.createElement("div");
      this.ring.className = "nbr-eraser-ring";
      doc.documentElement.append(this.ring);
      this.body.addEventListener("input", () => this.onInput());
      this.body.addEventListener("keydown", (event) => this.onKey(event));
      this.body.addEventListener("paste", (event) => this.onPaste(event));
      this.body.addEventListener("mousedown", (event) => this.onMouseDown(event));
      this.body.addEventListener("mousemove", (event) => this.onMouseMove(event));
      this.body.addEventListener("dragover", (event) => {
        const types = [...(event.dataTransfer ? event.dataTransfer.types : [])];
        if (types.includes("Files") || types.includes("text/uri-list")) event.preventDefault();
      });
      this.body.addEventListener("drop", (event) => this.onDrop(event));
      this.setDarkPage(this.darkPage);
      this.body.addEventListener("click", (event) => {
        if (this.drawTool) return;
        // a checklist item ticks when its box (left of the text) is clicked
        const item = event.target.closest && event.target.closest("ul[data-nb-checklist] > li");
        if (item && event.clientX < item.getBoundingClientRect().left && this.editable) {
          event.preventDefault();
          this.command(() => item.setAttribute("data-checked", item.getAttribute("data-checked") === "true" ? "false" : "true"));
          return;
        }
        const noteLink = event.target.closest && event.target.closest('a[href^="#note:"]');
        if (noteLink) {
          event.preventDefault();
          if ((event.ctrlKey || event.metaKey || !this.editable) && this.options.onNoteLink) {
            this.options.onNoteLink(decodeURIComponent(noteLink.getAttribute("href").slice(6)));
          }
          return;
        }
        const img = event.target.closest && event.target.closest("img");
        for (const node of this.body.querySelectorAll("img.nbr-img-on")) node.classList.remove("nbr-img-on");
        if (img) img.classList.add("nbr-img-on");
        this.updateContext();
        const link = event.target.closest && event.target.closest("a[href]");
        if (link && (event.ctrlKey || event.metaKey || !this.editable)) {
          event.preventDefault();
          window.open(link.href, "_blank", "noopener");
        }
      });
      doc.addEventListener("keydown", (event) => {
        if (this.options.onKey && this.options.onKey(event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
      doc.addEventListener("selectionchange", () => this.updateState());
      doc.addEventListener("pointerdown", (event) => {
        this.closeMenu();
        if (this.drawTool) this.startInk(event);
      });
      doc.addEventListener("pointermove", (event) => {
        if (this.drawTool) this.moveInk(event);
      });
      doc.addEventListener("pointerup", () => this.endInk());
      doc.addEventListener("pointercancel", () => this.endInk());
      doc.documentElement.addEventListener("mouseleave", () => (this.ring.style.display = "none"));
      this.ready = true;
      this.updateCount();
      if (this.readyWaiters) for (const fn of this.readyWaiters.splice(0)) fn();
    }

    whenReady(fn) {
      if (this.ready) fn();
      else (this.readyWaiters = this.readyWaiters || []).push(fn);
    }

    // the grey "desk" around the page follows the WebUI's theme
    syncDesk() {
      if (!this.doc) return;
      const probe = getComputedStyle(this.element);
      const bg = probe.getPropertyValue("--nb-bg") || "#e8e8e8";
      this.doc.documentElement.style.setProperty("--nbr-desk", `color-mix(in srgb, ${probe.color} 10%, ${bg.trim() || "#e8e8e8"})`);
    }

    iconButton(name, title, onclick, extraClass) {
      const b = el("button", { class: "nbr-btn" + (extraClass ? " " + extraClass : ""), type: "button", title, "aria-label": title }, icon(name));
      b.addEventListener("mousedown", (event) => event.preventDefault());       // keep the page's selection
      b.addEventListener("click", (event) => onclick(event, b));
      return b;
    }

    // a button that opens a small panel under it
    popButton(name, title, open, label) {
      const b = this.iconButton(name, title, (event, button) => open(button), "nbr-opener" + (label ? " nbr-labelled" : ""));
      if (label) b.append(el("span", { class: "nbr-btn-label", text: label }));
      b.append(icon("caret", 12));
      return b;
    }

    textButton(label, title, onclick, extraClass) {
      const b = el("button", { class: "nbr-btn nbr-text-btn" + (extraClass ? " " + extraClass : ""), type: "button", title, "aria-label": title, text: label });
      b.addEventListener("mousedown", (event) => event.preventDefault());
      b.addEventListener("click", (event) => onclick(event, b));
      return b;
    }

    cluster(...children) {
      return el("div", { class: "nbr-cluster" }, ...children);
    }

    tag(text) {
      return el("span", { class: "nbr-tag", text });
    }

    select(title, options, onchange, cls) {
      const s = el("select", { class: "nbr-select " + (cls || ""), title, "aria-label": title });
      for (const [value, label] of options) s.append(el("option", { value, text: label }));
      s.addEventListener("change", () => {
        const value = s.value;
        s.selectedIndex = 0;
        if (value) onchange(value);
      });
      return s;
    }

    range(title, min, max, value, oninput, cls) {
      const input = el("input", { type: "range", min: String(min), max: String(max), step: "1", value: String(value), title, "aria-label": title });
      const out = el("span", { class: "nbr-range-value", text: String(value) });
      input.addEventListener("input", () => {
        out.textContent = input.value;
        oninput(Number(input.value));
      });
      input.addEventListener("keydown", (event) => event.stopPropagation());
      const wrap = el("label", { class: "nbr-range " + (cls || "") }, el("span", { class: "nbr-range-name", text: title }), input, out);
      wrap.input = input;
      wrap.out = out;
      return wrap;
    }

    buildDock() {
      const cmd = (name, title, command) => {
        const b = this.iconButton(name, title, () => this.command(() => this.exec(command)));
        b.dataset.command = command;
        return b;
      };
      this.styleSelect = this.select("Paragraph style", [["", "Normal"], ...BLOCK_STYLES],
        (v) => this.command(() => this.exec("formatBlock", `<${v}>`)), "nbr-style");
      this.fontSelect = this.select("Font", [["", "Font"], ["default", "Default font"], ...FONTS.map((f) => [f, f])],
        (v) => this.command(() => this.setFont(v)), "nbr-font");
      this.sizeSelect = this.select("Font size (pt)", [["", "Size"], ...SIZES.map((s) => [String(s), String(s)])],
        (v) => this.command(() => this.setFontSize(Number(v))), "nbr-size");
      const caseSelect = this.select("Change case", [["", "Aa"], ["sentence", "Sentence case."], ["lower", "lowercase"],
        ["upper", "UPPERCASE"], ["title", "Capitalize Each Word"], ["toggle", "tOGGLE cASE"]],
      (v) => this.command(() => this.changeCase(v)), "nbr-case");

      this.colorButton = this.iconButton("palette", "Colours: text, highlight, shading", (event, b) => this.showColors(b), "nbr-opener nbr-color-btn");
      this.colorBar = el("span", { class: "nbr-color-bar" });
      this.colorButton.append(this.colorBar);
      this.alignButton = this.popButton("left", "Alignment", (b) => this.showAlign(b));
      this.spacingButton = this.popButton("spacing", "Line spacing", (b) => this.showSpacing(b));
      this.insertButton = this.popButton("plus", "Insert: link, picture, table, line", (b) => this.showInsert(b), "Insert");
      this.drawButton = this.iconButton("pen", "Draw", () => this.setDrawTool(this.drawTool ? null : this.lastPen || "pen"), "nbr-labelled nbr-mode");
      this.drawButton.append(el("span", { class: "nbr-btn-label", text: "Draw" }));
      this.layoutButton = this.popButton("columns", "Page layout: columns, hyphenation", (b) => this.showLayout(b), "Layout");

      this.dock.append(
        this.cluster(this.iconButton("undo", "Undo (Ctrl+Z)", () => this.undo()), this.iconButton("redo", "Redo (Ctrl+Y)", () => this.redo())),
        this.cluster(this.styleSelect, this.fontSelect, this.sizeSelect),
        this.cluster(cmd("bold", "Bold (Ctrl+B)", "bold"), cmd("italic", "Italic (Ctrl+I)", "italic"),
          cmd("underline", "Underline (Ctrl+U)", "underline"), cmd("strike", "Strikethrough", "strikeThrough"),
          cmd("sub", "Subscript (Ctrl+=)", "subscript"), cmd("sup", "Superscript (Ctrl+Shift+=)", "superscript"),
          caseSelect, this.iconButton("clear", "Clear all formatting", () => this.command(() => this.clearFormatting()))),
        this.cluster(this.colorButton),
        this.cluster(this.alignButton, cmd("bullets", "Bullets", "insertUnorderedList"), cmd("numbers", "Numbering", "insertOrderedList"),
          this.checklistButton = this.iconButton("checklist", "Checklist", () => this.command(() => this.toggleChecklist())),
          cmd("outdent", "Decrease indent", "outdent"), cmd("indent", "Increase indent", "indent"), this.spacingButton),
        this.cluster(this.insertButton, this.drawButton, this.layoutButton),
        el("span", { class: "nbr-spacer" }),
        this.cluster(this.iconButton("find", "Find and replace (Ctrl+F, Ctrl+H)", () => this.openFind(false))),
      );
    }

    // ---------------------------------------------------------------- dock panels

    swatch(color, label, pick, cls = "nbr-swatch") {
      const b = el("button", {
        class: cls + (color ? "" : " nbr-swatch-none"), type: "button", title: label, "aria-label": label,
        style: color ? `--c: ${color}` : null,
      });
      b.addEventListener("mousedown", (event) => event.preventDefault());
      b.addEventListener("click", () => pick(color));
      return b;
    }

    swatches(title, noneLabel, colors, pick, customLabel) {
      const row = el("div", { class: "nbr-swatches" });
      if (noneLabel) row.append(this.swatch(null, noneLabel, pick));
      for (const [hex, name] of colors) row.append(this.swatch(hex, `${name} ${hex}`, pick));
      const custom = el("input", { type: "color", value: "#3366cc", "aria-label": customLabel || `${title}: another colour` });
      custom.addEventListener("change", () => pick(custom.value.toUpperCase()));
      row.append(el("label", { class: "nbr-swatch nbr-swatch-custom", title: "Another colour…" }, custom));
      return el("div", { class: "nbr-section" }, el("div", { class: "nbr-section-title", text: title }), row);
    }

    // one panel for the three colours; "none" takes each off
    showColors(anchor) {
      const pick = (apply) => (color) => {
        this.closeMenu();
        this.restoreSelection();
        this.command(() => apply(color));
        this.focus();
      };
      this.openMenu(anchor, el("div", { class: "nbr-panel-card nbr-colors" },
        this.swatches("Text", "Automatic", TEXT_COLORS, pick((c) => {
          this.setTextColor(c);
          this.colorBar.style.background = c || "";
        }), "Text: another colour"),
        this.swatches("Highlight", "No highlight", HIGHLIGHTS, pick((c) => this.setHighlight(c)), "Highlight: another colour"),
        this.swatches("Shading", "No shading", SHADES, pick((c) => this.setShading(c)), "Shading: another colour"),
        el("div", { class: "nbr-note", text: "Highlight colours the selected words. Shading colours the whole paragraph, or the cells in a table." })));
    }

    showAlign(anchor) {
      const row = el("div", { class: "nbr-row" });
      for (const [name, title, command] of ALIGNS) {
        const b = this.iconButton(name, title, () => {
          this.closeMenu();
          this.restoreSelection();
          this.command(() => this.exec(command));
          this.focus();
        });
        let on = false;
        try {
          on = this.doc.queryCommandState(command);
        } catch {
          on = false;
        }
        b.classList.toggle("nbr-on", on);
        row.append(b);
      }
      this.openMenu(anchor, el("div", { class: "nbr-panel-card" }, row));
    }

    showSpacing(anchor) {
      const current = this.lineSpacing();
      const list = el("div", { class: "nbr-menu-list" });
      const item = (label, on, fn) => {
        const b = el("button", { class: "nbr-menu-item" + (on ? " nbr-checked" : ""), type: "button" }, el("span", { class: "nbr-check-mark", text: on ? "✓" : "" }), label);
        b.addEventListener("mousedown", (event) => event.preventDefault());
        b.addEventListener("click", () => {
          this.closeMenu();
          this.restoreSelection();
          this.command(fn);
          this.focus();
        });
        return b;
      };
      list.append(el("div", { class: "nbr-section-title", text: "Line spacing" }));
      for (const value of LINE_SPACINGS) {
        const label = Number.isInteger(value * 10) ? value.toFixed(1) : String(value);
        list.append(item(value === DEFAULT_LINE ? `${label} (normal)` : label, Math.abs(current - value) < 0.01, () => this.setLineSpacing(value)));
      }
      const gap = this.paragraphGap();
      list.append(el("div", { class: "nbr-section-title", text: "Space after paragraphs" }));
      for (const [key, label] of PARAGRAPH_GAPS) list.append(item(label, gap === key, () => this.setParagraphGap(key)));
      this.openMenu(anchor, el("div", { class: "nbr-panel-card" }, list));
    }

    showInsert(anchor) {
      this.showMenu(anchor, [
        ["Last generated image, with its parameters (Alt+G)", () => this.options.onCapture && this.options.onCapture()],
        ["Snippet… (Ctrl+;)", () => this.options.onSnippet && this.options.onSnippet()],
        ["Link… (Ctrl+K)", () => this.showLinkDialog()],
        ["Link to a note…", () => this.showNoteLinks(anchor)],
        ["Picture…", () => this.fileInput.click()],
        ["Table…", () => this.showTableGrid(anchor)],
        ["Drawing area", () => this.insertDrawingArea()],
        ["Divider line", () => this.command(() => this.exec("insertHorizontalRule"))],
      ]);
    }

    showLayout(anchor) {
      const state = this.layoutState();
      const cols = el("div", { class: "nbr-segmented" });
      for (const n of [1, 2, 3]) {
        const b = this.textButton(String(n), `${n} column${n > 1 ? "s" : ""}`, () => {
          this.command(() => this.setColumns(n));
          this.showLayout(anchor);
        }, state.columns === n ? "nbr-on" : "");
        cols.append(b);
      }
      const hyphens = el("input", { type: "checkbox", "aria-label": "Hyphenation" });
      hyphens.checked = state.hyphens;
      hyphens.addEventListener("change", () => this.command(() => this.setHyphens(hyphens.checked)));
      const lang = el("select", { class: "nbr-select", "aria-label": "Language for hyphenation" },
        LANGS.map(([v, label]) => el("option", { value: v, text: label })));
      lang.value = state.lang;
      lang.addEventListener("change", () => this.command(() => this.setLang(lang.value)));
      this.openMenu(anchor, el("div", { class: "nbr-panel-card nbr-form" },
        el("div", { class: "nbr-section-title", text: "Columns" }), cols,
        el("label", { class: "nbr-check" }, hyphens, "Hyphenate at line ends"),
        el("label", {}, el("span", { text: "Language" }), lang)));
    }

    // ---------------------------------------------------------------- context strips

    buildTableBar() {
      const inTable = [];
      const tb = (name, title, fn) => {
        const b = this.iconButton(name, title, () => this.tableCommand(fn));
        inTable.push(b);
        return b;
      };
      const pop = (name, title, fn) => {
        const b = this.popButton(name, title, fn);
        inTable.push(b);
        return b;
      };
      const number = (title, onchange) => {
        const input = el("input", { class: "nbr-num", type: "number", min: "8", max: "2000", step: "1", title, "aria-label": title });
        input.addEventListener("change", () => {
          const v = Number(input.value);
          if (v > 0) this.tableCommand((t) => onchange(t, v));
        });
        input.addEventListener("keydown", (event) => {
          event.stopPropagation();
          if (event.key === "Enter") input.dispatchEvent(new Event("change"));
        });
        inTable.push(input);
        return input;
      };
      this.heightInput = number("Row height (px)", (t, v) => this.setRowHeight(t, v));
      this.widthInput = number("Column width (px)", (t, v) => this.setColumnWidth(t, v));
      this.border = { style: "solid", width: "1px", color: "#000000" };
      this.inTableControls = inTable;
      return el("div", { class: "nbr-bar", "data-bar": "table" },
        this.tag("Table"),
        this.cluster(tb("rowAbove", "Insert row above", (t) => this.insertRow(t, false)), tb("rowBelow", "Insert row below", (t) => this.insertRow(t, true)),
          tb("colLeft", "Insert column left", (t) => this.insertColumn(t, false)), tb("colRight", "Insert column right", (t) => this.insertColumn(t, true))),
        this.cluster(tb("merge", "Merge cells", (t) => this.mergeCells(t)), pop("split", "Split cells", (b) => this.showSplit(b))),
        this.cluster(pop("select", "Select", (b) => this.showMenu(b, [
          ["Cell", () => this.selectCells("cell")], ["Row", () => this.selectCells("row")], ["Column", () => this.selectCells("column")], ["Table", () => this.selectCells("table")]])),
        pop("delete", "Delete", (b) => this.showMenu(b, [
          ["Delete cells' text", () => this.tableCommand((t) => this.clearCells(t))], ["Delete rows", () => this.tableCommand((t) => this.deleteRows(t))],
          ["Delete columns", () => this.tableCommand((t) => this.deleteColumns(t))], ["Delete table", () => this.tableCommand((t) => this.deleteTable(t))]]))),
        this.cluster(el("label", { class: "nbr-lbl", title: "Row height (px)" }, "H", this.heightInput),
          el("label", { class: "nbr-lbl", title: "Column width (px)" }, "W", this.widthInput),
          tb("distRows", "Distribute rows", (t) => this.distributeRows(t)), tb("distCols", "Distribute columns", (t) => this.distributeColumns(t)),
          pop("autofit", "AutoFit", (b) => this.showMenu(b, [
            ["Fit the contents", () => this.tableCommand((t) => this.autofit(t, "contents"))],
            ["Fit the page width", () => this.tableCommand((t) => this.autofit(t, "window"))],
            ["Fixed column widths", () => this.tableCommand((t) => this.autofit(t, "fixed"))]]))),
        this.cluster(pop("cellAlign", "Cell alignment", (b) => this.showCellAlign(b)),
          pop("direction", "Text direction", (b) => this.showMenu(b, [
            ["Horizontal", () => this.tableCommand((t) => this.textDirection(t, null))],
            ["Vertical, top to bottom", () => this.tableCommand((t) => this.textDirection(t, "vertical-rl"))],
            ["Vertical, bottom to top", () => this.tableCommand((t) => this.textDirection(t, "sideways-lr"))]]))),
        this.cluster(pop("borders", "Borders", (b) => this.showBorders(b)), pop("shading", "Cell shading", (b) => this.showCellShading(b))),
      );
    }

    showCellAlign(anchor) {
      const grid = el("div", { class: "nbr-align" });
      for (const v of ["top", "middle", "bottom"]) for (const h of ["left", "center", "right"]) {
        const b = this.iconButton("left", `Align ${v} ${h}`, () => {
          this.closeMenu();
          this.restoreSelection();
          this.tableCommand((t) => this.alignCells(t, h, v));
          this.focus();
        });
        b.firstChild.innerHTML = this.alignIcon(h, v);
        grid.append(b);
      }
      this.openMenu(anchor, el("div", { class: "nbr-panel-card" }, el("div", { class: "nbr-section-title", text: "Text in the cells" }), grid));
    }

    alignIcon(h, v) {
      const y = { top: 5, middle: 10, bottom: 15 }[v];
      const x1 = { left: 4, center: 7, right: 10 }[h];
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="2" y="2" width="20" height="20" rx="3" stroke-width="1.4" opacity=".5"/><path d="M${x1} ${y}h10M${x1 + (h === "center" ? 1.5 : h === "right" ? 4 : 0)} ${y + 4}h${h === "left" ? 7 : h === "right" ? 6 : 7}"/></svg>`;
    }

    showBorders(anchor) {
      const style = el("select", { class: "nbr-select", "aria-label": "Border style" },
        BORDER_STYLES.map(([v, label]) => el("option", { value: v, text: label })));
      style.value = this.border.style;
      style.addEventListener("change", () => (this.border.style = style.value));
      const width = el("select", { class: "nbr-select", "aria-label": "Border width" },
        BORDER_WIDTHS.map((v) => el("option", { value: v, text: v.replace("px", " px") })));
      width.value = this.border.width;
      width.addEventListener("change", () => (this.border.width = width.value));
      const colors = el("div", { class: "nbr-swatches" });
      const paint = () => {
        for (const b of colors.querySelectorAll(".nbr-dot")) b.classList.toggle("nbr-on", b.dataset.color === this.border.color);
      };
      for (const [hex, name] of BORDER_COLORS) {
        const b = this.swatch(hex, `Border colour: ${name}`, (c) => {
          this.border.color = c;
          paint();
        }, "nbr-dot");
        b.dataset.color = hex;
        colors.append(b);
      }
      paint();
      const edges = el("div", { class: "nbr-edges" });
      for (const [which, title] of EDGES) {
        const b = this.iconButton("borders", title, () => {
          this.closeMenu();
          this.restoreSelection();
          this.tableCommand((t) => this.setBorders(t, which));
          this.focus();
        });
        b.firstChild.innerHTML = edgeIcon(which);
        edges.append(b);
      }
      this.openMenu(anchor, el("div", { class: "nbr-panel-card nbr-form" },
        el("div", { class: "nbr-section-title", text: "Line" }),
        el("div", { class: "nbr-row" }, style, width), colors,
        el("div", { class: "nbr-section-title", text: "Apply to the selected cells" }), edges));
    }

    showCellShading(anchor) {
      const pick = (color) => {
        this.closeMenu();
        this.restoreSelection();
        this.tableCommand((t) => this.shadeCells(t, color));
        this.focus();
      };
      this.openMenu(anchor, el("div", { class: "nbr-panel-card nbr-colors" },
        this.swatches("Cell shading", "No shading", SHADES.concat(CELL_EXTRA), pick, "Cell shading: another colour")));
    }

    buildPictureBar() {
      const size = (label, value) => this.textButton(label, value ? `Picture width ${label}` : "Original size", () => this.command(() => {
        const img = this.pickedImage();
        if (!img) return;
        if (value) img.style.width = value;
        else img.style.removeProperty("width");
        img.removeAttribute("width");
        img.removeAttribute("height");
        if (!img.getAttribute("style")) img.removeAttribute("style");
      }));
      return el("div", { class: "nbr-bar", "data-bar": "picture" },
        this.tag("Picture"),
        this.cluster(size("25%", "25%"), size("50%", "50%"), size("75%", "75%"), size("100%", "100%"), size("Original", null)),
        this.cluster(this.iconButton("delete", "Delete picture", () => this.command(() => {
          this.removeImage(this.pickedImage());
          this.updateContext();
        }))));
    }

    // an emptied paragraph keeps a line to type on
    removeImage(img) {
      if (!img) return;
      const parent = img.parentElement;
      img.remove();
      if (parent && parent !== this.body && !parent.textContent && !parent.querySelector("img, br, table, svg")) {
        parent.append(this.doc.createElement("br"));
        this.caretTo(parent);
      }
    }

    buildParamsBar() {
      return el("div", { class: "nbr-bar", "data-bar": "params" },
        this.tag("Parameters"),
        this.cluster(this.textButton("Send to txt2img", "Put these parameters into txt2img", () => this.sendParams("txt2img")),
          this.textButton("Send to img2img", "Put these parameters into img2img", () => this.sendParams("img2img"))),
        this.cluster(this.textButton("Copy", "Copy the parameters", () => this.copyParams()),
          this.iconButton("delete", "Remove the parameter block", () => this.command(() => {
            const box = this.currentParams();
            if (!box) return;
            const p = this.doc.createElement("p");
            p.append(this.doc.createElement("br"));
            box.replaceWith(p);
            this.caretTo(p);
          }))));
    }

    pickedImage() {
      return this.body ? this.body.querySelector("img.nbr-img-on") : null;
    }

    buildDrawBar() {
      const tool = (name, title, id) => {
        const b = this.iconButton(name, title, () => this.setDrawTool(id));
        b.dataset.draw = id;
        return b;
      };
      this.inkDots = el("div", { class: "nbr-swatches nbr-ink-colors" });
      for (const [hex, name] of INK_COLORS) {
        const b = this.swatch(hex, `Ink: ${name}`, (c) => this.setInkColor(c), "nbr-dot");
        b.dataset.color = hex;
        this.inkDots.append(b);
      }
      const custom = el("input", { type: "color", value: "#3366cc", "aria-label": "Ink: another colour" });
      custom.addEventListener("change", () => this.setInkColor(custom.value.toUpperCase()));
      this.inkDots.append(el("label", { class: "nbr-dot nbr-swatch-custom", title: "Another colour…" }, custom));
      this.penSize = this.range("Size", 1, 24, this.inkSize, (v) => (this.inkSize = v), "nbr-pen-size");
      this.eraserSize = this.range("Eraser", 4, 80, this.eraserDiameter, (v) => (this.eraserDiameter = v), "nbr-eraser-size");
      const done = el("button", { class: "nbr-btn nbr-primary", type: "button", text: "Done", title: "Back to typing (Esc)" });
      done.addEventListener("mousedown", (event) => event.preventDefault());
      done.addEventListener("click", () => this.setDrawTool(null));
      const bar = el("div", { class: "nbr-bar", "data-bar": "draw" },
        this.tag("Draw"),
        this.cluster(tool("pen", "Pen", "pen"), tool("pencil", "Pencil", "pencil"), tool("fountain", "Fountain pen", "fountain"), tool("marker", "Marker", "marker")),
        this.cluster(tool("eraser", "Eraser: rubs out what it passes over", "eraser"), tool("strokeEraser", "Stroke eraser: removes whole strokes", "stroke")),
        this.cluster(this.inkDots),
        this.cluster(this.penSize, this.eraserSize),
        this.cluster(this.iconButton("trash", "Clear all ink", () => this.clearInk())),
        el("span", { class: "nbr-spacer" }), done);
      this.setInkColor(this.inkColor);
      return bar;
    }

    setInkColor(color) {
      this.inkColor = color || "#1F2328";
      if (!this.inkDots) return;
      for (const b of this.inkDots.querySelectorAll("button.nbr-dot")) b.classList.toggle("nbr-on", b.dataset.color === this.inkColor);
    }

    // which strip shows: drawing, then a picked picture, then a table
    updateContext() {
      let which = null;
      if (this.drawTool) which = "draw";
      else if (this.currentParams()) which = "params";
      else if (this.pickedImage()) which = "picture";
      else if (this.body && this.currentCell()) which = "table";
      for (const [key, bar] of Object.entries(this.bars)) bar.hidden = key !== which;
      this.context.hidden = !which;
      this.context.dataset.bar = which || "";
    }

    // ---------------------------------------------------------------- ink
    // Strokes are SVG paths in one layer on top of the page, measured from the
    // top left corner of the text area.

    setDrawTool(tool) {
      this.drawTool = tool || null;
      if (tool && tool !== "eraser" && tool !== "stroke") this.lastPen = tool;
      const erasing = tool === "eraser" || tool === "stroke";
      if (this.bars) {
        for (const b of this.bars.draw.querySelectorAll("[data-draw]")) b.classList.toggle("nbr-on", b.dataset.draw === this.drawTool);
        this.penSize.hidden = erasing;
        this.eraserSize.hidden = !erasing;
      }
      if (this.drawButton) this.drawButton.classList.toggle("nbr-on", Boolean(this.drawTool));
      if (this.modeHint) this.modeHint.textContent = this.drawTool ? "Drawing: Esc or Done to type again" : "";
      if (this.body) {
        this.body.classList.toggle("nbr-drawing", Boolean(this.drawTool));
        this.body.classList.toggle("nbr-draw-pen", Boolean(this.drawTool) && !erasing);
        this.body.classList.toggle("nbr-draw-eraser", erasing);
        if (this.editable) this.body.contentEditable = this.drawTool ? "false" : "true";
        if (!erasing && this.ring) this.ring.style.display = "none";
        if (this.drawTool) {
          for (const node of this.body.querySelectorAll("img.nbr-img-on")) node.classList.remove("nbr-img-on");
          this.clearCellSelection();
        }
      }
      this.closeMenu();
      this.updateContext();
    }

    // The page's own layer sits straight in <body>, measured from the top left
    // corner of the text. A drawing area (Insert > Drawing area) is a block
    // between paragraphs with a layer of its own, so its ink moves with the text.
    inkLayer(create = true, area = null) {
      if (!this.body) return null;
      const parent = area || this.body;
      let svg = parent.querySelector(":scope > svg[data-nb-ink]");
      if (!svg && !create) return null;
      if (!svg) {
        svg = this.doc.createElementNS(SVG_NS, "svg");
        svg.setAttribute("data-nb-ink", "");
        parent.append(svg);
      }
      return svg;
    }

    inkLayers() {
      return this.body ? [...this.body.querySelectorAll("svg[data-nb-ink]")] : [];
    }

    // the page layer: one, straight in <body>; layers from before had a
    // viewBox measured from the page's edge instead of the text's
    normalizeInk() {
      const layers = [...this.body.querySelectorAll("svg[data-nb-ink]")].filter((svg) => !svg.parentElement.closest("[data-nb-canvas]"));
      for (const area of this.body.querySelectorAll("[data-nb-canvas]")) area.setAttribute("contenteditable", "false");
      if (!layers.length) return this.fitInk();
      const main = layers[0];
      for (const other of layers.slice(1)) {
        main.append(...other.childNodes);
        other.remove();
      }
      if (main.hasAttribute("viewBox")) {
        for (const path of main.querySelectorAll("path")) {
          const runs = parsePath(path.getAttribute("d"));
          path.setAttribute("d", pathData(runs.map((run) => run.map((p) => ({ x: p.x - 36, y: p.y - 28 })))));
        }
        for (const attr of ["viewBox", "width", "height", "style", "preserveAspectRatio"]) main.removeAttribute(attr);
      }
      if (main.parentNode !== this.body) this.body.append(main);
      this.fitInk();
    }

    // the page grows to hold the lowest stroke; a drawing area to hold its own
    fitInk(area = null) {
      if (area) {
        const svg = this.inkLayer(false, area);
        if (!svg || !svg.childNodes.length) return;
        try {
          const box = svg.getBBox();
          const need = Math.ceil(box.y + box.height + 16);
          if (need > area.getBoundingClientRect().height) area.style.height = `${need}px`;
        } catch {
          /* nothing drawn yet */
        }
        return;
      }
      const svg = this.inkLayer(false);
      let bottom = 0;
      if (svg && svg.childNodes.length) {
        try {
          const box = svg.getBBox();
          const style = this.win.getComputedStyle(this.body);
          bottom = box.y + box.height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 12;
        } catch {
          bottom = 0;
        }
      }
      this.body.style.setProperty("--nbr-ink-bottom", `${Math.ceil(bottom)}px`);
    }

    inkPoint(event, svg) {
      const box = svg.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top, p: event.pressure > 0 ? event.pressure : 0.5 };
    }

    insertDrawingArea() {
      this.command(() => {
        const area = this.doc.createElement("div");
        area.setAttribute("data-nb-canvas", "");
        area.setAttribute("contenteditable", "false");
        area.style.height = "240px";
        this.insertBlock(area);
      });
      this.setDrawTool(this.lastPen || "pen");
    }

    brushStyle() {
      const size = this.inkSize || 2;
      const color = this.inkColor || "#1F2328";
      if (this.drawTool === "pencil") return { width: Math.max(0.6, 0.7 * size), opacity: 0.72, color, cap: "round" };
      if (this.drawTool === "fountain") return { width: 1.15 * size, opacity: 1, color, cap: "round", variable: true };
      if (this.drawTool === "marker") return { width: 4 * size + 4, opacity: 0.38, color: color === "#1F2328" ? "#FACC15" : color, cap: "square" };
      return { width: size, opacity: 1, color, cap: "round" };
    }

    newStroke(layer, brush, width, d, kind) {
      const path = this.doc.createElementNS(SVG_NS, "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", brush.color);
      path.setAttribute("stroke-width", width.toFixed(2));
      path.setAttribute("stroke-linecap", brush.cap);
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("opacity", String(brush.opacity));
      path.setAttribute("data-brush", kind);
      path.setAttribute("d", d);
      layer.append(path);
      return path;
    }

    startInk(event) {
      if (!this.drawTool || event.button !== 0 || !this.editable) return;
      event.preventDefault();
      this.endTyping();
      this.inkBefore = this.snapshot();
      this.inkChanged = false;
      try {
        this.body.setPointerCapture(event.pointerId);
      } catch {
        /* a pointer that cannot be captured */
      }
      if (this.drawTool === "eraser" || this.drawTool === "stroke") {
        this.erasing = true;
        this.lastErase = null;
        this.eraseAt(event);
        return;
      }
      // a stroke started in a drawing area belongs to it
      const area = event.target.closest && event.target.closest("[data-nb-canvas]");
      const layer = this.inkLayer(true, area && this.body.contains(area) ? area : null);
      const pt = this.inkPoint(event, layer);
      const brush = this.brushStyle();
      const width = brush.variable ? brush.width * (0.6 + pt.p) : brush.width;
      const at = `${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      const path = this.newStroke(layer, brush, width, `M ${at} L ${at}`, this.drawTool);
      this.inkStroke = { path, layer, area, last: pt, brush };
      this.inkChanged = true;
    }

    moveInk(event) {
      if (this.drawTool === "eraser" || this.drawTool === "stroke") {
        const d = this.eraserDiameter;
        Object.assign(this.ring.style, { display: "block", width: `${d}px`, height: `${d}px`, left: `${event.clientX - d / 2}px`, top: `${event.clientY - d / 2}px` });
        if (this.erasing) this.eraseAt(event);
        return;
      }
      const stroke = this.inkStroke;
      if (!stroke) return;
      const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
      for (const e of events.length ? events : [event]) {
        const pt = this.inkPoint(e, stroke.layer);
        const dx = pt.x - stroke.last.x;
        const dy = pt.y - stroke.last.y;
        if (dx * dx + dy * dy < 1.6) continue;
        if (stroke.brush.variable) {
          // the fountain pen: short pieces, thicker when pressed or slow
          const speed = Math.hypot(dx, dy);
          const width = stroke.brush.width * (0.45 + (stroke.last.p + pt.p) * 0.4) * (speed < 6 ? 1.15 : 0.85);
          this.newStroke(stroke.layer, stroke.brush, width, `M ${stroke.last.x.toFixed(1)} ${stroke.last.y.toFixed(1)} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, "fountain");
        } else {
          stroke.path.setAttribute("d", stroke.path.getAttribute("d") + ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`);
        }
        stroke.last = pt;
      }
    }

    endInk() {
      const wasErasing = this.erasing;
      const stroke = this.inkStroke;
      if (!wasErasing && !stroke) return;
      this.erasing = false;
      this.inkStroke = null;
      if (this.inkChanged && this.inkBefore) {
        this.pushUndo(this.inkBefore);
        const page = this.inkLayer(false);
        if (page && !page.childNodes.length) page.remove();
        if (stroke && stroke.area) this.fitInk(stroke.area);
        this.fitInk();
        this.lastRaw = this.body.innerHTML;
        this.changed();
      }
      this.inkBefore = null;
      this.inkChanged = false;
    }

    // Rub out along the pointer's way since the last move, on every layer.
    // The eraser cuts strokes where it passes; the stroke eraser removes each
    // stroke it touches.
    eraseAt(event) {
      const now = { x: event.clientX, y: event.clientY };
      const r = this.eraserDiameter / 2;
      const from = this.lastErase || now;
      this.lastErase = now;
      const steps = Math.max(1, Math.ceil(Math.hypot(now.x - from.x, now.y - from.y) / Math.max(1, r / 2)));
      for (const svg of this.inkLayers()) {
        const origin = svg.getBoundingClientRect();
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const c = { x: from.x + (now.x - from.x) * t - origin.left, y: from.y + (now.y - from.y) * t - origin.top };
          for (const path of [...svg.querySelectorAll("path")]) {
            const reach = r + (parseFloat(path.getAttribute("stroke-width")) || 1) / 2;
            let box;
            try {
              box = path.getBBox();
            } catch {
              continue;
            }
            if (c.x < box.x - reach || c.x > box.x + box.width + reach || c.y < box.y - reach || c.y > box.y + box.height + reach) continue;
            const runs = parsePath(path.getAttribute("d"));
            if (this.drawTool === "stroke") {
              if (touches(runs, c, reach)) {
                path.remove();
                this.inkChanged = true;
              }
              continue;
            }
            const kept = cutRuns(runs, c, reach);
            if (!kept) continue;
            this.inkChanged = true;
            if (kept.length) path.setAttribute("d", pathData(kept));
            else path.remove();
          }
        }
      }
    }

    // every stroke goes; drawing areas stay, empty
    clearInk() {
      const layers = this.inkLayers();
      if (!layers.some((svg) => svg.childNodes.length)) return;
      this.command(() => {
        for (const svg of layers) {
          if (svg.parentElement.closest("[data-nb-canvas]")) svg.replaceChildren();
          else svg.remove();
        }
      });
      this.fitInk();
    }

    // ---------------------------------------------------------------- menus

    openMenu(anchor, content) {
      this.saveSelection();
      this.menu.textContent = "";
      this.menu.append(content);
      this.menu.hidden = false;
      const box = this.element.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      const width = Math.min(this.menu.offsetWidth || 240, box.width - 8);
      this.menu.style.top = `${a.bottom - box.top + 2}px`;
      this.menu.style.left = `${clamp(a.left - box.left, 4, Math.max(4, box.width - width - 4))}px`;
    }

    closeMenu() {
      if (this.menu && !this.menu.hidden) {
        this.menu.hidden = true;
        this.menu.textContent = "";
      }
    }

    showMenu(anchor, items) {
      const body = el("div", { class: "nbr-menu-list" });
      for (const [label, fn] of items) {
        const disabled = label.startsWith("Vertical, bottom") && this.noSideways;
        const b = el("button", { class: "nbr-menu-item", type: "button", disabled }, label);
        b.addEventListener("mousedown", (event) => event.preventDefault());
        b.addEventListener("click", () => {
          this.closeMenu();
          this.restoreSelection();
          fn();
          this.focus();
        });
        body.append(b);
      }
      this.openMenu(anchor, body);
    }

    showTableGrid(anchor) {
      const rows = 8, cols = 10;
      const label = el("div", { class: "nbr-section-title", text: "Insert table" });
      const grid = el("div", { class: "nbr-tgrid", style: `grid-template-columns: repeat(${cols}, 16px)` });
      const cells = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const b = el("button", { class: "nbr-tcell", type: "button", "aria-label": `${r + 1} x ${c + 1}` });
        b.addEventListener("mouseenter", () => {
          for (const x of cells) x.b.classList.toggle("nbr-on", x.r <= r && x.c <= c);
          label.textContent = `${c + 1} × ${r + 1} table`;
        });
        b.addEventListener("mousedown", (event) => event.preventDefault());
        b.addEventListener("click", () => this.insertTable(r + 1, c + 1));
        cells.push({ b, r, c });
        grid.append(b);
      }
      const rowsIn = el("input", { class: "nbr-num", type: "number", min: "1", max: "100", value: "3", "aria-label": "Rows" });
      const colsIn = el("input", { class: "nbr-num", type: "number", min: "1", max: "30", value: "3", "aria-label": "Columns" });
      const insert = () => this.insertTable(clamp(Number(rowsIn.value) || 1, 1, 100), clamp(Number(colsIn.value) || 1, 1, 30));
      for (const input of [rowsIn, colsIn]) input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") insert();
      });
      this.openMenu(anchor, el("div", { class: "nbr-table-picker" }, label, grid,
        el("div", { class: "nbr-custom-size" }, el("label", {}, "Rows ", rowsIn), el("label", {}, "Columns ", colsIn),
          el("button", { class: "nbr-btn nbr-primary", type: "button", onclick: insert, text: "Insert" }))));
    }

    showSplit(anchor) {
      const rowsIn = el("input", { class: "nbr-num", type: "number", min: "1", max: "30", value: "1", "aria-label": "Number of rows" });
      const colsIn = el("input", { class: "nbr-num", type: "number", min: "1", max: "20", value: "2", "aria-label": "Number of columns" });
      const cell = this.currentCell();
      if (cell && (cell.rowSpan > 1 || cell.colSpan > 1)) {
        rowsIn.value = String(cell.rowSpan);
        colsIn.value = String(cell.colSpan);
      }
      const split = () => {
        this.closeMenu();
        this.restoreSelection();
        this.tableCommand((t) => this.splitCell(t, clamp(Number(rowsIn.value) || 1, 1, 30), clamp(Number(colsIn.value) || 1, 1, 20)));
        this.focus();
      };
      for (const input of [rowsIn, colsIn]) input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") split();
      });
      this.openMenu(anchor, el("div", { class: "nbr-form" }, el("div", { class: "nbr-section-title", text: "Split cells" }),
        el("label", {}, el("span", { text: "Number of columns" }), colsIn), el("label", {}, el("span", { text: "Number of rows" }), rowsIn),
        el("button", { class: "nbr-btn nbr-primary", type: "button", onclick: split, text: "Split" })));
      colsIn.focus();
      colsIn.select();
    }

    // ---------------------------------------------------------------- content

    setHTML(html) {
      this.pendingHtml = html || "<p><br></p>";
      this.undoStack = [];
      this.redoStack = [];
      this.typing = null;
      if (this.body) {
        this.body.innerHTML = this.pendingHtml;
        this.normalizeInk();
        this.lastHtml = this.getHTML();
        this.refreshFind();
        this.updateCount();
        this.updateContext();
        setTimeout(() => this.storeImages(), 500);
      }
    }

    getHTML() {
      if (!this.body) return this.pendingHtml;
      const clone = this.body.cloneNode(true);
      for (const node of clone.querySelectorAll(".nbr-sel, .nbr-find-fallback, .nbr-img-on")) {
        node.classList.remove("nbr-sel", "nbr-find-fallback", "nbr-img-on");
        if (!node.className) node.removeAttribute("class");
      }
      for (const node of clone.querySelectorAll("[data-nb-canvas]")) node.removeAttribute("contenteditable");
      for (const node of clone.querySelectorAll('[style=""], [class=""]')) {
        if (node.getAttribute("style") === "") node.removeAttribute("style");
        if (node.getAttribute("class") === "") node.removeAttribute("class");
      }
      return clone.innerHTML;
    }

    setEditable(on) {
      this.editable = on;
      if (this.body) this.body.contentEditable = on && !this.drawTool ? "true" : "false";
    }

    hasFocus() {
      return Boolean(this.doc && document.activeElement === this.frame && this.doc.hasFocus());
    }

    focus(atEnd) {
      this.whenReady(() => {
        this.frame.focus();
        this.body.focus();
        if (atEnd) {
          const range = this.doc.createRange();
          range.selectNodeContents(this.body);
          range.collapse(false);
          this.setRange(range);
        } else {
          this.restoreSelection();
        }
      });
    }

    changed() {
      const html = this.getHTML();
      if (html === this.lastHtml) return;
      this.lastHtml = html;
      if (this.options.onChange) this.options.onChange(html);
      this.refreshFind();
      clearTimeout(this.countTimer);
      this.countTimer = setTimeout(() => {
        this.updateCount();
        this.storeImages();
      }, 300);
    }

    updateCount() {
      if (!this.body || !this.count) return;
      const text = this.body.innerText || "";
      const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
      const chars = text.replace(/\s/g, "").length;
      this.count.textContent = `${words} word${words === 1 ? "" : "s"} · ${chars} character${chars === 1 ? "" : "s"}`;
    }

    // ---------------------------------------------------------------- undo (every change, table changes too)

    snapshot() {
      return { html: this.body.innerHTML, sel: this.selectionPath() };
    }

    pushUndo(state) {
      const top = this.undoStack[this.undoStack.length - 1];
      if (top && top.html === state.html) return;
      this.undoStack.push(state);
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
    }

    endTyping() {
      if (this.typing) {
        clearTimeout(this.typing.timer);
        this.typing = null;
      }
    }

    onInput() {
      if (this.inCommand) return;
      if (!this.typing) {
        // the state before this burst of typing
        this.pushUndo(this.beforeTyping || { html: this.lastRaw || this.body.innerHTML, sel: null });
        this.typing = {};
      }
      clearTimeout(this.typing.timer);
      this.typing.timer = setTimeout(() => this.endTyping(), 900);
      this.clearCellSelection();
      this.changed();
      this.lastRaw = this.body.innerHTML;
      this.beforeTyping = null;
    }

    command(fn) {
      if (!this.body || !this.editable) return;
      this.endTyping();
      this.restoreSelection();
      const before = this.snapshot();
      this.inCommand = true;
      try {
        fn();
      } finally {
        this.inCommand = false;
      }
      if (this.body.innerHTML !== before.html) this.pushUndo(before);
      this.lastRaw = this.body.innerHTML;
      this.changed();
      this.updateState();
    }

    undo() {
      if (!this.body) return;
      this.endTyping();
      const state = this.undoStack.pop();
      if (!state) return;
      this.redoStack.push(this.snapshot());
      this.applyState(state);
    }

    redo() {
      if (!this.body) return;
      this.endTyping();
      const state = this.redoStack.pop();
      if (!state) return;
      this.undoStack.push(this.snapshot());
      this.applyState(state);
    }

    applyState(state) {
      this.body.innerHTML = state.html;
      this.lastRaw = state.html;
      this.fitInk();
      this.restorePath(state.sel);
      this.changed();
      this.updateState();
    }

    // selection as child-index paths, so it survives replacing the HTML
    selectionPath() {
      const sel = this.win && this.win.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const range = sel.getRangeAt(0);
      const path = (node) => {
        const out = [];
        while (node && node !== this.body) {
          const parent = node.parentNode;
          if (!parent) return null;
          out.unshift([...parent.childNodes].indexOf(node));
          node = parent;
        }
        return node === this.body ? out : null;
      };
      const start = path(range.startContainer);
      const end = path(range.endContainer);
      return start && end ? { start, so: range.startOffset, end, eo: range.endOffset } : null;
    }

    restorePath(p) {
      if (!p) return;
      const find = (path) => path.reduce((node, i) => (node && node.childNodes[i]) || null, this.body);
      const s = find(p.start);
      const e = find(p.end);
      if (!s || !e) return;
      try {
        const range = this.doc.createRange();
        range.setStart(s, Math.min(p.so, s.nodeType === 3 ? s.data.length : s.childNodes.length));
        range.setEnd(e, Math.min(p.eo, e.nodeType === 3 ? e.data.length : e.childNodes.length));
        this.setRange(range);
      } catch {
        /* the structure changed too much */
      }
    }

    // ---------------------------------------------------------------- selection

    setRange(range) {
      const sel = this.win.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    currentRange() {
      const sel = this.win && this.win.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const range = sel.getRangeAt(0);
      return this.body.contains(range.commonAncestorContainer) ? range : null;
    }

    saveSelection() {
      const range = this.currentRange();
      if (range) this.savedRange = range.cloneRange();
    }

    restoreSelection() {
      if (!this.body || !this.savedRange) return;
      if (this.body.contains(this.savedRange.commonAncestorContainer)) {
        const current = this.currentRange();
        if (!current || this.doc.activeElement !== this.body) this.setRange(this.savedRange);
      }
    }

    exec(command, value = null) {
      try {
        this.doc.execCommand("styleWithCSS", false, ["foreColor", "hiliteColor", "backColor", "fontName", "fontSize"].includes(command));
      } catch {
        /* older browsers */
      }
      return this.doc.execCommand(command, false, value);
    }

    updateState() {
      if (!this.body) return;
      const range = this.currentRange();
      if (!range) return;
      this.saveSelection();
      for (const b of this.dock.querySelectorAll("[data-command]")) {
        let on = false;
        try {
          on = this.doc.queryCommandState(b.dataset.command);
        } catch {
          on = false;
        }
        b.classList.toggle("nbr-on", on);
      }
      // the font and size at the cursor
      let node = range.startContainer;
      if (node.nodeType === 3) node = node.parentNode;
      if (node && node.nodeType === 1) {
        const style = this.win.getComputedStyle(node);
        const pt = Math.round(parseFloat(style.fontSize) * 0.75 * 2) / 2;
        this.sizeSelect.options[0].textContent = String(pt);
        this.fontSelect.options[0].textContent = style.fontFamily.split(",")[0].replace(/["']/g, "").trim() || "Font";
        const block = node.closest("h1, h2, h3, blockquote, pre");
        const found = block && BLOCK_STYLES.find(([tag]) => tag === block.tagName.toLowerCase());
        this.styleSelect.options[0].textContent = found ? found[1] : "Normal";
      }
      this.checklistButton.classList.toggle("nbr-on", Boolean(this.inChecklist()));
      const align = ALIGNS.find(([, , command]) => {
        try {
          return this.doc.queryCommandState(command);
        } catch {
          return false;
        }
      });
      const alignIcon = align ? align[0] : "left";
      if (this.alignButton.dataset.icon !== alignIcon) {
        this.alignButton.dataset.icon = alignIcon;
        this.alignButton.firstChild.replaceWith(icon(alignIcon));
      }
      // table controls
      const cell = this.currentCell();
      const inTable = Boolean(cell);
      for (const control of this.inTableControls) control.disabled = !inTable;
      this.updateContext();
      if (cell) {
        const tr = cell.parentElement;
        this.heightInput.value = String(Math.round(parseFloat(tr.style.height) || tr.getBoundingClientRect().height));
        const table = cell.closest("table");
        const grid = tableGrid(table);
        const p = grid.pos.get(cell);
        const widths = this.columnWidths(table, grid);
        this.widthInput.value = p ? String(Math.round(widths.slice(p.c, p.c + p.cs).reduce((a, b) => a + b, 0))) : "";
      }
    }

    // ---------------------------------------------------------------- keys, paste

    onKey(event) {
      if (event.key === "Escape" && this.drawTool) {
        event.preventDefault();
        return this.setDrawTool(null);
      }
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (ctrl && !event.altKey) {
        const map = { z: event.shiftKey ? "redo" : "undo", y: "redo" };
        if (map[key]) {
          event.preventDefault();
          return this[map[key]]();
        }
        if (key === "f" || key === "h") {
          event.preventDefault();
          return this.openFind(key === "h");
        }
        if (key === "k") {
          event.preventDefault();
          return this.showLinkDialog();
        }
        const commands = { b: "bold", i: "italic", u: "underline", l: "justifyLeft", e: "justifyCenter", r: "justifyRight", j: "justifyFull" };
        if (commands[key] && !event.shiftKey) {
          event.preventDefault();
          return this.command(() => this.exec(commands[key]));
        }
        if (event.key === "=" || event.key === "+") {
          event.preventDefault();
          return this.command(() => this.exec(event.shiftKey || event.key === "+" ? "superscript" : "subscript"));
        }
      }
      if (this.selectedCellsList().length > 1 && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        return this.tableCommand((t) => this.clearCells(t));
      }
      const picked = this.body.querySelector("img.nbr-img-on");
      if (picked && (event.key === "Delete" || event.key === "Backspace") && this.currentRange() && this.currentRange().collapsed) {
        event.preventDefault();
        return this.command(() => {
          this.removeImage(picked);
          this.updateContext();
        });
      }
      if (event.key === "Tab" && !ctrl && !event.altKey) {
        event.preventDefault();
        const cell = this.currentCell();
        if (cell) return this.tabInTable(cell, event.shiftKey);
        if (this.doc.queryCommandState("insertUnorderedList") || this.doc.queryCommandState("insertOrderedList")) {
          return this.command(() => this.exec(event.shiftKey ? "outdent" : "indent"));
        }
        return this.command(() => this.exec("insertText", "    "));
      }
      if (event.key === "Enter" && this.inChecklist()) {
        setTimeout(() => {
          const range = this.currentRange();
          let node = range && range.startContainer;
          if (node && node.nodeType === 3) node = node.parentElement;
          const li = node && node.closest && node.closest("ul[data-nb-checklist] > li");
          if (li && !li.textContent.trim()) li.setAttribute("data-checked", "false");
        }, 0);
      }
      if (!ctrl && !["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
        if (!this.typing) this.beforeTyping = this.snapshot();
        if (event.key.length === 1 || event.key === "Enter") this.clearCellSelection();
      }
    }

    tabInTable(cell, back) {
      const table = cell.closest("table");
      const cells = [...table.querySelectorAll("td, th")].filter((c) => c.closest("table") === table);
      const index = cells.indexOf(cell);
      let next = cells[index + (back ? -1 : 1)];
      if (!next && !back) {
        // Tab in the last cell adds a row, as in Word
        this.tableCommand((t) => this.insertRow(t, true));
        const again = [...table.querySelectorAll("td, th")].filter((c) => c.closest("table") === table);
        next = again[index + 1];
      }
      if (!next) return;
      const range = this.doc.createRange();
      range.selectNodeContents(next);
      this.setRange(range);
    }

    onPaste(event) {
      const data = event.clipboardData;
      if (!data) return;
      const imageItem = [...(data.items || [])].find((item) => item.type && item.type.startsWith("image/"));
      const imageFile = imageItem ? imageItem.getAsFile() : [...(data.files || [])].find((f) => f.type.startsWith("image/"));
      if (imageFile) {
        event.preventDefault();
        this.importImageFile(imageFile);
        return;
      }
      event.preventDefault();
      const html = data.getData("text/html");
      const text = data.getData("text/plain");
      this.command(() => {
        if (html) this.exec("insertHTML", window.NotebookRich.cleanHtml(html.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, "")));
        else this.exec("insertHTML", text.split(/\r?\n/).map((line) => escapeHtml(line) || "<br>").join("<br>"));
      });
    }

    // ---------------------------------------------------------------- links, pictures, page layout

    currentLink() {
      const range = this.currentRange();
      if (!range) return null;
      const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      return node && node.closest("a[href]");
    }

    unwrapLink() {
      const link = this.currentLink();
      if (!link) return;
      link.replaceWith(...link.childNodes);
      this.body.normalize();
    }

    showLinkDialog() {
      if (!this.body || !this.editable) return;
      this.saveSelection();
      const existing = this.currentLink();
      const selected = this.currentRange() && !this.currentRange().collapsed ? this.currentRange().toString() : "";
      const textIn = el("input", { class: "nbr-find-input", type: "text", value: selected || (existing ? existing.textContent : ""), "aria-label": "Text to display" });
      const hrefIn = el("input", { class: "nbr-find-input", type: "url", value: existing ? existing.getAttribute("href") : "https://", "aria-label": "Address" });
      const apply = () => {
        const href = hrefIn.value.trim();
        const label = textIn.value.trim() || href;
        if (!/^(https?:|mailto:|#)/i.test(href)) return;
        this.closeMenu();
        this.restoreSelection();
        this.command(() => {
          const link = this.currentLink();
          if (link) {
            link.setAttribute("href", href);
            if (label) link.textContent = label;
            return;
          }
          if (this.hasSelection()) {
            this.exec("createLink", href);
            const made = this.currentLink();
            if (made) {
              made.setAttribute("target", "_blank");
              made.setAttribute("rel", "noopener noreferrer");
            }
          } else {
            this.exec("insertHTML", `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
          }
        });
        this.focus();
      };
      for (const input of [textIn, hrefIn]) input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") apply();
      });
      const opener = this.insertButton;
      this.openMenu(opener, el("div", { class: "nbr-form nbr-link-form" },
        el("div", { class: "nbr-section-title", text: existing ? "Edit link" : "Insert link" }),
        el("label", {}, el("span", { text: "Text" }), textIn),
        el("label", {}, el("span", { text: "Address" }), hrefIn),
        el("div", { class: "nbr-row" },
          el("button", { class: "nbr-btn nbr-primary", type: "button", onclick: apply, text: "OK" }),
          existing ? el("button", { class: "nbr-btn", type: "button", text: "Remove", onclick: () => {
            this.closeMenu();
            this.restoreSelection();
            this.command(() => this.unwrapLink());
            this.focus();
          } }) : null)));
      hrefIn.focus();
      hrefIn.select();
    }

    // A picture from a file, the clipboard or a drop: kept as a file in notes/assets.
    // A picture made by the WebUI comes in with its generation parameters.
    async importImageFile(file, readInfo = false) {
      if (!file || !file.type.startsWith("image/")) return;
      const X = window.NotebookExtras;
      const info = readInfo && X && /png|jpe?g|webp/.test(file.type) ? await X.readImageInfo(file) : { infotext: "" };
      let src;
      try {
        src = X ? await X.uploadBlob(file) : await this.compressImage(file);
      } catch {
        src = await this.compressImage(file).catch(() => null);
      }
      if (!src) return;
      if (info.infotext) return this.insertParams(info.infotext, src);
      this.command(() => {
        this.exec("insertHTML", `<img src="${escapeHtml(src)}" alt="${escapeHtml((file.name || "picture").replace(/\.[a-z]+$/i, ""))}">`);
      });
    }

    async onDrop(event) {
      const dt = event.dataTransfer;
      if (!dt || this.drawTool) return;
      let files = [...(dt.files || [])].filter((f) => f.type.startsWith("image/"));
      const url = !files.length && (dt.getData("text/uri-list") || "").split("\n").find((u) => u && !u.startsWith("#"));
      if (!files.length && !url) return;
      event.preventDefault();
      const at = this.doc.caretRangeFromPoint ? this.doc.caretRangeFromPoint(event.clientX, event.clientY) : null;
      if (at && this.body.contains(at.startContainer)) {
        this.setRange(at);
        this.saveSelection();
      }
      if (!files.length) {
        // a picture dragged from the WebUI's gallery
        try {
          const response = await fetch(url.trim(), { credentials: "same-origin" });
          const blob = await response.blob();
          if (!blob.type.startsWith("image/")) return;
          files = [new File([blob], "image" + (blob.type === "image/png" ? ".png" : ".jpg"), { type: blob.type })];
        } catch {
          return;
        }
      }
      for (const file of files) await this.importImageFile(file, true);
    }

    compressImage(file, maxEdge = 1600, maxChars = 1200000) {
      return new Promise((resolve, reject) => {
        if (file.size < 180000 && file.type !== "image/svg+xml") {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = reject;
          reader.readAsDataURL(file);
          return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth || 1;
          let h = img.naturalHeight || 1;
          const scale = Math.min(1, maxEdge / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          let q = 0.86;
          let data = canvas.toDataURL("image/jpeg", q);
          while (data.length > maxChars && q > 0.45) {
            q -= 0.1;
            data = canvas.toDataURL("image/jpeg", q);
          }
          resolve(data);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("image"));
        };
        img.src = url;
      });
    }

    sheet() {
      if (!this.body) return null;
      let node = this.body.querySelector(":scope > [data-nb-sheet]");
      if (node) return node;
      node = this.doc.createElement("div");
      node.setAttribute("data-nb-sheet", "");
      for (const child of [...this.body.childNodes]) {
        if (!(child.nodeType === 1 && child.matches("svg[data-nb-ink]"))) node.append(child);
      }
      this.body.prepend(node);
      return node;
    }

    layoutState() {
      const node = this.body && this.body.querySelector(":scope > [data-nb-sheet]");
      const columns = node ? parseInt(node.style.columnCount || "1", 10) || 1 : 1;
      return {
        columns,
        hyphens: Boolean(node && node.style.hyphens === "auto"),
        lang: (node && node.getAttribute("lang")) || "en",
      };
    }

    setColumns(count) {
      const node = this.sheet();
      count = clamp(count || 1, 1, 3);
      if (count <= 1) {
        node.style.columnCount = "";
        node.style.columnGap = "";
        node.style.columnRule = "";
      } else {
        node.style.columnCount = String(count);
        node.style.columnGap = "1.6em";
        node.style.columnRule = "1px solid #d0d0d0";
      }
      this.dropSheetIfPlain();
    }

    setHyphens(on) {
      const node = this.sheet();
      if (on) {
        node.style.hyphens = "auto";
        node.style.webkitHyphens = "auto";
        if (!node.getAttribute("lang")) node.setAttribute("lang", this.layoutState().lang || "en");
      } else {
        node.style.hyphens = "";
        node.style.webkitHyphens = "";
      }
      this.dropSheetIfPlain();
    }

    setLang(lang) {
      const node = this.sheet();
      node.setAttribute("lang", lang || "en");
    }

    dropSheetIfPlain() {
      const node = this.body && this.body.querySelector(":scope > [data-nb-sheet]");
      if (!node) return;
      const styled = node.getAttribute("style") || "";
      if (!styled.trim() && !node.getAttribute("lang")) {
        node.replaceWith(...node.childNodes);
      }
    }

    // ---------------------------------------------------------------- line and paragraph spacing

    // the paragraphs the cursor or the selection is in (a cell, for text straight in a cell)
    paragraphs() {
      const range = this.currentRange();
      if (!range) return [];
      const blocks = this.blocksIn(range);
      if (blocks.length) return blocks;
      const cell = this.currentCell();
      return cell ? [cell] : [];
    }

    lineSpacing() {
      const block = this.paragraphs()[0];
      const value = block ? parseFloat(block.style.lineHeight) : NaN;
      return Number.isFinite(value) ? value : DEFAULT_LINE;
    }

    setLineSpacing(value) {
      for (const block of this.paragraphs()) {
        if (value === DEFAULT_LINE) block.style.removeProperty("line-height");
        else block.style.lineHeight = String(value);
        if (!block.getAttribute("style")) block.removeAttribute("style");
      }
    }

    paragraphGap() {
      const block = this.paragraphs()[0];
      const value = block ? block.style.marginBottom : "";
      return Object.keys(GAP_CSS).find((key) => GAP_CSS[key] === value) || "normal";
    }

    setParagraphGap(key) {
      for (const block of this.paragraphs()) {
        if (GAP_CSS[key]) block.style.marginBottom = GAP_CSS[key];
        else block.style.removeProperty("margin-bottom");
        if (!block.getAttribute("style")) block.removeAttribute("style");
      }
    }

    // ---------------------------------------------------------------- text formatting

    setFontSize(pt) {
      // execCommand's sizes are 1-7: set 7, then turn what it made into points
      this.exec("fontSize", "7");
      for (const node of this.body.querySelectorAll('font[size="7"], span[style*="xxx-large"]')) {
        if (node.tagName === "FONT") {
          const span = this.doc.createElement("span");
          span.style.fontSize = `${pt}pt`;
          span.append(...node.childNodes);
          node.replaceWith(span);
        } else {
          node.style.fontSize = `${pt}pt`;
        }
      }
    }

    setFont(name) {
      if (name === "default") {
        if (!this.hasSelection()) return;
        this.exec("fontName", SENTINEL);
        this.stripSentinel("font-family", (value) => value.includes(SENTINEL));
        return;
      }
      this.exec("fontName", name);
    }

    // apply a sentinel value, then remove the property wherever the sentinel landed
    stripSentinel(prop, matches) {
      for (const node of this.body.querySelectorAll("[style], font")) {
        const value = node.style.getPropertyValue(prop);
        if (value && matches(value)) node.style.removeProperty(prop);
        if (node.tagName === "FONT") {
          if (prop === "color" && node.getAttribute("color") && matches(node.getAttribute("color"))) node.removeAttribute("color");
          if (prop === "font-family" && node.getAttribute("face") && matches(node.getAttribute("face"))) node.removeAttribute("face");
        }
        if (!node.getAttribute("style")) node.removeAttribute("style");
        if ((node.tagName === "SPAN" || node.tagName === "FONT") && !node.attributes.length) node.replaceWith(...node.childNodes);
      }
      this.body.normalize();
    }

    // "no colour" on a real selection only: on a bare cursor the browser would keep
    // the placeholder colour for whatever is typed next
    hasSelection() {
      const range = this.currentRange();
      return Boolean(range && !range.collapsed);
    }

    setTextColor(color) {
      if (color) return this.exec("foreColor", color);
      if (!this.hasSelection()) return;
      this.exec("foreColor", SENTINEL);
      this.stripSentinel("color", (v) => v.replace(/\s/g, "") === SENTINEL_RGB.replace(/\s/g, "") || v.toLowerCase() === SENTINEL);
    }

    setHighlight(color) {
      if (color) return this.exec("hiliteColor", color);
      if (!this.hasSelection()) return;
      this.exec("hiliteColor", SENTINEL);
      this.stripSentinel("background-color", (v) => v.replace(/\s/g, "") === SENTINEL_RGB.replace(/\s/g, "") || v.toLowerCase() === SENTINEL);
    }

    // Shading, as in Word: table cells when the cursor is in a table, the paragraphs
    // when the selection covers them (or is just the cursor), else the selected text.
    setShading(color) {
      const cells = this.selectedCellsList();
      if (cells.length) return this.shadeCells(null, color, cells);
      const range = this.currentRange();
      if (!range) return;
      const blocks = this.blocksIn(range);
      const whole = range.collapsed || range.toString().replace(/\s+/g, "") === blocks.map((b) => b.textContent).join("").replace(/\s+/g, "");
      if (whole && blocks.length) {
        for (const block of blocks) {
          if (color) block.style.backgroundColor = color;
          else block.style.removeProperty("background-color");
          if (!block.getAttribute("style")) block.removeAttribute("style");
        }
        return;
      }
      this.setHighlight(color);
    }

    blocksIn(range) {
      const blockOf = (node) => {
        const elNode = node.nodeType === 1 ? node : node.parentElement;
        const block = elNode && elNode.closest(BLOCKS);
        return block && this.body.contains(block) ? block : null;
      };
      const out = new Set();
      const start = blockOf(range.startContainer);
      if (start) out.add(start);
      for (const block of this.body.querySelectorAll(BLOCKS)) {
        if (range.intersectsNode(block) && !block.querySelector(BLOCKS)) out.add(block);
      }
      const end = blockOf(range.endContainer);
      if (end) out.add(end);
      if (!out.size && range.collapsed) {
        // text straight in <body>: wrap it in a paragraph first
        this.exec("formatBlock", "p");
        const again = blockOf(this.currentRange().startContainer);
        if (again) out.add(again);
      }
      return [...out].filter((b) => ![...out].some((o) => o !== b && b.contains(o)));
    }

    changeCase(mode) {
      const range = this.currentRange();
      if (!range || range.collapsed) return;
      const walker = this.doc.createTreeWalker(range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) if (range.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode);
      let sentenceStart = true;
      let wordStart = true;
      const startNode = range.startContainer;
      const startOffset = range.startOffset;
      const endNode = range.endContainer;
      const endOffset = range.endOffset;
      for (const node of nodes) {
        const from = node === startNode ? startOffset : 0;
        const to = node === endNode ? endOffset : node.data.length;
        let out = "";
        for (const ch of node.data.slice(from, to)) {
          const letter = ch.toLowerCase() !== ch.toUpperCase();
          if (mode === "upper") out += ch.toUpperCase();
          else if (mode === "lower") out += ch.toLowerCase();
          else if (mode === "toggle") out += ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
          else if (mode === "title") out += letter ? (wordStart ? ch.toUpperCase() : ch.toLowerCase()) : ch;
          else if (mode === "sentence") out += letter ? (sentenceStart ? ch.toUpperCase() : ch.toLowerCase()) : ch;
          if (letter) sentenceStart = false;
          if (/[.!?]/.test(ch)) sentenceStart = true;
          wordStart = !letter && !/['’]/.test(ch);
        }
        node.data = node.data.slice(0, from) + out + node.data.slice(to);
      }
      if (nodes.length) {
        const r = this.doc.createRange();
        r.setStart(startNode, startOffset);
        r.setEnd(endNode, endOffset);
        this.setRange(r);
      }
    }

    clearFormatting() {
      this.exec("removeFormat");
      this.setHighlight(null);
      const range = this.currentRange();
      if (range) for (const block of this.blocksIn(range)) {
        for (const prop of ["background-color", "text-align", "color", "font-size", "font-family"]) block.style.removeProperty(prop);
        if (!block.getAttribute("style")) block.removeAttribute("style");
      }
    }

    // ---------------------------------------------------------------- tables: selection

    currentCell() {
      const range = this.currentRange();
      const selected = this.body && this.body.querySelector(".nbr-sel");
      if (selected) return selected;
      if (!range) return null;
      let node = range.startContainer;
      if (node.nodeType === 3) node = node.parentNode;
      const cell = node && node.closest && node.closest("td, th");
      return cell && this.body.contains(cell) ? cell : null;
    }

    selectedCellsList() {
      if (!this.body) return [];
      const marked = [...this.body.querySelectorAll(".nbr-sel")];
      if (marked.length) return marked;
      const cell = this.currentCell();
      return cell ? [cell] : [];
    }

    // cells the table commands act on, and their rectangle
    target() {
      const cells = this.selectedCellsList();
      if (!cells.length) return null;
      const table = cells[0].closest("table");
      const grid = tableGrid(table);
      const rect = cellRect(grid, cells.filter((c) => c.closest("table") === table));
      return { table, grid, rect, cells: cellsIn(grid, rect), anchor: cells[0] };
    }

    tableCommand(fn) {
      this.command(() => {
        const t = this.target();
        if (t) fn(t);
      });
    }

    markCells(cells) {
      this.clearCellSelection();
      for (const cell of cells) cell.classList.add("nbr-sel");
      this.body.classList.toggle("nbr-cells-selected", cells.length > 1);
    }

    clearCellSelection() {
      if (!this.body) return;
      for (const cell of this.body.querySelectorAll(".nbr-sel")) {
        cell.classList.remove("nbr-sel");
        if (!cell.className) cell.removeAttribute("class");
      }
      this.body.classList.remove("nbr-cells-selected");
    }

    selectCells(what) {
      const t = this.target();
      if (!t) return;
      const { grid, rect } = t;
      const full = { r0: 0, c0: 0, r1: grid.nrows - 1, c1: grid.ncols - 1 };
      const r = what === "row" ? { ...full, r0: rect.r0, r1: rect.r1 } : what === "column" ? { ...full, c0: rect.c0, c1: rect.c1 } : what === "table" ? full : rect;
      this.markCells(cellsIn(grid, cellRect(grid, cellsIn(grid, r))));
      this.updateState();
    }

    onMouseDown(event) {
      if (this.drawTool) return;
      if (event.button !== 0) return;
      if (this.resizeHover) return this.startResize(event);
      const cell = event.target.closest && event.target.closest("td, th");
      if (event.shiftKey && cell) {
        const current = this.currentCell();
        if (current && current !== cell && current.closest("table") === cell.closest("table")) {
          event.preventDefault();
          const grid = tableGrid(cell.closest("table"));
          this.markCells(cellsIn(grid, cellRect(grid, [current, cell])));
          this.updateState();
          return;
        }
      }
      this.clearCellSelection();
      if (!cell) return;
      const table = cell.closest("table");
      const move = (e) => {
        const over = e.target.closest && e.target.closest("td, th");
        if (!over || over.closest("table") !== table) return;
        if (over === cell && !this.body.querySelector(".nbr-sel")) return;
        const grid = tableGrid(table);
        this.markCells(cellsIn(grid, cellRect(grid, [cell, over])));
        if (over !== cell) this.win.getSelection().collapse(cell, 0);
      };
      const up = () => {
        this.doc.removeEventListener("mousemove", move);
        this.doc.removeEventListener("mouseup", up);
        this.updateState();
      };
      this.doc.addEventListener("mousemove", move);
      this.doc.addEventListener("mouseup", up);
    }

    // ---------------------------------------------------------------- tables: resizing by dragging borders

    onMouseMove(event) {
      if (event.buttons) return;
      this.resizeHover = null;
      const cell = event.target.closest && event.target.closest("td, th");
      let cursor = "";
      if (cell && this.editable) {
        const r = cell.getBoundingClientRect();
        const table = cell.closest("table");
        const grid = tableGrid(table);
        const p = grid.pos.get(cell);
        const x = event.clientX;
        const y = event.clientY;
        if (Math.abs(x - r.right) <= 4) this.resizeHover = { kind: "col", table, index: p.c + p.cs - 1 };
        else if (Math.abs(x - r.left) <= 4 && p.c > 0) this.resizeHover = { kind: "col", table, index: p.c - 1 };
        else if (Math.abs(y - r.bottom) <= 4) this.resizeHover = { kind: "row", table, index: p.r + p.rs - 1 };
        else if (Math.abs(y - r.top) <= 4 && p.r > 0) this.resizeHover = { kind: "row", table, index: p.r - 1 };
        if (this.resizeHover) cursor = this.resizeHover.kind === "col" ? "col-resize" : "row-resize";
      }
      this.body.style.cursor = cursor;
      if (!this.body.getAttribute("style")) this.body.removeAttribute("style");
    }

    startResize(event) {
      event.preventDefault();
      const hover = this.resizeHover;
      this.command(() => {
        const { table } = hover;
        const grid = tableGrid(table);
        const startX = event.clientX;
        const startY = event.clientY;
        let apply;
        if (hover.kind === "col") {
          const cols = this.fixColumns(table, grid);
          const widths = cols.map((c) => parseFloat(c.style.width));
          const i = hover.index;
          apply = (e) => {
            const dx = e.clientX - startX;
            if (i + 1 < cols.length) {
              // the border between two columns: one grows, the other shrinks
              const d = clamp(dx, 16 - widths[i], widths[i + 1] - 16);
              cols[i].style.width = `${widths[i] + d}px`;
              cols[i + 1].style.width = `${widths[i + 1] - d}px`;
            } else {
              cols[i].style.width = `${Math.max(16, widths[i] + dx)}px`;
              table.style.width = `${widths.reduce((a, b) => a + b, 0) - widths[i] + Math.max(16, widths[i] + dx)}px`;
            }
          };
        } else {
          const tr = grid.rows[hover.index];
          const h = tr.getBoundingClientRect().height;
          apply = (e) => (tr.style.height = `${Math.round(Math.max(12, h + e.clientY - startY))}px`);
        }
        this.dragging = true;
        const move = (e) => apply(e);
        const up = () => {
          this.doc.removeEventListener("mousemove", move);
          this.doc.removeEventListener("mouseup", up);
          this.dragging = false;
          this.lastRaw = this.body.innerHTML;
          this.changed();
          this.updateState();
        };
        this.doc.addEventListener("mousemove", move);
        this.doc.addEventListener("mouseup", up);
      });
    }

    // ---------------------------------------------------------------- tables: structure

    insertTable(rows, cols) {
      this.closeMenu();
      this.restoreSelection();
      this.command(() => {
        // built here rather than pasted in: the browser rearranges pasted tables, and drops styles
        const table = this.doc.createElement("table");
        table.setAttribute("style", "border-collapse: collapse; width: 100%");
        const tbody = this.doc.createElement("tbody");
        for (let r = 0; r < rows; r++) {
          const tr = this.doc.createElement("tr");
          for (let c = 0; c < cols; c++) tr.append(this.newCell(null));
          tbody.append(tr);
        }
        table.append(tbody);
        this.insertBlock(table, table.querySelector("td"));
      });
      this.focus();
    }

    // A block (table, parameters, drawing area) after the paragraph the cursor
    // is in, or instead of it when that one is empty; always with a paragraph after it.
    insertBlock(node, caretIn) {
      const range = this.currentRange();
      let block = range ? range.startContainer : null;
      if (block && block.nodeType === 3) block = block.parentElement;
      if (block === this.body && range) block = this.body.childNodes[range.startOffset] || null;
      const container = (n) => n.parentElement === this.body || n.parentElement.matches("td, th, blockquote, [data-nb-sheet]");
      while (block && block !== this.body && !container(block)) block = block.parentElement;
      if (block && block.nodeType === 1 && block.matches("svg[data-nb-ink]")) block = null;
      if (!block || block === this.body) {
        const ink = this.body.querySelector(":scope > svg[data-nb-ink]");
        this.body.insertBefore(node, ink || null);
      } else if (block.nodeType === 1 && block.matches("p, div:not([data-nb-params]):not([data-nb-canvas]):not([data-nb-sheet]), h1, h2, h3, h4, h5, h6")
        && !block.textContent.trim() && !block.querySelector("table, img, svg")) block.replaceWith(node);
      else block.after(node);
      const next = node.nextElementSibling;
      if (!next || next.matches("svg[data-nb-ink], table, [data-nb-params], [data-nb-canvas]")) {
        const p = this.doc.createElement("p");
        p.append(this.doc.createElement("br"));
        node.after(p);
      }
      this.caretTo(caretIn || node.nextElementSibling);
    }

    // generation parameters (and the picture they made) as one block
    insertParams(infotext, src) {
      this.command(() => {
        const box = this.doc.createElement("div");
        box.setAttribute("data-nb-params", "");
        if (src) {
          const img = this.doc.createElement("img");
          img.setAttribute("src", src);
          img.setAttribute("alt", "Generated image");
          box.append(img);
        }
        const pre = this.doc.createElement("pre");
        pre.textContent = String(infotext || "").trim();
        box.append(pre);
        this.insertBlock(box, box.nextElementSibling);
        this.caretTo(box.nextElementSibling || pre);
      });
      this.updateContext();
    }

    currentParams() {
      if (!this.body) return null;
      const picked = this.pickedImage();
      if (picked && picked.closest("[data-nb-params]")) return picked.closest("[data-nb-params]");
      const range = this.currentRange();
      if (!range) return null;
      let node = range.startContainer;
      if (node.nodeType === 3) node = node.parentElement;
      const box = node && node.closest && node.closest("[data-nb-params]");
      return box && this.body.contains(box) ? box : null;
    }

    sendParams(tab) {
      const box = this.currentParams();
      const pre = box && box.querySelector("pre");
      if (pre && this.options.onSend) this.options.onSend(pre.innerText.trim(), tab);
    }

    copyParams() {
      const box = this.currentParams();
      const pre = box && box.querySelector("pre");
      if (!pre) return;
      const text = pre.innerText.trim();
      const done = () => this.hint("Parameters copied");
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => this.copyFallback(text, done));
      else this.copyFallback(text, done);
    }

    copyFallback(text, done) {
      const area = el("textarea", { style: "position: fixed; left: -9999px" });
      area.value = text;
      document.body.append(area);
      area.select();
      try {
        document.execCommand("copy");
        done();
      } finally {
        area.remove();
      }
    }

    hint(text) {
      this.modeHint.textContent = text;
      clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => (this.modeHint.textContent = this.drawTool ? "Drawing: Esc or Done to type again" : ""), 2500);
    }

    // text at the cursor (snippets); what is selected (to save as a snippet)
    insertText(text) {
      this.whenReady(() => {
        this.frame.focus();
        this.body.focus();
        this.restoreSelection();
        this.command(() => this.exec("insertText", text));
      });
    }

    selectedText() {
      const range = this.currentRange() || this.savedRange;
      return range ? range.toString() : "";
    }

    setDarkPage(on) {
      this.darkPage = Boolean(on);
      if (this.doc) this.doc.documentElement.classList.toggle("nbr-dark-page", this.darkPage);
    }

    // pictures still kept inside the note (pasted, or from older notes) become files
    async storeImages() {
      const X = window.NotebookExtras;
      if (!X || this.storingImages || !this.editable || !this.body) return;
      const images = [...this.body.querySelectorAll('img[src^="data:image/"]')];
      if (!images.length) return;
      this.storingImages = true;
      try {
        for (const img of images) {
          const url = await X.uploadDataUrl(img.getAttribute("src"));
          if (this.body.contains(img)) img.setAttribute("src", url);
        }
        this.lastRaw = this.body.innerHTML;
        this.changed();
      } catch {
        /* kept inside the note */
      } finally {
        this.storingImages = false;
      }
    }

    // checklists: a list whose items tick on and off
    inChecklist() {
      const range = this.currentRange();
      let node = range && range.startContainer;
      if (node && node.nodeType === 3) node = node.parentElement;
      const list = node && node.closest && node.closest("ul[data-nb-checklist]");
      return list && this.body.contains(list) ? list : null;
    }

    toggleChecklist() {
      const list = this.inChecklist();
      if (list) {
        list.removeAttribute("data-nb-checklist");
        for (const li of list.querySelectorAll(":scope > li")) li.removeAttribute("data-checked");
        return;
      }
      if (!this.doc.queryCommandState("insertUnorderedList")) this.exec("insertUnorderedList");
      const range = this.currentRange();
      let node = range && range.startContainer;
      if (node && node.nodeType === 3) node = node.parentElement;
      const ul = node && node.closest && node.closest("ul");
      if (ul) {
        ul.setAttribute("data-nb-checklist", "");
        for (const li of ul.querySelectorAll(":scope > li")) if (!li.hasAttribute("data-checked")) li.setAttribute("data-checked", "false");
      }
    }

    showNoteLinks(anchor) {
      const names = this.options.noteNames ? this.options.noteNames() : [];
      const search = el("input", { class: "nbr-find-input", type: "search", placeholder: "Find a note", "aria-label": "Find a note" });
      const list = el("div", { class: "nbr-menu-list nbr-note-list" });
      const selected = this.selectedText().trim();
      const insert = (name) => {
        this.closeMenu();
        this.focus();
        this.command(() => this.exec("insertHTML", `<a href="#note:${escapeHtml(name)}">${escapeHtml(selected || name)}</a>`));
      };
      const draw = () => {
        const query = search.value.trim().toLowerCase();
        list.textContent = "";
        const found = names.filter((n) => n.toLowerCase().includes(query)).slice(0, 40);
        for (const name of found) {
          const b = el("button", { class: "nbr-menu-item", type: "button", text: name });
          b.addEventListener("mousedown", (event) => event.preventDefault());
          b.addEventListener("click", () => insert(name));
          list.append(b);
        }
        if (query && !names.some((n) => n.toLowerCase() === query)) {
          const b = el("button", { class: "nbr-menu-item", type: "button", text: `New note “${search.value.trim()}”` });
          b.addEventListener("click", () => insert(search.value.trim()));
          list.append(b);
        }
      };
      search.addEventListener("input", draw);
      search.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          const first = list.querySelector("button");
          if (first) first.click();
        }
      });
      draw();
      this.openMenu(anchor, el("div", { class: "nbr-panel-card nbr-form" }, el("div", { class: "nbr-section-title", text: "Link to a note" }), search, list,
        el("div", { class: "nbr-note", text: "Ctrl+click the link to open the note." })));
      search.focus();
    }

    newCell(like) {
      const td = this.doc.createElement(like && like.tagName === "TH" ? "th" : "td");
      const style = like ? like.getAttribute("style") : CELL_STYLE;
      if (style) td.setAttribute("style", style.replace(/(^|;)\s*(width|height)\s*:[^;]*/g, ""));
      td.append(this.doc.createElement("br"));
      return td;
    }

    insertRow(t, below) {
      const { grid, rect, table } = t;
      const r = below ? rect.r1 : rect.r0;
      const tr = this.doc.createElement("tr");
      const done = new Set();
      for (let c = 0; c < grid.ncols; c++) {
        const cell = grid.slots[r][c];
        if (!cell || done.has(cell)) continue;
        done.add(cell);
        const p = grid.pos.get(cell);
        const crosses = below ? p.r + p.rs - 1 > r : p.r < r;
        if (crosses) {
          cell.rowSpan = p.rs + 1;
        } else {
          const td = this.newCell(cell);
          if (p.cs > 1) td.colSpan = p.cs;
          tr.append(td);
        }
      }
      grid.rows[r].parentNode.insertBefore(tr, below ? grid.rows[r].nextSibling : grid.rows[r]);
      if (!tr.cells.length) tr.remove();          // the cursor stays where it was, as in Word
      void table;
    }

    insertColumn(t, right) {
      const { grid, rect, table } = t;
      const c = right ? rect.c1 : rect.c0;
      const done = new Set();
      const additions = [];
      for (let r = 0; r < grid.nrows; r++) {
        const cell = grid.slots[r][c];
        if (!cell || done.has(cell)) continue;
        done.add(cell);
        const p = grid.pos.get(cell);
        const crosses = right ? p.c + p.cs - 1 > c : p.c < c;
        if (crosses) {
          cell.colSpan = p.cs + 1;
        } else {
          const td = this.newCell(cell);
          if (p.rs > 1) td.rowSpan = p.rs;
          additions.push([p.r, right ? c : c - 0.5, td, cell, right]);
        }
      }
      for (const [r, , td, cell, isRight] of additions) {
        if (isRight) cell.after(td);
        else cell.before(td);
        void r;
      }
      this.syncColgroup(table, grid, "insert", right ? c + 1 : c);
    }

    deleteRows(t) {
      const { grid, rect, table } = t;
      const { r0, r1 } = rect;
      if (r0 === 0 && r1 === grid.nrows - 1) return this.deleteTable(t);
      const count = r1 - r0 + 1;
      for (const [cell, p] of grid.pos) {
        const end = p.r + p.rs - 1;
        if (end < r0 || p.r > r1) continue;
        const overlap = Math.min(end, r1) - Math.max(p.r, r0) + 1;
        if (overlap === p.rs) continue;                     // removed with its rows
        if (p.r >= r0) {
          // starts in a deleted row but reaches below: move it down
          cell.rowSpan = p.rs - overlap;
          const below = r1 + 1;
          const after = [...grid.rows[below].cells].find((o) => grid.pos.get(o).c > p.c);
          grid.rows[below].insertBefore(cell, after || null);
        } else {
          cell.rowSpan = p.rs - overlap;
        }
      }
      for (let r = r0; r <= r1; r++) grid.rows[r].remove();
      const next = table.rows[Math.min(r0, table.rows.length - 1)];
      if (next && next.cells[0]) this.caretTo(next.cells[0]);
      void count;
    }

    deleteColumns(t) {
      const { grid, rect, table } = t;
      const { c0, c1 } = rect;
      if (c0 === 0 && c1 === grid.ncols - 1) return this.deleteTable(t);
      for (const [cell, p] of grid.pos) {
        const end = p.c + p.cs - 1;
        if (end < c0 || p.c > c1) continue;
        const overlap = Math.min(end, c1) - Math.max(p.c, c0) + 1;
        if (overlap === p.cs) cell.remove();
        else cell.colSpan = p.cs - overlap;
      }
      for (let i = 0; i <= c1 - c0; i++) this.syncColgroup(table, grid, "delete", c0);
      for (const tr of [...table.rows]) if (!tr.cells.length) tr.remove();
      const first = table.querySelector("td, th");
      if (first) this.caretTo(first);
    }

    deleteTable(t) {
      const after = this.doc.createElement("p");
      after.append(this.doc.createElement("br"));
      t.table.replaceWith(after);
      this.caretTo(after);
    }

    clearCells(t) {
      for (const cell of t.cells) {
        cell.textContent = "";
        cell.append(this.doc.createElement("br"));
      }
    }

    mergeCells(t) {
      const { cells, rect, grid } = t;
      if (cells.length < 2) return;
      const anchor = grid.slots[rect.r0][rect.c0];
      const contents = [];
      for (const cell of cells) {
        if (cell === anchor) continue;
        const empty = !cell.textContent.trim() && !cell.querySelector("img, table");
        if (!empty) contents.push(...cell.childNodes);
        cell.remove();
      }
      if (contents.length) {
        const isEmpty = !anchor.textContent.trim();
        if (isEmpty) anchor.textContent = "";
        for (const node of contents) {
          if (!isEmpty || anchor.childNodes.length) anchor.append(this.doc.createElement("br"));
          anchor.append(node);
        }
      }
      anchor.rowSpan = rect.r1 - rect.r0 + 1;
      anchor.colSpan = rect.c1 - rect.c0 + 1;
      if (anchor.rowSpan === 1) anchor.removeAttribute("rowspan");
      if (anchor.colSpan === 1) anchor.removeAttribute("colspan");
      this.clearCellSelection();
      this.caretTo(anchor);
    }

    // Split one cell into rows x columns. A merged cell splits back along its
    // own rows and columns first; more than that adds rows or columns to the
    // table, which the neighbouring cells span.
    splitCell(t, nRows, nCols) {
      const { table } = t;
      const cell = t.anchor;
      let grid = tableGrid(table);
      let p = grid.pos.get(cell);
      if (nCols > p.cs) {
        const extra = nCols - p.cs;
        const last = p.c + p.cs - 1;
        const done = new Set([cell]);
        for (let r = 0; r < grid.nrows; r++) {
          const other = grid.slots[r][last];
          if (!other || done.has(other)) continue;
          done.add(other);
          other.colSpan = grid.pos.get(other).cs + extra;
        }
        for (let i = 0; i < extra; i++) this.syncColgroup(table, grid, "split", last);
        cell.colSpan = p.cs + extra;
      }
      grid = tableGrid(table);
      p = grid.pos.get(cell);
      if (nRows > p.rs) {
        const extra = nRows - p.rs;
        const last = p.r + p.rs - 1;
        const done = new Set([cell]);
        for (let c = 0; c < grid.ncols; c++) {
          const other = grid.slots[last][c];
          if (!other || done.has(other)) continue;
          done.add(other);
          other.rowSpan = grid.pos.get(other).rs + extra;
        }
        for (let i = 0; i < extra; i++) {
          const tr = this.doc.createElement("tr");
          grid.rows[last].after(tr);
        }
        cell.rowSpan = p.rs + extra;
      }
      grid = tableGrid(table);
      p = grid.pos.get(cell);
      const share = (total, n) => Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));
      const rowSpans = share(p.rs, nRows);
      const colSpans = share(p.cs, nCols);
      // where each row of the area continues: the first cell after it
      const refs = new Map();
      for (let r = p.r; r < p.r + p.rs; r++) {
        refs.set(r, [...grid.rows[r].cells].find((o) => o !== cell && grid.pos.get(o).c > p.c) || null);
      }
      cell.remove();
      let r = p.r;
      let first = true;
      for (const rs of rowSpans) {
        for (const cs of colSpans) {
          const td = first ? cell : this.newCell(cell);
          td.rowSpan = rs;
          td.colSpan = cs;
          if (rs === 1) td.removeAttribute("rowspan");
          if (cs === 1) td.removeAttribute("colspan");
          grid.rows[r].insertBefore(td, refs.get(r));
          first = false;
        }
        r += rs;
      }
      this.caretTo(cell);
    }

    // ---------------------------------------------------------------- tables: sizes

    columnWidths(table, grid) {
      const cols = table.querySelector(":scope > colgroup") ? [...table.querySelectorAll(":scope > colgroup > col")] : [];
      if (cols.length === grid.ncols && cols.every((c) => parseFloat(c.style.width))) return cols.map((c) => parseFloat(c.style.width));
      const widths = new Array(grid.ncols).fill(0);
      const known = new Array(grid.ncols).fill(false);
      for (const [cell, p] of grid.pos) {
        if (p.cs === 1 && !known[p.c]) {
          widths[p.c] = cell.getBoundingClientRect().width;
          known[p.c] = true;
        }
      }
      for (const [cell, p] of grid.pos) {
        if (p.cs > 1) {
          const unknown = [];
          let rest = cell.getBoundingClientRect().width;
          for (let c = p.c; c < p.c + p.cs; c++) (known[c] ? (rest -= widths[c]) : unknown.push(c));
          for (const c of unknown) if (!known[c]) { widths[c] = Math.max(16, rest / unknown.length); known[c] = true; }
        }
      }
      return widths.map((w) => w || 60);
    }

    // make the columns fixed widths (a <colgroup>), as they are now
    fixColumns(table, grid = tableGrid(table)) {
      const widths = this.columnWidths(table, grid).map((w) => Math.round(w));
      let colgroup = table.querySelector(":scope > colgroup");
      if (colgroup) colgroup.remove();
      colgroup = this.doc.createElement("colgroup");
      for (const w of widths) {
        const col = this.doc.createElement("col");
        col.style.width = `${w}px`;
        colgroup.append(col);
      }
      table.prepend(colgroup);
      table.style.tableLayout = "fixed";
      table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
      return [...colgroup.children];
    }

    syncColgroup(table, grid, op, index) {
      const colgroup = table.querySelector(":scope > colgroup");
      if (!colgroup) return;
      const cols = [...colgroup.children];
      if (op === "insert") {
        const like = cols[Math.min(index, cols.length - 1)] || cols[cols.length - 1];
        const col = this.doc.createElement("col");
        col.style.width = like ? like.style.width : "60px";
        colgroup.insertBefore(col, cols[index] || null);
        table.style.width = `${parseFloat(table.style.width || 0) + parseFloat(col.style.width)}px`;
      } else if (op === "delete" && cols[index]) {
        table.style.width = `${Math.max(16, parseFloat(table.style.width || 0) - parseFloat(cols[index].style.width || 0))}px`;
        cols[index].remove();
      } else if (op === "split" && cols[index]) {
        const w = parseFloat(cols[index].style.width) || 60;
        const col = this.doc.createElement("col");
        cols[index].style.width = `${w / 2}px`;
        col.style.width = `${w / 2}px`;
        cols[index].after(col);
      }
    }

    setRowHeight(t, px) {
      for (let r = t.rect.r0; r <= t.rect.r1; r++) t.grid.rows[r].style.height = `${Math.round(px)}px`;
    }

    setColumnWidth(t, px) {
      const cols = this.fixColumns(t.table, t.grid);
      const n = t.rect.c1 - t.rect.c0 + 1;
      for (let c = t.rect.c0; c <= t.rect.c1; c++) cols[c].style.width = `${Math.max(16, Math.round(px / n))}px`;
      t.table.style.width = `${cols.reduce((a, col) => a + parseFloat(col.style.width), 0)}px`;
    }

    distributeRows(t) {
      const { grid, rect } = t;
      const rows = rect.r1 > rect.r0 ? grid.rows.slice(rect.r0, rect.r1 + 1) : grid.rows;
      const avg = rows.reduce((a, tr) => a + tr.getBoundingClientRect().height, 0) / rows.length;
      for (const tr of rows) tr.style.height = `${Math.round(avg)}px`;
    }

    distributeColumns(t) {
      const { grid, rect, table } = t;
      const cols = this.fixColumns(table, grid);
      const [a, b] = rect.c1 > rect.c0 ? [rect.c0, rect.c1] : [0, cols.length - 1];
      const total = cols.slice(a, b + 1).reduce((s, col) => s + parseFloat(col.style.width), 0);
      const each = total / (b - a + 1);
      for (let c = a; c <= b; c++) cols[c].style.width = `${Math.round(each * 10) / 10}px`;
    }

    autofit(t, mode) {
      const { table } = t;
      if (mode === "fixed") return this.fixColumns(table, t.grid);
      const colgroup = table.querySelector(":scope > colgroup");
      if (colgroup) colgroup.remove();
      table.style.removeProperty("table-layout");
      for (const cell of table.querySelectorAll("td, th")) cell.style.removeProperty("width");
      if (mode === "window") table.style.width = "100%";
      else table.style.removeProperty("width");
    }

    // ---------------------------------------------------------------- tables: look

    alignCells(t, h, v) {
      for (const cell of t.cells) {
        cell.style.textAlign = h;
        cell.style.verticalAlign = v;
        for (const block of cell.querySelectorAll(BLOCKS)) {
          block.style.removeProperty("text-align");
          if (!block.getAttribute("style")) block.removeAttribute("style");
        }
      }
    }

    textDirection(t, mode) {
      for (const cell of t.cells) {
        if (mode) cell.style.writingMode = mode;
        else cell.style.removeProperty("writing-mode");
      }
    }

    shadeCells(t, color, list) {
      for (const cell of list || t.cells) {
        if (color) cell.style.backgroundColor = color;
        else cell.style.removeProperty("background-color");
      }
    }

    setBorders(t, which) {
      const { grid, rect } = t;
      const spec = which === "none" ? "none" : `${this.border.width} ${this.border.style} ${this.border.color}`;
      const set = (cell, side, value) => {
        if (cell) cell.style[`border${side}`] = value;
      };
      const cellAt = (r, c) => (grid.slots[r] ? grid.slots[r][c] : null);
      for (const cell of t.cells) {
        const p = grid.pos.get(cell);
        const edges = {
          Top: p.r === rect.r0, Bottom: p.r + p.rs - 1 === rect.r1, Left: p.c === rect.c0, Right: p.c + p.cs - 1 === rect.c1,
        };
        for (const side of ["Top", "Bottom", "Left", "Right"]) {
          const outside = edges[side];
          const horizontal = side === "Top" || side === "Bottom";
          const wanted = which === "all" || which === "none"
            || (which === "outside" && outside) || (which === "inside" && !outside)
            || (which === "inside-h" && !outside && horizontal) || (which === "inside-v" && !outside && !horizontal)
            || (which === side.toLowerCase() && outside);
          if (!wanted) continue;
          set(cell, side, spec);
          // the cell on the other side of an outside edge shares that line
          if (outside) {
            for (let k = 0; k < (horizontal ? p.cs : p.rs); k++) {
              const other = side === "Top" ? cellAt(p.r - 1, p.c + k) : side === "Bottom" ? cellAt(p.r + p.rs, p.c + k)
                : side === "Left" ? cellAt(p.r + k, p.c - 1) : cellAt(p.r + k, p.c + p.cs);
              set(other, { Top: "Bottom", Bottom: "Top", Left: "Right", Right: "Left" }[side], spec);
            }
          }
        }
      }
    }

    caretTo(node) {
      const range = this.doc.createRange();
      range.selectNodeContents(node);
      range.collapse(true);
      this.setRange(range);
    }

    // ---------------------------------------------------------------- find and replace

    buildFind() {
      const bar = el("div", { class: "nbr-find", hidden: true });
      this.findInput = el("input", { class: "nbr-find-input", type: "search", placeholder: "Find", "aria-label": "Find" });
      this.replaceInput = el("input", { class: "nbr-find-input", type: "text", placeholder: "Replace with", "aria-label": "Replace with" });
      this.matchCase = el("input", { type: "checkbox", "aria-label": "Match case" });
      this.wholeWord = el("input", { type: "checkbox", "aria-label": "Whole words only" });
      this.findCount = el("span", { class: "nbr-find-count" });
      const small = (name, title, fn) => {
        const b = el("button", { class: "nbr-btn", type: "button", title, "aria-label": title, onclick: fn }, icon(name, 16));
        b.addEventListener("mousedown", (event) => event.preventDefault());
        return b;
      };
      const textButton = (label, fn) => el("button", { class: "nbr-btn nbr-text-btn", type: "button", onclick: fn, text: label });
      this.replaceRow = el("div", { class: "nbr-find-row" }, this.replaceInput, textButton("Replace", () => this.replaceOne()), textButton("Replace all", () => this.replaceAll()));
      bar.append(
        el("div", { class: "nbr-find-row" }, this.findInput, this.findCount, small("up", "Previous (Shift+Enter)", () => this.findStep(-1)),
          small("down", "Next (Enter)", () => this.findStep(1)),
          el("label", { class: "nbr-check", title: "Match case" }, this.matchCase, "Aa"),
          el("label", { class: "nbr-check", title: "Whole words only" }, this.wholeWord, "Whole word"),
          el("button", { class: "nbr-btn nbr-text-btn", type: "button", title: "Show replace", onclick: () => this.openFind(this.replaceRow.hidden), text: "⇄" }),
          small("close", "Close (Esc)", () => this.closeFind())),
        this.replaceRow);
      const rerun = () => {
        this.findIndex = 0;
        this.runFind(true);
      };
      this.findInput.addEventListener("input", rerun);
      this.matchCase.addEventListener("change", rerun);
      this.wholeWord.addEventListener("change", rerun);
      for (const input of [this.findInput, this.replaceInput]) input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Escape") this.closeFind();
        if (event.key === "Enter") {
          event.preventDefault();
          if (input === this.replaceInput) this.replaceOne();
          else this.findStep(event.shiftKey ? -1 : 1);
        }
      });
      return bar;
    }

    openFind(withReplace) {
      this.findBar.hidden = false;
      this.replaceRow.hidden = !withReplace;
      const range = this.currentRange();
      const selected = range && !range.collapsed ? range.toString() : "";
      if (selected && selected.length < 100 && !selected.includes("\n")) this.findInput.value = selected;
      (withReplace && this.findInput.value ? this.replaceInput : this.findInput).focus();
      this.findInput.select();
      this.findIndex = 0;
      this.runFind(true);
    }

    closeFind() {
      this.findBar.hidden = true;
      this.matches = [];
      this.paintMatches();
      this.focus();
    }

    // every match, as a Range; text is searched block by block, so a match never spans two paragraphs
    collectMatches() {
      const query = this.findInput.value;
      if (!this.body || !query) return [];
      const flags = this.matchCase.checked ? "gu" : "giu";
      let source = escapeRegExp(query);
      if (this.wholeWord.checked) source = `(?<![\\p{L}\\p{N}_])${source}(?![\\p{L}\\p{N}_])`;
      const regex = new RegExp(source, flags);
      const runs = new Map();
      const walker = this.doc.createTreeWalker(this.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const block = node.parentElement.closest(BLOCKS + ", td, th, body");
        if (!runs.has(block)) runs.set(block, []);
        runs.get(block).push(node);
      }
      const out = [];
      for (const nodes of runs.values()) {
        let text = "";
        const starts = [];
        for (const node of nodes) {
          starts.push(text.length);
          text += node.data;
        }
        const locate = (offset, isEnd) => {
          for (let i = nodes.length - 1; i >= 0; i--) {
            if (offset > starts[i] || (!isEnd && offset === starts[i]) || i === 0) return [nodes[i], offset - starts[i]];
          }
          return [nodes[0], 0];
        };
        for (const m of text.matchAll(regex)) {
          if (!m[0].length) continue;
          const [sn, so] = locate(m.index, false);
          const [en, eo] = locate(m.index + m[0].length, true);
          const range = this.doc.createRange();
          range.setStart(sn, so);
          range.setEnd(en, eo);
          out.push(range);
        }
      }
      return out;
    }

    runFind(select) {
      this.matches = this.collectMatches();
      const n = this.matches.length;
      if (this.findIndex >= n) this.findIndex = 0;
      this.findCount.textContent = this.findInput.value ? (n ? `${this.findIndex + 1} of ${n}` : "No results") : "";
      this.paintMatches();
      if (select && n) this.showMatch();
    }

    refreshFind() {
      if (this.findBar && !this.findBar.hidden && !this.replacing) this.runFind(false);
    }

    paintMatches() {
      const registry = this.win && this.win.CSS && this.win.CSS.highlights;
      if (!registry) return;
      registry.delete("nbr-find");
      registry.delete("nbr-find-current");
      if (!this.matches || !this.matches.length || this.findBar.hidden) return;
      const Highlight = this.win.Highlight;
      registry.set("nbr-find", new Highlight(...this.matches));
      registry.set("nbr-find-current", new Highlight(this.matches[this.findIndex]));
    }

    showMatch() {
      const range = this.matches[this.findIndex];
      if (!range) return;
      const node = range.startContainer.parentElement;
      if (node) node.scrollIntoView({ block: "nearest" });
      this.savedRange = range.cloneRange();
    }

    findStep(dir) {
      if (!this.matches || !this.matches.length) return this.runFind(true);
      this.findIndex = (this.findIndex + dir + this.matches.length) % this.matches.length;
      this.findCount.textContent = `${this.findIndex + 1} of ${this.matches.length}`;
      this.paintMatches();
      this.showMatch();
    }

    replaceOne() {
      if (!this.matches || !this.matches.length) return this.runFind(true);
      const range = this.matches[this.findIndex];
      const text = this.replaceInput.value;
      const index = this.findIndex;
      this.replacing = true;
      this.command(() => {
        this.setRange(range);
        if (text) this.exec("insertText", text);
        else this.exec("delete");
      });
      this.replacing = false;
      this.matches = this.collectMatches();
      this.findIndex = this.matches.length ? index % this.matches.length : 0;
      this.runFind(true);
    }

    replaceAll() {
      const matches = this.collectMatches();
      if (!matches.length) return this.runFind(false);
      const text = this.replaceInput.value;
      this.replacing = true;
      this.command(() => {
        // last to first, so earlier ranges stay valid
        for (const range of matches.reverse()) {
          range.deleteContents();
          if (text) range.insertNode(this.doc.createTextNode(text));
        }
        this.body.normalize();
      });
      this.replacing = false;
      this.findIndex = 0;
      this.runFind(false);
      this.findCount.textContent = `Replaced ${matches.length}`;
    }
  }

  // ------------------------------------------------------------------ cleaning pasted HTML
  // The server cleans everything it stores (lib_notebook/rich.py); pasted HTML is
  // cleaned here too, so nothing active ever lands in the editor.

  const ALLOWED_TAGS = new Set("p div br span b strong i em u s strike del sub sup ul ol li table thead tbody tfoot tr td th caption colgroup col h1 h2 h3 h4 h5 h6 blockquote pre code a font hr mark img svg path g".split(" "));
  const DROP_TAGS = new Set("script style iframe object embed noscript template math head title textarea select button canvas video audio meta link foreignobject use animate".split(" "));
  const ALLOWED_ATTRS = new Set(["style", "href", "src", "alt", "title", "width", "height", "colspan", "rowspan", "align", "face", "size", "color", "start", "type", "span", "lang", "data-nb-sheet", "data-nb-ink", "data-nb-params", "data-nb-canvas", "data-nb-checklist", "data-checked", "data-brush", "viewbox", "xmlns", "preserveaspectratio", "d", "stroke", "fill", "opacity", "stroke-width", "stroke-linecap", "stroke-linejoin"]);
  const ALLOWED_CSS = new Set(("color background-color font-family font-size font-weight font-style text-decoration text-decoration-line text-align " +
    "vertical-align border border-top border-right border-bottom border-left border-collapse padding width height table-layout max-width " +
    "line-height margin-top margin-bottom text-transform list-style-type writing-mode column-count column-gap column-width column-rule hyphens").split(" "));

  function cleanNode(node) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLowerCase();
      if (DROP_TAGS.has(tag)) {
        child.remove();
        continue;
      }
      cleanNode(child);
      if (!ALLOWED_TAGS.has(tag)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        if (!ALLOWED_ATTRS.has(name)) child.removeAttribute(attr.name);
        else if (name === "href" && !/^(https?:|mailto:|#)/i.test(attr.value.trim())) child.removeAttribute(attr.name);
        else if (name === "src" && !/^(https?:|data:image\/(?:png|jpe?g|gif|webp);base64,|\/notebook\/api\/asset\/[\w.-]+$)/i.test(attr.value.trim())) child.removeAttribute(attr.name);
      }
      if (tag === "img" && !child.getAttribute("src")) {
        child.remove();
        continue;
      }
      if (child.hasAttribute("style")) {
        const kept = [];
        for (const prop of [...child.style]) {
          const value = child.style.getPropertyValue(prop);
          const base = prop.replace(/-(top|right|bottom|left)-(width|style|color)$/, "-$1").replace(/-(width|style|color)$/, "");
          if ((ALLOWED_CSS.has(prop) || ALLOWED_CSS.has(base)) && !/url\(|expression\(|javascript:/i.test(value)) kept.push(`${prop}: ${value}`);
        }
        if (kept.length) child.setAttribute("style", kept.join("; "));
        else child.removeAttribute("style");
      }
    }
  }

  function cleanHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    cleanNode(doc.body);
    return doc.body.innerHTML;
  }

  window.NotebookRich = { RichEditor, cleanHtml, tableGrid, cellRect, FRAME_CSS };
})();
