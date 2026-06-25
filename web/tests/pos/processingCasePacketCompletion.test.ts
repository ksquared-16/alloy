import { describe, it, expect } from "vitest";
import { shouldOpenProcessingCaseForPacket } from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromPacketCompletionSafe";
import { openProcessingCaseFromSource } from "@/lib/pos/processingCase/openProcessingCaseFromSource";
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

describe("shouldOpenProcessingCaseForPacket — marker gating", () => {
    it("opens for a POS-connected packet definition", () => {
        expect(shouldOpenProcessingCaseForPacket({ packetDefinitionMetadata: { pos_connected: true } })).toBe(true);
    });
    it("opens for a POS-connected packet session", () => {
        expect(shouldOpenProcessingCaseForPacket({ packetSessionMetadata: { pos: { connected: true } } })).toBe(true);
    });
    it("does NOT open for a legacy / unmarked packet", () => {
        expect(
            shouldOpenProcessingCaseForPacket({ packetDefinitionMetadata: {}, packetSessionMetadata: {} })
        ).toBe(false);
        expect(shouldOpenProcessingCaseForPacket({})).toBe(false);
    });
});

describe("packet completion → Processing Case (idempotency, one primary)", () => {
    it("opens one received case with the packet session as the single primary source", async () => {
        const { deps, insertCase, insertSource } = makeFakeDeps();
        const res = await openProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "form_packet_session",
            sourceId: "sess-1",
        });
        expect(res.created).toBe(true);
        expect(insertCase).toEqual([{ status: "received", caseType: null }]);
        expect(insertSource).toEqual([
            { processingCaseId: res.processingCaseId, sourceKind: "form_packet_session", sourceId: "sess-1", role: "primary" },
        ]);
    });

    it("is idempotent: re-completing the same packet session opens no duplicate case", async () => {
        const { deps, insertCase } = makeFakeDeps();
        const a = await openProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "form_packet_session",
            sourceId: "sess-1",
        });
        const b = await openProcessingCaseFromSource(deps, {
            orgId: "o1",
            sourceKind: "form_packet_session",
            sourceId: "sess-1",
        });
        expect(a.created).toBe(true);
        expect(b.created).toBe(false);
        expect(b.processingCaseId).toBe(a.processingCaseId);
        expect(insertCase).toHaveLength(1);
    });
});
