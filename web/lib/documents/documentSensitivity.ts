/**
 * Sensitive document classes. A document's subject being readable is not enough to read it (D1b.6).
 *
 * The D1a decision answers "may this actor read documents, and is this document's subject in their
 * scope?". For some documents that is not the whole question. An operator with `documents.read` who
 * can see a child can still not be shown that child's immunization record or the evidence behind a
 * custody restriction. Those carry their own authority:
 *
 *   medical      → `health.view` (Medical's permission key; admin-only by default, never ops).
 *                  It is the same classification the database already enforces on medical rows
 *                  (migration 20261204090000): doc_type physical / immunization_record /
 *                  health_care_plan / medication_authorization, and any document linked to a
 *                  submission of a medical form.
 *   safeguarding → the safeguarding VIEW authority (`canViewSafeguarding`, owner/admin/ops). This is
 *                  the document cited as evidence by a child safeguarding restriction.
 *
 * FAILS CLOSED. If a classification cannot be read, the document is treated as sensitive in every
 * class, and an actor who holds neither authority is refused.
 *
 * D2 adds the DECLARED class on the document itself (`documents.sensitivity`: standard | personal_identity |
 * medical | custody_safeguarding | restricted). A document carries the UNION of its declared class and the
 * inferred ones above, so a declaration can only add a restriction, never remove one:
 *
 *   personal_identity → an `owner` or `admin` role
 *   restricted        → an `owner` or `admin` role
 *
 * Both are role clearances, the safeguarding model, and not new permission keys: minting catalog keys is a Director
 * decision (W-11) and is recorded as a D3 prerequisite. No document carried either class when D2 shipped.
 *
 * An unknown declared value counts as `restricted`. Before the D2 migration has reached a database the column
 * does not exist (42703); then no document can carry a declared class beyond the inferred ones, and only the
 * inference applies. Any other read failure fails closed in every class.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { HEALTH_VIEW_PERMISSION } from "@/lib/health/healthAccess";
import { canViewSafeguarding } from "@/lib/safeguarding/safeguardingAuthority";

export type DocumentSensitivityClass = "medical" | "safeguarding" | "personal_identity" | "restricted";

/** The declared vocabulary of `documents.sensitivity` (migration 20261208090000). */
export const DECLARED_DOCUMENT_SENSITIVITIES = Object.freeze([
    "standard",
    "personal_identity",
    "medical",
    "custody_safeguarding",
    "restricted",
] as const);
export type DeclaredDocumentSensitivity = (typeof DECLARED_DOCUMENT_SENSITIVITIES)[number];

/** Roles cleared for `personal_identity` and `restricted` documents. */
export const DOCUMENT_ELEVATED_CLEARANCE_ROLES: readonly string[] = Object.freeze(["owner", "admin"]);

function holdsElevatedClearance(roleKeys: readonly string[] | null | undefined): boolean {
    const held = new Set((roleKeys ?? []).map((r) => String(r).trim()));
    return DOCUMENT_ELEVATED_CLEARANCE_ROLES.some((r) => held.has(r));
}

/**
 * The class a declared value imposes. `standard` imposes none; an unknown value is `restricted`. A row that carries no
 * value at all imposes none: the column is NOT NULL, so that is only a reader that did not select it.
 */
export function classForDeclaredSensitivity(value: unknown): DocumentSensitivityClass | null {
    if (value === undefined || value === null) return null;
    switch (value) {
        case "standard":
            return null;
        case "medical":
            return "medical";
        case "custody_safeguarding":
            return "safeguarding";
        case "personal_identity":
            return "personal_identity";
        default:
            return "restricted";
    }
}

/** Must equal the doc_type list of the `documents_medical_*` restrictive policies. */
export const MEDICAL_DOCUMENT_TYPES: readonly string[] = Object.freeze([
    "physical",
    "immunization_record",
    "health_care_plan",
    "medication_authorization",
]);

export type SensitivityActor = { roleKeys?: readonly string[] | null; permissionKeys?: readonly string[] | null };

export function actorMayReadSensitivity(actor: SensitivityActor, classes: ReadonlySet<DocumentSensitivityClass>): boolean {
    if (classes.has("medical") && !(actor.permissionKeys ?? []).includes(HEALTH_VIEW_PERMISSION)) return false;
    if (classes.has("safeguarding") && !canViewSafeguarding(actor.roleKeys ?? [])) return false;
    if ((classes.has("personal_identity") || classes.has("restricted")) && !holdsElevatedClearance(actor.roleKeys)) return false;
    return true;
}

