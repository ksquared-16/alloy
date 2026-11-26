/**
 * D9.1 — the authority behind the read-only Documents resources of `/api/v1`.
 *
 * User-approved scope (2026-10-30): standard-sensitivity documents of the children, households and parents/guardians an
 * installation is authorized to see; four operations (category hierarchy, list, detail, audited short-lived download).
 * Writes and uploads come later. This file does not close D9.
 *
 * ── NOTHING NEW DECIDES WHO IS VISIBLE ──
 *
 * The external collection factory has already authenticated the installation, checked `documents.read`, spent the read
 * budget and resolved the boundary's sites before anything here runs. This module adds no visibility rule of its own:
 *   - a CHILD is visible exactly when `list_external_children` returns it for this installation and boundary (enrollment
 *     at an in-boundary site — the rule `GET /api/v1/children` publishes);
 *   - a HOUSEHOLD exactly when `list_external_households` returns it (an anchor of a visible child);
 *   - a PERSON only as a parent or guardian: an ACTIVE `person_child_relationships` edge of type `parent` or `guardian`
 *     (the seeded relationship vocabulary, distinct from `emergency_contact`, `authorized_pickup` and `payer`) to a child
 *     that is itself visible. Relationships never widen who is visible; they describe adults of children already visible.
 *
 * ── THEN THE CANONICAL DOCUMENT RULES, IN THE CANONICAL ORDER ──
 *   1. organization — every read is bound to the installation's organization;
 *   2. ownership — a document belongs to its PRIMARY OWNER (`document_subjects`, association `owner`); a context link
 *      never grants a document, and a related subject the installation cannot see is omitted, never named;
 *   3. availability — deleted, quarantined, restricted and superseded documents do not exist here;
 *   4. sensitivity — only documents whose EFFECTIVE sensitivity is empty (`resolveDocumentSensitivity`: declared class,
 *      medical type, safeguarding evidence, medical form linkage; it fails closed to every class). Medical, identity,
 *      custody/safeguarding and restricted documents are excluded; no external clearance exists.
 * A document that fails any step is indistinguishable from one that does not exist.
 *
 * Downloads reuse the internal contract: a per-request signed URL for `signedUrlExpirySeconds("download")` (10 minutes),
 * issued only after `document_link_issued` is recorded — naming the application, installation and credential — and
 * never a storage path or a permanent URL.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { signedUrlExpirySeconds } from "@/lib/documents/assertDocumentAccess";
import { recordDocumentAudit } from "@/lib/documents/documentAudit";
import { isDocumentUnavailable } from "@/lib/documents/documentAvailability";
import { resolveDocumentSensitivity } from "@/lib/documents/documentSensitivity";
import { isStoragePathWithinOrg } from "@/lib/documents/storagePathAuthority";
import { listCategories, listTypes, type DocumentCategory, type DocumentTypeSummary } from "@/lib/documents/configuration/documentConfigurationService";
import type { CollectionContext, CollectionRow } from "@/lib/platform/external/collectionRoute";

/** The relationship types that make a visible child's adult a parent or guardian (seeded vocabulary). */
export const EXTERNAL_GUARDIAN_RELATIONSHIP_TYPES = Object.freeze(["parent", "guardian"] as const);

export type ExternalDocumentSubjectType = "child" | "household" | "person";
export const EXTERNAL_DOCUMENT_SUBJECT_TYPES: readonly ExternalDocumentSubjectType[] = Object.freeze(["child", "household", "person"]);
export type ExternalSubject = { type: ExternalDocumentSubjectType; id: string };

type Boundary = Pick<CollectionContext, "organizationId" | "installationId" | "boundaryMode" | "siteIds">;
type Source = Promise<{ data: CollectionRow[] | null; error: unknown }>;

