# Notebook

Notes for **Forge**, **reForge** and **Forge Classic (Neo)**. Write down prompts, seeds, settings and what worked, without leaving the WebUI.

- A **Notebook** tab.
- A **floating window** on every tab. Open it with the round button at the bottom right or **Alt+N**. Drag it by its title bar, resize it from the corner, and double-click the title bar to minimise it. It remembers its size, place and open note.
- **Two storages**, switched at the top of the note list:

| | Markdown | Rich text |
|---|---|---|
| Files | `notes/markdown/*.md` | `notes/rich/*.html` |
| Editing | shown formatted (headings, **bold**, *italic*, tables, checklists...); click to edit, click outside to see it formatted again | a page editor with formatting, colours, tables, pictures, drawing, and find and replace |
| Import | `.md` | `.txt` (one paragraph per line) and `.html` |
| Export | `.md`, or a web page `.html` | web page `.html` (opens in any browser and in Word), or plain text `.txt` |

## Install

Extensions → Install from URL, or copy the `sd-webui-notebook` folder into `extensions/`. Restart the WebUI.

## Markdown notes

- Click anywhere on a formatted note to edit it. The cursor lands on the line you clicked.
- Click outside the note, or press **Esc**, to see it formatted again.
- Ticking a checkbox (`- [ ]` / `- [x]`) in the formatted note ticks it in the file.
- The split button shows the Markdown and the formatted note side by side (tab only).

## Rich-text notes

The page is shown white, the way it looks when exported, in a frame of its own so the WebUI's theme cannot change it.

Above the page is the **dock**: one row of small groups of buttons (two or three rows in a narrow window). Buttons with a small arrow open a panel under them. Under the dock, a **strip** appears for what you are working on: a table, a picture, or drawing. Under the page, the **footer** counts words and characters.

### The dock

| Group | |
|---|---|
| History | undo, redo. They undo everything, table changes and ink included |
| Text | paragraph style (Normal text, Heading 1–3, Quote, Code), font, size in points |
| Format | bold, italic, underline, strikethrough, subscript, superscript, change case (Sentence case, lowercase, UPPERCASE, Capitalize Each Word, tOGGLE cASE), clear all formatting |
| Colours | one panel with three rows: **Text**, **Highlight** and **Shading**. Each row starts with a "none" (Automatic, No highlight, No shading) and ends with a picker for any other colour |
| Paragraph | alignment (left, center, right, justify; the button shows the current one), bullets, numbering, **checklist** (click a box to tick it), decrease / increase indent, **line spacing** |
| Insert | the last generated image with its parameters, a snippet, a link, a link to a note, a picture, a table, a drawing area, a divider line |
| Draw | turns on drawing (see below) |
| Layout | one, two or three columns; hyphenation at line ends, and its language |
| Find | find and replace |

- **Highlight** colours the selected words. **Shading** colours the whole paragraph when the cursor is in it or the paragraph is selected, only the selected words otherwise, and the cells when the cursor is in a table.
- **Line spacing**: 1.0, 1.15, 1.5 (normal), 2.0, 2.5 or 3.0 for the paragraphs the cursor or the selection is in, and the space after them: none, normal or wide.
- Tab and Shift+Tab indent in a list.

### Tables

Insert a table from **Insert → Table…**: pick the size on the grid, or type rows and columns. While the cursor is in a table, the **Table** strip shows:

| | |
|---|---|
| Rows & columns | insert a row above or below, a column left or right |
| Merge | **Merge cells**; **Split cells** into a number of columns and rows |
| Select, Delete | select the cell, row, column or table; delete the cells' text, rows, columns or the table |
| Sizes | row height **H** and column width **W** in pixels; distribute rows, distribute columns (the selected ones, or all); **AutoFit**: fit the contents, fit the page width, or fixed column widths |
| Cell alignment | top, middle or bottom, and left, center or right; **text direction**: horizontal, vertical top to bottom, vertical bottom to top |
| Borders | line style (solid, dashed, dotted, double), width and colour, then which lines: all, outside, inside, none, top, bottom, left, right, inside horizontal, inside vertical |
| Cell shading | the same colours as Shading |

