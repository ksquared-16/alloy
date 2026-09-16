import type { SupabaseClient } from "@supabase/supabase-js";

import type { PacketSessionRow } from "@/lib/forms/packets/formPacketService";

/**
 * The execution boundary that lets the REAL participant runtime run without operational consequence.
 *
 * ## Why this is a boundary and not a flag
 *
 * The rejected shape was `if (preview) don't write`, sprinkled through the runtime. It fails for a
 * reason worth stating: a participant turn is a read-modify-write of the session, so a suppressed
 * write does not produce a safe preview — it produces a runtime that reads back what it never
 * wrote and then behaves like no one had answered anything. Suppression breaks the conversation it
 * is trying to protect, and every new write site is a new place to forget.
 *
 * ## What the re-audit found
 *
 * The 2026-08 audit described ~59 persistence calls across ~18 files and concluded a whole
 * ParticipantSessionStore was required. That is no longer the shape of this code. Measured on the
 * current tree:
 *
 *   - every mutating runtime function already takes `supabase` as its FIRST parameter;
 *   - no file under `lib/enrollment/participantRuntime/` constructs a client of its own;
 *   - `selectNextParticipantTurn` and `answerParticipantQuestion` take no client at all — the
 *     conversation's decisions are already pure;
 *   - the conversation's entire mutable state is THREE tables — `form_packet_sessions` (the
 *     anchor, written by four runtime files through exactly five builder methods: from · select ·
 *     eq · maybeSingle · update), `form_packet_session_items` (the per-step version pinning written
 *     once at session realization) and `form_submissions` (the answers) — against dozens of tables
 *     it only ever reads.
 *
 * So the seam the old proposal would have built already exists: it is the client parameter. The
 * only thing missing was a client that keeps the session in memory. That is this file, and it is
 * why no ParticipantSessionStore is introduced — a narrower existing seam was available, and the
 * instruction to prefer one applies.
 *
 * ## The two rules
 *
 * 1. `form_packet_sessions` is served from, and written to, an in-memory row. The runtime's
 *    read-modify-write works exactly as it does in production, because the modify is real.
 * 2. EVERY OTHER TABLE IS READ-ONLY. Not by a deny-list of dangerous tables — by refusing every
 *    mutating verb on every other table. A table nobody thought of is refused by default, which is
 *    the only version of this that survives the runtime growing.
 *
 * Reads elsewhere pass straight through to the real client, which is the point: preview shows the
 * real published Form, the real Handbook, the real classifications, and the real canonical values
 * Alloy would already know — it simply cannot change any of them.
 */

/**
 * The tables a participant conversation MUTATES. Everything else it touches, it only reads.
 *
 * Kept as an explicit list because it is the thing to re-measure when the runtime grows: a new
 * mutable table that is not named here does not quietly become writable — it becomes REFUSED, and
 * the refusal names the table. Failing closed is what makes this a boundary rather than a policy.
 */
export const EPHEMERAL_TABLES = Object.freeze([
    "form_packet_sessions",
    "form_packet_session_items",
    "form_submissions",
] as const);

/** Holds the rows the conversation mutates, by table. The session row is the anchor. */
export type EphemeralSessionHolder = {
    row: PacketSessionRow;
    tables: Record<string, Record<string, unknown>[]>;
};

export class PreviewWriteRefused extends Error {
    constructor(table: string, verb: string) {
        super(
            `Preview refused a ${verb} on "${table}". Preview executes the participant runtime ` +
                `against ephemeral state and cannot write operational data.`,
        );
        this.name = "PreviewWriteRefused";
    }
}

const MUTATING_VERBS = ["insert", "update", "upsert", "delete"] as const;

/** A thenable builder whose filters are no-ops and whose result is the in-memory row. */
function sessionSelectBuilder(holder: EphemeralSessionHolder) {
    const result = { data: holder.row as unknown, error: null };
    const builder: Record<string, unknown> = {
        // Filters are accepted and ignored: there is exactly one session in a preview, so every
        // predicate the runtime applies to find "the current session" resolves to it.
        eq: () => builder,
        neq: () => builder,
        is: () => builder,
        in: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => result,
        single: async () => result,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [holder.row], error: null }).then(resolve),
    };
    return builder;
}

