import { describe, expect, it } from "vitest";
import {
    deriveConfigurationRuntimeModel,
    sortConfigurationHistory,
} from "@/lib/configPublication/runtimeModel";

const publication = {
    id: "publication-2",
    orgId: "org-1",
    domainKey: "example",
    subjectId: "subject-1",
    revision: { id: "revision-2", number: 2, checksum: "checksum-2" },
    publishedAt: "2026-07-17T12:00:00.000Z",
};

describe("Configuration Runtime model", () => {
    it("distinguishes the active revision from unpublished draft changes", () => {
        const model = deriveConfigurationRuntimeModel({
            objectLabel: "Definition",
            draftStatus: "validated",
            draftHasUnpublishedChanges: true,
            latestPublication: publication,
            assignments: [],
            targetCount: 2,
            distributionRuns: [],
            setupAreas: [],
        });

        expect(model.publication).toMatchObject({
            state: "changes_ready",
            activeRevisionLabel: "Revision 2",
            draftLabel: "Ready to publish",
            canPublish: true,
        });
        expect(model.attention).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    key: "unpublished-changes",
                    section: "draft",
                }),
            ]),
        );
    });

    it("projects assignment drift and failed distribution into Attention", () => {
        const model = deriveConfigurationRuntimeModel({
            objectLabel: "Definition",
            draftStatus: "validated",
            draftHasUnpublishedChanges: false,
            latestPublication: publication,
            assignments: [
                {
                    locationId: "location-1",
                    locationLabel: "Downtown",
                    revisionId: "revision-1",
                    revisionNumber: 1,
                    consumedAt: "2026-07-17T12:10:00.000Z",
                },
            ],
            targetCount: 2,
            distributionRuns: [
                {
                    id: "run-1",
                    publicationId: "publication-2",
                    status: "partial_failure",
                    createdAt: "2026-07-17T12:20:00.000Z",
                    targets: [{ locationId: "location-2", status: "failed" }],
                },
            ],
            setupAreas: [
                { key: "identity", label: "Identity", complete: true, section: "draft" },
                { key: "assignment", label: "Assignment", complete: false, section: "assignment" },
                { key: "unknown", label: "Unknown", complete: null, section: "overview" },
            ],
        });

        expect(model.assignment).toMatchObject({
            state: "attention",
            assignedCount: 1,
            currentCount: 0,
            driftCount: 1,
            failedCount: 1,
        });
        expect(model.attention.map((item) => item.key)).toEqual(
            expect.arrayContaining(["distribution-failed", "assignment-drift", "setup-missing"]),
        );
        expect(model.readiness).toMatchObject({
            percent: 50,
            assessedCount: 2,
            unknownCount: 1,
        });
    });

    it("sorts cross-revision history newest first", () => {
        expect(
            sortConfigurationHistory([
                {
                    id: "older",
                    occurredAt: "2026-07-17T10:00:00.000Z",
                    kind: "publication",
                    title: "Older",
                    detail: "",
                    tone: "default",
                },
                {
                    id: "newer",
                    occurredAt: "2026-07-17T11:00:00.000Z",
                    kind: "retry",
                    title: "Newer",
                    detail: "",
                    tone: "good",
                },
            ]).map((entry) => entry.id),
        ).toEqual(["newer", "older"]);
    });
});
