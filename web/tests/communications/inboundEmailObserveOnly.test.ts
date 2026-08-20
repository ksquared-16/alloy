/**
 * Observe-only, proven rather than asserted.
 *
 * The claim this file exists to establish is narrow and absolute: **a message the gate
 * would refuse behaves exactly as it did before the gate existed.** Everything else here
 * serves that — the identical-outcome comparison, the deliberately broken observation
 * store, the shape of what gets written down.
 *
 * The method for non-interference is a DIFFERENTIAL: the same event is ingested twice into
 * two independent stores, once where the observation write succeeds and once where it
 * throws, and the canonical result of both — outcome, message row, thread row, workflow
 * event, receipt — is compared field for field. A test that merely asserted "ingestion
 * still returns persisted" would pass even if the gate had quietly changed a thread id.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    ingestResendInboundEmail,
    type InboundEmailIngestionDeps,
} from "@/lib/communications/email/inboundEmailIngestion";
import { normalizeResendReceivedEvent } from "@/lib/communications/email/inboundEmailNormalization";
import {
    INGRESS_RELATIONSHIP_SOURCES,
    OBSERVE_ONLY_DEFAULT_WATCHED_KINDS,
    projectObservationRow,
    unsupportedWatchedKinds,
} from "@/lib/communications/ingress/observeEmailIngressEligibility";
import { EMAIL_INGRESS_POLICY_VERSION } from "@/lib/communications/ingress/emailIngressEligibility";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";
const CHILD = "44444444-4444-4444-8444-444444444444";
const REL = "55555555-5555-4555-8555-555555555555";

const DIRECTOR = "kelly@northwind.example";
const ENROLLMENT = "enrollment@northwind.example";
const SUBSIDY = "subsidy@northwind.example";
const PARENT = "parent@example.invalid";
const AT = "2026-08-18T10:00:00.000Z";

const OBSERVATIONS = "communication_ingress_eligibility_observations";

type Row = Record<string, unknown>;

/**
 * PostgREST-shaped store, extended from the ingestion suite's with the tables the
 * eligibility loader reads.
 *
 * `failTables` is the point of the harness: it makes a chosen table's writes throw, which
 * is how "the gate blew up" is expressed without mocking the module under test.
 */
function makeStore(seed: Partial<Record<string, Row[]>> = {}, failTables: string[] = []) {
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
        [OBSERVATIONS]: [],
        ...JSON.parse(JSON.stringify(seed)),
    };
    let seq = 0;
    const nextId = (p: string) => `${p}-${++seq}`;

    function client(): SupabaseClient {
        return {
            from(table: string) {
                if (!tables[table]) tables[table] = [];
                const rows = () => tables[table]!;
                const filters: Array<(r: Row) => boolean> = [];
                let pendingInsert: Row | null = null;
                let pendingUpdate: Row | null = null;

                const apply = () => rows().filter((r) => filters.every((f) => f(r)));

                const result = () => {
                    if (failTables.includes(table)) throw new Error(`store unavailable: ${table}`);
                    if (pendingInsert) {
                        if (table === "communication_inbound_ingress") {
                            const dup = rows().some(
                                (r) =>
                                    r.provider === pendingInsert!.provider &&
                                    r.channel === pendingInsert!.channel &&
                                    r.provider_message_id === pendingInsert!.provider_message_id
                            );
                            if (dup) return { data: null, error: { code: "23505" } };
                        }
                        if (table === "communication_messages" && pendingInsert.direction === "inbound") {
                            const dup = rows().some(
                                (r) =>
                                    r.org_id === pendingInsert!.org_id &&
                                    r.provider === pendingInsert!.provider &&
                                    r.channel === pendingInsert!.channel &&
                                    r.direction === "inbound" &&
                                    r.provider_message_id === pendingInsert!.provider_message_id
                            );
                            if (dup) return { data: null, error: { code: "23505" } };
                        }
                        const row = { id: nextId(table), ...pendingInsert };
                        rows().push(row);
                        return { data: row, error: null };
                    }
                    if (pendingUpdate) {
                        for (const r of apply()) Object.assign(r, pendingUpdate);
                        return { data: null, error: null };
                    }
                    return { data: apply(), error: null };
                };

                const builder: Record<string, unknown> = {
                    insert(v: Row) {
                        pendingInsert = v;
                        return builder;
                    },
                    update(v: Row) {
                        pendingUpdate = v;
                        return builder;
                    },
                    select: () => builder,
                    eq(col: string, val: unknown) {
                        filters.push((r) => String(r[col] ?? "") === String(val ?? ""));
                        return builder;
                    },
                    in(col: string, vals: unknown[]) {
                        filters.push((r) => vals.map(String).includes(String(r[col] ?? "")));
                        return builder;
                    },
                    ilike(col: string, val: string) {
                        filters.push((r) => String(r[col] ?? "").toLowerCase() === val.toLowerCase());
                        return builder;
                    },
                    or(expr: string) {
                        filters.push((r) => {
                            const from = String(r.from_address ?? "");
                            const to = String(r.to_address ?? "");
                            return expr.includes(from) && expr.includes(to);
                        });
                        return builder;
                    },
                    limit: () => builder,
                    maybeSingle() {
                        const r = result();
                        if (r.error) return Promise.resolve(r);
                        const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
                        return Promise.resolve({ data: d, error: null });
                    },
                    then(f: (v: unknown) => unknown) {
                        return Promise.resolve(result()).then(f);
                    },
                };
                return builder;
            },
        } as unknown as SupabaseClient;
    }

    return { tables, client };
}