const isExternalSubjectType = (v: unknown): v is ExternalDocumentSubjectType =>
    typeof v === "string" && (EXTERNAL_DOCUMENT_SUBJECT_TYPES as readonly string[]).includes(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ─────────────────────────────────────────────────────────────────────────────────────────── visibility

/**
 * Who this installation may see, decided by the existing `/api/v1` SQL authorities and cached for one request.
 * Any error answers "not visible": the boundary fails closed.
 */
export function subjectVisibility(supabase: SupabaseClient, b: Boundary) {
    const cache = new Map<string, Promise<boolean>>();
    const base = { p_org_id: b.organizationId, p_boundary_mode: b.boundaryMode, p_site_ids: [...b.siteIds], p_limit: 1 };

    const child = async (id: string) => {
        const { data, error } = await supabase.rpc("list_external_children", {
            ...base,
            p_installation_id: b.installationId,
            p_child_ids: [id],
        });
        return !error && Array.isArray(data) && data.some((r: { id?: unknown }) => r?.id === id);
    };
    const household = async (id: string) => {
        const { data, error } = await supabase.rpc("list_external_households", { ...base, p_household_ids: [id] });
        return !error && Array.isArray(data) && data.some((r: { id?: unknown }) => r?.id === id);
    };
    const person = async (id: string) => {
        const { data, error } = await supabase
            .from("person_child_relationships")
            .select("customer_member_id, relationship_type, status")
            .eq("org_id", b.organizationId)
            .eq("person_id", id)
            .eq("status", "active")
            .in("relationship_type", [...EXTERNAL_GUARDIAN_RELATIONSHIP_TYPES]);
        if (error || !Array.isArray(data)) return false;
        for (const edge of data as Array<{ customer_member_id?: unknown }>) {
            const childId = str(edge.customer_member_id);
            if (childId && (await isVisible({ type: "child", id: childId }))) return true;
        }
        return false;
    };

    const isVisible = (s: ExternalSubject): Promise<boolean> => {
        const key = `${s.type}:${s.id}`;
        let hit = cache.get(key);
        if (!hit) {
            const check = s.type === "child" ? child(s.id) : s.type === "household" ? household(s.id) : person(s.id);
            hit = check.catch(() => false);
            cache.set(key, hit);
        }
        return hit;
    };
    return { isVisible };
}

// ─────────────────────────────────────────────────────────────────────────────────────────── documents

type SubjectLinkRow = { document_id: string; subject_type: string; subject_id: string; association: string; is_primary: boolean };
type DocumentRow = {
    id: string;
    title: string | null;
    original_filename: string | null;
    doc_type: string | null;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
    current_version_id: string | null;
};
type VersionRow = {
    id: string;
    document_id: string;
    version_number: number | null;
    mime_type: string | null;
    byte_size: number | null;
    created_at: string | null;
    review_status: string | null;
    expires_on: string | null;
};

export type ExternalDocumentFilters = {
    subject?: ExternalSubject | null;
    documentId?: string | null;
    categoryKey?: string | null;
    typeKey?: string | null;
    /** D9.3: only documents whose current version expires strictly before this date (YYYY-MM-DD). Undated never match. */
    expiresBefore?: string | null;
};

type Page = { limit: number; cursorSort: string | null; cursorId: string | null; updatedSince: string | null };

const sortKeyOf = (d: { updated_at?: string | null; created_at?: string | null }) => String(d.updated_at ?? d.created_at ?? "");
const instant = (v: string | null) => (v ? Date.parse(v) : NaN);

/** The ascending (sort_key, id) order every `/api/v1` collection uses, with the same strict cursor and watermark. */
export function applyPage<T extends { id: string; sort_key: string }>(rows: T[], p: Page): T[] {
    const since = instant(p.updatedSince);
    const cursorAt = instant(p.cursorSort);
    return rows
        .filter((r) => (Number.isNaN(since) ? true : instant(r.sort_key) > since))
        .filter((r) => {
            if (Number.isNaN(cursorAt) || !p.cursorId) return true;
            const at = instant(r.sort_key);
            return at > cursorAt || (at === cursorAt && r.id > p.cursorId);
        })
        .sort((a, b) => instant(a.sort_key) - instant(b.sort_key) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, p.limit);
}

/** Category path ("folders") of a category id, root first. */
function categoryPath(byId: Map<string, DocumentCategory>, id: string | null): DocumentCategory[] {
    const out: DocumentCategory[] = [];
    const seen = new Set<string>();
    let at = id ? byId.get(id) : undefined;
    while (at && !seen.has(at.id)) {
        seen.add(at.id);
        out.unshift(at);
        at = at.parent_id ? byId.get(at.parent_id) : undefined;
    }
    return out;
}

/**
 * The visible documents for one subject or one document id, as public-ready collection rows.
 * Exactly one of `subject` / `documentId` must be given; anything outside the rules yields no row.
 */
export async function listExternalDocuments(
    supabase: SupabaseClient,
    b: Boundary,
    filters: ExternalDocumentFilters,
    page: Page,
): Promise<{ ok: true; rows: CollectionRow[] } | { ok: false; error: string }> {
    const org = b.organizationId;
    const vis = subjectVisibility(supabase, b);

    // Which documents, by primary owner. A document id resolves to its OWN primary owner, so the id itself grants nothing.
    let ownerLinks: SubjectLinkRow[];
    if (filters.documentId) {
        const { data, error } = await supabase
            .from("document_subjects")
            .select("document_id, subject_type, subject_id, association, is_primary")
            .eq("org_id", org)
            .eq("document_id", filters.documentId)
            .eq("association", "owner")
            .eq("is_primary", true)
            .is("ended_at", null);
        if (error) return { ok: false, error: "subjects_unreadable" };
        ownerLinks = (data ?? []) as SubjectLinkRow[];
    } else if (filters.subject) {
        if (!(await vis.isVisible(filters.subject))) return { ok: true, rows: [] };
        const { data, error } = await supabase
            .from("document_subjects")
            .select("document_id, subject_type, subject_id, association, is_primary")
            .eq("org_id", org)
            .eq("subject_type", filters.subject.type)
            .eq("subject_id", filters.subject.id)
            .eq("association", "owner")
            .eq("is_primary", true)
            .is("ended_at", null);
        if (error) return { ok: false, error: "subjects_unreadable" };
        ownerLinks = (data ?? []) as SubjectLinkRow[];
    } else {
        return { ok: true, rows: [] };
    }

    const ownerByDoc = new Map<string, ExternalSubject>();
    for (const l of ownerLinks) {
        if (!isExternalSubjectType(l.subject_type)) continue; // a vendor- or case-owned document is not a family document
        const owner = { type: l.subject_type, id: l.subject_id };
        if (await vis.isVisible(owner)) ownerByDoc.set(l.document_id, owner);
    }
    const ids = [...ownerByDoc.keys()];
    if (ids.length === 0) return { ok: true, rows: [] };

    const { data: docData, error: docErr } = await supabase
        .from("documents")
        .select("id, title, original_filename, doc_type, status, created_at, updated_at, current_version_id")
        .eq("org_id", org)
        .in("id", ids);
    if (docErr) return { ok: false, error: "documents_unreadable" };
    let docs = ((docData ?? []) as DocumentRow[]).filter((d) => !isDocumentUnavailable(d.status));

    const sensitivity = await resolveDocumentSensitivity(supabase, org, docs.map((d) => ({ id: d.id, doc_type: d.doc_type })));
    docs = docs.filter((d) => (sensitivity.get(d.id)?.size ?? 1) === 0);

    const [typesRes, categoriesRes] = await Promise.all([listTypes(supabase, org), listCategories(supabase, org)]);
    if (!typesRes.ok || !categoriesRes.ok) return { ok: false, error: "configuration_unreadable" };
    const typeByKey = new Map<string, DocumentTypeSummary>(typesRes.value.map((t) => [t.key, t]));
    const categoryById = new Map<string, DocumentCategory>(categoriesRes.value.map((c) => [c.id, c]));

    const shaped = docs.map((d) => {
        const type = d.doc_type ? typeByKey.get(d.doc_type) : undefined;
        const path = categoryPath(categoryById, type?.published?.category_id ?? null);
        return { d, type, path, id: d.id, sort_key: sortKeyOf(d) };
    });
    const narrowed = shaped.filter(
        (s) =>
            (!filters.typeKey || s.d.doc_type === filters.typeKey) &&
            (!filters.categoryKey || s.path.some((c) => c.key === filters.categoryKey)),
    );
    let dated = narrowed;
    if (filters.expiresBefore) {
        // Before paging, so a page is never short of matches that sit later in the order.
        const ids = narrowed.map((x) => x.d.current_version_id).filter((v): v is string => Boolean(v));
        const expiry = new Map<string, string | null>();
        if (ids.length) {
            const { data, error } = await supabase.from("document_versions").select("id, expires_on").eq("org_id", org).in("id", ids);
            if (error) return { ok: false, error: "versions_unreadable" };
            for (const v of (data ?? []) as Array<{ id: string; expires_on: string | null }>) expiry.set(v.id, str(v.expires_on));
        }
        const before = filters.expiresBefore;
        dated = narrowed.filter((x) => {
            const on = x.d.current_version_id ? expiry.get(x.d.current_version_id) : null;
            return Boolean(on && on.slice(0, 10) < before);
        });
    }
    const paged = applyPage(dated, page);
    if (paged.length === 0) return { ok: true, rows: [] };

    const versionIds = paged.map((s) => s.d.current_version_id).filter((v): v is string => Boolean(v));
    const versions = new Map<string, VersionRow>();
    if (versionIds.length) {
        const { data, error } = await supabase
            .from("document_versions")
            .select("id, document_id, version_number, mime_type, byte_size, created_at, review_status, expires_on")
            .eq("org_id", org)
            .in("id", versionIds);
        if (error) return { ok: false, error: "versions_unreadable" };
        for (const v of (data ?? []) as VersionRow[]) versions.set(v.id, v);
    }

    // Related subjects: every active link of a family type, kept only when the installation may see it.
    const { data: allLinks, error: linkErr } = await supabase
        .from("document_subjects")
        .select("document_id, subject_type, subject_id, association, is_primary")
        .eq("org_id", org)
        .in("document_id", paged.map((s) => s.id))
        .is("ended_at", null);
    if (linkErr) return { ok: false, error: "subjects_unreadable" };
    const subjectsByDoc = new Map<string, Array<{ type: ExternalDocumentSubjectType; id: string; role: "primary" | "related" }>>();
    for (const l of (allLinks ?? []) as SubjectLinkRow[]) {
        if (!isExternalSubjectType(l.subject_type)) continue;
        const primary = l.is_primary && l.association === "owner";
        if (!(await vis.isVisible({ type: l.subject_type, id: l.subject_id }))) continue;
        const list = subjectsByDoc.get(l.document_id) ?? [];
        if (!list.some((x) => x.type === l.subject_type && x.id === l.subject_id)) {
            list.push({ type: l.subject_type, id: l.subject_id, role: primary ? "primary" : "related" });
        }
        subjectsByDoc.set(l.document_id, list);
    }

    const rows: CollectionRow[] = paged.map((s) => {
        const v = s.d.current_version_id ? versions.get(s.d.current_version_id) : undefined;
        const owner = ownerByDoc.get(s.id)!;
        const subjects = subjectsByDoc.get(s.id) ?? [];
        if (!subjects.some((x) => x.role === "primary")) subjects.unshift({ ...owner, role: "primary" });
        return {
            id: s.id,
            sort_key: s.sort_key,
            title: str(s.d.title) ?? str(s.d.original_filename),
            type_key: s.d.doc_type,
            type_label: s.type?.published?.label ?? null,
            category_path: s.path.map((c) => ({ key: c.key, label: c.label })),
            current_version: v
                ? {
                      id: v.id,
                      number: num(v.version_number),
                      content_type: str(v.mime_type),
                      size_bytes: num(v.byte_size),
                      received_at: str(v.created_at),
                  }
                : null,
            review_status: v ? str(v.review_status) : null,
            valid_until: v ? str(v.expires_on) : null,
            subjects: subjects.sort((a, b) => (a.role === b.role ? 0 : a.role === "primary" ? -1 : 1)),
            updated_at: s.sort_key,
        };
    });
    return { ok: true, rows };
}

// ─────────────────────────────────────────────────────────────────────────────────────────── collections

const pageOf = (args: Record<string, unknown>): Page => ({
    limit: Number(args.p_limit) || 1,
    cursorSort: str(args.p_cursor_sort),
    cursorId: str(args.p_cursor_id),
    updatedSince: str(args.p_updated_since),
});

/** `source` for GET /api/v1/documents and GET /api/v1/documents/{id}. */
export async function externalDocumentsSource(supabase: SupabaseClient, args: Record<string, unknown>, ctx: CollectionContext): Source {
    const subjectType = str(args.p_subject_type);
    const subjectId = str(args.p_subject_id);
    const result = await listExternalDocuments(
        supabase,
        ctx,
        {
            subject: subjectType && subjectId && isExternalSubjectType(subjectType) ? { type: subjectType, id: subjectId } : null,
            documentId: str(args.p_document_id),
            categoryKey: str(args.p_category_key),
            typeKey: str(args.p_type_key),
            expiresBefore: str(args.p_expires_before),
        },
        pageOf(args),
    );
    return result.ok ? { data: result.rows, error: null } : { data: null, error: new Error(result.error) };
}

/** `source` for GET /api/v1/document-categories: active categories with their active published types. */
export async function externalDocumentCategoriesSource(supabase: SupabaseClient, args: Record<string, unknown>, ctx: CollectionContext): Source {
    const [categoriesRes, typesRes] = await Promise.all([listCategories(supabase, ctx.organizationId), listTypes(supabase, ctx.organizationId)]);
    if (!categoriesRes.ok || !typesRes.ok) return { data: null, error: new Error("configuration_unreadable") };
    const active = categoriesRes.value.filter((c) => c.status === "active");
    const byId = new Map(active.map((c) => [c.id, c]));
    const typesByCategory = new Map<string, Array<{ key: string; label: string }>>();
    for (const t of typesRes.value) {
        if (t.status !== "active" || !t.published?.category_id) continue;
        const list = typesByCategory.get(t.published.category_id) ?? [];
        list.push({ key: t.key, label: t.published.label });
        typesByCategory.set(t.published.category_id, list);
    }
    const rows = active.map((c) => ({
        id: c.id,
        sort_key: c.updated_at,
        key: c.key,
        label: c.label,
        description: c.description,
        // A parent that is archived is not a folder the partner can see; the child becomes a root.
        parent_key: c.parent_id ? byId.get(c.parent_id)?.key ?? null : null,
        sort_order: c.sort_order,
        types: (typesByCategory.get(c.id) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
        updated_at: c.updated_at,
    }));
    return { data: applyPage(rows, pageOf(args)) as CollectionRow[], error: null };
}

/**
 * `source` for GET /api/v1/documents/{id}/download-link: the same visibility as the detail, then the audited
 * short-lived link. The audit is written BEFORE the link is minted — no record, no link.
 */
export async function externalDocumentDownloadSource(supabase: SupabaseClient, args: Record<string, unknown>, ctx: CollectionContext): Source {
    const documentId = str(args.p_document_id);
    if (!documentId) return { data: [], error: null };
    const visible = await listExternalDocuments(supabase, ctx, { documentId }, { limit: 1, cursorSort: null, cursorId: null, updatedSince: null });
    if (!visible.ok) return { data: null, error: new Error(visible.error) };
    if (visible.rows.length === 0) return { data: [], error: null };
    const doc = visible.rows[0];

    const { data: loc, error: locErr } = await supabase
        .from("documents")
        .select("bucket, storage_path")
        .eq("org_id", ctx.organizationId)
        .eq("id", documentId)
        .maybeSingle();
    const bucket = str((loc as { bucket?: unknown } | null)?.bucket);
    const path = str((loc as { storage_path?: unknown } | null)?.storage_path);
    if (locErr || !bucket || !path || !isStoragePathWithinOrg(path, ctx.organizationId)) {
        return { data: null, error: new Error("location_unverified") };
    }

    const expiresIn = signedUrlExpirySeconds("download");
    const version = (doc.current_version as { id?: string } | null)?.id ?? null;
    const audit = await recordDocumentAudit({
        orgId: ctx.organizationId,
        actorUserId: null,
        actorPrincipal: {
            kind: "application",
            applicationId: ctx.principal.applicationId,
            installationId: ctx.principal.installationId,
            credentialId: ctx.principal.credentialId,
        },
        event: "document_link_issued",
        subject: { type: "documents", id: documentId },
        route: "api/v1/documents/download-link",
        detail: { operation: "download", expires_in_seconds: expiresIn, ...(version ? { version_id: version } : {}) },
    });
    if (!audit.ok) return { data: null, error: new Error("audit_unavailable") };

    const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (signErr || !signed?.signedUrl) return { data: null, error: new Error("link_unavailable") };
    const issuedAt = new Date();
    return {
        data: [
            {
                id: documentId,
                sort_key: issuedAt.toISOString(),
                url: signed.signedUrl,
                expires_at: new Date(issuedAt.getTime() + expiresIn * 1000).toISOString(),
            },
        ],
        error: null,
    };
}
