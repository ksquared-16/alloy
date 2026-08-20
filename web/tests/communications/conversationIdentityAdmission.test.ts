/**
 * The calendar invitation must not become family history — and a parent's reply still must.
 *
 * The first case is the live defect, reproduced as a fixture: `christina@intentlyco.com`, a
 * Google Calendar invitation, a mixed human identity, no Person, no relationship, no Alloy
 * ancestry. It became permanent canonical Communications history in production. Everything
 * else here exists to prove the refusal is narrow enough not to break anything real.
 */

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    ingestResendInboundEmail,
    type InboundEmailIngestionDeps,
} from "@/lib/communications/email/inboundEmailIngestion";
import { normalizeResendReceivedEvent } from "@/lib/communications/email/inboundEmailNormalization";
import {
    evaluateConversationIdentityAdmission,
    isUnrecognizedSenderAtConversationIdentity,
} from "@/lib/communications/ingress/conversationIdentityAdmission";
import type { EmailIngressDecision } from "@/lib/communications/ingress/emailIngressEligibility";

const ORG = "11111111-1111-1111-1111-111111111111";
const PERSON = "33333333-3333-4333-8333-333333333333";
const CHILD = "44444444-4444-4444-8444-444444444444";
const REL = "55555555-5555-4555-8555-555555555555";

const VISIBLE = "kelly@school.com";
const HIDDEN = "hidden-abc@vvaxamo.resend.app";
const ENROLLMENT = "enrollment@school.com";
const SUBSIDY = "subsidy@school.com";
const PARENT = "parent@gmail.com";
const ALLOY_MID = "<alloy.aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee@school.com>";
const OUTBOUND_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const THREAD = "77777777-7777-4777-8777-777777777777";

type Row = Record<string, unknown>;

function store(seed: Partial<Record<string, Row[]>> = {}) {
    const tables: Record<string, Row[]> = {
        communication_inbound_ingress: [],
        communication_provider_bindings: [],
        communication_ingress_routes: [],
        communication_messages: [],
        communication_threads: [],
        persons: [],
        workflow_events: [],
        org_settings: [],
        person_child_relationships: [],
        person_child_relationship_roles: [],
        child_enrollment_agreements: [],
        employments: [],
        opportunity_persons: [],
        opportunities: [],
        customer_persons: [],
        communication_ingress_eligibility_observations: [],
        ...JSON.parse(JSON.stringify(seed)),
    };
    let seq = 0;
    const client = {
        from(table: string) {
            if (!tables[table]) tables[table] = [];
            const rows = () => tables[table]!;
            const filters: Array<(r: Row) => boolean> = [];
            let ins: Row | null = null;
            let upd: Row | null = null;
            const apply = () => rows().filter((r) => filters.every((f) => f(r)));
            const result = () => {
                if (ins) { const row = { id: `${table}-${++seq}`, ...ins }; rows().push(row); return { data: row, error: null }; }
                if (upd) { for (const r of apply()) Object.assign(r, upd); return { data: null, error: null }; }
                return { data: apply(), error: null };
            };
            const b: Record<string, unknown> = {
                insert(v: Row) { ins = v; return b; },
                update(v: Row) { upd = v; return b; },
                select: () => b,
                eq(c: string, v: unknown) { filters.push((r) => String(r[c] ?? "") === String(v ?? "")); return b; },
                in(c: string, v: unknown[]) { filters.push((r) => v.map(String).includes(String(r[c] ?? ""))); return b; },
                ilike(c: string, v: string) { filters.push((r) => String(r[c] ?? "").toLowerCase() === v.toLowerCase()); return b; },
                or: () => b,
                limit: () => b,
                maybeSingle() { const r = result(); return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }); },
                then: (f: (v: unknown) => unknown) => Promise.resolve(result()).then(f),
            };
            return b;
        },
        rpc: () => Promise.resolve({ data: null, error: null }),
    } as unknown as SupabaseClient;
    return { tables, client };
}

const binding = (over: Row = {}): Row => ({
    id: "bind-conversation", org_id: ORG, channel: "email", provider: "resend", status: "active",
    inbound_address: VISIBLE, location_id: null, secret_ref: null, intake_role: "conversation",
    intake_purpose_key: null, ...over,
});

