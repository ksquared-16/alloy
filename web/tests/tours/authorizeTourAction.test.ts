/**
 * Interactive Tour Invitation — Slice C: public action authorization.
 *
 * Behavioural: every case drives the real `authorizeTourAction` against a fake
 * Supabase. The claims under test are the four gaps this slice closes —
 * recipient scoping, action-family scoping, consumption, and invitation
 * ownership — plus the rule that no failure reveals which check failed.
 */
import { describe, expect, it, vi } from "vitest";

import {
    TOUR_ACTION_CAPABILITY,
    TOUR_ACTION_KINDS,
    TOUR_ACTION_REUSE,
    authorizeTourAction,
    consumeTourAction,
    type TourActionKind,
} from "@/lib/tours/public/authorizeTourAction";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_ORG = "bbbbbbbb-0000-4000-8000-000000000002";
const PERSON = "11111111-0000-4000-8000-00000000000a";
const OTHER_PERSON = "11111111-0000-4000-8000-00000000000b";
const OPP = "22222222-0000-4000-8000-00000000000c";
const LOC = "33333333-0000-4000-8000-00000000000d";
const INV = "44444444-0000-4000-8000-00000000000e";

const link = (over: Record<string, unknown> = {}) => ({
    id: "link-1",
    org_id: ORG,
    opportunity_id: OPP,
    location_id: LOC,
    invitation_id: INV,
    recipient_person_id: PERSON,
    action_kind: "select_tour_slot",
    booking_id: null,
    consumed_at: null,
    revoked_at: null,
    use_count: 0,
    max_uses: null,
    is_active: true,
    expires_at: null,
    authorization_model: "scoped",
    ...over,
});

const invitation = (over: Record<string, unknown> = {}) => ({
    id: INV,
    org_id: ORG,
    recipient_person_id: PERSON,
    opportunity_id: OPP,
    location_id: LOC,
    status: "active",
    expires_at: null,
    revoked_at: null,
    conversation_thread_id: null,
    option_snapshot: {},
    ...over,
});

function supa(opts: { link?: Record<string, unknown> | null; invitation?: Record<string, unknown> | null } = {}) {
    return {
        from: (table: string) => {
            const b: Record<string, unknown> = {
                select: () => b,
                eq: () => b,
                maybeSingle: async () =>
                    table === "tour_invitations"
                        ? { data: opts.invitation === undefined ? invitation() : opts.invitation, error: null }
                        : { data: opts.link === undefined ? link() : opts.link, error: null },
            };
            return b;
        },
    } as never;
}

const auth = (over: { link?: Record<string, unknown> | null; invitation?: Record<string, unknown> | null } = {}, required: TourActionKind = "select_tour_slot") =>
    authorizeTourAction({ supabase: supa(over), plaintextToken: "tok", requiredAction: required });

describe("no omnipotent token — one kind, one capability", () => {
    it("covers every action kind", () => {
        for (const k of TOUR_ACTION_KINDS) expect(TOUR_ACTION_CAPABILITY[k], k).toBeDefined();
    });

    it("only select_tour_slot may book", () => {
        const bookers = TOUR_ACTION_KINDS.filter((k) => TOUR_ACTION_CAPABILITY[k].books);
        expect(bookers).toEqual(["select_tour_slot"]);
    });

    it("only cancel_tour may cancel and only reschedule_tour may reschedule", () => {
        expect(TOUR_ACTION_KINDS.filter((k) => TOUR_ACTION_CAPABILITY[k].cancels)).toEqual(["cancel_tour"]);
        expect(TOUR_ACTION_KINDS.filter((k) => TOUR_ACTION_CAPABILITY[k].reschedules)).toEqual(["reschedule_tour"]);
    });

    it("view_tour_details is read-only", () => {
        const c = TOUR_ACTION_CAPABILITY.view_tour_details;
        expect([c.books, c.declines, c.confirms, c.reschedules, c.cancels]).toEqual([false, false, false, false, false]);
    });

    it("makes the consequential actions single-use and the viewing actions reusable", () => {
        expect(TOUR_ACTION_REUSE.select_tour_slot).toBe("single_use");
        expect(TOUR_ACTION_REUSE.decline_tour).toBe("single_use");
        expect(TOUR_ACTION_REUSE.cancel_tour).toBe("single_use");
        expect(TOUR_ACTION_REUSE.view_tour_slots).toBe("reusable");
        expect(TOUR_ACTION_REUSE.view_tour_details).toBe("reusable");
    });
});

