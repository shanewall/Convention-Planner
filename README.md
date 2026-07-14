# Convention Planner

A lean, high-performance, browser-based logistics and mapping tool designed for large-scale event organization.

Convention Planner lets event coordinators import architectural floor plans, draw complex seating layouts, calculate capacities, verify A/V sightlines, and staff the room — all from a single, portable HTML file. There is no build step, no framework, and no server: the entire application is one self-contained document backed by a small number of client-side libraries.

**Live app:** [app.conventionplanner.org](https://app.conventionplanner.org)

---

## Core Concepts

**Pages.** A project holds any number of pages. Each page is either an imported *blueprint* (PDF, PNG, or JPG) or a synthetic *drawing sheet* at a standard paper size. Every page keeps its own drawing scale, so a project can mix a 3/64" = 1′ arena plan with a 1/8" = 1′ detail sheet. Pages can be marked as reference-only so they're excluded from count totals.

**Scale.** Set a page's scale by choosing from the full imperial set (12" = 1′ down to 1/64" = 1′), the engineering set (1" = 10′ through 1" = 400′), the metric scales, or a custom ratio — or calibrate it by clicking two points of a known distance. Scale can be changed at any time after import. The current named scale is shown on screen alongside pixels-per-foot.

**Layers.** Two independent systems. *Project layers* are user-created and named: assign any item to one, toggle its visibility to hide its items everywhere (screen, exports, and count totals), or lock it to keep items visible but protected from selection and accidental edits. Separately, *category visibility* toggles control whole classes of object — Seating, Key Items, Screens & Sightlines, Measures, Cutouts, Annotations, Attendants, and Display & Print.

---

## Features

### Seating & Capacity

* **Automatic chair counts.** Draw a polygonal seating area and chairs are generated inside it from a seat profile (custom width, depth, spacing, and color). Counts update live as the shape changes.
* **Multiple seat profiles.** Define as many chair types as the venue needs; each area references a profile, and totals break down per profile and per section.
* **Cutouts.** Carve holes out of a seating area — aisles, camera platforms, wheelchair bays — and the chair count adjusts automatically.
* **Per-section totals.** A running summary shows chair counts by page, by section, and by seat type, with items or layers excluded from counts on request.

### A/V Sightlines

* **Screen placement with beam angles.** Drop screens onto the plan and set an adjustable viewing angle to visualize line-of-sight coverage.
* **Obstacle occlusion.** Structural pillars, staging, and other obstacles block sightlines geometrically. Seats falling in a shadow are identified and can be excluded from usable counts.

### Attendants & Staffing

* **Attendant posts.** Place staffing positions on the plan with their own style profiles (marker shape, color, label).
* **Shifts and roster.** Define shifts, assign attendants to posts per shift, and record roles, reporting lines, phone numbers, and notes. Posts may be persistent across all shifts or specific to one.
* **Schedule and roster exports.** Generate an `.xlsx` schedule and a separate `.xlsx` roster. Attendant data round-trips through CSV import/export for editing in a spreadsheet and re-importing.

### Key Items & Signage

* **Point and measure profiles.** Key items are placed as color-coded nodes from named profiles, with an adjustable point color and label-text color that stay legible at any sheet size.
* **Dynamic legend.** A drag-and-drop map legend is generated from the key items in use.
* **Measures.** Record known distances and dimensions that carry through to exports.

### Annotation

* **Markup tools.** Dimension lines, polylines, freeform lines, text, boxes, ellipses, and leader-line callouts, drawn directly over the blueprint.
* **Rotation.** Boxes, ellipses, and text rotate via a drag grip (5° snap; hold Shift for free rotation) or by typing an exact angle. Selection outlines and marquee selection follow the true rotated footprint.
* **Constrained editing.** Hold Shift to keep squares square, circles round, and lines straight — while drawing *and* while adjusting after placement.
* **Copy, paste, rotate.** Copy a mixed group of markups and press <kbd>R</kbd> while placing to rotate the whole group 90° (<kbd>Shift</kbd>+<kbd>R</kbd> to reverse). Pasted markups rescale to the destination sheet's scale without distortion.
* **Repeat tool.** Keep the active drawing tool armed after each use to place several in a row; <kbd>Esc</kbd> to stop.

### Import & Export

* **Blueprint import.** PDF, PNG, and JPG. PDFs show a live rotation preview on import (↺ / ↻ in 90° steps) so orientation is baked in correctly and view, deep zoom, and export always agree.
* **Vector PDF export.** True vector output via pdf-lib, at true scale or fit-to-page.
* **Print.** Print-ready hybrid layout maps for installation teams.
* **Spreadsheet exports.** Chair-and-key-item counts, attendant schedule, and attendant roster as `.xlsx`.
* **Project files.** Projects save and load as `.json`. A separate merge import folds another project's pages into the current one.

### Interface

* **Collapsible, resizable side panels.** Tools on the left, placed-item lists on the right. Collapse either — or both — for a full-screen canvas, or drag the edge between a panel and the canvas to widen it (double-click to reset). Widths persist per browser.
* **Selection follow.** Selecting an item on the canvas switches to its category, expands its group, and scrolls the sidebar to highlight it.
* **Sortable lists.** Profile and placed-item lists sort A–Z / Z–A on a toggle.
* **Grid and snapping.** Optional grid overlay (screen-only, never printed) with snap-to-grid.
* **Deep zoom.** Imported PDF sheets re-render crisply when you stop panning, cancelling cleanly if you move again — so large, detail-heavy plans stay smooth.
* **Undo/redo** throughout.
* **Localization.** The interface ships with a built-in English and Spanish dictionary (~250 strings), switchable instantly from the toolbar.

## Companion Tools

### Sign Template

A standalone printable-sign generator, opened from the **🪧 Sign Template** button in the Help group. It runs on its own page in a new tab and is fully independent of the planner — its own storage, its own file format — so signs and floor plans never entangle.

* **Large directional signs.** Letter (11×8.5) or Tabloid (17×11), landscape, sized to print at 100% / "Actual size".
* **Multi-line text with per-line color.** Blue and orange are preset as the event standard; add your own swatches.
* **Logo.** Show/hide, corner placement, and size; import a PNG/JPG or an SVG for true vector printing (defaults to the Convention Planner logo).
* **Auto-fit or manual sizing.** Text scales to fill the sheet automatically, or set a fixed size.
* **Saved signs.** Build a set of named signs and switch between them; export and import the whole set as a `.json` to reuse on site.
* **High-contrast aware.** The dark control panel keeps its styling under Windows High Contrast / forced-colors mode, while the printable sheet stays print-friendly.

The tool lives in the repository as `sign_template.html`, alongside `index.html`, and must be served from the same directory for the launcher link to resolve.

---

## Technologies Used

* **HTML5 Canvas** — rendering, hit-testing, and sightline geometry.
* **Vanilla JavaScript** — no framework, no build step; a single ~19,000-line HTML file.
* **PDF.js** (v6) — client-side blueprint rendering, including sub-rect deep-zoom re-rendering.
* **pdf-lib** — vector PDF export.
* **SheetJS (xlsx)** — spreadsheet exports.

pdf-lib and SheetJS load from a CDN, and PDF.js is imported as an ES module, so a network connection is required on first load.

---

## Deployment

The app is a single `index.html`, served from Cloudflare Workers at [app.conventionplanner.org](https://app.conventionplanner.org). The companion `sign_template.html` is deployed alongside it in the same directory so the in-app launcher link resolves.

```bash
wrangler deploy
```

---

## Contributing

Contributions are welcome. If you have ideas for new features or improvements:

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## Contact

**Shane** – Abarca Services
**Email:** [dev@abarca-services.com](mailto:dev@abarca-services.com)
**Project Link:** [https://github.com/shanewall/Convention-Planner](https://github.com/shanewall/Convention-Planner)

## License

Distributed under the **GNU General Public License v3.0 (GPL-3.0)**.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation. See the `LICENSE` file for more details.