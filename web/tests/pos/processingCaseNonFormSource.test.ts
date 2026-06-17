/**
 * POS-FP1c — non-form source convergence into the existing Processing Case spine.
 *
 * Proves documents/uploads/imports can open the SAME case engine as forms/packets,
 * idempotently and org-scoped, while:
 *  - the form/packet on-ramps are unchanged (regression),
 *  - a form kind cannot be opened down the non-form path (guard),
 *  - commit stays honest for non-form sources (routed no-op, no record write),
 *  - the read model displays unresolved kinds gracefully (no crash).
 *
 * No DB: pure orchestration over injected deps + pure helpers (matches the
 * existing processingCaseService.test.ts style).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    openProcessingCaseFromSource,
} from "@/lib/pos/processingCase/openProcessingCaseFromSource";
import {
    isNonFormProcessingSourceKind,
    openNonFormProcessingCaseFromSource,
    NON_FORM_PROCESSING_SOURCE_KINDS,
} from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromNonFormSourceSafe";
import { runMinimalDestinationHandoff } from "@/lib/pos/processingCase/approveHandoff";
import {
    resolveSourceDescriptors,
} from "@/lib/pos/processingCase/readModel/sourceDisplayResolvers";
import type {
    ProcessingCaseDeps,
    ProcessingCaseSourceKind,
    ProcessingCaseSourceRole,
} from "@/lib/pos/processingCase/types";
import type { SourceRef } from "@/lib/pos/processingCase/readModel/types";

interface RecordedSource {
    orgId: string;
    processingCaseId: string;
    sourceKind: ProcessingCaseSourceKind;
    sourceId: string;
    role: ProcessingCaseSourceRole;
}

/**
 * Fake deps that key the primary index on (orgId, sourceKind, sourceId) — exactly
 * like the DB unique index `uq_pcs_primary_source_once`. This lets us assert both
 * idempotency AND org scoping.
 */
function makeOrgScopedDeps() {
    const primaries = new Map<string, string>();
    const insertCase: { orgId: string; status: string; caseType: string | null }[] = [];
    const insertSource: RecordedSource[] = [];
    let seq = 0;
    const key = (orgId: string, kind: string, id: string) => `${orgId}::${kind}::${id}`;
    const deps: ProcessingCaseDeps = {
        async findCaseIdByPrimarySource({ orgId, sourceKind, sourceId }) {
            return primaries.get(key(orgId, sourceKind, sourceId)) ?? null;
        },
        async insertCase({ orgId, status, caseType }) {
            insertCase.push({ orgId, status, caseType });
            return { id: `case-${++seq}` };
        },
        async insertSource(a) {
            insertSource.push({
                orgId: a.orgId,
                processingCaseId: a.processingCaseId,
                sourceKind: a.sourceKind,
                sourceId: a.sourceId,
                role: a.role,
            });
            if (a.role === "primary") primaries.set(key(a.orgId, a.sourceKind, a.sourceId), a.processingCaseId);
        },
    };
    return { deps, insertCase, insertSource };
}

describe("isNonFormProcessingSourceKind — kind taxonomy", () => {
    it("accepts every non-form kind", () => {
        for (const kind of NON_FORM_PROCESSING_SOURCE_KINDS) {
            expect(isNonFormProcessingSourceKind(kind)).toBe(true);
        }
        expect(NON_FORM_PROCESSING_SOURCE_KINDS).toEqual([
            "document",
            "upload",
            "email_attachment",
            "import",
            "recreated_document",
        ]);
    });

    it("rejects the form-backed kinds (they keep their own on-ramps)", () => {
        expect(isNonFormProcessingSourceKind("form_submission")).toBe(false);
        expect(isNonFormProcessingSourceKind("form_packet_session")).toBe(false);
    });

    it("rejects unknown junk", () => {
        expect(isNonFormProcessingSourceKind("nonsense")).toBe(false);
        expect(isNonFormProcessingSourceKind("")).toBe(false);
    });
});

describe("openNonFormProcessingCaseFromSource — opens the same spine", () => {
    it("opens a new received case for a document with exactly one primary source", async () => {
        const { deps, insertCase, insertSource } = makeOrgScopedDeps();
        const res = await openNonFormProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "document",
            sourceId: "doc-1",
        });
        expect(res.created).toBe(true);
        expect(insertCase).toEqual([{ orgId: "o1", status: "received", caseType: null }]);
        expect(insertSource).toHaveLength(1);
        expect(insertSource[0]).toMatchObject({
            role: "primary",
            sourceKind: "document",
            sourceId: "doc-1",
            processingCaseId: res.processingCaseId,
        });
    });

    it.each(["upload", "import", "email_attachment", "recreated_document"] as const)(
        "opens a case for non-form kind %s",
        async (kind) => {
            const { deps, insertCase } = makeOrgScopedDeps();
            const res = await openNonFormProcessingCaseFromSource(deps, {
                orgId: "o1",
                sourceKind: kind,
                sourceId: `${kind}-1`,
            });
            expect(res.created).toBe(true);
            expect(insertCase).toHaveLength(1);
        }
    );

    it("persists an optional caseType classification hint when provided", async () => {
        const { deps, insertCase } = makeOrgScopedDeps();
        await openNonFormProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "import",
            sourceId: "batch-1",
            caseType: "remittance_batch",
        });
        expect(insertCase[0].caseType).toBe("remittance_batch");
    });
});

