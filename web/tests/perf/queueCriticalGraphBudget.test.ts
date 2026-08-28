/**
 * BUDGET GUARD — the queue must not re-acquire the Focus Panel, card or drawer graph.
 *
 * `QueueRegion` needs one thing from the Focus Panel: a context handle to open a row. It used to
 * import that handle from `FocusPanelSurface`, and importing a value from that file drags its whole
 * graph — `InlineOpportunityFocusPanel`, the card registry, every card implementation, the drawer.
 * Measured, the queue's own module graph was 2,163 modules / 14.9 MB of source; with the handle in
 * its own module it is 1,185 / 8.0 MB.
 *
 * This guard walks the real import graph from `QueueRegion` and fails if a card, drawer or panel
 * implementation is reachable again — which is what happens the moment someone imports a value from
 * a panel module for convenience, or adds a card to a barrel the queue consumes.
 *
 * It is deliberately card-AGNOSTIC in the direction that matters: it names panel/drawer INFRASTRUCTURE
 * and the card directory, not any individual card, so registering a new card cannot fail this guard
 * unless that card is pulled into the queue's own import chain.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";

const ROOT = process.cwd();

function resolveSpec(spec: string, from: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
    else if (spec.startsWith(".")) base = resolvePath(dirname(from), spec);
    else return null;
    for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
        const p = base + ext;
        if (existsSync(p) && statSync(p).isFile()) return p;
    }
    return null;
}

/**
 * VALUE imports only.
 *
 * `import type { X } from "…"` is erased by the compiler and pulls no chunk, so counting it would
 * indict edges that do not exist at runtime — `QueueRegion` takes only TYPES from the
 * `lib/presentation/runtime` barrel, and a naive scan follows that into the card registry and
 * reports a fan-out the build never has. Whole import statements are matched so the `type` keyword
 * is visible, and inline `{ type Foo }` specifiers are ignored because the statement still imports
 * values.
 */
function graphFrom(entry: string): Set<string> {
    const seen = new Set<string>();
    const walk = (file: string) => {
        if (seen.has(file)) return;
        seen.add(file);
        let src: string;
        try { src = readFileSync(file, "utf8"); } catch { return; }
        const IMPORT = /(^|\n)\s*(?:import|export)(\s+type)?\s[^;]*?from\s+"([^"]+)"/g;
        for (const m of src.matchAll(IMPORT)) {
            if (m[2]) continue;                       // `import type …` / `export type …` — erased
            const r = resolveSpec(m[3], file);
            if (r) walk(r);
        }
        // Bare side-effect imports (`import "./x"`) still pull the module.
        for (const m of src.matchAll(/(^|\n)\s*import\s+"([^"]+)"/g)) {
            const r = resolveSpec(m[2], file);
            if (r) walk(r);
        }
    };
    walk(join(ROOT, entry));
    return seen;
}

const QUEUE_ENTRY = "components/presentation/workUnit/QueueRegion.tsx";
/** Panel/drawer INFRASTRUCTURE and the card directory — never an individual card name. */
const FORBIDDEN_ON_QUEUE_PATH = [
    "InlineOpportunityFocusPanel",
    "components/admin/focusPanel/cards/",
    "focusPanelCardRegistry",
    "viewModel/drawer/opportunity/composeOpportunityDrawerViewModel",
];

describe("queue-critical import budget", () => {
    const graph = graphFrom(QUEUE_ENTRY);

    it("the queue does not import the Focus Panel surface module", () => {
        const hit = [...graph].some((f) => f.endsWith("workUnit/FocusPanelSurface.tsx"));
        expect(hit, "QueueRegion must import the open-context handle, not the panel surface").toBe(false);
    });

    for (const forbidden of FORBIDDEN_ON_QUEUE_PATH) {
        it(`no card/drawer implementation on the queue path: ${forbidden}`, () => {
            const offenders = [...graph].filter((f) => f.includes(forbidden)).map((f) => f.replace(ROOT + "/", ""));
            expect(offenders, `${forbidden} is reachable from QueueRegion`).toEqual([]);
        });
    }

    it("queue-critical module count and source bytes stay within budget", () => {
        let bytes = 0;
        for (const f of graph) { try { bytes += statSync(f).size; } catch { /* ignore */ } }
        // Measured with value-only edges: 719 modules / 4,928 KB after the split, against
        // 1,711 / 11,845 KB before it. The ceilings sit above today's figure with room for honest
        // growth, and far below the pre-split graph, so re-acquiring the panel fails loudly here.
        expect(graph.size, "queue module count regressed").toBeLessThan(900);
        expect(Math.round(bytes / 1024), "queue source bytes regressed").toBeLessThan(6_000);
    });

    it("POSITIVE CONTROL — the pre-split edge would fail this guard", () => {
        // FocusPanelSurface genuinely reaches the panel implementation, so had QueueRegion kept
        // importing it, the assertions above could not pass. This proves the guard can fail.
        const panelGraph = graphFrom("components/presentation/workUnit/FocusPanelSurface.tsx");
        expect([...panelGraph].some((f) => f.includes("InlineOpportunityFocusPanel"))).toBe(true);
        expect(panelGraph.size).toBeGreaterThan(graph.size);
    });
});