- Drag across cells, or click one and Shift+click another, to select several.
- Drag a column's or a row's border to resize it.
- Tab moves to the next cell; in the last cell it adds a row.
- Delete or Backspace with several cells selected clears their text.
- Cells without borders show a faint dashed outline while editing. It is not saved and does not print.

### Links and pictures

- **Link** (Ctrl+K): turn the selected words into a link, or type the text and address. On a link, the same panel edits it or **Remove**s it and keeps the words. **Ctrl+click** opens a link.
- **Picture**: pick a file, paste one, or drop one on the page. Large pictures are resized so the note stays small; each is kept as a file in `notes/assets/`. Click a picture to show the **Picture** strip: width 25%, 50%, 75%, 100% or the original size, and delete. Delete or Backspace also removes a selected picture.

### Drawing

**Draw** in the dock (or **Done** / Esc to go back to typing) shows the **Draw** strip:

- **Pen**, **Pencil**, **Fountain pen** and **Marker**. The fountain pen gets thicker with pressure or a slow stroke; the marker is wide and see-through.
- **Eraser**: rubs out only what it passes over, cutting a stroke in two where needed. The circle under the pointer shows its size; set it with the **Eraser** slider.
- **Stroke eraser**: removes each whole stroke it touches.
- Ink colours, and the pen **Size** slider.
- **Clear all ink**.

Ink drawn on the page is saved with the note as SVG, on top of the page, measured from the top left corner of the text: it stays where it was drawn when the text above it changes. For a sketch that moves with the text, use **Insert → Drawing area**: a block between paragraphs, with its own ink, that grows as you draw lower. The eraser and **Clear all ink** work on both.

### Find and replace

The magnifier at the right of the dock, **Ctrl+F** (find) or **Ctrl+H** (find and replace):

- every match is marked, the current one in orange; Enter and Shift+Enter go to the next and previous one;
- **Aa** matches the case, **Whole word** skips matches inside longer words;
- **Replace** replaces the current match, **Replace all** every match. Both can be undone.

### Other

- Text pasted from web pages or Word keeps its formatting; scripts and other active content are removed.

## Working with the WebUI

### Keep what you generated

- **Capture** (the camera button above a note, or **Alt+G** from any tab) puts the image selected in the txt2img or img2img gallery, and its generation parameters, into the note that is open (in the floating window, else in the tab).
  - Rich text: a **parameter block**, with the picture beside the parameters.
  - Markdown: the picture, then a ` ```params ` block.
- **Drop a picture** made by the WebUI onto a note (from a folder, or straight from the gallery): its parameters are read from the file and come in with it. Other pictures come in as pictures.

### Send parameters back

- Rich text: click in a parameter block; the **Parameters** strip offers **Send to txt2img**, **Send to img2img**, **Copy** and remove.
- Markdown: a ` ```params ` block shows the same buttons in the formatted note.
- Sending works like PNG Info's "Send to": prompt, negative prompt, sampler, steps, seed and the rest fill in the fields of that tab.

### Snippets

Bits of prompt you use often.

- **Ctrl+;** (or the `{ }` button, or Insert → Snippet… in rich text) opens them: type to find one, Enter or a click puts it at the cursor.
- With some text selected, the same panel saves it as a new snippet.
- Snippets are shared by every note and both storages.

## Organising

| | |
|---|---|
| Pin | the pin button keeps a note at the top of its list |
| Tags | the tag button: add tags (Enter), remove them (×), pick one used elsewhere. Tags show on the note and in the list |
| Filter | the tags above the list: click one to show only its notes. Searching `#tag` finds tagged notes in both storages, and `#tag word` those that also contain the word |
| Sort | newest first, oldest first, name A–Z or Z–A; pinned notes stay on top |
| Templates | a new note can start from Sampler comparison, LoRA test, Training log or Prompt recipe, or from a note saved with **More → Save as a template…** (deleted there too) |
| Links between notes | Markdown: `[[Note name]]`. Rich text: **Insert → Link to a note…**, then Ctrl+click the link. A link to a note that does not exist offers to create it |
| Copy to the other storage | **More → Copy as a rich-text note / Markdown note**. The original is kept. Colours, fonts and drawings have no Markdown form and are left out |

