/**
 * D7 — Documents attention: owned documents that need an operator because of their validity or their review.
 *
 *   expired         the current version (or the earlier accepted version it rests on) is past its expiration
 *   expiring_soon   inside its type's expiring-soon window — renew it
 *   review_due      the current version awaits review (a renewal, or an upload of a review-required type)
 *   date_missing    accepted, but its type needs a recorded expiration date that nobody recorded
 *
 * ONE projection, DERIVED on every read by the one validity evaluator (`documentValidity.ts`) on the ORGANIZATION-local
 * date — never stored, never an `operational_tasks` row. It complements D6 requirement work: a document already named
 * by a requirement work row (its pending / expired / undated evidence, or the same subject and type in renewal) is NOT
 * listed again here, so an operator sees one row per thing to do.
 *
 * Population: documents with an active OWNER association (D2) — received documents still in Processing intake are D5's
 * filing queue, not this one — of a published type that tracks validity or requires review, that are available (never
 * quarantined, deleted, restricted or superseded). Disclosure is the canonical document disclosure: organization, the
 * actor's subject scope, then sensitivity clearance, before anything is listed or counted.
 */
import { validityNeedsEventDates } from "@/lib/documents/validity/documentValidity";
import { loadValidityEventDates } from "@/lib/documents/validity/validityEventDates";
import type { SupabaseClient } from "@supabase/supabase-js";

import { filterDocumentRowsInActorScope } from "@/lib/documents/assertDocumentAccess";
import { isDocumentUnavailable } from "@/lib/documents/documentAvailability";
import { filterDocumentRowsBySensitivity } from "@/lib/documents/documentSensitivity";
import {
    evidenceVersionFacts,
    subjectLabels,
    subjectKey,
    type RequirementActor,
    type RequirementTypeCatalog,
    type RequirementWorkRow,
    type SubjectRef,
} from "@/lib/documents/requirements/documentRequirementService";
import type { RequirementSubjectType } from "@/lib/documents/requirements/documentRequirementPolicy";
import type { DocumentValidity } from "@/lib/documents/validity/documentValidity";
import type { DocumentsClock } from "@/lib/documents/validity/documentsClock";
import type { DocumentAttentionKind, DocumentAttentionRow } from "@/lib/documents/validity/documentAttentionVocabulary";

/**
 * B3 — the population is read COMPLETELY, in keyset pages, never silently capped.
 *
 * Before: the newest 1,000 tracked documents (a cap that also counted documents the reader could not see), with one
 * `truncated` flag. Now: every tracked document is scanned in id-ordered pages of `DOCUMENT_ATTENTION_SCAN_PAGE`; one
 * request scans at most `DOCUMENT_ATTENTION_SCAN_WINDOW` documents (a bounded window), sorts that window's attention by
 * due date, and returns at most `limit` rows plus an opaque cursor for the rest. `complete` says whether the whole
 * population has been returned; nothing is dropped without a cursor that reaches it.
 */
export const DOCUMENT_ATTENTION_SCAN_PAGE = 500;
export const DOCUMENT_ATTENTION_SCAN_WINDOW = 20_000;
export const DOCUMENT_ATTENTION_DEFAULT_LIMIT = 200;
export const DOCUMENT_ATTENTION_MAX_LIMIT = 500;

/** Where the next page starts: after this document id, skipping `offset` rows of that window's sorted attention. */
export type DocumentAttentionCursor = { after_id: string | null; offset: number };

export function encodeDocumentAttentionCursor(c: DocumentAttentionCursor): string {
    return Buffer.from(JSON.stringify({ a: c.after_id, o: c.offset }), "utf8").toString("base64url");
}

