import { describe, expect, it } from "vitest";

import {
    carryForwardPacketStepConfig,
    indexPriorPacketSteps,
    packetStepMetadataForRewrite,
} from "@/lib/forms/packets/carryForwardPacketStepConfig";

/**
 * REORDERING A PACKET MUST NOT DISMANTLE IT.
 *
 * The items PUT route is a delete-and-reinsert that rebuilt `metadata` from `step_label` alone. The
 * moment a step could be an upload or an acknowledgment, pressing "Save steps" to move one row up
 * would have stripped the kind and the document off every document step in the packet — no error,
 * no warning, and a family who would simply never be asked for their immunization record again.
 *
 * These pin the carry-forward at the layer that decides it.
 */

const UPLOAD = {
    id: "item-upload",
    form_definition_id: "form-adapter-upload",
    metadata: {
        step_kind: "document_upload",
        step_label: "Immunization record",
        document_type_key: "immunization_record",
        participant_instructions: "A photo or scan is fine.",
    },
};

const ACK = {
    id: "item-ack",
    form_definition_id: "form-adapter-ack",
    metadata: {
        step_kind: "document_acknowledgment",
        step_label: "Family Handbook",
        acknowledgment_document_id: "doc-handbook",
        requires_signature: true,
    },
};

const PLAIN = {
    id: "item-form",
    form_definition_id: "form-admissions",
    metadata: { step_label: "Admissions Information" },
};

const index = () => indexPriorPacketSteps([UPLOAD, ACK, PLAIN]);

describe("a reorder keeps every step what it was", () => {
    it("an upload step survives being moved", () => {
        const c = carryForwardPacketStepConfig(
            { packet_item_id: "item-upload", form_definition_id: "form-adapter-upload" },
            index(),
        );
        expect(c.kind).toBe("document_upload");
        expect(c.documentTypeKey).toBe("immunization_record");
        expect(c.instructions).toBe("A photo or scan is fine.");
        // The exact demotion that used to happen, asserted as impossible.
        expect(c.kind).not.toBe("form");
    });

    it("an acknowledgment step keeps its document and its signature", () => {
        const c = carryForwardPacketStepConfig(
            { packet_item_id: "item-ack", form_definition_id: "form-adapter-ack" },
            index(),
        );
        expect(c.kind).toBe("document_acknowledgment");
        expect(c.acknowledgmentDocumentId).toBe("doc-handbook");
        expect(c.requiresSignature).toBe(true);
    });

    it("a plain form step is still a form step", () => {
        const c = carryForwardPacketStepConfig(
            { packet_item_id: "item-form", form_definition_id: "form-admissions" },
            index(),
        );
        expect(c.kind).toBe("form");
        expect(c.label).toBe("Admissions Information");
    });
});

describe("matching a draft row to what it was", () => {
    it("recovers a document step from a client that sends no packet_item_id", () => {
        // The adapter form is 1:1 with its step, so the form id is enough.
        const c = carryForwardPacketStepConfig({ form_definition_id: "form-adapter-ack" }, index());
        expect(c.kind).toBe("document_acknowledgment");
        expect(c.acknowledgmentDocumentId).toBe("doc-handbook");
    });

    it("a genuinely new step carries nothing and is a form", () => {
        const c = carryForwardPacketStepConfig({ form_definition_id: "form-brand-new" }, index());
        expect(c.kind).toBe("form");
        expect(c.documentTypeKey).toBeNull();
        expect(c.acknowledgmentDocumentId).toBeNull();
    });

    it("does not guess between two steps that share a form", () => {
        const idx = indexPriorPacketSteps([
            { id: "a", form_definition_id: "same", metadata: { step_kind: "form", step_label: "First" } },
            { id: "b", form_definition_id: "same", metadata: { step_kind: "form", step_label: "Second" } },
        ]);
        // Named explicitly, it is exact.
        expect(carryForwardPacketStepConfig({ packet_item_id: "b", form_definition_id: "same" }, idx).label).toBe(
            "Second",
        );
        // Unnamed, it resolves to the first rather than the last — stable, not arbitrary.
        expect(carryForwardPacketStepConfig({ form_definition_id: "same" }, idx).label).toBe("First");
    });
});

describe("the operator's own edits still win", () => {
    it("a newly typed label replaces the stored one without disturbing the kind", () => {
        const meta = packetStepMetadataForRewrite(
            { packet_item_id: "item-upload", form_definition_id: "form-adapter-upload", step_label: "Shot records" },
            index(),
        );
        expect(meta.step_label).toBe("Shot records");
        expect(meta.step_kind).toBe("document_upload");
        expect(meta.document_type_key).toBe("immunization_record");
    });

    it("an omitted label keeps the stored one rather than blanking it", () => {
        const meta = packetStepMetadataForRewrite(
            { packet_item_id: "item-ack", form_definition_id: "form-adapter-ack" },
            index(),
        );
        expect(meta.step_label).toBe("Family Handbook");
    });
});