## Common to both

| | |
|---|---|
| New note | **+** at the top of the list (in the storage that is selected), blank or from a template |
| Import | the arrow next to **+**, or drop files on the note list: `.md`, `.txt`, `.html`, or a Notebook backup `.zip`. Several files at once; a name already taken gets `(2)` |
| Search | the box above the list searches both storages, in names and text, for notes containing every word typed; a click opens the note at the matching line |
| Rename | click the note's name above it |
| Save | automatic a second after you stop typing; **Ctrl+S** saves at once and keeps a version |
| Export | the up arrow: **Download**, **Print or save as PDF**, or **Save to folder**, with a folder picker. Exported pages carry their pictures inside |
| Earlier versions | the clock button: view any version, see **Changes since then** (added lines green, removed ones struck out), and **Restore** it |
| Delete | the bin button. The note leaves the list at once; **Undo** in the corner brings it back for a few seconds, then the file and its earlier versions are deleted |
| More | save as a template, copy to the other storage, dark page (rich text), keyboard shortcuts, back up all notes |
| Keyboard shortcuts | **Ctrl+/** |

The same note can be open in the tab and in the floating window; what you type in one shows in the other. In the floating window, **Save**, **Pin** and **Tags** are in **More**.

The note list follows the notes folder: a note added, changed or deleted outside the WebUI shows up within a few seconds. An open note changed outside is reloaded when it has nothing unsaved; with unsaved text, saving stops and a bar offers **Load theirs** or **Keep mine**. If the file is deleted from the folder, an open note that still has unsaved text offers **Save again** or **Close**.

## Where things are kept

```
extensions/sd-webui-notebook/notes/markdown/     Markdown notes
extensions/sd-webui-notebook/notes/rich/         rich-text notes
  .../.history/<note>/   earlier versions: one per 10 minutes of editing and one per Ctrl+S, the newest 10
extensions/sd-webui-notebook/notes/assets/       pictures used in notes, one file each
extensions/sd-webui-notebook/notes/templates/    templates saved from notes
extensions/sd-webui-notebook/notes/meta.json     pins and tags
extensions/sd-webui-notebook/notes/snippets.json snippets
```

- Pictures are stored once, however many notes use them. Pictures from older notes (kept inside the note) move into `assets/` the next time the note is opened.
- An exported `.md` file refers to its pictures in `assets/`; an exported web page has them inside.
- **More → Back up all notes** downloads everything above as one `.zip`. Importing that `.zip` adds its notes beside the ones there (nothing is overwritten), with their pins, tags, pictures, templates and snippets.
- `notes/` is in `.gitignore`, so updating the extension never touches your notes.
- **Removing** the extension folder removes the notes too. Back them up first.
- Notes from the first version of Notebook are moved into place when the WebUI starts:
  - `.md` notes go to `markdown/`;
  - `.txt` notes become rich-text notes, and the original `.txt` files are kept in `notes/.imported/`.

## Settings

Settings → Notebook:

- **Show the floating Notebook button on every tab** (Alt+N works either way).
- **Save notes automatically while typing** (off: Ctrl+S or the save button).
- **Dark page** for rich-text notes is in **More** above a note; it changes only how the page is shown, not what is saved or exported.
- **Allow export to folders from other computers**: off by default. **Save to folder** writes on the computer that runs the WebUI, so by default it only works from a browser on that computer. Others can still use **Download**.

When the WebUI runs with a login (`--gradio-auth`), only logged-in users can read or write notes.


## Acknowledgements

- [Zetaphor/sd-library-notes](https://github.com/Zetaphor/sd-library-notes) showed Markdown notes inside the WebUI first.
- The click-to-edit Markdown notes follow ComfyUI's Markdown note node.
- The preview uses [markdown-it-py](https://github.com/executablebooks/markdown-it-py), which comes with Gradio.
- Thanks also to **Claude**, Anthropic's AI assistant, for help building the extension.

## Licence

MIT or GPL-3.0, at your choice: see [LICENSE-MIT](LICENSE-MIT), [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
