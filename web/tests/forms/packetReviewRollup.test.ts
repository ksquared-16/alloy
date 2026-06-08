import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPacketReviewRollupV1 } from "@/lib/forms/packets/buildPacketReviewRollupV1";
import {
    assignGenerationLabels,
    hasUsablePdfMapping,
    resolveArtifactKind,
} from "@/lib/forms/packets/documentProvenanceFromSubmission";
import { validateFormSchema } from "@/lib/forms/schema";

const ORG = "11111111-1111-4111-8111-111111111111";
const SESS = "33333333-3333-4333-8333-333333333333";
const PDEF = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM_PDF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_NOPDF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PI_PDF = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PI_NOPDF = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FD_PDF = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const FD_NOPDF = "12121212-1212-4121-8121-121212121212";
const SUB_PDF = "23232323-2323-4232-8232-232323232323";
const SUB_NOPDF = "34343434-3434-4343-8343-343434343434";
const VER_PDF = "45454545-4545-4545-8545-454545454545";
const VER_NOPDF = "56565656-5656-4656-8656-565656565656";
const DOC_PDF = "67676767-6767-4767-8767-676767676767";

const SCHEMA_WITH_LABEL = {
    schema_version: 1 as const,
    title: "Guardian Form",
    sections: [{ id: "s1", field_ids: ["guardian_first_name"] }],
    fields: [{ id: "guardian_first_name", type: "text" as const, label: "Guardian first name", required: true }],
};

const PDF_MAPPING = {
    engine: "stub",
    template_key: "guardian_stub",
    slots: { name_slot: { path: "values.guardian_first_name" } },
};

