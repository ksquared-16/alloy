/**
 * Phase 1.1 completion — durable Trust governance-gap capture and reconciliation.
 *
 * AD-P1-8 ratified the ordering: Processing classification commits, Trust
 * capture is attempted, and a failure becomes a DURABLE Processing-owned gap
 * that reconciliation resolves idempotently. These assertions prove the gap is
 * recoverable rather than merely logged, and that recovery cannot double-count.
 *
 * No database. `processing_exceptions` is modelled by an in-memory store
 * faithful enough to exercise the real query shapes — including the jsonb-path
 * compare-and-swap the concurrency guard depends on.
 *
 * @see docs/platform/planning/trust-adoption/processing/PHASE-1-PROCESSING-ADOPTION-ASSESSMENT.md
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyNonFormSource, CLASSIFIER_VERSION } from "@/lib/pos/processingCase/classification/classifyNonFormSource";
import { maybeClassifyProcessingCaseFromDocumentSafe } from "@/lib/pos/processingCase/classification/maybeClassifyProcessingCaseFromDocumentSafe";
import {
    governSourceClassification,
    TRUST_GOVERNANCE_GAP_MARKER,
} from "@/lib/pos/processingCase/classification/governSourceClassification";
import {
    adoptionKey,
    listUnresolvedTrustGovernanceGaps,
    TRUST_GOVERNANCE_GAP_EXCEPTION_TYPE,
    TRUST_GOVERNANCE_GAP_SCHEMA_VERSION,
} from "@/lib/pos/processingCase/classification/trustGovernanceGapDb";
import {
    reconcileOneTrustGovernanceGap,
    reconcileTrustGovernanceGaps,
} from "@/lib/pos/processingCase/classification/reconcileTrustGovernanceGaps";
import { classificationMaterialFingerprint } from "@/lib/pos/processingCase/classification/classificationMaterialInput";
import type { ClassifyNonFormSourceInput } from "@/lib/pos/processingCase/classification/types";
import { PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY } from "@/lib/trust/capabilities/processingSourceClassification/keys";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { ReasoningUsageInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import type { GovernedDecisionLookup } from "@/lib/trust/consumers/processingSourceClassification";

// ---------------------------------------------------------------------------
// In-memory `processing_exceptions`, plus the classification annotation target
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Reads a filter column, resolving a `col->>key` jsonb path. */
function readColumn(row: Row, column: string): unknown {
    const arrow = column.indexOf("->>");
    if (arrow === -1) return row[column];
    const base = column.slice(0, arrow);
    const key = column.slice(arrow + 3);
    const obj = row[base] as Record<string, unknown> | null | undefined;
    const value = obj?.[key];
    return value === undefined || value === null ? undefined : String(value);
}

type Filter = { kind: "eq" | "neq" | "is" | "in"; column: string; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
    return filters.every((f) => {
        const actual = readColumn(row, f.column);
        if (f.kind === "eq") return String(actual) === String(f.value);
        if (f.kind === "neq") return String(actual) !== String(f.value);
        if (f.kind === "is") return actual === null || actual === undefined;
        if (f.kind === "in") return (f.value as unknown[]).some((v) => String(v) === String(actual));
        return true;
    });
}

/**
 * A durable store that outlives any one client instance — which is what lets a
 * test cross a simulated process boundary by building a NEW client over it.
 */
