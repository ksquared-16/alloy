/**
 * A4 + subject fixes — database side.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md §4ter
 *
 * Runs AFTER A1–A3 have resolved, because every rule here is expressed against the identities and
 * cases already selected. Returns additional ids plus a classification report, and surfaces
 * ambiguity for the caller to abort on.
 */

import type { createAdminClient } from "@/lib/supabaseAdmin";
import { chunk } from "./demoRuntimeCleanupScope";
import {
    A4_TABLES,
    classifySubjectlessRow,
    classifyThread,
    classifyWorkflowEvent,
    isReusableDocument,
    type A4Table,
    type ResidueDecision,
} from "./certificationResidueSelection";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;
const PAGE = 1000;

async function readAll(
    supabase: SupabaseAdmin,
    table: string,
    columns: string,
    orgId: string,
): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from(table)
            .select(columns)
            .eq("org_id", orgId)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`[residue read ${table}] ${error.message}`);
        const page = (data ?? []) as unknown as Array<Record<string, unknown>>;
        out.push(...page);
        if (page.length < PAGE) break;
    }
    return out;
}

export type CertificationResidueResolution = {
    /** Documents reached through processing_case_sources (A3 extension) plus A4 subjectless ones. */
    documentIds: string[];
    formSubmissionIds: string[];
    formPacketSessionIds: string[];
    contactIds: string[];
    operationalTaskIds: string[];
    threadIds: string[];
    workflowEventIds: string[];
    /** Storage objects to remove alongside the document rows, as `bucket/path`. */
    storageObjects: Array<{ bucket: string; path: string; documentId: string }>;
    /** Workflow events deliberately kept, with the reason. */
    preservedWorkflowEvents: ResidueDecision[];
    preserved: ResidueDecision[];
    ambiguous: ResidueDecision[];
    /** Operator-facing counts by reason. */
    report: Record<string, number>;
};

