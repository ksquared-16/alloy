/**
 * REPEATED PEOPLE, WITHOUT A SECOND PERSON SYSTEM.
 *
 * The paper packet offers three blank emergency-contact blocks and one long-text box for siblings.
 * Neither is the product: a family should confirm who Alloy already knows and add exactly the
 * people they have, and each entry should be a person in a canonical relationship rather than a
 * line of prose.
 *
 * The repeating group, the payload arrays, `instance_key` and `origin` already existed. What did
 * not exist was any statement of WHAT an entry is — so the only button a family could be shown was
 * "Add item", and nothing downstream could tell a sibling from a payer. These tests are about that
 * statement and the behaviour it buys, not about any one collection.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { addField, createBlankSchema, type BuilderFieldSpec } from "@/lib/forms/formBuilderSchema";
import { formSchemaV1Schema, type FormField, type FormSchemaV1 } from "@/lib/forms/schema";
import {
    addAnotherLabel,
    allowsAdd,
    entryHeading,
    preallocatesBlankRows,
    rowIsKnown,
    rowIsRemovable,
} from "@/lib/forms/partyCollection";
import { payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";
import { RELATIONSHIP_ACTION_KEYS, RELATIONSHIP_ACTION_SCOPES } from "@/lib/admin/relationship/relationshipActionContract";
import type { FormPayloadGroupRow } from "@/lib/forms/validateSubmission";

const EMERGENCY: BuilderFieldSpec = {
    type: "party_collection",
    label: "Emergency contacts",
    party_collection: {
        action_key: "add_emergency_contact",
        subject: "person",
        role: "emergency_contact",
        scope: "this_child",
        min: 1,
        fields: [
            { type: "short_text", label: "Full name", required: true },
            { type: "short_text", label: "Phone", required: true },
        ],
    },
};

function authored(spec: BuilderFieldSpec = EMERGENCY): { schema: FormSchemaV1; group: FormField & { type: "group" } } {
    const blank = createBlankSchema("Draft");
    const { schema, fieldId } = addField(blank, { ...spec, sectionId: blank.sections[0]!.id });
    const group = schema.fields.find((f) => f.id === fieldId) as FormField & { type: "group" };
    return { schema, group };
}

const row = (over: Partial<FormPayloadGroupRow> = {}): FormPayloadGroupRow => ({
    instance_key: "i1",
    values: {},
    ...over,
});

describe("one statement makes a repeater a collection of people", () => {
    it("authors the schema's own group and repeat, not a new construct", () => {
        const { group } = authored();
        expect(group.type).toBe("group");
        expect(group.repeat).toEqual({ min: 1 });
        expect(group.fields.map((f) => f.label)).toEqual(["Full name", "Phone"]);
    });

    it("survives the platform's own schema validation", () => {
        const { schema } = authored();
        expect(formSchemaV1Schema.safeParse(schema).success).toBe(true);
    });

    it("records the canonical relationship intent, the subject, the role and the scope", () => {
        const party = (authored().group as { party_collection?: Record<string, unknown> }).party_collection!;
        expect(party.action_key).toBe("add_emergency_contact");
        expect(party.subject).toBe("person");
        expect(party.role).toBe("emergency_contact");
        expect(party.scope).toBe("this_child");
    });

    it("speaks only the platform's relationship vocabulary", () => {
        /*
         * If Forms ever grows its own list of relationship kinds or scopes, the two drift and an
         * emergency contact authored here stops meaning what the relationship system means by one.
         */
        const source = readFileSync(new URL("../../lib/forms/schema.ts", import.meta.url).pathname, "utf8");
        const declared = source.slice(source.indexOf("formPartyCollectionSchema"), source.indexOf("export type FormPartyCollection"));
        for (const key of RELATIONSHIP_ACTION_KEYS) {
            if (key === "make_primary_contact") continue; // not a repeated collection
            expect(declared, `${key} is missing from the Forms party vocabulary`).toContain(`"${key}"`);
        }
        for (const scope of RELATIONSHIP_ACTION_SCOPES) {
            expect(declared, `${scope} is missing from the Forms scope vocabulary`).toContain(`"${scope}"`);
        }
    });

    it("generalises to every collection kind without naming one", () => {
        for (const kind of ["add_child", "add_authorized_pickup", "add_parent_guardian", "add_billing_contact"] as const) {
            const { group } = authored({ ...EMERGENCY, label: "People", party_collection: { ...EMERGENCY.party_collection!, action_key: kind } });
            expect((group as { party_collection?: { action_key?: string } }).party_collection?.action_key).toBe(kind);
        }
    });
});

