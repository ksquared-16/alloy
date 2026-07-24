import { describe, expect, it } from "vitest";
import {
    buildProgramsLandingViewModel,
    isProgramReadyForLocationUse,
} from "@/lib/programs/publication/programsLandingModel";
import type { ProgramPublicationSnapshot } from "@/lib/programs/publication/programPublicationService";

function baseSnapshot(overrides?: Partial<ProgramPublicationSnapshot>): ProgramPublicationSnapshot {
    return {
        capabilities: { canManage: true },
        programs: [
            {
                id: "program-1",
                key: "preschool",
                lifecycleStatus: "active",
                draft: {
                    id: "draft-1",
                    programId: "program-1",
                    status: "validated",
                    baseRevisionId: "revision-1",
                    validationErrors: [],
                    updatedAt: "2026-07-17T00:00:00.000Z",
                    programKey: "preschool",
                    label: "Preschool",
                    description: "Early learning",
                    category: "Early learning",
                    eligibility: {},
                    audience: { minimumAge: 3, maximumAge: 5 },
                    requiredResourceType: "classroom",
                    qualificationRequirements: [],
                    defaultPolicyRefs: {},
                    defaultCommercialPosture: {},
                },
                revisions: [
                    {
                        id: "revision-1",
                        programId: "program-1",
                        revisionNumber: 1,
                        payloadChecksum: "checksum",
                        publishedAt: "2026-07-17T00:00:00.000Z",
                        programKey: "preschool",
                        label: "Preschool",
                        description: "Early learning",
                        category: "Early learning",
                        eligibility: {},
                        audience: { minimumAge: 3, maximumAge: 5 },
                        requiredResourceType: "classroom",
                        qualificationRequirements: [],
                        defaultPolicyRefs: {},
                        defaultCommercialPosture: {},
                    },
                ],
                publications: [
                    {
                        id: "publication-1",
                        orgId: "org-1",
                        domainKey: "programs",
                        subjectId: "program-1",
                        revision: { id: "revision-1", number: 1, checksum: "checksum" },
                        publishedAt: "2026-07-17T00:00:00.000Z",
                    },
                ],
                latestPublication: {
                    id: "publication-1",
                    orgId: "org-1",
                    domainKey: "programs",
                    subjectId: "program-1",
                    revision: { id: "revision-1", number: 1, checksum: "checksum" },
                    publishedAt: "2026-07-17T00:00:00.000Z",
                },
            },
            {
                id: "program-2",
                key: "camp",
                lifecycleStatus: "active",
                draft: {
                    id: "draft-2",
                    programId: "program-2",
                    status: "draft",
                    baseRevisionId: null,
                    validationErrors: [],
                    updatedAt: "2026-07-17T00:00:00.000Z",
                    programKey: "camp",
                    label: "Summer camp",
                    description: null,
                    category: null,
                    eligibility: {},
                    audience: {},
                    requiredResourceType: null,
                    qualificationRequirements: [],
                    defaultPolicyRefs: {},
                    defaultCommercialPosture: {},
                },
                revisions: [],
                publications: [],
                latestPublication: null,
            },
        ],
        locations: [{ id: "loc-1", label: "North Campus" }],
        assignments: [
            {
                id: "assign-1",
                programId: "program-1",
                locationId: "loc-1",
                locationLabel: "North Campus",
                publicationId: "publication-1",
                revisionId: "revision-1",
                revisionNumber: 1,
                consumedAt: "2026-07-17T00:00:00.000Z",
                deliveredByRunId: "run-1",
            },
        ],
        availability: [],
        offerings: [
            {
                id: "offering-1",
                org_id: "org-1",
                program_key: "preschool",
                label: "Full day",
                attendance_type: "full_time",
                status: "active",
                effective_start: null,
                effective_end: null,
                is_active: true,
                sort_order: 0,
                metadata: {},
                created_at: "2026-07-17T00:00:00.000Z",
                updated_at: "2026-07-17T00:00:00.000Z",
            },
        ],
        variants: [
            {
                id: "variant-1",
                org_id: "org-1",
                offering_id: "offering-1",
                label: "Default",
                quantity_type: "days",
                quantity_value: 5,
                sort_order: 0,
                is_active: true,
                status: "active",
                metadata: {},
                created_at: "2026-07-17T00:00:00.000Z",
                updated_at: "2026-07-17T00:00:00.000Z",
            },
        ],
        tuitionRates: [],
        policies: [],
        products: [],
        runs: [],
        attempts: [],
        ...overrides,
    } as ProgramPublicationSnapshot;
}

describe("Programs landing view model", () => {
    it("defines ready-for-Location-use deterministically", () => {
        expect(
            isProgramReadyForLocationUse({
                hasIdentity: true,
                hasPublishedRevision: true,
                assignedCount: 1,
            }),
        ).toBe(true);
        expect(
            isProgramReadyForLocationUse({
                hasIdentity: true,
                hasPublishedRevision: true,
                assignedCount: 0,
            }),
        ).toBe(false);
        expect(
            isProgramReadyForLocationUse({
                hasIdentity: true,
                hasPublishedRevision: false,
                assignedCount: 2,
            }),
        ).toBe(false);
    });

    it("rolls up summary, readiness, attention, and permissions", () => {
        const landing = buildProgramsLandingViewModel(baseSnapshot());
        expect(landing.summary.totalPrograms).toBe(2);
        expect(landing.summary.publishedPrograms).toBe(1);
        expect(landing.summary.assignedPrograms).toBe(1);
        expect(landing.summary.readyPrograms).toBe(1);
        expect(landing.summary.deliveryOptionCount).toBe(1);
        expect(landing.summary.attentionPrograms).toBeGreaterThanOrEqual(1);
        expect(landing.permissions.canCreateProgram).toBe(true);

        const preschool = landing.programs.find((row) => row.id === "program-1");
        const camp = landing.programs.find((row) => row.id === "program-2");
        expect(preschool?.readyForLocationUse).toBe(true);
        expect(preschool?.audienceLabel).toBe("Ages 3–5");
        expect(camp?.readyForLocationUse).toBe(false);
        expect(camp?.hasPublishedRevision).toBe(false);

        expect(landing.attention.some((item) => item.programId === "program-2")).toBe(true);
        expect(landing.attention.every((item) => item.reason.length > 0)).toBe(true);
    });

    it("respects canManage false for create permission", () => {
        const landing = buildProgramsLandingViewModel(
            baseSnapshot({ capabilities: { canManage: false } }),
        );
        expect(landing.permissions.canCreateProgram).toBe(false);
        expect(landing.permissions.canPublishProgram).toBe(false);
    });

    it("handles valid empty collection", () => {
        const landing = buildProgramsLandingViewModel(
            baseSnapshot({
                programs: [],
                assignments: [],
                offerings: [],
                variants: [],
            }),
        );
        expect(landing.summary.totalPrograms).toBe(0);
        expect(landing.summary.readyPrograms).toBe(0);
        expect(landing.summary.attentionPrograms).toBe(0);
        expect(landing.summary.publishedPrograms).toBe(0);
        expect(landing.summary.assignedPrograms).toBe(0);
        expect(landing.summary.deliveryOptionCount).toBe(0);
        expect(landing.summary.activePrograms).toBe(0);
        expect(landing.programs).toEqual([]);
        expect(landing.attention).toEqual([]);
        expect(landing.permissions.canCreateProgram).toBe(true);
    });
});
