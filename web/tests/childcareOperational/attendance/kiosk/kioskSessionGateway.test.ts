/**
 * The kiosk read, and the boundaries it must not be able to cross.
 *
 * The properties under test are the ones a manipulated request would attack:
 * that the org and site come from the DEVICE and never from the interaction, that
 * a child at another site is absent rather than refused, and that a code matching
 * nothing is indistinguishable from a person with nobody here.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    hashKioskPersonCode,
    resolveKioskSession,
} from "@/lib/childcareOperational/attendance/kiosk/kioskSessionGateway";
import type { TrustedKioskDevice } from "@/lib/childcareOperational/attendance/kiosk/kioskDeviceAuthority";

const DEVICE: TrustedKioskDevice = {
    id: "dev-1",
    orgId: "org-1",
    siteLocationId: "site-1",
    producerKey: "kiosk:front-desk",
    label: "Front desk",
    capabilities: ["attendance.record"],
};
const TODAY = "2026-09-18";
const ADULT = "person-adult";

type Tables = Record<string, unknown[]>;

/**
 * A Supabase stub that APPLIES the filters rather than ignoring them — otherwise
 * a test proving site scope would pass against a gateway that never scoped.
 */
function supa(tables: Tables) {
    const seen: { table: string; filters: Record<string, unknown> }[] = [];
    const client = {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            seen.push({ table, filters });
            const api: Record<string, unknown> = {};
            const rows = () =>
                (tables[table] ?? []).filter((r) =>
                    Object.entries(filters).every(([k, v]) => {
                        const cell = (r as Record<string, unknown>)[k];
                        return Array.isArray(v) ? v.includes(cell) : cell === v;
                    }),
                );
            api.select = () => api;
            api.eq = (col: string, val: unknown) => {
                filters[col] = val;
                return api;
            };
            api.in = (col: string, vals: unknown[]) => {
                filters[col] = vals;
                return api;
            };
            api.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
            api.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null });
            return api;
        },
    } as unknown as SupabaseClient;
    return { client, seen };
}

/** One adult, one child at the device's site, fully authorized. */
function world(over: Partial<Tables> = {}): Tables {
    return {
        person_kiosk_codes: [
            { org_id: "org-1", person_id: ADULT, code_hash: hashKioskPersonCode("ABC123"), status: "active" },
        ],
        person_child_relationships: [
            { id: "rel-1", org_id: "org-1", person_id: ADULT, customer_member_id: "emma", status: "active" },
        ],
        person_child_relationship_roles: [
            { org_id: "org-1", relationship_id: "rel-1", role_key: "authorized_pickup", is_active: true },
        ],
        child_enrollment_agreements: [
            { id: "agr-1", org_id: "org-1", customer_member_id: "emma", site_location_id: "site-1" },
        ],
        child_safeguarding_restrictions: [],
        child_safeguarding_screenings: [{ org_id: "org-1", customer_member_id: "emma" }],
        customer_members: [{ id: "emma", org_id: "org-1", first_name: "Emma", last_name: "Stone", person_id: "p-emma" }],
        ...over,
    };
}

const session = (tables: Tables, code = "ABC123", operation: "check_in" | "check_out" = "check_out") =>
    resolveKioskSession({ supabase: supa(tables).client, device: DEVICE, code, operation, onDate: TODAY });

describe("the happy path resolves one authorized child", () => {
    it("returns the person and an allowed checkout", async () => {
        const r = await session(world());
        expect(r.personId).toBe(ADULT);
        expect(r.children).toHaveLength(1);
        expect(r.children[0]).toMatchObject({ childId: "emma", displayName: "Emma Stone", enrollmentAgreementId: "agr-1" });
        expect(r.children[0].eligibility.allowed).toBe(true);
    });

    it("normalises the typed code so case and spacing do not matter", async () => {
        expect((await session(world(), " abc123 ")).personId).toBe(ADULT);
    });
});

