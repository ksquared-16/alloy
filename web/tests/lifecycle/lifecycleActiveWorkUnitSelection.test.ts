import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { buildLifecycleWaitlistStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import {
    buildLifecycleWorkUnitPillSelection,
    guardLifecycleQueueFetchBeforeApi,
    isWorkUnitQueuePillPrefetchable,
    lifecycleSelectionStateMatchesRef,
    listExecutableQueueKeysForWorkUnit,
} from "@/lib/lifecycle/lifecycleActiveWorkUnitSelection";
import {
    inferLifecycleQueueRowLoader,
    resolveLifecycleWorkUnitPrimaryQueueKey,
} from "@/lib/lifecycle/lifecycleWorkUnitShellPills";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const waitlistRaw = buildLifecycleWaitlistStageQueueDefinition({
    stageKey: "waitlist",
    label: "Waitlist",
    statusKeys: ["waitlisted"],
});
const { normalized: waitlistNorm } = loadQueueDefinitionBundle(waitlistRaw);
const waitlistQueueKey = waitlistNorm.queues[0]!.key;
const waitlistWuId = "99bc2a38-6d47-4abc-8ec6-88d7f31dd59b";

const qualRaw = buildLifecycleWaitlistStageQueueDefinition({
    stageKey: "qualification",
    label: "Qualification",
    statusKeys: ["qualified"],
});
const qualQueueKey = loadQueueDefinitionBundle(qualRaw).normalized.queues[0]!.key;

describe("lifecycleActiveWorkUnitSelection", () => {
    it("buildLifecycleWorkUnitPillSelection sets workUnitId and primary queueKey atomically", () => {
        const sel = buildLifecycleWorkUnitPillSelection({
            id: waitlistWuId,
            queue_definition: waitlistRaw,
            metadata: { lifecycle_stage_key: "waitlist" },
        });
        expect(sel.workUnitId).toBe(waitlistWuId);
        expect(sel.queueKey).toBe(waitlistQueueKey);
        expect(sel.stageKey).toBe("waitlist");
    });

    it("blocks previous qualification queue key on waitlist work unit", () => {
        const guarded = guardLifecycleQueueFetchBeforeApi({
            workUnitId: waitlistWuId,
            attemptedQueueKey: qualQueueKey,
            workUnit: {
                id: waitlistWuId,
                queue_definition: waitlistRaw,
                metadata: { lifecycle_stage_key: "waitlist" },
            },
            previousWorkUnitId: "qual-wu-id",
            previousQueueKey: qualQueueKey,
        });
        expect(guarded.blocked).toBe(false);
        expect(guarded.corrected).toBe(true);
        expect(guarded.apiQueueKey).toBe(waitlistQueueKey);
        expect(guarded.workUnitId).toBe(waitlistWuId);
    });

    it("does not call API path with mismatched waitlist id + qualification key", () => {
        const guarded = guardLifecycleQueueFetchBeforeApi({
            workUnitId: waitlistWuId,
            attemptedQueueKey: "lifecycle_qualification",
            workUnit: {
                id: waitlistWuId,
                queue_definition: waitlistRaw,
                metadata: { lifecycle_stage_key: "waitlist" },
            },
            previousWorkUnitId: "qual-wu-id",
            previousQueueKey: "lifecycle_qualification",
        });
        expect(guarded.apiQueueKey).toBe(waitlistQueueKey);
        expect(guarded.apiQueueKey).not.toBe("lifecycle_qualification");
    });

    it("blocks lifecycle_wu_nav chip keys", () => {
        const guarded = guardLifecycleQueueFetchBeforeApi({
            workUnitId: waitlistWuId,
            attemptedQueueKey: `lifecycle_wu_nav:${waitlistWuId}`,
            workUnit: {
                id: waitlistWuId,
                queue_definition: waitlistRaw,
                metadata: { lifecycle_stage_key: "waitlist" },
            },
        });
        expect(guarded.corrected).toBe(true);
        expect(guarded.apiQueueKey).toBe(waitlistQueueKey);
    });

    it("blocks lifecycle_platform_nav chip keys", () => {
        const guarded = guardLifecycleQueueFetchBeforeApi({
            workUnitId: waitlistWuId,
            attemptedQueueKey: "lifecycle_platform_nav:enrollment",
            workUnit: {
                id: waitlistWuId,
                queue_definition: waitlistRaw,
                metadata: { lifecycle_stage_key: "waitlist" },
            },
        });
        expect(guarded.corrected).toBe(true);
        expect(guarded.apiQueueKey).toBe(waitlistQueueKey);
    });

    it("allows needs_attention virtual queue key on stage work unit", () => {
        const guarded = guardLifecycleQueueFetchBeforeApi({
            workUnitId: waitlistWuId,
            attemptedQueueKey: "needs_attention",
            workUnit: {
                id: waitlistWuId,
                queue_definition: waitlistRaw,
                metadata: { lifecycle_stage_key: "waitlist" },
            },
        });
        expect(guarded.blocked).toBe(false);
        expect(guarded.corrected).toBe(false);
        expect(guarded.apiQueueKey).toBe("needs_attention");
    });

    it("isWorkUnitQueuePillPrefetchable skips nav and attention pills", () => {
        expect(
            isWorkUnitQueuePillPrefetchable({
                pillKey: `lifecycle_wu_nav:${waitlistWuId}`,
                workUnit: { queue_definition: waitlistRaw },
            })
        ).toBe(false);
        expect(
            isWorkUnitQueuePillPrefetchable({
                pillKey: "lifecycle_platform_nav:enrollment",
                workUnit: { queue_definition: waitlistRaw },
            })
        ).toBe(false);
        expect(
            isWorkUnitQueuePillPrefetchable({
                pillKey: "needs_attention",
                workUnit: { queue_definition: waitlistRaw },
            })
        ).toBe(false);
        expect(
            isWorkUnitQueuePillPrefetchable({
                pillKey: waitlistQueueKey,
                workUnit: { queue_definition: waitlistRaw },
            })
        ).toBe(true);
    });

    it("waitlist pill selection uses waitlist queue key and candidate-grain loader", () => {
        const sel = buildLifecycleWorkUnitPillSelection({
            id: waitlistWuId,
            queue_definition: waitlistRaw,
            metadata: { lifecycle_stage_key: "waitlist" },
        });
        expect(sel.queueKey).toBe(waitlistQueueKey);
        expect(
            inferLifecycleQueueRowLoader({
                work_unit_id: sel.workUnitId,
                queue_key: sel.queueKey,
                work_unit_metadata: { lifecycle_stage_key: "waitlist" },
            })
        ).toBe("waitlist_candidate_grain");
    });

    it("lifecycleSelectionStateMatchesRef detects leaky partial state", () => {
        expect(
            lifecycleSelectionStateMatchesRef({
                stateWorkUnitId: waitlistWuId,
                stateQueueKey: qualQueueKey,
                selection: {
                    workUnitId: waitlistWuId,
                    queueKey: waitlistQueueKey,
                    stageKey: "waitlist",
                },
            })
        ).toBe(false);
        expect(
            lifecycleSelectionStateMatchesRef({
                stateWorkUnitId: waitlistWuId,
                stateQueueKey: waitlistQueueKey,
                selection: {
                    workUnitId: waitlistWuId,
                    queueKey: waitlistQueueKey,
                    stageKey: "waitlist",
                },
            })
        ).toBe(true);
    });

    it("listExecutableQueueKeysForWorkUnit lists queue_definition keys", () => {
        expect(
            listExecutableQueueKeysForWorkUnit({ queue_definition: waitlistRaw })
        ).toContain(waitlistQueueKey);
    });
});

describe("work unit page atomic lifecycle selection wiring", () => {
    it("uses activeLifecycleSelectionRef and guard before queue fetch", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        // The lifecycle selection ref + queue-fetch guards remain (queue-lane logic); the in-page
        // `applyActiveLifecycleWorkUnitSelection` switch was removed when sibling switching became
        // canonical navigation.
        expect(page).toContain("activeLifecycleSelectionRef");
        expect(page).toContain("guardLifecycleQueueFetchBeforeApi");
        expect(page).toContain("isWorkUnitQueuePillPrefetchable");
        expect(page).toContain("lifecycleSelectionStateMatchesRef");
        expect(page).toContain("buildLifecycleWorkUnitPillSelection");
    });

    it("retains rows during lifecycle pill switch", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("lifecyclePillRetainRows");
        expect(page).not.toMatch(
            /parseLifecycleWorkUnitNavChipKey[\s\S]{0,1200}setQueueItems\(null\)/
        );
    });

    it("resolveLifecycleWorkUnitPrimaryQueueKey matches waitlist definition", () => {
        expect(
            resolveLifecycleWorkUnitPrimaryQueueKey({
                queue_definition: waitlistRaw,
                metadata: { lifecycle_stage_key: "waitlist" },
            })
        ).toBe(waitlistQueueKey);
    });
});
