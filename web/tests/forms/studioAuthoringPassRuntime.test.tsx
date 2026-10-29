import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import { setFieldCalculation, structureAddressAt } from "@/lib/forms/formBuilderSchema";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { dbStoreFormDraftPreview } from "@/lib/pos/processingCase/formDraft/formDraftPreviewDb";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/**
 * What the FAMILY sees of the Studio's authoring decisions, and what a re-import may not take away.
 */

const base = (): FormSchemaV1 =>
    ({
        schema_version: 1,
        title: "Admissions",
        sections: [
            { id: "s1", title: "Child", field_ids: ["dob", "start", "age"] },
            { id: "s2", title: "Home", field_ids: ["line1", "city", "state", "zip"] },
        ],
        fields: [
            { id: "dob", type: "date", label: "Child date of birth", required: true },
            { id: "start", type: "date", label: "Enrollment start date", required: true },
            { id: "age", type: "text", label: "Student Age Upon Enrolling", required: false },
            { id: "line1", type: "text", label: "Home address line 1", required: true, field_source: { entity_type: "person", field_key: "address_line1" } },
            { id: "city", type: "text", label: "City", required: true, layout_width: "half", field_source: { entity_type: "person", field_key: "city" } },
            { id: "state", type: "text", label: "State", required: true, layout_width: "quarter", field_source: { entity_type: "person", field_key: "state" } },
            { id: "zip", type: "text", label: "ZIP", required: true, layout_width: "quarter", field_source: { entity_type: "person", field_key: "postal_code" } },
        ],
    }) as unknown as FormSchemaV1;

const render = (schema: FormSchemaV1, values: Record<string, unknown>) =>
    renderToStaticMarkup(<FormEngineRenderer schema={schema} payload={{ values }} onChange={() => {}} mode="edit" />);

describe("a calculated answer is shown to the family, never asked", () => {
    const calculated = () => setFieldCalculation(base(), "age", { kind: "age_from_date_of_birth", source_key: "dob", as_of_key: "start" });

    it("renders read-only with the age once both dates are answered", () => {
        const html = render(calculated(), { dob: "2022-03-01", start: "2026-09-01" });
        expect(html).toContain('data-form-field-calculated="age"');
        expect(html).toMatch(/4 (yrs|years)/);
        expect(html).toContain("Calculated automatically.");
        // No input the family could type into for that question.
        const ageBlock = html.slice(html.indexOf('data-form-field-calculated="age"'));
        expect(ageBlock.slice(0, ageBlock.indexOf("Calculated automatically."))).not.toContain("<input");
    });

    it("says it is waiting for its dates rather than guessing", () => {
        const html = render(calculated(), { dob: "2022-03-01" });
        expect(html).toContain("Calculated once the dates it depends on are answered.");
    });

    it("an uncalculated question is still an ordinary input (no regression)", () => {
        const html = render(base(), {});
        expect(html).not.toContain("data-form-field-calculated");
    });
});

describe("the family sees the rows Forms Studio shows", () => {
    it("City | State | ZIP share one 12-column row, sized half / quarter / quarter", () => {
        const html = render(base(), {});
        expect(html).toContain("@md:grid-cols-12");
        expect(html.match(/@md:col-span-6/g)?.length).toBeGreaterThanOrEqual(1);
        expect(html.match(/@md:col-span-3/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it("an address group's lines keep their widths inside the group", () => {
        const grouped = structureAddressAt(base(), "line1");
        const group = grouped.fields.find((f) => f.type === "group")!;
        // The runtime seeds a group's first entry (payloadWithMinimumRepeatingGroups); do the same here.
        const html = renderToStaticMarkup(
            <FormEngineRenderer
                schema={grouped}
                payload={{ values: {}, groups: { [group.id]: [{ instance_key: "a", values: {}, signatures: {}, groups: {} }] } }}
                onChange={() => {}}
                mode="edit"
            />,
        );
        expect(html).toContain("@md:grid-cols-12");
        expect(html.match(/@md:col-span-3/g)?.length).toBeGreaterThanOrEqual(2);
    });
});

describe("a re-import never overwrites the Studio's saved form", () => {
    function fakeDb(prior: Record<string, unknown>) {
        const written: Record<string, unknown>[] = [];
        const chain = (result: unknown) => {
            const b: Record<string, unknown> = {
                select: () => b,
                eq: () => b,
                maybeSingle: async () => result,
                then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
            };
            return b;
        };
        const client = {
            from: () => ({
                select: () => chain({ data: { metadata: prior }, error: null }),
                update: (patch: Record<string, unknown>) => {
                    written.push(patch);
                    return chain(null);
                },
            }),
        };
        return { client: client as never, written };
    }

    const studio = { ...base(), title: "Operator's form" } as FormSchemaV1;
    const fresh = { title: "Re-detected", fields: [], sections: [], warnings: [], generated_at: "2026-10-14T13:00:00.000Z" } as unknown as StoredFormDraftPreview;

    it("a fresh importer draft keeps the saved studio_schema and its timestamp", async () => {
        const { client, written } = fakeDb({ form_draft_preview: { title: "Old", studio_schema: studio, studio_schema_saved_at: "2026-10-14T12:30:00.000Z" } });
        const stored = await dbStoreFormDraftPreview(client, { orgId: "o", caseId: "c", draft: fresh });
        expect(stored.title).toBe("Re-detected");
        expect(stored.studio_schema?.title).toBe("Operator's form");
        expect(stored.studio_schema_saved_at).toBe("2026-10-14T12:30:00.000Z");
        expect((written[0]!.metadata as { form_draft_preview: StoredFormDraftPreview }).form_draft_preview.studio_schema?.title).toBe("Operator's form");
    });

    it("an explicit Studio save still replaces it", async () => {
        const { client } = fakeDb({ form_draft_preview: { studio_schema: studio } });
        const next = { ...base(), title: "Newer" } as FormSchemaV1;
        const stored = await dbStoreFormDraftPreview(client, { orgId: "o", caseId: "c", draft: { ...fresh, studio_schema: next } });
        expect(stored.studio_schema?.title).toBe("Newer");
    });

    it("a draft with no Studio schema before stays without one", async () => {
        const { client } = fakeDb({});
        const stored = await dbStoreFormDraftPreview(client, { orgId: "o", caseId: "c", draft: fresh });
        expect(stored.studio_schema).toBeUndefined();
    });
});

void vi;