function binding(over: Row = {}): Row {
    return {
        id: "bind-director",
        org_id: ORG_A,
        channel: "email",
        provider: "resend",
        status: "active",
        inbound_address: DIRECTOR,
        intake_role: "conversation",
        intake_purpose_key: null,
        location_id: null,
        ...over,
    };
}

function event(over: Row = {}) {
    return normalizeResendReceivedEvent(
        {
            email_id: "resend-observe-1",
            created_at: AT,
            from: PARENT,
            to: [DIRECTOR],
            cc: [],
            bcc: [],
            received_for: [],
            message_id: "<parent-1@mail.example>",
            subject: "Field trip form and a bank statement",
            attachments: [],
            ...over,
        },
        { receivedAtFallback: AT }
    )!;
}

function deps(client: SupabaseClient, headers: Record<string, string> = {}): InboundEmailIngestionDeps {
    return {
        supabase: client,
        retrieve: async () => ({
            ok: true,
            payload: {
                text: "Please see the attached form. Account number 1234-5678.",
                html: null,
                html_format: null,
                headers,
            },
        }),
        now: () => AT,
    };
}

/** The canonical state ingestion produces, reduced to what must not change. */
function canonicalState(tables: Record<string, Row[]>) {
    const strip = (r: Row) => {
        const { id, ...rest } = r;
        void id;
        return rest;
    };
    return {
        messages: (tables.communication_messages ?? []).map(strip),
        threads: (tables.communication_threads ?? []).map(strip),
        workflowEvents: (tables.workflow_events ?? []).map(strip),
        receipts: (tables.communication_inbound_ingress ?? []).map(strip),
        routes: tables.communication_ingress_routes ?? [],
    };
}

