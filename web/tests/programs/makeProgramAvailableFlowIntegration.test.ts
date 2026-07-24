/**
 * Stage 3 — API boundary shape for Programs Make Available (no live network).
 * Pins request contracts the production adapter must send.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    previewMakeProgramAvailableClient,
    commitMakeProgramAvailableClient,
    makeAvailableIntentFingerprint,
    createMakeAvailableIdempotencyKey,
} from "@/lib/programs/makeProgramAvailableClient";

const fetchMock = vi.fn();

describe("makeProgramAvailable production API boundary", () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("preview posts preview_make_available without client actor authority", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                preview: {
                    program: {
                        kind: "existing",
                        programId: "p1",
                        label: "Summer Camp",
                        willPublish: false,
                        publicationRequired: false,
                    },
                    requestedLocationIds: ["l1"],
                    newAssociations: [{ locationId: "l1", locationLabel: "Main" }],
                    alreadyAvailable: [],
                    blocked: [],
                    retainedLocalConfiguration: [],
                    impact: { requested: 1, eligible: 1, unchanged: 0, blocked: 0 },
                    plannedOperations: [],
                },
            }),
        });

        const idempotencyKey = createMakeAvailableIdempotencyKey();
        await previewMakeProgramAvailableClient({
            program: { kind: "existing", programId: "p1", publicationId: "pub-1" },
            locationIds: ["l1"],
            originatingLocationId: "l1",
            idempotencyKey,
            entryPoint: "location",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toContain("/api/admin/configuration/programs");
        expect(init.method).toBe("POST");
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body.action).toBe("preview_make_available");
        expect(body.idempotencyKey).toBe(idempotencyKey);
        expect(body.entryPoint).toBe("location");
        expect(body.locationIds).toEqual(["l1"]);
        expect(body.orgId).toBeUndefined();
        expect(body.actorUserId).toBeUndefined();
        expect(body.allowedSiteLocationIds).toBeUndefined();
    });

    it("commit posts make_available once with same idempotency key for retries", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                result: {
                    status: "committed",
                    operationId: "op-1",
                    programId: "p1",
                    revisionId: "r1",
                    publicationId: "pub-1",
                    createdProgram: false,
                    publishedProgram: false,
                    associatedLocationIds: ["l1"],
                    unchangedLocationIds: [],
                    blocked: [],
                    failed: [],
                    refreshTargets: ["programs:collection", "locations:location:l1:programs"],
                    distributionRunId: "run-1",
                    idempotentReplay: false,
                },
            }),
        });

        const idempotencyKey = "make-available:stable-key";
        const req = {
            program: { kind: "existing" as const, programId: "p1" },
            locationIds: ["l1", "l2"],
            originatingLocationId: null as string | null,
            idempotencyKey,
            entryPoint: "organization_program" as const,
        };

        await commitMakeProgramAvailableClient(req);
        await commitMakeProgramAvailableClient(req);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        for (const call of fetchMock.mock.calls) {
            const body = JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
            expect(body.action).toBe("make_available");
            expect(body.idempotencyKey).toBe(idempotencyKey);
            expect(body.locationIds).toEqual(["l1", "l2"]);
            expect(body.orgId).toBeUndefined();
            expect(body.actorUserId).toBeUndefined();
        }
    });

    it("material intent change yields a different fingerprint (new key required)", () => {
        const base = makeAvailableIntentFingerprint({
            program: {
                kind: "new",
                input: { key: "summer_camp", label: "Summer Camp" },
            },
            locationIds: ["a", "b"],
        });
        const changedLocations = makeAvailableIntentFingerprint({
            program: {
                kind: "new",
                input: { key: "summer_camp", label: "Summer Camp" },
            },
            locationIds: ["a"],
        });
        const changedLabel = makeAvailableIntentFingerprint({
            program: {
                kind: "new",
                input: { key: "summer_camp", label: "Summer Camp Plus" },
            },
            locationIds: ["a", "b"],
        });
        expect(base).not.toBe(changedLocations);
        expect(base).not.toBe(changedLabel);
    });
});
