import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    buildOpportunityDrawerViewModelUrl,
    fetchOpportunityDrawerViewModelClient,
} from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";
import {
    CARRIER_LINE_KEY,
    DRAWER_VIEW_MODEL_LINE_KEY,
    buildActionableDrawerCarrier,
    type ActionableDrawerCarrier,
} from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrier";
import { emptyResolvedActionsBySlot, type ResolvedActionForClient } from "@/lib/admin/actions/types";

const UPDATE: ResolvedActionForClient = {
    key: "update_lead_status",
    label: "Update Lead Status",
    description: null,
    action_type: "mutation_command",
    icon: null,
    style: null,
    display_style: "button",
    payload: {},
    workflow_id: null,
};

const carrierFor = (id: string): ActionableDrawerCarrier =>
    buildActionableDrawerCarrier({
        opportunityId: id,
        attentionSubjectId: null,
        departmentId: "dept-9",
        workUnitId: "wu-7",
        resolved: { ...emptyResolvedActionsBySlot(), primary: [UPDATE] },
        flushedAtMs: 391,
    })!;

const VIEW_MODEL = { generation: "g1", structureSettled: true, entity: { type: "opportunity", id: "opp-B" } };

/** A response whose body streams the given chunks, exactly as written. */
function streamed(chunks: string[]): Response {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const c of chunks) controller.enqueue(enc.encode(c));
            controller.close();
        },
    });
    return { ok: true, status: 200, body } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * THE TWO-PHASE WIRE, READ END TO END.
 *
 * A streaming seam can typecheck, build and still be wrong on the wire: a line split across a chunk
 * boundary, a body that ends without its second phase, a carrier minted for another subject. Each of
 * those is a real failure mode of this specific delivery, so each is driven here against a real
 * `ReadableStream` rather than a mocked parser.
 */
