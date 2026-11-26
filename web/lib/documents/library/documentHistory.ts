/**
 * D4.5 — a document's history, built from what the record actually holds.
 *
 * Every entry says what kind of fact it is:
 *   committed  a change the record holds: a version, a subject link (or its end), a review, a release from quarantine, a
 *              filing from Processing (D5: `documents.metadata.filing`, written in the filing transaction);
 *   system     something the platform did on its own: screening's quarantine verdict, a migration backfill;
 *   refused    an audited attempt the record does not reflect: the change was authorized and recorded, then not made;
 *   access     a download link was issued (an access, not a change).
 *
 * The audit stream records ATTEMPTS before their effect (D1a): a `document_version_added` event whose version never
 * landed is not a replacement. So an audit event is shown as completed only when the committed row it produced is
 * found — by the `audit_event_id` the version and the release carry, or, for subject changes, by the link row it
 * wrote. Anything else is `refused`. Committed entries come from the rows themselves, never from the audit alone.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DocumentHistoryKind = "committed" | "system" | "refused" | "access";

export type DocumentHistoryEntry = {
    at: string;
    kind: DocumentHistoryKind;
    action: string;
    /** Short, operator-readable detail. Never a storage path, never another subject's name. */
    detail: string | null;
    version_number: number | null;
};

const SUBJECT_LABEL: Record<string, string> = {
    household: "household",
    person: "adult",
    child: "child",
    opportunity: "enrollment case",
    vendor: "vendor",
    processing_case: "processing case",
    form_submission: "form submission",
};
/** A link row is the result of an audited request if it appeared within this window after the event. */
const MATCH_WINDOW_MS = 120_000;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const ms = (v: unknown) => (typeof v === "string" ? Date.parse(v) : NaN);
const near = (eventAt: number, rowAt: number) => Number.isFinite(eventAt) && Number.isFinite(rowAt) && rowAt >= eventAt - 5_000 && rowAt - eventAt <= MATCH_WINDOW_MS;

type VersionRow = {
    id: string;
    version_number: number;
    source: string | null;
    created_at: string | null;
    replacement_reason: string | null;
    screening: Record<string, unknown> | null;
    provenance: Record<string, unknown> | null;
    review_status: string | null;
    reviewed_at: string | null;
};
type SubjectRow = { subject_type: string; association: string; is_primary: boolean; source: string; created_at: string | null; ended_at: string | null };
type EventRow = { id: string; event_type: string; payload: Record<string, unknown> | null; occurred_at: string | null };
type ReviewEventRow = {
    id: string;
    version_id: string;
    kind: "review" | "validity";
    decision: "accepted" | "rejected" | "reopened" | null;
    previous_review_status: string | null;
    reason: string | null;
    effective_on: string | null;
    expires_on: string | null;
    created_at: string;
};
const REVIEW_ACTION: Record<string, string> = { accepted: "Review accepted", rejected: "Review rejected", reopened: "Review reopened" };

