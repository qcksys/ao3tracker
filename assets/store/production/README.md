# Production Chrome Web Store assets

The production listing uses `icon-128.png` (128 × 128) and the two JPEG screenshots (1280 × 800). The icon matches `apps/browser-extension/public/icon/128.png`.

The screenshots render the extension's real Tracker and Searches components with fictional account and reading data. The surrounding artwork and popup frame live in this directory. The preview is for screenshot capture; extension actions are not functional in a normal browser tab.

## Preview and capture

Run from the repository root:

```sh
vp install --frozen-lockfile
vp node assets/store/production/serve.mjs
```

Set the browser viewport to 1280 × 800 at 100% zoom, then capture each page as a JPEG:

| URL                                     | Output                    |
| --------------------------------------- | ------------------------- |
| `http://127.0.0.1:4317/?scene=tracker`  | `01-reading-progress.jpg` |
| `http://127.0.0.1:4317/?scene=searches` | `02-saved-searches.jpg`   |

The checked-in captures use Windows system fonts (Segoe UI and Georgia). Other platforms may render text differently. Update `fixture.jsx` for example data and `main.jsx` / `store.css` for composition. Stop the local preview with Ctrl+C after capturing.

Validate source changes with `vp fmt --check assets/store/production`, `vp lint assets/store/production`, and a visual check of both pages. Upload the files through the production listing's Store listing page; repository changes do not upload or publish these assets automatically.