export async function resolveCertificationResidue(
    supabase: SupabaseAdmin,
    orgId: string,
    resolved: {
        opportunityIds: string[];
        personIds: string[];
        customerIds: string[];
        customerMemberIds: string[];
        processingCaseIds: string[];
    },
): Promise<CertificationResidueResolution> {
    const deleted = {
        opportunityIds: new Set(resolved.opportunityIds),
        personIds: new Set(resolved.personIds),
        customerIds: new Set(resolved.customerIds),
        memberIds: new Set(resolved.customerMemberIds),
    };
    const preserved: ResidueDecision[] = [];
    const ambiguous: ResidueDecision[] = [];
    const report: Record<string, number> = {};
    const bump = (k: string, n = 1) => {
        report[k] = (report[k] ?? 0) + n;
    };

    // --- A3 EXTENSION: artifacts a Processing case was built from -----------------------------
    // A case's source document is subjected to the CASE, through the source join — not through
    // `entity_id`. Deleting the case and leaving the upload is what produced most of the residue.
    const caseSourceDocIds = new Set<string>();
    const caseSourceSubmissionIds = new Set<string>();
    const caseSourcePacketIds = new Set<string>();
    for (const part of chunk(resolved.processingCaseIds, 200)) {
        const { data, error } = await supabase
            .from("processing_case_sources")
            .select("source_kind, source_id")
            .eq("org_id", orgId)
            .in("processing_case_id", part);
        if (error) throw new Error(`[residue processing_case_sources] ${error.message}`);
        for (const r of data ?? []) {
            const kind = String((r as { source_kind?: string }).source_kind ?? "");
            const sid = (r as { source_id?: string }).source_id;
            if (!sid) continue;
            if (kind === "document") caseSourceDocIds.add(sid);
            else if (kind === "form_submission") caseSourceSubmissionIds.add(sid);
            else if (kind === "form_packet_session") caseSourcePacketIds.add(sid);
        }
    }
    bump("documents_via_processing_source", caseSourceDocIds.size);
    bump("form_submissions_via_processing_source", caseSourceSubmissionIds.size);
    bump("form_packet_sessions_via_processing_source", caseSourcePacketIds.size);

    // --- DOCUMENTS ---------------------------------------------------------------------------
    const docs = await readAll(
        supabase,
        "documents",
        "id, entity_type, entity_id, doc_type, template_key, generated_from_document_id, bucket, storage_path",
        orgId,
    );
    const documentIds = new Set<string>();
    const storageObjects: CertificationResidueResolution["storageObjects"] = [];
    const subjectIsDeleted = (t: unknown, i: unknown): boolean => {
        const type = String(t ?? "");
        const id = String(i ?? "");
        if (!id) return false;
        if (type === "opportunities") return deleted.opportunityIds.has(id);
        if (type === "person" || type === "persons") return deleted.personIds.has(id);
        if (type === "customers" || type === "customer") return deleted.customerIds.has(id);
        if (type === "customer_members") return deleted.memberIds.has(id);
        return false;
    };

    for (const d of docs) {
        const id = String(d.id);
        if (isReusableDocument(d) && !d.entity_id) {
            const dec = { id, verdict: "preserve" as const, reason: "reusable document template/configuration" };
            preserved.push(dec);
            bump("documents_preserved_reusable");
            continue;
        }
        if (caseSourceDocIds.has(id)) {
            documentIds.add(id);
            bump("documents_deleted_processing_source");
        } else if (subjectIsDeleted(d.entity_type, d.entity_id)) {
            documentIds.add(id);
            bump("documents_deleted_subject_removed");
        } else if (!d.entity_type && !d.entity_id) {
            const dec = classifySubjectlessRow("documents", d, { reusable: isReusableDocument(d) });
            if (dec.verdict === "delete") {
                documentIds.add(id);
                bump("documents_deleted_subjectless");
            } else if (dec.verdict === "preserve") preserved.push(dec);
            else ambiguous.push(dec);
        } else {
            preserved.push({ id, verdict: "preserve", reason: `subject ${String(d.entity_type)} survives` });
            bump("documents_preserved_subject_survives");
        }
    }
    for (const d of docs) {
        if (!documentIds.has(String(d.id))) continue;
        const path = d.storage_path ? String(d.storage_path) : "";
        if (path) storageObjects.push({ bucket: String(d.bucket ?? "org_documents"), path, documentId: String(d.id) });
    }

    // --- FORM SUBMISSIONS + PACKET SESSIONS ----------------------------------------------------
    const subs = await readAll(
        supabase,
        "form_submissions",
        "id, opportunity_id, person_id, customer_id, customer_member_id",
        orgId,
    );
    const formSubmissionIds = new Set<string>(caseSourceSubmissionIds);
    for (const s of subs) {
        const id = String(s.id);
        if (formSubmissionIds.has(id)) continue;
        // Subject fix: follow customer/person/member, not just opportunity.
        const bound =
            (s.opportunity_id && deleted.opportunityIds.has(String(s.opportunity_id))) ||
            (s.person_id && deleted.personIds.has(String(s.person_id))) ||
            (s.customer_id && deleted.customerIds.has(String(s.customer_id))) ||
            (s.customer_member_id && deleted.memberIds.has(String(s.customer_member_id)));
        if (bound) {
            formSubmissionIds.add(id);
            bump("form_submissions_deleted_subject_removed");
            continue;
        }
        const anySubject = s.opportunity_id || s.person_id || s.customer_id || s.customer_member_id;
        if (!anySubject) {
            formSubmissionIds.add(id);
            bump("form_submissions_deleted_subjectless");
        } else {
            preserved.push({ id, verdict: "preserve", reason: "submission subject survives the reset" });
            bump("form_submissions_preserved");
        }
    }

    const packets = await readAll(supabase, "form_packet_sessions", "id, started_via_public_link_id, status", orgId);
    const formPacketSessionIds = new Set<string>(caseSourcePacketIds);
    for (const p of packets) {
        const id = String(p.id);
        if (!formPacketSessionIds.has(id)) {
            // A packet session is an operational instance; its DEFINITION is the configuration.
            formPacketSessionIds.add(id);
            bump("form_packet_sessions_deleted_operational_instance");
        }
    }

    // --- CONTACTS ------------------------------------------------------------------------------
    const contacts = await readAll(supabase, "contacts", "id, customer_id, person_id, vendor_id", orgId);
    const docOwnerIds = new Set(docs.filter((d) => d.owner_contact_id).map((d) => String(d.owner_contact_id)));
    const contactIds = new Set<string>();
    for (const ct of contacts) {
        const id = String(ct.id);
        if (ct.vendor_id) {
            preserved.push({ id, verdict: "preserve", reason: "vendor directory contact, not operational" });
            bump("contacts_preserved_vendor");
            continue;
        }
        const bound =
            (ct.customer_id && deleted.customerIds.has(String(ct.customer_id))) ||
            (ct.person_id && deleted.personIds.has(String(ct.person_id)));
        if (bound) {
            contactIds.add(id);
            bump("contacts_deleted_subject_removed");
            continue;
        }
        const dec = classifySubjectlessRow("contacts", ct, { protectedRefIds: docOwnerIds });
        if (dec.verdict === "delete") {
            contactIds.add(id);
            bump("contacts_deleted_subjectless");
        } else if (dec.verdict === "preserve") {
            preserved.push(dec);
            bump("contacts_preserved");
        } else ambiguous.push(dec);
    }

    // --- OPERATIONAL TASKS ---------------------------------------------------------------------
    const tasks = await readAll(supabase, "operational_tasks", "id, entity_type, entity_id", orgId);
    const operationalTaskIds = new Set<string>();
    for (const t of tasks) {
        const id = String(t.id);
        if (subjectIsDeleted(t.entity_type, t.entity_id)) {
            operationalTaskIds.add(id);
            bump("operational_tasks_deleted_subject_removed");
            continue;
        }
        if (!t.entity_type && !t.entity_id) {
            operationalTaskIds.add(id);
            bump("operational_tasks_deleted_subjectless");
            continue;
        }
        const dec = classifySubjectlessRow("operational_tasks", t);
        if (dec.verdict === "ambiguous") ambiguous.push(dec);
        else {
            preserved.push({ id, verdict: "preserve", reason: "task subject survives the reset" });
            bump("operational_tasks_preserved");
        }
    }

    // --- COMMUNICATION THREADS -----------------------------------------------------------------
    const threads = await readAll(supabase, "communication_threads", "id, primary_entity_type, primary_entity_id", orgId);
    const threadIds = new Set<string>();
    for (const th of threads) {
        const dec = classifyThread(
            {
                id: String(th.id),
                primary_entity_type: th.primary_entity_type as string | null,
                primary_entity_id: th.primary_entity_id as string | null,
            },
            deleted,
        );
        if (dec.verdict === "delete") {
            threadIds.add(dec.id);
            bump("threads_deleted");
        } else if (dec.verdict === "preserve") {
            preserved.push(dec);
            bump("threads_preserved");
        } else ambiguous.push(dec);
    }

    // --- WORKFLOW EVENTS -----------------------------------------------------------------------
    const events = await readAll(supabase, "workflow_events", "id, entity_type", orgId);
    const workflowEventIds = new Set<string>();
    const preservedWorkflowEvents: ResidueDecision[] = [];
    for (const e of events) {
        const dec = classifyWorkflowEvent({ id: String(e.id), entity_type: e.entity_type as string | null });
        if (dec.verdict === "delete") {
            workflowEventIds.add(dec.id);
            bump("workflow_events_deleted");
        } else if (dec.verdict === "preserve") {
            preservedWorkflowEvents.push(dec);
            bump(`workflow_events_preserved_${String(e.entity_type)}`);
        } else ambiguous.push(dec);
    }

    return {
        documentIds: [...documentIds],
        formSubmissionIds: [...formSubmissionIds],
        formPacketSessionIds: [...formPacketSessionIds],
        contactIds: [...contactIds],
        operationalTaskIds: [...operationalTaskIds],
        threadIds: [...threadIds],
        workflowEventIds: [...workflowEventIds],
        storageObjects,
        preservedWorkflowEvents,
        preserved,
        ambiguous,
        report,
    };
}

/** A4 table names, exported for the delete order and verification. */
export const A4_TABLE_NAMES = Object.keys(A4_TABLES) as A4Table[];
