/**
 * D9.2 — unfiled `/api/v1` uploads become Processing cases after 24 hours (operator-approved 2026-11-03).
 *
 * Synthetic: the in-memory service client and an in-memory `open_processing_case_with_primary_source` with the
 * function's contract (one transaction; one primary source per (org, kind, id)). The real `makeProcessingCaseDbDeps`,
 * opener, annotation and resolution run unmodified. NOT proven here: the SQL function itself (D10-A1/A2) and the
 * deployed wake.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { InMemorySupabase } from "../harness/inMemorySupabase";
import type { DocumentAuditInput } from "@/lib/documents/documentAudit";
import {
    API_UPLOAD_ESCALATION_KEY,
    escalateUnfiledApiUploads,
    resolveEscalatedUploadCase,
    UNFILED_API_UPLOAD_GRACE_MS,
} from "@/lib/documents/external/unfiledApiUploadEscalation";
import { caseRequiresFiling } from "@/lib/pos/documentFiling/documentFilingService";
import { makeProcessingCaseDbDeps } from "@/lib/pos/processingCase/processingCaseDb";

const ORG = "0a000000-0000-4000-8000-0000000000e1";
const OTHER = "0b000000-0000-4000-8000-0000000000e1";
const NOW = Date.parse("2026-11-04T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;
const D = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db: InMemorySupabase;
let audits: DocumentAuditInput[];
let auditOk: boolean;
let order: string[];
const audit = async (input: DocumentAuditInput) => {
    order.push(`audit:${input.event}`);
    if (!auditOk) return { ok: false as const, error: "down" };
    audits.push(input);
    return { ok: true as const, eventId: `evt-${audits.length}` };
};

function apiUpload(id: string, over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
    return {
        id,
        org_id: ORG,
        title: "report.pdf",
        original_filename: "report.pdf",
        status: "uploaded",
        doc_type: null,
        created_at: ago(25 * HOUR),
        metadata: { source: "api_v1_upload", received_via: { kind: "api_v1", installation_id: "inst-1", application_id: "app-1", credential_id: "cred-1" }, ...meta },
        ...over,
    };
}

/** The function's contract: one transaction, one primary per (org, kind, id); a second caller gets the first's case. */
function installAtomicOpen(target: InMemorySupabase, { available = true } = {}) {
    (target as unknown as { rpc: unknown }).rpc = async (fn: string, a: Record<string, unknown>) => {
        if (fn !== "open_processing_case_with_primary_source" || !available) return { data: null, error: { code: "PGRST202", message: "missing" } };
        order.push("open");
        const hit = target.rows("processing_case_sources").find((s) => s.org_id === a.p_org_id && s.source_kind === a.p_source_kind && s.source_id === a.p_source_id && s.role === "primary");
        if (hit) return { data: [{ processing_case_id: hit.processing_case_id, created: false }], error: null };
        const id = `ca000000-0000-4000-8000-${String(target.rows("processing_cases").length + 1).padStart(12, "0")}`;
        target.seed("processing_cases", [{ id, org_id: a.p_org_id, status: "received", case_type: a.p_case_type, metadata: {}, created_at: new Date(NOW).toISOString() }]);
        target.seed("processing_case_sources", [{ org_id: a.p_org_id, processing_case_id: id, source_kind: a.p_source_kind, source_id: a.p_source_id, role: "primary" }]);
        return { data: [{ processing_case_id: id, created: true }], error: null };
    };
}

const run = (over: Record<string, unknown> = {}) =>
    escalateUnfiledApiUploads({ supabase: db as unknown as SupabaseClient, processing: makeProcessingCaseDbDeps(db as unknown as SupabaseClient), audit, nowMs: NOW, ...over });

beforeEach(() => {
    db = new InMemorySupabase();
    audits = [];
    auditOk = true;
    order = [];
    installAtomicOpen(db);
});