function makeDurableStore() {
    const exceptions: Row[] = [];
    const caseUpdates: Row[] = [];
    let seq = 0;

    function builder(table: string) {
        const filters: Filter[] = [];
        let mode: "select" | "insert" | "update" = "select";
        let payload: Row | null = null;
        let limit: number | null = null;
        let countMode = false;
        let headMode = false;
        let orderAsc = true;

        const table_rows = () => (table === "processing_exceptions" ? exceptions : caseUpdates);

        function resolve(): { data: unknown; error: null; count?: number } {
            if (mode === "insert") {
                const row: Row = { id: `exc-${++seq}`, resolved_at: null, created_at: `t${seq}`, ...payload };
                table_rows().push(row);
                return { data: [{ ...row }], error: null };
            }
            const hits = table_rows().filter((r) => matches(r, filters));
            if (mode === "update") {
                for (const r of hits) Object.assign(r, payload);
                return { data: hits.map((r) => ({ ...r })), error: null };
            }
            const sorted = [...hits].sort((a, b) =>
                orderAsc
                    ? String(a.created_at).localeCompare(String(b.created_at))
                    : String(b.created_at).localeCompare(String(a.created_at)),
            );
            const sliced = limit === null ? sorted : sorted.slice(0, limit);
            if (countMode) return { data: headMode ? null : sliced, error: null, count: hits.length };
            return { data: sliced.map((r) => ({ ...r })), error: null };
        }

        const api = {
            select(_cols?: string, opts?: { count?: string; head?: boolean }) {
                if (opts?.count) countMode = true;
                if (opts?.head) headMode = true;
                return api;
            },
            insert(row: Row) {
                mode = "insert";
                payload = row;
                return api;
            },
            update(row: Row) {
                mode = "update";
                payload = row;
                return api;
            },
            eq(column: string, value: unknown) {
                filters.push({ kind: "eq", column, value });
                return api;
            },
            neq(column: string, value: unknown) {
                filters.push({ kind: "neq", column, value });
                return api;
            },
            is(column: string, value: unknown) {
                filters.push({ kind: "is", column, value });
                return api;
            },
            in(column: string, value: unknown[]) {
                filters.push({ kind: "in", column, value });
                return api;
            },
            order(_c: string, opts?: { ascending?: boolean }) {
                orderAsc = opts?.ascending !== false;
                return api;
            },
            limit(n: number) {
                limit = n;
                return api;
            },
            maybeSingle() {
                const r = resolve();
                const rows = (r.data as Row[] | null) ?? [];
                return Promise.resolve({ data: rows[0] ?? null, error: null });
            },
            single() {
                const r = resolve();
                const rows = (r.data as Row[] | null) ?? [];
                return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: "no_row" } });
            },
            then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
                return Promise.resolve(resolve()).then(onOk, onErr);
            },
        };
        return api;
    }

    /** A fresh client over the SAME durable rows. */
    const client = () =>
        ({
            from(table: string) {
                if (table !== "processing_exceptions" && table !== "processing_cases") {
                    throw new Error(`forbidden table: ${table}`);
                }
                if (table === "processing_cases") {
                    // Only the classification annotation path uses this.
                    return {
                        select: () => ({
                            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: {} }, error: null }) }) }),
                        }),
                        insert: () => {
                            throw new Error("classification must never insert a case");
                        },
                        update: (p: Row) => {
                            caseUpdates.push(p);
                            return { eq: () => ({ eq: async () => ({ error: null }) }) };
                        },
                    };
                }
                return builder(table);
            },
        }) as unknown as SupabaseClient;

    return { client, exceptions, caseUpdates };
}

function makeRecordingRepository() {
    const contracts: DecisionContractV1[] = [];
    const packages: DecisionPackageV1[] = [];
    const usage: ReasoningUsageInput[] = [];
    const repository: TrustRepository = {
        async insertContract(c) { contracts.push(c); },
        async advanceContractLifecycle() {},
        async insertPackage(p) { packages.push(p); },
        async insertObservation() {},
        async insertReasoningUsage(u) { usage.push(u); },
    };
    return { repository, contracts, packages, usage };
}

/** A lookup backed by the packages a recording repository has actually stored. */
function lookupOver(contracts: DecisionContractV1[], packages: DecisionPackageV1[]): GovernedDecisionLookup {
    return async (identity) => {
        const ids = contracts
            .filter(
                (c) =>
                    c.org_id === identity.org_id &&
                    c.decision_class_key === PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY &&
                    c.correlation_id === identity.processing_case_id &&
                    (c.context as Record<string, unknown>).material_input_fingerprint ===
                        identity.material_input_fingerprint &&
                    (c.context as Record<string, unknown>).classifier_version === identity.classifier_version,
            )
            .map((c) => c.id);
        const pkg = packages.find((p) => ids.includes(p.contract_id));
        return pkg ? { contract_id: pkg.contract_id, package_id: pkg.id } : null;
    };
}

