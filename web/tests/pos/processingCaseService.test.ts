import { describe, it, expect } from "vitest";
import {
    openProcessingCaseFromSource,
    attachRelatedSource,
} from "@/lib/pos/processingCase/openProcessingCaseFromSource";
import { shouldOpenProcessingCaseForSurface } from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromFormSubmissionSafe";
import type {
    ProcessingCaseDeps,
    ProcessingCaseSourceKind,
    ProcessingCaseSourceRole,
} from "@/lib/pos/processingCase/types";

interface RecordedSource {
    processingCaseId: string;
    sourceKind: ProcessingCaseSourceKind;
    sourceId: string;
    role: ProcessingCaseSourceRole;
}

function makeFakeDeps(seedPrimaries?: Record<string, string>) {
    const primaries = new Map<string, string>(Object.entries(seedPrimaries ?? {}));
    const insertCase: { status: string; caseType: string | null }[] = [];
    const insertSource: RecordedSource[] = [];
    let seq = 0;
    const deps: ProcessingCaseDeps = {
        async findCaseIdByPrimarySource({ sourceKind, sourceId }) {
            return primaries.get(`${sourceKind}::${sourceId}`) ?? null;
        },
        async insertCase({ status, caseType }) {
            insertCase.push({ status, caseType });
            return { id: `case-${++seq}` };
        },
        async insertSource(a) {
            insertSource.push({
                processingCaseId: a.processingCaseId,
                sourceKind: a.sourceKind,
                sourceId: a.sourceId,
                role: a.role,
            });
            if (a.role === "primary") primaries.set(`${a.sourceKind}::${a.sourceId}`, a.processingCaseId);
        },
    };
    return { deps, insertCase, insertSource };
}

describe("openProcessingCaseFromSource", () => {
    it("opens a new received case with exactly one primary source", async () => {
        const { deps, insertCase, insertSource } = makeFakeDeps();
        const res = await openProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "form_submission",
            sourceId: "s1",
        });
        expect(res.created).toBe(true);
        expect(res.processingCaseId).toBe("case-1");
        expect(insertCase).toEqual([{ status: "received", caseType: null }]);
        expect(insertSource).toHaveLength(1);
        expect(insertSource[0]).toMatchObject({
            role: "primary",
            sourceKind: "form_submission",
            sourceId: "s1",
            processingCaseId: "case-1",
        });
    });

    it("is idempotent when the source is already a primary (no insert)", async () => {
        const { deps, insertCase, insertSource } = makeFakeDeps({ "form_submission::s1": "case-existing" });
        const res = await openProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "form_submission",
            sourceId: "s1",
        });
        expect(res).toEqual({ processingCaseId: "case-existing", created: false });
        expect(insertCase).toHaveLength(0);
        expect(insertSource).toHaveLength(0);
    });

    it("a second open for the same source returns the same case (no duplicate)", async () => {
        const { deps } = makeFakeDeps();
        const a = await openProcessingCaseFromSource(deps, { orgId: "o1", sourceKind: "document", sourceId: "d1" });
        const b = await openProcessingCaseFromSource(deps, { orgId: "o1", sourceKind: "document", sourceId: "d1" });
        expect(a.created).toBe(true);
        expect(b.created).toBe(false);
        expect(b.processingCaseId).toBe(a.processingCaseId);
    });

    it("public submit then admin finalize of the same form submission opens exactly one case", async () => {
        // POS-FP5: the public single-form on-ramp and the admin submit on-ramp can both
        // fire for the same submission. The producer is idempotent on the primary source,
        // so the second call returns the existing case — no duplicate.
        const { deps, insertCase } = makeFakeDeps();
        const publicOpen = await openProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "form_submission",
            sourceId: "sub-1",
        });
        const adminFinalize = await openProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "form_submission",
            sourceId: "sub-1",
        });
        expect(publicOpen.created).toBe(true);
        expect(adminFinalize.created).toBe(false);
        expect(adminFinalize.processingCaseId).toBe(publicOpen.processingCaseId);
        expect(insertCase).toHaveLength(1);
    });
});

describe("attachRelatedSource", () => {
    it("attaches a related (non-primary) source without forking the case", async () => {
        const { deps, insertSource } = makeFakeDeps();
        await attachRelatedSource(deps, {
            orgId: "o1",
            processingCaseId: "case-1",
            sourceKind: "document",
            sourceId: "rate-sheet",
        });
        expect(insertSource).toEqual([
            { processingCaseId: "case-1", sourceKind: "document", sourceId: "rate-sheet", role: "related" },
        ]);
    });
});

describe("shouldOpenProcessingCaseForSurface — marker gating / legacy non-interference", () => {
    it("opens for POS-connected definition metadata", () => {
        expect(shouldOpenProcessingCaseForSurface({ definitionMetadata: { pos_connected: true } })).toBe(true);
    });
    it("opens for POS-connected version metadata", () => {
        expect(shouldOpenProcessingCaseForSurface({ versionMetadata: { pos: { connected: true } } })).toBe(true);
    });
    it("does NOT open for legacy (unmarked) surfaces", () => {
        expect(shouldOpenProcessingCaseForSurface({ definitionMetadata: {}, versionMetadata: {} })).toBe(false);
        expect(shouldOpenProcessingCaseForSurface({})).toBe(false);
    });
});
