/**
 * Intake resolves the guardian from the canonical COLLECTION ENVELOPE.
 *
 * Recognition must be by IDENTITY (provider_ref → Relationship Definition → operational role), never
 * by visible label, and never by parsing the projection's nested-field id convention. Selecting a
 * lead contact must never discard the other guardians.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import { describe, it, expect } from "vitest";

import {
    resolveGuardianFromCollectionEnvelope,
    extractEnvelopeGuardians,
    type CollectionEnvelope,
} from "@/lib/forms/intake/resolveGuardianFromCollectionEnvelope";
import { buildFormIntakeMetaFromPayload } from "@/lib/forms/intake/buildFormIntakeMetaFromPayload";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const PARENTS_REF = "person.contact_role.parents";
const EMERGENCY_REF = "person.contact_role.emergency_contacts";
const PICKUP_REF = "person.contact_role.authorized_pickups";
const VERTICAL = "d7a48ba5-2602-4dcd-8e5f-598f32436350";

/** A schema group shaped exactly as the projection emits one. `label` is deliberately arbitrary. */
function group(id: string, providerRef: string, label: string) {
    return {
        id,
        type: "group" as const,
        label,
        required: false,
        collection_binding: { collection_provider_ref: providerRef, iteration_entity_type: "person" },
        fields: [
            { id: `${id}__n`, type: "text", label: "Name", required: false, field_source: { entity_type: "person", field_key: "full_name" } },
            { id: `${id}__e`, type: "text", label: "Email", required: false, field_source: { entity_type: "person", field_key: "email" } },
            { id: `${id}__p`, type: "text", label: "Phone", required: false, field_source: { entity_type: "person", field_key: "phone" } },
        ],
    };
}

function schemaWith(...groups: ReturnType<typeof group>[]): FormSchemaV1 {
    return {
        schema_version: 1,
        title: "Enrollment",
        sections: [{ id: "s1", title: "S", field_ids: groups.map((g) => g.id) }],
        fields: groups,
    } as unknown as FormSchemaV1;
}

function row(providerRef: string, instanceKey: string, vals: Record<string, string>, extra: Record<string, unknown> = {}) {
    return { provider_ref: providerRef, instance_key: instanceKey, origin: "respondent_added", values: vals, iteration_entity_type: "person", ...extra };
}

