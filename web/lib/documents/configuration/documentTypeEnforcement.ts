/**
 * D5 — the Studio type policy, ENFORCED. One reusable check, owned by Documents, consumed by every writer that names a
 * document type: the operator upload, the replacement (new version) route, the public Forms and vendor uploads, and the
 * Processing filing command. Processing never re-implements it.
 *
 * What is enforced, and where:
 *  - published type resolution: an operator write that names a catalogued type needs that type to be active and
 *    published; filing needs a published type, always (the database refuses otherwise — `document_file`);
 *  - applicable subject types and allowed formats, for every write that names a published type;
 *  - review-required: filing needs an accepted review (`document_file`); an upload of such a type is recorded with its
 *    version PENDING review, which the library shows;
 *  - replacement: a replacement version is allowed only for `new_version` types; filing follows the same policy.
 *
 * Validity (expiration, reconfirmation, renewal) is carried on the policy for the D7 validity evaluator
 * (`lib/documents/validity/documentValidity.ts`), which derives a document's validity on read; no write is refused for it.
 *
 * The database stays the authority for filing (`public.document_file`, migration 20261210093500): this module gives
 * the routes a readable refusal before the call and the preview its problems. It never decides authorization.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DeclaredDocumentSensitivity } from "@/lib/documents/documentSensitivity";
import type { DocumentContentKind } from "@/lib/documents/documentContentSignature";
import { CANONICAL_DOCUMENT_MIME } from "@/lib/documents/documentContentSignature";
import type { DocumentSubjectType } from "@/lib/documents/documentSubjects";
import type { ReplacementPolicy, ValidityPolicy } from "@/lib/documents/configuration/documentTypePolicy";

export type PublishedDocumentTypePolicy = {
    type_id: string;
    version_id: string;
    key: string;
    label: string;
    category_id: string | null;
    category_label: string | null;
    subject_types: DocumentSubjectType[];
    allowed_formats: DocumentContentKind[];
    default_sensitivity: DeclaredDocumentSensitivity;
    review_required: boolean;
    replacement_policy: ReplacementPolicy;
    /** D7: the published validity policy (`{kind: "none"}` when the version declares none). */
    validity_policy: ValidityPolicy;
};

export type DocumentTypeResolution =
    | { status: "published"; policy: PublishedDocumentTypePolicy }
    /** The key names no type of the organization: a legacy free-text label, accepted as before and governed by nothing. */
    | { status: "uncatalogued" }
    /** The type exists but is archived or has no published version. */
    | { status: "unavailable"; reason: "archived" | "unpublished" }
    | { status: "error" };

export type DocumentTypePolicyProblem = { code: DocumentTypePolicyCode; message: string };
export type DocumentTypePolicyCode =
    | "TYPE_UNAVAILABLE"
    | "TYPE_SUBJECT_NOT_APPLICABLE"
    | "TYPE_FORMAT_NOT_ALLOWED"
    | "TYPE_REPLACEMENT_NOT_ALLOWED"
    | "TYPE_NEW_DOCUMENT_REQUIRED";

const VERSION_COLUMNS =
    "id, label, category_id, subject_types, allowed_formats, default_sensitivity, review_required, replacement_policy, validity_policy, status";

const MIME_TO_FORMAT: Readonly<Record<string, DocumentContentKind>> = Object.freeze(
    Object.fromEntries(Object.entries(CANONICAL_DOCUMENT_MIME).map(([k, mime]) => [mime, k as DocumentContentKind])),
);

/** The stored content type → the Studio format key (as `public.document_format_for_mime`). */
export function documentFormatForMime(mime: unknown): DocumentContentKind | null {
    if (typeof mime !== "string") return null;
    return MIME_TO_FORMAT[mime.trim().toLowerCase()] ?? null;
}