export async function buildDocumentHistory(
    supabase: SupabaseClient,
    orgId: string,
    documentId: string,
): Promise<{ ok: true; entries: DocumentHistoryEntry[] } | { ok: false }> {
    // Audit events about this document (entity_type = the audit's subject table, not a document's legacy parent).
    const eventsRead = supabase
        .from("workflow_events")
        .select("id, event_type, payload, occurred_at")
        .eq("org_id", orgId)
        .eq("entity_type", "documents")
        .eq("entity_id", documentId)
        .order("occurred_at", { ascending: false })
        .limit(200);
    // D7: every review decision and validity record, append-only (document_version_review_events).
    const reviewsRead = supabase
        .from("document_version_review_events")
        .select("id, version_id, kind, decision, previous_review_status, reason, effective_on, expires_on, created_at")
        .eq("org_id", orgId)
        .eq("document_id", documentId)
        .order("created_at", { ascending: true });
    const [doc, versions, subjects, events, reviews] = await Promise.all([
        supabase.from("documents").select("id, sensitivity, metadata").eq("org_id", orgId).eq("id", documentId).maybeSingle(),
        supabase
            .from("document_versions")
            .select("id, version_number, source, created_at, replacement_reason, screening, provenance, review_status, reviewed_at")
            .eq("org_id", orgId)
            .eq("document_id", documentId)
            .order("version_number", { ascending: true }),
        supabase
            .from("document_subjects")
            .select("subject_type, association, is_primary, source, created_at, ended_at")
            .eq("org_id", orgId)
            .eq("document_id", documentId),
        eventsRead,
        reviewsRead,
    ]);
    if (doc.error || versions.error || subjects.error || events.error || !doc.data) return { ok: false };
    // A history that cannot read its review log falls back to each version's latest decision (the D6 behaviour).
    const reviewRows = (reviews.error ? [] : (reviews.data ?? [])) as ReviewEventRow[];
    const reviewedVersions = new Set(reviewRows.filter((r) => r.kind === "review").map((r) => r.version_id));

    const entries: DocumentHistoryEntry[] = [];
    const versionRows = (versions.data ?? []) as VersionRow[];
    const subjectRows = (subjects.data ?? []) as SubjectRow[];
    const eventRows = (events.data ?? []) as EventRow[];
    const metadata = ((doc.data as { metadata?: unknown }).metadata ?? {}) as Record<string, unknown>;
    const release = ((metadata.screening ?? {}) as Record<string, unknown>).release as Record<string, unknown> | undefined;

    const committedAuditIds = new Set<string>();
    for (const v of versionRows) {
        const at = str(v.created_at) ?? "";
        const auditId = str(v.provenance?.audit_event_id);
        if (auditId) committedAuditIds.add(auditId);
        if (v.source === "replacement" && str(v.provenance?.filed_from_document_id)) {
            // D5: a received document filed from Processing as this document's next version.
            entries.push({ at, kind: "committed", action: `Filed from Processing as version ${v.version_number}`, detail: null, version_number: v.version_number });
        } else if (v.source === "replacement") {
            entries.push({ at, kind: "committed", action: `Replaced with version ${v.version_number}`, detail: str(v.replacement_reason), version_number: v.version_number });
        } else if (v.source === "legacy_backfill") {
            entries.push({ at, kind: "system", action: "Recorded as version 1 when versioning began", detail: null, version_number: v.version_number });
        } else {
            entries.push({ at, kind: "committed", action: "Uploaded", detail: null, version_number: v.version_number });
        }
        if (str(v.screening?.verdict) === "quarantine") {
            entries.push({ at, kind: "system", action: "Quarantined by screening", detail: str(v.screening?.reason), version_number: v.version_number });
        }
        // Reviews recorded before D7 have no events: the version's own (latest) decision is all there is.
        if (!reviewedVersions.has(v.id) && (v.review_status === "accepted" || v.review_status === "rejected") && str(v.reviewed_at)) {
            entries.push({ at: str(v.reviewed_at) ?? at, kind: "committed", action: v.review_status === "accepted" ? "Review accepted" : "Review rejected", detail: null, version_number: v.version_number });
        }
    }
    const versionNumber = new Map(versionRows.map((v) => [v.id, v.version_number]));
    for (const r of reviewRows) {
        const n = versionNumber.get(r.version_id) ?? null;
        if (r.kind === "review" && r.decision) {
            const changed = r.previous_review_status === "accepted" || r.previous_review_status === "rejected";
            const action = `${REVIEW_ACTION[r.decision] ?? "Reviewed"}${changed && r.decision !== "reopened" ? ` (was ${r.previous_review_status})` : ""}`;
            entries.push({ at: r.created_at, kind: "committed", action, detail: str(r.reason), version_number: n });
        } else if (r.kind === "validity") {
            const parts = [r.effective_on ? `effective ${r.effective_on}` : null, r.expires_on ? `expires ${r.expires_on}` : "no expiration date"].filter(Boolean);
            entries.push({ at: r.created_at, kind: "committed", action: `Validity recorded: ${parts.join(", ")}`, detail: str(r.reason), version_number: n });
        }
    }
    if (release && str(release.at)) {
        const auditId = str(release.audit_event_id);
        if (auditId) committedAuditIds.add(auditId);
        entries.push({ at: str(release.at) ?? "", kind: "committed", action: "Released from quarantine", detail: str(release.reason), version_number: null });
    }
    // D5: the committed filing record (written in the filing transaction itself).
    const filing = (metadata.filing ?? null) as Record<string, unknown> | null;
    if (filing && str(filing.filed_at)) {
        entries.push({
            at: str(filing.filed_at) ?? "",
            kind: "committed",
            action: filing.mode === "new_version" ? "Filed from Processing as a new version of the record's document" : "Filed from Processing",
            detail: str(filing.doc_type)?.replace(/_/g, " ") ?? null,
            version_number: null,
        });
    }
    for (const s of subjectRows) {
        const what = `${s.is_primary ? "primary owner" : s.association === "owner" ? "owner" : "related"}: ${SUBJECT_LABEL[s.subject_type] ?? s.subject_type}`;
        const at = str(s.created_at) ?? "";
        if (s.source === "legacy_backfill") entries.push({ at, kind: "system", action: `Associated (${what})`, detail: "Recorded from the original filing when subjects were introduced", version_number: null });
        else entries.push({ at, kind: "committed", action: `Associated (${what})`, detail: null, version_number: null });
        if (str(s.ended_at)) entries.push({ at: str(s.ended_at) ?? "", kind: "committed", action: `Association ended (${what})`, detail: null, version_number: null });
    }

    for (const e of eventRows) {
        const at = str(e.occurred_at) ?? "";
        const eventAt = ms(e.occurred_at);
        const p = e.payload ?? {};
        switch (e.event_type) {
            case "document_link_issued":
                entries.push({ at, kind: "access", action: "Download link issued", detail: null, version_number: null });
                break;
            case "document_version_added":
                if (!committedAuditIds.has(e.id)) entries.push({ at, kind: "refused", action: "Replacement attempted — no version was recorded", detail: null, version_number: null });
                break;
            case "document_released":
                if (!committedAuditIds.has(e.id)) entries.push({ at, kind: "refused", action: "Release attempted — the document was not released", detail: null, version_number: null });
                break;
            case "document_subject_changed": {
                const type = str(p.subject_type);
                const action = str(p.action);
                const landed = subjectRows.some(
                    (s) => s.subject_type === type && (action === "unlink" ? near(eventAt, ms(s.ended_at)) : near(eventAt, ms(s.created_at))),
                );
                if (!landed) entries.push({ at, kind: "refused", action: "Association change attempted — not applied", detail: type ? (SUBJECT_LABEL[type] ?? type) : null, version_number: null });
                break;
            }
            case "document_sensitivity_raised": {
                const to = str(p.to);
                const current = str((doc.data as { sensitivity?: unknown }).sensitivity);
                if (to && to === current) entries.push({ at, kind: "committed", action: `Sensitivity raised to ${to.replace(/_/g, " ")}`, detail: str(p.reason), version_number: null });
                else entries.push({ at, kind: "refused", action: "Sensitivity change attempted — not applied", detail: null, version_number: null });
                break;
            }
            case "document_filing_authorized":
                // Committed only when the filing record names THIS audited attempt (an earlier, failed attempt of the same case
                // shares the key); the committed entry itself comes from that record.
                if (!filing || (str(filing.audit_event_id) ? str(filing.audit_event_id) !== e.id : str(filing.key) !== str(p.filing_key))) {
                    entries.push({ at, kind: "refused", action: "Filing attempted — not filed", detail: null, version_number: null });
                }
                break;
            case "document_delete_failed":
                entries.push({ at, kind: "refused", action: "Deletion attempted — the document was kept", detail: null, version_number: null });
                break;
            default:
                break;
        }
    }

    entries.sort((a, b) => b.at.localeCompare(a.at));
    return { ok: true, entries };
}
