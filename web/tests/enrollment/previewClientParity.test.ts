import { describe, expect, it } from "vitest";

import {
    createEphemeralParticipantClient,
    type EphemeralSessionHolder,
} from "@/lib/enrollment/participantPreview/ephemeralParticipantClient";
import type { PacketSessionRow } from "@/lib/forms/packets/formPacketService";

/**
 * PARITY: the same runtime operations, through two clients, must leave the same state.
 *
 * The runtime's decisions are already pure — `selectNextParticipantTurn` and
 * `answerParticipantQuestion` take no client at all — so the only place preview could diverge from
 * production is the CLIENT: what a read returns after a write. That is what this measures.
 *
 * The expectations are deliberately NOT written twice. Each scenario runs against a row-backed
 * reference client and against the ephemeral one, and asserts the two agree — so a preview-only
 * expectation cannot be quietly relaxed to make a divergence pass, which is how this kind of test
 * normally rots.
 */

const seedSession = (): PacketSessionRow => ({
    id: "s-1",
    org_id: "org-1",
    packet_definition_id: "packet-1",
    started_via_public_link_id: "link-1",
    status: "in_progress",
    launch_context: {},
    crm_snapshot: {},
    shared_values: {},
    current_sequence_index: 0,
});

const seedItems = () => [
    { id: "i-0", packet_session_id: "s-1", packet_item_id: "step-a", sequence_index: 0, status: "active", form_submission_id: null },
    { id: "i-1", packet_session_id: "s-1", packet_item_id: "step-b", sequence_index: 1, status: "pending", form_submission_id: null },
    { id: "i-2", packet_session_id: "s-1", packet_item_id: "step-c", sequence_index: 2, status: "pending", form_submission_id: null },
];

/**
 * A reference client with the same row semantics a database gives: filters select, updates apply to
 * the selected rows, order sorts. Stands in for operational behaviour in a deterministic test.
 */
function referenceClient(state: { session: PacketSessionRow; tables: Record<string, Record<string, unknown>[]> }) {
    const table = (name: string) => (state.tables[name] ??= []);
    const build = (name: string, filters: [string, unknown][], patch: Record<string, unknown> | null, sort: { c: string; asc: boolean } | null) => {
        const rows = () => {
            let hit = table(name).filter((r) => filters.every(([c, v]) => r[c] === v));
            if (patch) for (const r of hit) Object.assign(r, patch);
            if (sort) {
                const d = sort.asc ? 1 : -1;
                hit = [...hit].sort((a, b) => ((a[sort.c] as number) === (b[sort.c] as number) ? 0 : (a[sort.c] as number) < (b[sort.c] as number) ? -d : d));
            }
            return hit;
        };
        const b: Record<string, unknown> = {
            eq: (c: string, v: unknown) => build(name, [...filters, [c, v]], patch, sort),
            order: (c: string, o?: { ascending?: boolean }) => build(name, filters, patch, { c, asc: o?.ascending !== false }),
            select: () => build(name, filters, patch, sort),
            maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
            then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res),
        };
        return b;
    };
    return {
        from: (name: string) => ({
            select: () => build(name, [], null, null),
            update: (patch: Record<string, unknown>) => build(name, [], patch, null),
            insert: (rows: Record<string, unknown>[]) => {
                for (const r of rows) table(name).push({ ...r });
                return build(name, [], null, null);
            },
        }),
    };
}

type Client = { from: (t: string) => Record<string, (a?: unknown) => Record<string, unknown>> };

/** The scenario is written ONCE and replayed against both clients. */
async function replay(db: Client) {
    const trace: unknown[] = [];
    const sessions = () => db.from("form_packet_sessions");
    const items = () => db.from("form_packet_session_items");

    // initial objective read
    trace.push(await (sessions().select("*") as never as { eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> } }).eq("id", "s-1").maybeSingle().then((r) => (r.data as PacketSessionRow).current_sequence_index));

    // a plain answer settles a shared value — read-modify-write
    await (sessions().update({ shared_values: { child_first_name: "Rowan" } }) as never as { eq: (c: string, v: unknown) => Promise<unknown> }).eq("id", "s-1");
    trace.push(await (sessions().select("*") as never as { eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> } }).eq("id", "s-1").maybeSingle().then((r) => (r.data as PacketSessionRow).shared_values));

    // a correction overwrites the same fact
    await (sessions().update({ shared_values: { child_first_name: "Rowan Alexander" } }) as never as { eq: (c: string, v: unknown) => Promise<unknown> }).eq("id", "s-1");
    trace.push(await (sessions().select("*") as never as { eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> } }).eq("id", "s-1").maybeSingle().then((r) => (r.data as PacketSessionRow).shared_values));

    // progression between packet steps: close step A, open step B, advance the session pointer
    await (items().update({ status: "complete" }) as never as { eq: (c: string, v: unknown) => Promise<unknown> }).eq("packet_item_id", "step-a");
    await (items().update({ status: "active" }) as never as { eq: (c: string, v: unknown) => Promise<unknown> }).eq("packet_item_id", "step-b");
    await (sessions().update({ current_sequence_index: 1 }) as never as { eq: (c: string, v: unknown) => Promise<unknown> }).eq("id", "s-1");

    // which step is active, read the way the runtime reads it
    const ordered = (await (items().select("*") as never as { eq: (c: string, v: unknown) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown }> } })
        .eq("packet_session_id", "s-1")
        .order("sequence_index", { ascending: true })) as { data: Record<string, unknown>[] };
    trace.push(ordered.data.map((r) => `${r.packet_item_id}:${r.status}`));
    trace.push(await (sessions().select("*") as never as { eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> } }).eq("id", "s-1").maybeSingle().then((r) => (r.data as PacketSessionRow).current_sequence_index));

    return trace;
}

describe("the ephemeral client and a row-backed client agree", () => {
    it("produces identical state across objective, answer, correction and step progression", async () => {
        const refState = { session: seedSession(), tables: { form_packet_sessions: [seedSession() as unknown as Record<string, unknown>], form_packet_session_items: seedItems() } };
        const reference = referenceClient(refState) as unknown as Client;

        const holder: EphemeralSessionHolder = {
            row: seedSession(),
            tables: { form_packet_sessions: [seedSession() as unknown as Record<string, unknown>], form_packet_session_items: seedItems(), form_submissions: [] },
        };
        const ephemeral = createEphemeralParticipantClient({ from: () => ({}) } as never, holder) as unknown as Client;

        const [a, b] = await Promise.all([replay(reference), replay(ephemeral)]);

        // One assertion, both traces. A preview-only expectation cannot be written here.
        expect(b).toEqual(a);
    });

    it("keeps the two step lists ordered the same way", async () => {
        const holder: EphemeralSessionHolder = {
            row: seedSession(),
            tables: { form_packet_session_items: [...seedItems()].reverse(), form_submissions: [] },
        };
        const db = createEphemeralParticipantClient({ from: () => ({}) } as never, holder) as unknown as Client;
        const res = (await (db.from("form_packet_session_items").select("*") as never as { order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown }> })
            .order("sequence_index", { ascending: true })) as { data: Record<string, unknown>[] };

        // Inserted in reverse; the runtime still meets step A first.
        expect(res.data.map((r) => r.sequence_index)).toEqual([0, 1, 2]);
    });
});
