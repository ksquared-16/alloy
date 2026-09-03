/**
 * A WORK VIEW MAY SCOPE THE FOCUS PANEL. IT MAY NOT ASSIGN ONE BY ID.
 *
 * The Work View editor offered a "Focus Panel Surface" picker whose value was saved to
 * `work_views_v1[].focus_panel_layout_id`. The Focus Panel Summary runtime never read it.
 * Measured on the live tenant: Work Views `new_leads` and `new_work_view_7` pointed at
 * focus_panel_summary v10 and v132 while the runtime resolved v143 for both.
 *
 * ── WHY IT WAS OFFERED AT ALL ──
 *
 * `entity_layouts` addresses the Focus Panel Summary as `opportunities` / `drawer` — the same
 * pair as the legacy opportunity drawer — and `resolveSurfaceLayoutKeyFromDoc` classifies on
 * exactly that pair. It therefore answered "opportunity_drawer" for a Focus Panel document, so
 * every published Focus Panel version passed the drawer assignment filter AND the drawer
 * assignment validator. The layout key is the only thing separating the two surfaces here.
 *
 * ── AND WHY IT IS NOT WIRED THROUGH INSTEAD ──
 *
 * The canonical resolver already carries a Work View axis: `resolveSurfaceVariant` ranks
 * `process_workview` above `process_surface_default`. Scoping a Focus Panel to a Work View is
 * done by PUBLISHING A VARIANT that declares that Work View. Honouring an id pointer as well
 * would be a second resolver for one question — and it could only ever pin a VERSION, which is
 * what silently froze those two views behind the publish loop.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    isFocusPanelSummaryLayoutRecord,
    publishedLayoutOptionsForAssignmentSlot,
} from "@/lib/layout/layoutAssignmentLayoutOptions";
import { validateBusinessProcessLayoutAssignmentInput } from "@/lib/layout/validateBusinessProcessLayoutAssignment";
import { resolvePublishedFocusPanelSummaryRecord } from "@/lib/adminV2/runtime/focusPanel/resolveFocusPanelSummaryVariant";
import { FOCUS_PANEL_SUMMARY_LAYOUT_KEY } from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";

function layout(over: Partial<EntityLayoutRecord> & { id: string }): EntityLayoutRecord {
    return {
        id: over.id,
        entityType: "opportunities",
        surface: "drawer",
        layoutKey: FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
        name: "Enrollment Focus Panel Summary",
        status: "published",
        version: 1,
        metadata: {},
        doc: { entityType: "opportunities", surface: "drawer", sections: [], metadata: {} },
        ...over,
    } as EntityLayoutRecord;
}

/** The two rows the live Work Views actually pointed at. */
const ASSIGNED_V10 = layout({ id: "9db0cc6f-cf57-4eb6-b61a-5a877657ec9c", version: 10 });
const ASSIGNED_V132 = layout({ id: "9dedbfad-589f-480f-949c-2c5852d07e7d", version: 132 });
const CURRENT_V143 = layout({ id: "row-143", version: 143 });
/** A genuine legacy drawer body, which remains assignable. */
const LEGACY_DRAWER = layout({ id: "legacy-1", layoutKey: "default", name: "Opportunity Drawer", version: 4 });

describe("the layout key is what separates the two drawer surfaces", () => {
    it("recognises a Focus Panel Summary record by its layout key", () => {
        expect(isFocusPanelSummaryLayoutRecord(ASSIGNED_V10)).toBe(true);
        expect(isFocusPanelSummaryLayoutRecord(LEGACY_DRAWER)).toBe(false);
    });

    it("pins the local constant to the canonical one", () => {
        // The predicate keeps its own copy of the key to avoid an import cycle.
        expect(isFocusPanelSummaryLayoutRecord({ layoutKey: FOCUS_PANEL_SUMMARY_LAYOUT_KEY })).toBe(true);
    });
});

describe("a Focus Panel Summary is never offered as a drawer assignment", () => {
    const records = [ASSIGNED_V10, ASSIGNED_V132, CURRENT_V143, LEGACY_DRAWER];

    it("excludes every Focus Panel version from the drawer options", () => {
        const options = publishedLayoutOptionsForAssignmentSlot(records, "opportunity_drawer");
        expect(options.map((r) => r.id)).toEqual(["legacy-1"]);
    });

    it("still offers genuine legacy drawer layouts", () => {
        const options = publishedLayoutOptionsForAssignmentSlot([LEGACY_DRAWER], "opportunity_drawer");
        expect(options).toHaveLength(1);
    });

    it("leaves the queue slot alone", () => {
        const queueRow = layout({
            id: "q1", surface: "queue", layoutKey: "default", name: "Queue",
            doc: { entityType: "opportunities", surface: "queue", sections: [], metadata: { queue_record_layout: {} } },
        });
        expect(publishedLayoutOptionsForAssignmentSlot([queueRow], "queue_record").map((r) => r.id)).toEqual(["q1"]);
    });
});

