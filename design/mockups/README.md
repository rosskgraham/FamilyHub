# Mockups

Source files for the Kitchen Calendar Mockups design: https://claude.ai/artifact/FfDEgjnfXEPu64XJpL2484

All screens are 1920×1080.

| File | Screen |
| --- | --- |
| `Main.dc.html` | A · Week columns (light) |
| `Lanes.dc.html` | B · Lanes by person (dark) |
| `Today.dc.html` | C · Today + shopping list |
| `Sleep.dc.html` | D · Sleep mode (motion sensor) |
| `Watch.dc.html` | E · Watch YouTube |
| `canvas.json` | Board layout and titles for the design canvas |

These are snapshots. The live artifact is still the source of truth, so re-export from it after changing the design.

## Viewing

Open `html/index.html` in a browser. Each screen scales to fit the window. Add `?actual` to a screen's URL to see it at full 1920×1080.

The `.dc.html` files use the design tool's template syntax (`<x-dc>`, `<sc-for>`, `{{…}}`) and need its runtime, so they don't open directly. `build.mjs` renders them, sample data from each file's `renderVals()` included, to static pages in `html/`. Rebuild after re-exporting:

```
node design/mockups/build.mjs
```
