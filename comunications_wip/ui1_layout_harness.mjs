// UI-1 layout math harness — deterministic check of the two-column grid.
// Grid: grid-cols-[minmax(320px,28%)_minmax(0,1fr)] gap-2 (gap=8px), inside CommandCenterShell root p-2 (8px/side).
// Percentages in grid track sizing resolve against the grid container inline size.
const GAP = 8;          // tailwind gap-2 = 0.5rem
const PAD = 8;          // tailwind p-2 on the shell root, each side
const QUEUE_PCT = 0.28; // doctrine 28%
const QUEUE_FLOOR = 320;// minmax floor (readability)

function layout(drawerComputedWidthPx) {
  const container = drawerComputedWidthPx - PAD * 2; // grid container inline size
  const pct = QUEUE_PCT * container;
  const queue = Math.max(QUEUE_FLOOR, pct);          // minmax(320px,28%) => max(320, 28%)
  const workspace = Math.max(0, container - GAP - queue); // minmax(0,1fr) takes the rest
  return {
    drawer: drawerComputedWidthPx,
    container: Math.round(container),
    queuePx: Math.round(queue),
    workspacePx: Math.round(workspace),
    queuePctOfContainer: +(100 * queue / container).toFixed(1),
    workspacePctOfContainer: +(100 * workspace / container).toFixed(1),
    flooredToMin: pct < QUEUE_FLOOR,
  };
}

const widths = [880, 1040, 1280]; // min-usable, overview-min, max
let pass = true;
console.log("drawer | container | queuePx | wsPx | queue% | ws% | floored");
for (const w of widths) {
  const r = layout(w);
  console.log(
    `${r.drawer.toString().padEnd(6)} | ${r.container.toString().padEnd(9)} | ${r.queuePx.toString().padEnd(7)} | ${r.workspacePx.toString().padEnd(4)} | ${r.queuePctOfContainer.toString().padEnd(6)} | ${r.workspacePctOfContainer.toString().padEnd(4)} | ${r.flooredToMin}`
  );
}

// Assertions
const atMax = layout(1280);
const a1 = Math.abs(atMax.queuePctOfContainer - 28) <= 0.5;            // ~28% at full width
const a2 = atMax.queuePx >= 340 && atMax.queuePx <= 365;               // ~360 doctrine target
const a3 = atMax.workspacePx > atMax.queuePx * 2;                      // workspace dominates
const a4 = layout(880).queuePx === QUEUE_FLOOR;                        // floor holds when narrow
const a5 = layout(1280).workspacePctOfContainer >= 70;                // ws >= 70%
console.log("\nASSERTIONS");
console.log("28% at 1280:", a1, "| ~360px queue:", a2, "| ws dominates(>2x):", a3, "| 320 floor@880:", a4, "| ws>=70%:", a5);
pass = a1 && a2 && a3 && a4 && a5;
console.log("\nHARNESS:", pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