describe("guardian resolution from the collection envelope", () => {
    const parents = group("col_parents_guardians", PARENTS_REF, "Parents / Guardians");
    const schema = schemaWith(parents);

    it("1. a guardian with EMAIL resolves", () => {
        const env: CollectionEnvelope = {
            col_parents_guardians: [row(PARENTS_REF, "g1", { col_parents_guardians__n: "Dana Ruiz", col_parents_guardians__e: "dana@x.invalid" })],
        };
        const res = resolveGuardianFromCollectionEnvelope(env, schema);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.primary.email).toBe("dana@x.invalid");
        expect(res.primary.first_name).toBe("Dana");
        expect(res.primary.last_name).toBe("Ruiz");
    });

    it("2. a guardian with PHONE only resolves", () => {
        const env: CollectionEnvelope = {
            col_parents_guardians: [row(PARENTS_REF, "g1", { col_parents_guardians__n: "Dana Ruiz", col_parents_guardians__p: "555-0100" })],
        };
        const res = resolveGuardianFromCollectionEnvelope(env, schema);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.primary.phone).toBe("555-0100");
    });

    it("3. an EXISTING instance preserves the canonical person id", () => {
        const env: CollectionEnvelope = {
            col_parents_guardians: [
                row(PARENTS_REF, "g1", { col_parents_guardians__e: "dana@x.invalid" }, { origin: "existing", item_id: "11111111-1111-4111-8111-111111111111" }),
            ],
        };
        const res = resolveGuardianFromCollectionEnvelope(env, schema);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.primary.origin).toBe("existing");
        expect(res.primary.person_id).toBe("11111111-1111-4111-8111-111111111111");
    });

    it("4. a RESPONDENT-ADDED instance preserves proposed facts and has no person id", () => {
        const env: CollectionEnvelope = {
            col_parents_guardians: [row(PARENTS_REF, "g1", { col_parents_guardians__n: "New Parent", col_parents_guardians__e: "new@x.invalid" })],
        };
        const res = resolveGuardianFromCollectionEnvelope(env, schema);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.primary.origin).toBe("respondent_added");
        expect(res.primary.person_id).toBeNull();
        expect(res.primary.first_name).toBe("New");
    });

    it("5 + 6. MULTIPLE guardians are retained, and an existing one with contact is primary", () => {
        const env: CollectionEnvelope = {
            col_parents_guardians: [
                row(PARENTS_REF, "g1", { col_parents_guardians__n: "Added Parent", col_parents_guardians__e: "added@x.invalid" }),
                row(PARENTS_REF, "g2", { col_parents_guardians__e: "existing@x.invalid" }, { origin: "existing", item_id: "22222222-2222-4222-8222-222222222222" }),
            ],
        };
        const res = resolveGuardianFromCollectionEnvelope(env, schema);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.all).toHaveLength(2);
        expect(res.primary.person_id).toBe("22222222-2222-4222-8222-222222222222");
    });

    it("7. the SECOND guardian is chosen when the first has no usable contact", () => {
        const env: CollectionEnvelope = {
            col_parents_guardians: [
                row(PARENTS_REF, "g1", { col_parents_guardians__n: "No Contact" }),
                row(PARENTS_REF, "g2", { col_parents_guardians__n: "Has Phone", col_parents_guardians__p: "555-0200" }),
            ],
        };
        const res = resolveGuardianFromCollectionEnvelope(env, schema);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.primary.instance_key).toBe("g2");
        expect(res.all, "the uncontactable guardian must still be retained").toHaveLength(2);
    });

    it("8. NO usable contact returns a clear operator-facing failure", () => {
        const env: CollectionEnvelope = { col_parents_guardians: [row(PARENTS_REF, "g1", { col_parents_guardians__n: "No Contact" })] };
        const res = resolveGuardianFromCollectionEnvelope(env, schema);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason_code).toBe("no_usable_contact");
        expect(res.reason).toMatch(/email or phone/i);
        expect(res.all).toHaveLength(1);
    });

    it("9 + 10. IDENTITY drives recognition — an arbitrarily renamed group still resolves", () => {
        const renamed = group("col_parents_guardians", PARENTS_REF, "Caregivers & Responsible Adults");
        const env: CollectionEnvelope = {
            col_parents_guardians: [row(PARENTS_REF, "g1", { col_parents_guardians__e: "dana@x.invalid" })],
        };
        const res = resolveGuardianFromCollectionEnvelope(env, schemaWith(renamed));
        expect(res.ok, "a renamed section must still resolve — labels are not identity").toBe(true);
    });

    it("14 + 15. emergency contacts and authorized pickups are NOT mistaken for guardians", () => {
        const emergency = group("col_emergency_contacts", EMERGENCY_REF, "Parent Emergency Contact");
        const pickup = group("col_authorized_pickups", PICKUP_REF, "Parent Pickup List");
        const env: CollectionEnvelope = {
            col_emergency_contacts: [row(EMERGENCY_REF, "e1", { col_emergency_contacts__e: "er@x.invalid" })],
            col_authorized_pickups: [row(PICKUP_REF, "p1", { col_authorized_pickups__e: "pk@x.invalid" })],
        };
        const res = resolveGuardianFromCollectionEnvelope(env, schemaWith(emergency, pickup));
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason_code).toBe("no_guardian_collection");
    });

    it("17. a MALFORMED envelope fails safely", () => {
        for (const bad of [null, undefined, {}, { col_parents_guardians: "nope" }, { col_parents_guardians: [null] }]) {
            const res = resolveGuardianFromCollectionEnvelope(bad as never, schema);
            expect(res.ok).toBe(false);
        }
        expect(extractEnvelopeGuardians({ col_parents_guardians: [{}] } as never, schema)).toEqual([]);
    });

    it("18. instance ordering is STABLE across repeated resolution", () => {
        const env: CollectionEnvelope = {
            col_parents_guardians: [
                row(PARENTS_REF, "g1", { col_parents_guardians__p: "555-0001" }),
                row(PARENTS_REF, "g2", { col_parents_guardians__p: "555-0002" }),
                row(PARENTS_REF, "g3", { col_parents_guardians__p: "555-0003" }),
            ],
        };
        const a = extractEnvelopeGuardians(env, schema).map((g) => g.instance_key);
        const b = extractEnvelopeGuardians(env, schema).map((g) => g.instance_key);
        expect(a).toEqual(["g1", "g2", "g3"]);
        expect(a).toEqual(b);
    });

    it("a row whose provider_ref disagrees with its schema group is ignored", () => {
        const env: CollectionEnvelope = {
            col_parents_guardians: [row(EMERGENCY_REF, "spoof", { col_parents_guardians__e: "spoof@x.invalid" })],
        };
        expect(extractEnvelopeGuardians(env, schema)).toEqual([]);
    });
});