describe("observe-only: ingestion behaviour is unchanged", () => {
    const guardianSeed = {
        communication_provider_bindings: [binding()],
        persons: [{ id: PERSON, org_id: ORG_A, email: PARENT }],
        person_child_relationships: [{ id: REL, org_id: ORG_A, person_id: PERSON, status: "active", customer_member_id: CHILD }],
        person_child_relationship_roles: [
            { id: "role-1", org_id: ORG_A, relationship_id: REL, role_key: "guardian", is_active: true },
        ],
        child_enrollment_agreements: [{ id: "cea-1", org_id: ORG_A, customer_member_id: CHILD, status: "active" }],
    };

    it("produces byte-identical canonical state whether the observation succeeds or throws", async () => {
        const healthy = makeStore(guardianSeed);
        const broken = makeStore(guardianSeed, [OBSERVATIONS]);

        const a = await ingestResendInboundEmail(event(), deps(healthy.client()));
        const b = await ingestResendInboundEmail(event(), deps(broken.client()));

        // Same outcome, and the ids are generated by the same deterministic sequence in
        // both stores, so they are comparable in full.
        expect(a).toEqual(b);
        expect(a.status).toBe("persisted");
        expect(canonicalState(healthy.tables)).toEqual(canonicalState(broken.tables));

        // And the difference is only ever the observation itself.
        expect(healthy.tables[OBSERVATIONS]).toHaveLength(1);
        expect(broken.tables[OBSERVATIONS]).toHaveLength(0);
    });

    it("the ONE enforced refusal quarantines instead of ingesting — and is still observed", async () => {
        // This case used to assert that a WOULD_REJECT message was ingested unchanged,
        // because the gate was purely observational. One class is now enforced: an
        // unrecognised sender at a `conversation` identity. It becomes a quarantined
        // receipt rather than a conversation — and it is still observed, because the
        // refused population is exactly the one the corpus must keep measuring.
        const store = makeStore({ communication_provider_bindings: [binding()] });
        const outcome = await ingestResendInboundEmail(
            event({ from: "statements@bank.example", email_id: "resend-bank-1" }),
            deps(store.client())
        );

        expect(outcome).toEqual({ status: "quarantined", disposition: "ineligible_unrecognized_sender" });
        expect(store.tables.communication_messages).toHaveLength(0);
        expect(store.tables.communication_threads).toHaveLength(0);
        expect(store.tables.workflow_events).toHaveLength(0);

        const observation = store.tables[OBSERVATIONS]![0]!;
        expect(observation).toMatchObject({
            decision: "WOULD_REJECT",
            lane: "none",
            reason_code: "REJECT_NO_ADMITTING_EVIDENCE",
            confidence_basis: "deterministic",
            evaluation_mode: "live_observed",
        });
    });

    it("every store the gate ALONE reads may fail without touching ingestion", async () => {
        // Only gate-exclusive tables. `persons` and `communication_provider_bindings` are
        // read by the certified ingestion path itself, so breaking them would be testing
        // ingestion's own error handling rather than the gate's isolation — and would pass
        // for the wrong reason. `communication_ingress_routes` is shared too: ownership
        // reads it to build the claimable destinations. Which is worth stating plainly —
        // three of the tables the gate touches are ones ingestion cannot run without, so a
        // total database outage fails ingestion first and the gate is never reached.
        for (const table of [
            "org_settings",
            "employments",
            "person_child_relationships",
            "opportunity_persons",
            OBSERVATIONS,
        ]) {
            const store = makeStore(guardianSeed, [table]);
            const outcome = await ingestResendInboundEmail(
                event({ email_id: `resend-fail-${table}` }),
                deps(store.client())
            );
            expect(outcome.status).toBe("persisted");
        }
    });

    it("a duplicate redelivery still converges, and observes at most once", async () => {
        const store = makeStore(guardianSeed);
        const first = await ingestResendInboundEmail(event(), deps(store.client()));
        const second = await ingestResendInboundEmail(event(), deps(store.client()));

        expect(first.status).toBe("persisted");
        expect(second.status).toBe("duplicate");
        expect(store.tables.communication_messages).toHaveLength(1);
        // The redelivery returns before the tail, so no second row — the unique index in
        // the migration is the backstop, not the mechanism.
        expect(store.tables[OBSERVATIONS]).toHaveLength(1);
    });

    it("quarantined mail is never observed — the gate speaks only for an attributed tenant", async () => {
        const store = makeStore({ communication_provider_bindings: [] });
        const outcome = await ingestResendInboundEmail(event(), deps(store.client()));
        expect(outcome).toEqual({ status: "quarantined", disposition: "no_attributable_org" });
        expect(store.tables[OBSERVATIONS]).toHaveLength(0);
    });
});

