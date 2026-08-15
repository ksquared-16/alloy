/**
 * D4 — Settlement reserves geometry; it does not visibly construct.
 *
 * Governing: the Settlement contract — "use reserved geometry; never visibly construct the
 * operational surface" — and Authorization Part 8, `visible_construction_ms = 0` (absolute).
 *
 * Browser certification measured ~8 s of visible construction on a Work Unit whose operational
 * truth was already committed and on screen: the Focus Panel's deferred region pulsed placeholder
 * bars while the record VM loaded. The operator was watching the app assemble something it already
 * knew. These are static assertions because the defect is a rendering CHOICE, not a state — the
 * cheapest place to catch it is the source, before a browser run costs ten minutes to tell us.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, "../../", rel), "utf8");

/** Strip comments — these files DISCUSS animation in prose precisely to record why it is absent. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("D4 — Settlement reserves geometry, never constructs", () => {
    const skeleton = read("components/admin/focusPanel/FocusPanelSummarySkeleton.tsx");

    it("1-2. the deferred Focus Panel region renders no pulse, shimmer, or placeholder bars", () => {
        const c = code(skeleton);
        expect(c).not.toMatch(/animate-pulse/);
        expect(c).not.toMatch(/animate-shimmer|shimmer/);
        // Fake content bars imply data that does not exist yet — construction AND a small lie.
        expect(c).not.toMatch(/h-3\.5 w-1\/3|h-3 w-2\/3|h-3 w-1\/2/);
    });

    it("3. it still RESERVES the region — geometry is what prevents reflow when Detail settles", () => {
        expect(skeleton).toMatch(/ReservedSettlementRegion/);
        expect(skeleton).toMatch(/minHeight/);
        expect(skeleton).toMatch(/data-focus-panel-settlement-reserved/);
    });

    it("4-5. operational truth is independent of Settlement — different source, different marker", () => {
        const panel = code(read("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx"));
        // `resolved` (the record VM payload) may drive ONLY the settlement marker.
        expect(panel).toMatch(/data-focus-panel-settlement=\{resolved \? "resolved" : "pending"\}/);
        // The operational marker comes from the committed snapshot, never from the fetch.
        expect(panel).toMatch(/data-inline-focus-panel-resolved=\{operationallyResolved/);
        expect(panel).toMatch(/isOperationallyResolved\(operational\)/);
    });

    it("6. operational resolution asks nothing of the record VM", () => {
        const ctx = code(read("components/presentation/workUnit/OperationalSubjectContext.tsx"));
        // The predicate reads only committed-snapshot fields.
        //
        // Phase 4 widened WHICH committed fields count, not where they come from: resolution now means
        // the action QUESTION was answered — `action` present, or `actionAbsence` saying why not —
        // because a child at a stage that configures no action is fully resolved and was rendering as
        // a permanent spinner. Still zero Settlement input, which is the invariant at the bottom.
        //
        // The predicate was later refactored from one conjunction into early returns, and this pattern
        // was not updated with it — so it has been asserting against text that no longer exists, and
        // failing, since before this sprint. Rewritten to the current shape: the guard is restored, not
        // relaxed. Matching the clauses INDEPENDENTLY is also what stops the next refactor of the same
        // kind from silently disarming it.
        expect(ctx).toMatch(/s\.subjectId == null \|\| s\.situation == null\) return false/);
        expect(ctx).toMatch(/s\.action != null \|\| s\.actionAbsence != null\) return true/);
        // CONTEXTUAL attention resolves on the subject alone — the same widening, one grain over.
        // Situation → Decision → Action describes a subject's position in a COHORT, and a contextual
        // subject was NAMED rather than chosen from one; demanding a `situation` there would paint a
        // permanent spinner over a subject that had already arrived.
        expect(ctx).toMatch(/attentionKind === "contextual"\) return s\.subjectId != null/);
        expect(ctx).not.toMatch(/fetch|useOpportunityDrawerVmPayload|displayVm|record/);
    });

    // The prohibited thing is a SECOND subject owner: the reverted bridge
    // `useEffect(() => openDrawer(committedSubject))` stormed 4418 duplicate requests of 4421, and a
    // polling loop is the same defect wearing a timer.
    //
    // This assertion used to add `not.toMatch(/setTimeout|setInterval|debounce/)` as a proxy for that.
    // The proxy went stale: the module now schedules reveal-gated idle PREFETCH — `setTimeout(run, 500)`
    // re-checks `isWorkUnitPrimaryRevealActive()` before speculative sibling warms, and the 250/400ms
    // timers are `requestIdleCallback` fallbacks. Those timers are amplification PROTECTION; deleting
    // them to satisfy the old text would reintroduce the storm the file was written to prevent. So the
    // proxy is replaced with the actual prohibition, and a negative control proves it still bites.
    const drawerSyncViolations = (src: string): string[] => {
        const c = code(src);
        const found: string[] = [];
        // A drawer follower in any form — the module owns the committed subject, it never opens a drawer.
        if (/\bopenDrawer\s*\(/.test(c)) found.push("openDrawer call — a second subject owner");
        // Recurring interval-based synchronisation is a polling loop by construction.
        if (/\bsetInterval\s*\(/.test(c)) found.push("setInterval — polling synchronisation");
        return found;
    };

    it("11. no drawer-synchronisation effect exists — two owners synchronising is a loop", () => {
        const src = read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
        const runtime = code(src);
        // The reverted bridge, still explicitly barred.
        expect(runtime).not.toMatch(/useEffect\([^)]*openDrawer/);
        expect(drawerSyncViolations(src)).toEqual([]);
    });

    it("11b. NEGATIVE CONTROL — the check detects a reintroduced follower or polling loop", () => {
        // A green run above must not be vacuous: plant each forbidden shape and prove it is caught.
        expect(
            drawerSyncViolations(`useEffect(() => { openDrawer(committedSubject); }, [committedSubject]);`),
        ).toContain("openDrawer call — a second subject owner");
        expect(drawerSyncViolations(`const h = setInterval(() => syncDrawer(), 1000);`)).toContain(
            "setInterval — polling synchronisation",
        );
        // …and the legitimate reveal-gated idle prefetch this module actually uses is NOT flagged,
        // so the repaired assertion cannot be satisfied by regressing amplification protection.
        expect(
            drawerSyncViolations(`const t = window.setTimeout(run, 250); requestIdleCallback(run, { timeout: 2000 });`),
        ).toEqual([]);
        // Comment-only mentions stay invisible — the file DISCUSSES the reverted bridge in prose.
        expect(drawerSyncViolations(`// useEffect(() => openDrawer(committed)) produced 4418 requests`)).toEqual([]);
    });

    it("10. the canonical Focus Panel remains the only one — no second panel tree", () => {
        const surface = read("components/presentation/workUnit/ProvisionedWorkUnitSurface.tsx");
        // The provisioned surface renders the SAME canonical body, not a copy.
        expect(surface).toMatch(/WorkUnitSurfaceBodyFromModel/);
        expect(surface).not.toMatch(/FocusPanelSurface|InlineOpportunityFocusPanel/);
    });
});
