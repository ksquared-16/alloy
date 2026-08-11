/**
 * A STOP from a sender Alloy owns the conversation with, but cannot identify.
 *
 * The ingress hold covers messages that belong to NO organization. This is the
 * middle case, and it had no coverage at all: the destination resolved to a
 * tenant so the message became canonical conversation truth, but the sender
 * matched no Person, so the keyword handler wrote no preference — correctly,
 * since preferences are owned per person and inventing one would opt out whoever
 * shares the number.
 *
 * Harmless while such conversations could not be answered. Block A made them
 * answerable, and browser certification then queued a reply to a number that had
 * texted STOP. These are the tests that would have caught it.
 *
 * `loadEligibilityContext` is driven over a fake PostgREST-shaped client so the
 * hold is proven end to end — the query filters included — rather than by
 * asserting on a boolean somebody else computed.
 */

import { describe, expect, it } from "vitest";

import { loadEligibilityContext } from "@/lib/communications/eligibility/loadEligibilityContext";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORG = "11111111-1111-1111-1111-111111111111";
const THEIR_NUMBER = "+15557770011";
const OUR_DESTINATION = "+15550001111";

type Row = Record<string, unknown>;
type Filter = { op: string; column: string; value: unknown };

function client(messages: Row[]): SupabaseClient {
    return {
        from(table: string) {
            const filters: Filter[] = [];
            let descending = false;
            const rows = (): Row[] => {
                if (table === "communication_messages") return messages;
                // Ingress deliberately empty: this case never produces one, and a
                // pass that came from the ingress hold would prove nothing.
                if (table === "communication_inbound_ingress") return [];
                return [];
            };
            const matches = (r: Row): boolean =>
                filters.every((f) => {
                    if (f.op === "eq") return String(r[f.column] ?? "") === String(f.value ?? "");
                    if (f.op === "not_null") {
                        const md = r.metadata as Record<string, unknown> | null | undefined;
                        return md?.compliance_keyword != null;
                    }
                    if (f.op === "is_null") return r[f.column] == null;
                    return true;
                });
            const result = () => {
                const list = rows().filter(matches);
                list.sort((a, b) => {
                    const av = String(a.created_at ?? "");
                    const bv = String(b.created_at ?? "");
                    return descending ? (av < bv ? 1 : -1) : av < bv ? -1 : 1;
                });
                return { data: list, error: null };
            };
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: (column: string, value: unknown) => {
                    filters.push({ op: "eq", column, value });
                    return builder;
                },
                is: (column: string) => {
                    filters.push({ op: "is_null", column, value: null });
                    return builder;
                },
                not: (column: string) => {
                    filters.push({ op: "not_null", column, value: null });
                    return builder;
                },
                order: (_c: string, o?: { ascending?: boolean }) => {
                    descending = o?.ascending === false;
                    return builder;
                },
                limit: () => builder,
                maybeSingle: () => Promise.resolve({ data: result().data[0] ?? null, error: null }),
                then: (f: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve(result()).then(f),
            };
            return builder;
        },
    } as unknown as SupabaseClient;
}

function inbound(body: string, keyword: string | null, createdAt: string): Row {
    return {
        direction: "inbound",
        channel: "sms",
        from_address: THEIR_NUMBER,
        to_address: OUR_DESTINATION,
        body,
        created_at: createdAt,
        metadata: keyword ? { compliance_keyword: keyword } : {},
    };
}

async function holdFor(messages: Row[]) {
    const ctx = await loadEligibilityContext({
        supabase: client(messages),
        orgId: ORG,
        personId: null,
        category: "operational",
        channel: "sms",
        toAddress: THEIR_NUMBER,
        fromAddress: OUR_DESTINATION,
    });
    return ctx.unresolvedInboundStopHold;
}

describe("STOP from an unidentified sender on a conversation we own", () => {
    it("holds sending to that endpoint", async () => {
        expect(await holdFor([inbound("STOP", "stop", "2026-08-11T10:00:00.000Z")])).toBe(true);
    });

    it("does not hold when the sender never sent a keyword", async () => {
        expect(await holdFor([inbound("Do you have openings?", null, "2026-08-11T10:00:00.000Z")])).toBe(false);
    });

    it("is released by a later START — the parent's own word, not an operator override", async () => {
        expect(
            await holdFor([
                inbound("STOP", "stop", "2026-08-11T10:00:00.000Z"),
                inbound("START", "start", "2026-08-11T11:00:00.000Z"),
            ])
        ).toBe(false);
    });

    it("re-applies when they STOP again after starting", async () => {
        expect(
            await holdFor([
                inbound("STOP", "stop", "2026-08-11T10:00:00.000Z"),
                inbound("START", "start", "2026-08-11T11:00:00.000Z"),
                inbound("STOP", "stop", "2026-08-11T12:00:00.000Z"),
            ])
        ).toBe(true);
    });

    it("does not hold on HELP, which changes nothing", async () => {
        expect(await holdFor([inbound("HELP", "help", "2026-08-11T10:00:00.000Z")])).toBe(false);
    });

    it("is scoped to the endpoint pair, not the number everywhere", async () => {
        const otherDestination = { ...inbound("STOP", "stop", "2026-08-11T10:00:00.000Z"), to_address: "+15559990000" };
        expect(await holdFor([otherDestination])).toBe(false);
    });

    it("is scoped to the sender, not to everyone who wrote to that destination", async () => {
        const otherSender = { ...inbound("STOP", "stop", "2026-08-11T10:00:00.000Z"), from_address: "+15551112222" };
        expect(await holdFor([otherSender])).toBe(false);
    });
});
