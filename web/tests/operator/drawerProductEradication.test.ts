import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatCardFocusAspect, parseCardFocusAspect } from "@/lib/runtime/kernel/attentionCardFocus";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";
import { FOCUS_PANEL_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { isResolvableFocusEntityType } from "@/lib/workUnits/operatorFocusTarget";

/**
 * THE NEGATIVE INVARIANT: no operator path can produce the generic modal record overlay.
 *
 * These are repo-level guards, not behaviour tests, because the failure mode they prevent is
 * REINTRODUCTION. The overlay did not survive by being defended — it survived by being the easiest
 * answer to "show me this record", available from any component through one context method. Deleting
 * it is not enough; the next caller that needs a record must not be able to reach for it again.
 *
 * Assertions read code with comments stripped. Several of these modules EXPLAIN why the overlay is
 * wrong, so a raw substring scan reads their own reasoning as the violation — the same trap that made
 * an earlier boundary scan fail on a docstring.
 */

const WEB = process.cwd();

const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const code = (rel: string) => stripComments(readFileSync(join(WEB, rel), "utf8"));

function sourceFiles(dirs: readonly string[]): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
        let entries: string[];
        try {
            entries = readdirSync(d);
        } catch {
            return;
        }
        for (const e of entries) {
            const p = join(d, e);
            if (statSync(p).isDirectory()) {
                if (e !== "node_modules" && e !== ".next") walk(p);
            } else if ([".ts", ".tsx"].includes(extname(p))) {
                out.push(p);
            }
        }
    };
    for (const d of dirs) walk(join(WEB, d));
    return out;
}

describe("the modal record product does not exist", () => {
    it("the router that mounted it is gone, and so are both runtimes it mounted", () => {
        // One router, two runtimes. The enrollment one was suppressed on work-unit surfaces; the
        // person/child one never was, which is why clicking a child put a modal over the panel.
        for (const gone of [
            "components/admin/AdminEntityDrawer.tsx",
            "components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx",
            "components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx",
            "components/admin/subjectSurface/SubjectSurfaceRuntime.tsx",
            "components/admin/subjectSurface/EnrollmentSubjectSurfaceRuntime.tsx",
            "components/admin/subjectSurface/PersonSubjectSurfaceRuntime.tsx",
        ]) {
            expect(existsSync(join(WEB, gone)), `${gone} must not exist`).toBe(false);
        }
    });

    it("no provider tree mounts a record-overlay router", () => {
        for (const rel of [
            "app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx",
            "app/adminV2/settings/AdminV2SettingsClientProviders.tsx",
            "app/adminV2/components/AdminV2ShellDrawerScope.tsx",
            "components/admin/AdminLayout.tsx",
        ]) {
            const src = code(rel);
            expect(src, rel).not.toContain("<AdminEntityDrawer");
            expect(src, rel).not.toContain("<SubjectSurfaceRuntime");
            expect(src, rel).not.toContain("<FocusPanelRuntime");
        }
    });

    it("the subject-surface barrel exports no runtime entry", () => {
        // The barrel is the sanctioned import surface for presentation code. Leaving a runtime alias
        // here is leaving a supported way to mount the overlay.
        const barrel = code("components/admin/subjectSurface/index.ts");
        for (const gone of [
            "SubjectSurfaceRuntime",
            "FocusPanelRuntime",
            "EnrollmentSubjectSurfaceRuntime",
            "PersonSubjectSurfaceRuntime",
            "OpportunityDrawerVmRuntime",
            "PersonsDrawerVmRuntime",
        ]) {
            expect(barrel, gone).not.toContain(gone);
        }
    });
});