const FIXED_NOW = "2026-08-05T12:00:00.000Z";
const SUBSIDY: ClassifyNonFormSourceInput = { sourceKind: "document", fileName: "2026_CCAP_Subsidy_Contract.pdf" };
const SUBSIDY_DOC = { sourceKind: "document", fileName: "2026_CCAP_Subsidy_Contract.pdf" };

const failingRepository: TrustRepository = {
    async insertContract() { throw new Error("trust db down"); },
    async advanceContractLifecycle() {},
    async insertPackage() {},
    async insertObservation() {},
    async insertReasoningUsage() {},
};

function silenceConsole() {
    return {
        warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
        error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
}

// ---------------------------------------------------------------------------
// 1, 2, 3, 4. Capture
// ---------------------------------------------------------------------------

describe("GAP-A — Processing succeeds; Trust failure becomes a durable gap", () => {
    it("direct success records a governed decision and NO gap", async () => {
        const store = makeDurableStore();
        const { repository, packages } = makeRecordingRepository();
        const seen: string[] = [];

        const stored = await maybeClassifyProcessingCaseFromDocumentSafe(store.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC,
            governance: { repository, nowIso: FIXED_NOW, clock: () => 0 },
            onGovernanceResult: (r) => seen.push(r.status),
        });

        expect(stored?.classification_key).toBe("subsidy_contract");
        expect(seen).toEqual(["governed"]);
        expect(packages).toHaveLength(1);
        expect(store.exceptions).toHaveLength(0);
    });

    it("Trust failure leaves Processing successful and writes one durable gap", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        const results: string[] = [];

        const stored = await maybeClassifyProcessingCaseFromDocumentSafe(store.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC,
            governance: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
            onGovernanceResult: (r) => results.push(r.status),
        });

        // Processing is unaffected and authoritative.
        expect(stored?.classification_key).toBe("subsidy_contract");
        expect(store.caseUpdates).toHaveLength(1);
        // Exactly one durable gap, of the right type and severity.
        expect(results).toEqual(["not_governed"]);
        expect(store.exceptions).toHaveLength(1);
        expect(store.exceptions[0]!.exception_type).toBe(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPE);
        expect(store.exceptions[0]!.severity).toBe("warning");
        expect(store.exceptions[0]!.resolved_at).toBeNull();
        expect(spies.warn.mock.calls.flat().join(" ")).toContain(TRUST_GOVERNANCE_GAP_MARKER);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("the gap carries bounded, exact replay material", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        const result = classifyNonFormSource(SUBSIDY);

        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result,
            deps: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
        });

        const snap = store.exceptions[0]!.subject_ref as Record<string, unknown>;
        expect(snap.gap_schema_version).toBe(TRUST_GOVERNANCE_GAP_SCHEMA_VERSION);
        expect(snap.decision_class_key).toBe(PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY);
        expect(snap.source_kind).toBe("document");
        expect(snap.material_input_fingerprint).toBe(classificationMaterialFingerprint(SUBSIDY));
        expect(snap.material_input_version).toBe("proc-source-classification-material-v1");
        expect(snap.classifier_version).toBe(CLASSIFIER_VERSION);
        expect(snap.failure_class).toBe("trust_capture_failed");
        expect(snap.failure_reason).toContain("trust db down");
        expect(snap.first_failed_at).toBe(FIXED_NOW);
        expect(snap.last_attempt_at).toBe(FIXED_NOW);
        expect(snap.retry_count).toBe(0);
        expect(snap.contract_id).toBeNull();
        expect(snap.package_id).toBeNull();
        expect(snap.adoption_key).toBe(
            adoptionKey({
                orgId: "org-1", caseId: "case-1",
                decisionClassKey: PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
                materialInputFingerprint: classificationMaterialFingerprint(SUBSIDY),
                classifierVersion: CLASSIFIER_VERSION,
            }),
        );
        // Exact classification, unchanged.
        expect(snap.classification).toEqual({
            classification_key: result.classification_key,
            label: result.label,
            confidence: result.confidence,
            status: result.status,
            classifier_version: result.classifier_version,
            signals: result.signals,
        });
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("stores no source document, filename, title or unrestricted payload", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        const input: ClassifyNonFormSourceInput = {
            sourceKind: "document",
            fileName: "Lyons_Family_Subsidy_Contract.pdf",
            title: "Alex Lyons — CCAP voucher",
            metadata: { ssn: "123-45-6789", note: "confidential family detail" },
        };

        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input, result: classifyNonFormSource(input),
            deps: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
        });

        const serialized = JSON.stringify(store.exceptions[0]);
        for (const secret of ["Lyons", "Alex", ".pdf", "123-45-6789", "confidential"]) {
            expect(serialized).not.toContain(secret);
        }
        for (const forbidden of ["provider", "model", "proposed_command", "command_key", "api_key"]) {
            expect(serialized.toLowerCase()).not.toContain(forbidden);
        }
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("repeated production failures accumulate retry evidence on ONE gap, not many rows", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        const run = () =>
            governSourceClassification(store.client(), {
                orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
                deps: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
            });
        await run();
        await run();
        await run();

        expect(store.exceptions).toHaveLength(1);
        expect((store.exceptions[0]!.subject_ref as Record<string, unknown>).retry_count).toBe(2);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 5, 6, 7, 8, 14. Reconciliation
// ---------------------------------------------------------------------------

describe("GAP-B — the gap survives a process boundary and reconciles later", () => {
    it("a NEW client over the same durable rows resolves the gap into one package", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();

        // --- request 1: Processing succeeds, Trust fails -------------------
        await maybeClassifyProcessingCaseFromDocumentSafe(store.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC,
            governance: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
        });
        const caseUpdatesAfterCapture = store.caseUpdates.length;

        // --- request 2: an entirely separate client reconciles -------------
        const later = store.client();
        const { repository, contracts, packages, usage } = makeRecordingRepository();
        const gaps = await listUnresolvedTrustGovernanceGaps(later, { orgId: "org-1" });
        expect(gaps).toHaveLength(1);

        const outcome = await reconcileOneTrustGovernanceGap(later, {
            gap: gaps[0]!,
            deps: { repository, lookup: lookupOver(contracts, packages), now: () => "2026-08-06T00:00:00.000Z", clock: () => 0 },
        });

        expect(outcome.status).toBe("resolved");
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);
        // Resolved, with the identifiers that prove it.
        expect(store.exceptions[0]!.resolved_at).toBe("2026-08-06T00:00:00.000Z");
        const snap = store.exceptions[0]!.subject_ref as Record<string, unknown>;
        expect(snap.package_id).toBe(packages[0]!.id);
        expect(snap.contract_id).toBe(contracts[0]!.id);
        // Reconciliation NEVER re-ran or rewrote the Processing classification.
        expect(store.caseUpdates).toHaveLength(caseUpdatesAfterCapture);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("the reconciled package carries the exact original judgment", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        const original = classifyNonFormSource(SUBSIDY);

        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: original,
            deps: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
        });

        const { repository, contracts, packages } = makeRecordingRepository();
        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        await reconcileOneTrustGovernanceGap(store.client(), {
            gap: gaps[0]!,
            deps: { repository, lookup: lookupOver(contracts, packages), now: () => FIXED_NOW, clock: () => 0 },
        });

        const pkg = packages[0]!;
        expect(pkg.outcome).toBe("recommended");
        expect(pkg.recommendation?.classification_key).toBe(original.classification_key);
        expect(pkg.recommendation?.confidence).toBe(original.confidence);
        expect(pkg.economics.provider_cost_units).toBe(0);
        expect(pkg.economics.escalation_level).toBe(0);
        expect((contracts[0]!.context as Record<string, unknown>).material_input_fingerprint).toBe(
            classificationMaterialFingerprint(SUBSIDY),
        );
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("a gap resolves ONLY after Trust success — a failing retry leaves it unresolved", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
            deps: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
        });

        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        const outcome = await reconcileOneTrustGovernanceGap(store.client(), {
            gap: gaps[0]!,
            deps: {
                lookup: async () => null,
                decide: async () => { throw new Error("trust still down"); },
                now: () => "2026-08-06T00:00:00.000Z",
            },
        });

        expect(outcome.status).toBe("still_failing");
        expect(store.exceptions[0]!.resolved_at).toBeNull();
        // Retry evidence advanced deterministically even though nothing was produced.
        const snap = store.exceptions[0]!.subject_ref as Record<string, unknown>;
        expect(snap.retry_count).toBe(1);
        expect(snap.last_attempt_at).toBe("2026-08-06T00:00:00.000Z");
        expect(snap.package_id).toBeNull();
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 9, 10, 11, 15. Idempotency and exactly-once measurement
// ---------------------------------------------------------------------------