function makeRollupClient() {
    const session = {
        id: SESS,
        org_id: ORG,
        status: "completed",
        packet_definition_id: PDEF,
        current_sequence_index: 1,
        crm_snapshot: { opportunity_id: "22222222-2222-4222-8222-222222222222", customer_id: null, person_id: null },
        launch_context: { launch_surface: "crm_opportunity" },
        operator_review_status: "needs_review",
        operator_review_warnings: [{ kind: "submitted_text_differs_from_crm", message: "Name mismatch", field_key: "g1" }],
        operator_review_notes: null,
        operator_reviewed_at: null,
        operator_reviewed_by_user_id: null,
        form_packet_definitions: { id: PDEF, name: "Enrollment Packet", key: "enrollment" },
    };

    const items = [
        {
            id: ITEM_PDF,
            sequence_index: 0,
            status: "submitted",
            submitted_at: "2026-05-01T10:00:00.000Z",
            form_submission_id: SUB_PDF,
            packet_item_id: PI_PDF,
        },
        {
            id: ITEM_NOPDF,
            sequence_index: 1,
            status: "submitted",
            submitted_at: "2026-05-01T11:00:00.000Z",
            form_submission_id: SUB_NOPDF,
            packet_item_id: PI_NOPDF,
        },
    ];

    return {
        from(table: string) {
            if (table === "form_packet_sessions") {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    eq() {
                                        return {
                                            maybeSingle: async () => ({ data: session, error: null }),
                                        };
                                    },
                                };
                            },
                        };
                    },
                };
            }
            if (table === "form_packet_session_items") {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    eq() {
                                        return {
                                            order: async () => ({ data: items, error: null }),
                                        };
                                    },
                                };
                            },
                        };
                    },
                };
            }
            if (table === "form_packet_items") {
                return {
                    select() {
                        return {
                            in() {
                                return {
                                    eq: async () => ({
                                        data: [
                                            { id: PI_PDF, form_definition_id: FD_PDF },
                                            { id: PI_NOPDF, form_definition_id: FD_NOPDF },
                                        ],
                                        error: null,
                                    }),
                                };
                            },
                        };
                    },
                };
            }
            if (table === "form_definitions") {
                return {
                    select() {
                        return {
                            in() {
                                return {
                                    eq: async () => ({
                                        data: [
                                            { id: FD_PDF, name: "Guardian PDF Form", key: "guardian_pdf" },
                                            { id: FD_NOPDF, name: "Acknowledgement", key: "ack" },
                                        ],
                                        error: null,
                                    }),
                                };
                            },
                        };
                    },
                };
            }
            if (table === "form_submissions") {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    in: async () => ({
                                        data: [
                                            {
                                                id: SUB_PDF,
                                                status: "submitted",
                                                submitted_at: "2026-05-01T10:00:00.000Z",
                                                payload: { values: { guardian_first_name: "Jane" }, meta: {} },
                                                form_definition_id: FD_PDF,
                                                form_definition_version_id: VER_PDF,
                                                person_id: "88888888-8888-4888-8888-888888888888",
                                                customer_id: null,
                                                customer_member_id: null,
                                                opportunity_id: null,
                                            },
                                            {
                                                id: SUB_NOPDF,
                                                status: "submitted",
                                                submitted_at: "2026-05-01T11:00:00.000Z",
                                                payload: { values: { agreed: true }, meta: {} },
                                                form_definition_id: FD_NOPDF,
                                                form_definition_version_id: VER_NOPDF,
                                                person_id: "88888888-8888-4888-8888-888888888888",
                                                customer_id: null,
                                                customer_member_id: null,
                                                opportunity_id: null,
                                            },
                                        ],
                                        error: null,
                                    }),
                                };
                            },
                        };
                    },
                };
            }
            if (table === "form_definition_versions") {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    in: async () => ({
                                        data: [
                                            {
                                                id: VER_PDF,
                                                version_number: 2,
                                                schema_json: SCHEMA_WITH_LABEL,
                                                pdf_mapping_json: PDF_MAPPING,
                                            },
                                            {
                                                id: VER_NOPDF,
                                                version_number: 1,
                                                schema_json: {
                                                    schema_version: 1,
                                                    title: "Ack Form",
                                                    sections: [{ id: "s1", field_ids: ["agreed"] }],
                                                    fields: [
                                                        {
                                                            id: "agreed",
                                                            type: "checkbox",
                                                            label: "I agree",
                                                            required: true,
                                                        },
                                                    ],
                                                },
                                                pdf_mapping_json: null,
                                            },
                                        ],
                                        error: null,
                                    }),
                                };
                            },
                        };
                    },
                };
            }
            if (table === "form_submission_documents") {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    in: async () => ({
                                        data: [
                                            {
                                                form_submission_id: SUB_PDF,
                                                document_id: DOC_PDF,
                                                role: "generated_pdf",
                                                created_at: "2026-05-01T12:00:00.000Z",
                                            },
                                        ],
                                        error: null,
                                    }),
                                };
                            },
                        };
                    },
                };
            }
            if (table === "documents") {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    in: async () => ({
                                        data: [
                                            {
                                                id: DOC_PDF,
                                                name: null,
                                                title: "Guardian Form (generated)",
                                                original_filename: "guardian_stub.pdf",
                                                created_at: "2026-05-01T12:00:00.000Z",
                                                metadata: {
                                                    idempotency_key: `forms_generated_pdf:v1:${SUB_PDF}:${VER_PDF}:guardian_stub`,
                                                },
                                                template_key: "guardian_stub",
                                            },
                                        ],
                                        error: null,
                                    }),
                                };
                            },
                        };
                    },
                };
            }
            if (table === "opportunities") {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    eq() {
                                        return {
                                            maybeSingle: async () => ({ data: { name: "Test Opp" }, error: null }),
                                        };
                                    },
                                };
                            },
                        };
                    },
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    } as unknown as SupabaseClient;
}

