/**
 * Negative controls for durable governance-gap capture and reconciliation.
 *
 * Each control introduces the defect it guards against and proves the guard
 * rejects it. Where the defect is a source fact it is checked structurally;
 * where it is a runtime fact it is checked by building the broken behaviour and
 * asserting the difference is observable.
 *
 * @see docs/platform/planning/trust-adoption/processing/PHASE-1-PROCESSING-ADOPTION-ASSESSMENT.md
 */

import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyNonFormSource } from "@/lib/pos/processingCase/classification/classifyNonFormSource";
import { governSourceClassification } from "@/lib/pos/processingCase/classification/governSourceClassification";
import {
    claimTrustGovernanceGap,
    listUnresolvedTrustGovernanceGaps,
    resolveTrustGovernanceGap,
    TRUST_GOVERNANCE_GAP_EXCEPTION_TYPE,
} from "@/lib/pos/processingCase/classification/trustGovernanceGapDb";
import { reconcileOneTrustGovernanceGap } from "@/lib/pos/processingCase/classification/reconcileTrustGovernanceGaps";
import type { ClassifyNonFormSourceInput } from "@/lib/pos/processingCase/classification/types";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { ReasoningUsageInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

const WEB_ROOT = join(__dirname, "..", "..");
const SUBSIDY: ClassifyNonFormSourceInput = { sourceKind: "document", fileName: "2026_CCAP_Subsidy_Contract.pdf" };
const FIXED_NOW = "2026-08-05T12:00:00.000Z";

function sourceFilesUnder(relative: string): string[] {
    const root = join(WEB_ROOT, relative);
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
        }
    };
    walk(root);
    return out;
}

/** A lookup that finds nothing — the failing paths never reach a stored package. */
const missingLookup = async () => null;

const failingRepository: TrustRepository = {
    async insertContract() { throw new Error("trust db down"); },
    async advanceContractLifecycle() {},
    async insertPackage() {},
    async insertObservation() {},
    async insertReasoningUsage() {},
};

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

type Row = Record<string, unknown>;

/** Minimal durable store, mirroring the one in the main gap suite. */
function makeStore() {
    const exceptions: Row[] = [];
    let seq = 0;
    const readColumn = (row: Row, column: string): unknown => {
        const arrow = column.indexOf("->>");
        if (arrow === -1) return row[column];
        const obj = row[column.slice(0, arrow)] as Record<string, unknown> | null | undefined;
        const v = obj?.[column.slice(arrow + 3)];
        return v === undefined || v === null ? undefined : String(v);
    };
    const client = () =>
        ({
            from(table: string) {
                if (table !== "processing_exceptions") throw new Error(`forbidden table ${table}`);
                const filters: { kind: string; column: string; value: unknown }[] = [];
                let mode = "select";
                let payload: Row | null = null;
                let limit: number | null = null;
                const match = (r: Row) =>
                    filters.every((f) => {
                        const a = readColumn(r, f.column);
                        if (f.kind === "eq") return String(a) === String(f.value);
                        if (f.kind === "neq") return String(a) !== String(f.value);
                        if (f.kind === "is") return a === null || a === undefined;
                        return true;
                    });
                const resolve = () => {
                    if (mode === "insert") {
                        const row: Row = { id: `exc-${++seq}`, resolved_at: null, created_at: `t${seq}`, ...payload };
                        exceptions.push(row);
                        return { data: [{ ...row }], error: null };
                    }
                    const hits = exceptions.filter(match);
                    if (mode === "update") {
                        for (const r of hits) Object.assign(r, payload);
                        return { data: hits.map((r) => ({ ...r })), error: null };
                    }
                    const sliced = limit === null ? hits : hits.slice(0, limit);
                    return { data: sliced.map((r) => ({ ...r })), error: null };
                };
                const api: Record<string, unknown> = {
                    select: () => api,
                    insert: (r: Row) => { mode = "insert"; payload = r; return api; },
                    update: (r: Row) => { mode = "update"; payload = r; return api; },
                    eq: (c: string, v: unknown) => { filters.push({ kind: "eq", column: c, value: v }); return api; },
                    neq: (c: string, v: unknown) => { filters.push({ kind: "neq", column: c, value: v }); return api; },
                    is: (c: string, v: unknown) => { filters.push({ kind: "is", column: c, value: v }); return api; },
                    order: () => api,
                    limit: (n: number) => { limit = n; return api; },
                    maybeSingle: () => Promise.resolve({ data: (resolve().data as Row[])[0] ?? null, error: null }),
                    single: () => {
                        const rows = resolve().data as Row[];
                        return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: "no_row" } });
                    },
                    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
                        Promise.resolve(resolve()).then(ok, err),
                };
                return api;
            },
        }) as unknown as SupabaseClient;
    return { client, exceptions };
}