export function decodeDocumentAttentionCursor(raw: string | null | undefined): DocumentAttentionCursor | null {
    if (!raw) return { after_id: null, offset: 0 };
    try {
        const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { a?: unknown; o?: unknown };
        const after = v.a === null ? null : typeof v.a === "string" && /^[0-9a-f-]{36}$/i.test(v.a) ? v.a : undefined;
        const offset = Number.isInteger(v.o) && (v.o as number) >= 0 ? (v.o as number) : undefined;
        if (after === undefined || offset === undefined) return null;
        return { after_id: after, offset };
    } catch {
        return null;
    }
}

export { DOCUMENT_ATTENTION_ACTION, DOCUMENT_ATTENTION_KINDS, DOCUMENT_ATTENTION_LABEL } from "@/lib/documents/validity/documentAttentionVocabulary";
export type { DocumentAttentionKind, DocumentAttentionRow } from "@/lib/documents/validity/documentAttentionVocabulary";

const SUBJECT_TYPES = new Set<string>(["household", "person", "child", "opportunity"]);
const IN_CHUNK = 150;

function chunks<T>(list: T[], size = IN_CHUNK): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

/** Which attention, if any, one document needs today. Pure: the caller supplies validity and review. */
export function attentionKindFor(input: {
    review_status: "pending" | "accepted" | "rejected" | null;
    review_required: boolean;
    validity: DocumentValidity | null;
    prior_validity: DocumentValidity | null;
}): DocumentAttentionKind | null {
    const review = input.review_status ?? (input.review_required ? "pending" : "accepted");
    if (review === "pending") return "review_due";
    // A rejected renewal leaves the earlier accepted version as the evidence; its validity is what needs attention.
    const v = review === "accepted" ? input.validity : input.prior_validity;
    if (!v) return null;
    if (v.status === "expired") return "expired";
    if (v.status === "expiring_soon") return "expiring_soon";
    if (v.status === "date_missing" && review === "accepted") return "date_missing";
    return null;
}

/** Document ids (and subject/type pairs in renewal) a requirement work row already represents. */
export function requirementCoverage(rows: readonly RequirementWorkRow[]): { documents: Set<string>; renewals: Set<string> } {
    const documents = new Set<string>();
    const renewals = new Set<string>();
    for (const r of rows) {
        for (const id of [...r.pending_document_ids, ...r.expired_document_ids, ...r.undated_document_ids]) documents.add(id);
        if (r.state === "expiring_soon" || r.state === "expired") renewals.add(`${r.subject_type}:${r.subject_id}:${r.document_type_key}`);
    }
    return { documents, renewals };
}

export type DocumentAttentionResult =
    | {
          ok: true;
          rows: DocumentAttentionRow[];
          /** Continue here for more rows; null once the whole population has been returned. */
          next_cursor: string | null;
          complete: boolean;
          /** Tracked documents scanned by this request (disclosed or not). */
          scanned: number;
      }
    | { ok: false; code: string };

type DocRow = { id: string; title: string | null; doc_type: string; status: string | null; entity_type: string | null; entity_id: string | null; current_version_id: string | null; created_at: string | null };


