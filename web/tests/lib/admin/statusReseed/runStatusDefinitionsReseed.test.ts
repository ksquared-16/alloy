import { describe, expect, it, vi } from "vitest";
import {
    STATUS_RESEED_OPPORTUNITY_CASE_STATUSES,
    STATUS_RESEED_PERSON_MVP_STATUSES,
} from "@/lib/admin/statusReseed/statusMvpCatalog";
import { runStatusDefinitionsReseed } from "@/lib/admin/statusReseed/runStatusDefinitionsReseed";
import { ENROLLMENT_INTAKE_PERSON_STATUS_KEY } from "@/lib/admin/person/enrollmentPersonDefaultStatus";
import { DEFAULT_LEAD_CASE_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";

vi.mock("@/lib/admin/statusDefinitionsInventory", () => ({
    runStatusDefinitionsInventory: vi.fn(async () => ({
        org_id: "org-test",
        generated_at: new Date().toISOString(),
        layers: [],
        summary: {
            total_orphan_persisted: 0,
            total_unused_definitions: 0,
            persons_missing_applicability_metadata: 0,
            persons_hidden_from_person_drawer: 0,
            persons_hidden_from_child_drawer: 0,
        },
    })),
}));

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitionsDirect: vi.fn(async () => []),
}));

describe("statusMvpCatalog", () => {
    it("defines four opportunity case statuses", () => {
        expect(STATUS_RESEED_OPPORTUNITY_CASE_STATUSES.map((r) => r.status_key)).toEqual([
            "open",
            "closed",
            "inactive",
            "archived",
        ]);
    });

    it("person MVP uses shared keys with profile-specific labels in metadata", () => {
        const pre = STATUS_RESEED_PERSON_MVP_STATUSES.find((r) => r.status_key === "pre_enrolled");
        expect(pre?.metadata?.labels_by_profile).toMatchObject({
            person_generic: "Pre-Enrolled Family",
            child_lifecycle: "Pre-Enrolled",
        });
    });
});

describe("runStatusDefinitionsReseed dry run", () => {
    it("does not write when execute is false", async () => {
        const insert = vi.fn();
        const update = vi.fn();
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "status_definitions") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                eq: vi.fn(async () => ({ data: [], error: null })),
                            })),
                        })),
                        insert,
                        update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
                    };
                }
                if (table === "opportunities" || table === "persons") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                in: vi.fn(async () => ({ count: 0, error: null })),
                            })),
                        })),
                        update: vi.fn(),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            }),
        };

        const result = await runStatusDefinitionsReseed(supabase as never, {
            orgId: "org-test",
            execute: false,
            backfill: false,
            deactivateLegacy: true,
        });

        expect(result.dry_run).toBe(true);
        expect(insert).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        expect(result.layers.length).toBe(3);
    });
});

describe("enrollment default constants", () => {
    it("uses pre_enrolled for intake persons and open for lead case container", () => {
        expect(ENROLLMENT_INTAKE_PERSON_STATUS_KEY).toBe("pre_enrolled");
        expect(DEFAULT_LEAD_CASE_STATUS_KEY).toBe("open");
    });
});
