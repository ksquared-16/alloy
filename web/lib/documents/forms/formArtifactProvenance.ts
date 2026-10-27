/**
 * D8 — where a form-produced document came from: its form, its submission, what kind of artifact it is and whether its
 * recorded integrity holds. One Documents-owned read over the EXISTING Forms links — no copy, no new table.
 *
 * Forms write canonical Documents already (D8.1 audit, certification/documents-v1/D8-FORMS-DOCUMENTS-CONVERGENCE.md):
 *   - completed-form PDFs (`generated_form_pdf`) and signature images (`signature_asset`) are `documents` rows whose
 *     version and owner association the D2 insert triggers create; `form_submission_documents` links each to its
 *     submission (role generated_pdf / signature_asset);
 *   - participant uploads through a form are typed documents (`enrollment-upload`) that carry their form in
 *     `documents.metadata` (form_definition_id, packet_session_id) and no join row;
 *   - a signed artifact records `metadata.version_role = "signed"` and `metadata.lineage.signed_sha256`, the hash of the
 *     bytes it signed; the document's `checksum_sha256` is the hash of the bytes stored.
 *
 * Integrity: "verified" when a signed artifact's recorded signed hash equals the stored checksum; "mismatch" when it
 * does not (the artifact never counts as evidence and is shown as such); "unrecorded" when no signed hash was recorded
 * (completed, stub and upload artifacts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type FormArtifactRole = "generated_pdf" | "signature_asset" | "upload" | "other";
export type FormArtifactKind = "signed" | "completed" | "generated" | "signature" | "upload";
export type FormArtifactIntegrity = "verified" | "mismatch" | "unrecorded";

export type FormArtifactProvenance = {
    document_id: string;
    role: FormArtifactRole;
    kind: FormArtifactKind;
    form_definition_id: string | null;
    form_key: string | null;
    form_name: string | null;
    form_submission_id: string | null;
    submission_status: "draft" | "submitted" | "void" | null;
    submitted_at: string | null;
    packet_session_id: string | null;
    integrity: FormArtifactIntegrity;
};

type DocFacts = { id: string; doc_type: string | null; checksum_sha256?: string | null; metadata?: Record<string, unknown> | null };

const IN_CHUNK = 150;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function chunks<T>(list: T[]): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += IN_CHUNK) out.push(list.slice(i, i + IN_CHUNK));
    return out;
}

/** The integrity of one artifact from its own row (pure). */
export function artifactIntegrity(doc: Pick<DocFacts, "checksum_sha256" | "metadata">): FormArtifactIntegrity {
    const md = isRecord(doc.metadata) ? doc.metadata : {};
    const lineage = isRecord(md.lineage) ? md.lineage : {};
    const signed = str(lineage.signed_sha256);
    if (!signed) return "unrecorded";
    const stored = str(doc.checksum_sha256);
    return stored && stored.toLowerCase() === signed.toLowerCase() ? "verified" : "mismatch";
}

function artifactKind(doc: DocFacts, role: FormArtifactRole): FormArtifactKind {
    if (role === "signature_asset" || doc.doc_type === "signature_asset") return "signature";
    if (role === "upload") return "upload";
    const vr = str((isRecord(doc.metadata) ? doc.metadata : {}).version_role);
    if (vr === "signed") return "signed";
    if (vr === "completed") return "completed";
    return "generated";
}

/**
 * Provenance for the given documents that came from Forms (others are absent from the map). Null when a Forms link
 * could not be read — callers fail closed (a form artifact whose provenance is unknown is never evidence).
 */