describe("GAP-C — recovery is exactly-once", () => {
    async function captureGap(store: ReturnType<typeof makeDurableStore>, caseId = "case-1", input = SUBSIDY) {
        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId, input, result: classifyNonFormSource(input),
            deps: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
        });
    }

    it("replay after a successful capture recognizes the existing result and creates nothing", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        await captureGap(store);

        const { repository, contracts, packages, usage } = makeRecordingRepository();
        const deps = { repository, lookup: lookupOver(contracts, packages), now: () => FIXED_NOW, clock: () => 0 };

        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        const first = await reconcileOneTrustGovernanceGap(store.client(), { gap: gaps[0]!, deps });
        expect(first.status).toBe("resolved");

        // Replay the SAME gap object — the ambiguous-network case.
        const second = await reconcileOneTrustGovernanceGap(store.client(), { gap: gaps[0]!, deps });
        expect(second.status).toBe("already_governed");

        // Exactly one governed decision, counted once.
        expect(contracts).toHaveLength(1);
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("resolved gaps stay resolved and are never picked up again", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        await captureGap(store);

        const { repository, contracts, packages } = makeRecordingRepository();
        const deps = { repository, lookup: lookupOver(contracts, packages), now: () => FIXED_NOW, clock: () => 0 };
        await reconcileTrustGovernanceGaps(store.client(), { orgId: "org-1", deps });

        const remaining = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        expect(remaining).toHaveLength(0);

        const second = await reconcileTrustGovernanceGaps(store.client(), { orgId: "org-1", deps });
        expect(second.scanned).toBe(0);
        expect(packages).toHaveLength(1);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("two concurrent reconcilers cannot inflate metrics — one wins the claim", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        await captureGap(store);

        const { repository, contracts, packages, usage } = makeRecordingRepository();
        // A lookup pinned to "nothing governed yet" so the pre-check cannot be
        // what saves us — the CAS claim must be what does.
        const deps = { repository, lookup: async () => null, now: () => FIXED_NOW, clock: () => 0 };

        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        const both = await Promise.all([
            reconcileOneTrustGovernanceGap(store.client(), { gap: gaps[0]!, deps }),
            reconcileOneTrustGovernanceGap(store.client(), { gap: gaps[0]!, deps }),
        ]);

        const statuses = both.map((b) => b.status).sort();
        expect(statuses).toEqual(["claim_lost", "resolved"]);
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("a changed material fingerprint is a NEW governed decision, not a duplicate", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        const other: ClassifyNonFormSourceInput = { sourceKind: "document", fileName: "monthly_remittance.pdf" };

        await captureGap(store, "case-1", SUBSIDY);
        await captureGap(store, "case-1", other);
        expect(store.exceptions).toHaveLength(2);
        expect(classificationMaterialFingerprint(SUBSIDY)).not.toBe(classificationMaterialFingerprint(other));

        const { repository, contracts, packages } = makeRecordingRepository();
        const deps = { repository, lookup: lookupOver(contracts, packages), now: () => FIXED_NOW, clock: () => 0 };
        const sweep = await reconcileTrustGovernanceGaps(store.client(), { orgId: "org-1", deps });

        expect(sweep.resolved).toBe(2);
        expect(packages).toHaveLength(2);
        expect(new Set(packages.map((p) => p.recommendation?.classification_key))).toEqual(
            new Set(["subsidy_contract", "remittance"]),
        );
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 16, 17, 18, 20. What must NOT happen
// ---------------------------------------------------------------------------

describe("GAP-D — boundaries hold", () => {
    it("an unsupported source creates neither a Trust contract nor a governance gap", async () => {
        const store = makeDurableStore();
        const { repository, contracts, packages } = makeRecordingRepository();
        const input: ClassifyNonFormSourceInput = { sourceKind: "form_submission", fileName: "x.pdf" };

        const outcome = await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input, result: classifyNonFormSource(input),
            deps: { repository, nowIso: FIXED_NOW, clock: () => 0 },
        });

        expect(outcome.status).toBe("skipped_unsupported");
        expect(contracts).toHaveLength(0);
        expect(packages).toHaveLength(0);
        expect(store.exceptions).toHaveLength(0);
    });

    it("classifier output is byte-identical whether Trust succeeds, fails, or is suppressed", async () => {
        const spies = silenceConsole();
        const strip = (v: { classified_at?: string } | null) => JSON.stringify({ ...v, classified_at: "" });

        const suppressed = makeDurableStore();
        const a = await maybeClassifyProcessingCaseFromDocumentSafe(suppressed.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC,
        });

        const ok = makeDurableStore();
        const b = await maybeClassifyProcessingCaseFromDocumentSafe(ok.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC,
            governance: { repository: makeRecordingRepository().repository, nowIso: FIXED_NOW, clock: () => 0 },
        });

        const failed = makeDurableStore();
        const c = await maybeClassifyProcessingCaseFromDocumentSafe(failed.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC,
            governance: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
        });

        expect(strip(b)).toBe(strip(a));
        expect(strip(c)).toBe(strip(a));

        // ...and the case annotation payload is identical in all three. Only
        // `classified_at` is excluded: it is wall-clock and was never
        // deterministic, which is exactly why the returned value strips it too.
        const stripUpdate = (u: Record<string, unknown> | undefined) => {
            const meta = (u!.metadata as { classification: Record<string, unknown> }).classification;
            return JSON.stringify({ ...u, metadata: { classification: { ...meta, classified_at: "" } } });
        };
        expect(stripUpdate(ok.caseUpdates[0])).toBe(stripUpdate(suppressed.caseUpdates[0]));
        expect(stripUpdate(failed.caseUpdates[0])).toBe(stripUpdate(suppressed.caseUpdates[0]));
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("neither capture nor reconciliation writes identity, customer, child, opportunity, plan or approval", async () => {
        const store = makeDurableStore();
        const spies = silenceConsole();
        // The store throws on any table other than processing_exceptions and
        // processing_cases, so reaching one would fail the test outright.
        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
            deps: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
        });
        const { repository, contracts, packages } = makeRecordingRepository();
        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        await reconcileOneTrustGovernanceGap(store.client(), {
            gap: gaps[0]!,
            deps: { repository, lookup: lookupOver(contracts, packages), now: () => FIXED_NOW, clock: () => 0 },
        });
        expect(packages).toHaveLength(1);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("if the gap store itself fails, the failure is loud and explicitly unrecordable", async () => {
        const spies = silenceConsole();
        const brokenGapStore = {
            from(table: string) {
                if (table === "processing_exceptions") throw new Error("exceptions table unavailable");
                throw new Error(`unexpected table ${table}`);
            },
        } as unknown as SupabaseClient;

        const outcome = await governSourceClassification(brokenGapStore, {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
            deps: { repository: failingRepository, nowIso: FIXED_NOW, clock: () => 0 },
        });

        expect(outcome.status).toBe("gap_unrecordable");
        if (outcome.status === "gap_unrecordable") {
            expect(outcome.reason).toContain("trust db down");
            expect(outcome.gapError).toContain("exceptions table unavailable");
        }
        // console.error, not warn — this is the loudest signal the path has.
        expect(spies.error).toHaveBeenCalled();
        expect(spies.error.mock.calls.flat().join(" ")).toContain(TRUST_GOVERNANCE_GAP_MARKER);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});
