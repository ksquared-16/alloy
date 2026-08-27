/**
 * Two dimensions the runtime used to answer with one property.
 *
 * Whether a value may be REUSED across destinations, and whether the PARTICIPANT supplies it, are
 * independent. Collapsing them cost the conversation 61 of its 81 questions: a field with no
 * canonical binding cannot join shared-value dedupe, and the runtime read that as "not a question",
 * so every bespoke school question — "How is your child comforted?" — was skipped by the
 * conversation and dumped into a raw Form control at the end.
 */
import { describe, it, expect } from "vitest";
import {
    participantCollectionMode,
    processScopedAnswerKey,
    parseProcessScopedAnswerKey,
    isProcessScopedAnswerKey,
} from "@/lib/enrollment/informationNeeds/participantCollectionMode";
import { resolveEnrollmentNeedIdentity } from "@/lib/enrollment/informationNeeds/enrollmentNeedIdentity";
import { processScopedAnswersToFieldIds, sharedValuesToFieldIds } from "@/lib/forms/packets/sharedValuesToFieldIds";
import { canonicalPrefillPathForBinding } from "@/lib/forms/prefill/canonicalPrefillMap";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

const f = (over: Partial<FormField> & { id: string }): FormField =>
    ({ type: "text", label: over.id, required: false, ...over }) as FormField;
const identity = (field: FormField, formDefinitionId = "def-1") =>
    resolveEnrollmentNeedIdentity({ field, subjectId: "child-1", insideCollectionBoundGroup: false, formDefinitionVersionId: "v2", sessionItemId: "item-1", formDefinitionId });

describe("collection mode is read from the field, never from the identity", () => {
    it("classifies each way a participant supplies a value", () => {
        expect(participantCollectionMode(f({ id: "a" }))).toBe("conversational");
        expect(participantCollectionMode(f({ id: "b", type: "signature" }))).toBe("signature");
        expect(participantCollectionMode(f({ id: "c", type: "file_ref" }))).toBe("upload");
        expect(participantCollectionMode(f({ id: "d", read_only: true }))).toBe("system");
        expect(participantCollectionMode(f({ id: "e", derived: { kind: "execution_date" } }))).toBe("system");
        expect(participantCollectionMode(f({ id: "g", type: "text_block" }))).toBe("system");
    });
});

describe("a question with no canonical identity is still a question", () => {
    const bespoke = f({ id: "field_43", label: "How is your child comforted?" });

    it("cannot join shared-value dedupe AND is still conversational", () => {
        const id = identity(bespoke);
        // Both dimensions, independently true. This is the state that was missing.
        expect(id.artifact_specific, "no canonical identity to collapse on").toBe(true);
        expect(id.shared_value_key, "must never claim a canonical datum").toBeNull();
        expect(id.collection_mode).toBe("conversational");
        expect(id.session_value_key).toBe("process:def-1:field_43");
    });

    it("keeps a signature out of the conversation", () => {
        const id = identity(f({ id: "sig", type: "signature" }));
        expect(id.collection_mode).toBe("signature");
        expect(id.session_value_key, "a signature belongs to the artifact it signs").toBeNull();
    });

    it("keeps an upload with its own artifact", () => {
        const id = identity(f({ id: "up", type: "file_ref", label: "Immunization record" }));
        expect(id.collection_mode).toBe("upload");
        expect(id.session_value_key).toBeNull();
    });

    it("leaves a canonical datum exactly as it was", () => {
        const id = identity(f({ id: "x", field_source: { entity_type: "customer_member", field_key: "dob" } }));
        expect(id.artifact_specific).toBe(false);
        expect(id.shared_value_key).toBe("customer_member:dob");
        expect(id.session_value_key, "a shared datum keeps living where it always did").toBe(id.shared_value_key);
    });
});

describe("a process-scoped key is not a canonical key", () => {
    it("names one destination on one Form", () => {
        const k = processScopedAnswerKey("def-1", "field_43");
        expect(isProcessScopedAnswerKey(k)).toBe(true);
        expect(parseProcessScopedAnswerKey(k)).toEqual({ formDefinitionId: "def-1", fieldId: "field_43" });
    });

    it("cannot be resolved by the canonical prefill map", () => {
        // The guarantee that keeps a bespoke school question out of durable child/person truth.
        expect(canonicalPrefillPathForBinding("process", "def-1:field_43", { aliasOnly: true })).toBeNull();
    });

    it("fills only its own destination, on its own Form, and only if the field exists", () => {
        const schema = { fields: [f({ id: "field_43" }), f({ id: "other" })] } as unknown as FormSchemaV1;
        const store = {
            "process:def-1:field_43": "a quiet cuddle and her blue blanket",
            "process:def-2:field_43": "a different Form's answer",
            "process:def-1:gone": "a destination this version no longer has",
            customer_member_dob: "2021-04-02",
        };
        expect(processScopedAnswersToFieldIds(schema, store, "def-1")).toEqual({ field_43: "a quiet cuddle and her blue blanket" });
    });

    it("is invisible to the shared-value mapper", () => {
        const schema = { fields: [f({ id: "field_43" })] } as unknown as FormSchemaV1;
        expect(sharedValuesToFieldIds(schema, { "process:def-1:field_43": "x" })).toEqual({});
    });
});

describe("placement and asking stay independent (Defect A preserved)", () => {
    it("a destination can receive a value for the document while never being a question", () => {
        const placed = f({ id: "placed", read_only: true, field_source: { entity_type: "customer_member", field_key: "dob" } });
        const schema = { fields: [placed] } as unknown as FormSchemaV1;
        // It is filled for rendering...
        expect(sharedValuesToFieldIds(schema, { "customer_member:dob": "2021-04-02" })).toEqual({ placed: "2021-04-02" });
        // ...and it is not asked.
        expect(participantCollectionMode(placed)).toBe("system");
        expect(identity(placed).session_value_key).toBeNull();
    });
});
