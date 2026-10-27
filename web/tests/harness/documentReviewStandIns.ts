/**
 * D7 — in-memory stand-ins for the governed review and validity functions (`document_review_version`,
 * `document_set_version_validity`, migration 20261213090000). They mirror every refusal the functions raise and append
 * to `document_version_review_events` the way the functions do; the functions themselves (and the append-only guard)
 * are proven against Postgres by certification/invariants/documents-d7-review-validity.sql.
 */
type Row = Record<string, unknown>;
type Db = { rows(table: string): Row[]; seed(table: string, rows: Row[]): void };
type Result = { data: unknown; error: { message: string } | null };

const UNAVAILABLE = new Set(["deleted", "quarantined", "restricted", "superseded"]);
let seq = 0;
const fail = (message: string): Result => ({ data: null, error: { message } });

function current(db: Db, args: Row): { doc: Row; ver: Row } | Result {
    const doc = db.rows("documents").find((d) => d.id === args.p_document_id && d.org_id === args.p_org_id);
    if (!doc) return fail("document_review_document_not_found");
    if (UNAVAILABLE.has(String(doc.status ?? "uploaded").toLowerCase())) return fail("document_review_document_unavailable");
    const currentId = doc.current_version_id ?? db.rows("document_versions").filter((v) => v.document_id === doc.id).sort((a, b) => Number(b.version_number) - Number(a.version_number))[0]?.id;
    if (!currentId || currentId !== args.p_version_id) return fail("document_review_not_current_version");
    const ver = db.rows("document_versions").find((v) => v.id === args.p_version_id && v.org_id === args.p_org_id && v.document_id === doc.id);
    if (!ver) return fail("document_review_not_current_version");
    return { doc, ver };
}

export function documentReviewStandIn(db: Db, name: string, args: Row): Result | undefined {
    if (name === "document_review_version") {
        if (!["accepted", "rejected", "pending"].includes(String(args.p_decision))) return fail("document_review_decision_invalid");
        const found = current(db, args);
        if ("error" in found) return found;
        const { ver } = found;
        const reason = typeof args.p_reason === "string" && args.p_reason.trim() ? args.p_reason.trim() : null;
        const prev = (ver.review_status as string | null) ?? null;
        const decided = prev === "accepted" || prev === "rejected";
        if (decided && !args.p_rereview) return fail("document_review_already_decided");
        if (decided && (!reason || reason.length < 3)) return fail("document_review_reason_required");
        if ((args.p_decision === "rejected" || args.p_decision === "pending") && (!reason || reason.length < 3)) return fail("document_review_reason_required");
        if (args.p_decision === "pending" && (prev ?? "pending") === "pending") return fail("document_review_already_pending");
        const status = String(args.p_decision);
        Object.assign(ver, { review_status: status, reviewed_by: status === "pending" ? null : args.p_actor, reviewed_at: status === "pending" ? null : `2026-10-27T0${(seq % 9) + 1}:00:00Z` });
        const id = `f7000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
        db.seed("document_version_review_events", [
            {
                id, org_id: args.p_org_id, document_id: args.p_document_id, version_id: args.p_version_id, kind: "review",
                decision: status === "pending" ? "reopened" : status, previous_review_status: prev, reason,
                effective_on: ver.effective_on ?? null, expires_on: ver.expires_on ?? null, actor: args.p_actor, created_at: `2026-10-27T1${seq % 10}:00:00Z`,
            },
        ]);
        return { data: { event_id: id, version_id: args.p_version_id, review_status: status, previous_review_status: prev, rereview: decided }, error: null };
    }
    if (name === "document_set_version_validity") {
        if (args.p_effective_on && args.p_expires_on && String(args.p_expires_on) < String(args.p_effective_on)) return fail("document_validity_range_inverted");
        const found = current(db, args);
        if ("error" in found) return found;
        const { ver } = found;
        const prevEff = (ver.effective_on as string | null) ?? null;
        const prevExp = (ver.expires_on as string | null) ?? null;
        if (prevEff === (args.p_effective_on ?? null) && prevExp === (args.p_expires_on ?? null)) {
            return { data: { version_id: ver.id, changed: false, effective_on: args.p_effective_on, expires_on: args.p_expires_on }, error: null };
        }
        Object.assign(ver, { effective_on: args.p_effective_on ?? null, expires_on: args.p_expires_on ?? null });
        const id = `f7100000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
        db.seed("document_version_review_events", [
            {
                id, org_id: args.p_org_id, document_id: args.p_document_id, version_id: args.p_version_id, kind: "validity", decision: null,
                previous_review_status: null, reason: args.p_reason ?? null, effective_on: args.p_effective_on ?? null, expires_on: args.p_expires_on ?? null,
                previous_effective_on: prevEff, previous_expires_on: prevExp, actor: args.p_actor, created_at: `2026-10-27T2${seq % 4}:00:00Z`,
            },
        ]);
        return { data: { event_id: id, version_id: ver.id, changed: true, effective_on: args.p_effective_on, expires_on: args.p_expires_on }, error: null };
    }
    return undefined;
}
