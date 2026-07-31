/**
 * Perspectives v1 save wiring static tests (Configuration Runtime Phase 2B).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    perspectiveDraftDirty,
    perspectiveDraftFromLanesAndSaved,
    perspectiveDraftToPersisted,
} from "@/lib/lifecycle/perspectiveConfigEditorModel";
import { parsePerspectivesV1 } from "@/lib/lifecycle/perspectiveConfigV1";
import type { PerspectiveLaneSource } from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const LANES: PerspectiveLaneSource[] = [
    { queueKey: "new_leads", label: "New Leads", foundInDefinition: true, defaultDisplayOrder: 1 },
    { queueKey: "tours", label: "Tours", foundInDefinition: true, defaultDisplayOrder: 2 },
];

/**
 * PERSPECTIVE DIRTY + PERSIST — asserted at the owner boundary, behaviourally.
 *
 * These two cases used to source-inspect `LifecycleStageWorkspace.tsx` and
 * `LifecycleActivationBoard.tsx` for `isPerspectivesDirty`, `getPerspectivesDraft`,
 * `perspectivesDirty` and a literal `savedPerspectives={bootstrap?.perspectives_v1 ?? null}`
 * prop string. None of those identifiers exists anywhere in the runtime any more: the
 * persistence contract moved off per-component dirty/draft handles onto dedicated modules —
 * `perspectiveConfigEditorModel` owns draft construction and change detection, and
 * `persistPerspectivesV1` owns applying the draft during a stage save.
 *
 * The assertions were therefore stale in the strongest sense: they described a component
 * wiring that no longer exists, so they could only ever fail, and they told us nothing about
 * whether perspectives actually persist. Restoring that wiring to satisfy them would have
 * reintroduced a retired contract. They are replaced with the invariants that matter, checked
 * against the code that now owns them.
 */
describe("Lifecycle stage perspectives persistence wiring", () => {
    it("perspective change detection is owned by the editor model, not a component handle", () => {
        const saved = [{ queue_key: "new_leads", label: "New Leads", mission: "Work new leads." }];
        const baseline = perspectiveDraftFromLanesAndSaved(LANES, saved);

        // An untouched draft is not dirty — a save must not be offered for nothing.
        expect(perspectiveDraftDirty(saved, baseline, LANES)).toBe(false);

        // An edited draft is dirty — the operator's change is detected.
        const edited = baseline.map((row) =>
            row.queue_key === "new_leads" ? { ...row, mission: "Call within one business day." } : row,
        );
        expect(perspectiveDraftDirty(saved, edited, LANES)).toBe(true);
    });

    it("a dirty draft persists as valid perspectives_v1", () => {
        const saved = [{ queue_key: "new_leads", label: "New Leads", mission: "Work new leads." }];
        const edited = perspectiveDraftFromLanesAndSaved(LANES, saved).map((row) =>
            row.queue_key === "tours" ? { ...row, visible_in_rail: false } : row,
        );

        const persisted = perspectiveDraftToPersisted(edited, LANES);

        // What the save sends is exactly what the parser accepts — no lossy hand-off.
        expect(parsePerspectivesV1(persisted)).toEqual(persisted);
        expect(persisted.map((r) => r.queue_key)).toEqual(["new_leads", "tours"]);
        expect(persisted.find((r) => r.queue_key === "tours")?.visible_in_rail).toBe(false);
    });

    // NEGATIVE CONTROLS. The two cases above only show the invariants hold today; these show
    // they would notice them breaking, so a green run cannot be vacuous.
    it("negative control — change detection is not trivially true or trivially false", () => {
        const saved = [{ queue_key: "new_leads", label: "New Leads", mission: "Work new leads." }];
        const baseline = perspectiveDraftFromLanesAndSaved(LANES, saved);

        // Not trivially TRUE: reordering nothing and changing nothing stays clean.
        expect(perspectiveDraftDirty(saved, [...baseline], LANES)).toBe(false);

        // Not trivially FALSE: each independently persisted field trips it.
        for (const mutate of [
            (r: (typeof baseline)[number]) => ({ ...r, label: `${r.label} (renamed)` }),
            (r: (typeof baseline)[number]) => ({ ...r, mission: "Different mission entirely." }),
            (r: (typeof baseline)[number]) => ({ ...r, visible_in_rail: !r.visible_in_rail }),
            (r: (typeof baseline)[number]) => ({ ...r, display_order: r.display_order + 10 }),
        ]) {
            const changed = baseline.map((r, i) => (i === 0 ? mutate(r) : r));
            expect(perspectiveDraftDirty(saved, changed, LANES)).toBe(true);
        }
    });

    it("negative control — the parser discriminates, so the round-trip assertion is not empty", () => {
        // The round-trip case above is only meaningful if the parser can reject. It can, in the two
        // ways it actually defines: a non-array shape is refused outright, and a row missing the
        // required `queue_key` is dropped rather than passed through.
        expect(parsePerspectivesV1("not an array")).toBeNull();
        expect(parsePerspectivesV1(42)).toBeNull();

        expect(parsePerspectivesV1([{ label: "no queue key" }])).toEqual([]);

        // A valid row survives alongside an invalid one — it drops the bad row, not everything.
        expect(parsePerspectivesV1([{ label: "no queue key" }, { queue_key: "tours" }])).toEqual([
            { queue_key: "tours" },
        ]);
    });

    it("stage-runtime-config accepts perspectives_v1", () => {
        const route = read("app/api/admin/enrollment-process/stage-runtime-config/route.ts");
        expect(route).toContain("perspectives_v1");
        expect(route).toContain("parsePerspectivesV1");
    });

    it("save transaction persists perspectives_v1 metadata", () => {
        const save = read("lib/lifecycle/saveLifecycleStageRuntimeConfig.ts");
        expect(save).toContain("applyStagePerspectivesDraft");
        expect(save).toContain("perspectivesV1");
    });

    it("bootstrap loads coerced perspectives_v1 from stage metadata", () => {
        const bootstrap = read("lib/lifecycle/buildLifecycleStageBootstrap.ts");
        expect(bootstrap).toContain("resolvePerspectivesForStage");
        expect(bootstrap).toContain("coercePerspectivesV1ForLanes");
        expect(bootstrap).toContain("perspectives_v1");
    });

    it("does not wire deriveRuntimePerspective merge yet", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor.tsx")).not.toContain(
            "deriveRuntimePerspective",
        );
        expect(read("lib/lifecycle/saveLifecycleStageRuntimeConfig.ts")).not.toContain("deriveRuntimePerspective");
    });

    it("removed Phase 2 save-pending banner from perspectives editor", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor.tsx")).not.toContain(
            "perspectives-save-pending-note",
        );
    });
});
