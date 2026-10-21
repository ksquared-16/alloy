/**
 * FI-02 — a drawn signature says who signed, from what the signer typed, never from the recipient.
 */
import { describe, expect, it } from "vitest";

import { describeSignatureSigner, type SignatureChannel } from "@/lib/forms/signatures/persistFormSubmissionSignatures";
import { validateFormPayload, type FormPayload } from "@/lib/forms/validateSubmission";

const DOC = "cccccccc-cccc-4ccc-9ccc-cccccccccccc";
const AT = "2026-10-21T16:00:00.000Z";

const schemaJson = (requireTypedName: boolean) => ({
    schema_version: 1,
    title: "Consent",
    sections: [{ id: "s1", field_ids: ["sig"] }],
    fields: [{ id: "sig", type: "signature", label: "Parent signature", required: true, signature: { require_typed_name: requireTypedName, require_acknowledgment: true } }],
});

const submit = (requireTypedName: boolean, sig: Record<string, unknown>) =>
    validateFormPayload({ schemaJson: schemaJson(requireTypedName), payload: { values: {}, signatures: { sig } } as unknown as FormPayload, mode: "submit" });

const LINK: SignatureChannel = { kind: "public_link", linkId: "link-1", packetSessionId: "ps-1", recipientPersonId: "person-pat", recipientName: "Pat Rivers" };

describe("drawn signature signer identity (Forms authority)", () => {
    it("a field that requires the signer's name refuses a drawn mark with no printed name", () => {
        const out = submit(true, { kind: "drawn", drawn_document_id: DOC, acknowledged_at: AT });
        expect(out.ok).toBe(false);
        if (!out.ok) expect(JSON.stringify(out.errors)).toContain("signer_printed_name");
    });

    it("accepts the drawn mark with the signer's printed name beside it", () => {
        expect(submit(true, { kind: "drawn", drawn_document_id: DOC, acknowledged_at: AT, signer_printed_name: "Jordan Rivers" }).ok).toBe(true);
    });

    it("a field without the requirement still accepts a drawn mark alone (legacy forms keep working)", () => {
        expect(submit(false, { kind: "drawn", drawn_document_id: DOC, acknowledged_at: AT }).ok).toBe(true);
    });

    it("an unknown key on a signature is still refused (the entry schema stays strict)", () => {
        expect(submit(true, { kind: "drawn", drawn_document_id: DOC, acknowledged_at: AT, signer_printed_name: "J", signer_person_id: "x" }).ok).toBe(false);
    });
});

describe("describeSignatureSigner — what metadata.signer records", () => {
    it("the recipient signing is recorded as a match, from the typed name", () => {
        expect(describeSignatureSigner({ kind: "drawn", drawn_document_id: DOC, signer_printed_name: " pat  rivers " }, LINK, AT)).toMatchObject({
            method: "drawn",
            printed_name: "pat  rivers",
            identity_basis: "printed_name_with_drawn_mark",
            channel: "public_link",
            link_id: "link-1",
            packet_session_id: "ps-1",
            recipient_person_id: "person-pat",
            printed_name_matches_recipient: true,
        });
    });

    it("a different adult signing is recorded as themselves, NOT as the recipient", () => {
        const s = describeSignatureSigner({ kind: "drawn", drawn_document_id: DOC, signer_printed_name: "Jordan Rivers" }, LINK, AT);
        expect(s.printed_name).toBe("Jordan Rivers");
        expect(s.printed_name_matches_recipient).toBe(false);
        expect(s.recipient_person_id).toBe("person-pat");
    });

    it("a drawn mark with no printed name is 'not captured' — the recipient's name is never filled in", () => {
        const s = describeSignatureSigner({ kind: "drawn", drawn_document_id: DOC }, LINK, AT);
        expect(s).toMatchObject({ printed_name: null, identity_basis: "not_captured", printed_name_matches_recipient: null });
        expect(JSON.stringify(s)).not.toContain("Pat Rivers");
    });

    it("a typed signature is its own name; an operator channel carries no recipient", () => {
        expect(describeSignatureSigner({ kind: "typed", typed_full_name: "Alex Rivera" }, { kind: "operator", userId: "u-1" }, AT)).toMatchObject({
            method: "typed",
            printed_name: "Alex Rivera",
            identity_basis: "typed_signature",
            channel: "operator",
            recipient_person_id: null,
            printed_name_matches_recipient: null,
            operator_user_id: "u-1",
        });
    });
});
