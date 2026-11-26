/**
 * Behavioural certification for the canonical tour invitation + action minting
 * service — Slice C.
 *
 * This drives the REAL service. Only the database and the event recorder are
 * doubled, so what is certified here is the service's own ordering, scoping and
 * compensation decisions rather than a restatement of them.
 *
 * The fake database deliberately does NOT enforce the migration's CHECK
 * constraint. That constraint is certified directly against Postgres in the
 * isolated stack; duplicating it here would let a hand-written approximation of
 * it stand in for the real one.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    mintTourInvitation,
    mintActionsFor,
    supersedeTourInvitation,
    invitationFingerprint,
    INITIAL_ACTION_KINDS,
    POST_BOOKING_ACTION_KINDS,
} from "@/lib/tours/invitation/mintTourInvitation";
import { TOUR_ACTION_KINDS, TOUR_ACTION_REUSE } from "@/lib/tours/public/authorizeTourAction";
import type { TourInvitationContent, TourOption } from "@/lib/tours/invitation/tourInvitationContent";

const eventMock = vi.fn();
vi.mock("@/lib/tours/events/recordTourEvent", () => ({
    recordTourEvent: (...a: unknown[]) => eventMock(...a),
}));

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSON = "11111111-0000-4000-8000-00000000000a";
const OPP = "22222222-0000-4000-8000-00000000000c";
const LOC = "33333333-0000-4000-8000-00000000000d";
const THREAD = "44444444-0000-4000-8000-00000000000e";

type Insert = { table: string; row: Record<string, unknown> };
type Update = { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> };

type State = {
    inserts: Insert[];
    updates: Update[];
    /** Pre-existing invitation returned by the idempotency probe, if any. */
    prior: Record<string, unknown> | null;
    /** Fail the Nth link insert (1-based) to exercise compensation. */
    failLinkInsertAt: number | null;
    failInvitationInsert: boolean;
    failActivation: boolean;
};

let state: State;
let linkInsertCount: number;

const option = (over: Partial<TourOption> = {}): TourOption => ({
    optionId: "opt-1",
    date: "2026-08-10",
    startTime: "09:00",
    timezone: "America/Los_Angeles",
    locationId: LOC,
    locationLabel: "North Campus",
    availabilityRef: "rule-1:2026-08-10T09:00",
    presentationLabel: "Monday, August 10 \u00b7 9:00 AM",
    actionKind: "select_tour_slot",
    ...over,
});

const content = (over: Partial<TourInvitationContent> = {}): TourInvitationContent => ({
    kind: "tour_invitation",
    text: "We'd love to show you around.",
    options: [option(), option({ optionId: "opt-2", startTime: "11:30", presentationLabel: "Monday, August 10 \u00b7 11:30 AM" })],
    primaryAction: { kind: "select_tour_slot", label: "Choose this time", actionRef: "act-select" },
    secondaryAction: { kind: "view_more_tour_slots", label: "More dates and times", actionRef: "act-more" },
    fallbackActionUrl: "https://alloy.example/tour-booking/abc123",
    expiresAt: null,
    ...over,
});

/**
 * Minimal Supabase double. Builders are thenable so bulk updates awaited without
 * `.maybeSingle()` are still captured.
 */