/** The published policy of the organization's type with this key, as `public.document_filing_type` reads it. */
export async function resolveDocumentTypePolicy(supabase: SupabaseClient, orgId: string, docType: string | null | undefined): Promise<DocumentTypeResolution> {
    const key = typeof docType === "string" ? docType.trim() : "";
    if (!key) return { status: "uncatalogued" };
    const { data: type, error } = await supabase
        .from("document_types")
        .select("id, key, status, published_version_id")
        .eq("org_id", orgId)
        .eq("key", key)
        .maybeSingle();
    if (error) return { status: "error" };
    if (!type) return { status: "uncatalogued" };
    const t = type as { id: string; key: string; status: string; published_version_id: string | null };
    if (t.status !== "active") return { status: "unavailable", reason: "archived" };
    if (!t.published_version_id) return { status: "unavailable", reason: "unpublished" };
    const { data: version, error: vErr } = await supabase
        .from("document_type_versions")
        .select(VERSION_COLUMNS)
        .eq("org_id", orgId)
        .eq("id", t.published_version_id)
        .maybeSingle();
    if (vErr) return { status: "error" };
    const v = version as (Record<string, unknown> & { id: string; status: string }) | null;
    if (!v || v.status !== "published") return { status: "unavailable", reason: "unpublished" };
    let categoryLabel: string | null = null;
    if (typeof v.category_id === "string") {
        const { data: cat } = await supabase.from("document_categories").select("label").eq("org_id", orgId).eq("id", v.category_id).maybeSingle();
        categoryLabel = typeof (cat as { label?: unknown } | null)?.label === "string" ? (cat as { label: string }).label : null;
    }
    return { status: "published", policy: toPolicy(t, v, categoryLabel) };
}