async function captureGap(store: ReturnType<typeof makeStore>) {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await governSourceClassification(store.client(), {
        orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
        deps: { repository: failingRepository, lookup: missingLookup, nowIso: FIXED_NOW, clock: () => 0 },
    });
    warn.mockRestore();
}

// ---------------------------------------------------------------------------

describe("GNC-1 — a Trust failure that is ONLY logged would be caught", () => {
    it("the failure path writes a durable row, not just a console line", async () => {
        const store = makeStore();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const outcome = await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
            deps: { repository: failingRepository, lookup: missingLookup, nowIso: FIXED_NOW, clock: () => 0 },
        });

        // A log-only implementation would satisfy the console assertion...
        expect(warn).toHaveBeenCalled();
        // ...and fail every one of these.
        expect(store.exceptions).toHaveLength(1);
        expect(store.exceptions[0]!.exception_type).toBe(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPE);
        expect(outcome.status).toBe("not_governed");
        if (outcome.status === "not_governed") expect(outcome.gapId).toBe(store.exceptions[0]!.id);
        // And the record must be independently discoverable, not just returned.
        const found = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        expect(found).toHaveLength(1);
        warn.mockRestore();
    });
});

describe("GNC-2 — resolving a gap before Trust success would be caught", () => {
    it("a failing reconciliation leaves resolved_at null and package_id null", async () => {
        const store = makeStore();
        await captureGap(store);
        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });

        const outcome = await reconcileOneTrustGovernanceGap(store.client(), {
            gap: gaps[0]!,
            deps: { lookup: async () => null, decide: async () => { throw new Error("still down"); }, now: () => FIXED_NOW },
        });

        expect(outcome.status).toBe("still_failing");
        expect(store.exceptions[0]!.resolved_at).toBeNull();
        expect((store.exceptions[0]!.subject_ref as Row).package_id).toBeNull();
        // Still discoverable for a later attempt — a premature resolve would hide it.
        expect(await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" })).toHaveLength(1);
    });

    it("resolving requires identifiers, and a resolved gap disappears from the open scan", async () => {
        const store = makeStore();
        await captureGap(store);
        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });

        await resolveTrustGovernanceGap(store.client(), {
            gap: gaps[0]!, contractId: "c-1", packageId: "p-1", nowIso: FIXED_NOW,
        });

        expect(store.exceptions[0]!.resolved_at).toBe(FIXED_NOW);
        expect((store.exceptions[0]!.subject_ref as Row).package_id).toBe("p-1");
        expect(await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" })).toHaveLength(0);
    });
});