describe("two-phase drawer transport", () => {
    it("is opt-in — no sink, no phased query, no streaming", async () => {
        expect(buildOpportunityDrawerViewModelUrl("opp-B", null)).not.toContain("phased");
        expect(buildOpportunityDrawerViewModelUrl("opp-B", null, true)).toContain("phased=1");

        fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => VIEW_MODEL } as unknown as Response);
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null);
        expect(r.ok).toBe(true);
        expect(String(fetchMock.mock.calls[0]![0])).not.toContain("phased");
    });

    it("delivers phase 1 first and still settles on phase 2", async () => {
        fetchMock.mockResolvedValue(
            streamed([
                `${JSON.stringify({ [CARRIER_LINE_KEY]: carrierFor("opp-B") })}\n`,
                `${JSON.stringify({ [DRAWER_VIEW_MODEL_LINE_KEY]: VIEW_MODEL })}\n`,
            ]),
        );
        const seen: ActionableDrawerCarrier[] = [];
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null, undefined, (c) => seen.push(c));
        expect(seen).toHaveLength(1);
        expect(seen[0]!.header_menu[0]!.key).toBe("update_lead_status");
        expect(r.ok).toBe(true);
        expect(String(fetchMock.mock.calls[0]![0])).toContain("phased=1");
    });

    it("A LINE SPLIT ACROSS CHUNKS IS STILL ONE LINE", async () => {
        const line = `${JSON.stringify({ [CARRIER_LINE_KEY]: carrierFor("opp-B") })}\n`;
        const cut = Math.floor(line.length / 2);
        fetchMock.mockResolvedValue(
            streamed([
                line.slice(0, cut),
                line.slice(cut),
                `${JSON.stringify({ [DRAWER_VIEW_MODEL_LINE_KEY]: VIEW_MODEL })}\n`,
            ]),
        );
        const seen: ActionableDrawerCarrier[] = [];
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null, undefined, (c) => seen.push(c));
        expect(seen).toHaveLength(1);
        expect(r.ok).toBe(true);
    });

    it("a final line with no trailing newline is still read", async () => {
        fetchMock.mockResolvedValue(
            streamed([
                `${JSON.stringify({ [CARRIER_LINE_KEY]: carrierFor("opp-B") })}\n`,
                JSON.stringify({ [DRAWER_VIEW_MODEL_LINE_KEY]: VIEW_MODEL }),
            ]),
        );
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null, undefined, () => {});
        expect(r.ok).toBe(true);
    });

    it("A CARRIER FOR ANOTHER SUBJECT IS NEVER HANDED ON", async () => {
        fetchMock.mockResolvedValue(
            streamed([
                `${JSON.stringify({ [CARRIER_LINE_KEY]: carrierFor("opp-SOMEONE-ELSE") })}\n`,
                `${JSON.stringify({ [DRAWER_VIEW_MODEL_LINE_KEY]: VIEW_MODEL })}\n`,
            ]),
        );
        const seen: ActionableDrawerCarrier[] = [];
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null, undefined, (c) => seen.push(c));
        expect(seen).toHaveLength(0);
        // And the request still succeeds: a refused carrier costs the operator earliness, not the drawer.
        expect(r.ok).toBe(true);
    });

    it("a malformed carrier line is discarded, and phase 2 still lands", async () => {
        fetchMock.mockResolvedValue(
            streamed([`{"${CARRIER_LINE_KEY}": {oops\n`, `${JSON.stringify({ [DRAWER_VIEW_MODEL_LINE_KEY]: VIEW_MODEL })}\n`]),
        );
        const seen: ActionableDrawerCarrier[] = [];
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null, undefined, (c) => seen.push(c));
        expect(seen).toHaveLength(0);
        expect(r.ok).toBe(true);
    });

    it("A TRUNCATED STREAM IS AN ERROR, NOT AN EMPTY VIEW MODEL", async () => {
        fetchMock.mockResolvedValue(streamed([`${JSON.stringify({ [CARRIER_LINE_KEY]: carrierFor("opp-B") })}\n`]));
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null, undefined, () => {});
        expect(r.ok).toBe(false);
        expect((r as { error: string }).error).toBe("drawer_vm_phased_incomplete");
    });

    it("the 422 'structure not settled' outcome survives becoming a line", async () => {
        const skipped = { structureSettled: false, reason: "classic_layout_deferred", compose_version: 1 };
        fetchMock.mockResolvedValue(streamed([`${JSON.stringify({ __skipped: skipped })}\n`]));
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null, undefined, () => {});
        expect(r.ok).toBe(false);
        expect((r as { skipped: unknown; status: number }).status).toBe(422);
        expect((r as { skipped: { reason: string } }).skipped.reason).toBe("classic_layout_deferred");
    });

    it("A REFUSED ORG ASSERTION YIELDS NO CARRIER AND A 404", async () => {
        /*
         * The org assertion now runs ALONGSIDE compose instead of ahead of it, so that a median
         * 118ms (and up to 3,807ms measured) leaves the critical path. The route holds the carrier
         * until the assertion answers and writes only this line when it refuses. If that line were
         * ever accompanied by a carrier, a caller whose right to the record was denied would have
         * received its action set.
         */
        fetchMock.mockResolvedValue(streamed([`${JSON.stringify({ __not_found: true })}\n`]));
        const seen: ActionableDrawerCarrier[] = [];
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null, undefined, (c) => seen.push(c));
        expect(seen).toHaveLength(0);
        expect(r.ok).toBe(false);
        expect((r as { status: number }).status).toBe(404);
        expect((r as { error: string }).error).toBe("Not found");
    });

    it("the refusal wins even if a carrier line somehow precedes it", async () => {
        // Defence in depth: the route cannot emit this order, and if it ever did the request must
        // still resolve as a refusal rather than as a drawer.
        fetchMock.mockResolvedValue(
            streamed([
                `${JSON.stringify({ [CARRIER_LINE_KEY]: carrierFor("opp-B") })}\n`,
                `${JSON.stringify({ __not_found: true })}\n`,
            ]),
        );
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null, undefined, () => {});
        expect(r.ok).toBe(false);
        expect((r as { status: number }).status).toBe(404);
    });

    it("a compose failure survives becoming a line", async () => {
        fetchMock.mockResolvedValue(streamed([`${JSON.stringify({ __error: "boom" })}\n`]));
        const r = await fetchOpportunityDrawerViewModelClient("opp-B", null, undefined, () => {});
        expect(r.ok).toBe(false);
        expect((r as { error: string }).error).toBe("boom");
    });

    it("THE LENS TRAVELS ON THE REQUEST BUT DOES NOT GATE THE CARRIER", async () => {
        const childCarrier = buildActionableDrawerCarrier({
            opportunityId: "opp-B",
            attentionSubjectId: "child-1",
            departmentId: "dept-9",
            workUnitId: "wu-7",
            resolved: { ...emptyResolvedActionsBySlot(), primary: [UPDATE] },
            flushedAtMs: 1,
        })!;
        fetchMock.mockResolvedValue(
            streamed([
                `${JSON.stringify({ [CARRIER_LINE_KEY]: childCarrier })}\n`,
                `${JSON.stringify({ [DRAWER_VIEW_MODEL_LINE_KEY]: VIEW_MODEL })}\n`,
            ]),
        );
        /*
         * Asked with no lens; the carrier echoes one. It is STILL handed on, because the header
         * action set is resolved without any participation — the two describe the same subject and
         * therefore the same actions. Refusing here is what left deployed 8e749e03 with a carrier
         * that arrived at click +164ms and mounted nothing: the hover prewarm asserts the queue
         * row's own id and the panel asserts none.
         */
        const seenFamily: ActionableDrawerCarrier[] = [];
        await fetchOpportunityDrawerViewModelClient("opp-B", { department_id: "dept-9" } as never, undefined, (c) =>
            seenFamily.push(c),
        );
        expect(seenFamily).toHaveLength(1);
        expect(seenFamily[0]!.subject.attention_subject_id).toBe("child-1");

        fetchMock.mockResolvedValue(
            streamed([
                `${JSON.stringify({ [CARRIER_LINE_KEY]: childCarrier })}\n`,
                `${JSON.stringify({ [DRAWER_VIEW_MODEL_LINE_KEY]: VIEW_MODEL })}\n`,
            ]),
        );
        const seenChild: ActionableDrawerCarrier[] = [];
        await fetchOpportunityDrawerViewModelClient(
            "opp-B",
            { department_id: "dept-9", attention_subject_id: "child-1" } as never,
            undefined,
            (c) => seenChild.push(c),
        );
        expect(seenChild).toHaveLength(1);
    });
});
