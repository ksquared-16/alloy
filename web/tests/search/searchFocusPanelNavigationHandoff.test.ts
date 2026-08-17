import { describe, expect, it } from "vitest";

import { attentionTargetFromEntryHref } from "@/lib/runtime/kernel/useWorkUnitEntryGesture";
import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import { SEARCH_CARD_KEYS, resolveSearchDestinations } from "@/lib/search/searchDestinations";
import type { SearchContext, SearchSubject } from "@/lib/search/searchContracts";

/**
 * Search → Focus Panel, the NAVIGATION HANDOFF.
 *
 * The defect these pin: a Search click resolved a correct destination, changed the
 * URL to a correct-looking address, and then composed nothing — `grids: 0, cells: []`,
 * forever, with no error. Two independent causes, both invisible to the tests that
 * existed:
 *
 *   1. the destination named a PROCESS (`enrollment`) where the route wanted a WORK
 *      UNIT (`enrollment_pipeline`), so the surface answered `work_unit_not_found`;
 *
 *   2. once that was fixed, the click still used `router.push` — and
 *      `/workspace/work-unit/:slug` is SEED-ONLY. The route renders nothing; the
 *      Surface Host inside the Runtime Kernel is the one renderer of the work-unit
 *      surface, and a URL may establish attention only once, on cold load. Measured:
 *      the URL changed, the server rendered the route in 2.9s, and the surface stayed
 *      blank indefinitely. An entry point not wired to K1 is broken, not un-migrated.
 *
 * So a Search click is an ATTENTION MOVEMENT, not a navigation, and it goes through
 * the same adapter every other work-unit entry point uses.
 */

const OPP = "opp-smith";
const HOUSEHOLD = "cust-smith";
const WORK_UNIT = "enrollment_pipeline";

const enrollment: SearchContext = {
    kind: "process",
    key: "enrollment",
    label: "Enrollment",
    detail: "Enrolling",
    destination_entity_type: "opportunity",
    destination_entity_id: OPP,
    destination_work_unit_key: WORK_UNIT,
};

const child: SearchSubject = {
    kind: "child",
    id: "cm-joe",
    display_name: "Joe Smith",
    person_id: null,
    household_id: HOUSEHOLD,
};

const resolve = (subject: SearchSubject, contexts: SearchContext[]) =>
    resolveSearchDestinations({ subject, contexts, promotedKeys: [] });

/**
 * The OPERATIONAL destination for a process — the one that hands off to the kernel.
 *
 * These tests are about the work handoff, and the subject click is no longer part of it: a record
 * intent names a record and resolves no unit. The handoff properties are unchanged; they are simply
 * asserted where they now live.
 */
const operational = (subject: SearchSubject, contexts: SearchContext[], key = "process:enrollment") =>
    resolve(subject, contexts).find((d) => d.key === key)!;