describe("escalation after the 24-hour grace period", () => {
    it("opens one case for an unfiled upload past the grace period, audited first, and leaves the document untouched", async () => {
        db.seed("documents", [apiUpload(D(1)), apiUpload(D(2), { created_at: ago(UNFILED_API_UPLOAD_GRACE_MS - 60_000) })]);
        const before = JSON.parse(JSON.stringify(db.rows("documents")));

        const r = await run();

        expect(r).toMatchObject({ opened: 1, existing: 0, held: 0, failed: 0 });
        expect(order).toEqual(["audit:document_unfiled_upload_escalated", "open"]);
        const [src] = db.rows("processing_case_sources");
        expect(src).toMatchObject({ org_id: ORG, source_kind: "upload", source_id: D(1), role: "primary" });
        const c = db.rows("processing_cases")[0];
        expect(caseRequiresFiling(c as { metadata: Record<string, unknown> })).toBe(true);
        expect((c.metadata as Record<string, unknown>)[API_UPLOAD_ESCALATION_KEY]).toMatchObject({ kind: "api_v1_unfiled_upload", document_id: D(1), installation_id: "inst-1", application_id: "app-1", grace_hours: 24 });
        expect(audits[0]).toMatchObject({ orgId: ORG, actorUserId: null, actorPrincipal: { kind: "system", process: "api_upload_escalation" }, subject: { type: "documents", id: D(1) } });
        // Still unfiled: no subject, no type, no filing record — it satisfies no requirement and its screening is unchanged.
        expect(db.rows("documents")).toEqual(before);
        expect(db.rows("document_subjects")).toEqual([]);
    });

    it("is idempotent across retries and concurrent wakes: one case, one audit", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        await Promise.all([run(), run()]);
        const again = await run();
        expect(db.rows("processing_cases")).toHaveLength(1);
        expect(db.rows("processing_case_sources")).toHaveLength(1);
        expect(again).toMatchObject({ opened: 0, existing: 1 });
        // The concurrent pair may both audit their attempt; the retry after the case exists never does.
        const countBefore = audits.length;
        await run();
        expect(audits.length).toBe(countBefore);
    });

    it("never escalates a quarantined, filed, non-API or other-installation-less upload", async () => {
        db.seed("documents", [
            apiUpload(D(1), { status: "quarantined" }),
            apiUpload(D(2), {}, { filing: { key: "ext:inst-1:k", mode: "new_document" } }),
            { ...apiUpload(D(3)), metadata: { source: "admin_upload" } },
            { ...apiUpload(D(4)), metadata: { source: "api_v1_upload" } },
        ]);
        const r = await run();
        expect(db.rows("processing_cases")).toEqual([]);
        expect(audits).toEqual([]);
        expect(r.outcomes).toEqual(
            expect.arrayContaining([
                { document_id: D(1), outcome: "skipped", reason: "unavailable" },
                { document_id: D(4), outcome: "skipped", reason: "not_api_upload" },
            ]),
        );
        expect(r.outcomes.map((o) => o.document_id)).not.toContain(D(2));
        expect(r.outcomes.map((o) => o.document_id)).not.toContain(D(3));
    });

    it("holds every upload while the atomic open is absent — the legacy sequence is never used", async () => {
        installAtomicOpen(db, { available: false });
        db.seed("documents", [apiUpload(D(1))]);
        const r = await run();
        expect(r).toMatchObject({ held: 1, opened: 0 });
        expect(db.rows("processing_cases")).toEqual([]);
        expect(db.rows("processing_case_sources")).toEqual([]);
        // Retried on the next wake once the function exists.
        installAtomicOpen(db);
        expect(await run()).toMatchObject({ opened: 1 });
    });

    it("an audit failure opens nothing; the next wake opens it", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        auditOk = false;
        expect(await run()).toMatchObject({ failed: 1, opened: 0 });
        expect(db.rows("processing_cases")).toEqual([]);
        auditOk = true;
        expect(await run()).toMatchObject({ opened: 1 });
    });

    it("a lost annotation is restored by the next wake without a second case or audit", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        const real = db.from.bind(db);
        let failUpdate = true;
        (db as unknown as { from: unknown }).from = (t: string) => {
            const q = real(t);
            if (t !== "processing_cases" || !failUpdate) return q;
            const update = q.update.bind(q);
            (q as unknown as { update: unknown }).update = (patch: Record<string, unknown>) => {
                update(patch);
                return { eq: () => ({ eq: async () => ({ data: null, error: { message: "down" } }) }) };
            };
            return q;
        };
        expect(await run()).toMatchObject({ failed: 1 });
        expect(db.rows("processing_cases")).toHaveLength(1);
        expect(caseRequiresFiling(db.rows("processing_cases")[0] as { metadata: Record<string, unknown> })).toBe(false);
        failUpdate = false;
        const audited = audits.length;
        expect(await run()).toMatchObject({ repaired: 1, opened: 0 });
        expect(db.rows("processing_cases")).toHaveLength(1);
        expect(caseRequiresFiling(db.rows("processing_cases")[0] as { metadata: Record<string, unknown> })).toBe(true);
        expect(audits.length).toBe(audited);
    });

    it("converges on a concurrently committed case when the open itself errors", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        db.seed("processing_cases", [{ id: "ca000000-0000-4000-8000-0000000000ff", org_id: ORG, status: "received", metadata: {} }]);
        (db as unknown as { rpc: unknown }).rpc = async () => {
            // The other wake committed between this one's lookup and its open; this call only sees a transient error.
            db.seed("processing_case_sources", [{ org_id: ORG, processing_case_id: "ca000000-0000-4000-8000-0000000000ff", source_kind: "upload", source_id: D(1), role: "primary" }]);
            return { data: null, error: { code: "40001", message: "serialization failure" } };
        };
        const r = await run();
        expect(r.outcomes[0]).toMatchObject({ outcome: "case_existing", processing_case_id: "ca000000-0000-4000-8000-0000000000ff" });
        expect(db.rows("processing_cases")).toHaveLength(1);
    });

    it("never pairs a case with another organization's document of the same id", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        db.seed("processing_case_sources", [{ org_id: OTHER, processing_case_id: "ca000000-0000-4000-8000-0000000000aa", source_kind: "upload", source_id: D(1), role: "primary" }]);
        expect(await run()).toMatchObject({ opened: 1 });
        expect(db.rows("processing_case_sources").filter((s) => s.org_id === ORG)).toHaveLength(1);
    });
});