describe("GNC-3 — retries creating duplicate packages would be caught", () => {
    /**
     * The duplicate risk the pre-check exists for is the AMBIGUOUS SUCCESS: the
     * Trust capture actually persisted a package, but the response was lost, so
     * the gap was recorded and is still unresolved. Reconciling that gap without
     * a pre-check produces a second package for an identity that already has
     * one.
     *
     * (A gap that was already RESOLVED cannot duplicate — the compare-and-swap
     * claim requires `resolved_at IS NULL`. That is a separate guard, asserted
     * below; it is not what the pre-check is for.)
     */
    async function ambiguousSuccessFixture() {
        const store = makeStore();
        const { repository, contracts, packages, usage } = makeRecordingRepository();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        // The capture that really succeeded in Trust. `missingLookup` so this
        // first call genuinely creates rather than recognizing something.
        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
            deps: { repository, lookup: missingLookup, nowIso: FIXED_NOW, clock: () => 0 },
        });
        expect(packages).toHaveLength(1);

        // ...but whose response was lost, so a gap was recorded for it anyway.
        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
            deps: { repository: failingRepository, lookup: missingLookup, nowIso: FIXED_NOW, clock: () => 0 },
        });
        warn.mockRestore();

        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        expect(gaps).toHaveLength(1);
        return { store, repository, contracts, packages, usage, gap: gaps[0]! };
    }

    const lookupOver = (contracts: DecisionContractV1[], packages: DecisionPackageV1[]) =>
        async (identity: { processing_case_id: string; material_input_fingerprint: string }) => {
            const ids = contracts
                .filter(
                    (c) =>
                        c.correlation_id === identity.processing_case_id &&
                        (c.context as Record<string, unknown>).material_input_fingerprint ===
                            identity.material_input_fingerprint,
                )
                .map((c) => c.id);
            const p = packages.find((x) => ids.includes(x.contract_id));
            return p ? { contract_id: p.contract_id, package_id: p.id } : null;
        };

    it("the pre-check recognizes an ambiguous success instead of duplicating it", async () => {
        const f = await ambiguousSuccessFixture();

        const outcome = await reconcileOneTrustGovernanceGap(f.store.client(), {
            gap: f.gap,
            deps: {
                repository: f.repository,
                lookup: lookupOver(f.contracts, f.packages),
                now: () => FIXED_NOW,
                clock: () => 0,
            },
        });

        expect(outcome.status).toBe("already_governed");
        expect(f.packages).toHaveLength(1);
        expect(f.usage).toHaveLength(1);
        expect(f.store.exceptions[0]!.resolved_at).toBe(FIXED_NOW);
    });

    it("CONTROL: the identical scenario with a broken pre-check DOES duplicate", async () => {
        const f = await ambiguousSuccessFixture();

        const outcome = await reconcileOneTrustGovernanceGap(f.store.client(), {
            gap: f.gap,
            // A pre-check that always reports "not governed" — the defect.
            deps: { repository: f.repository, lookup: async () => null, now: () => FIXED_NOW, clock: () => 0 },
        });

        expect(outcome.status).toBe("resolved");
        // Two packages for ONE adoption identity. This is what the pre-check
        // prevents, and this assertion is what would fail if it were removed.
        expect(f.packages).toHaveLength(2);
        expect(f.usage).toHaveLength(2);
    });

    it("a resolved gap cannot be reclaimed, so a late retry cannot duplicate either", async () => {
        const store = makeStore();
        await captureGap(store);
        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        const { repository, packages } = makeRecordingRepository();

        await reconcileOneTrustGovernanceGap(store.client(), {
            gap: gaps[0]!, deps: { repository, lookup: async () => null, now: () => FIXED_NOW, clock: () => 0 },
        });
        expect(packages).toHaveLength(1);

        // Same stale gap object, broken pre-check: the claim must refuse it.
        const late = await reconcileOneTrustGovernanceGap(store.client(), {
            gap: gaps[0]!, deps: { repository, lookup: async () => null, now: () => FIXED_NOW, clock: () => 0 },
        });
        expect(late.status).toBe("claim_lost");
        expect(packages).toHaveLength(1);
    });

    it("the compare-and-swap claim is what stops a concurrent duplicate", async () => {
        const store = makeStore();
        await captureGap(store);
        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });

        // Two claims against the SAME observed retry_count: only one may win.
        const first = await claimTrustGovernanceGap(store.client(), { gap: gaps[0]!, nowIso: FIXED_NOW });
        const second = await claimTrustGovernanceGap(store.client(), { gap: gaps[0]!, nowIso: FIXED_NOW });
        expect(first).not.toBeNull();
        expect(second).toBeNull();
        expect((store.exceptions[0]!.subject_ref as Row).retry_count).toBe(1);
    });
});

describe("GNC-4 — reconciliation re-running Processing classification would be caught", () => {
    it("reconciliation never touches processing_cases — the store forbids the table", async () => {
        const store = makeStore();
        await captureGap(store);
        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        const { repository, packages } = makeRecordingRepository();

        // This store throws on ANY table but processing_exceptions, so a
        // re-classification write would surface as a thrown error, not a pass.
        const outcome = await reconcileOneTrustGovernanceGap(store.client(), {
            gap: gaps[0]!, deps: { repository, lookup: async () => null, now: () => FIXED_NOW, clock: () => 0 },
        });
        expect(outcome.status).toBe("resolved");
        expect(packages).toHaveLength(1);
    });

    it("the reconciliation module imports no classifier and queries no case table", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingCase/classification/reconcileTrustGovernanceGaps.ts"),
            "utf8",
        );
        expect(src).not.toContain("classifyNonFormSource");
        expect(src).not.toContain("dbStoreProcessingCaseClassification");
        // A `.from("processing_cases")` CALL, not the words in a comment — the
        // module's own documentation legitimately names the table it avoids.
        expect([...src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)].map((m) => m[1])).toEqual([]);
    });
});

