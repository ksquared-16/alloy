/**
 * D9.1 public shapes for Documents. The allow-list lives here: a field not named below never leaves Alloy — no storage
 * path, bucket, checksum, extracted text, original-filename fallback beyond the title, sensitivity class, legal-hold or
 * retention data, uploader identity, or any subject the installation cannot already see.
 */
import { NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/platform/external/apiErrors";
import { UUID_RE, type CollectionRow } from "@/lib/platform/external/collectionRoute";

export type PublicDocumentSubject = { type: "child" | "household" | "person"; id: string; role: "primary" | "related" };

export type PublicDocument = {
    id: string;
    title: string | null;
    type: { key: string | null; label: string | null };
    category_path: Array<{ key: string; label: string }>;
    subjects: PublicDocumentSubject[];
    current_version: { id: string; number: number | null; content_type: string | null; size_bytes: number | null; received_at: string | null } | null;
    review_status: string | null;
    valid_until: string | null;
    updated_at: string;
};

export function toPublicDocument(row: CollectionRow): PublicDocument {
    return {
        id: String(row.id),
        title: (row.title as string | null) ?? null,
        type: { key: (row.type_key as string | null) ?? null, label: (row.type_label as string | null) ?? null },
        category_path: (row.category_path as PublicDocument["category_path"]) ?? [],
        subjects: ((row.subjects as PublicDocumentSubject[]) ?? []).map((s) => ({ type: s.type, id: s.id, role: s.role })),
        current_version: (row.current_version as PublicDocument["current_version"]) ?? null,
        review_status: (row.review_status as string | null) ?? null,
        valid_until: (row.valid_until as string | null) ?? null,
        updated_at: String(row.updated_at ?? row.sort_key),
    };
}

export type PublicDocumentCategory = {
    id: string;
    key: string;
    label: string;
    description: string | null;
    parent_key: string | null;
    sort_order: number;
    types: Array<{ key: string; label: string }>;
    updated_at: string;
};

export function toPublicDocumentCategory(row: CollectionRow): PublicDocumentCategory {
    return {
        id: String(row.id),
        key: String(row.key),
        label: String(row.label),
        description: (row.description as string | null) ?? null,
        parent_key: (row.parent_key as string | null) ?? null,
        sort_order: Number(row.sort_order ?? 0),
        types: ((row.types as Array<{ key: string; label: string }>) ?? []).map((t) => ({ key: t.key, label: t.label })),
        updated_at: String(row.updated_at ?? row.sort_key),
    };
}

export type PublicDocumentDownloadLink = { document_id: string; url: string; expires_at: string };

export function toPublicDocumentDownloadLink(row: CollectionRow): PublicDocumentDownloadLink {
    return { document_id: String(row.id), url: String(row.url), expires_at: String(row.expires_at) };
}

/**
 * One resource by id, through a collection handler: the id is pinned as the ONLY filter (the caller's query string is
 * discarded), the factory runs its full security order, and "no row" becomes the same 404 whether the document does not
 * exist, belongs to another organization, sits outside the boundary or is withheld by sensitivity or availability.
 */
export async function singleResourceThroughCollection(
    request: NextRequest,
    id: string,
    collection: (request: NextRequest) => Promise<NextResponse>,
): Promise<NextResponse> {
    // Even a malformed id goes through the full order (credential, scope, budget, boundary) and simply matches nothing:
    // an unauthenticated caller is refused as unauthenticated, never told "not found".
    const url = new URL(request.nextUrl.pathname, request.nextUrl.origin);
    url.searchParams.set("document_id", UUID_RE.test(id) ? id : "");
    const inner = await collection(new NextRequest(url, { method: "GET", headers: request.headers }));
    if (inner.status !== 200) return inner;
    const body = (await inner.json()) as { data?: unknown[] };
    const headers = new Headers(inner.headers);
    headers.delete("content-length");
    if (!Array.isArray(body.data) || body.data.length === 0) {
        const requestId = inner.headers.get("x-request-id") ?? crypto.randomUUID();
        const nf = apiError({ code: "not_found", type: "not_found", message: "Document not found.", requestId });
        for (const [k, v] of headers) if (k.toLowerCase().startsWith("ratelimit")) nf.headers.set(k, v);
        return nf;
    }
    return NextResponse.json({ data: body.data[0] }, { status: 200, headers });
}

/**
 * A collection that belongs to one document (D9.3 reviews, history): the path id is pinned as `document_id`, and only the
 * paging parameters the caller sent are kept. A document the installation cannot read answers an empty page — the same
 * answer as a document with no entries, so neither existence nor reach is disclosed.
 */
export async function collectionUnderDocument(
    request: NextRequest,
    id: string,
    collection: (request: NextRequest) => Promise<NextResponse>,
): Promise<NextResponse> {
    const url = new URL(request.nextUrl.pathname, request.nextUrl.origin);
    for (const name of ["limit", "cursor", "since_token"]) {
        const v = request.nextUrl.searchParams.get(name);
        if (v !== null) url.searchParams.set(name, v);
    }
    url.searchParams.set("document_id", UUID_RE.test(id) ? id : "");
    return collection(new NextRequest(url, { method: "GET", headers: request.headers }));
}

/** D9.3: one review decision or validity record. `actor_kind` is `staff` or `application`, never a person. */
export type PublicDocumentReview = {
    id: string;
    document_id: string;
    version_id: string;
    kind: "review" | "validity";
    decision: "accepted" | "rejected" | "reopened" | null;
    previous_review_status: string | null;
    effective_on: string | null;
    expires_on: string | null;
    actor_kind: "staff" | "application";
    recorded_at: string;
};

export function toPublicDocumentReview(row: CollectionRow): PublicDocumentReview {
    return {
        id: String(row.id),
        document_id: String(row.document_id),
        version_id: String(row.version_id),
        kind: row.kind === "validity" ? "validity" : "review",
        decision: (row.decision as PublicDocumentReview["decision"]) ?? null,
        previous_review_status: (row.previous_review_status as string | null) ?? null,
        effective_on: (row.effective_on as string | null) ?? null,
        expires_on: (row.expires_on as string | null) ?? null,
        actor_kind: row.actor_kind === "staff" ? "staff" : "application",
        recorded_at: String(row.recorded_at ?? row.sort_key),
    };
}

/** D9.3: one history entry — what happened and when. No detail line, path or name. */
export type PublicDocumentHistoryEntry = { id: string; document_id: string; kind: "committed" | "system"; action: string; version_number: number | null; occurred_at: string };

export function toPublicDocumentHistoryEntry(row: CollectionRow): PublicDocumentHistoryEntry {
    return {
        id: String(row.id),
        document_id: String(row.document_id),
        kind: row.kind === "system" ? "system" : "committed",
        action: String(row.action),
        version_number: typeof row.version_number === "number" ? row.version_number : null,
        occurred_at: String(row.occurred_at ?? row.sort_key),
    };
}

/**
 * D9.3: one requirement of one subject. A requirement on a non-standard document type is `restricted: true` and carries
 * only its key and state.
 */
export type PublicDocumentRequirement =
    | { id: string; requirement_key: string; state: string; restricted: true }
    | {
          id: string;
          requirement_key: string;
          label: string;
          document_type_key: string;
          policy: string;
          state: string;
          blocking: boolean;
          due_on: string | null;
          valid_until: string | null;
          expiring_soon: boolean;
          evidence: { accepted: string[]; pending: string[]; expired: string[] };
          restricted: false;
      };

export function toPublicDocumentRequirement(row: CollectionRow): PublicDocumentRequirement {
    if (row.restricted !== false) return { id: String(row.id), requirement_key: String(row.requirement_key), state: String(row.state), restricted: true };
    const ev = (row.evidence ?? {}) as { accepted?: string[]; pending?: string[]; expired?: string[] };
    return {
        id: String(row.id),
        requirement_key: String(row.requirement_key),
        label: String(row.label),
        document_type_key: String(row.document_type_key),
        policy: String(row.policy),
        state: String(row.state),
        blocking: row.blocking === true,
        due_on: (row.due_on as string | null) ?? null,
        valid_until: (row.valid_until as string | null) ?? null,
        expiring_soon: row.expiring_soon === true,
        evidence: { accepted: [...(ev.accepted ?? [])], pending: [...(ev.pending ?? [])], expired: [...(ev.expired ?? [])] },
        restricted: false,
    };
}