export async function loadFormArtifactProvenance(supabase: SupabaseClient, orgId: string, docs: readonly DocFacts[]): Promise<Map<string, FormArtifactProvenance> | null> {
    const out = new Map<string, FormArtifactProvenance>();
    if (docs.length === 0) return out;
    const ids = [...new Set(docs.map((d) => d.id))];
    const linkReads = await Promise.all(
        chunks(ids).map((c) => supabase.from("form_submission_documents").select("document_id, form_submission_id, role").eq("org_id", orgId).in("document_id", c)),
    );
    if (linkReads.some((r) => r.error)) return null;
    const links = linkReads.flatMap((r) => (r.data ?? []) as Array<{ document_id: string; form_submission_id: string; role: string }>);

    const submissionIds = [...new Set(links.map((l) => l.form_submission_id))];
    const subReads = await Promise.all(
        chunks(submissionIds).map((c) => supabase.from("form_submissions").select("id, status, submitted_at, form_definition_id").eq("org_id", orgId).in("id", c)),
    );
    if (subReads.some((r) => r.error)) return null;
    const submissions = new Map(subReads.flatMap((r) => (r.data ?? []) as Array<{ id: string; status: string; submitted_at: string | null; form_definition_id: string }>).map((s) => [s.id, s]));

    const byDoc = new Map(docs.map((d) => [d.id, d]));
    const metaForm = (d: DocFacts) => str((isRecord(d.metadata) ? d.metadata : {}).form_definition_id);
    const definitionIds = [...new Set([...[...submissions.values()].map((s) => s.form_definition_id), ...docs.map(metaForm).filter((x): x is string => Boolean(x))])];
    const defReads = await Promise.all(chunks(definitionIds).map((c) => supabase.from("form_definitions").select("id, key, name").eq("org_id", orgId).in("id", c)));
    if (defReads.some((r) => r.error)) return null;
    const definitions = new Map(defReads.flatMap((r) => (r.data ?? []) as Array<{ id: string; key: string; name: string }>).map((d) => [d.id, d]));

    for (const l of links) {
        const d = byDoc.get(l.document_id);
        if (!d) continue;
        const role = (["generated_pdf", "signature_asset", "upload", "other"].includes(l.role) ? l.role : "other") as FormArtifactRole;
        const sub = submissions.get(l.form_submission_id) ?? null;
        const def = sub ? definitions.get(sub.form_definition_id) ?? null : null;
        const prev = out.get(d.id);
        // A document linked to several submissions: the submitted one wins, then the generated PDF role.
        if (prev && (prev.submission_status === "submitted" || sub?.status !== "submitted")) continue;
        out.set(d.id, {
            document_id: d.id,
            role,
            kind: artifactKind(d, role),
            form_definition_id: def?.id ?? sub?.form_definition_id ?? null,
            form_key: def?.key ?? null,
            form_name: def?.name ?? null,
            form_submission_id: l.form_submission_id,
            submission_status: (sub?.status === "draft" || sub?.status === "submitted" || sub?.status === "void" ? sub.status : null) as FormArtifactProvenance["submission_status"],
            submitted_at: sub?.submitted_at ?? null,
            packet_session_id: str((isRecord(d.metadata) ? d.metadata : {}).packet_session_id),
            integrity: artifactIntegrity(d),
        });
    }
    // Participant uploads through a form: their form is on the document, with no submission link.
    for (const d of docs) {
        if (out.has(d.id)) continue;
        const formId = metaForm(d);
        if (!formId) continue;
        const def = definitions.get(formId) ?? null;
        out.set(d.id, {
            document_id: d.id,
            role: "upload",
            kind: "upload",
            form_definition_id: formId,
            form_key: def?.key ?? null,
            form_name: def?.name ?? null,
            form_submission_id: null,
            submission_status: null,
            submitted_at: null,
            packet_session_id: str((isRecord(d.metadata) ? d.metadata : {}).packet_session_id),
            integrity: artifactIntegrity(d),
        });
    }
    return out;
}

/**
 * D8.3: may this artifact count for a requirement whose Forms evidence names `formKeys`? A completed-form PDF of a
 * named form, linked to a SUBMITTED submission, whose integrity is not contradicted. Never a signature image, an
 * upload (uploads are typed documents and count as documents of their type), a draft or void submission, or a
 * mismatching signed artifact.
 */
export function formArtifactCountsFor(p: FormArtifactProvenance | null | undefined, formKeys: readonly string[]): boolean {
    if (!p) return false;
    return p.role === "generated_pdf" && p.kind !== "signature" && p.submission_status === "submitted" && p.integrity !== "mismatch" && p.form_key !== null && formKeys.includes(p.form_key);
}