const route = (over: Row = {}): Row => ({
    id: "route-1", org_id: ORG, destination: HIDDEN, communication_provider_binding_id: "bind-conversation", ...over,
});

/** The live defect, as a fixture. */
function calendarInviteEvent(to = HIDDEN) {
    return normalizeResendReceivedEvent(
        {
            email_id: "prov-calendar-1", created_at: "2026-08-19T23:14:10.000Z",
            from: "christina@intentlyco.com", to: [to], cc: [], bcc: [], received_for: [to],
            message_id: "<calendar-40fb9cee-3ca8-4447-8c89-b03a67034ba5@google.com>",
            subject: "Invitation: Kelly Kurzman and Christina Howard @ Mon Aug 31, 2026 3:15pm",
            attachments: [],
        },
        { receivedAtFallback: "2026-08-19T23:14:10.000Z" },
    )!;
}

function parentEvent(over: Row = {}) {
    return normalizeResendReceivedEvent(
        {
            email_id: "prov-parent-1", created_at: "2026-08-19T23:20:00.000Z",
            from: PARENT, to: [HIDDEN], cc: [], bcc: [], received_for: [HIDDEN],
            message_id: "<gmail-reply-1@mail.gmail.com>",
            subject: "Re: Enrollment paperwork", attachments: [], ...over,
        },
        { receivedAtFallback: "2026-08-19T23:20:00.000Z" },
    )!;
}

function deps(client: SupabaseClient, headers: Record<string, string> = {}): InboundEmailIngestionDeps {
    return {
        supabase: client,
        retrieve: async () => ({ ok: true, payload: { text: "body text", html: null, headers } }),
        now: () => "2026-08-19T23:30:00.000Z",
    };
}

const guardianSeed = {
    persons: [{ id: PERSON, org_id: ORG, email: PARENT }],
    person_child_relationships: [{ id: REL, org_id: ORG, person_id: PERSON, status: "active", customer_member_id: CHILD }],
    person_child_relationship_roles: [{ id: "r", org_id: ORG, relationship_id: REL, role_key: "guardian", is_active: true }],
    child_enrollment_agreements: [{ id: "c", org_id: ORG, customer_member_id: CHILD, status: "active" }],
};

describe("POSITIVE CONTROL — the live defect must not recur", () => {
    it("a stranger's calendar invitation is quarantined, not made into family history", async () => {
        const s = store({ communication_provider_bindings: [binding()], communication_ingress_routes: [route()] });
        const outcome = await ingestResendInboundEmail(calendarInviteEvent(), deps(s.client));

        expect(outcome).toEqual({ status: "quarantined", disposition: "ineligible_unrecognized_sender" });

        // Nothing an operator or a family would ever see.
        expect(s.tables.communication_messages).toHaveLength(0);
        expect(s.tables.communication_threads).toHaveLength(0);
        expect(s.tables.workflow_events).toHaveLength(0);
    });

    it("the provider event is RETAINED and auditable, never destroyed", async () => {
        const s = store({ communication_provider_bindings: [binding()], communication_ingress_routes: [route()] });
        await ingestResendInboundEmail(calendarInviteEvent(), deps(s.client));

        const receipt = s.tables.communication_inbound_ingress![0]!;
        expect(receipt).toMatchObject({
            provider_message_id: "prov-calendar-1",
            from_address: "christina@intentlyco.com",
            routing_disposition: "ineligible_unrecognized_sender",
            resolved_org_id: ORG,
            resolution_note: "ineligible:REJECT_NO_ADMITTING_EVIDENCE",
        });
        // Ownership WAS resolved — this is a refusal, not a failure to attribute.
        expect(receipt.resolved_message_id ?? null).toBeNull();
    });

    it("no body is retained on the quarantined receipt", async () => {
        const s = store({ communication_provider_bindings: [binding()], communication_ingress_routes: [route()] });
        await ingestResendInboundEmail(calendarInviteEvent(), deps(s.client));
        expect(JSON.stringify(s.tables.communication_inbound_ingress)).not.toContain("body text");
    });
});

