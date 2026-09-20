/**
 * Staff & Workforce V2 · Slice 2 — Employment as a canonical Field System subject.
 *
 * WHAT THIS SLICE FOUND, AND WHY THESE TESTS LOOK LIKE THIS.
 *
 * Slice 2 was authorized on the premise that `entity_type='employment'` is
 * blocked by a Field System CHECK constraint. It is not, and never was:
 * `field_definitions.entity_type` and `field_values.entity_type` are plain text
 * with no CHECK, and employment is already present in the registry allowlist,
 * already reserved against native collisions, already read through
 * employmentConfiguredFacts and already written through the shared
 * upsertConfigurableFieldValues. The constraints that discovery attributed to
 * the Field System belong to `person_health_facts.subject_entity_type` and to an
 * announcements table.
 *
 * So these tests LOCK a contract that already holds rather than introducing one.
 * That is worth doing precisely because it already holds: nothing currently
 * fails if employment is dropped from the allowlist, or if the grain quietly
 * becomes the Person, and this slice exists to make those regressions loud.
 *
 * The one genuine gap Slice 2 closes is `badge_number`: Slice 1 added the column
 * and did not reserve the key.
 */

import { describe, expect, it } from "vitest";

import {
    EMPLOYMENT_ENTITY_TYPE,
    EMPLOYMENT_NATIVE_FIELD_KEYS,
    isReservedEmploymentFieldKey,
} from "@/lib/employment/employmentFieldRegistry";
import {
    FIELD_DEFINITION_ENTITY_TYPES,
    isFieldDefinitionEntityType,
} from "@/lib/fields/inquiryChildFieldRegistry";

describe("1. Employment is an accepted field-definition entity type", () => {
    it("is present in the canonical allowlist", () => {
        expect(FIELD_DEFINITION_ENTITY_TYPES).toContain(EMPLOYMENT_ENTITY_TYPE);
        expect(isFieldDefinitionEntityType("employment")).toBe(true);
    });

    it("accepts it case- and whitespace-insensitively, as the guard promises", () => {
        expect(isFieldDefinitionEntityType("EMPLOYMENT")).toBe(true);
        expect(isFieldDefinitionEntityType("  employment  ")).toBe(true);
    });

    it("still rejects an unsupported entity type", () => {
        for (const bad of ["staff", "employee", "qualification", "certification", "badge"]) {
            expect(isFieldDefinitionEntityType(bad)).toBe(false);
        }
    });

    it("leaves every previously supported entity type working", () => {
        for (const kept of [
            "person", "customer", "job", "opportunity", "vendor", "schedule",
            "location", "customer_member", "inquiry_child", "person_child_relationship",
        ]) {
            expect(isFieldDefinitionEntityType(kept)).toBe(true);
        }
    });
});

describe("2. native Employment facts cannot be shadowed by a configured field", () => {
    it("reserves every native employment column", () => {
        for (const key of EMPLOYMENT_NATIVE_FIELD_KEYS) {
            expect(isReservedEmploymentFieldKey(key)).toBe(true);
        }
    });

    it("reserves Employee Number", () => {
        expect(isReservedEmploymentFieldKey("external_employee_id")).toBe(true);
    });

    it("reserves Badge Number — the gap Slice 1 left open", () => {
        // Slice 1 added employments.badge_number without reserving the key, so a
        // custom `badge_number` field could have competed with the native one
        // while enforcing none of its org-uniqueness.
        expect(EMPLOYMENT_NATIVE_FIELD_KEYS).toContain("badge_number");
        expect(isReservedEmploymentFieldKey("badge_number")).toBe(true);
    });

    it("reserves the job-title relationship, which employment_positions owns", () => {
        expect(isReservedEmploymentFieldKey("position_id")).toBe(true);
    });

    it("matches a reserved key regardless of case or padding", () => {
        expect(isReservedEmploymentFieldKey("  Badge_Number ")).toBe(true);
        expect(isReservedEmploymentFieldKey("EXTERNAL_EMPLOYEE_ID")).toBe(true);
    });

    it("does not over-reserve — an ordinary tenant fact is still authorable", () => {
        for (const ok of ["shirt_size", "locker_number", "dietary_note", "parking_spot"]) {
            expect(isReservedEmploymentFieldKey(ok)).toBe(false);
        }
    });
});

describe("3. the grain is the Employment relationship, never the Person", () => {
    const readPath = () =>
        readFileSyncUtf8("lib/employment/employmentConfiguredFacts.ts");

    it("reads field values by employment id under the employment entity type", () => {
        const src = stripImports(readPath());
        expect(src).toMatch(/entity_type/);
        expect(src).toMatch(/EMPLOYMENT_ENTITY_TYPE/);
        // The subject id must be the employment row, not the person.
        expect(src).not.toMatch(/entity_id:\s*[a-zA-Z.]*person_?[Ii]d/);
    });

    it("uses the SHARED field-value writer, not an employment-specific engine", () => {
        const src = stripImports(readPath());
        expect(src).toMatch(/upsertConfigurableFieldValuesForEntity/);
    });

    it("introduces no employment-specific field storage anywhere", () => {
        // Strip prose first: the registry's own doctrine comment names these
        // tables precisely to say it does NOT create them, and an assertion that
        // trips on its own documentation measures nothing.
        const reg = stripComments(readFileSyncUtf8("lib/employment/employmentFieldRegistry.ts"));
        for (const forbidden of ["employment_custom_fields", "staff_custom_fields", "staff_fields"]) {
            expect(reg).not.toContain(forbidden);
        }
    });
});

describe("4. Slice 2 creates no qualification authority", () => {
    it("names no certification concept in the employment field registry", () => {
        const reg = stripImports(readFileSyncUtf8("lib/employment/employmentFieldRegistry.ts"))
            .replace(/\/\*\*[\s\S]*?\*\//g, ""); // doctrine prose may discuss them; code may not model them
        for (const concept of ["qualification", "certification_type", "expires_at", "verified_by"]) {
            expect(reg).not.toContain(concept);
        }
    });

    it("adds no qualification table to the migration set", () => {
        const { readdirSync } = require("node:fs") as typeof import("node:fs");
        const { resolve } = require("node:path") as typeof import("node:path");
        const files = readdirSync(resolve(__dirname, "../../../supabase/migrations"));
        // Scoped to STAFF qualification. `certification_reset_authority` predates
        // this workstream and is unrelated, so a broad regex would fail forever
        // on someone else's migration.
        const qual = files.filter((f) => /(staff|employment).*(qualification|certification)/i.test(f));
        expect(qual).toEqual([]);
    });
});

function readFileSyncUtf8(rel: string): string {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { resolve } = require("node:path") as typeof import("node:path");
    return readFileSync(resolve(__dirname, "../..", rel), "utf8") as string;
}
/** Comments may DISCUSS what the code must not do; only code should be asserted on. */
function stripComments(src: string): string {
    return src.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
/** Naming a symbol on an import line must never satisfy a source assertion. */
function stripImports(src: string): string {
    return src.replace(/^import[\s\S]*?;$/gm, "");
}