function fakeSupabase() {
    const build = (table: string) => {
        const filters: Record<string, unknown> = {};
        let mode: "select" | "insert" | "update" = "select";
        let row: Record<string, unknown> | null = null;
        let patch: Record<string, unknown> | null = null;

        const settle = () => {
            if (mode === "insert") {
                if (table === "tour_invitations") {
                    if (state.failInvitationInsert) return { data: null, error: { message: "insert failed" } };
                    state.inserts.push({ table, row: row! });
                    return { data: { id: "invitation-1" }, error: null };
                }
                linkInsertCount += 1;
                if (state.failLinkInsertAt === linkInsertCount) {
                    return { data: null, error: { message: "link insert failed" } };
                }
                state.inserts.push({ table, row: row! });
                return { data: { id: `link-${linkInsertCount}` }, error: null };
            }
            if (mode === "update") {
                const isActivation = table === "tour_invitations" && patch?.status === "active";
                if (isActivation && state.failActivation) return { data: null, error: { message: "activation failed" } };
                state.updates.push({ table, patch: patch!, filters: { ...filters } });
                return { data: { id: "invitation-1" }, error: null };
            }
            // select: only the idempotency probe reads.
            return { data: state.prior, error: null };
        };

        const api: Record<string, unknown> = {
            select: () => api,
            insert: (r: Record<string, unknown>) => {
                mode = "insert";
                row = r;
                return api;
            },
            update: (p: Record<string, unknown>) => {
                mode = "update";
                patch = p;
                return api;
            },
            eq: (k: string, v: unknown) => {
                filters[k] = v;
                return api;
            },
            neq: (k: string, v: unknown) => {
                filters[`neq:${k}`] = v;
                return api;
            },
            in: (k: string, v: unknown) => {
                filters[`in:${k}`] = v;
                return api;
            },
            is: (k: string, v: unknown) => {
                filters[`is:${k}`] = v;
                return api;
            },
            order: () => api,
            limit: () => api,
            maybeSingle: async () => settle(),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
        };
        return api;
    };

    return { from: (table: string) => build(table) } as never;
}

function linkRows(): Array<Record<string, unknown>> {
    return state.inserts.filter((i) => i.table === "tour_public_booking_links").map((i) => i.row);
}

function invitationRow(): Record<string, unknown> | undefined {
    return state.inserts.find((i) => i.table === "tour_invitations")?.row;
}

async function mint(over: Record<string, unknown> = {}) {
    return mintTourInvitation({
        supabase: fakeSupabase(),
        orgId: ORG,
        recipientPersonId: PERSON,
        opportunityId: OPP,
        locationId: LOC,
        conversationThreadId: THREAD,
        content: content(),
        idempotencyKey: "key-1",
        ...over,
    } as never);
}

beforeEach(() => {
    eventMock.mockReset();
    eventMock.mockResolvedValue({ recorded: true });
    linkInsertCount = 0;
    state = {
        inserts: [],
        updates: [],
        prior: null,
        failLinkInsertAt: null,
        failInvitationInsert: false,
        failActivation: false,
    };
});

// ------------------------------------------------------------ happy path ---
describe("mintTourInvitation — the canonical offer", () => {
    it("creates one invitation bound to a named recipient", async () => {
        const r = await mint();
        expect(r.ok).toBe(true);

        const inv = invitationRow()!;
        expect(inv.org_id).toBe(ORG);
        // The recipient binding is the whole point of Slice C.
        expect(inv.recipient_person_id).toBe(PERSON);
        expect(inv.opportunity_id).toBe(OPP);
        expect(inv.location_id).toBe(LOC);
        expect(inv.conversation_thread_id).toBe(THREAD);
    });

    it("writes the invitation as draft first and activates only afterwards", async () => {
        await mint();
        expect(invitationRow()!.status).toBe("draft");

        const activation = state.updates.find((u) => u.patch.status === "active");
        expect(activation).toBeTruthy();
        // Guarded activation: only a still-draft row may become active, so a
        // concurrent revoke cannot be overwritten.
        expect(activation!.filters.status).toBe("draft");
    });

    it("mints every initial action and nothing beyond them", async () => {
        await mint();
        const kinds = linkRows().map((r) => r.action_kind);
        expect(kinds.sort()).toEqual([...INITIAL_ACTION_KINDS].sort());
    });

    it("does NOT mint cancel_tour on an initial invitation", async () => {
        await mint();
        expect(linkRows().map((r) => r.action_kind)).not.toContain("cancel_tour");
    });

    it("returns one raw token per minted action", async () => {
        const r = await mint();
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.actions).toHaveLength(INITIAL_ACTION_KINDS.length);
        expect(r.actions.every((a) => typeof a.rawToken === "string" && a.rawToken.length >= 32)).toBe(true);
    });

    it("records creation and activation events", async () => {
        await mint();
        const events = eventMock.mock.calls.map((c) => (c[1] as { event: string }).event);
        expect(events).toContain("tour_invitation_created");
        expect(events).toContain("tour_invitation_activated");
    });
});