describe("COUNTER-CONTROLS — the refusal must be narrow", () => {
    it("a known parent's reply still enters normally", async () => {
        const s = store({ communication_provider_bindings: [binding()], communication_ingress_routes: [route()], ...guardianSeed });
        const outcome = await ingestResendInboundEmail(
            parentEvent(),
            deps(s.client, { "Authentication-Results": "mx; dmarc=pass" }),
        );
        expect(outcome.status).toBe("persisted");
        expect(s.tables.communication_messages).toHaveLength(1);
        expect(s.tables.workflow_events).toHaveLength(1);
    });

    it("an RFC reply to an Alloy-originated Email enters even from an unknown sender", async () => {
        // Lane A. The whole point of enforcing AFTER retrieval: this evidence lives in
        // headers the webhook never carried, and refusing it would break the round trip
        // that was just certified live.
        const s = store({
            communication_provider_bindings: [binding()],
            communication_ingress_routes: [route()],
            communication_messages: [
                { id: OUTBOUND_ID, org_id: ORG, thread_id: THREAD, channel: "email", direction: "outbound",
                  from_address: VISIBLE, to_address: "stranger@example.com", email_message_id: ALLOY_MID },
            ],
            communication_threads: [{ id: THREAD, org_id: ORG, channel: "email", primary_entity_type: "persons",
                primary_entity_id: PERSON, recipient_key: "stranger@example.com", location_id: null }],
        });
        const outcome = await ingestResendInboundEmail(
            parentEvent({ email_id: "prov-rfc-1", from: "stranger@example.com" }),
            deps(s.client, { "In-Reply-To": ALLOY_MID }),
        );
        expect(outcome.status).toBe("persisted");
    });

    it("an unknown sender at an ACQUISITION identity is still admitted", async () => {
        const s = store({
            communication_provider_bindings: [
                binding(),
                binding({ id: "bind-acq", inbound_address: ENROLLMENT, intake_role: "acquisition" }),
            ],
            communication_ingress_routes: [route(), route({ id: "route-acq", destination: "hidden-acq@vvaxamo.resend.app", communication_provider_binding_id: "bind-acq" })],
        });
        const outcome = await ingestResendInboundEmail(
            calendarInviteEvent("hidden-acq@vvaxamo.resend.app"),
            deps(s.client),
        );
        expect(outcome.status).toBe("persisted");
    });

    it("an unknown sender at a PURPOSE identity is still admitted", async () => {
        const s = store({
            communication_provider_bindings: [
                binding(),
                binding({ id: "bind-purpose", inbound_address: SUBSIDY, intake_role: "purpose", intake_purpose_key: "subsidy_intake" }),
            ],
            communication_ingress_routes: [route(), route({ id: "route-purpose", destination: "hidden-sub@vvaxamo.resend.app", communication_provider_binding_id: "bind-purpose" })],
        });
        const outcome = await ingestResendInboundEmail(
            calendarInviteEvent("hidden-sub@vvaxamo.resend.app"),
            deps(s.client),
        );
        expect(outcome.status).toBe("persisted");
    });

    it("a SHARED endpoint is reviewed, never refused and never guessed", async () => {
        const s = store({
            communication_provider_bindings: [binding()], communication_ingress_routes: [route()],
            persons: [
                { id: PERSON, org_id: ORG, email: PARENT },
                { id: "person-2", org_id: ORG, email: PARENT },
            ],
        });
        const outcome = await ingestResendInboundEmail(parentEvent(), deps(s.client));
        expect(outcome.status).toBe("persisted");
    });

    it("STAFF mail is untouched — Lane B is not enforced", async () => {
        const s = store({
            communication_provider_bindings: [binding()], communication_ingress_routes: [route()],
            persons: [{ id: PERSON, org_id: ORG, email: PARENT }],
            employments: [{ id: "e", org_id: ORG, person_id: PERSON, employment_status: "active" }],
        });
        expect((await ingestResendInboundEmail(parentEvent(), deps(s.client))).status).toBe("persisted");
    });

    it("a FORMER family's mail is untouched — that refusal is not enforced either", async () => {
        const s = store({
            communication_provider_bindings: [binding()], communication_ingress_routes: [route()],
            persons: [{ id: PERSON, org_id: ORG, email: PARENT }],
            customer_persons: [{ id: "cp", org_id: ORG, person_id: PERSON, role_type: "parent", status: "active", end_date: "2020-01-01" }],
        });
        expect((await ingestResendInboundEmail(parentEvent(), deps(s.client))).status).toBe("persisted");
    });
});