export async function listDocumentAttention(
    supabase: SupabaseClient,
    actor: RequirementActor,
    input: {
        types: RequirementTypeCatalog;
        clock: DocumentsClock;
        requirementRows?: readonly RequirementWorkRow[];
        /** Opaque cursor from a previous page (absent = from the start). */
        cursor?: string | null;
        /** Rows wanted (default 200, at most 500). */
        limit?: number | null;
    },
): Promise<DocumentAttentionResult> {
    const { orgId } = actor;
    const { types } = input;
    const limit = Math.min(DOCUMENT_ATTENTION_MAX_LIMIT, Math.max(1, Math.floor(Number(input.limit) || DOCUMENT_ATTENTION_DEFAULT_LIMIT)));
    const done = { ok: true as const, rows: [], next_cursor: null, complete: true, scanned: 0 };
    if (!actor.scope) return done;
    const tracked = [...types.values()].filter((t) => t.review_required || (t.validity_policy?.kind ?? "none") !== "none").map((t) => t.key);
    if (tracked.length === 0) return done;
    const start = decodeDocumentAttentionCursor(input.cursor);
    if (!start) return { ok: false, code: "INVALID_CURSOR" };

    const rows: DocumentAttentionRow[] = [];
    let after = start.after_id;
    let offset = start.offset;
    let scanned = 0;
    while (rows.length < limit && scanned < DOCUMENT_ATTENTION_SCAN_WINDOW) {
        // One window: scan pages until the window is full or the population ends.
        const windowStart = after;
        const windowDocs: DocRow[] = [];
        let exhausted = false;
        while (windowDocs.length < DOCUMENT_ATTENTION_SCAN_WINDOW - scanned) {
            let q = supabase
                .from("documents")
                .select("id, title, doc_type, status, entity_type, entity_id, current_version_id, created_at")
                .eq("org_id", orgId)
                .in("doc_type", tracked);
            const cur = windowDocs.length ? windowDocs[windowDocs.length - 1]!.id : after;
            if (cur) q = q.gt("id", cur);
            const { data, error } = await q.order("id", { ascending: true }).limit(DOCUMENT_ATTENTION_SCAN_PAGE);
            if (error) return { ok: false, code: "ATTENTION_UNAVAILABLE" };
            const page = (data ?? []) as DocRow[];
            windowDocs.push(...page);
            if (page.length < DOCUMENT_ATTENTION_SCAN_PAGE) {
                exhausted = true;
                break;
            }
        }
        scanned += windowDocs.length;
        const evaluated = await evaluateAttentionWindow(supabase, actor, input, windowDocs);
        if (!evaluated.ok) return evaluated;
        const take = evaluated.rows.slice(offset, offset + (limit - rows.length));
        rows.push(...take);
        const consumed = offset + take.length;
        const windowEnd = windowDocs.length ? windowDocs[windowDocs.length - 1]!.id : after;
        if (consumed < evaluated.rows.length) {
            // The page filled inside this window: continue in the same window.
            return { ok: true, rows, next_cursor: encodeDocumentAttentionCursor({ after_id: windowStart, offset: consumed }), complete: false, scanned };
        }
        if (exhausted) return { ok: true, rows, next_cursor: null, complete: true, scanned };
        after = windowEnd;
        offset = 0;
    }
    return { ok: true, rows, next_cursor: encodeDocumentAttentionCursor({ after_id: after, offset: 0 }), complete: false, scanned };
}