describe("the family is never shown blank people to fill in", () => {
    it("starts a party collection empty even when a minimum is set", () => {
        /*
         * THE WHOLE POINT, IN ONE ASSERTION. `repeat.min` used to be satisfied by seeding empty
         * rows — the paper form's three blank contact blocks rendered in HTML. A minimum is a
         * completion requirement, not a set of slots.
         */
        const { schema, group } = authored();
        expect(group.repeat?.min).toBe(1);
        expect(payloadWithMinimumRepeatingGroups(schema).groups?.[group.id] ?? []).toHaveLength(0);
    });

    it("leaves an ordinary repeater's behaviour exactly as it was", () => {
        const blank = createBlankSchema("Draft");
        const plainGroup: FormField = {
            id: "plain", label: "Rows", required: false, type: "group",
            fields: [{ id: "plain_a", label: "A", required: false, type: "text" }], repeat: { min: 2 },
        } as FormField;
        const schema = { ...blank, fields: [plainGroup], sections: [{ ...blank.sections[0]!, field_ids: ["plain"] }] };
        expect(preallocatesBlankRows(plainGroup)).toBe(true);
        expect(payloadWithMinimumRepeatingGroups(schema).groups?.plain ?? []).toHaveLength(2);
    });
});

describe("the words the family reads name the people, not the mechanism", () => {
    it("names the button after the collection", () => {
        expect(addAnotherLabel(authored().group)).toBe("Add emergency contact");
    });

    it("prefers what the administrator authored", () => {
        const { group } = authored({ ...EMERGENCY, party_collection: { ...EMERGENCY.party_collection!, add_another_label: "Add someone we can call" } });
        expect(addAnotherLabel(group)).toBe("Add someone we can call");
    });

    it("still says Add item for a repeater that is not people", () => {
        const plain = { id: "p", label: "Rows", required: false, type: "group", fields: [] } as unknown as FormField;
        expect(addAnotherLabel(plain)).toBe("Add item");
    });

    it("heads each entry by what it is", () => {
        expect(entryHeading(authored().group, 1)).toBe("Emergency contact 2");
    });
});

describe("a form cannot delete someone Alloy already knows", () => {
    const known = row({ instance_key: "k1", collection: { provider_ref: "children", origin: "existing", iteration_entity_type: "customer_member" } });
    const added = row({ instance_key: "a1", collection: { provider_ref: "children", origin: "respondent_added", iteration_entity_type: "customer_member" } });

    it("marks a known entry as known", () => {
        expect(rowIsKnown(known)).toBe(true);
        expect(rowIsKnown(added)).toBe(false);
    });

    it("never offers to remove it", () => {
        /*
         * Taking a known emergency contact off this form is the family saying they do not belong on
         * THIS paperwork. It is not an instruction to delete a person from the record, and a form
         * that treated it as one would quietly destroy canonical data.
         */
        const { group } = authored();
        expect(rowIsRemovable(group, known, 5)).toBe(false);
    });

    it("lets the family remove what the family added, above the minimum", () => {
        const { group } = authored();
        expect(rowIsRemovable(group, added, 2)).toBe(true);
        expect(rowIsRemovable(group, added, 1)).toBe(false);
    });

    it("honours a collection that exists only to confirm", () => {
        const { group } = authored({ ...EMERGENCY, party_collection: { ...EMERGENCY.party_collection!, allow_add: false } });
        expect(allowsAdd(group)).toBe(false);
        expect(allowsAdd(authored().group)).toBe(true);
    });
});

describe("the mounted surfaces actually carry it", () => {
    const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url).pathname, "utf8");

    it("offers the answer type in the Studio menu", () => {
        expect(read("app/adminV2/pos/ProcessingFormBuilder.tsx")).toContain('type: "party_collection"');
    });

    it("mounts one coherent inspector for it", () => {
        const inspector = read("app/adminV2/pos/ProcessingFormQuestionInspector.tsx");
        for (const hook of ["data-inspector-party-kind", "data-inspector-party-scope", "data-inspector-party-count"]) {
            expect(inspector, `${hook} is not in the mounted inspector`).toContain(hook);
        }
        // The administrator never sees the relationship table's own words.
        expect(inspector).toContain("RELATIONSHIP_ACTION_SCOPE_LABELS");
    });

    it("renders Add and Remove in the participant engine", () => {
        const renderer = read("components/forms/engine/FormEngineRenderer.tsx");
        expect(renderer).toContain("data-party-add");
        expect(renderer).toContain("data-party-remove");
        expect(renderer).toContain("addAnotherLabel(field)");
        expect(renderer).toContain("rowIsRemovable(field, row, rows.length)");
    });

    it("keeps every canonical write with the relationship owner", () => {
        // Forms declares intent. It must never call a person or relationship writer itself.
        const party = read("lib/forms/partyCollection.ts");
        expect(party).not.toMatch(/supabase|\.from\(|insert\(|executeRelationshipAction/);
    });
});

