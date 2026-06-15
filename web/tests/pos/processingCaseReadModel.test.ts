import { describe, it, expect } from "vitest";
import {
    listProcessingCaseQueue,
    countProcessingCasesByStatus,
    getProcessingCaseDetail,
} from "@/lib/pos/processingCase/readModel/processingCaseReadModelService";
import type {
    ProcessingCaseReadDeps,
    ProcessingCaseSourceKind,
    ProcessingCaseStatus,
    ReadModelCaseRow,
    ReadModelSourceRow,
    SourceDisplayResolverRegistry,
} from "@/lib/pos/processingCase/readModel/types";

function caseRow(id: string, status: ProcessingCaseStatus, createdAt: string, statusChangedAt = createdAt): ReadModelCaseRow {
    return { id, status, case_type: null, created_at: createdAt, status_changed_at: statusChangedAt, updated_at: null, archived_at: null };
}
function srcRow(caseId: string, kind: ProcessingCaseSourceKind, id: string, role: "primary" | "related" = "primary"): ReadModelSourceRow {
    return { processing_case_id: caseId, source_kind: kind, source_id: id, role, linked_at: "2026-06-12T00:00:00Z" };
}

function makeFakeDeps(cases: ReadModelCaseRow[], sources: ReadModelSourceRow[], counts: Record<string, number> = {}) {
    const calls = { queryCases: 0, querySources: 0 };
    const deps: ProcessingCaseReadDeps = {
        async queryCases(query) {
            calls.queryCases += 1;
            let rows = cases;
            if (query.statuses && query.statuses.length > 0) rows = rows.filter((c) => query.statuses?.includes(c.status));
            const key = query.sortKey ?? "created_at";
            const dir = (query.sortDir ?? "desc") === "asc" ? 1 : -1;
            rows = [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * dir);
            return rows.slice(0, query.limit);
        },
        async querySourcesForCases({ caseIds }) {
            calls.querySources += 1;
            return sources.filter((s) => caseIds.includes(s.processing_case_id));
        },
        async countByStatus() {
            return counts;
        },
        async getCase({ id }) {
            return cases.find((c) => c.id === id) ?? null;
        },
        async getSourcesForCase({ caseId }) {
            return sources.filter((s) => s.processing_case_id === caseId);
        },
    };
    return { deps, calls };
}

function makeFakeRegistry(presentIds: Set<string>) {
    const calls: Record<string, number> = { form_submission: 0, form_packet_session: 0, document: 0 };
    const reg: SourceDisplayResolverRegistry = new Map();
    (["form_submission", "form_packet_session", "document"] as ProcessingCaseSourceKind[]).forEach((kind) => {
        reg.set(kind, async (ids) => {
            calls[kind] += 1;
            const m = new Map<string, { label: string; receivedAt: string | null; channel: string | null }>();
            for (const id of ids) if (presentIds.has(id)) m.set(id, { label: `label:${id}`, receivedAt: "2026-06-12T00:00:00Z", channel: kind });
            return m;
        });
    });
    return { reg, calls };
}

const ORG = "o1";

describe("listProcessingCaseQueue — mixed / unknown / missing source kinds", () => {
    it("resolves mixed source kinds, each via its own kind resolver", async () => {
        const cases = [
            caseRow("c1", "needs_review", "2026-06-12T03:00:00Z"),
            caseRow("c2", "needs_review", "2026-06-12T02:00:00Z"),
            caseRow("c3", "needs_review", "2026-06-12T01:00:00Z"),
        ];
        const sources = [
            srcRow("c1", "form_submission", "s1"),
            srcRow("c2", "document", "d1"),
            srcRow("c3", "form_packet_session", "p1"),
        ];
        const { deps } = makeFakeDeps(cases, sources);
        const { reg } = makeFakeRegistry(new Set(["s1", "d1", "p1"]));
        const { rows } = await listProcessingCaseQueue(deps, reg, { orgId: ORG, limit: 10 });
        expect(rows.map((r) => r.sourceDisplay?.channel)).toEqual(["form_submission", "document", "form_packet_session"]);
        expect(rows.every((r) => r.sourceDisplay?.resolved === true)).toBe(true);
    });

    it("falls back generically for an unknown source kind (no resolver registered)", async () => {
        const cases = [caseRow("c1", "received", "2026-06-12T03:00:00Z")];
        const sources = [srcRow("c1", "upload", "u1")];
        const { deps } = makeFakeDeps(cases, sources);
        const { reg } = makeFakeRegistry(new Set());
        const { rows } = await listProcessingCaseQueue(deps, reg, { orgId: ORG, limit: 10 });
        expect(rows[0].sourceDisplay).toMatchObject({ resolved: false, label: "upload", kind: "upload" });
    });

    it("falls back generically for a missing source (resolver returns no label)", async () => {
        const cases = [caseRow("c1", "received", "2026-06-12T03:00:00Z")];
        const sources = [srcRow("c1", "document", "deleted-doc")];
        const { deps } = makeFakeDeps(cases, sources);
        const { reg } = makeFakeRegistry(new Set()); // id not present -> missing
        const { rows } = await listProcessingCaseQueue(deps, reg, { orgId: ORG, limit: 10 });
        expect(rows[0].sourceDisplay).toMatchObject({ resolved: false, kind: "document", id: "deleted-doc" });
    });
});

