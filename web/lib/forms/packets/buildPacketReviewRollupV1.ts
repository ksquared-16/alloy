import type { SupabaseClient } from "@supabase/supabase-js";
import { dbListSubmissionLinkedDocumentsForSubmissionIds } from "@/lib/admin/forms/formsAdminDb";
import {
    adminPacketSessionPath,
    adminSubmissionPath,
    assignGenerationLabels,
    buildDocumentProvenanceV1,
    documentDisplayName,
    hasUsablePdfMapping,
    listGeneratedPdfDocuments,
    normalizeOperatorReviewStatus,
    normalizeOperatorReviewWarnings,
    parseSubmissionIntakeMeta,
    resolveArtifactKind,
    resolveIdempotencyKeyForDocument,
    submissionHasCrmFk,
    type PdfDocumentRow,
} from "@/lib/forms/packets/documentProvenanceFromSubmission";
import type {
    PacketReviewDocumentIndexEntryV1,
    PacketReviewRollupStepV1,
    PacketReviewRollupV1,
} from "@/lib/forms/packets/packetReviewRollupTypes";
import { parseFormPdfMappingJson } from "@/lib/forms/pdf/pdfMappingContract";
import { validateFormSchema } from "@/lib/forms/schema";

const MAX_STEPS = 30;

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BuildPacketReviewRollupResult =
    | { ok: true; rollup: PacketReviewRollupV1 }
    | { ok: false; error: string; httpStatus: number };

type SessionRow = {
    id: string;
    org_id: string;
    status: string;
    packet_definition_id: string;
    current_sequence_index: number | null;
    crm_snapshot: unknown;
    launch_context: unknown;
    operator_review_status: unknown;
    operator_review_warnings: unknown;
    operator_review_notes: unknown;
    operator_reviewed_at: unknown;
    operator_reviewed_by_user_id: unknown;
    form_packet_definitions:
        | { id: string; name: string; key: string | null }
        | { id: string; name: string; key: string | null }[]
        | null;
};

type ItemRow = {
    id: string;
    sequence_index: number;
    status: string;
    submitted_at: string | null;
    form_submission_id: string | null;
    packet_item_id: string;
};

type SubmissionRow = {
    id: string;
    status: string;
    submitted_at: string | null;
    payload: unknown;
    form_definition_id: string;
    form_definition_version_id: string;
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
};

type VersionRow = {
    id: string;
    version_number: number;
    schema_json: unknown;
    pdf_mapping_json: unknown;
};

function parseUuid(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return UUID_RE.test(t) ? t : null;
}