describe("Search resolves a destination the kernel can actually move to", () => {
    it("the host href parses into the attention the kernel adapter expects", () => {
        const work = operational(child, [enrollment]);
        const href = operatorWorkUnitHrefFromKey(work.host_work_unit_key!);

        // This is the exact parse `useWorkUnitEntryMovement` performs. A destination the
        // adapter cannot parse moves nothing and blanks the surface silently.
        expect(attentionTargetFromEntryHref(href)).toEqual({
            target: "enrollment-pipeline",
            lens: null,
        });
    });

    it("a process key does NOT parse into a work-unit target the tenant has", () => {
        // The original defect, stated as an assertion: `enrollment` parses fine as a
        // slug — which is why it failed silently — but it is a process, not a unit.
        const asProcess = attentionTargetFromEntryHref(
            operatorWorkUnitHrefFromKey(enrollment.key)
        );
        expect(asProcess!.target).toBe("enrollment");
        expect(asProcess!.target).not.toBe("enrollment-pipeline");
    });

    it("carries the HOST record, not the child the operator searched for", () => {
        // Host, active subject, card and item are four different identities.
        const work = operational(child, [enrollment]);
        expect(work.host_entity_type).toBe("opportunities");
        expect(work.host_entity_id).toBe(OPP);
        expect(work.item_id).toBe("cm-joe");
        expect(work.card_key).toBe(SEARCH_CARD_KEYS.currentWork);
    });

    it("a child with no person row still resolves a host and a work unit", () => {
        // `person_id = null` is real: a child can exist with no canonical person row.
        // The destination must still go child → participation → host case, and must
        // never fall back to opening the family as the subject.
        const work = operational(
            { kind: "child", id: "cm-joe3", display_name: "Joe Smith", person_id: null, household_id: HOUSEHOLD },
            [enrollment]
        );
        expect(work.host_entity_id).toBe(OPP);
        expect(work.host_work_unit_key).toBe(WORK_UNIT);
        expect(work.item_id).toBe("cm-joe3");
    });

    it("a process context stays a DISTINCT destination from the subject", () => {
        const destinations = resolve(child, [enrollment]);
        const subject = destinations.find((d) => d.primary);
        const process = destinations.find((d) => d.key === "process:enrollment");

        expect(subject).toBeTruthy();
        expect(process).toBeTruthy();
        expect(process!.key).not.toBe(subject!.key);
        // They are now distinct in KIND, not merely in card: one names a record, the other names
        // work. That is a stronger separation than the one this test originally pinned — the two
        // used to differ only by `card_key` while sharing an operational payload.
        expect(subject!.target).toBe("durable_record");
        expect(process!.target).toBe("focus_panel");
        expect(process!.host_entity_id).toBe(OPP);
        expect(subject!.host_entity_id ?? null).toBeNull();
    });

    it("a context worked by no work unit yields no work unit — it does not guess", () => {
        const unhosted: SearchContext = { ...enrollment, destination_work_unit_key: null };
        const work = operational(child, [unhosted]);
        expect(work.host_entity_id).toBe(OPP);
        expect(work.host_work_unit_key).toBeNull();
    });
});

