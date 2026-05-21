import { describe, expect, it } from "vitest";
import {
    artifactKindDisplayLabel,
    formatPacketDocumentProvenanceLine,
    generationLabelDisplay,
    packetDocumentIndexEntryToRow,
    syntheticSubmittedRecordRowId,
} from "@/lib/forms/packets/documentProvenanceDisplay";
import type { PacketReviewDocumentIndexEntryV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

const provenanceBase = {
    form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    form_name: "Guardian PDF Form",
    form_definition_version_id: "45454545-4545-4545-8545-454545454545",
    version_number: 2,
    form_submission_id: "23232323-2323-4232-8232-232323232323",
    submission_submitted_at: "2026-05-01T10:00:00.000Z",
    generated_at: "2026-05-01T12:00:00.000Z",
    template_key: "guardian_stub",
    idempotency_key: null,
    generation_label: "current" as const,
};

describe("documentProvenanceDisplay", () => {
    it("formats generated PDF provenance line", () => {
        const line = formatPacketDocumentProvenanceLine(provenanceBase);
        expect(line).toContain("From Guardian PDF Form");
        expect(line).toContain("v2");
        expect(line).toContain("submitted");
        expect(line).toContain("generated");
    });

    it("missing provenance fields do not crash formatter", () => {
        const line = formatPacketDocumentProvenanceLine({
            ...provenanceBase,
            form_name: "",
            version_number: 0,
            submission_submitted_at: null,
            generated_at: null,
        });
        expect(line).toContain("From Form");
        expect(line).not.toContain("generated");
    });

    it("generation label display strings are stable", () => {
        expect(generationLabelDisplay("current")).toBe("Current generated PDF");
        expect(generationLabelDisplay("also_generated")).toBe("Also generated");
    });

    it("submitted_record row uses synthetic id and submission link", () => {
        const entry: PacketReviewDocumentIndexEntryV1 = {
            kind: "submitted_record",
            step_sequence_index: 1,
            form_name: "Acknowledgement",
            form_submission_id: "34343434-3434-4343-8343-343434343434",
            document_id: null,
            title: "Acknowledgement",
            provenance: {
                ...provenanceBase,
                form_name: "Acknowledgement",
                generated_at: null,
                generation_label: "current",
            },
            admin_links: {
                submission_path: "/admin/forms/ack/submissions/sub-ack",
                packet_session_path: "/adminV2/forms/packets/sess-1",
            },
        };
        const row = packetDocumentIndexEntryToRow(entry);
        expect(row.id).toBe(syntheticSubmittedRecordRowId("34343434-3434-4343-8343-343434343434"));
        expect(row.artifact_kind).toBe("submitted_record");
        expect(row.open_target).toBe("submission_link");
        expect(row.provenance_line).toContain("Acknowledgement");
        expect(artifactKindDisplayLabel("submitted_record")).toBe("Submitted form record");
    });
});
