/**
 * The participant review reads collections and calculated values the way the Form does.
 *
 *  - A people collection is outstanding until it has enough COMPLETE members (the submit validator's
 *    own count), and says how many it has against how many it needs.
 *  - A calculated value is never the participant's work: it is resolved, or it waits on the answer it
 *    is calculated from.
 */
import { describe, expect, it } from "vitest";

import { compileParticipantArtifact } from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";
import { relationshipCollectionGroupField } from "@/lib/forms/relationshipCollectionGroup";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

const group = { ...(relationshipCollectionGroupField("emergency_contacts", "ec") as FormField), repeat: { min: 2 } } as FormField;
const dob = { id: "dob", type: "date", label: "Date of birth", required: true } as FormField;
const start = { id: "start", type: "date", label: "Start date", required: true } as FormField;
const age = {
    id: "age",
    type: "text",
    label: "Age at entry",
    required: false,
    derived: { kind: "age_from_date_of_birth", source_key: "dob", as_of_key: "start" },
} as unknown as FormField;

const schema = { schema_version: 1, title: "QA", sections: [], fields: [dob, start, age, group] } as unknown as FormSchemaV1;
const contact = (i: number) => ({ instance_key: `r${i}`, values: { ec__full_name: `Contact ${i}`, ec__phone: "5415550100" } });
const blank = (i: number) => ({ instance_key: `r${i}`, values: {} });

const control = (a: ReturnType<typeof compileParticipantArtifact>, id: string) =>
    a.sections.flatMap((s) => s.controls).find((c) => c.field_id === id)!;

describe("a calculated value is placed, not asked", () => {
    it("shows the resolved age and never lists it as outstanding", () => {
        const a = compileParticipantArtifact(schema, { dob: "2021-03-04", start: "2026-09-01" }, undefined, { ec: [contact(1), contact(2)] });
        expect(control(a, "age").kind).toBe("display_content");
        expect(control(a, "age").content).toBe("Age at entry: 5 yrs 5 mos (calculated)");
        expect(a.outstanding.map((c) => c.field_id)).not.toContain("age");
    });
    it("names what it waits for when the date of birth is still missing — and the date of birth is the work", () => {
        const a = compileParticipantArtifact(schema, { start: "2026-09-01" }, undefined, {});
        expect(control(a, "age").content).toBe("Age at entry is calculated from Date of birth and Start date.");
        expect(a.outstanding.map((c) => c.field_id)).toEqual(expect.arrayContaining(["dob"]));
        expect(a.outstanding.map((c) => c.field_id)).not.toContain("age");
    });
});

describe("a people collection is satisfied by complete members", () => {
    it("stays outstanding with one complete member and a blank row, and says so", () => {
        const a = compileParticipantArtifact(schema, { dob: "2021-03-04", start: "2026-09-01" }, undefined, { ec: [contact(1), blank(2)] });
        expect(a.outstanding.map((c) => c.field_id)).toContain("ec");
        expect(control(a, "ec").value).toEqual({ complete: 1, needed: 2 });
    });
    it("leaves the outstanding list once two members are complete, and stays editable", () => {
        const a = compileParticipantArtifact(schema, { dob: "2021-03-04", start: "2026-09-01" }, undefined, { ec: [contact(1), contact(2)] });
        expect(a.outstanding.map((c) => c.field_id)).not.toContain("ec");
        expect(control(a, "ec").kind).toBe("unresolved_artifact_specific");
        expect(control(a, "ec").value).toEqual({ complete: 2, needed: 2 });
    });
    it("without the rows, reports the group as outstanding exactly as before", () => {
        const a = compileParticipantArtifact(schema, { dob: "2021-03-04", start: "2026-09-01" });
        expect(a.outstanding.map((c) => c.field_id)).toContain("ec");
        expect(control(a, "ec").value).toBeNull();
    });
});