describe("later-wake confirmation (D9-H2 W-ES: a second wake adds nothing)", () => {
    const W1 = "2026-11-04T11:55:00.123456+00:00"; // the wake that opens the case
    const W2 = "2026-11-04T12:00:00.654321+00:00"; // the next wake: the first later one
    const W3 = "2026-11-04T12:05:00.000001+00:00";
    const esc = () => (db.rows("processing_cases")[0].metadata as Record<string, Record<string, unknown>>)[API_UPLOAD_ESCALATION_KEY];

    /** trg_processing_cases_updated_at: every UPDATE of a case refreshes updated_at (the fake has no triggers). */
    let tick = 0;
    function installUpdatedAtTrigger() {
        const real = db.from.bind(db);
        (db as unknown as { from: unknown }).from = (t: string) => {
            const q = real(t);
            if (t !== "processing_cases") return q;
            const update = q.update.bind(q);
            (q as unknown as { update: unknown }).update = (patch: Record<string, unknown>) =>
                update({ ...patch, updated_at: `2026-11-04T12:00:00.${String(++tick).padStart(6, "0")}+00:00` });
            return q;
        };
    }
    beforeEach(() => {
        tick = 0;
        installUpdatedAtTrigger();
    });

    function failCaseUpdates() {
        const real = db.from.bind(db);
        (db as unknown as { from: unknown }).from = (t: string) => {
            const q = real(t);
            if (t !== "processing_cases") return q;
            const failing: Record<string, unknown> = {};
            failing.eq = () => failing;
            failing.is = () => failing;
            failing.select = async () => ({ data: null, error: { message: "down" } });
            (q as unknown as { update: unknown }).update = () => failing;
            return q;
        };
        return () => ((db as unknown as { from: unknown }).from = real);
    }

    /** Another writer changes the case between this wake's read and its write (a staff action, the filing close…). */
    function concurrentWriterAfterNextCaseRead(patch: Record<string, unknown>) {
        const real = db.from.bind(db);
        let armed = true;
        (db as unknown as { from: unknown }).from = (t: string) => {
            const q = real(t);
            if (t !== "processing_cases" || !armed) return q;
            const maybeSingle = q.maybeSingle.bind(q);
            (q as unknown as { maybeSingle: unknown }).maybeSingle = async () => {
                // PostgREST returns a snapshot; the fake returns live rows, so copy before the concurrent write lands.
                const live = await maybeSingle();
                const read = { ...live, data: live.data ? JSON.parse(JSON.stringify(live.data)) : live.data };
                if (armed) {
                    armed = false;
                    const row = db.rows("processing_cases")[0];
                    row.metadata = { ...(row.metadata as Record<string, unknown>), ...patch };
                    row.updated_at = `2026-11-04T12:00:01.${String(++tick).padStart(6, "0")}+00:00`;
                }
                return read;
            };
            return q;
        };
        return () => ((db as unknown as { from: unknown }).from = real);
    }

    it("the opening wake never confirms; the first later wake stamps its own clock once, with no audit and no second case", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        const first = await run({ wakeClockAt: W1 });
        expect(first).toMatchObject({ opened: 1, confirmed: 0 });
        expect(esc().confirmed_by_wake_at).toBeUndefined();
        const audited = audits.length;

        const second = await run({ wakeClockAt: W2 });
        expect(second).toMatchObject({ opened: 0, existing: 1, confirmed: 1, confirm_failed: 0, failed: 0 });
        expect(second.outcomes[0]).toMatchObject({ document_id: D(1), outcome: "case_existing", confirmation: "stamped" });
        expect(esc().confirmed_by_wake_at).toBe(W2);
        expect(esc()).toMatchObject({ kind: "api_v1_unfiled_upload", document_id: D(1) }); // the annotation is kept
        expect(audits.length).toBe(audited);
        expect(db.rows("processing_cases")).toHaveLength(1);
        expect(db.rows("processing_case_sources")).toHaveLength(1);
        expect(db.rows("documents")[0].metadata).not.toHaveProperty("filing"); // still unfiled
    });

    it("is write-once: a third wake never moves the stamp", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        await run({ wakeClockAt: W1 });
        await run({ wakeClockAt: W2 });
        const third = await run({ wakeClockAt: W3 });
        expect(third).toMatchObject({ existing: 1, confirmed: 0 });
        expect(third.outcomes[0]).toMatchObject({ confirmation: "already_confirmed" });
        expect(esc().confirmed_by_wake_at).toBe(W2);
    });

    it("fails closed without this wake's database clock stamp: nothing is written", async () => {
        for (const wakeClockAt of [undefined, null, "", "yesterday", "2026-11-04T12:00:00", "1730721600000", "2026-11-04", "2026-13-40T99:99:99Z", "2026-11-04T24:00:00Z"]) {
            db = new InMemorySupabase();
            installAtomicOpen(db);
            db.seed("documents", [apiUpload(D(1))]);
            await run({ wakeClockAt: W1 });
            const r = await run({ wakeClockAt });
            expect(r, String(wakeClockAt)).toMatchObject({ existing: 1, confirmed: 0, confirm_failed: 0 });
            expect(r.outcomes[0]).toMatchObject({ confirmation: "no_wake_clock" });
            expect(esc().confirmed_by_wake_at, String(wakeClockAt)).toBeUndefined();
        }
    });

    it("a failed confirmation write leaves the stamp absent and the wake intact; the next wake stamps its own time", async () => {
        db.seed("documents", [apiUpload(D(1)), apiUpload(D(2))]);
        await run({ wakeClockAt: W1 });
        const restore = failCaseUpdates();
        const r = await run({ wakeClockAt: W2 });
        restore();
        expect(r).toMatchObject({ existing: 2, confirmed: 0, confirm_failed: 2, opened: 0 });
        expect(r.outcomes.every((o) => o.outcome === "case_existing" && o.confirmation === "failed")).toBe(true);
        for (const c of db.rows("processing_cases")) {
            expect((c.metadata as Record<string, Record<string, unknown>>)[API_UPLOAD_ESCALATION_KEY].confirmed_by_wake_at).toBeUndefined();
        }
        const next = await run({ wakeClockAt: W3 });
        expect(next).toMatchObject({ confirmed: 2 });
        for (const c of db.rows("processing_cases")) {
            expect((c.metadata as Record<string, Record<string, unknown>>)[API_UPLOAD_ESCALATION_KEY].confirmed_by_wake_at).toBe(W3);
        }
    });

    it("never overwrites a concurrent write: the confirmation is compare-and-set on updated_at; the next wake retries", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        await run({ wakeClockAt: W1 });
        installUpdatedAtTrigger();
        const restore = concurrentWriterAfterNextCaseRead({ staff_note: "kept", processing_intent: "store_document" });
        const r = await run({ wakeClockAt: W2 });
        restore();
        expect(r).toMatchObject({ existing: 1, confirmed: 0, confirm_failed: 1 });
        expect(r.outcomes[0]).toMatchObject({ confirmation: "conflict" });
        const meta = db.rows("processing_cases")[0].metadata as Record<string, unknown>;
        expect(meta.staff_note).toBe("kept"); // the concurrent writer's key survives
        expect(esc().confirmed_by_wake_at).toBeUndefined();

        installUpdatedAtTrigger();
        const next = await run({ wakeClockAt: W3 });
        expect(next).toMatchObject({ confirmed: 1, confirm_failed: 0 });
        expect(esc().confirmed_by_wake_at).toBe(W3);
        expect((db.rows("processing_cases")[0].metadata as Record<string, unknown>).staff_note).toBe("kept");
    });

    it("a case never updated since it opened (updated_at null) is guarded too", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        db.seed("processing_cases", [{ id: "ca000000-0000-4000-8000-0000000000dd", org_id: ORG, status: "received", updated_at: null,
            metadata: { [API_UPLOAD_ESCALATION_KEY]: { kind: "api_v1_unfiled_upload", document_id: D(1) } } }]);
        db.seed("processing_case_sources", [{ org_id: ORG, processing_case_id: "ca000000-0000-4000-8000-0000000000dd", source_kind: "upload", source_id: D(1), role: "primary" }]);
        const r = await run({ wakeClockAt: W2 });
        expect(r.outcomes[0]).toMatchObject({ confirmation: "stamped" });
        expect(esc().confirmed_by_wake_at).toBe(W2);
    });

    it("a wake that converges on a concurrently committed case is not a later-wake confirmation (it audited its own attempt)", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        db.seed("processing_cases", [{ id: "ca000000-0000-4000-8000-0000000000ff", org_id: ORG, status: "received", metadata: {} }]);
        (db as unknown as { rpc: unknown }).rpc = async () => {
            db.seed("processing_case_sources", [{ org_id: ORG, processing_case_id: "ca000000-0000-4000-8000-0000000000ff", source_kind: "upload", source_id: D(1), role: "primary" }]);
            return { data: null, error: { code: "40001", message: "serialization failure" } };
        };
        const r = await run({ wakeClockAt: W2 });
        expect(r.outcomes[0]).toMatchObject({ outcome: "case_existing" });
        expect(r.outcomes[0]).not.toHaveProperty("confirmation");
        expect(r.confirmed).toBe(0);
        expect(audits).toHaveLength(1); // the attempt was audited: the census's one-audit check sees it
    });

    it("an annotation repair is not a confirmation", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        db.seed("processing_cases", [{ id: "ca000000-0000-4000-8000-0000000000ee", org_id: ORG, status: "received", metadata: {} }]);
        db.seed("processing_case_sources", [{ org_id: ORG, processing_case_id: "ca000000-0000-4000-8000-0000000000ee", source_kind: "upload", source_id: D(1), role: "primary" }]);
        const r = await run({ wakeClockAt: W2 });
        expect(r).toMatchObject({ repaired: 1, confirmed: 0 });
        expect(esc().confirmed_by_wake_at).toBeUndefined();
    });

    it("a filed upload is no longer selected, so no wake after the filing can confirm it", async () => {
        db.seed("documents", [apiUpload(D(1))]);
        await run({ wakeClockAt: W1 });
        db.rows("documents")[0].metadata = { ...(db.rows("documents")[0].metadata as Record<string, unknown>), filing: { key: "late" } };
        const r = await run({ wakeClockAt: W2 });
        expect(r.outcomes.map((o) => o.document_id)).not.toContain(D(1));
        expect(esc().confirmed_by_wake_at).toBeUndefined();
    });
});