describe("packet review rollup helpers", () => {
    it("resolveArtifactKind — submitted step without PDF is submitted_record", () => {
        const r = resolveArtifactKind({
            itemStatus: "submitted",
            submissionStatus: "submitted",
            hasPdfMapping: false,
            generatedPdfCount: 0,
            operatorReviewStatus: "needs_review",
            sessionStatus: "completed",
        });
        expect(r.kind).toBe("submitted_record");
    });

    it("resolveArtifactKind — generated PDF when documents exist", () => {
        const r = resolveArtifactKind({
            itemStatus: "submitted",
            submissionStatus: "submitted",
            hasPdfMapping: true,
            generatedPdfCount: 1,
            operatorReviewStatus: "needs_review",
            sessionStatus: "completed",
        });
        expect(r.kind).toBe("generated_pdf");
    });

    it("assignGenerationLabels marks latest as current", () => {
        const labels = assignGenerationLabels([
            { id: "old", created_at: "2026-01-01T00:00:00.000Z" },
            { id: "new", created_at: "2026-06-01T00:00:00.000Z" },
        ]);
        expect(labels.get("new")).toBe("current");
        expect(labels.get("old")).toBe("also_generated");
    });

    it("hasUsablePdfMapping false for null mapping", () => {
        expect(hasUsablePdfMapping(null)).toBe(false);
        expect(hasUsablePdfMapping(PDF_MAPPING)).toBe(true);
    });

    it("missing optional provenance fields do not crash builder", async () => {
        const client = makeRollupClient();
        const r = await buildPacketReviewRollupV1(client, ORG, SESS);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const rec = r.rollup.documents_index.find((d) => d.form_submission_id === SUB_NOPDF);
        expect(rec?.provenance.generated_at).toBeNull();
        expect(rec?.provenance.idempotency_key).toBeNull();
    });
});

describe("buildPacketReviewRollupV1", () => {
    it("completed submitted step with generated PDF", async () => {
        const r = await buildPacketReviewRollupV1(makeRollupClient(), ORG, SESS);
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        expect(r.rollup.contract_version).toBe(1);
        expect(r.rollup.steps).toHaveLength(2);

        const pdfStep = r.rollup.steps.find((s) => s.form_submission_id === SUB_PDF);
        expect(pdfStep?.artifact.kind).toBe("generated_pdf");
        expect(pdfStep?.artifact.documents).toHaveLength(1);
        expect(pdfStep?.artifact.documents[0]?.generation_label).toBe("current");
        expect(pdfStep?.has_pdf_mapping).toBe(true);

        const pdfIndex = r.rollup.documents_index.filter((d) => d.kind === "generated_pdf");
        expect(pdfIndex.length).toBeGreaterThanOrEqual(1);
        expect(pdfIndex[0]?.provenance.form_name).toBe("Guardian PDF Form");
        expect(pdfIndex[0]?.provenance.version_number).toBe(2);
        expect(pdfIndex[0]?.document_id).toBe(DOC_PDF);
    });

    it("submitted step with no PDF returns submitted_record artifact", async () => {
        const r = await buildPacketReviewRollupV1(makeRollupClient(), ORG, SESS);
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        const ackStep = r.rollup.steps.find((s) => s.form_submission_id === SUB_NOPDF);
        expect(ackStep?.artifact.kind).toBe("submitted_record");
        expect(ackStep?.has_pdf_mapping).toBe(false);
        expect(ackStep?.artifact.documents).toHaveLength(0);

        const rec = r.rollup.documents_index.find(
            (d) => d.kind === "submitted_record" && d.form_submission_id === SUB_NOPDF
        );
        expect(rec).toBeDefined();
        expect(rec?.document_id).toBeNull();
        expect(rec?.provenance.generated_at).toBeNull();
    });

    it("labels resolve from schema_json in answer_view", async () => {
        const r = await buildPacketReviewRollupV1(makeRollupClient(), ORG, SESS);
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        const pdfStep = r.rollup.steps.find((s) => s.form_submission_id === SUB_PDF);
        expect(pdfStep?.answer_view).not.toBeNull();
        const schema = validateFormSchema(pdfStep?.answer_view?.schema_json);
        const field = schema.fields.find((f) => f.id === "guardian_first_name");
        expect(field?.label).toBe("Guardian first name");
    });

    it("includes operator review warnings from session", async () => {
        const r = await buildPacketReviewRollupV1(makeRollupClient(), ORG, SESS);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.rollup.operator_review.warnings).toHaveLength(1);
        expect(r.rollup.operator_review.warnings[0]?.message).toContain("Name mismatch");
    });

    it("returns 404 when session missing", async () => {
        const empty = {
            from() {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    eq() {
                                        return {
                                            maybeSingle: async () => ({ data: null, error: null }),
                                        };
                                    },
                                };
                            },
                        };
                    },
                };
            },
        } as unknown as SupabaseClient;
        const r = await buildPacketReviewRollupV1(empty, ORG, SESS);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.httpStatus).toBe(404);
    });
});
