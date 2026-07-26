# GameHub game package format

Developers can create a game draft, upload its first playable version, and add
its media with one ZIP file. The existing workflow for creating a draft
manually and uploading versions separately remains supported.

## Archive layout

```text
game.zip
├── gamehub.json
├── index.html
├── assets/
│   └── ...
└── screenshots/
    ├── banner.webp
    └── gameplay.webp
```

- `gamehub.json`, `index.html`, and `screenshots/` must be at the package root.
- A single wrapper directory around the entire package is also accepted.
- Every PNG, JPEG, or WebP image in `screenshots/` is added to the game's
  screenshot gallery.
- The image named by `banner` becomes the game banner. If `banner` is omitted,
  the first screenshot in filename order is used.
- `gamehub.json` and `screenshots/` are removed from the extracted playable
  bundle.

## Manifest

```json
{
  "slug": "star-runner",
  "version": "1.0.0",
  "name": "Star Runner",
  "description": "Dodge asteroids and chase a high score.",
  "category": "arcade",
  "orientation": "LANDSCAPE",
  "scoreOrder": "DESC",
  "controls": "Use the arrow keys to move.",
  "maxScore": 1000000,
  "banner": "screenshots/banner.webp",
  "nameVi": "Đường đua ngân hà",
  "descriptionVi": "Né thiên thạch và chinh phục điểm cao.",
  "controlsVi": "Dùng các phím mũi tên để di chuyển."
}
```

Required fields:

| Field | Rules |
| --- | --- |
| `slug` | 3–50 lowercase letters, digits, or dashes; cannot be changed later |
| `version` | Numeric `major.minor.patch`, such as `1.0.0` |
| `name` | English display name, up to 80 characters |
| `description` | English short description, up to 500 characters |

Optional fields:

| Field | Default / rules |
| --- | --- |
| `category` | `arcade`, up to 40 characters; `genre` is accepted as an alias |
| `orientation` | `BOTH`; also accepts `LANDSCAPE` or `PORTRAIT` |
| `scoreOrder` | `DESC`; use `ASC` when a lower score is better |
| `controls` | Empty, up to 5,000 characters |
| `maxScore` | No limit; otherwise a positive integer |
| `banner` | First screenshot by filename; must point inside `screenshots/` |
| `nameVi` | Falls back to `name` |
| `descriptionVi` | Falls back to `description` |
| `controlsVi` | Falls back to `controls` |

## Limits and validation

- The uploaded ZIP may be at most 50 MB.
- The extracted archive may contain at most 2,000 files and 200 MB.
- A package must contain 1–12 screenshots.
- Each screenshot may be at most 8 MB, and its contents must match its PNG,
  JPEG, or WebP extension.
- The runnable bundle must follow the same file-type allowlist and path safety
  checks as a normal version upload.
- Importing creates a draft only; the developer still explicitly submits it
  for review from Studio.
