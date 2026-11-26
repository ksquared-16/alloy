import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/forms/intake/intakeOpportunityDedup", async (importOriginal) => {
    const mod = await importOriginal<typeof import("@/lib/forms/intake/intakeOpportunityDedup")>();
    return {
        ...mod,
        findCustomerMemberIdOnOpportunity: vi.fn(async () => null),
    };
});
import { buildFormIntakeMetaFromPayload } from "@/lib/forms/intake/buildFormIntakeMetaFromPayload";
import { listIntakeChildrenFromMeta } from "@/lib/forms/intake/listIntakeChildrenFromMeta";
import {
    buildOcmInsertFromIntakeChildFields,
    resolveIntakeChildOcmFields,
} from "@/lib/forms/intake/resolveIntakeChildOcmFields";
import { applyIntakeChildToOpportunity } from "@/lib/forms/intake/applyIntakeChildToOpportunity";
import { resolvePlacementCandidateSiteId } from "@/lib/orchestration/placement/resolvePlacementCandidateSiteId";

const SITE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SITE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SITE_OPP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VERTICAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const CATEGORY_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** Minimal supabase stub — resolves location_program_categories key lookups to CATEGORY_ID. */
function categoryLookupSupabase(found: boolean = true) {
    const chain: Record<string, unknown> = {};
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: found ? { id: CATEGORY_ID } : null });
    return { from: () => ({ select: () => chain }) } as never;
}

describe("resolveIntakeChildOcmFields", () => {
    it("uses child site when provided", async () => {
        const r = await resolveIntakeChildOcmFields(categoryLookupSupabase(), {
            orgId: "org-1",
            child: { first_name: "Amy", location_id: SITE_A, program_room_cohort_key: "infant" },
            opportunityLocationId: SITE_OPP,
            linkDefaultLocationId: SITE_B,
        });
        expect(r.location_id).toBe(SITE_A);
        expect(r.placement_scope.location_source).toBe("child_field");
        expect(r.program_room_cohort_key).toBe("infant");
    });

    it("falls back to opportunity location when child site missing", async () => {
        const r = await resolveIntakeChildOcmFields(categoryLookupSupabase(), {
            orgId: "org-1",
            child: { first_name: "Amy", program_room_cohort_key: "toddler" },
            opportunityLocationId: SITE_OPP,
            linkDefaultLocationId: SITE_B,
        });
        expect(r.location_id).toBe(SITE_OPP);
        expect(r.placement_scope.location_source).toBe("opportunity_fallback");
    });

    it("resolves an incoming program key to the category FK by org+site+key", async () => {
        const r = await resolveIntakeChildOcmFields(categoryLookupSupabase(), {
            orgId: "org-1",
            child: { first_name: "Amy", location_id: SITE_A, program_key: "infant" },
        });
        expect(r.program_category_id).toBe(CATEGORY_ID);
    });

    it("passes a category uuid through and yields null when the key cannot resolve", async () => {
        const direct = await resolveIntakeChildOcmFields(categoryLookupSupabase(false), {
            orgId: "org-1",
            child: { first_name: "Amy", location_id: SITE_A, program_key: CATEGORY_ID },
        });
        expect(direct.program_category_id).toBe(CATEGORY_ID);

        const unresolved = await resolveIntakeChildOcmFields(categoryLookupSupabase(false), {
            orgId: "org-1",
            child: { first_name: "Amy", location_id: SITE_A, program_key: "not-configured" },
        });
        expect(unresolved.program_category_id).toBeNull();
    });

    it("does not copy cohort across children implicitly", async () => {
        const a = await resolveIntakeChildOcmFields(categoryLookupSupabase(), {
            orgId: "org-1",
            child: { first_name: "A", location_id: SITE_A, program_room_cohort_key: "infant" },
            opportunityLocationId: SITE_OPP,
        });
        const b = await resolveIntakeChildOcmFields(categoryLookupSupabase(), {
            orgId: "org-1",
            child: { first_name: "B", location_id: SITE_B, program_room_cohort_key: "toddler" },
            opportunityLocationId: SITE_OPP,
        });
        expect(a.program_room_cohort_key).toBe("infant");
        expect(b.program_room_cohort_key).toBe("toddler");
        expect(a.location_id).not.toBe(b.location_id);
    });
});