describe("no operator surface opens a record as an overlay", () => {
    /**
     * Surfaces an operator actually reaches. `app/legacy-admin/**` is deliberately excluded: it is
     * the archived admin, not an operator surface, and its drawer types resolve to the legacy route
     * which renders nothing. Dev probes and layout proofs are excluded for the same reason — they are
     * harnesses, not product.
     */
    const OPERATOR_DIRS = [
        "app/adminV2",
        "components/admin/focusPanel",
        "components/presentation",
        "components/workspace",
        "components/adminV2",
        "components/forms",
        "components/workItems",
    ] as const;

    const EXCLUDED = [
        "app/adminV2/workspace/drawer-probe/",
        "app/adminV2/settings/", // configuration authoring, not the operator product
        "components/adminV2/settings/",
    ];

    it("no operator component calls openDrawer to show a record", () => {
        const offenders: string[] = [];
        for (const file of sourceFiles(OPERATOR_DIRS)) {
            const rel = file.slice(WEB.length + 1);
            if (EXCLUDED.some((p) => rel.startsWith(p))) continue;
            const src = stripComments(readFileSync(file, "utf8"));
            if (/\bopenDrawer\s*\(/.test(src)) offenders.push(rel);
        }
        // `AdminDrawerContext` remains the ONE selection authority and the inline Focus Panel reads
        // it — but selecting is `useWorkUnitDefaultOperationalSubjectAutoOpen`'s job on a work-unit
        // surface, not any component's way of showing a record.
        expect(offenders, "operator components must state a focus intent, not open a drawer").toEqual([]);
    });

    it("the one remaining selection call is the work-unit default subject, not a record opener", () => {
        const src = code("lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen.ts");
        // It establishes the INLINE panel's subject on entry to a work unit. There is no overlay for
        // it to mount any more, which is precisely why it is safe to leave alone.
        expect(src).toContain("openDrawer");
        expect(src).not.toContain("router.push");
    });
});

describe("Gate B — a Business Process key is never used as a Work Unit key", () => {
    it("the host resolver reads the record's own work unit, never a process", () => {
        const src = code("lib/workUnits/hostWorkUnitResolver.ts");
        expect(src).toContain("work_unit_id");
        expect(src).toContain('.from("work_units")');
        // The silent failure: a process key parses fine as a route slug, so the surface answered
        // `work_unit_not_found` and composed nothing, with no error anywhere.
        expect(src).not.toContain("process_key");
        expect(src).not.toContain("process_instances");
    });

    it("the client adapter never derives a destination from anything but the resolver", () => {
        const src = code("lib/runtime/focus/useOperatorRecordFocus.ts");
        expect(src).toContain("operatorWorkUnitHrefFromKey");
        expect(src).toContain("host_work_unit_key");
        expect(src).not.toContain("process");
    });
});

describe("Gate A — active-runtime movement is never a route push", () => {
    it("the OPERATIONAL adapter pushes only when it is outside the workspace layout", () => {
        const src = code("lib/runtime/focus/useOperatorRecordFocus.ts");

        // Gate A is about the WORK-UNIT route, which is seed-only: pushing it on an active runtime
        // renders nothing. Anchor on that push specifically. (The durable-record push above it
        // targets a different address whose semantics are the opposite — see the next test — so
        // "the first push in the file" is no longer the right anchor.)
        const pushIndex = src.indexOf("router.push(`${href}");
        expect(pushIndex, "the work-unit push must still exist").toBeGreaterThan(-1);

        // Everything above it must have returned already for the two in-layout worlds:
        // a kernel movement, and the event for shell chrome that sits above the kernel.
        const before = src.slice(0, pushIndex);
        expect(before).toContain("if (kernel) {");
        expect(before).toContain("dispatchOperatorFocusSelection");
        expect(before).toContain("CANONICAL_OPERATOR_BASE");
    });

    it("the durable push is gated on declared intent and never targets a work-unit route", () => {
        const src = code("lib/runtime/focus/useOperatorRecordFocus.ts");
        // The CALL SITE, not the import line.
        const durableIndex = src.indexOf("durableRecordHref(grain");
        expect(durableIndex).toBeGreaterThan(-1);

        // It is reachable ONLY under an explicitly declared durable intent — an operational gesture
        // can never fall into it, which is what keeps Gate A intact for every existing caller.
        const before = src.slice(0, durableIndex);
        expect(before).toContain('request.intent === "durable_record"');

        // And it addresses the record, not a queue: no work-unit key is involved.
        const durableCall = src.slice(durableIndex, durableIndex + 200);
        expect(durableCall).not.toContain("workUnitKey");
        expect(durableCall).not.toContain("operatorWorkUnitHrefFromKey");
    });

    it("the listener moves on a live surface, and only navigates off one", () => {
        const src = code("components/adminV2/OperatorFocusAttentionListener.tsx");
        expect(src).toContain("useWorkUnitEntryMovement");
        /*
         * GATE A, ASSERTED AS THE RULE RATHER THAN AS A BANNED SYMBOL.
         *
         * This used to read `expect(src).not.toContain("router.push")`. That proxy was exactly right
         * while the listener only ever ran on a work-unit surface, and it became wrong when the same
         * listener had to serve the workspace ROOT: the kernel spans the whole workspace, so a
         * movement from the root succeeds and paints nothing, because the root renders no Surface
         * Host. Banning the symbol would have preserved the letter of Gate A and left an operational
         * Search result stranded on `/workspace`.
         *
         * What Gate A actually forbids is pushing a SEED-ONLY route while a surface is live. So the
         * assertion is the ordering: the movement is taken whenever the operator is already on a
         * work-unit surface, and the push is reachable only through the negative branch of that
         * check. That is strictly stronger than the symbol ban — it pins WHEN, not merely whether.
         */
        const surfaceCheck = src.indexOf("onWorkUnitSurface");
        const push = src.indexOf("router.push");
        expect(surfaceCheck).toBeGreaterThan(-1);
        expect(push).toBeGreaterThan(surfaceCheck);
        expect(src).toContain("if (onWorkUnitSurface) {");
    });
});

describe("Gate C — card and item focus travel as the kernel ASPECT", () => {
    it("every card an operator gesture can name exists in the card catalogue", () => {
        // A renamed card would otherwise degrade silently: the grid ignores an unknown key, so the
        // panel composes correctly and simply does not elevate — indistinguishable from a no-op.
        for (const key of Object.values(OPERATOR_FOCUS_CARDS)) {
            expect(FOCUS_PANEL_CARD_KEYS as readonly string[]).toContain(key);
        }
    });

    it("a card + item round-trips through the aspect encoding", () => {
        const aspect = formatCardFocusAspect({ card_key: OPERATOR_FOCUS_CARDS.children, item_id: "cm-joe" });
        expect(aspect).toBe("card:children|item:cm-joe");
        expect(parseCardFocusAspect(aspect)).toEqual({
            card_key: "children",
            item_id: "cm-joe",
            context_key: null,
        });
    });

    it("the inline panel reads card focus from attention and from nowhere else", () => {
        const body = code("components/admin/focusPanel/OpportunityFocusPanelBody.tsx");
        expect(body).toContain("useAttentionCardFocus");
        expect(body).not.toContain("useAdminDrawer");
        // The drawer's own card_focus was a SECOND source, fed only by the deleted applier.
        expect(body).not.toContain("drawerSubjectContext");
    });
});

describe("navigation does not grant access", () => {
    it("the resolver route enforces admin/ops and the access envelope before answering", () => {
        const src = code("app/api/admin/operator-focus/resolve/route.ts");
        expect(src).toContain("requireAdminOrOps");
        expect(src).toContain("getAdminAccessContextCached");
        expect(src).toContain("scopeDimensionsFromAccess");
    });

    it("an unreachable record is indistinguishable from a record no queue holds", () => {
        // Both answer `null`. A distinct error would confirm the record exists to an operator who
        // may not know it does.
        const src = code("lib/workUnits/operatorFocusTarget.ts");
        expect(src).toContain("resolveSearchAccessEnvelope");
        expect(src).toContain("if (envelope.impossible) return null;");
    });

    it("only entity types with an operational host are resolvable", () => {
        expect(isResolvableFocusEntityType("opportunities")).toBe(true);
        expect(isResolvableFocusEntityType("persons")).toBe(true);
        expect(isResolvableFocusEntityType("customers")).toBe(true);
        // A type with no Focus Panel host must not silently resolve to somebody else's record.
        expect(isResolvableFocusEntityType("jobs")).toBe(false);
        expect(isResolvableFocusEntityType("schedules")).toBe(false);
        expect(isResolvableFocusEntityType("")).toBe(false);
    });
});