// ------------------------------------------------------- token discipline ---
describe("token discipline", () => {
    it("issues a DISTINCT token per action kind", async () => {
        const r = await mint();
        if (!r.ok) return;
        const raw = r.actions.map((a) => a.rawToken);
        // One token spanning several kinds is exactly the omnipotent credential
        // this design forbids.
        expect(new Set(raw).size).toBe(raw.length);
    });

    it("never persists a raw token", async () => {
        const r = await mint();
        if (!r.ok) return;
        const raw = new Set(r.actions.map((a) => a.rawToken));
        const serialized = JSON.stringify(state.inserts);
        for (const t of raw) expect(serialized).not.toContain(t);
    });

    it("stores a hash and only a short prefix", async () => {
        const r = await mint();
        if (!r.ok) return;
        for (const row of linkRows()) {
            expect(typeof row.token_hash).toBe("string");
            expect(String(row.token_hash).length).toBeGreaterThanOrEqual(32);
            expect(String(row.token_prefix).length).toBeLessThanOrEqual(12);
        }
        // A stored prefix must not be long enough to be a credential itself.
        const prefixes = linkRows().map((row) => String(row.token_prefix));
        expect(prefixes.every((p) => !r.actions.some((a) => a.rawToken === p))).toBe(true);
    });

    it("never places a raw token in an event payload", async () => {
        const r = await mint();
        if (!r.ok) return;
        const payloads = JSON.stringify(eventMock.mock.calls);
        for (const a of r.actions) expect(payloads).not.toContain(a.rawToken);
    });

    it("produces different tokens across two separate mints", async () => {
        const a = await mint();
        state.inserts = [];
        linkInsertCount = 0;
        const b = await mint({ idempotencyKey: "key-2" });
        if (!a.ok || !b.ok) return;
        const overlap = a.actions.map((x) => x.rawToken).filter((t) => b.actions.some((y) => y.rawToken === t));
        expect(overlap).toEqual([]);
    });
});

// ------------------------------------------------------------- scoping ---
describe("every minted link is fully scoped", () => {
    it("writes authorization_model scoped with complete authority", async () => {
        await mint();
        for (const row of linkRows()) {
            // These four together are what the database CHECK requires; the
            // service must never emit a partially scoped row.
            expect(row.authorization_model).toBe("scoped");
            expect(row.invitation_id).toBe("invitation-1");
            expect(row.recipient_person_id).toBe(PERSON);
            expect(TOUR_ACTION_KINDS).toContain(row.action_kind);
        }
    });

    it("carries org, opportunity and location on every link", async () => {
        await mint();
        for (const row of linkRows()) {
            expect(row.org_id).toBe(ORG);
            expect(row.opportunity_id).toBe(OPP);
            expect(row.location_id).toBe(LOC);
        }
    });

    it("leaves booking_id null before a booking exists", async () => {
        await mint();
        for (const row of linkRows()) expect(row.booking_id).toBeNull();
    });

    it("starts every link unconsumed, active and at zero uses", async () => {
        await mint();
        for (const row of linkRows()) {
            expect(row.is_active).toBe(true);
            expect(row.use_count).toBe(0);
            expect(row.consumed_at ?? null).toBeNull();
        }
    });

    it("gives a reuse budget only to reusable kinds", async () => {
        await mint();
        for (const row of linkRows()) {
            const kind = row.action_kind as keyof typeof TOUR_ACTION_REUSE;
            if (TOUR_ACTION_REUSE[kind] === "single_use") {
                // Single-use is enforced by consumed_at, so a max_uses budget
                // would be a second, weaker gate.
                expect(row.max_uses ?? null).toBeNull();
            } else {
                expect(typeof row.max_uses).toBe("number");
                expect(row.max_uses as number).toBeGreaterThan(0);
            }
        }
    });

    it("propagates the invitation expiry to every action", async () => {
        const expires = "2026-08-20T00:00:00.000Z";
        await mint({ expiresAt: expires });
        expect(invitationRow()!.expires_at).toBe(expires);
        for (const row of linkRows()) expect(row.expires_at).toBe(expires);
    });
});