describe("intake precedence — structured envelope vs flat values", () => {
    const parents = group("col_parents_guardians", PARENTS_REF, "Parents / Guardians");
    const schema = schemaWith(parents);
    const link = { default_vertical_id: VERTICAL, lead_capture: true };

    it("11. a LEGACY flat form still works unchanged when no envelope is present", () => {
        const res = buildFormIntakeMetaFromPayload({
            values: { guardian_email: "flat@x.invalid", guardian_full_name: "Flat Parent" },
            linkMetadata: link,
            submissionId: "s1",
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.intake.guardian.email).toBe("flat@x.invalid");
        expect(res.intake.guardian.first_name).toBe("Flat");
    });

    it("12. the structured envelope TAKES PRECEDENCE over equivalent flat values", () => {
        const res = buildFormIntakeMetaFromPayload({
            values: { guardian_email: "flat@x.invalid" },
            linkMetadata: link,
            submissionId: "s2",
            schema,
            collectionEnvelope: {
                col_parents_guardians: [row(PARENTS_REF, "g1", { col_parents_guardians__e: "structured@x.invalid" })],
            },
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.intake.guardian.email).toBe("structured@x.invalid");
        expect((res.intake as Record<string, unknown>).guardian_source).toBe("collection_envelope");
    });

    it("13. CONFLICTING structured and flat values surface a review signal, never a silent pick", () => {
        const res = buildFormIntakeMetaFromPayload({
            values: { guardian_email: "flat@x.invalid" },
            linkMetadata: link,
            submissionId: "s3",
            schema,
            collectionEnvelope: {
                col_parents_guardians: [row(PARENTS_REF, "g1", { col_parents_guardians__e: "structured@x.invalid" })],
            },
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const conflict = (res.intake as Record<string, unknown>).guardian_conflict;
        expect(conflict, "a materially different flat email must be surfaced for review").toBeTruthy();
        expect(String(conflict)).toMatch(/email/i);
    });

    it("a structured guardian with NO contact fails rather than silently falling back to flat", () => {
        const res = buildFormIntakeMetaFromPayload({
            values: { guardian_email: "flat@x.invalid" },
            linkMetadata: link,
            submissionId: "s4",
            schema,
            collectionEnvelope: {
                col_parents_guardians: [row(PARENTS_REF, "g1", { col_parents_guardians__n: "No Contact" })],
            },
        });
        expect(res.ok, "falling back would ignore what the respondent actually submitted").toBe(false);
        if (!res.ok) expect(res.reason).toMatch(/email or phone/i);
    });

    it("5. every guardian is carried onto the intake meta, not just the primary", () => {
        const res = buildFormIntakeMetaFromPayload({
            values: {},
            linkMetadata: link,
            submissionId: "s5",
            schema,
            collectionEnvelope: {
                col_parents_guardians: [
                    row(PARENTS_REF, "g1", { col_parents_guardians__e: "one@x.invalid" }),
                    row(PARENTS_REF, "g2", { col_parents_guardians__p: "555-0300" }),
                ],
            },
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect((res.intake as Record<string, unknown>).guardians).toHaveLength(2);
    });
});