describe("valid authorization", () => {
    it("authorizes a fully scoped link for its own action", async () => {
        const r = await auth();
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.actionKind).toBe("select_tour_slot");
        expect(r.capability.books).toBe(true);
        expect(r.invitation.id).toBe(INV);
    });

    it("still authorizes once the invitation is booked, so a repeat click can show the booking", async () => {
        const r = await auth({ invitation: invitation({ status: "booked" }) });
        expect(r.ok).toBe(true);
    });
});

describe("action-family scoping — a payload cannot widen authority", () => {
    it("refuses a booking token used on a cancel endpoint", async () => {
        const r = await auth({}, "cancel_tour");
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("wrong_action");
    });

    it("refuses a reschedule token used to cancel", async () => {
        const r = await auth({ link: link({ action_kind: "reschedule_tour" }) }, "cancel_tour");
        expect((r as { code?: string }).code).toBe("wrong_action");
    });

    it("refuses a cancel token used to reschedule", async () => {
        const r = await auth({ link: link({ action_kind: "cancel_tour" }) }, "reschedule_tour");
        expect((r as { code?: string }).code).toBe("wrong_action");
    });

    it("refuses a view token used to book", async () => {
        const r = await auth({ link: link({ action_kind: "view_tour_slots" }) }, "select_tour_slot");
        expect((r as { code?: string }).code).toBe("wrong_action");
    });
});

describe("recipient scoping — the gap this slice exists to close", () => {
    it("refuses when the link and invitation name different people", async () => {
        const r = await auth({ link: link({ recipient_person_id: OTHER_PERSON }) });
        expect((r as { code?: string }).code).toBe("recipient_mismatch");
    });

    it("refuses a link with no recipient at all", async () => {
        const r = await auth({ link: link({ recipient_person_id: null }) });
        expect((r as { code?: string }).code).toBe("legacy_unscoped");
    });
});

describe("context scoping", () => {
    it("refuses cross-org", async () => {
        const r = await auth({ link: link({ org_id: OTHER_ORG }) });
        expect((r as { code?: string }).code).toBe("context_mismatch");
    });

    it("refuses cross-location", async () => {
        const r = await auth({ link: link({ location_id: "99999999-0000-4000-8000-000000000099" }) });
        expect((r as { code?: string }).code).toBe("context_mismatch");
    });

    it("refuses cross-opportunity", async () => {
        const r = await auth({ link: link({ opportunity_id: "99999999-0000-4000-8000-000000000098" }) });
        expect((r as { code?: string }).code).toBe("context_mismatch");
    });
});