describe("a producer states intent; the kernel applies it", () => {
    const read = async (file: string) => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        return readFileSync(join(process.cwd(), file), "utf8");
    };

    /**
     * Source with comments removed.
     *
     * These files EXPLAIN the defect they prevent, so they legitimately contain the
     * names of the calls they must not make. A raw substring scan reads that prose as
     * a violation — the same trap that made an earlier boundary scan fail on a
     * docstring. Assert on code.
     */
    const code = async (file: string) =>
        (await read(file)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    it("the control never pushes a route for a Focus Panel destination", async () => {
        const src = await code("app/adminV2/components/GlobalSearchBox.tsx");
        const focusPanelBranch = src.slice(src.indexOf('destination.target !== "focus_panel"'));

        // A route push survives only for `target === "route"` destinations (campus
        // settings), which are real routes with real pages.
        expect(focusPanelBranch).not.toContain("router.push");
        expect(focusPanelBranch).toContain("dispatchOperatorFocusSelection(selection)");
    });

    it("the attention listener moves through the ONE work-unit entry adapter", async () => {
        // Not a second gesture path — the same adapter the workspace links use. A
        // second path is what produced the blank surface originally.
        const src = await code("components/adminV2/OperatorFocusAttentionListener.tsx");
        expect(src).toContain("useWorkUnitEntryMovement");
        /*
         * GATE A, UNCONDITIONAL. This was briefly relaxed to an ORDERING that permitted a push from
         * the workspace root, on the theory that the root renders no Surface Host. It renders one —
         * `SurfaceHostProvider` wraps the entire workspace and decides from committed Focus — and in
         * the browser the push left the surface blank for 60s while the movement composed in ~2.0s.
         * See `drawerProductEradication.test.ts` for the full trace.
         */
        expect(src).not.toContain("router.push");
        expect(src).not.toContain("useRouter");
        expect(src).not.toContain("usePathname");
    });

    it("the attention listener is mounted INSIDE the runtime kernel", async () => {
        const providers = await code("app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx");
        const kernel = providers.indexOf("<RuntimeKernelProvider");
        const listener = providers.indexOf("<OperatorFocusAttentionListener");
        const kernelClose = providers.indexOf("</RuntimeKernelProvider>");
        // The kernel is mounted above the Surface Host and outside the route subtree;
        // a listener outside it gets `null` from `useRuntimeKernelOptional` and moves
        // nothing at all.
        expect(kernel).toBeGreaterThan(-1);
        expect(listener).toBeGreaterThan(kernel);
        expect(listener).toBeLessThan(kernelClose);
    });

    it("the movement pins the host record, not the lens default subject", async () => {
        const src = await code("lib/runtime/kernel/useWorkUnitEntryGesture.ts");
        // Without the SUBJECT-scope movement the surface commits its configured default
        // subject — answering a request for one family with a different one.
        expect(src).toContain("ATTENTION_SCOPE.SUBJECT");
        expect(src).toContain("ATTENTION_SCOPE.SURFACE");
    });

    it("card focus rides the attention movement, NOT the drawer", async () => {
        const listener = await code("components/adminV2/OperatorFocusAttentionListener.tsx");
        // The card + item are encoded as the kernel's ASPECT and handed to the same
        // movement that carried the subject.
        expect(listener).toContain("formatCardFocusAspect");

        // `openDrawer` mounts the modal overlay on a work-unit surface, because
        // `AdminEntityDrawer` suppresses itself by testing `usePathname()` and cannot see
        // the address the kernel projects with `replaceState`. Measured `modal: 1`. The
        // drawer applier that used to catch host-less destinations is DELETED: a
        // destination with no work unit is nowhere, and the overlay is not a lesser
        // destination to settle for.
        expect(listener).not.toContain("openDrawer");
    });

    it("there is no second applier that could reach the overlay", async () => {
        const { existsSync } = await import("node:fs");
        const { join } = await import("node:path");
        expect(existsSync(join(process.cwd(), "components/adminV2/SearchFocusSelectionListener.tsx"))).toBe(false);
        expect(existsSync(join(process.cwd(), "lib/adminV2/searchFocusSelection.ts"))).toBe(false);
    });

    it("the inline Focus Panel body reads card focus from ATTENTION, not the drawer", async () => {
        const body = await code("components/admin/focusPanel/OpportunityFocusPanelBody.tsx");
        // This is the body the work-unit surface renders. It previously passed no card
        // request at all, which is why a Search click composed the right panel and then
        // never elevated the card it was asked for.
        expect(body).toContain("useAttentionCardFocus");
        expect(body).toContain("requestedCardFocus");
        expect(body).not.toContain("useAdminDrawer");
    });

    it("the grid applies the ITEM, not only the card", async () => {
        const grid = await code("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        const effect = grid.slice(grid.indexOf("appliedFocusKeyRef"));
        // Elevating the card alone was the gap: the panel opened Children and left the
        // operator to find the child themselves.
        expect(effect).toContain("setActiveDepth");
        expect(effect).toContain("emitFocus");
    });
});

describe("the modal drawer product stays unreachable from Search", () => {
    it("no Search module can launch the legacy drawer-open path", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        for (const file of [
            "app/adminV2/components/GlobalSearchBox.tsx",
            "components/adminV2/OperatorFocusAttentionListener.tsx",
            "lib/runtime/focus/operatorFocusSelection.ts",
            "lib/search/searchDestinations.ts",
        ]) {
            const src = readFileSync(join(process.cwd(), file), "utf8");
            expect(src).not.toContain("launchGlobalRecordSearchOpen");
            expect(src).not.toContain("dispatchGlobalRecordSearchOpen");
            expect(src).not.toContain("open_drawer");
        }
    });
});