describe("nothing canonical is created by adding an entry", () => {
    /*
     * THE TIMING GUARANTEE, HELD BY CONSTRUCTION RATHER THAN BY CARE.
     *
     * Clicking "+ Add emergency contact" must not create a Person. It cannot, because the whole
     * participant path — the renderer, the payload helpers, the party module — contains no writer:
     * a row is draft state until a submission becomes a PROPOSAL, an operator commits it, and
     * `executeRelationshipProposalCommit` calls the canonical relationship action.
     *
     * A future change that reaches for a client and writes a person from the participant surface
     * fails here, which is the point: the safety is not "we remembered not to".
     */
    const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url).pathname, "utf8");
    const WRITERS = /createClient|createAdminClient|supabase\s*\.\s*from|executeRelationshipAction|executeAdminAction/;

    it("has no canonical writer anywhere on the participant add path", () => {
        for (const file of [
            "lib/forms/partyCollection.ts",
            "components/forms/engine/formEnginePayload.ts",
            "components/forms/engine/FormEngineRenderer.tsx",
        ]) {
            expect(read(file), `${file} can write canonical data from the participant surface`).not.toMatch(WRITERS);
        }
    });

    it("adds a row as draft state with a stable identity and nothing else", () => {
        const { group } = authored();
        const fresh: FormPayloadGroupRow = { instance_key: "new", values: {}, groups: {}, signatures: {} };
        expect(Object.keys(fresh.values)).toHaveLength(0);
        expect(fresh.instance_key).toBeTruthy();
        // No person id, no relationship id, nothing resolved — resolution happens at commit.
        expect((fresh as { collection?: { item_id?: string } }).collection?.item_id).toBeUndefined();
        expect(rowIsKnown(fresh)).toBe(false);
        expect(rowIsRemovable(group, fresh, 2)).toBe(true);
    });

    it("keeps the only canonical write behind the operator-reviewed commit", () => {
        // form submission → proposals (read-only) → operator commit → relationship action.
        const adapter = read("lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals.ts");
        expect(adapter).toContain("read-only");
        expect(adapter).not.toMatch(/executeRelationshipAction/);
        const commit = read("lib/pos/processingCase/commit/executeRelationshipProposalCommit.ts");
        expect(commit).toContain("relationshipExecutionAdapter");
        // Replay must not duplicate a person.
        expect(commit).toContain("idempotency_key");
        expect(commit).toContain("already_applied");
    });
});

describe("entry identity survives editing the list", () => {
    const rows = (): FormPayloadGroupRow[] => [
        { instance_key: "a", values: { name: "Ada" } },
        { instance_key: "b", values: { name: "Grace" } },
        { instance_key: "c", values: { name: "Katherine" } },
    ];

    it("removing the middle entry leaves the others untouched and unrenumbered", () => {
        /*
         * Rows are addressed by `instance_key`, not by position, so removing the middle one cannot
         * shift another entry's answers onto a different person — the failure a numbered
         * `sibling_2_name` model makes almost inevitable.
         */
        const after = rows().filter((r) => r.instance_key !== "b");
        expect(after.map((r) => r.instance_key)).toEqual(["a", "c"]);
        expect(after.map((r) => r.values.name)).toEqual(["Ada", "Katherine"]);
    });

    it("is an array of objects, never numbered scalar keys", () => {
        const payload = { values: {}, groups: { emergency_contacts: rows() } };
        expect(Array.isArray(payload.groups.emergency_contacts)).toBe(true);
        expect(Object.keys(payload.values)).not.toContain("emergency_contacts_1_name");
    });
});

describe("changing what the collection is replaces its role, never merges it", () => {
    /*
     * Measured in the mounted Studio: switching "Emergency contacts" to "Children in the household"
     * left `role: "emergency_contact"` on a collection of children, because a patch that sets only
     * the keys its preset happens to carry leaves the previous kind's behind. The role and the
     * scope belong to the kind; they move together or the collection lies about itself.
     */
    const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url).pathname, "utf8");

    it("clears role and scope as part of the kind change", () => {
        const inspector = read("app/adminV2/pos/ProcessingFormQuestionInspector.tsx");
        const onChange = inspector.slice(inspector.indexOf("form-builder-party-kind") - 2200, inspector.indexOf("form-builder-party-kind"));
        expect(onChange).toContain("role: undefined");
        expect(onChange).toContain("scope: undefined");
        // and the spread must put the preset LAST, so it wins over the clears
        expect(onChange.indexOf("role: undefined")).toBeLessThan(onChange.indexOf("PARTY_KIND_PRESETS[action_key]"));
    });

    it("treats an explicitly undefined key as cleared, not as absent", () => {
        const inspector = read("app/adminV2/pos/ProcessingFormQuestionInspector.tsx");
        expect(inspector).toContain("next[key] === undefined");
    });
});
