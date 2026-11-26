/**
 * Staff & Workforce V2 · Slice 1 — Employment identifiers.
 *
 * Two operator-facing identifiers, both owned by Employment:
 *
 *   Employee Number   employments.external_employee_id
 *   Badge Number      employments.badge_number
 *
 * WHAT THESE TESTS CAN AND CANNOT PROVE. Uniqueness is a DATABASE invariant —
 * a partial unique index over (org_id, lower(btrim(value))). A fake Supabase
 * cannot reject a duplicate, so asserting "duplicate refused" against the mock
 * would be theatre: it would pass whether or not the index exists. So the mock
 * suite proves the things application code actually owns — normalization, null
 * semantics, separateness of the two namespaces, operator-safe conflict
 * translation, and that neither identifier touches access or credentials — and
 * the index itself is asserted structurally here and exercised for real in
 * employmentIdentifiers.db.test.ts plus the mounted QA.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { updateEmployment } from "@/lib/employment/employmentService";
import { EMPLOYMENT_SELECT_COLUMNS } from "@/lib/employment/employmentTypes";
import { EmploymentServiceError } from "@/lib/employment/employmentErrors";
import { ACCESS_TABLES, createEmploymentMock, ORG_ID } from "@/tests/employment/mockEmploymentSupabase";

const EMPLOYMENT_ID = "44444444-4444-4444-8444-444444444444";
const PERSON_ID = "55555555-5555-4555-8555-555555555555";
const TODAY = "2026-09-20";

function seeded() {
    return createEmploymentMock({
        persons: [{ id: PERSON_ID, org_id: ORG_ID, full_name: "Kelly Example" }],
        employments: [
            {
                id: EMPLOYMENT_ID,
                org_id: ORG_ID,
                person_id: PERSON_ID,
                employment_status: "active",
                employment_type: "full_time",
                position_id: null,
                primary_location_id: null,
                external_employee_id: null,
                badge_number: null,
                start_date: "2026-01-01",
                end_date: null,
                metadata: {},
            },
        ],
        person_kiosk_codes: [],
    });
}

const lastEmploymentPatch = (m: ReturnType<typeof seeded>) =>
    [...m.writes].reverse().find((w) => w.table === "employments" && w.op === "update")?.row ?? null;

async function update(m: ReturnType<typeof seeded>, fields: Record<string, unknown>) {
    return updateEmployment(m.supabase, {
        orgId: ORG_ID,
        employmentId: EMPLOYMENT_ID,
        actorUserId: null,
        todayYmd: TODAY,
        ...fields,
    } as never);
}

describe("1. the two identifiers are separate, Employment-owned values", () => {
    it("sets an Employee Number without touching Badge Number", async () => {
        const m = seeded();
        await update(m, { externalEmployeeId: "A-100" });
        const patch = lastEmploymentPatch(m);
        expect(patch?.external_employee_id).toBe("A-100");
        // The mock records the MERGED row, so "absent" is not assertable here.
        // What matters is that the other identifier was left as it was.
        expect(patch?.badge_number ?? null).toBeNull();
    });

    it("sets a Badge Number without touching Employee Number", async () => {
        const m = seeded();
        await update(m, { badgeNumber: "B-77" });
        const patch = lastEmploymentPatch(m);
        expect(patch?.badge_number).toBe("B-77");
        expect(patch?.external_employee_id ?? null).toBeNull();
    });

    it("carries both, holding different values, in one update", async () => {
        const m = seeded();
        await update(m, { externalEmployeeId: "A-100", badgeNumber: "B-77" });
        const patch = lastEmploymentPatch(m);
        expect(patch?.external_employee_id).toBe("A-100");
        expect(patch?.badge_number).toBe("B-77");
    });

    it("permits the same string in both namespaces — they are separate indexes", async () => {
        const m = seeded();
        await update(m, { externalEmployeeId: "SAME-1", badgeNumber: "SAME-1" });
        const patch = lastEmploymentPatch(m);
        expect(patch?.external_employee_id).toBe("SAME-1");
        expect(patch?.badge_number).toBe("SAME-1");
    });
});

describe("2. null and blank semantics", () => {
    it("clears an Employee Number to NULL rather than empty string", async () => {
        const m = seeded();
        await update(m, { externalEmployeeId: null });
        expect(lastEmploymentPatch(m)?.external_employee_id).toBeNull();
    });

    it("clears a Badge Number to NULL rather than empty string", async () => {
        const m = seeded();
        await update(m, { badgeNumber: null });
        expect(lastEmploymentPatch(m)?.badge_number).toBeNull();
    });

    it("a whitespace-only identifier cannot become a meaningful value", async () => {
        const m = seeded();
        await update(m, { externalEmployeeId: "   ", badgeNumber: "\t \n" });
        const patch = lastEmploymentPatch(m);
        expect(patch?.external_employee_id).toBeNull();
        expect(patch?.badge_number).toBeNull();
    });

    it("trims surrounding whitespace so stored and compared values agree", async () => {
        const m = seeded();
        await update(m, { externalEmployeeId: "  A-100  ", badgeNumber: "  B-77  " });
        const patch = lastEmploymentPatch(m);
        expect(patch?.external_employee_id).toBe("A-100");
        expect(patch?.badge_number).toBe("B-77");
    });
});

describe("3. a collision reaches the operator as a sentence, not a constraint name", () => {
    function failingSupabase(constraint: string) {
        const row = {
            id: EMPLOYMENT_ID,
            org_id: ORG_ID,
            person_id: PERSON_ID,
            employment_status: "active",
            start_date: "2026-01-01",
            end_date: null,
        };
        const result = {
            message: `duplicate key value violates unique constraint "${constraint}"`,
        };
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        Object.assign(builder, {
            select: chain,
            eq: chain,
            order: chain,
            limit: chain,
            update: chain,
            maybeSingle: async () => ({ data: row, error: null }),
            single: async () => ({ data: null, error: result }),
            then: (res: (v: unknown) => unknown) => res({ data: null, error: result }),
        });
        return { from: () => builder } as never;
    }

    it("an Employee Number collision is a conflict naming the field and the comparison", async () => {
        const err = await updateEmployment(failingSupabase("employments_org_employee_number_unique"), {
            orgId: ORG_ID,
            employmentId: EMPLOYMENT_ID,
            externalEmployeeId: "A-100",
            actorUserId: null,
            todayYmd: TODAY,
        } as never).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(EmploymentServiceError);
        const e = err as EmploymentServiceError;
        expect(e.code).toBe("conflict");
        expect(e.message).toContain("Employee Number");
        expect(e.message).toMatch(/capitalization|spaces/i);
        expect(e.message).not.toMatch(/duplicate key|unique constraint|employments_org/i);
    });

    it("a Badge Number collision names Badge Number, not Employee Number", async () => {
        const err = await updateEmployment(failingSupabase("employments_org_badge_number_unique"), {
            orgId: ORG_ID,
            employmentId: EMPLOYMENT_ID,
            badgeNumber: "B-77",
            actorUserId: null,
            todayYmd: TODAY,
        } as never).catch((e: unknown) => e);

        const e = err as EmploymentServiceError;
        expect(e.code).toBe("conflict");
        expect(e.message).toContain("Badge Number");
        expect(e.message).not.toContain("Employee Number");
        expect(e.message).not.toMatch(/duplicate key|unique constraint/i);
    });
});

describe("4. an identifier is not access, and not a credential", () => {
    it("writes no access/RBAC table when either identifier changes", async () => {
        const m = seeded();
        await update(m, { externalEmployeeId: "A-100", badgeNumber: "B-77" });
        const touched = m.writes.map((w) => w.table);
        for (const t of ACCESS_TABLES) expect(touched).not.toContain(t);
    });

    it("writes no kiosk credential when a Badge Number is set", async () => {
        const m = seeded();
        await update(m, { badgeNumber: "B-77" });
        expect(m.writes.map((w) => w.table)).not.toContain("person_kiosk_codes");
        expect(m.store.person_kiosk_codes).toEqual([]);
    });

    it("writes no person row — identity stays Person-owned", async () => {
        const m = seeded();
        await update(m, { externalEmployeeId: "A-100" });
        expect(m.writes.map((w) => w.table)).not.toContain("persons");
    });

    it("writes no assignment or schedule row — identity is not placement", async () => {
        const m = seeded();
        await update(m, { externalEmployeeId: "A-100", badgeNumber: "B-77" });
        const touched = m.writes.map((w) => w.table);
        expect(touched).not.toContain("schedule_assignments");
        expect(touched).not.toContain("schedule_patterns");
    });
});

describe("5. authoritative reads carry both identifiers", () => {
    it("the canonical employment projection selects both columns", () => {
        expect(EMPLOYMENT_SELECT_COLUMNS).toContain("external_employee_id");
        expect(EMPLOYMENT_SELECT_COLUMNS).toContain("badge_number");
    });
});

describe("6. the database owns uniqueness, and says so in the right shape", () => {
    const migration = () =>
        readFileSync(
            resolve(__dirname, "../../../supabase/migrations/20260925120000_employment_identifiers_v1.sql"),
            "utf8"
        );

    it("scopes each unique index to the organization", () => {
        const src = migration();
        expect(src).toMatch(/employments_org_employee_number_unique[\s\S]{0,140}\(org_id, lower\(btrim\(external_employee_id\)\)\)/);
        expect(src).toMatch(/employments_org_badge_number_unique[\s\S]{0,140}\(org_id, lower\(btrim\(badge_number\)\)\)/);
    });

    it("applies only to populated values, so unset employments never collide", () => {
        const src = migration();
        expect(src).toMatch(/WHERE external_employee_id IS NOT NULL[\s\S]{0,80}length\(btrim\(external_employee_id\)\) > 0/);
        expect(src).toMatch(/WHERE badge_number IS NOT NULL[\s\S]{0,80}length\(btrim\(badge_number\)\) > 0/);
    });

    it("keeps the physical column name — the slice relabels, it does not rename", () => {
        const src = migration();
        expect(src).not.toMatch(/RENAME COLUMN/i);
        expect(src).not.toMatch(/DROP COLUMN/i);
    });
});

describe("7. operator copy says Employee Number and Badge Number", () => {
    const card = () =>
        readFileSync(
            resolve(__dirname, "../../components/admin/focusPanel/cards/EmploymentCard.tsx"),
            "utf8"
        ).replace(/\{\/\*[\s\S]*?\*\/\}/g, ""); // strip comments: prose must not satisfy the assertion

    it("labels both identifiers in the operator's words", () => {
        const src = card();
        expect(src).toContain('label="Employee Number"');
        expect(src).toContain('label="Badge Number"');
    });

    it("never shows the physical column name or the old label to an operator", () => {
        const src = card();
        expect(src).not.toContain('label="Employee ID"');
        expect(src).not.toMatch(/label="[^"]*external_employee_id/);
    });

    it("does not present a badge as a PIN, passcode or login", () => {
        const src = card();
        expect(src).not.toMatch(/label="[^"]*(PIN|Passcode|Password|Login)/i);
    });
});