const ALL_CLASSES: ReadonlySet<DocumentSensitivityClass> = new Set<DocumentSensitivityClass>([
    "medical",
    "safeguarding",
    "personal_identity",
    "restricted",
]);

/**
 * The sensitive classes of each document. Each row needs `id`; `doc_type` is used when present.
 * Every id gets an entry, and an empty set means not sensitive.
 */
export async function resolveDocumentSensitivity(
    supabase: SupabaseClient,
    orgId: string,
    docs: ReadonlyArray<{ id: string; doc_type?: string | null }>,
): Promise<Map<string, ReadonlySet<DocumentSensitivityClass>>> {
    const out = new Map<string, Set<DocumentSensitivityClass>>();
    // Only real document ids are looked up. A display row with a synthetic id (e.g. a packet
    // "submitted record") is not a document and carries no linkage.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = [...new Set(docs.map((d) => d.id).filter((id) => Boolean(id) && UUID.test(id)))];
    for (const d of docs) {
        const set = out.get(d.id) ?? new Set<DocumentSensitivityClass>();
        if (d.doc_type && MEDICAL_DOCUMENT_TYPES.includes(String(d.doc_type).trim())) set.add("medical");
        out.set(d.id, set);
    }
    if (ids.length === 0) return out;

    const failClosed = () => {
        for (const id of ids) out.set(id, new Set(ALL_CLASSES));
        return out;
    };

    try {
        // The declared class (D2). The column is absent only before the D2 migration has reached this database.
        const { data: declared, error: declaredErr } = await supabase
            .from("documents")
            .select("id, sensitivity")
            .eq("org_id", orgId)
            .in("id", ids);
        if (declaredErr) {
            if ((declaredErr as { code?: string }).code !== "42703") return failClosed();
        } else {
            for (const row of (declared ?? []) as Array<{ id: string; sensitivity?: unknown }>) {
                const cls = classForDeclaredSensitivity(row.sensitivity);
                if (cls) out.get(row.id)?.add(cls);
            }
        }

        // Safeguarding evidence: cited by any restriction in this org, in any state.
        const { data: sg, error: sgErr } = await supabase
            .from("child_safeguarding_restrictions")
            .select("evidence_document_id")
            .eq("org_id", orgId)
            .in("evidence_document_id", ids);
        if (sgErr) return failClosed();
        for (const row of (sg ?? []) as Array<{ evidence_document_id: string | null }>) {
            if (row.evidence_document_id) out.get(row.evidence_document_id)?.add("safeguarding");
        }

        // Medical by linkage: a document attached to a submission of a medical form.
        const { data: links, error: linkErr } = await supabase
            .from("form_submission_documents")
            .select("document_id, form_submission_id")
            .eq("org_id", orgId)
            .in("document_id", ids);
        if (linkErr) return failClosed();
        const bySubmission = new Map<string, string[]>();
        for (const l of (links ?? []) as Array<{ document_id: string; form_submission_id: string }>) {
            const list = bySubmission.get(l.form_submission_id) ?? [];
            list.push(l.document_id);
            bySubmission.set(l.form_submission_id, list);
        }
        for (const [submissionId, docIds] of bySubmission) {
            const { data: medical, error } = await supabase.rpc("is_medical_form_submission", { _form_submission_id: submissionId });
            if (error) return failClosed();
            if (medical === true) for (const id of docIds) out.get(id)?.add("medical");
        }
    } catch {
        return failClosed();
    }
    return out;
}

/** Keep only the rows this actor may read in every sensitive class the row carries. */
export async function filterDocumentRowsBySensitivity<T extends { id?: unknown; doc_type?: unknown }>(
    supabase: SupabaseClient,
    orgId: string,
    actor: SensitivityActor,
    rows: T[],
): Promise<T[]> {
    const docs = rows
        .map((r) => ({ id: typeof r.id === "string" ? r.id : "", doc_type: typeof r.doc_type === "string" ? r.doc_type : null }))
        .filter((d) => d.id);
    if (docs.length === 0) return [];
    const classes = await resolveDocumentSensitivity(supabase, orgId, docs);
    return rows.filter((r) => {
        const id = typeof r.id === "string" ? r.id : "";
        if (!id) return false;
        return actorMayReadSensitivity(actor, classes.get(id) ?? new Set());
    });
}
