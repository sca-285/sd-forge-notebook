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