describe("late filing", () => {
    async function escalated() {
        db.seed("documents", [apiUpload(D(1))]);
        await run();
        return String(db.rows("processing_cases")[0].id);
    }
    const file = (mode = "new_document") => {
        const d = db.rows("documents").find((r) => r.id === D(1))!;
        d.metadata = { ...(d.metadata as object), filing: { key: "ext:inst-1:late-key", mode, doc_type: "enrollment_document", primary: { subject_type: "child", subject_id: "c1" }, contexts: [], audit_event_id: "evt-f", ...(mode === "new_version" ? { target_document_id: D(9), version_id: "v9", version_number: 2 } : {}) } };
    };

    it("closes the case when the installation files after escalation, audited before the case changes", async () => {
        const caseId = await escalated();
        file();
        order = [];
        const r = await resolveEscalatedUploadCase(db as unknown as SupabaseClient, ORG, D(1), { audit, nowMs: NOW });
        expect(r).toEqual({ resolved: true, processing_case_id: caseId });
        const c = db.rows("processing_cases")[0];
        expect(c.status).toBe("completed");
        expect((c.metadata as Record<string, unknown>).operational_result).toMatchObject({ kind: "document_filed", filed_document_id: D(1), mode: "new_document", filed_outside_case: true });
        expect(audits.at(-1)).toMatchObject({ event: "document_unfiled_upload_case_resolved", detail: { processing_case_id: caseId, filed_through_api: true } });
        // Once closed, nothing more happens.
        expect(await resolveEscalatedUploadCase(db as unknown as SupabaseClient, ORG, D(1), { audit, nowMs: NOW })).toMatchObject({ resolved: false, reason: "case_closed" });
    });

    it("names the target for a late new-version filing", async () => {
        await escalated();
        file("new_version");
        await resolveEscalatedUploadCase(db as unknown as SupabaseClient, ORG, D(1), { audit, nowMs: NOW });
        expect((db.rows("processing_cases")[0].metadata as Record<string, unknown>).operational_result).toMatchObject({ filed_document_id: D(9), version_id: "v9", version_number: 2, mode: "new_version" });
    });

    it("the wake closes a case whose late-filing close was lost; an unfiled case stays open", async () => {
        await escalated();
        db.seed("documents", [apiUpload(D(2))]);
        await run();
        file();
        const r = await run();
        expect(r.resolved).toBe(1);
        const byDoc = (id: string) => db.rows("processing_cases").find((c) => ((c.metadata as Record<string, Record<string, unknown>>)[API_UPLOAD_ESCALATION_KEY]).document_id === id)!;
        expect(byDoc(D(1)).status).toBe("completed");
        expect(byDoc(D(2)).status).toBe("received");
    });

    it("does not close a case without an audit, nor a case staff already archived, nor a non-escalation case", async () => {
        const caseId = await escalated();
        file();
        auditOk = false;
        expect(await resolveEscalatedUploadCase(db as unknown as SupabaseClient, ORG, D(1), { audit, nowMs: NOW })).toMatchObject({ resolved: false, reason: "audit_unavailable" });
        expect(db.rows("processing_cases")[0].status).toBe("received");
        auditOk = true;
        db.rows("processing_cases")[0].status = "archived";
        expect(await resolveEscalatedUploadCase(db as unknown as SupabaseClient, ORG, D(1), { audit, nowMs: NOW })).toMatchObject({ resolved: false, reason: "case_closed", processing_case_id: caseId });
        db.rows("processing_cases")[0].status = "received";
        db.rows("processing_cases")[0].metadata = {};
        expect(await resolveEscalatedUploadCase(db as unknown as SupabaseClient, ORG, D(1), { audit, nowMs: NOW })).toMatchObject({ resolved: false, reason: "not_escalation_case" });
    });

    it("leaves an escalated but still unfiled case open", async () => {
        await escalated();
        expect(await resolveEscalatedUploadCase(db as unknown as SupabaseClient, ORG, D(1), { audit, nowMs: NOW })).toMatchObject({ resolved: false, reason: "not_filed" });
    });
});