describe("lifecycle", () => {
    it("refuses an unknown or tampered token", async () => {
        const r = await auth({ link: null });
        expect((r as { code?: string }).code).toBe("invalid");
    });

    it("refuses an expired link and an expired invitation", async () => {
        const past = new Date(Date.now() - 60_000).toISOString();
        expect(((await auth({ link: link({ expires_at: past }) })) as { code?: string }).code).toBe("expired");
        expect(((await auth({ invitation: invitation({ expires_at: past }) })) as { code?: string }).code).toBe("expired");
    });

    it("refuses a revoked link, an inactive link, and a revoked invitation", async () => {
        const now = new Date().toISOString();
        expect(((await auth({ link: link({ revoked_at: now }) })) as { code?: string }).code).toBe("revoked");
        expect(((await auth({ link: link({ is_active: false }) })) as { code?: string }).code).toBe("revoked");
        expect(((await auth({ invitation: invitation({ revoked_at: now }) })) as { code?: string }).code).toBe("revoked");
    });

    it("refuses a consumed single-use action", async () => {
        const r = await auth({ link: link({ consumed_at: new Date().toISOString() }) });
        expect((r as { code?: string }).code).toBe("consumed");
    });

    it("does NOT refuse a consumed reusable action", async () => {
        const r = await auth(
            { link: link({ action_kind: "view_tour_slots", consumed_at: new Date().toISOString() }) },
            "view_tour_slots"
        );
        expect(r.ok).toBe(true);
    });

    it("refuses a reusable action past its use budget", async () => {
        const r = await auth(
            { link: link({ action_kind: "view_tour_slots", use_count: 5, max_uses: 5 }) },
            "view_tour_slots"
        );
        expect((r as { code?: string }).code).toBe("consumed");
    });

    it("refuses a declined or superseded invitation", async () => {
        for (const status of ["declined", "expired", "revoked", "superseded", "draft"]) {
            const r = await auth({ invitation: invitation({ status }) });
            expect(r.ok, status).toBe(false);
        }
    });
});

describe("legacy links fail closed", () => {
    it("refuses a pre-Slice-C unscoped link rather than guessing its recipient", async () => {
        const r = await auth({
            link: link({ authorization_model: "legacy_unscoped", invitation_id: null, recipient_person_id: null, action_kind: null }),
        });
        expect((r as { code?: string }).code).toBe("legacy_unscoped");
        expect((r as { message?: string }).message).toMatch(/ask for a new one/i);
    });
});

describe("failures reveal nothing", () => {
    it("uses one indistinguishable message for every forgery-shaped failure", async () => {
        const cases = await Promise.all([
            auth({ link: null }),
            auth({ link: link({ recipient_person_id: OTHER_PERSON }) }),
            auth({ link: link({ org_id: OTHER_ORG }) }),
            auth({}, "cancel_tour"),
        ]);
        const messages = new Set(cases.map((c) => (c as { message?: string }).message));
        // A different message per failure would be an oracle telling an attacker
        // which part of their guess was wrong.
        expect(messages.size).toBe(1);
        expect([...messages][0]).toBe("This link is no longer valid.");
    });

    it("never echoes an internal identifier", async () => {
        const r = await auth({ link: link({ org_id: OTHER_ORG }) });
        const s = JSON.stringify(r);
        for (const id of [ORG, OTHER_ORG, PERSON, OPP, LOC, INV]) expect(s).not.toContain(id);
    });

    it("never echoes the token", async () => {
        const r = await authorizeTourAction({
            supabase: supa({ link: null }),
            plaintextToken: "super-secret-token-value",
            requiredAction: "select_tour_slot",
        });
        expect(JSON.stringify(r)).not.toContain("super-secret-token-value");
    });
});

describe("consumption is concurrency-safe", () => {
    it("consumes only when not already consumed — the losing racer gets false", async () => {
        const calls: string[] = [];
        const sb = {
            from: () => {
                const b: Record<string, unknown> = {
                    update: () => b,
                    eq: () => b,
                    is: (col: string) => {
                        calls.push(col);
                        return b;
                    },
                    select: () => b,
                    maybeSingle: async () => ({ data: null, error: null }),
                };
                return b;
            },
        } as never;
        const r = await consumeTourAction({ supabase: sb, linkId: "link-1" });
        // The conditional predicate IS the concurrency control.
        expect(calls).toContain("consumed_at");
        expect(r.consumed).toBe(false);
    });

    it("reports consumed when the conditional update wins", async () => {
        const sb = {
            from: () => {
                const b: Record<string, unknown> = {
                    update: () => b,
                    eq: () => b,
                    is: () => b,
                    select: () => b,
                    maybeSingle: async () => ({ data: { id: "link-1" }, error: null }),
                };
                return b;
            },
        } as never;
        expect((await consumeTourAction({ supabase: sb, linkId: "link-1", bookingId: "bk-1" })).consumed).toBe(true);
    });
});