describe("listProcessingCaseQueue — status filter, sort, related counts", () => {
    const cases = [
        caseRow("c1", "needs_review", "2026-06-12T03:00:00Z"),
        caseRow("c2", "ready", "2026-06-12T02:00:00Z"),
        caseRow("c3", "needs_review", "2026-06-12T01:00:00Z"),
    ];
    const sources = [
        srcRow("c1", "form_submission", "s1", "primary"),
        srcRow("c1", "document", "rate-sheet", "related"),
        srcRow("c2", "form_submission", "s2", "primary"),
        srcRow("c3", "form_submission", "s3", "primary"),
    ];

    it("filters by status", async () => {
        const { deps } = makeFakeDeps(cases, sources);
        const { reg } = makeFakeRegistry(new Set(["s1", "s2", "s3"]));
        const { rows } = await listProcessingCaseQueue(deps, reg, { orgId: ORG, statuses: ["needs_review"], limit: 10 });
        expect(rows.map((r) => r.id)).toEqual(["c1", "c3"]);
    });

    it("sorts newest-first by created_at by default and counts related sources", async () => {
        const { deps } = makeFakeDeps(cases, sources);
        const { reg } = makeFakeRegistry(new Set(["s1", "s2", "s3"]));
        const { rows } = await listProcessingCaseQueue(deps, reg, { orgId: ORG, limit: 10 });
        expect(rows.map((r) => r.id)).toEqual(["c1", "c2", "c3"]);
        expect(rows[0].relatedSourceCount).toBe(1);
    });

    it("honors status_changed_at ascending sort", async () => {
        const { deps } = makeFakeDeps(cases, sources);
        const { reg } = makeFakeRegistry(new Set(["s1", "s2", "s3"]));
        const { rows } = await listProcessingCaseQueue(deps, reg, {
            orgId: ORG,
            sortKey: "status_changed_at",
            sortDir: "asc",
            limit: 10,
        });
        expect(rows.map((r) => r.id)).toEqual(["c3", "c2", "c1"]);
    });
});

describe("no N+1 behavior", () => {
    it("resolves once per kind and fetches sources once, regardless of case count", async () => {
        const cases = Array.from({ length: 5 }, (_, i) => caseRow(`c${i}`, "needs_review", `2026-06-12T0${i}:00:00Z`));
        const sources = cases.map((c, i) => srcRow(c.id, "form_submission", `s${i}`));
        const { deps, calls } = makeFakeDeps(cases, sources);
        const { reg, calls: resolverCalls } = makeFakeRegistry(new Set(sources.map((s) => s.source_id)));
        await listProcessingCaseQueue(deps, reg, { orgId: ORG, limit: 10 });
        expect(calls.querySources).toBe(1); // one batched source fetch
        expect(resolverCalls.form_submission).toBe(1); // one resolver call for the kind
    });
});

describe("countProcessingCasesByStatus", () => {
    it("returns lane counts from the deps", async () => {
        const counts = { received: 4, needs_review: 23, ready: 9, completed: 156 };
        const { deps } = makeFakeDeps([], [], counts);
        expect(await countProcessingCasesByStatus(deps, { orgId: ORG })).toEqual(counts);
    });
});

describe("getProcessingCaseDetail", () => {
    it("returns the case with its primary + related sources resolved", async () => {
        const cases = [caseRow("c1", "needs_resolution", "2026-06-12T03:00:00Z")];
        const sources = [
            srcRow("c1", "form_submission", "s1", "primary"),
            srcRow("c1", "document", "rate-sheet", "related"),
        ];
        const { deps } = makeFakeDeps(cases, sources);
        const { reg } = makeFakeRegistry(new Set(["s1", "rate-sheet"]));
        const detail = await getProcessingCaseDetail(deps, reg, { orgId: ORG, id: "c1" });
        expect(detail?.sources.map((s) => s.role)).toEqual(["primary", "related"]);
        expect(detail?.sources.every((s) => s.display.resolved === true)).toBe(true);
    });
    it("returns null for a missing case", async () => {
        const { deps } = makeFakeDeps([], []);
        const { reg } = makeFakeRegistry(new Set());
        expect(await getProcessingCaseDetail(deps, reg, { orgId: ORG, id: "nope" })).toBeNull();
    });
});