/** Every published, active type of the organization — the catalog Processing classifies against. */
export async function listPublishedDocumentTypePolicies(supabase: SupabaseClient, orgId: string): Promise<PublishedDocumentTypePolicy[] | null> {
    const { data: types, error } = await supabase
        .from("document_types")
        .select("id, key, status, published_version_id")
        .eq("org_id", orgId)
        .eq("status", "active");
    if (error) return null;
    const live = ((types ?? []) as Array<{ id: string; key: string; status: string; published_version_id: string | null }>).filter((t) => t.published_version_id);
    if (!live.length) return [];
    const [{ data: versions, error: vErr }, { data: categories, error: cErr }] = await Promise.all([
        supabase.from("document_type_versions").select(VERSION_COLUMNS).eq("org_id", orgId).eq("status", "published"),
        supabase.from("document_categories").select("id, label").eq("org_id", orgId),
    ]);
    if (vErr || cErr) return null;
    const byId = new Map(((versions ?? []) as Array<Record<string, unknown> & { id: string }>).map((v) => [v.id, v]));
    const catLabel = new Map(((categories ?? []) as Array<{ id: string; label: string }>).map((c) => [c.id, c.label]));
    const out: PublishedDocumentTypePolicy[] = [];
    for (const t of live) {
        const v = byId.get(t.published_version_id as string);
        if (!v) continue;
        out.push(toPolicy(t, v, typeof v.category_id === "string" ? catLabel.get(v.category_id) ?? null : null));
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
}

function toPolicy(t: { id: string; key: string }, v: Record<string, unknown> & { id: string }, categoryLabel: string | null): PublishedDocumentTypePolicy {
    const arr = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
    return {
        type_id: t.id,
        version_id: v.id,
        key: t.key,
        label: typeof v.label === "string" && v.label.trim() ? v.label : t.key,
        category_id: typeof v.category_id === "string" ? v.category_id : null,
        category_label: categoryLabel,
        subject_types: arr(v.subject_types) as DocumentSubjectType[],
        allowed_formats: arr(v.allowed_formats) as DocumentContentKind[],
        default_sensitivity: (typeof v.default_sensitivity === "string" ? v.default_sensitivity : "standard") as DeclaredDocumentSensitivity,
        review_required: v.review_required === true,
        replacement_policy: (typeof v.replacement_policy === "string" ? v.replacement_policy : "new_version") as ReplacementPolicy,
        validity_policy: (v.validity_policy && typeof v.validity_policy === "object" && !Array.isArray(v.validity_policy)
            ? v.validity_policy
            : { kind: "none" }) as ValidityPolicy,
    };
}

/** The policy problems of writing a document of this published type to this subject, in this format. */
export function documentTypePolicyProblems(
    policy: PublishedDocumentTypePolicy,
    write: { subjectType?: DocumentSubjectType | null; format?: DocumentContentKind | null; replacement?: boolean },
): DocumentTypePolicyProblem[] {
    const problems: DocumentTypePolicyProblem[] = [];
    if (write.subjectType && !policy.subject_types.includes(write.subjectType)) {
        problems.push({ code: "TYPE_SUBJECT_NOT_APPLICABLE", message: `${policy.label} does not apply to a ${subjectNoun(write.subjectType)}.` });
    }
    if (write.format !== undefined && (!write.format || !policy.allowed_formats.includes(write.format))) {
        problems.push({
            code: "TYPE_FORMAT_NOT_ALLOWED",
            message: `${policy.label} accepts ${policy.allowed_formats.map((f) => f.toUpperCase()).join(", ") || "no formats"}.`,
        });
    }
    if (write.replacement && policy.replacement_policy === "not_allowed") {
        problems.push({ code: "TYPE_REPLACEMENT_NOT_ALLOWED", message: `${policy.label} cannot be replaced.` });
    } else if (write.replacement && policy.replacement_policy === "new_document") {
        problems.push({ code: "TYPE_NEW_DOCUMENT_REQUIRED", message: `${policy.label} is kept as separate documents; upload it as a new document.` });
    }
    return problems;
}

export function subjectNoun(t: DocumentSubjectType | string): string {
    switch (t) {
        case "household":
            return "household";
        case "person":
            return "parent or adult";
        case "child":
            return "child";
        case "opportunity":
            return "case";
        case "vendor":
            return "vendor";
        default:
            return String(t).replace(/_/g, " ");
    }
}

/**
 * The check a WRITE route runs when it names a doc_type. `operator` writes refuse an archived or unpublished type;
 * `public` writes (Forms, vendor application) enforce a published type's subject and format but do not refuse when the
 * organization has archived the type — a Studio change must never silently close public intake. An uncatalogued key
 * is accepted by both, as before D5.
 */
export async function checkDocumentTypeForWrite(
    supabase: SupabaseClient,
    orgId: string,
    write: { docType: string | null | undefined; subjectType: DocumentSubjectType | null; format: DocumentContentKind | null; mode: "operator" | "public"; replacement?: boolean },
): Promise<
    | { ok: true; policy: PublishedDocumentTypePolicy | null; resolution: DocumentTypeResolution["status"] }
    | { ok: false; status: number; code: DocumentTypePolicyCode | "TYPE_POLICY_UNAVAILABLE"; message: string; problems: DocumentTypePolicyProblem[] }
> {
    const resolution = await resolveDocumentTypePolicy(supabase, orgId, write.docType);
    if (resolution.status === "error") {
        return { ok: false, status: 503, code: "TYPE_POLICY_UNAVAILABLE", message: "The document type could not be checked.", problems: [] };
    }
    if (resolution.status === "uncatalogued") return { ok: true, policy: null, resolution: "uncatalogued" };
    if (resolution.status === "unavailable") {
        if (write.mode === "public") return { ok: true, policy: null, resolution: "unavailable" };
        const message = resolution.reason === "archived" ? "This document type is archived." : "This document type is not published.";
        return { ok: false, status: 422, code: "TYPE_UNAVAILABLE", message, problems: [{ code: "TYPE_UNAVAILABLE", message }] };
    }
    const problems = documentTypePolicyProblems(resolution.policy, { subjectType: write.subjectType, format: write.format, replacement: write.replacement });
    if (problems.length) return { ok: false, status: 422, code: problems[0].code, message: problems[0].message, problems };
    return { ok: true, policy: resolution.policy, resolution: "published" };
}

/** A new version of a review-required type starts PENDING review (`public.document_version_require_review`). Best-effort. */
export async function markVersionPendingReview(supabase: SupabaseClient, orgId: string, documentId: string): Promise<void> {
    await supabase.rpc("document_version_require_review", { p_org_id: orgId, p_document_id: documentId });
}