describe("FAIL OPEN — a broken evaluation must never widen refusal", () => {
    const envelope = {
        recipients: [HIDDEN], sender: "christina@intentlyco.com", subject: "Invitation",
        inReplyTo: null, references: null,
    };

    it("an unavailable identity source refuses NOTHING", async () => {
        // Stands in for a deployment without the intake-role column. Guessing that every
        // address is a conversation would start refusing acquisition mail — a worse defect
        // than the one being fixed — so absence of role data disables enforcement.
        const throwing = {
            from() { throw new Error("column communication_provider_bindings.intake_role does not exist"); },
            rpc: () => Promise.resolve({ data: null, error: null }),
        } as unknown as SupabaseClient;

        await expect(
            evaluateConversationIdentityAdmission({ supabase: throwing }, {
                orgId: ORG, envelope, resolvedAlloyThreadId: null,
            }),
        ).resolves.toMatchObject({ refuse: false, reason: "admission_evaluation_unavailable" });
    });

    it("an organization with no configured identity refuses NOTHING", async () => {
        const s = store({ communication_provider_bindings: [], communication_ingress_routes: [] });
        await expect(
            evaluateConversationIdentityAdmission({ supabase: s.client }, {
                orgId: ORG, envelope, resolvedAlloyThreadId: null,
            }),
        ).resolves.toMatchObject({ refuse: false, reason: "no_identity_roles_available" });
    });

    it("and it DOES refuse once the roles are loadable", async () => {
        const s = store({ communication_provider_bindings: [binding()], communication_ingress_routes: [route()] });
        await expect(
            evaluateConversationIdentityAdmission({ supabase: s.client }, {
                orgId: ORG, envelope, resolvedAlloyThreadId: null,
            }),
        ).resolves.toMatchObject({ refuse: true, reasonCode: "REJECT_NO_ADMITTING_EVIDENCE" });
    });
});

describe("the predicate is exactly one class", () => {
    const base = {
        disposition: "WOULD_REJECT", reasonCode: "REJECT_NO_ADMITTING_EVIDENCE", lane: "none",
        evidence: "", confidenceBasis: "deterministic", retrieval: "none", intakePurposeKey: null,
        senderAssertion: { kind: "unknown" }, matchedThreadId: null, policyVersion: "v",
        identity: { address: VISIBLE, role: "conversation" },
    } as unknown as EmailIngressDecision;

    it("matches the unrecognised sender at a conversation identity", () => {
        expect(isUnrecognizedSenderAtConversationIdentity(base)).toBe(true);
    });

    it("does not match any other reason code", () => {
        for (const reasonCode of [
            "REJECT_RELATIONSHIP_NOT_WATCHED", "REJECT_RELATIONSHIP_INACTIVE", "REJECT_NOT_ADDRESSED_TO_ALLOY",
        ] as const) {
            expect(isUnrecognizedSenderAtConversationIdentity({ ...base, reasonCode })).toBe(false);
        }
    });

    it("does not match another identity role", () => {
        for (const role of ["purpose", "acquisition"] as const) {
            expect(
                isUnrecognizedSenderAtConversationIdentity({ ...base, identity: { address: VISIBLE, role } }),
            ).toBe(false);
        }
    });

    it("does not match an admission or a review", () => {
        expect(isUnrecognizedSenderAtConversationIdentity({ ...base, disposition: "WOULD_INGEST" })).toBe(false);
        expect(isUnrecognizedSenderAtConversationIdentity({ ...base, disposition: "WOULD_REQUIRE_REVIEW" })).toBe(false);
    });
});