// ---------------------------------------------------------- idempotency ---
describe("idempotency", () => {
    it("refuses a mint with no idempotency key", async () => {
        const r = await mint({ idempotencyKey: "  " });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("missing_idempotency_key");
        expect(state.inserts).toEqual([]);
    });

    it("stores the key and the offer fingerprint", async () => {
        await mint();
        const meta = invitationRow()!.metadata as Record<string, unknown>;
        expect(meta.idempotency_key).toBe("key-1");
        expect(meta.idempotency_fingerprint).toBe(
            invitationFingerprint({
                recipientPersonId: PERSON,
                opportunityId: OPP,
                locationId: LOC,
                optionIds: ["opt-1", "opt-2"],
            })
        );
    });

    it("returns the prior invitation on replay WITHOUT creating a second", async () => {
        const fingerprint = invitationFingerprint({
            recipientPersonId: PERSON,
            opportunityId: OPP,
            locationId: LOC,
            optionIds: ["opt-1", "opt-2"],
        });
        state.prior = { id: "invitation-prior", status: "active", metadata: { idempotency_fingerprint: fingerprint } };

        const r = await mint();
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.invitationId).toBe("invitation-prior");
        expect(r.idempotentReplay).toBe(true);
        // Two invitations for one offer is two competing bookings.
        expect(state.inserts).toEqual([]);
    });

    it("returns no raw tokens on replay, because hashes are one-way", async () => {
        state.prior = {
            id: "invitation-prior",
            status: "active",
            metadata: {
                idempotency_fingerprint: invitationFingerprint({
                    recipientPersonId: PERSON,
                    opportunityId: OPP,
                    locationId: LOC,
                    optionIds: ["opt-1", "opt-2"],
                }),
            },
        };
        const r = await mint();
        if (!r.ok) return;
        // Accepted limitation, documented on the service: a caller needing new
        // URLs supersedes and reissues rather than weakening token storage.
        expect(r.actions).toEqual([]);
    });

    it("supersedes and mints fresh when the recipient changed under the same key", async () => {
        state.prior = {
            id: "invitation-prior",
            status: "active",
            metadata: {
                idempotency_fingerprint: invitationFingerprint({
                    recipientPersonId: "someone-else",
                    opportunityId: OPP,
                    locationId: LOC,
                    optionIds: ["opt-1", "opt-2"],
                }),
            },
        };
        const r = await mint();
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.idempotentReplay).toBe(false);
        expect(r.actions.length).toBeGreaterThan(0);
        expect(state.updates.some((u) => u.table === "tour_invitations" && u.patch.status === "superseded")).toBe(
            true,
        );
    });

    it("supersedes and mints fresh when the offered times changed under the same key", async () => {
        state.prior = {
            id: "invitation-prior",
            status: "active",
            metadata: {
                idempotency_fingerprint: invitationFingerprint({
                    recipientPersonId: PERSON,
                    opportunityId: OPP,
                    locationId: LOC,
                    optionIds: ["opt-9"],
                }),
            },
        };
        const r = await mint();
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.idempotentReplay).toBe(false);
        expect(r.actions.length).toBeGreaterThan(0);
        // Prior offer must stop being actionable.
        expect(state.updates.some((u) => u.table === "tour_invitations" && u.patch.status === "superseded")).toBe(
            true,
        );
        expect(invitationRow()).toBeTruthy();
    });

    it("mints fresh when the prior invitation under the key is past expires_at", async () => {
        state.prior = {
            id: "invitation-elapsed",
            status: "active",
            expires_at: "2020-01-01T00:00:00Z",
            metadata: {
                idempotency_fingerprint: invitationFingerprint({
                    recipientPersonId: PERSON,
                    opportunityId: OPP,
                    locationId: LOC,
                    optionIds: ["opt-1", "opt-2"],
                }),
            },
        };
        const r = await mint();
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.idempotentReplay).toBe(false);
        expect(r.actions.length).toBeGreaterThan(0);
        expect(invitationRow()).toBeTruthy();
    });

    it("treats option order as irrelevant to the fingerprint", () => {
        const a = invitationFingerprint({ recipientPersonId: PERSON, opportunityId: OPP, locationId: LOC, optionIds: ["b", "a"] });
        const b = invitationFingerprint({ recipientPersonId: PERSON, opportunityId: OPP, locationId: LOC, optionIds: ["a", "b"] });
        expect(a).toBe(b);
    });

    it("distinguishes location, so the same times elsewhere is a new offer", () => {
        const a = invitationFingerprint({ recipientPersonId: PERSON, opportunityId: OPP, locationId: LOC, optionIds: ["a"] });
        const b = invitationFingerprint({ recipientPersonId: PERSON, opportunityId: OPP, locationId: "other", optionIds: ["a"] });
        expect(a).not.toBe(b);
    });
});

