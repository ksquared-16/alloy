import { describe, expect, it } from "vitest";

import {
    PACKET_STEP_KIND_LABELS,
    packetStepConfigRefusal,
    readPacketStepConfig,
    writePacketStepConfig,
} from "@/lib/forms/packets/packetStepKind";

/**
 * A PACKET STEP SAYS WHAT IT ASKS OF A FAMILY.
 *
 * Every step used to be a Form, because the item row demands a form id. That made an administrator
 * build a fake one-question form merely to say "upload your immunization record", and made a
 * 23-page handbook look like something to convert into questions.
 */

describe("reading a step", () => {
    it("treats an item with no recorded kind as a Form", () => {
        // Every step that existed before this vocabulary was one. The default is what those rows
        // ARE, not a guess.
        expect(readPacketStepConfig({}).kind).toBe("form");
        expect(readPacketStepConfig(null).kind).toBe("form");
        expect(readPacketStepConfig({ step_label: "Admissions" }).kind).toBe("form");
    });

    it("reads an upload step", () => {
        const c = readPacketStepConfig({
            step_kind: "document_upload",
            step_label: "Immunization Record",
            document_type_key: "immunization_record",
            participant_instructions: "Upload your child's current record.",
        });
        expect(c.kind).toBe("document_upload");
        expect(c.documentTypeKey).toBe("immunization_record");
        expect(c.instructions).toMatch(/current record/);
    });

    it("reads an acknowledge step", () => {
        const c = readPacketStepConfig({
            step_kind: "document_acknowledgment",
            acknowledgment_document_id: "doc-1",
            requires_signature: true,
        });
        expect(c.kind).toBe("document_acknowledgment");
        expect(c.acknowledgmentDocumentId).toBe("doc-1");
        expect(c.requiresSignature).toBe(true);
    });

    it("refuses an unknown kind rather than inventing one", () => {
        expect(readPacketStepConfig({ step_kind: "wire_transfer" }).kind).toBe("form");
    });
});

describe("writing a step", () => {
    it("round-trips", () => {
        const meta = writePacketStepConfig({}, {
            kind: "document_upload",
            label: "Immunization Record",
            documentTypeKey: "immunization_record",
            instructions: "Upload it.",
        });
        expect(readPacketStepConfig(meta)).toMatchObject({
            kind: "document_upload",
            label: "Immunization Record",
            documentTypeKey: "immunization_record",
        });
    });

    it("keeps metadata it does not own", () => {
        // Another owner's key on the item is not this module's to discard.
        const meta = writePacketStepConfig({ some_other_owner: "keep me" }, { kind: "form" });
        expect(meta.some_other_owner).toBe("keep me");
    });

    it("clears a key when the value is removed", () => {
        const first = writePacketStepConfig({}, { kind: "document_upload", documentTypeKey: "immunization_record" });
        const second = writePacketStepConfig(first, { kind: "form", documentTypeKey: null });
        expect(second.document_type_key).toBeUndefined();
    });
});

describe("a step whose completion cannot be proven is refused", () => {
    it("an upload with no classification", () => {
        const c = readPacketStepConfig({ step_kind: "document_upload" });
        expect(packetStepConfigRefusal(c)).toMatch(/what document/i);
    });

    it("an acknowledgment with no document", () => {
        const c = readPacketStepConfig({ step_kind: "document_acknowledgment" });
        expect(packetStepConfigRefusal(c)).toMatch(/document the family reads/i);
    });

    it("a well-formed step is accepted", () => {
        expect(packetStepConfigRefusal(readPacketStepConfig({ step_kind: "form" }))).toBeNull();
        expect(
            packetStepConfigRefusal(readPacketStepConfig({ step_kind: "document_upload", document_type_key: "immunization_record" })),
        ).toBeNull();
    });
});

describe("the administrator's vocabulary", () => {
    it("never shows technical kind names", () => {
        expect(PACKET_STEP_KIND_LABELS.form).toBe("Collect information");
        expect(PACKET_STEP_KIND_LABELS.document_upload).toBe("Upload a document");
        expect(PACKET_STEP_KIND_LABELS.document_acknowledgment).toBe("Read & acknowledge");
    });
});