describe("idempotency — no duplicate cases", () => {
    it("a second open of the same non-form source returns the same case (no insert)", async () => {
        const { deps, insertCase } = makeOrgScopedDeps();
        const a = await openNonFormProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "document",
            sourceId: "doc-1",
        });
        const b = await openNonFormProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "document",
            sourceId: "doc-1",
        });
        expect(a.created).toBe(true);
        expect(b.created).toBe(false);
        expect(b.processingCaseId).toBe(a.processingCaseId);
        expect(insertCase).toHaveLength(1);
    });
});

describe("org scoping — RLS-shaped isolation preserved", () => {
    it("same source id in two orgs opens two distinct cases", async () => {
        const { deps, insertCase } = makeOrgScopedDeps();
        const o1 = await openNonFormProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "document",
            sourceId: "doc-shared",
        });
        const o2 = await openNonFormProcessingCaseFromSource(deps, {
            orgId: "o2",
            sourceKind: "document",
            sourceId: "doc-shared",
        });
        expect(o1.created).toBe(true);
        expect(o2.created).toBe(true);
        expect(o1.processingCaseId).not.toBe(o2.processingCaseId);
        expect(insertCase).toHaveLength(2);
    });
});

describe("guard — form kinds cannot enter via the non-form path", () => {
    it.each(["form_submission", "form_packet_session"] as const)(
        "throws for %s and opens nothing",
        async (kind) => {
            const { deps, insertCase, insertSource } = makeOrgScopedDeps();
            await expect(
                openNonFormProcessingCaseFromSource(deps, { orgId: "o1", sourceKind: kind, sourceId: "x" })
            ).rejects.toThrow(/not a non-form source kind/);
            expect(insertCase).toHaveLength(0);
            expect(insertSource).toHaveLength(0);
        }
    );

    it("throws on missing identifiers", async () => {
        const { deps } = makeOrgScopedDeps();
        await expect(
            openNonFormProcessingCaseFromSource(deps, { orgId: "", sourceKind: "document", sourceId: "d" })
        ).rejects.toThrow(/orgId is required/);
        await expect(
            openNonFormProcessingCaseFromSource(deps, { orgId: "o1", sourceKind: "document", sourceId: "" })
        ).rejects.toThrow(/sourceId is required/);
    });
});

describe("regression — form/packet still open via the shared opener", () => {
    it("form_submission opens via openProcessingCaseFromSource (unchanged path)", async () => {
        const { deps, insertSource } = makeOrgScopedDeps();
        const res = await openProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "form_submission",
            sourceId: "sub-1",
        });
        expect(res.created).toBe(true);
        expect(insertSource[0]).toMatchObject({ sourceKind: "form_submission", role: "primary" });
    });

    it("form_packet_session opens via openProcessingCaseFromSource (unchanged path)", async () => {
        const { deps, insertSource } = makeOrgScopedDeps();
        const res = await openProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "form_packet_session",
            sourceId: "sess-1",
        });
        expect(res.created).toBe(true);
        expect(insertSource[0]).toMatchObject({ sourceKind: "form_packet_session", role: "primary" });
    });
});

describe("commit honesty — non-form sources do not pretend to complete", () => {
    it("runMinimalDestinationHandoff routes (no record write) for a document source", async () => {
        // The handoff returns early for any non-form-submission source, so supabase is
        // never touched; a throwing stub proves no DB write is attempted.
        const throwingSupabase = {
            from() {
                throw new Error("DB must not be touched for a non-form source");
            },
        } as unknown as SupabaseClient;

        for (const kind of NON_FORM_PROCESSING_SOURCE_KINDS) {
            const result = await runMinimalDestinationHandoff(throwingSupabase, "o1", {
                source_kind: kind,
                source_id: `${kind}-1`,
            });
            expect(result.kind).toBe("routed");
            expect(result.recordId).toBeUndefined();
        }
    });

    it("also routes when there is no primary source at all", async () => {
        const throwingSupabase = {
            from() {
                throw new Error("DB must not be touched");
            },
        } as unknown as SupabaseClient;
        const result = await runMinimalDestinationHandoff(throwingSupabase, "o1", null);
        expect(result.kind).toBe("routed");
    });
});

describe("read model — unresolved non-form kinds display gracefully", () => {
    it("falls back to an honest descriptor (resolved=false) instead of crashing", async () => {
        const refs: SourceRef[] = [
            { kind: "import", id: "batch-1", role: "primary", linkedAt: "2026-06-16T00:00:00Z" },
            { kind: "email_attachment", id: "att-1", role: "related", linkedAt: null },
        ];
        // Empty registry => every kind is unresolved; must not throw.
        const out = await resolveSourceDescriptors(refs, new Map());
        const imp = out.get("import::batch-1");
        const att = out.get("email_attachment::att-1");
        expect(imp).toMatchObject({ kind: "import", id: "batch-1", label: "import", resolved: false });
        expect(att).toMatchObject({ kind: "email_attachment", id: "att-1", label: "email_attachment", resolved: false });
    });
});