describe("observe-only: what gets written down", () => {
    it("records IDs and vocabularies, and no message content whatsoever", async () => {
        const store = makeStore({
            communication_provider_bindings: [binding()],
            persons: [{ id: PERSON, org_id: ORG_A, email: PARENT }],
        });
        await ingestResendInboundEmail(
            event({ subject: "Privileged and confidential — Whitfield matter" }),
            deps(store.client())
        );

        const row = store.tables[OBSERVATIONS]![0]!;
        const serialized = JSON.stringify(row).toLowerCase();

        // The exact strings that must not have travelled: body, subject, addresses.
        for (const secret of [
            "account number",
            "privileged",
            "whitfield",
            PARENT,
            DIRECTOR,
            "please see the attached",
        ]) {
            expect(serialized).not.toContain(secret.toLowerCase());
        }

        // Positively: only the columns the migration declares.
        expect(Object.keys(row).sort()).toEqual(
            [
                "channel",
                "confidence_basis",
                "decision",
                "evaluated_at",
                "evaluation_mode",
                "id",
                "intake_purpose_key",
                "lane",
                "matched_identity_id",
                "matched_relationship_type",
                "matched_thread_id",
                "org_id",
                "policy_version",
                "provider",
                "provider_message_id",
                "reason_code",
                "sender_assertion",
                "sender_authentication",
                "sender_authentication_evidence",
                "unsupported_watch_kinds",
            ].sort()
        );
        expect(row.policy_version).toBe(EMAIL_INGRESS_POLICY_VERSION);
    });

    it("the LIVE hook stamps live_observed, so a replay row can never be mistaken for it", () => {
        // The column defaults to `live_observed`, and the live hook says so anyway. A
        // default is a guess about who wrote the row, and knowing that is this table's
        // whole value once a historical backtest has populated it.
        const store = makeStore({ communication_provider_bindings: [binding()] });
        return ingestResendInboundEmail(event(), deps(store.client())).then(() => {
            expect(store.tables[OBSERVATIONS]![0]).toMatchObject({ evaluation_mode: "live_observed" });
        });
    });

    it("names the receiving binding and the purpose for a purpose identity", async () => {
        const store = makeStore({
            communication_provider_bindings: [
                binding(),
                binding({
                    id: "bind-subsidy",
                    inbound_address: SUBSIDY,
                    intake_role: "purpose",
                    intake_purpose_key: "subsidy_intake",
                }),
            ],
        });
        await ingestResendInboundEmail(
            event({ to: [SUBSIDY], from: "caseworker@county.example", email_id: "resend-subsidy-1" }),
            deps(store.client())
        );

        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_INGEST",
            lane: "purpose_intake",
            reason_code: "ADMIT_PURPOSE_IDENTITY",
            intake_purpose_key: "subsidy_intake",
            matched_identity_id: "bind-subsidy",
            sender_assertion: "unknown",
        });
    });

    it("an acquisition identity is REVIEW, never an automatic Lead", async () => {
        const store = makeStore({
            communication_provider_bindings: [
                binding(),
                binding({ id: "bind-enroll", inbound_address: ENROLLMENT, intake_role: "acquisition" }),
            ],
        });
        await ingestResendInboundEmail(
            event({ to: [ENROLLMENT], from: "newfamily@example.invalid", email_id: "resend-enroll-1" }),
            deps(store.client())
        );

        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_REQUIRE_REVIEW",
            lane: "acquisition",
            reason_code: "REVIEW_ACQUISITION_CANDIDATE",
        });
    });

    it("ORG ISOLATION: another tenant's binding and another tenant's guardian are both invisible", async () => {
        const store = makeStore({
            // A DIFFERENT address: two tenants claiming one address is cross-org ambiguity,
            // which quarantines before ownership resolves and never reaches the gate.
            communication_provider_bindings: [
                binding(),
                binding({ id: "bind-b", org_id: ORG_B, inbound_address: "hello@southwind.example" }),
            ],
            persons: [{ id: "person-b", org_id: ORG_B, email: PARENT }],
            person_child_relationships: [
                { id: "rel-b", org_id: ORG_B, person_id: "person-b", status: "active", customer_member_id: "child-b" },
            ],
            person_child_relationship_roles: [
                { id: "role-b", org_id: ORG_B, relationship_id: "rel-b", role_key: "guardian", is_active: true },
            ],
            child_enrollment_agreements: [
                { id: "cea-b", org_id: ORG_B, customer_member_id: "child-b", status: "active" },
            ],
        });
        await ingestResendInboundEmail(event(), deps(store.client()));

        const row = store.tables[OBSERVATIONS]![0]!;
        expect(row.org_id).toBe(ORG_A);
        // ORG_B holds the guardian relationship for this exact address. It contributes
        // nothing, so the sender is a stranger here and the message is refused.
        expect(row).toMatchObject({ decision: "WOULD_REJECT", sender_assertion: "unknown" });
    });
});

