/**
 * A SIBLING'S HOUSEHOLD ANSWERS ARE OFFERED — CONFIRMED HERE, NEVER ASSUMED, NEVER A CHILD'S FACT.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateFormSchema } from "@/lib/forms/schema";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import {
    canonicalValuesWithHouseholdProvisional,
    isSharedHouseholdKey,
    readHouseholdProvisionalAnswers,
} from "@/lib/enrollment/family/householdProvisionalAnswers";

const SCHEMA = validateFormSchema(JSON.parse(readFileSync(resolve(__dirname, "../../forms/__fixtures_admissions_v12_published.json"), "utf8")));
const pinned = { requirement_id: "r", form_definition_id: "f", form_definition_version_id: "v", session_item_id: "i", schema: SCHEMA };
const needs = (canonicalValues: Record<string, unknown>, sharedValues: Record<string, unknown> = {}) =>
    projectEnrollmentInformationNeeds({ forms: [pinned], subjectId: "ava", sharedValues, confirmations: {}, canonicalValues });

describe("which answers may cross between siblings", () => {
    it.each([
        ["customer:address", true],
        ["household:primary_language", true],
        ["guardian:phone", true],
        ["guardian_email", true],
        ["customer_member:date_of_birth", false],
        ["process:form:untitled_long_text_4", false],
        ["person:address_line1", true],
        ["child_first_name", false],
        ["start_date", false],
    ])("%s → %s", (key, shared) => expect(isSharedHouseholdKey(key)).toBe(shared));
});

describe("the need projection offers a sibling's household answer for confirmation", () => {
    const household = needs({}).find((n) => n.identity.shared_value_key && isSharedHouseholdKey(n.identity.shared_value_key))!;
    const childFact = needs({}).find((n) => (n.identity.shared_value_key ?? "").startsWith("customer_member:"));
    const key = household.identity.shared_value_key!;
    const find = (list: ReturnType<typeof needs>) => list.find((n) => n.identity.key === household.identity.key)!;

    it("used only when nothing better exists, and always requires confirmation", () => {
        const n = find(needs(canonicalValuesWithHouseholdProvisional({}, { [key]: "12 Sibling Street" })));
        expect(n.value_source).toBe("household_provisional");
        expect(n.current_value).toBe("12 Sibling Street");
        expect(n.state).toBe("known_requires_confirmation");
    });

    it("the canonical record wins over a sibling's answer", () => {
        const n = find(needs(canonicalValuesWithHouseholdProvisional({ [key]: "1 Record Road" }, { [key]: "12 Sibling Street" })));
        expect(n.value_source).toBe("canonical_prefill");
        expect(n.current_value).toBe("1 Record Road");
    });

    it("this child's own answer wins over both", () => {
        const sessionKey = household.identity.session_value_key!;
        const n = find(needs(canonicalValuesWithHouseholdProvisional({}, { [key]: "12 Sibling Street" }), { [sessionKey]: "Own Answer Ave" }));
        expect(n.value_source).toBe("session_shared_value");
    });

    it("a child-scoped fact is never filled from a sibling", () => {
        if (!childFact) return;
        const ck = childFact.identity.shared_value_key!;
        const n = needs(canonicalValuesWithHouseholdProvisional({}, { [ck]: "2020-01-01" })).find((x) => x.identity.key === childFact.identity.key)!;
        expect(n.value_source).not.toBe("household_provisional");
    });
});

describe("reading a household's sibling answers", () => {
    type Row = Record<string, unknown>;
    const db = (tables: Record<string, Row[]>) => ({
        from(table: string) {
            let rows = [...(tables[table] ?? [])];
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return api; },
                insert: () => { throw new Error("WROTE"); },
                update: () => { throw new Error("WROTE"); },
                then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
            };
            return api;
        },
    }) as never;

    const tables = () => ({
        customer_members: [
            { id: "ava", org_id: "o", customer_id: "h1" },
            { id: "ben", org_id: "o", customer_id: "h1" },
            { id: "zed", org_id: "o", customer_id: "h2" },
        ],
        process_instances: [
            { id: "pi-ava", org_id: "o", subject_id: "ava", subject_type: "child", process_key: "enrollment" },
            { id: "pi-ben", org_id: "o", subject_id: "ben", subject_type: "child", process_key: "enrollment" },
            { id: "pi-ben-other", org_id: "o", subject_id: "ben", subject_type: "child", process_key: "staff_onboarding" },
            { id: "pi-zed", org_id: "o", subject_id: "zed", subject_type: "child", process_key: "enrollment" },
        ],
        form_packet_sessions: [
            { org_id: "o", process_instance_id: "pi-ava", updated_at: "2026-10-03", shared_values: { "customer:address": "OWN — must not be offered back" } },
            { org_id: "o", process_instance_id: "pi-ben", updated_at: "2026-10-02", shared_values: { "customer:address": "12 Sibling Street", "customer_member:allergies": "peanuts", "process:f:x": "y" } },
            { org_id: "o", process_instance_id: "pi-ben", updated_at: "2026-10-01", shared_values: { "customer:address": "older", "guardian:phone": "555" } },
            { org_id: "o", process_instance_id: "pi-ben-other", updated_at: "2026-10-05", shared_values: { "customer:address": "other process" } },
            { org_id: "o", process_instance_id: "pi-zed", updated_at: "2026-10-05", shared_values: { "customer:address": "another household" } },
        ],
    });

    it("household facts from the household's OTHER Enrollment journeys only, newest first", async () => {
        const got = await readHouseholdProvisionalAnswers(db(tables()), { orgId: "o", customerId: "h1", processInstanceId: "pi-ava" });
        expect(got).toEqual({ "customer:address": "12 Sibling Street", "guardian:phone": "555" });
    });
});
