import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
    fetchProvisioningEntryDeduped,
    settlementForAnswer,
    provisioningAnswerUrl,
    clearInflightProvisioningEntriesForTests,
} from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";
import {
    PHASED_CONTENT_TYPE,
    PHASED_QUERY_KEY,
    SETTLEMENT_LINE_KEY,
} from "@/lib/runtime/provisioning/provisioningTwoPhaseWire";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const ROUTE = read("app/api/admin/work-units/[id]/provisioning-answer/route.ts");
const KERNEL = read("lib/runtime/kernel/provisioning.ts");

/** A frame and a settlement, written as the route writes them: one JSON document per line. */
function ndjson(lines: unknown[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream<Uint8Array>({
        start(c) {
            for (const l of lines) c.enqueue(enc.encode(`${JSON.stringify(l)}\n`));
            c.close();
        },
    });
}

/** A phased response that holds its SECOND line until the test releases it. */
function heldNdjson(frame: unknown): { body: ReadableStream<Uint8Array>; release: (patch: unknown) => void } {
    const enc = new TextEncoder();
    let release!: (patch: unknown) => void;
    const gate = new Promise<unknown>((r) => { release = r; });
    const body = new ReadableStream<Uint8Array>({
        async start(c) {
            c.enqueue(enc.encode(`${JSON.stringify(frame)}\n`));
            const patch = await gate;
            c.enqueue(enc.encode(`${JSON.stringify({ [SETTLEMENT_LINE_KEY]: patch })}\n`));
            c.close();
        },
    });
    return { body, release };
}

const FRAME = { terminal: "operational", orgId: "t1", resolvedParticipant: null } as const;

function phasedResponse(body: ReadableStream<Uint8Array>): Response {
    return new Response(body, { status: 200, headers: { "content-type": PHASED_CONTENT_TYPE } });
}

/**
 * OX SLICE 8 — THE HTTP SEAM MUST NOT WAIT FOR SETTLEMENT.
 *
 * Measured on deployed f302b98b: the provisioning round trip was P50 1,838ms, of which ~600-680ms
 * was the seam awaiting `runSettlement` after the frame had already composed, while action
 * eligibility resolved at ~443ms of the ~883ms compose. The RSC route already avoided that wait by
 * passing `deferSettlement`; the HTTP seam — the one a queue-row switch actually uses — did not.
 *
 * The failure mode these guard against is subtle and would look like success: a streaming transport
 * that still reads the whole body before resolving is SLOWER than the settled response it replaced
 * and reports itself as repaired. So the central test below is not "does it parse two lines" but
 * "does the frame resolve while the second line is still unwritten".
 */
describe("http two-phase provisioning", () => {
    beforeEach(() => { clearInflightProvisioningEntriesForTests(); });
    afterEach(() => { vi.unstubAllGlobals(); clearInflightProvisioningEntriesForTests(); });

    it("THE FRAME RESOLVES BEFORE THE SETTLEMENT IS WRITTEN — the whole repair", async () => {
        const { body, release } = heldNdjson(FRAME);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(phasedResponse(body)));

        const result = await fetchProvisioningEntryDeduped("/p?phased=1");
        // If this line is reached at all, the frame arrived without the settlement: the held stream
        // has not written its second line yet.
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.answer.terminal).toBe("operational");

        let settled = false;
        void result.settlement?.then(() => { settled = true; });
        await Promise.resolve();
        expect(settled, "settlement must still be pending while only the frame has been written").toBe(false);

        release({ navigation: { target: "t" }, resolvedParticipant: "p1" });
        await expect(result.settlement).resolves.toMatchObject({ resolvedParticipant: "p1" });
    });

    it("a settled (non-phased) answer carries NO settlement — absent is not the same as null", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(JSON.stringify(FRAME), { status: 200, headers: { "content-type": "application/json" } }),
        ));
        const result = await fetchProvisioningEntryDeduped("/p");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // Absent means "this answer was already complete"; null would mean "nothing to apply".
        expect(result.settlement).toBeUndefined();
        expect(settlementForAnswer(result.answer)).toBeNull();
    });

    it("phase 2 is findable from the frame it belongs to", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            phasedResponse(ndjson([FRAME, { [SETTLEMENT_LINE_KEY]: { navigation: { target: "t" } } }])),
        ));
        const result = await fetchProvisioningEntryDeduped("/p?phased=1");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        await expect(settlementForAnswer(result.answer)).resolves.toMatchObject({ navigation: { target: "t" } });
    });

    it("a malformed or truncated second line resolves to null, never a fabricated empty", async () => {
        for (const tail of ["{not json", ""]) {
            clearInflightProvisioningEntriesForTests();
            const enc = new TextEncoder();
            const body = new ReadableStream<Uint8Array>({
                start(c) {
                    c.enqueue(enc.encode(`${JSON.stringify(FRAME)}\n`));
                    if (tail) c.enqueue(enc.encode(`${tail}\n`));
                    c.close();
                },
            });
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue(phasedResponse(body)));
            const result = await fetchProvisioningEntryDeduped(`/p?phased=1&t=${tail.length}`);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            await expect(result.settlement).resolves.toBeNull();
        }
    });

    it("a phased response with NO frame is a transport fault, not an invented answer", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(phasedResponse(ndjson([]))));
        const result = await fetchProvisioningEntryDeduped("/p?phased=1&empty");
        expect(result.ok).toBe(false);
    });

    it("the two-phase request is part of the URL identity", () => {
        // The URL is the coalescing key, the intent-warm key and the consume-once key. A phased
        // answer and a settled one are different RESPONSES, so a shared key could serve one for the
        // other.
        expect(provisioningAnswerUrl("new-leads")).toContain(`${PHASED_QUERY_KEY}=1`);
    });

    it("the route defers settlement only when the client asked, and still streams one request", () => {
        expect(ROUTE).toContain("deferSettlement: phased");
        expect(ROUTE).toContain("if (!phased || !result.settlement)");
        expect(ROUTE).toContain("new ReadableStream<Uint8Array>");
        // No second endpoint family: the settlement rides the request that composed it.
        expect(ROUTE).not.toMatch(/fetch\(|\/settlement["'`]/);
    });

    it("PLANT — restoring the HTTP settlement await must be detectable", () => {
        /*
         * The completion-coupling invariant. Before this slice the seam called the composer WITHOUT
         * `deferSettlement`, so the route awaited `runSettlement` inside the request. If that await
         * ever returns, this assertion is the thing that notices: the route must never call the
         * composer in a way that settles before responding while still claiming to be phased.
         */
        const start = ROUTE.indexOf("composeProvisioningAnswerForRoute(");
        const call = ROUTE.slice(start, ROUTE.indexOf("});", start));
        expect(call).toContain("deferSettlement: phased");
        expect(ROUTE).not.toContain("await result.settlement;");
    });

    it("phase 2 re-emits through the SAME stale guard — late B cannot repaint C", () => {
        // The settlement is delivered by re-emitting, not by mutating the committed snapshot, so the
        // supersede check that discards a stale first answer also discards a stale settlement.
        expect(KERNEL).toContain("if (first) void this.settle(f, answer, emit);");
        const settle = KERNEL.slice(KERNEL.indexOf("private async settle("));
        expect(settle.slice(0, 1400)).toContain("if (f.disposed) return;");
        expect(settle.slice(0, 1400)).toContain("applyProvisioningSettlement(frame, patch, patch.navigation)");
        // Reference identity is the duplicate check — a patch carrying nothing emits no terminal.
        expect(settle.slice(0, 1400)).toContain("if (settled === frame) return;");
    });

    it("the kernel does not re-derive settlement semantics — one authority", () => {
        const settle = KERNEL.slice(KERNEL.indexOf("private async settle("), KERNEL.indexOf("private async run("));
        for (const forbidden of ["resolvedParticipant", "cards", "focusPanelOperationalProjection"]) {
            expect(settle.includes(forbidden), `kernel must not touch ${forbidden} itself`).toBe(false);
        }
    });
});