/** Attention rows for one scanned window of tracked documents, sorted by due date. */
async function evaluateAttentionWindow(
    supabase: SupabaseClient,
    actor: RequirementActor,
    input: { types: RequirementTypeCatalog; clock: DocumentsClock; requirementRows?: readonly RequirementWorkRow[] },
    all: DocRow[],
): Promise<{ ok: true; rows: DocumentAttentionRow[] } | { ok: false; code: string }> {
    const { orgId } = actor;
    const { types, clock } = input;
    const available = all.filter((d) => !isDocumentUnavailable(d.status) && d.current_version_id);
    if (available.length === 0) return { ok: true, rows: [] };

    // Disclosure first: nothing outside scope or clearance is evaluated, listed or counted.
    const inScope = await filterDocumentRowsInActorScope(supabase, orgId, actor.scope, available);
    const cleared = await filterDocumentRowsBySensitivity(supabase, orgId, actor, inScope);
    if (cleared.length === 0) return { ok: true, rows: [] };
    const ids = cleared.map((d) => d.id);

    const ownerReads = await Promise.all(
        chunks(ids).map((c) =>
            supabase.from("document_subjects").select("document_id, subject_type, subject_id, is_primary").eq("org_id", orgId).eq("association", "owner").is("ended_at", null).in("document_id", c),
        ),
    );
    const versionReads = await Promise.all(
        chunks(ids).map((c) =>
            supabase
                .from("document_versions")
                .select("id, document_id, version_number, review_status, reviewed_at, effective_on, expires_on, created_at")
                .eq("org_id", orgId)
                .in("document_id", c),
        ),
    );
    if (ownerReads.some((r) => r.error) || versionReads.some((r) => r.error)) return { ok: false, code: "ATTENTION_UNAVAILABLE" };
    type Owner = { document_id: string; subject_type: string; subject_id: string; is_primary: boolean | null };
    const ownerOf = new Map<string, Owner>();
    for (const o of ownerReads.flatMap((r) => (r.data ?? []) as Owner[])) {
        if (!SUBJECT_TYPES.has(o.subject_type)) continue;
        const prev = ownerOf.get(o.document_id);
        if (!prev || (o.is_primary && !prev.is_primary)) ownerOf.set(o.document_id, o);
    }
    type V = Parameters<typeof evidenceVersionFacts>[2][number];
    const versionsByDoc = new Map<string, V[]>();
    for (const v of versionReads.flatMap((r) => (r.data ?? []) as V[])) versionsByDoc.set(v.document_id, [...(versionsByDoc.get(v.document_id) ?? []), v]);

    // B2: event-renewal types resolve from each owner's authoritative event dates.
    const eventOwners = cleared
        .filter((d) => validityNeedsEventDates(types.get(d.doc_type)?.validity_policy) && ownerOf.has(d.id))
        .map((d) => ownerOf.get(d.id)!);
    const events = eventOwners.length ? await loadValidityEventDates(supabase, orgId, eventOwners) : null;

    const coverage = requirementCoverage(input.requirementRows ?? []);
    const pending: Array<Omit<DocumentAttentionRow, "subject_label" | "household_id">> = [];
    for (const d of cleared) {
        const owner = ownerOf.get(d.id);
        if (!owner || coverage.documents.has(d.id)) continue;
        if (coverage.renewals.has(`${owner.subject_type}:${owner.subject_id}:${d.doc_type}`)) continue;
        const type = types.get(d.doc_type);
        const facts = evidenceVersionFacts(types, d, versionsByDoc.get(d.id) ?? [], clock, events?.get(`${owner.subject_type}:${owner.subject_id}`) ?? null);
        const kind = attentionKindFor({
            review_status: facts.review_status,
            review_required: type?.review_required === true,
            validity: facts.validity,
            prior_validity: facts.prior_accepted?.validity ?? null,
        });
        if (!kind) continue;
        const v = kind === "review_due" ? null : facts.review_status === "accepted" || facts.review_status === null ? facts.validity : facts.prior_accepted?.validity ?? null;
        const current = (versionsByDoc.get(d.id) ?? []).find((x) => x.id === d.current_version_id);
        const due = kind === "review_due" ? (current?.created_at ?? d.created_at ?? "").slice(0, 10) || null : v?.expires_on ?? null;
        pending.push({
            id: `document_attention:${d.id}:${kind}`,
            kind,
            document_id: d.id,
            document_title: d.title,
            document_type_key: d.doc_type,
            document_type_label: type?.label ?? d.doc_type,
            subject_type: owner.subject_type as RequirementSubjectType,
            subject_id: owner.subject_id,
            expires_on: v?.expires_on ?? null,
            days_remaining: v?.days_remaining ?? null,
            due_on: due,
            overdue: kind === "expired" || (kind === "review_due" ? false : Boolean(due && due < clock.today)),
            review_status: facts.review_status,
        });
    }
    const refs: SubjectRef[] = pending.map((r) => ({ subject_type: r.subject_type, subject_id: r.subject_id }));
    const labels = await subjectLabels(supabase, orgId, refs);
    const rows: DocumentAttentionRow[] = pending
        .map((r) => {
            const l = labels.get(subjectKey(r));
            return { ...r, subject_label: l?.label ?? "Record", household_id: l?.household_id ?? null };
        })
        .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || a.subject_label.localeCompare(b.subject_label) || a.id.localeCompare(b.id));
    return { ok: true, rows };
}