describe("GNC-5 — persisting a full source payload would be caught", () => {
    it("the snapshot rejects source content even when the input is full of it", async () => {
        const store = makeStore();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const input: ClassifyNonFormSourceInput = {
            sourceKind: "document",
            fileName: "Lyons_Family_2026_Subsidy_Contract.pdf",
            title: "Alex Lyons household — CCAP",
            docType: "subsidy contract",
            metadata: { dob: "2019-04-11", email: "alex@lyons.example", raw_text: "entire scanned document body" },
        };
        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input, result: classifyNonFormSource(input),
            deps: { repository: failingRepository, lookup: missingLookup, nowIso: FIXED_NOW, clock: () => 0 },
        });

        const serialized = JSON.stringify(store.exceptions[0]);
        for (const leak of ["Lyons", "Alex", "2019-04-11", "alex@lyons.example", "entire scanned", ".pdf"]) {
            expect(serialized).not.toContain(leak);
        }
        // The snapshot's classification carries exactly six keys — nothing else.
        const snap = store.exceptions[0]!.subject_ref as Row;
        expect(Object.keys(snap.classification as Row).sort()).toEqual([
            "classification_key", "classifier_version", "confidence", "label", "signals", "status",
        ]);
        warn.mockRestore();
    });
});

describe("GNC-6 — counting both the failed attempt and the successful retry would be caught", () => {
    it("a failed capture records NO usage; only the successful reconcile does", async () => {
        const store = makeStore();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Failed capture: the failing repository records nothing at all.
        const failedUsage: ReasoningUsageInput[] = [];
        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
            deps: {
                nowIso: FIXED_NOW, clock: () => 0,
                repository: {
                    async insertContract() { throw new Error("trust db down"); },
                    async advanceContractLifecycle() {},
                    async insertPackage() {},
                    async insertObservation() {},
                    async insertReasoningUsage(u) { failedUsage.push(u); },
                },
            },
        });
        expect(failedUsage).toHaveLength(0);

        // Successful reconcile: exactly one.
        const { repository, packages, usage } = makeRecordingRepository();
        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        await reconcileOneTrustGovernanceGap(store.client(), {
            gap: gaps[0]!, deps: { repository, lookup: async () => null, now: () => FIXED_NOW, clock: () => 0 },
        });
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);
        expect(usage[0]!.provider_cost_units).toBe(0);
        warn.mockRestore();
    });
});

describe("GNC-7 — a governance gap leaking into identity review would be caught", () => {
    it("the identity readiness count explicitly excludes the governance-gap type", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/operator/operatorReviewService.ts"),
            "utf8",
        );
        // The count that feeds `hasOpenException` must filter this type out, or a
        // Trust outage would flip the identity review lane to `exception`.
        // Phase 1.5 generalized this to a SHARED list, so a new capability's
        // gap type is isolated the moment it is registered.
        expect(src).toContain("TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES");
        expect(src).toMatch(/\.neq\(\s*"exception_type"\s*,\s*gapType\s*\)/);
    });
});

describe("GNC-8 — Processing reading Trust, or Trust writing Processing, would be caught", () => {
    it("classification modules query no trust_ table", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder("lib/pos/processingCase/classification")) {
            const src = readFileSync(file, "utf8");
            for (const m of src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)) {
                if (m[1]!.startsWith("trust_")) offenders.push(`${file.replace(WEB_ROOT, "")}: ${m[1]}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("the idempotency lookup lives in lib/trust, where the trust_ query belongs", () => {
        const consumer = readFileSync(
            join(WEB_ROOT, "lib/trust/consumers/processingSourceClassification.ts"),
            "utf8",
        );
        expect(consumer).toContain('from("trust_decision_contracts")');
        expect(consumer).toContain('from("trust_decision_packages")');
    });

    it("no lib/trust module writes a processing_ table", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder("lib/trust")) {
            const src = readFileSync(file, "utf8");
            for (const m of src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)) {
                if (m[1]!.startsWith("processing_")) offenders.push(`${file.replace(WEB_ROOT, "")}: ${m[1]}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
