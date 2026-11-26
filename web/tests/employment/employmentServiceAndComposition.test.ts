/**
 * Employment service semantics, configured facts, and the Person composition.
 */

import { describe, expect, it } from "vitest";

import { buildPersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";
import {
    loadEmploymentConfiguredFacts,
    saveEmploymentConfiguredFacts,
} from "@/lib/employment/employmentConfiguredFacts";
import {
    EMPLOYMENT_ENTITY_TYPE,
    isReservedEmploymentFieldKey,
} from "@/lib/employment/employmentFieldRegistry";
import {
    createEmployment,
    endEmployment,
    getCurrentEmployment,
    isPersonEmployedOn,
    listEmploymentsForPerson,
    updateEmployment,
} from "@/lib/employment/employmentService";
import { resolveEmploymentStatusForDates } from "@/lib/employment/employmentTypes";
import { isFieldDefinitionEntityType } from "@/lib/fields/inquiryChildFieldRegistry";
import { createEmploymentMock, ORG_ID, SITE_ID } from "./mockEmploymentSupabase";

const TODAY = "2026-08-11";
const PERSON = { id: "person-1", org_id: ORG_ID, full_name: "Rae Lindqvist", archived_at: null };

function mock(extra?: Record<string, Record<string, unknown>[]>) {
    return createEmploymentMock({
        persons: [PERSON],
        locations: [{ id: SITE_ID, org_id: ORG_ID, label: "Riverside", location_type: "site" }],
        employment_positions: [
            { id: "pos-1", org_id: ORG_ID, key: "lead_teacher", label: "Lead Teacher", is_active: true },
        ],
        ...extra,
    });
}

describe("effective-dated status derivation", () => {
    it("derives status from the window, not from operator input", () => {
        expect(resolveEmploymentStatusForDates("2026-09-01", null, TODAY)).toBe("pending_start");
        expect(resolveEmploymentStatusForDates("2026-01-01", null, TODAY)).toBe("active");
        expect(resolveEmploymentStatusForDates("2026-01-01", "2026-09-30", TODAY)).toBe("ending");
        expect(resolveEmploymentStatusForDates("2026-01-01", "2026-06-30", TODAY)).toBe("ended");
    });
});

describe("employment lifecycle", () => {
    it("refuses a second open employment for the same person in one org", async () => {
        const m = mock();
        await createEmployment(m.supabase, {
            orgId: ORG_ID,
            personId: PERSON.id,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        await expect(
            createEmployment(m.supabase, {
                orgId: ORG_ID,
                personId: PERSON.id,
                startDate: "2026-03-01",
                todayYmd: TODAY,
            })
        ).rejects.toMatchObject({ code: "conflict" });
    });

    it("preserves the original row and its dates when employment ends", async () => {
        const m = mock();
        const created = await createEmployment(m.supabase, {
            orgId: ORG_ID,
            personId: PERSON.id,
            positionId: "pos-1",
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });

        const ended = await endEmployment(m.supabase, {
            orgId: ORG_ID,
            employmentId: created.id,
            endDate: "2026-06-30",
            endReasonKey: "resigned",
            todayYmd: TODAY,
        });

        expect(ended.id).toBe(created.id);
        expect(ended.start_date).toBe("2026-01-01");
        expect(ended.end_date).toBe("2026-06-30");
        expect(ended.employment_status).toBe("ended");
        expect(ended.position_id).toBe("pos-1");
        // Nothing was deleted — the same single row carries the history.
        expect(m.store.employments).toHaveLength(1);
    });

    it("allows rehire after ending and keeps both periods", async () => {
        const m = mock();
        const first = await createEmployment(m.supabase, {
            orgId: ORG_ID,
            personId: PERSON.id,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        await endEmployment(m.supabase, {
            orgId: ORG_ID,
            employmentId: first.id,
            endDate: "2026-06-30",
            todayYmd: TODAY,
        });

        const second = await createEmployment(m.supabase, {
            orgId: ORG_ID,
            personId: PERSON.id,
            startDate: "2026-09-01",
            supersedesEmploymentId: first.id,
            todayYmd: TODAY,
        });

        const all = await listEmploymentsForPerson(m.supabase, ORG_ID, PERSON.id);
        expect(all).toHaveLength(2);
        expect(all.find((e) => e.id === first.id)?.end_date).toBe("2026-06-30");
        expect(second.supersedes_employment_id).toBe(first.id);
    });

    it("refuses to amend ended employment — history is not editable", async () => {
        const m = mock();
        const created = await createEmployment(m.supabase, {
            orgId: ORG_ID,
            personId: PERSON.id,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        await endEmployment(m.supabase, {
            orgId: ORG_ID,
            employmentId: created.id,
            endDate: "2026-06-30",
            todayYmd: TODAY,
        });
        await expect(
            updateEmployment(m.supabase, {
                orgId: ORG_ID,
                employmentId: created.id,
                positionId: "pos-1",
                todayYmd: TODAY,
            })
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("rejects an unknown employment type rather than storing it", async () => {
        const m = mock();
        await expect(
            createEmployment(m.supabase, {
                orgId: ORG_ID,
                personId: PERSON.id,
                startDate: "2026-01-01",
                employmentType: "seasonal_intern",
                todayYmd: TODAY,
            })
        ).rejects.toMatchObject({ code: "invalid_input" });
    });
});

describe("eligibility authority", () => {
    it("delegates to person_is_employed_on rather than re-implementing the rule", async () => {
        const m = mock();
        const created = await createEmployment(m.supabase, {
            orgId: ORG_ID,
            personId: PERSON.id,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        await endEmployment(m.supabase, {
            orgId: ORG_ID,
            employmentId: created.id,
            endDate: "2026-06-30",
            todayYmd: TODAY,
        });

        expect(await isPersonEmployedOn(m.supabase, ORG_ID, PERSON.id, "2026-02-01")).toBe(true);
        expect(await isPersonEmployedOn(m.supabase, ORG_ID, PERSON.id, "2026-07-01")).toBe(false);
        expect(m.rpcCalls.map((c) => c.fn)).toEqual(["person_is_employed_on", "person_is_employed_on"]);
    });

    it("never treats persons.is_employee as employment", async () => {
        const m = createEmploymentMock({
            persons: [{ ...PERSON, is_employee: true }],
        });
        expect(await isPersonEmployedOn(m.supabase, ORG_ID, PERSON.id, TODAY)).toBe(false);
        expect(await getCurrentEmployment(m.supabase, ORG_ID, PERSON.id)).toBeNull();
    });
});

describe("configurable staff facts", () => {
    it("registers employment as a configurable field subject", () => {
        expect(EMPLOYMENT_ENTITY_TYPE).toBe("employment");
        expect(isFieldDefinitionEntityType("employment")).toBe(true);
    });

    it("protects native employment columns from being shadowed by a configured field", () => {
        expect(isReservedEmploymentFieldKey("employment_status")).toBe(true);
        expect(isReservedEmploymentFieldKey("start_date")).toBe(true);
        expect(isReservedEmploymentFieldKey("cpr_expires_on")).toBe(false);
    });

    it("persists and resolves a representative configured fact through the shared field system", async () => {
        // The label is a fixture. Nothing in the code branches on it — this is
        // the same path any tenant field takes for any industry.
        const m = mock({
            field_definitions: [
                {
                    id: "fd-cpr",
                    org_id: ORG_ID,
                    entity_type: "employment",
                    field_key: "cpr_expires_on",
                    label: "CPR expires",
                    field_type: "date",
                    section_key: "credentials",
                    sort_order: 10,
                    is_active: true,
                    is_visible_in_drawer: true,
                },
            ],
        });

        const employment = await createEmployment(m.supabase, {
            orgId: ORG_ID,
            personId: PERSON.id,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });

        await saveEmploymentConfiguredFacts(m.supabase, ORG_ID, employment.id, {
            cpr_expires_on: "2027-03-15",
        });

        // The value lands on field_values against the employment subject — not on
        // a staff-only table and not on the person.
        expect(m.store.field_values).toHaveLength(1);
        expect(m.store.field_values[0]).toMatchObject({
            entity_type: "employment",
            entity_id: employment.id,
            field_definition_id: "fd-cpr",
        });
        // Typed storage is the shared field system's, not ours: `date` lands in
        // value_date as a full ISO instant and is sliced back on display.
        expect(String(m.store.field_values[0].value_date)).toMatch(/^2027-03-15/);

        const facts = await loadEmploymentConfiguredFacts(m.supabase, ORG_ID, employment.id);
        expect(facts).toHaveLength(1);
        expect(facts[0]).toMatchObject({ field_key: "cpr_expires_on", label: "CPR expires" });
        expect(facts[0].display).toBe("2027-03-15");
    });
});

describe("Person → Employment composition", () => {
    it("reports never_employed rather than an empty staff card", async () => {
        const m = mock();
        const composition = await buildPersonEmploymentComposition(m.supabase, ORG_ID, PERSON.id);
        expect(composition).toMatchObject({
            is_staff: false,
            never_employed: true,
            current: null,
        });
        expect(composition.periods).toHaveLength(0);
    });

    it("answers capacity, place and since-when for active employment", async () => {
        const m = mock();
        await createEmployment(m.supabase, {
            orgId: ORG_ID,
            personId: PERSON.id,
            positionId: "pos-1",
            primaryLocationId: SITE_ID,
            employmentType: "full_time",
            startDate: "2026-01-05",
            todayYmd: TODAY,
        });

        const composition = await buildPersonEmploymentComposition(m.supabase, ORG_ID, PERSON.id);
        expect(composition.is_staff).toBe(true);
        expect(composition.current).toMatchObject({
            position_label: "Lead Teacher",
            primary_location_label: "Riverside",
            employment_type_label: "Full time",
            start_date: "2026-01-05",
            state_label: "Active",
            is_open: true,
        });
    });

    it("renders ended employment as history, not as active staff", async () => {
        const m = mock();
        const created = await createEmployment(m.supabase, {
            orgId: ORG_ID,
            personId: PERSON.id,
            positionId: "pos-1",
            startDate: "2026-01-05",
            todayYmd: TODAY,
        });
        await endEmployment(m.supabase, {
            orgId: ORG_ID,
            employmentId: created.id,
            endDate: "2026-06-30",
            todayYmd: TODAY,
        });

        const composition = await buildPersonEmploymentComposition(m.supabase, ORG_ID, PERSON.id);
        expect(composition.is_staff).toBe(false);
        expect(composition.never_employed).toBe(false);
        expect(composition.current).toBeNull();
        expect(composition.periods[0]).toMatchObject({
            is_open: false,
            state_label: "Ended Jun 30, 2026",
            end_date: "2026-06-30",
        });
    });
});
