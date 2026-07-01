import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    LifecycleStageStatusAssignmentHandoffError,
    resolveLifecycleStageStatusKeysForQueueSync,
} from "@/lib/lifecycle/lifecycleStageStatusKeysHandoff";
import { buildLifecycleStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageWorkUnit";

const repoRoot = join(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(join(repoRoot, rel), "utf8");
}

describe("lifecycleStageStatusKeysHandoff", () => {
    it("prefers explicit saved keys over empty enrolling payload bucket", () => {
        const payload = buildEnrollmentStatusStagesPayload([], ["enrolling"]);
        const resolution = resolveLifecycleStageStatusKeysForQueueSync({
            stageKey: "enrolling",
            explicitStatusKeys: ["enrolling"],
            statusStagesPayload: payload,
        });
        expect(resolution.source).toBe("explicit");
        expect(resolution.keys).toEqual(["enrolling"]);
    });

    it("falls back to payload when explicit keys omitted", () => {
        const payload = buildEnrollmentStatusStagesPayload(
            [
                {
                    status_key: "enrolling",
                    status_label: "Enrolling",
                    sort_order: 1,
                    metadata: { enrollment_operator_stage: "enrolling" },
                },
            ],
            ["enrolling"]
        );
        const resolution = resolveLifecycleStageStatusKeysForQueueSync({
            stageKey: "enrolling",
            statusStagesPayload: payload,
        });
        expect(resolution.source).toBe("payload");
        expect(resolution.keys).toContain("enrolling");
    });

    it("handoff error includes both explicit and payload sources", () => {
        const err = new LifecycleStageStatusAssignmentHandoffError("enrolling", {
            explicitKeys: [],
            payloadKeys: [],
        });
        expect(err.message).toContain("enrolling");
        expect(err.message).toContain("explicit=");
        expect(err.message).toContain("payload=");
    });

    it("enrolling queue_definition uses explicit keys for filters", () => {
        const resolution = resolveLifecycleStageStatusKeysForQueueSync({
            stageKey: "enrolling",
            explicitStatusKeys: ["enrolling"],
        });
        const doc = buildLifecycleStageQueueDefinition({
            stageKey: "enrolling",
            label: "Enrolling",
            statusKeys: resolution.keys,
        });
        const lane = (doc.queues as Array<Record<string, unknown>>)[0]!;
        const filters = lane.filters as Array<{ type: string; values: string[] }>;
        expect(filters.some((f) => f.type === "case_status" && f.values.includes("enrolling"))).toBe(
            true
        );
    });

    it("Work Unit Queue PATCH sends status_keys after POST for enrolling handoff", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(card).toContain("sync_statuses: true");
        expect(card).toContain("status_keys: savedKeys");
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("status_keys: keys");
    });
});