describe("the write path refuses it, so nothing inert can be saved", () => {
    const base = { businessProcessKey: "enrollment", surfaceKey: "opportunity_drawer" as const };

    it("rejects assigning a Focus Panel Summary to a drawer slot", () => {
        const out = validateBusinessProcessLayoutAssignmentInput({ ...base, layoutRecord: ASSIGNED_V132 });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        const msg = out.errors.map((e) => e.message).join(" ");
        expect(msg).toMatch(/not an assignable drawer surface/i);
        // It also says what to do instead, rather than only refusing.
        expect(msg).toMatch(/published variant/i);
    });

    it("accepts a genuine legacy drawer layout", () => {
        expect(validateBusinessProcessLayoutAssignmentInput({ ...base, layoutRecord: LEGACY_DRAWER }).ok).toBe(true);
    });
});

describe("Work View scoping runs through the ONE resolver, by variant", () => {
    const withScope = (r: EntityLayoutRecord, meta: Record<string, unknown>) =>
        ({ ...r, metadata: meta }) as EntityLayoutRecord;

    it("prefers a variant scoped to the Work View over an unscoped one, whatever the versions", () => {
        const scoped = withScope(layout({ id: "scoped", version: 2 }), { workViewId: "new_work_view_7" });
        const unscopedNewer = layout({ id: "unscoped", version: 999 });
        const picked = resolvePublishedFocusPanelSummaryRecord([unscopedNewer, scoped], {
            workViewId: "new_work_view_7",
            stageKey: "enrolled",
        });
        expect(picked?.id).toBe("scoped");
    });

    it("does not apply another Work View's variant", () => {
        const scoped = withScope(layout({ id: "scoped", version: 2 }), { workViewId: "new_leads" });
        const unscoped = layout({ id: "unscoped", version: 5 });
        const picked = resolvePublishedFocusPanelSummaryRecord([unscoped, scoped], {
            workViewId: "new_work_view_7",
        });
        expect(picked?.id).toBe("unscoped");
    });

    it("falls back to the stage/process default when no Work View variant exists", () => {
        const picked = resolvePublishedFocusPanelSummaryRecord([ASSIGNED_V10, ASSIGNED_V132, CURRENT_V143], {
            workViewId: "new_leads",
            stageKey: "lead",
        });
        // Highest published version wins among equally-applicable wildcards.
        expect(picked?.id).toBe("row-143");
    });

    it("ignores focus_panel_layout_id entirely — an id pointer is not an input to the resolver", () => {
        // This is the defect stated as a property: whatever a Work View stores, the resolver
        // answers from the published variants alone.
        const picked = resolvePublishedFocusPanelSummaryRecord([ASSIGNED_V10, CURRENT_V143], {
            workViewId: "new_leads",
        });
        expect(picked?.id).not.toBe(ASSIGNED_V10.id);
        expect(picked?.id).toBe("row-143");
    });

    it("ranks a stage variant above the default and below a Work View variant", () => {
        const byStage = withScope(layout({ id: "stage", version: 3 }), { stageKey: "waitlist" });
        const byView = withScope(layout({ id: "view", version: 1 }), { workViewId: "new_work_view_4" });
        const dflt = layout({ id: "default", version: 500 });
        const ctx = { workViewId: "new_work_view_4", stageKey: "waitlist" };
        expect(resolvePublishedFocusPanelSummaryRecord([dflt, byStage, byView], ctx)?.id).toBe("view");
        expect(resolvePublishedFocusPanelSummaryRecord([dflt, byStage], ctx)?.id).toBe("stage");
        expect(resolvePublishedFocusPanelSummaryRecord([dflt], ctx)?.id).toBe("default");
    });
});


describe("the editor stops advertising an assignment it cannot honour", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
        resolve(here, "../..", "components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx"),
        "utf8",
    );

    it("shows the drawer-body assignment only when its consumer runtime is on", () => {
        expect(src).toContain("const legacyDrawerBodyEnabled = isLayoutRuntimeOpportunityDrawerBodyEnabledClient();");
        // The card is rendered behind that flag, not unconditionally.
        expect(src).toMatch(/\{legacyDrawerBodyEnabled \? \(\s*<LayoutAssignmentCard/);
    });

    it("no longer titles a legacy drawer assignment 'Focus Panel Surface'", () => {
        expect(src).not.toContain('title="Focus Panel Surface"');
        expect(src).toContain('title="Opportunity Drawer Body (legacy runtime)"');
        // And it points the operator at the mechanism that does work.
        expect(src).toMatch(/resolves its own surface by published variant/i);
    });

    it("leaves the queue assignment, whose runtime is live, unconditional", () => {
        const queueAt = src.indexOf('title="Queue Row Surface"');
        expect(queueAt).toBeGreaterThan(-1);
        expect(src.slice(Math.max(0, queueAt - 400), queueAt)).not.toContain("legacyDrawerBodyEnabled ?");
    });

    it("stops reporting a Focus Panel assignment in the section summary", () => {
        const sum = readFileSync(resolve(here, "../..", "lib/lifecycle/workViewEditorSummaries.ts"), "utf8");
        expect(sum).toContain("Drawer body: ${focus}");
        expect(sum).not.toContain("Focus Panel: ${focus}");
    });
});