function recordOrEmpty(v: unknown): Record<string, unknown> {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function packetDefFromSession(sess: SessionRow): { id: string; name: string; key: string | null } {
    const raw = sess.form_packet_definitions;
    const row = Array.isArray(raw) ? raw[0] : raw;
    return {
        id: sess.packet_definition_id,
        name: typeof row?.name === "string" && row.name.trim() ? row.name.trim() : "Packet",
        key: typeof row?.key === "string" && row.key.trim() ? row.key.trim() : null,
    };
}

async function loadDisplayNames(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string | null,
    customerId: string | null
): Promise<{ opportunity_label: string | null; customer_label: string | null }> {
    let opportunity_label: string | null = null;
    let customer_label: string | null = null;
    if (opportunityId) {
        const { data } = await supabase
            .from("opportunities")
            .select("name")
            .eq("id", opportunityId)
            .eq("org_id", orgId)
            .maybeSingle();
        const n = (data as { name?: string | null } | null)?.name;
        opportunity_label = typeof n === "string" && n.trim() ? n.trim() : null;
    }
    if (customerId) {
        const { data } = await supabase
            .from("customers")
            .select("name")
            .eq("id", customerId)
            .eq("org_id", orgId)
            .maybeSingle();
        const n = (data as { name?: string | null } | null)?.name;
        customer_label = typeof n === "string" && n.trim() ? n.trim() : null;
    }
    return { opportunity_label, customer_label };
}

async function loadPdfDocumentRows(
    supabase: SupabaseClient,
    orgId: string,
    documentIds: string[]
): Promise<Map<string, PdfDocumentRow>> {
    const map = new Map<string, PdfDocumentRow>();
    if (documentIds.length === 0) return map;
    const { data, error } = await supabase
        .from("documents")
        .select("id, name, title, original_filename, created_at, metadata, template_key")
        .eq("org_id", orgId)
        .in("id", documentIds);
    if (error || !data) return map;
    for (const row of data) {
        const r = row as PdfDocumentRow & { metadata?: unknown };
        map.set(r.id, {
            id: r.id,
            name: r.name ?? null,
            title: r.title ?? null,
            original_filename: r.original_filename ?? null,
            created_at: r.created_at ?? null,
            metadata:
                r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                    ? (r.metadata as Record<string, unknown>)
                    : null,
            template_key: r.template_key ?? null,
        });
    }
    return map;
}

function buildAnswerView(
    schemaJson: unknown,
    payload: unknown
): PacketReviewRollupStepV1["answer_view"] {
    try {
        const schema = validateFormSchema(schemaJson);
        return {
            schema_json: schema,
            payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : { values: {}, groups: {}, signatures: {} },
        };
    } catch {
        return null;
    }
}

/**
 * Read-only assembler for operator packet review (PacketReviewRollupV1).
 */
export async function buildPacketReviewRollupV1(
    supabase: SupabaseClient,
    orgId: string,
    packetSessionId: string
): Promise<BuildPacketReviewRollupResult> {
    const { data: sessionRaw, error: sErr } = await supabase
        .from("form_packet_sessions")
        .select(
            `
        id,
        org_id,
        status,
        packet_definition_id,
        current_sequence_index,
        crm_snapshot,
        launch_context,
        operator_review_status,
        operator_review_warnings,
        operator_review_notes,
        operator_reviewed_at,
        operator_reviewed_by_user_id,
        form_packet_definitions ( id, name, key )
      `
        )
        .eq("id", packetSessionId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (sErr) return { ok: false, error: sErr.message, httpStatus: 500 };
    if (!sessionRaw) return { ok: false, error: "Not found", httpStatus: 404 };

    const sess = sessionRaw as SessionRow;
    const packetDef = packetDefFromSession(sess);
    const snap = recordOrEmpty(sess.crm_snapshot);
    const launch = recordOrEmpty(sess.launch_context);

    const opportunityId = parseUuid(snap.opportunity_id);
    const customerId = parseUuid(snap.customer_id);
    const recipientPersonId = parseUuid(snap.person_id);
    const launchSurface = typeof launch.launch_surface === "string" ? launch.launch_surface.trim() : null;

    const { opportunity_label, customer_label } = await loadDisplayNames(supabase, orgId, opportunityId, customerId);

    const { data: itemsRaw, error: iErr } = await supabase
        .from("form_packet_session_items")
        .select("id, sequence_index, status, submitted_at, form_submission_id, packet_item_id")
        .eq("packet_session_id", packetSessionId)
        .eq("org_id", orgId)
        .order("sequence_index", { ascending: true });

    if (iErr) return { ok: false, error: iErr.message, httpStatus: 500 };

    const items = ((itemsRaw ?? []) as ItemRow[]).slice(0, MAX_STEPS);
    const packetItemIds = [...new Set(items.map((i) => i.packet_item_id))];

    const defItemMap: Record<string, { form_definition_id: string }> = {};
    if (packetItemIds.length > 0) {
        const { data: di, error: dErr } = await supabase
            .from("form_packet_items")
            .select("id, form_definition_id")
            .in("id", packetItemIds)
            .eq("org_id", orgId);
        if (dErr) return { ok: false, error: dErr.message, httpStatus: 500 };
        for (const row of di ?? []) {
            const r = row as { id: string; form_definition_id: string };
            defItemMap[r.id] = { form_definition_id: r.form_definition_id };
        }
    }

    const formIds = [...new Set(Object.values(defItemMap).map((d) => d.form_definition_id))];
    const formMeta: Record<string, { name: string; key: string }> = {};
    if (formIds.length > 0) {
        const { data: forms, error: fErr } = await supabase
            .from("form_definitions")
            .select("id, name, key")
            .in("id", formIds)
            .eq("org_id", orgId);
        if (fErr) return { ok: false, error: fErr.message, httpStatus: 500 };
        for (const row of forms ?? []) {
            const r = row as { id: string; name: string; key: string };
            formMeta[r.id] = { name: r.name, key: r.key };
        }
    }

    const submissionIds = [
        ...new Set(items.map((i) => i.form_submission_id).filter((id): id is string => Boolean(id))),
    ];

    const submissionById = new Map<string, SubmissionRow>();
    if (submissionIds.length > 0) {
        const { data: subs, error: subErr } = await supabase
            .from("form_submissions")
            .select(
                "id, status, submitted_at, payload, form_definition_id, form_definition_version_id, person_id, customer_id, customer_member_id, opportunity_id"
            )
            .eq("org_id", orgId)
            .in("id", submissionIds);
        if (subErr) return { ok: false, error: subErr.message, httpStatus: 500 };
        for (const row of subs ?? []) {
            submissionById.set((row as SubmissionRow).id, row as SubmissionRow);
        }
    }

    const versionIds = [
        ...new Set(
            [...submissionById.values()]
                .map((s) => s.form_definition_version_id)
                .filter((id) => UUID_RE.test(id))
        ),
    ];
    const versionById = new Map<string, VersionRow>();
    if (versionIds.length > 0) {
        const { data: vers, error: vErr } = await supabase
            .from("form_definition_versions")
            .select("id, version_number, schema_json, pdf_mapping_json")
            .eq("org_id", orgId)
            .in("id", versionIds);
        if (vErr) return { ok: false, error: vErr.message, httpStatus: 500 };
        for (const row of vers ?? []) {
            versionById.set((row as VersionRow).id, row as VersionRow);
        }
    }

    const linkedBatch = await dbListSubmissionLinkedDocumentsForSubmissionIds(supabase, orgId, submissionIds);
    if (linkedBatch.error) {
        return { ok: false, error: linkedBatch.error.message, httpStatus: 500 };
    }
    const linkedBySubmission = linkedBatch.data ?? {};

    const allDocIds = new Set<string>();
    for (const sid of submissionIds) {
        for (const entry of linkedBySubmission[sid] ?? []) {
            if (entry.role === "generated_pdf") allDocIds.add(entry.document.id);
        }
    }
    const docRowsById = await loadPdfDocumentRows(supabase, orgId, [...allDocIds]);

    const operatorReviewStatus = normalizeOperatorReviewStatus(sess.operator_review_status);
    const sessionStatus = String(sess.status ?? "in_progress") as PacketReviewRollupV1["status"];

    const steps: PacketReviewRollupStepV1[] = [];
    const documents_index: PacketReviewDocumentIndexEntryV1[] = [];
    const linkageSteps: PacketReviewRollupV1["linkage_summary"]["steps"] = [];
    let submitted_steps = 0;
    let any_intake_needs_review = false;
    let steps_missing_crm_fk = 0;

    const packetSessionPath = adminPacketSessionPath(packetSessionId);

    for (const item of items) {
        const sub = item.form_submission_id ? submissionById.get(item.form_submission_id) : undefined;
        const fdid = defItemMap[item.packet_item_id]?.form_definition_id ?? sub?.form_definition_id ?? "";
        const fm = fdid ? formMeta[fdid] : undefined;
        const form_name = fm?.name ?? "Form";
        const form_key = fm?.key ?? null;
        const submission_status =
            sub?.status === "draft" || sub?.status === "submitted" ? sub.status : null;
        if (item.status === "submitted" || submission_status === "submitted") {
            submitted_steps += 1;
        }

        const ver = sub ? versionById.get(sub.form_definition_version_id) : undefined;
        const has_pdf_mapping = ver ? hasUsablePdfMapping(ver.pdf_mapping_json) : false;
        const mapping = ver ? parseFormPdfMappingJson(ver.pdf_mapping_json) : null;
        const templateKey = mapping?.template_key?.trim() || "form_submission_stub";

        const intake_meta = sub ? parseSubmissionIntakeMeta(sub.payload) : null;
        if (intake_meta?.intake_needs_review) any_intake_needs_review = true;
        const has_crm_fk = submissionHasCrmFk(sub);
        if (sub && sub.status === "submitted" && !has_crm_fk) steps_missing_crm_fk += 1;

        const subPath =
            sub && fdid ? adminSubmissionPath(fdid, sub.id) : item.form_submission_id && fdid ? adminSubmissionPath(fdid, item.form_submission_id) : null;

        linkageSteps.push({
            sequence_index: item.sequence_index,
            form_name,
            intake_needs_review: intake_meta?.intake_needs_review ?? false,
            has_crm_fk,
            admin_submission_path: subPath,
        });

        const linked = sub ? (linkedBySubmission[sub.id] ?? []) : [];
        const pdfPairs = sub ? listGeneratedPdfDocuments(linked, docRowsById) : [];
        const genLabels = assignGenerationLabels(pdfPairs.map((p) => ({ id: p.doc.id, created_at: p.doc.created_at })));

        const artifactResolved = resolveArtifactKind({
            itemStatus: item.status,
            submissionStatus: submission_status,
            hasPdfMapping: has_pdf_mapping,
            generatedPdfCount: pdfPairs.length,
            operatorReviewStatus,
            sessionStatus,
        });

        const artifactDocuments = pdfPairs.map(({ doc }) => ({
            id: doc.id,
            name: documentDisplayName(doc),
            generation_label: genLabels.get(doc.id) ?? ("current" as const),
        }));

        const answer_view =
            sub && sub.status === "submitted" && ver ? buildAnswerView(ver.schema_json, sub.payload) : null;

        steps.push({
            sequence_index: item.sequence_index,
            session_item_id: item.id,
            item_status: item.status,
            submitted_at: item.submitted_at,
            form_definition_id: fdid,
            form_name,
            form_key,
            form_submission_id: item.form_submission_id,
            submission_status,
            form_definition_version_id: ver?.id ?? sub?.form_definition_version_id ?? null,
            version_number: ver?.version_number ?? null,
            has_pdf_mapping,
            artifact: {
                kind: artifactResolved.kind,
                label: artifactResolved.label,
                documents: artifactDocuments,
                admin_submission_path: subPath,
                helper_text: artifactResolved.helper_text,
            },
            answer_view,
            intake_meta,
        });

        if (!sub || sub.status !== "submitted" || !ver) continue;

        const versionId = ver.id;
        const versionNumber = ver.version_number ?? 0;
        const submissionSubmittedAt = sub.submitted_at;

        for (const { doc, linked: linkRow } of pdfPairs) {
            const generation_label = genLabels.get(doc.id) ?? "current";
            const idempotency_key = resolveIdempotencyKeyForDocument(doc, null, {
                formSubmissionId: sub.id,
                formDefinitionVersionId: versionId,
                templateKey,
            });
            const provenance = buildDocumentProvenanceV1({
                formDefinitionId: fdid,
                formName: form_name,
                formDefinitionVersionId: versionId,
                versionNumber,
                formSubmissionId: sub.id,
                submissionSubmittedAt,
                generatedAt: doc.created_at,
                templateKey: doc.template_key ?? templateKey,
                idempotencyKey: idempotency_key,
                generationLabel: generation_label,
            });
            const title = documentDisplayName(doc) ?? `${form_name} (generated)`;
            documents_index.push({
                kind: "generated_pdf",
                step_sequence_index: item.sequence_index,
                form_name,
                form_submission_id: sub.id,
                document_id: doc.id,
                title,
                provenance,
                admin_links: {
                    submission_path: adminSubmissionPath(fdid, sub.id),
                    packet_session_path: packetSessionPath,
                },
            });
            void linkRow;
        }

        if (artifactResolved.kind === "submitted_record") {
            const schemaTitle =
                ver.schema_json &&
                typeof ver.schema_json === "object" &&
                !Array.isArray(ver.schema_json) &&
                typeof (ver.schema_json as { title?: unknown }).title === "string"
                    ? String((ver.schema_json as { title: string }).title).trim()
                    : form_name;
            documents_index.push({
                kind: "submitted_record",
                step_sequence_index: item.sequence_index,
                form_name,
                form_submission_id: sub.id,
                document_id: null,
                title: schemaTitle,
                provenance: buildDocumentProvenanceV1({
                    formDefinitionId: fdid,
                    formName: form_name,
                    formDefinitionVersionId: versionId,
                    versionNumber,
                    formSubmissionId: sub.id,
                    submissionSubmittedAt,
                    generatedAt: null,
                    templateKey: null,
                    idempotencyKey: null,
                    generationLabel: "current",
                }),
                admin_links: {
                    submission_path: adminSubmissionPath(fdid, sub.id),
                    packet_session_path: packetSessionPath,
                },
            });
        }
    }

    const rollup: PacketReviewRollupV1 = {
        contract_version: 1,
        packet_session_id: packetSessionId,
        org_id: orgId,
        status: sessionStatus,
        operator_review: {
            status: operatorReviewStatus,
            warnings: normalizeOperatorReviewWarnings(sess.operator_review_warnings),
            notes:
                typeof sess.operator_review_notes === "string" && sess.operator_review_notes.trim()
                    ? sess.operator_review_notes.trim()
                    : null,
            reviewed_at:
                typeof sess.operator_reviewed_at === "string" && sess.operator_reviewed_at.trim()
                    ? sess.operator_reviewed_at
                    : null,
            reviewed_by_user_id: parseUuid(sess.operator_reviewed_by_user_id),
        },
        packet_definition: packetDef,
        enrollment_context: {
            opportunity_id: opportunityId,
            opportunity_label,
            customer_id: customerId,
            customer_label,
            launch_surface: launchSurface || null,
            recipient_person_id: recipientPersonId,
        },
        progress: {
            total_steps: items.length,
            submitted_steps,
            current_sequence_index:
                typeof sess.current_sequence_index === "number" ? sess.current_sequence_index : null,
        },
        linkage_summary: {
            any_intake_needs_review,
            steps_missing_crm_fk,
            steps: linkageSteps,
        },
        steps,
        documents_index,
    };

    return { ok: true, rollup };
}