/** An update builder that merges into the in-memory row instead of the database. */
function sessionUpdateBuilder(holder: EphemeralSessionHolder, patch: Record<string, unknown>) {
    holder.row = { ...holder.row, ...(patch as Partial<PacketSessionRow>) };
    const result = { data: holder.row as unknown, error: null };
    const builder: Record<string, unknown> = {
        eq: () => builder,
        neq: () => builder,
        is: () => builder,
        in: () => builder,
        select: () => builder,
        maybeSingle: async () => result,
        single: async () => result,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
}

/**
 * The other ephemeral tables, held as plain rows.
 *
 * Filters are recorded and applied, unlike the session's, because these tables genuinely hold more
 * than one row and the runtime's predicates pick between them — a step's pinned version, a step's
 * submission. Emulating the filter is the difference between a preview that behaves like the
 * product and one that quietly answers about the wrong step.
 */
function ephemeralRowsBuilder(holder: EphemeralSessionHolder, table: string) {
    const all = (): Record<string, unknown>[] => (holder.tables[table] ??= []);
    const make = (filters: readonly (readonly [string, unknown])[], pending: Record<string, unknown> | null) => {
        const matching = () => all().filter((r) => filters.every(([col, val]) => r[col] === val));
        const apply = () => {
            const hit = matching();
            if (pending) for (const r of hit) Object.assign(r, pending);
            return hit;
        };
        const builder: Record<string, unknown> = {
            eq: (col: string, val: unknown) => make([...filters, [col, val] as const], pending),
            neq: () => builder,
            is: () => builder,
            in: () => builder,
            not: () => builder,
            order: () => builder,
            limit: () => builder,
            select: () => make(filters, pending),
            maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
            single: async () => ({ data: apply()[0] ?? null, error: null }),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: apply(), error: null }).then(resolve),
        };
        return builder;
    };
    const push = (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        for (const r of Array.isArray(rows) ? rows : [rows]) all().push({ ...r });
        return make([], null);
    };
    return {
        select: () => make([], null),
        update: (patch: Record<string, unknown>) => make([], patch),
        insert: push,
        upsert: push,
        delete: () => make([], null),
    };
}

/** Every mutating verb on every other table, refused. */
function readOnlyTable(real: SupabaseClient, table: string) {
    const passthrough = (real as unknown as { from: (t: string) => Record<string, unknown> }).from(table);
    return new Proxy(passthrough, {
        get(target, prop, receiver) {
            if (typeof prop === "string" && (MUTATING_VERBS as readonly string[]).includes(prop)) {
                return () => {
                    throw new PreviewWriteRefused(table, prop);
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    });
}

/**
 * The real client for everything it reads; memory for the one row the conversation writes; and a
 * refusal for every other write. Shaped as a SupabaseClient because that is what the runtime's
 * existing parameter already is — no runtime signature changes.
 */
export function createEphemeralParticipantClient(
    real: SupabaseClient,
    holder: EphemeralSessionHolder,
): SupabaseClient {
    return new Proxy(real, {
        get(target, prop, receiver) {
            if (prop === "from") {
                return (table: string) => {
                    if (!(EPHEMERAL_TABLES as readonly string[]).includes(table)) return readOnlyTable(target, table);
                    if (table === "form_packet_sessions") {
                        return {
                            select: () => sessionSelectBuilder(holder),
                            update: (patch: Record<string, unknown>) => sessionUpdateBuilder(holder, patch),
                            insert: () => {
                                throw new PreviewWriteRefused(table, "insert");
                            },
                            upsert: () => {
                                throw new PreviewWriteRefused(table, "upsert");
                            },
                            delete: () => {
                                throw new PreviewWriteRefused(table, "delete");
                            },
                        };
                    }
                    return ephemeralRowsBuilder(holder, table);
                };
            }
            /*
             * Storage is refused wholesale. An uploaded preview file would become a real object in
             * a real bucket, which is an operational consequence wearing a preview label — so the
             * upload control is represented honestly instead (see the preview surface).
             */
            if (prop === "storage") {
                return {
                    from: () => ({
                        upload: () => {
                            throw new PreviewWriteRefused("storage", "upload");
                        },
                        remove: () => {
                            throw new PreviewWriteRefused("storage", "remove");
                        },
                        createSignedUrl: (
                            ...args: unknown[]
                        ) =>
                            (target as unknown as { storage: { from: (b: string) => { createSignedUrl: (...a: unknown[]) => unknown } } })
                                .storage.from(String(args[0] ?? ""))
                                .createSignedUrl(...args.slice(1)),
                    }),
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    }) as SupabaseClient;
}