describe("observe-only: relationship derivation against the real model", () => {
    const withRelationship = (extra: Partial<Record<string, Row[]>>) =>
        makeStore({
            communication_provider_bindings: [binding()],
            persons: [{ id: PERSON, org_id: ORG_A, email: PARENT }],
            ...extra,
        });

    it("a guardian of a currently-enrolled child is a guardian", async () => {
        const store = withRelationship({
            person_child_relationships: [
                { id: REL, org_id: ORG_A, person_id: PERSON, status: "active", customer_member_id: CHILD },
            ],
            person_child_relationship_roles: [
                { id: "r", org_id: ORG_A, relationship_id: REL, role_key: "parent", is_active: true },
            ],
            child_enrollment_agreements: [{ id: "c", org_id: ORG_A, customer_member_id: CHILD, status: "active" }],
        });
        await ingestResendInboundEmail(event(), deps(store.client()));
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            lane: "relationship_watch",
            matched_relationship_type: "guardian",
        });
    });

    it("a guardian whose child has ENDED enrollment is a former guardian, and is refused", async () => {
        // The relationship row is still `active`. Reading only that edge is exactly the
        // "email exists somewhere in Alloy" rule the gate refuses.
        const store = withRelationship({
            person_child_relationships: [
                { id: REL, org_id: ORG_A, person_id: PERSON, status: "active", customer_member_id: CHILD },
            ],
            person_child_relationship_roles: [
                { id: "r", org_id: ORG_A, relationship_id: REL, role_key: "guardian", is_active: true },
            ],
            child_enrollment_agreements: [{ id: "c", org_id: ORG_A, customer_member_id: CHILD, status: "ended" }],
        });
        await ingestResendInboundEmail(event(), deps(store.client()));
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_REJECT",
            // ENDED, not merely unwatched: ticking a box would not bring this family back.
            reason_code: "REJECT_RELATIONSHIP_INACTIVE",
            matched_relationship_type: "former_guardian",
        });
    });

    it("HOUSEHOLD MEMBERSHIP makes a guardian — the gap the first backtest found", async () => {
        // `customer_persons.role_type = 'parent'` with no end date. No child-relationship
        // roles, no enrollment agreement: exactly the shape the corpus's only real parent
        // had, and exactly what the gate used to be blind to.
        const store = withRelationship({
            customer_persons: [
                { id: "cp", org_id: ORG_A, person_id: PERSON, role_type: "parent", status: "active", end_date: null },
            ],
        });
        await ingestResendInboundEmail(event(), deps(store.client()));
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            lane: "relationship_watch",
            matched_relationship_type: "guardian",
        });
    });

    it("an end-dated household membership is a FORMER guardian, and is refused", async () => {
        const store = withRelationship({
            customer_persons: [
                { id: "cp", org_id: ORG_A, person_id: PERSON, role_type: "guardian", status: "active", end_date: "2020-01-01" },
            ],
        });
        await ingestResendInboundEmail(event(), deps(store.client()));
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_REJECT",
            reason_code: "REJECT_RELATIONSHIP_INACTIVE",
            matched_relationship_type: "former_guardian",
        });
    });

    it("holding a child's emergency number is not authority to read the organization's mail", async () => {
        const store = withRelationship({
            customer_persons: [
                { id: "cp", org_id: ORG_A, person_id: PERSON, role_type: "emergency_contact", status: "active", end_date: null },
            ],
        });
        await ingestResendInboundEmail(event(), deps(store.client()));
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_REJECT",
            reason_code: "REJECT_RELATIONSHIP_NOT_WATCHED",
            matched_relationship_type: "emergency_contact",
        });
    });

    it("a shared endpoint whose Persons hold NO relationship still surfaces as ambiguity", async () => {
        const store = makeStore({
            communication_provider_bindings: [binding()],
            persons: [
                { id: PERSON, org_id: ORG_A, email: PARENT },
                { id: "person-2", org_id: ORG_A, email: PARENT },
            ],
        });
        await ingestResendInboundEmail(event(), deps(store.client()));
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_REQUIRE_REVIEW",
            lane: "none",
            reason_code: "REVIEW_SHARED_ENDPOINT",
            sender_assertion: "shared_endpoint",
            matched_relationship_type: null,
        });
    });

    it("an active employment is staff, and staff is not watched by default", async () => {
        const store = withRelationship({
            employments: [{ id: "e", org_id: ORG_A, person_id: PERSON, employment_status: "active" }],
        });
        await ingestResendInboundEmail(event(), deps(store.client()));
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_REJECT",
            reason_code: "REJECT_RELATIONSHIP_NOT_WATCHED",
            matched_relationship_type: "staff",
        });
    });

    it("a live opportunity makes a prospective guardian; a lost one does not", async () => {
        for (const [statusKey, expected] of [
            ["qualified", "WOULD_REQUIRE_REVIEW"],
            ["lost", "WOULD_REJECT"],
        ] as const) {
            const store = withRelationship({
                opportunity_persons: [{ id: "op", org_id: ORG_A, person_id: PERSON, opportunity_id: "opp-1" }],
                opportunities: [{ id: "opp-1", org_id: ORG_A, status_key: statusKey }],
            });
            await ingestResendInboundEmail(event(), deps(store.client()));
            const row = store.tables[OBSERVATIONS]![0]!;
            expect(row.matched_relationship_type).toBe("prospective_guardian");
            // Resend reports no authentication result, so a live prospect lands in review
            // rather than ingest — the finding this whole exercise exists to surface.
            expect(row.decision).toBe(expected);
        }
    });

    it("a shared household address admits the relationship and asserts nobody", async () => {
        const store = makeStore({
            communication_provider_bindings: [binding()],
            persons: [
                { id: PERSON, org_id: ORG_A, email: PARENT },
                { id: "person-2", org_id: ORG_A, email: PARENT },
            ],
            person_child_relationships: [
                { id: REL, org_id: ORG_A, person_id: PERSON, status: "active", customer_member_id: CHILD },
            ],
            person_child_relationship_roles: [
                { id: "r", org_id: ORG_A, relationship_id: REL, role_key: "guardian", is_active: true },
            ],
            child_enrollment_agreements: [{ id: "c", org_id: ORG_A, customer_member_id: CHILD, status: "active" }],
        });
        await ingestResendInboundEmail(event(), deps(store.client(), { "Authentication-Results": "mx; dmarc=pass" }));
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_REQUIRE_REVIEW",
            reason_code: "REVIEW_SHARED_ENDPOINT",
            sender_assertion: "shared_endpoint",
        });
    });

    it("when the address is BOTH shared and unauthenticated, the security reason is reported", async () => {
        // Both facts hold and both mean review. The reason code names the stronger
        // problem: "we cannot trust this came from that address at all" subsumes "that
        // address names two people". The sender assertion still carries the other fact, so
        // nothing is lost — only the headline changes.
        const store = makeStore({
            communication_provider_bindings: [binding()],
            persons: [
                { id: PERSON, org_id: ORG_A, email: PARENT },
                { id: "person-2", org_id: ORG_A, email: PARENT },
            ],
            person_child_relationships: [
                { id: REL, org_id: ORG_A, person_id: PERSON, status: "active", customer_member_id: CHILD },
            ],
            person_child_relationship_roles: [
                { id: "r", org_id: ORG_A, relationship_id: REL, role_key: "guardian", is_active: true },
            ],
            child_enrollment_agreements: [{ id: "c", org_id: ORG_A, customer_member_id: CHILD, status: "active" }],
        });
        await ingestResendInboundEmail(event(), deps(store.client()));
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_REQUIRE_REVIEW",
            reason_code: "REVIEW_UNAUTHENTICATED_RELATIONSHIP",
            sender_assertion: "shared_endpoint",
        });
    });

    it("a DMARC pass in the transport headers lifts a watched relationship to INGEST", async () => {
        const store = makeStore({
            communication_provider_bindings: [binding()],
            persons: [{ id: PERSON, org_id: ORG_A, email: PARENT }],
            person_child_relationships: [
                { id: REL, org_id: ORG_A, person_id: PERSON, status: "active", customer_member_id: CHILD },
            ],
            person_child_relationship_roles: [
                { id: "r", org_id: ORG_A, relationship_id: REL, role_key: "guardian", is_active: true },
            ],
            child_enrollment_agreements: [{ id: "c", org_id: ORG_A, customer_member_id: CHILD, status: "active" }],
        });
        await ingestResendInboundEmail(
            event(),
            deps(store.client(), { "Authentication-Results": "mx.example; spf=pass; dkim=pass; dmarc=pass" })
        );
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_INGEST",
            reason_code: "ADMIT_WATCHED_RELATIONSHIP",
            sender_assertion: "verified_relationship",
        });
    });

    it("org settings can widen the watch list, and a typo in it is dropped rather than trusted", async () => {
        const store = makeStore({
            communication_provider_bindings: [binding()],
            persons: [{ id: PERSON, org_id: ORG_A, email: PARENT }],
            employments: [{ id: "e", org_id: ORG_A, person_id: PERSON, employment_status: "active" }],
            org_settings: [
                {
                    id: "s",
                    org_id: ORG_A,
                    metadata: { email_ingress: { watched_relationship_kinds: ["staff", "not_a_real_kind"] } },
                },
            ],
        });
        await ingestResendInboundEmail(
            event(),
            deps(store.client(), { "Authentication-Results": "mx; dmarc=pass" })
        );
        expect(store.tables[OBSERVATIONS]![0]).toMatchObject({
            decision: "WOULD_INGEST",
            reason_code: "ADMIT_WATCHED_RELATIONSHIP",
            matched_relationship_type: "staff",
            unsupported_watch_kinds: [],
        });
    });

    it("watching a kind Alloy cannot represent is recorded as a coverage gap, not as silence", async () => {
        const store = makeStore({
            communication_provider_bindings: [binding()],
            org_settings: [
                {
                    id: "s",
                    org_id: ORG_A,
                    metadata: { email_ingress: { watched_relationship_kinds: ["guardian", "agency", "vendor"] } },
                },
            ],
        });
        await ingestResendInboundEmail(event({ from: "caseworker@county.example" }), deps(store.client()));
        expect(store.tables[OBSERVATIONS]![0]!.unsupported_watch_kinds).toEqual(["agency", "vendor"]);
    });
});

