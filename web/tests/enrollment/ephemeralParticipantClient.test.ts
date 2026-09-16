import { describe, expect, it } from "vitest";

import {
    EPHEMERAL_TABLES,
    PreviewWriteRefused,
    createEphemeralParticipantClient,
    type EphemeralSessionHolder,
} from "@/lib/enrollment/participantPreview/ephemeralParticipantClient";
import type { PacketSessionRow } from "@/lib/forms/packets/formPacketService";

/**
 * The property this boundary exists for: the participant runtime can execute against it and still
 * be INCAPABLE of operational consequence — not unwilling, incapable.
 *
 * These tests are the reason the design is a client rather than a flag. A `if (preview) skip`
 * cannot be tested this way, because there is no single object to ask "would you write?" — the
 * answer is spread across every call site, and a new one is safe only until someone forgets.
 */

const session = (): PacketSessionRow => ({
    id: "preview-session",
    org_id: "org-1",
    packet_definition_id: "packet-1",
    started_via_public_link_id: "preview-link",
    status: "in_progress",
    launch_context: {},
    crm_snapshot: {},
    shared_values: {},
    current_sequence_index: 0,
});

const holder = (): EphemeralSessionHolder => ({ row: session(), tables: {} });

/** Stands in for the real client: every call through it is a real database call, so it must not happen. */
const realClientThatMustNotBeUsedForWrites = () => {
    const calls: string[] = [];
    const client = {
        from: (t: string) => {
            calls.push(`from:${t}`);
            return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
                insert: () => {
                    calls.push(`INSERT:${t}`);
                    return { select: () => ({}) };
                },
                update: () => {
                    calls.push(`UPDATE:${t}`);
                    return { eq: () => ({}) };
                },
                upsert: () => {
                    calls.push(`UPSERT:${t}`);
                    return {};
                },
                delete: () => {
                    calls.push(`DELETE:${t}`);
                    return { eq: () => ({}) };
                },
            };
        },
        storage: { from: () => ({ upload: () => calls.push("UPLOAD") }) },
    };
    return { client, calls };
};

describe("the session the conversation mutates is held in memory", () => {
    it("reads back what the runtime just wrote — the read-modify-write still works", async () => {
        const h = holder();
        const { client } = realClientThatMustNotBeUsedForWrites();
        const db = createEphemeralParticipantClient(client as never, h);

        await db.from("form_packet_sessions").update({ current_sequence_index: 2 }).eq("id", "preview-session");
        const read = await db.from("form_packet_sessions").select("*").eq("id", "preview-session").maybeSingle();

        // This is the specific thing write-suppression could never deliver: the modify is real, so
        // the next turn sees the answer the last turn gave.
        expect((read.data as PacketSessionRow).current_sequence_index).toBe(2);
        expect(h.row.current_sequence_index).toBe(2);
    });

    it("keeps per-step rows apart, so a filter picks the step the runtime asked for", async () => {
        const h = holder();
        const { client } = realClientThatMustNotBeUsedForWrites();
        const db = createEphemeralParticipantClient(client as never, h);

        await db.from("form_submissions").insert([
            { id: "s1", packet_item_id: "step-1", payload: { a: 1 } },
            { id: "s2", packet_item_id: "step-2", payload: { a: 2 } },
        ]);
        const second = await db.from("form_submissions").select("*").eq("packet_item_id", "step-2").maybeSingle();

        expect((second.data as { id: string }).id).toBe("s2");
    });
});

describe("every operational write is refused, by construction", () => {
    it("refuses a write to a table nobody thought of — failing closed, not by deny-list", () => {
        const h = holder();
        const { client, calls } = realClientThatMustNotBeUsedForWrites();
        const db = createEphemeralParticipantClient(client as never, h);

        // Not an enrollment table at all. The point is that it does not need to be enumerated.
        expect(() => db.from("a_table_added_next_quarter").insert({ x: 1 })).toThrow(PreviewWriteRefused);
        expect(calls.filter((c) => c.startsWith("INSERT"))).toHaveLength(0);
    });

    it.each([
        ["documents", "insert"],
        ["processing_cases", "insert"],
        ["persons", "update"],
        ["customer_members", "update"],
        ["process_instances", "update"],
        ["communications", "insert"],
    ] as const)("refuses %s.%s", (table, verb) => {
        const h = holder();
        const { client, calls } = realClientThatMustNotBeUsedForWrites();
        const db = createEphemeralParticipantClient(client as never, h);

        const t = db.from(table) as unknown as Record<string, (arg: unknown) => unknown>;
        expect(() => t[verb]({ any: "payload" })).toThrow(PreviewWriteRefused);
        expect(calls.some((c) => c.startsWith(verb.toUpperCase()))).toBe(false);
    });

    it("refuses storage uploads — a preview file in a real bucket is a real consequence", () => {
        const h = holder();
        const { client } = realClientThatMustNotBeUsedForWrites();
        const db = createEphemeralParticipantClient(client as never, h);

        expect(() => db.storage.from("org_documents").upload("x.pdf", new Blob())).toThrow(PreviewWriteRefused);
    });

    it("still refuses INSERT on the session table itself — preview never creates a session", () => {
        const h = holder();
        const { client } = realClientThatMustNotBeUsedForWrites();
        const db = createEphemeralParticipantClient(client as never, h);

        expect(() => db.from("form_packet_sessions").insert({ id: "nope" })).toThrow(PreviewWriteRefused);
    });

    it("names the mutable tables explicitly, so growth is measured rather than assumed", () => {
        expect([...EPHEMERAL_TABLES]).toEqual([
            "form_packet_sessions",
            "form_packet_session_items",
            "form_submissions",
        ]);
    });
});

describe("reads still reach the real client", () => {
    it("passes a read of a non-ephemeral table straight through", async () => {
        const h = holder();
        const { client, calls } = realClientThatMustNotBeUsedForWrites();
        const db = createEphemeralParticipantClient(client as never, h);

        await db.from("form_definitions").select("*").eq("id", "f1").maybeSingle();

        // Preview shows the REAL published Form and the REAL Handbook; it just cannot change them.
        expect(calls).toContain("from:form_definitions");
    });
});