// --------------------------------------------------------- compensation ---
describe("failure compensation", () => {
    it("revokes the draft when an action mint fails partway", async () => {
        state.failLinkInsertAt = 2;
        const r = await mint();
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("action_mint_failed");

        // The invitation must not be left looking activatable with a partial
        // action set.
        const revoke = state.updates.find((u) => u.patch.status === "revoked");
        expect(revoke).toBeTruthy();
        expect(revoke!.patch.revoked_at).toBeTruthy();
        // And it was never activated.
        expect(state.updates.some((u) => u.patch.status === "active")).toBe(false);
    });

    it("reports a failed invitation insert without minting any action", async () => {
        state.failInvitationInsert = true;
        const r = await mint();
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("invitation_create_failed");
        expect(linkRows()).toEqual([]);
    });

    it("reports a failed activation rather than claiming success", async () => {
        state.failActivation = true;
        const r = await mint();
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("activation_failed");
    });

    it("does not announce activation when activation failed", async () => {
        state.failActivation = true;
        await mint();
        const events = eventMock.mock.calls.map((c) => (c[1] as { event: string }).event);
        expect(events).not.toContain("tour_invitation_activated");
    });
});

// ------------------------------------------------------ content validation ---
describe("content validation happens before anything is written", () => {
    it("refuses an invitation with no options", async () => {
        const r = await mint({ content: content({ options: [] }) });
        expect(r.ok).toBe(false);
        expect(state.inserts).toEqual([]);
    });

    it("validates before consulting the idempotency record", async () => {
        state.prior = { id: "invitation-prior", status: "active", metadata: {} };
        const r = await mint({ content: content({ options: [] }) });
        // Invalid content must not be reported as an idempotency conflict.
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).not.toBe("idempotency_payload_changed");
    });
});

