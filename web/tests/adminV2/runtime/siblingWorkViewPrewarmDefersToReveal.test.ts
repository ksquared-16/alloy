/**
 * CP-1 — the speculative sibling-work-view sweep must defer to the primary reveal.
 *
 * Each sibling view costs a full provisioning compose PLUS a drawer-VM compose. The sweep is
 * scheduled with `requestIdleCallback(timeout: 2000)`, so it fires within 2s no matter what the
 * reveal is doing — measured landing four of each inside the selected panel's reveal window.
 *
 * The reveal gate already guards the neighbour-subject warms in this same file and the workspace
 * surface's destination warms; this sweep was the one speculative path that missed it. A source
 * assertion (rather than a render test) because the behaviour lives in an idle-callback effect whose
 * timing is precisely what a jsdom test cannot reproduce faithfully — the thing worth pinning is
 * that the gate is present at the scheduling site and absent from the intent path.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    join(process.cwd(), "lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts"),
    "utf8",
);

function sliceBetween(from: string, to: string): string {
    const start = source.indexOf(from);
    const end = source.indexOf(to, start);
    expect(start, `anchor not found: ${from}`).toBeGreaterThan(-1);
    expect(end, `anchor not found: ${to}`).toBeGreaterThan(start);
    return source.slice(start, end);
}

describe("sibling work-view prewarm defers to the primary reveal", () => {
    it("holds the speculative sweep while a reveal is active, and re-checks", () => {
        const sweep = sliceBetween("const ids = siblingViewIds.split", "}, [siblingViewIds, prefetchWorkView]);");
        expect(sweep).toContain("isWorkUnitPrimaryRevealActive()");
        // It must RETRY, not drop: the siblings still warm once the panel is meaningful.
        expect(sweep).toMatch(/retryTimer\s*=\s*setTimeout\(run/);
        expect(sweep).toContain("clearTimeout(retryTimer)");
    });

    it("does NOT gate the hover/focus warm — that is operator intent, not speculation", () => {
        // `prefetchWorkView` is also wired to WorkUnitSurface's `onPrefetch`. Gating the primitive
        // itself would defer a warm the operator explicitly asked for by hovering the pill.
        const primitive = sliceBetween("const prefetchWorkView = useCallback", "[kernel],");
        expect(primitive).not.toContain("isWorkUnitPrimaryRevealActive");
    });
});