describe("the vocabulary bridge is declared, not implied", () => {
    it("exactly two relationship kinds have no representation in Alloy's data model", () => {
        const undecidable = Object.entries(INGRESS_RELATIONSHIP_SOURCES)
            .filter(([, v]) => !v.derivable)
            .map(([k]) => k)
            .sort();
        expect(undecidable).toEqual(["agency", "vendor"]);
    });

    it("the observe-only default watches only kinds that are actually derivable", () => {
        expect(unsupportedWatchedKinds(OBSERVE_ONLY_DEFAULT_WATCHED_KINDS)).toEqual([]);
    });

    it("the projected row drops the human-readable evidence sentence", () => {
        const row = projectObservationRow({
            input: {
                orgId: ORG_A,
                provider: "resend",
                providerMessageId: "m-1",
                envelope: { recipients: [DIRECTOR], sender: PARENT, subject: "Confidential" },
                resolvedAlloyThreadId: null,
            },
            decision: {
                disposition: "WOULD_REJECT",
                lane: "none",
                reasonCode: "REJECT_NO_ADMITTING_EVIDENCE",
                evidence: `A sentence naming ${PARENT} and its subject.`,
                confidenceBasis: "deterministic",
                retrieval: "none",
                identity: null,
                intakePurposeKey: null,
                senderAssertion: { kind: "unknown" },
                matchedThreadId: null,
                policyVersion: EMAIL_INGRESS_POLICY_VERSION,
            },
            bindingId: null,
            unsupportedKinds: [],
            evaluatedAt: AT,
        });
        expect(JSON.stringify(row)).not.toContain(PARENT);
        expect(Object.keys(row)).not.toContain("evidence");
    });
});