// -------------------------------------------------------- post-booking ---
describe("mintActionsFor — post-booking actions", () => {
    async function mintPost(over: Record<string, unknown> = {}) {
        return mintActionsFor({
            supabase: fakeSupabase(),
            orgId: ORG,
            invitationId: "invitation-1",
            recipientPersonId: PERSON,
            opportunityId: OPP,
            locationId: LOC,
            expiresAt: null,
            kinds: POST_BOOKING_ACTION_KINDS,
            bookingId: "booking-1",
            ...over,
        } as never);
    }

    it("binds every post-booking action to the booking", async () => {
        const r = await mintPost();
        expect(r.ok).toBe(true);
        for (const row of linkRows()) expect(row.booking_id).toBe("booking-1");
    });

    it("mints view, confirm and reschedule but never cancel", async () => {
        await mintPost();
        const kinds = linkRows().map((r) => r.action_kind);
        expect(kinds.sort()).toEqual([...POST_BOOKING_ACTION_KINDS].sort());
        // Cancellation is consequential: its credential is minted only when the
        // recipient explicitly enters the bounded cancellation flow.
        expect(kinds).not.toContain("cancel_tour");
    });

    it("keeps post-booking links scoped and recipient-bound", async () => {
        await mintPost();
        for (const row of linkRows()) {
            expect(row.authorization_model).toBe("scoped");
            expect(row.recipient_person_id).toBe(PERSON);
            expect(row.invitation_id).toBe("invitation-1");
        }
    });

    it("reports failure rather than returning a partial action set", async () => {
        state.failLinkInsertAt = 2;
        const r = await mintPost();
        expect(r.ok).toBe(false);
    });

    it("mints a cancel action only when explicitly asked", async () => {
        const r = await mintPost({ kinds: ["cancel_tour"] });
        expect(r.ok).toBe(true);
        const rows = linkRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].action_kind).toBe("cancel_tour");
        expect(rows[0].booking_id).toBe("booking-1");
    });
});

// ---------------------------------------------------------- supersede ---
describe("supersedeTourInvitation", () => {
    it("revokes outstanding actions and marks the invitation superseded", async () => {
        await supersedeTourInvitation({ supabase: fakeSupabase(), invitationId: "invitation-1", orgId: ORG } as never);

        const linkUpdate = state.updates.find((u) => u.table === "tour_public_booking_links");
        expect(linkUpdate!.patch.is_active).toBe(false);
        expect(linkUpdate!.patch.revoked_at).toBeTruthy();
        expect(linkUpdate!.filters.invitation_id).toBe("invitation-1");

        const invUpdate = state.updates.find((u) => u.table === "tour_invitations");
        expect(invUpdate!.patch.status).toBe("superseded");
    });

    it("leaves already-consumed actions alone", async () => {
        await supersedeTourInvitation({ supabase: fakeSupabase(), invitationId: "invitation-1", orgId: ORG } as never);
        const linkUpdate = state.updates.find((u) => u.table === "tour_public_booking_links");
        // Revoking a consumed action would rewrite history — the booking it
        // produced is real and stays attributable.
        expect(linkUpdate!.filters["is:consumed_at"]).toBeNull();
    });

    it("only supersedes an invitation that is still draft or active", async () => {
        await supersedeTourInvitation({ supabase: fakeSupabase(), invitationId: "invitation-1", orgId: ORG } as never);
        const invUpdate = state.updates.find((u) => u.table === "tour_invitations");
        expect(invUpdate!.filters["in:status"]).toEqual(["draft", "active"]);
        // Org-scoped, so one tenant cannot supersede another's invitation.
        expect(invUpdate!.filters.org_id).toBe(ORG);
    });
});

// ------------------------------------------------------ design invariants ---
describe("design invariants", () => {
    it("keeps cancel_tour out of both default action sets", () => {
        expect(INITIAL_ACTION_KINDS).not.toContain("cancel_tour");
        expect(POST_BOOKING_ACTION_KINDS).not.toContain("cancel_tour");
    });

    it("draws every default action kind from the closed vocabulary", () => {
        for (const k of [...INITIAL_ACTION_KINDS, ...POST_BOOKING_ACTION_KINDS]) {
            expect(TOUR_ACTION_KINDS).toContain(k);
        }
    });

    it("does not mint the same kind twice in one set", () => {
        expect(new Set(INITIAL_ACTION_KINDS).size).toBe(INITIAL_ACTION_KINDS.length);
        expect(new Set(POST_BOOKING_ACTION_KINDS).size).toBe(POST_BOOKING_ACTION_KINDS.length);
    });
});
