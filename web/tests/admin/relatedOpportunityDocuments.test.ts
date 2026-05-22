import { describe, expect, it } from "vitest";
import { normalizeDocumentRows } from "@/lib/admin/normalizeDocumentRow";
import { mergeOpportunityPacketDocumentRows } from "@/lib/admin/related/mergeOpportunityPacketDocuments";
import type { PacketReviewDocumentIndexEntryV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

const DOC = "67676767-6767-4767-8767-676767676767";
const SUB_PDF = "23232323-2323-4232-8232-232323232323";
const SUB_ACK = "34343434-3434-4343-8343-343434343434";

const provenance = (overrides: Partial<PacketReviewDocumentIndexEntryV1["provenance"]> = {}) => ({
    form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    form_name: "Guardian PDF Form",
    form_definition_version_id: "45454545-4545-4545-8545-454545454545",
    version_number: 2,
    form_submission_id: SUB_PDF,
    submission_submitted_at: "2026-05-01T10:00:00.000Z",
    generated_at: "2026-05-01T12:00:00.000Z",
    template_key: null,
    idempotency_key: null,
    generation_label: "current" as const,
    ...overrides,
});

describe("mergeOpportunityPacketDocumentRows", () => {
    const indexEntries: PacketReviewDocumentIndexEntryV1[] = [
        {
            kind: "generated_pdf",
            step_sequence_index: 0,
            form_name: "Guardian PDF Form",
            form_submission_id: SUB_PDF,
            document_id: DOC,
            title: "guardian.pdf",
            provenance: provenance(),
            admin_links: {
                submission_path: `/admin/forms/fd/submissions/${SUB_PDF}`,
                packet_session_path: "/adminV2/forms/packets/sess-1",
            },
        },
        {
            kind: "submitted_record",
            step_sequence_index: 1,
            form_name: "Acknowledgement",
            form_submission_id: SUB_ACK,
            document_id: null,
            title: "Acknowledgement",
            provenance: provenance({
                form_name: "Acknowledgement",
                form_submission_id: SUB_ACK,
                generated_at: null,
            }),
            admin_links: {
                submission_path: `/admin/forms/fd/submissions/${SUB_ACK}`,
                packet_session_path: "/adminV2/forms/packets/sess-1",
            },
        },
    ];

    it("merges PDF rows and synthetic submitted_record without dropping either", () => {
        const merged = mergeOpportunityPacketDocumentRows(
            [],
            [
                {
                    id: DOC,
                    title: "guardian.pdf",
                    created_at: "2026-05-01T12:00:00.000Z",
                },
            ],
            indexEntries,
            50
        );
        expect(merged).toHaveLength(2);
        const pdf = merged.find((r) => r.id === DOC);
        const rec = merged.find((r) => r.artifact_kind === "submitted_record");
        expect(pdf?.provenance_line).toContain("Guardian PDF Form");
        expect(pdf?.generation_label_display).toBe("Current PDF");
        expect(pdf?.document_provenance?.form_name).toBe("Guardian PDF Form");
        expect(pdf?.open_target).toBe("signed_url");
        expect(rec?.open_target).toBe("submission_link");
        expect(rec?.name).toBe("Acknowledgement");
    });

    it("dedupes opportunity upload and packet PDF by document id", () => {
        const upload = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Contract.pdf", created_at: "2026-04-01T00:00:00.000Z" };
        const merged = mergeOpportunityPacketDocumentRows([upload], [{ id: DOC, title: "guardian.pdf" }], indexEntries, 50);
        const ids = merged.map((r) => r.id);
        expect(ids).toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        expect(ids).toContain(DOC);
        expect(ids.filter((id) => id === DOC)).toHaveLength(1);
    });

    it("handles empty index and rows safely", () => {
        expect(mergeOpportunityPacketDocumentRows(null, [], [], 10)).toEqual([]);
        const rows = normalizeDocumentRows([{ id: "x", title: "Only" }]);
        expect(rows).toHaveLength(1);
    });
});
