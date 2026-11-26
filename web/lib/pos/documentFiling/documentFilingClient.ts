/**
 * D5 — browser calls for Processing → Work → Documents. Every decision is the server's; this only carries requests.
 */
import type { DocumentFilingProposal } from "@/lib/pos/documentFiling/documentFilingModel";
import type { DocumentFilingQueueRow, DocumentFilingWorkspace } from "@/lib/pos/documentFiling/documentFilingService";

export type ApiFailure = { ok: false; status: number; code: string; message: string; problems?: Array<{ code: string; message: string }> };

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; body: T } | ApiFailure> {
    let res: Response;
    try {
        res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
    } catch {
        return { ok: false, status: 0, code: "NETWORK", message: "The request did not reach the server. Try again." };
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || body.ok === false) {
        return {
            ok: false,
            status: res.status,
            code: typeof body.code === "string" ? body.code : `HTTP_${res.status}`,
            message: typeof body.error === "string" ? body.error : "The request was refused.",
            problems: Array.isArray(body.problems) ? (body.problems as ApiFailure["problems"]) : undefined,
        };
    }
    return { ok: true, body: body as T };
}

export const fetchDocumentFilingQueue = () => call<{ rows: DocumentFilingQueueRow[] }>("/api/admin/processing/documents/queue");

export const fetchDocumentFilingWorkspace = (caseId: string, householdId?: string | null) =>
    call<{ workspace: DocumentFilingWorkspace }>(
        `/api/admin/processing/cases/${encodeURIComponent(caseId)}/document-filing${householdId ? `?household_id=${encodeURIComponent(householdId)}` : ""}`,
    );

export const saveDocumentFilingProposalRequest = (caseId: string, proposal: Partial<DocumentFilingProposal>) =>
    call<{ proposal: DocumentFilingProposal }>(`/api/admin/processing/cases/${encodeURIComponent(caseId)}/document-filing`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposal }),
    });

/** Approval files the document (Documents command) and completes the case only after the filing committed. */
export const fileDocumentCaseRequest = (caseId: string) =>
    call<{ data?: { status: string; operationalResult?: Record<string, unknown> } }>(`/api/admin/processing/cases/${encodeURIComponent(caseId)}/approve`, { method: "POST" });

export type HouseholdSearchHit = { household_id: string; label: string; kind: string; display_name: string };

/**
 * Find the household to choose a record from, through the platform's one search (authorized before retrieval). The
 * hit is a SELECTION, never mutation input: the workspace re-reads the household graph and the server re-resolves
 * every chosen record.
 */
export async function searchHouseholds(q: string): Promise<HouseholdSearchHit[]> {
    const r = await call<{ results: Array<{ subject: { kind: string; id: string; display_name: string; household_id?: string | null } }> }>(
        `/api/admin/global-search?q=${encodeURIComponent(q)}&limit=8`,
    );
    if (!r.ok) return [];
    const seen = new Set<string>();
    const hits: HouseholdSearchHit[] = [];
    for (const res of r.body.results ?? []) {
        const s = res.subject;
        const householdId = s.kind === "household" ? s.id : s.household_id ?? null;
        if (!householdId || seen.has(householdId)) continue;
        seen.add(householdId);
        hits.push({ household_id: householdId, label: s.display_name, kind: s.kind, display_name: s.display_name });
    }
    return hits;
}

export async function openDocumentLink(documentId: string): Promise<string | null> {
    const r = await call<{ url?: string; signedUrl?: string; signed_url?: string }>(`/api/admin/documents/${encodeURIComponent(documentId)}/signed-url`);
    if (!r.ok) return null;
    return r.body.url ?? r.body.signedUrl ?? r.body.signed_url ?? null;
}
