import { describe, expect, it } from "vitest";
import {
    buildConfigurationHistory,
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

    it("retains an initial failure after a successful retry", () => {
        const history = buildConfigurationHistory({
            publications: [publication],
            runs: [{
                id: "run-1",
                publicationId: publication.id,
                status: "completed",
                idempotencyKey: "run-1",
                createdAt: "2026-07-17T12:01:00.000Z",
                completedAt: "2026-07-17T12:03:00.000Z",
                targets: [{
                    id: "target-1",
                    locationId: "location-1",
                    status: "delivered",
                    attemptCount: 2,
                    errorCode: null,
                    errorMessage: null,
                    result: {},
                }],
            }],
            attempts: [
                {
                    id: "attempt-1",
                    runId: "run-1",
                    targetId: "target-1",
                    locationId: "location-1",
                    attemptNumber: 1,
                    status: "failed",
                    errorCode: "delivery_failed",
                    errorMessage: "Not eligible",
                    attemptedAt: "2026-07-17T12:02:00.000Z",
                },
                {
                    id: "attempt-2",
                    runId: "run-1",
                    targetId: "target-1",
                    locationId: "location-1",
                    attemptNumber: 2,
                    status: "delivered",
                    errorCode: null,
                    errorMessage: null,
                    attemptedAt: "2026-07-17T12:03:00.000Z",
                },
            ],
            revisionLabelByPublicationId: new Map([[publication.id, "Revision 2"]]),
            locationLabelById: new Map([["location-1", "Downtown"]]),
        });

        expect(history.map((entry) => entry.title)).toEqual(
            expect.arrayContaining([
                "Revision 2 published",
                "Revision 2 assigned",
                "Assignment attempt failed",
                "Assignment retry completed",
            ]),
        );
    });
});
