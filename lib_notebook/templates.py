"""Templates for new notes: a few built in, and any saved from a note into
notes/templates/ (.md for Markdown notes, .html for rich-text notes).
A built-in template works in both storages: rich-text notes get it rendered.
"""

from __future__ import annotations

import os
from pathlib import Path

from lib_notebook import rich
from lib_notebook.convert import md_to_rich
from lib_notebook.store import NoteError, check_name

BUILT_IN = {
    "sampler-comparison": ("Sampler comparison", """# Sampler comparison

**Model:**
**Prompt:**
**Seed:**  · **Size:**  · **CFG:**

| Sampler | Schedule | Steps | Time | Result |
|---|---|---|---|---|
| Euler a | Automatic | 24 |  |  |
| DPM++ 2M | Karras | 24 |  |  |
| DPM++ SDE | Karras | 20 |  |  |
| UniPC | Automatic | 20 |  |  |
| DDIM | Automatic | 30 |  |  |

## Verdict

- [ ] Best overall:
- [ ] Fastest acceptable:
"""),
    "lora-test": ("LoRA test", """# LoRA test

**LoRA:**
**Trigger words:**
**Base model:**  · **Seed:**

| Weight | Result | Notes |
|---|---|---|
| 0.4 |  |  |
| 0.6 |  |  |
| 0.8 |  |  |
| 1.0 |  |  |

## Works well with

-

## Problems

-

## Verdict

- [ ] Keep
- [ ] Retrain
"""),
    "training-log": ("Training log", """# Training log

## Dataset

- Images:
- Captions:
- Repeats:

## Settings

| Setting | Value |
|---|---|
| Base model |  |
| Network rank / alpha |  |
| Learning rate |  |
| Optimizer |  |
| Epochs |  |
| Batch size |  |
| Resolution |  |

## Epochs

| Epoch | Loss | Sample | Notes |
|---|---|---|---|
| 1 |  |  |  |
| 2 |  |  |  |

## Conclusion

"""),
    "prompt-recipe": ("Prompt recipe", """# Prompt recipe

**Subject:**
**Style:**

## Prompt

```
```

## Negative prompt

```
```

## Settings

- Sampler:
- Steps:
- CFG:
- Size:

## Results

- [ ] Tried it
- [ ] Worth keeping
"""),
}


class Templates:
    def __init__(self, root: Path):
        self.root = Path(root) / "templates"

    def list(self, storage: str) -> list:
        out = [{"id": key, "label": label, "builtin": True} for key, (label, _) in BUILT_IN.items()]
        ext = ".md" if storage == "md" else ".html"
        if self.root.is_dir():
            for path in sorted(self.root.iterdir(), key=lambda p: p.name.lower()):
                if path.is_file() and path.suffix.lower() == ext:
                    out.append({"id": "user:" + path.name, "label": path.stem, "builtin": False})
        return out

    def text(self, template_id: str, storage: str, title: str = "") -> str:
        template_id = str(template_id or "")
        if template_id in BUILT_IN:
            text = BUILT_IN[template_id][1]
            if title:
                text = text.replace("# " + BUILT_IN[template_id][0], "# " + title, 1)
            return text if storage == "md" else md_to_rich(text)
        if template_id.startswith("user:"):
            path = self._path(template_id[5:], storage)
            if not path.is_file():
                raise NoteError("That template is gone.", 404)
            with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
                raw = f.read()
            return raw if storage == "md" else rich.from_document(raw)
        raise NoteError("Unknown template.", 404)

    def _path(self, name: str, storage: str) -> Path:
        return self.root / check_name(name, (".md",) if storage == "md" else (".html",))

    def save(self, storage: str, title: str, text: str) -> dict:
        title = str(title or "").strip()
        path = self._path(title + (".md" if storage == "md" else ".html"), storage)
        self.root.mkdir(parents=True, exist_ok=True)
        body = text if storage == "md" else rich.to_document(text, title)
        tmp = path.with_name(path.name + ".tmp")
        with open(tmp, "w", encoding="utf-8", newline="") as f:
            f.write(body)
        os.replace(tmp, path)
        return {"id": "user:" + path.name, "label": path.stem}

    def delete(self, template_id: str, storage: str) -> dict:
        template_id = str(template_id or "")
        if not template_id.startswith("user:"):
            raise NoteError("Built-in templates cannot be deleted.")
        path = self._path(template_id[5:], storage)
        if path.is_file():
            path.unlink()
        return {"deleted": template_id}