describe("blast radius: the gate reaches email and nothing else", () => {
    // A source-level check, because the claim is about what CANNOT happen, and no runtime
    // test can prove the absence of a call. If SMS ever needs an ingress gate it will need
    // its own — the lanes here are built on RFC threading and email identities, neither of
    // which SMS has.
    const readSource = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

    it("no SMS runtime imports the ingress eligibility gate", () => {
        const smsSurfaces = [
            "lib/communications/inbound/tourAttendanceSmsReply.ts",
            "lib/communications/twilioSmsStatusWebhook.ts",
            "lib/communications/identity/inboundResolveIdentity.ts",
        ];
        for (const path of smsSurfaces) {
            expect(readSource(path)).not.toContain("IngressEligibility");
        }
    });

    it("the certified routing and correlation modules are untouched by the gate", () => {
        // Ownership and thread resolution must keep deciding what they decided before.
        // If either ever imports the gate, admission and routing have been fused — which
        // is precisely the confusion this whole design exists to undo.
        for (const path of [
            "lib/communications/email/inboundEmailRouting.ts",
            "lib/communications/email/emailMessageId.ts",
        ]) {
            expect(readSource(path)).not.toContain("IngressEligibility");
        }
    });

    it("the gate is invoked through ONE helper, on the ingested and refused paths alike", () => {
        // Two call sites now — the tail of a successful ingest, and the enforced refusal —
        // but only one place that builds the envelope. If those ever diverge, the refused
        // and ingested populations stop being comparable and the corpus quietly lies.
        const source = readSource("lib/communications/email/inboundEmailIngestion.ts");
        expect(source.split("await observeEmailIngressEligibility(").length - 1).toBe(1);
        expect(source.split("await observeInboundEmail(").length - 1).toBe(2);
    });
});
