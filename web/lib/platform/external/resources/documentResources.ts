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