describe("SITE SCOPE — a child elsewhere is absent, not refused", () => {
    it("omits a child whose enrolment is at another site", async () => {
        const r = await session(
            world({
                child_enrollment_agreements: [
                    { id: "agr-2", org_id: "org-1", customer_member_id: "emma", site_location_id: "site-2" },
                ],
            }),
        );
        // Scenario E: not a denial the caller can probe, an empty set.
        expect(r.personId).toBe(ADULT);
        expect(r.children).toEqual([]);
    });

    it("filters the enrolment read by the DEVICE's site, not by anything supplied", async () => {
        const { client, seen } = supa(world());
        await resolveKioskSession({ supabase: client, device: DEVICE, code: "ABC123", operation: "check_out", onDate: TODAY });
        const agreementRead = seen.find((s) => s.table === "child_enrollment_agreements");
        expect(agreementRead?.filters.site_location_id).toBe("site-1");
        expect(agreementRead?.filters.org_id).toBe("org-1");
    });

    it("scopes the code lookup to the device's org", async () => {
        // The hash index is unique deployment-wide, so without this filter a code
        // issued by another tenant would resolve here.
        const { client, seen } = supa(world());
        await resolveKioskSession({ supabase: client, device: DEVICE, code: "ABC123", operation: "check_out", onDate: TODAY });
        expect(seen.find((s) => s.table === "person_kiosk_codes")?.filters.org_id).toBe("org-1");
    });

    it("resolves nobody for a code belonging to another org", async () => {
        const r = await session(
            world({
                person_kiosk_codes: [
                    { org_id: "org-2", person_id: ADULT, code_hash: hashKioskPersonCode("ABC123"), status: "active" },
                ],
            }),
        );
        expect(r.personId).toBeNull();
    });
});

describe("nothing distinguishable leaks from a failed attempt", () => {
    it("returns the same empty shape for an unknown code and for a revoked one", async () => {
        const unknown = await session(world(), "NOPE99");
        const revoked = await session(
            world({
                person_kiosk_codes: [
                    { org_id: "org-1", person_id: ADULT, code_hash: hashKioskPersonCode("ABC123"), status: "revoked" },
                ],
            }),
        );
        expect(unknown).toEqual({ personId: null, children: [] });
        expect(revoked).toEqual({ personId: null, children: [] });
    });

    it("returns an empty child list for a person with no active relationship", async () => {
        const r = await session(
            world({
                person_child_relationships: [
                    { id: "rel-1", org_id: "org-1", person_id: ADULT, customer_member_id: "emma", status: "inactive" },
                ],
            }),
        );
        expect(r.children).toEqual([]);
    });

    it("never reads anything for an empty code", async () => {
        const { client, seen } = supa(world());
        const r = await resolveKioskSession({ supabase: client, device: DEVICE, code: "   ", operation: "check_out", onDate: TODAY });
        expect(r).toEqual({ personId: null, children: [] });
        expect(seen).toEqual([]);
    });
});

describe("the decision travels with the child", () => {
    it("denies checkout for a child that was never screened, and says only 'see staff'", async () => {
        const r = await session(world({ child_safeguarding_screenings: [] }));
        expect(r.children[0].eligibility.allowed).toBe(false);
        expect(r.children[0].eligibility.publicReason).toBe("Please see a member of staff.");
    });

    it("still allows CHECK-IN for that same unscreened child", async () => {
        // The two operations are different questions; this is the gateway proving
        // it does not quietly share one rule.
        const r = await session(world({ child_safeguarding_screenings: [] }), "ABC123", "check_in");
        expect(r.children[0].eligibility.allowed).toBe(true);
    });

    it("hands the resolver unfiltered restrictions, including not-in-force ones", async () => {
        // Filtering before the resolver hides "recorded but not in force" behind
        // "nothing recorded", which is the distinction it exists to keep.
        const { client, seen } = supa(
            world({
                child_safeguarding_restrictions: [
                    {
                        id: "r1",
                        org_id: "org-1",
                        customer_member_id: "emma",
                        affected_person_id: ADULT,
                        operational_effect: "may_not_pick_up",
                        status: "revoked",
                        review_state: "approved",
                        effective_from: null,
                        effective_to: null,
                    },
                ],
            }),
        );
        const r = await resolveKioskSession({ supabase: client, device: DEVICE, code: "ABC123", operation: "check_out", onDate: TODAY });
        const read = seen.find((s) => s.table === "child_safeguarding_restrictions");
        expect(read?.filters.status).toBeUndefined();
        // A revoked restriction is not in force, so it does not block.
        expect(r.children[0].eligibility.allowed).toBe(true);
    });
});