describe("buildFormIntakeMetaFromPayload", () => {
    it("maps single child site and cohort from values", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: {
                guardian_email: "p@example.com",
                child_first_name: "Amy",
                child_site: SITE_A,
                program_room_preference: "infant",
            },
            linkMetadata: {
                default_vertical_id: VERTICAL,
                intake_field_paths: {
                    child_location_id: "child_site",
                    child_program_room_cohort_key: "program_room_preference",
                },
            },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.intake.child?.location_id).toBe(SITE_A);
        expect(r.intake.child?.program_room_cohort_key).toBe("infant");
    });

    it("maps multi-child paths to children array without cross-copy", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: {
                guardian_email: "p@example.com",
                c1_first: "Amy",
                c1_site: SITE_A,
                c1_cohort: "infant",
                c2_first: "Ben",
                c2_site: SITE_B,
                c2_cohort: "toddler",
            },
            linkMetadata: {
                default_vertical_id: VERTICAL,
                intake_field_paths: {
                    children: [
                        {
                            first_name: "c1_first",
                            location_id: "c1_site",
                            program_room_cohort_key: "c1_cohort",
                        },
                        {
                            first_name: "c2_first",
                            location_id: "c2_site",
                            program_room_cohort_key: "c2_cohort",
                        },
                    ],
                },
            },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const kids = listIntakeChildrenFromMeta(r.intake);
        expect(kids).toHaveLength(2);
        expect(kids[0]?.location_id).toBe(SITE_A);
        expect(kids[0]?.program_room_cohort_key).toBe("infant");
        expect(kids[1]?.location_id).toBe(SITE_B);
        expect(kids[1]?.program_room_cohort_key).toBe("toddler");
        expect(r.intake.child).toBeUndefined();
    });
});

describe("applyIntakeChildToOpportunity", () => {
    it("inserts OCM with child site and cohort", async () => {
        const ocmInserts: Record<string, unknown>[] = [];
        const supabase = {
            from: (table: string) => {
                if (table === "opportunity_customer_members") {
                    return {
                        insert: (row: Record<string, unknown>) => {
                            ocmInserts.push(row);
                            return { error: null };
                        },
                    };
                }
                if (table === "customer_members") {
                    return {
                        insert: () => ({
                            select: () => ({
                                single: async () => ({ data: { id: "cm-1" }, error: null }),
                            }),
                        }),
                    };
                }
                return {};
            },
        } as never;

        const result = await applyIntakeChildToOpportunity(supabase, {
            orgId: "org-1",
            opportunityId: "opp-1",
            customerId: "cust-1",
            child: { first_name: "Amy", location_id: SITE_A, program_room_cohort_key: "infant" },
            opportunityLocationId: SITE_OPP,
        });

        expect(result?.ocm_fields.location_id).toBe(SITE_A);
        expect(ocmInserts[0]?.location_id).toBe(SITE_A);
        expect(ocmInserts[0]?.program_room_cohort_key).toBe("infant");
        const meta = ocmInserts[0]?.metadata as { placement_scope?: { location_source?: string } };
        expect(meta.placement_scope?.location_source).toBe("child_field");
    });
});

describe("placement candidate site from OCM", () => {
    it("prefers OCM location over opportunity fallback", () => {
        const site = resolvePlacementCandidateSiteId({
            ocmLocationId: SITE_A,
            opportunityLocationId: SITE_OPP,
        });
        expect(site.source).toBe("ocm");
        expect(site.site_id).toBe(SITE_A);
    });
});

describe("buildOcmInsertFromIntakeChildFields", () => {
    it("records placement_scope in metadata", async () => {
        const resolved = await resolveIntakeChildOcmFields(categoryLookupSupabase(), {
            orgId: "org",
            child: { first_name: "X", location_id: SITE_A },
            opportunityLocationId: SITE_OPP,
        });
        const row = buildOcmInsertFromIntakeChildFields(resolved, {
            org_id: "org",
            opportunity_id: "opp",
            customer_member_id: "cm",
            metadata: { source: "public_form_intake" },
        });
        expect(row.location_id).toBe(SITE_A);
        expect((row.metadata as { placement_scope: { location_source: string } }).placement_scope.location_source).toBe(
            "child_field"
        );
    });
});
