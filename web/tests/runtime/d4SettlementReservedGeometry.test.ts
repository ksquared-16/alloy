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
        expect(ctx).toMatch(/subjectId != null && s\.situation != null && s\.action != null/);
        expect(ctx).not.toMatch(/fetch|useOpportunityDrawerVmPayload|displayVm|record/);
    });

    it("11. no drawer-synchronisation effect exists — two owners synchronising is a loop", () => {
        const runtime = code(read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts"));
        // The reverted bridge: useEffect(() => openDrawer(committedSubject)) stormed 4418 requests.
        expect(runtime).not.toMatch(/useEffect\([^)]*openDrawer/);
        expect(runtime).not.toMatch(/setTimeout|setInterval|debounce/);
    });

    it("10. the canonical Focus Panel remains the only one — no second panel tree", () => {
        const surface = read("components/presentation/workUnit/ProvisionedWorkUnitSurface.tsx");
        // The provisioned surface renders the SAME canonical body, not a copy.
        expect(surface).toMatch(/WorkUnitSurfaceBodyFromModel/);
        expect(surface).not.toMatch(/FocusPanelSurface|InlineOpportunityFocusPanel/);
    });
});
