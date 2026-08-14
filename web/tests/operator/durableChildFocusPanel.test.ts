/**
 * DURABLE CHILD FOCUS PANEL — Workstream C.
 *
 * The property: **a child is openable because the child exists**, not because an enrollment is
 * running. The three cases the brief names are the same fixture with different surroundings, which
 * is the point — `customer_members` is the invariant, so it is the identity of record:
 *
 *   1. enrollment completed, case left the active queue
 *   2. household child that never entered an enrollment process
 *   3. active enrollment (operational context exists, identity does not change)
 *
 * The case that would fail silently is (3): an implementation that lets operational context leak into
 * identity passes (1) and (2) and then shows a different child depending on queue state. So (3)
 * asserts identity EQUALITY against (1), not merely that it composed.
 */

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { composeDurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildSubject";
import {
    childAgeLabel,
    type DurableChildSubject,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import { focusPanelWorkModeModelFromDurableChild } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import {
    cardAppliesToGrain,
    cardKeysForGrain,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { focusPanelDefaultCompositionForGrain } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { focusPanelSummaryDefaultDocForGrain } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const NOW = new Date("2026-08-14T12:00:00Z");

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

function mockSupabase(store: Store): { supabase: SupabaseClient; reads: string[]; writes: string[] } {
    const reads: string[] = [];
    const writes: string[] = [];
    const from = (table: string) => {
        reads.push(table);
        let rows = [...(store[table] ?? [])];
        const api: Record<string, unknown> = {};
        const chain = () => api;
        api.select = chain;
        api.order = chain;
        api.limit = chain;
        api.eq = (col: string, val: unknown) => {
            rows = rows.filter((r) => r[col] === val);
            return api;
        };
        api.in = (col: string, vals: unknown[]) => {
            rows = rows.filter((r) => vals.includes(r[col] as never));
            return api;
        };
        api.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
        api.single = async () => ({ data: rows[0] ?? null, error: null });
        // Any write is a certification failure; record rather than perform it.
        api.insert = (payload: Row) => {
            writes.push(table);
            return { select: () => ({ single: async () => ({ data: payload, error: null }) }) };
        };
        api.update = () => {
            writes.push(table);
            return api;
        };
        api.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
            resolve({ data: rows, error: null });
        return api;
    };
    return { supabase: { from } as unknown as SupabaseClient, reads, writes };
}

const CHILD_MEMBER: Row = {
    id: "member-ada",
    org_id: ORG,
    customer_id: "household-1",
    person_id: "person-ada",
    display_name: "Ada Okafor",
    first_name: "Ada",
    last_name: "Okafor",
    dob: "2022-03-09",
    relationship: "child",
    is_active: true,
    status_key: "enrolled",
};

/** A child with NO person row — `customer_members.person_id` is nullable and this is ordinary. */
const PERSONLESS_MEMBER: Row = {
    id: "member-noah",
    org_id: ORG,
    customer_id: "household-2",
    person_id: null,
    display_name: "Noah Bell",
    first_name: "Noah",
    last_name: "Bell",
    dob: "2020-11-30",
    relationship: "child",
    is_active: true,
    status_key: null,
};

const BASE_STORE = {
    customers: [
        { id: "household-1", org_id: ORG, name: "Okafor Household" },
        { id: "household-2", org_id: ORG, name: "Bell Household" },
    ],
    persons: [{ id: "person-ada", org_id: ORG, first_name: "Ada", last_name: "Okafor" }],
    customer_persons: [],
    customer_members: [CHILD_MEMBER, PERSONLESS_MEMBER],
    employments: [],
};

/** (1) enrollment finished — the case exists but its unit went inactive. */
function closedEnrollmentStore(): Store {
    return {
        ...BASE_STORE,
        opportunities: [
            { id: "opp-closed", org_id: ORG, customer_id: "household-1", work_unit_id: "wu-closed" },
        ],
        work_units: [{ id: "wu-closed", org_id: ORG, key: "enrollment_pipeline", is_active: false }],
    };
}

/** (2) never enrolled — no opportunity at all. */
function noProcessStore(): Store {
    return { ...BASE_STORE, opportunities: [], work_units: [] };
}

/** (3) active enrollment — a queue holds the family case. */
function activeEnrollmentStore(): Store {
    return {
        ...BASE_STORE,
        opportunities: [
            { id: "opp-active", org_id: ORG, customer_id: "household-1", work_unit_id: "wu-active" },
        ],
        work_units: [{ id: "wu-active", org_id: ORG, key: "enrollment_pipeline", is_active: true }],
    };
}

async function compose(store: Store, memberId = "member-ada", orgId = ORG) {
    const { supabase, reads, writes } = mockSupabase(store);
    const result = await composeDurableChildSubject(supabase, orgId, memberId);
    return { result, reads, writes };
}

/** Identity only — what must be invariant across queue state. */
function identityOf(subject: DurableChildSubject) {
    return {
        memberId: subject.memberId,
        personId: subject.personId,
        householdId: subject.householdId,
        label: subject.label,
        dateOfBirth: subject.dateOfBirth,
    };
}

// ── The three required cases ─────────────────────────────────────────────────────────

describe("1. closed / completed enrollment", () => {
    it("the child still composes from the member row alone", async () => {
        const { result } = await compose(closedEnrollmentStore());
        expect(result.ok).toBe(true);
        const subject = (result as { ok: true; subject: DurableChildSubject }).subject;
        expect(subject.memberId).toBe("member-ada");
        expect(subject.label).toBe("Ada Okafor");
        expect(subject.householdName).toBe("Okafor Household");
    });

    it("no active Work Unit is consulted, and none is required", async () => {
        const { reads } = await compose(closedEnrollmentStore());
        // The composer never asks about work units at all — that is the operational question, and
        // this is the durable one.
        expect(reads).not.toContain("work_units");
    });

    it("composes a settled panel model with the child identity card", async () => {
        const { result } = await compose(closedEnrollmentStore());
        const subject = (result as { ok: true; subject: DurableChildSubject }).subject;
        const model = focusPanelWorkModeModelFromDurableChild({
            mode: "summary",
            subject,
            canMutate: true,
            now: NOW,
        });
        expect(model.subject).toEqual({ type: "child", id: "member-ada", label: "Ada Okafor" });
        expect(model.source).toBe("durable_subject");
        expect(model.phase).toBe("settled");
        expect(model.context.grain).toBe("child");
        expect(model.cardReadiness.get("child_identity")).toBe("ready");
        expect(model.cardModels.get("child_identity")?.payload?.profileFields).toEqual([
            { label: "Name", value: "Ada Okafor" },
            { label: "Date of birth", value: "Mar 9, 2022" },
            { label: "Age", value: "4 yr 5 mo" },
            { label: "Household", value: "Okafor Household" },
        ]);
    });
});

describe("2. household child with no enrollment process", () => {
    it("composes with no opportunity in existence", async () => {
        const { result } = await compose(noProcessStore());
        expect(result.ok).toBe(true);
        expect((result as { ok: true; subject: DurableChildSubject }).subject.memberId).toBe("member-ada");
    });

    it("composes even when the child has NO person row", async () => {
        const { result } = await compose(noProcessStore(), "member-noah");
        expect(result.ok).toBe(true);
        const subject = (result as { ok: true; subject: DurableChildSubject }).subject;
        // `customer_members.person_id` is nullable; keying identity on the person would lose this
        // child entirely, which is why the member row is the identity of record.
        expect(subject.personId).toBeNull();
        expect(subject.label).toBe("Noah Bell");
        expect(subject.truth._child_identity_source).toBe("member");
    });

    it("a person-less child still renders a complete identity card", async () => {
        const { result } = await compose(noProcessStore(), "member-noah");
        const subject = (result as { ok: true; subject: DurableChildSubject }).subject;
        const model = focusPanelWorkModeModelFromDurableChild({
            mode: "summary",
            subject,
            canMutate: true,
            now: NOW,
        });
        const card = model.cardModels.get("child_identity");
        expect(card?.visible).toBe(true);
        expect(card?.insight).toBe("5 yr 8 mo old");
    });
});

describe("3. active enrollment", () => {
    it("composes, and the child's IDENTITY is byte-identical to the closed-case composition", async () => {
        const closed = await compose(closedEnrollmentStore());
        const active = await compose(activeEnrollmentStore());
        expect(active.result.ok).toBe(true);
        // The assertion that matters: queue state must not change who this child is.
        expect(identityOf((active.result as { ok: true; subject: DurableChildSubject }).subject)).toEqual(
            identityOf((closed.result as { ok: true; subject: DurableChildSubject }).subject),
        );
    });

    it("the panel claims no business process even when a case is being worked", async () => {
        const { result } = await compose(activeEnrollmentStore());
        const subject = (result as { ok: true; subject: DurableChildSubject }).subject;
        const model = focusPanelWorkModeModelFromDurableChild({
            mode: "summary",
            subject,
            canMutate: true,
            now: NOW,
            operationalHost: { opportunityId: "opp-active", workUnitKey: "enrollment_pipeline" },
        });
        // A host says a family case is worked somewhere. It does not say which stage the CHILD is at,
        // and borrowing the family's stage would put household process state on a child's identity.
        expect(model.context.businessProcess).toEqual({ key: null, label: null, stageKey: null });
        expect(model.subject.id).toBe("member-ada");
    });
});

// ── No side effects, and tenancy ─────────────────────────────────────────────────────

describe("opening a child creates nothing", () => {
    it("writes no table under any enrollment state", async () => {
        for (const store of [closedEnrollmentStore(), noProcessStore(), activeEnrollmentStore()]) {
            const { writes } = await compose(store);
            expect(writes).toEqual([]);
        }
    });

    it("never reads process_instances or opportunity_customer_members", async () => {
        const { reads } = await compose(activeEnrollmentStore());
        // Enrollment participation is not consulted to establish identity, under any queue state.
        expect(reads).not.toContain("process_instances");
        expect(reads).not.toContain("opportunity_customer_members");
    });

    it("reads `opportunities` only as a side effect of the person payload, never as a dependency", async () => {
        // `buildPersonDrawerEntityPayloadForViewModel` composes `_linked_opportunities` as part of
        // its normal job, so reusing it brings that read along. It is a READ, not a requirement:
        // the no-process case composes with zero opportunity rows in existence, and a child with no
        // person row never reaches that composer at all.
        const withPerson = await compose(activeEnrollmentStore());
        expect(withPerson.reads).toContain("opportunities");

        const personless = await compose(noProcessStore(), "member-noah");
        expect(personless.reads).not.toContain("opportunities");
        expect(personless.result.ok).toBe(true);
    });

    it("does not resolve a member from another org", async () => {
        const { result } = await compose(closedEnrollmentStore(), "member-ada", OTHER_ORG);
        expect(result.ok).toBe(false);
    });

    it("does not resolve an unknown member", async () => {
        const { result } = await compose(closedEnrollmentStore(), "member-ghost");
        expect(result.ok).toBe(false);
    });
});

// ── Grain contract from B + D is preserved ───────────────────────────────────────────

describe("the grain contract holds across all three subjects", () => {
    it("child_identity is child-grain only — it is not a case card and not a person card", () => {
        expect(cardAppliesToGrain("child_identity", "child")).toBe(true);
        expect(cardAppliesToGrain("child_identity", "opportunity")).toBe(false);
        expect(cardAppliesToGrain("child_identity", "person")).toBe(false);
    });

    it("the case-grain `children` roster is NOT reused as the child's own card", () => {
        // It mentions children; it answers "who are this family's children", which is a different
        // question and would make a child's record a list containing itself.
        expect(cardAppliesToGrain("children", "child")).toBe(false);
        expect(cardKeysForGrain("child")).toEqual(["child_identity"]);
    });

    it("each grain gets its own default composition", () => {
        expect(focusPanelDefaultCompositionForGrain("child").map((e) => e.key)).toEqual(["child_identity"]);
        expect(focusPanelDefaultCompositionForGrain("person").map((e) => e.key)).toEqual(["employment"]);
        expect(focusPanelDefaultCompositionForGrain("opportunity").length).toBeGreaterThan(1);
    });

    it("the child default doc composes one section", () => {
        expect(focusPanelSummaryDefaultDocForGrain("child").sections).toHaveLength(1);
    });

    it("every card the child composition places is declared for the child grain", () => {
        for (const entry of focusPanelDefaultCompositionForGrain("child")) {
            expect(cardAppliesToGrain(entry.key, "child")).toBe(true);
        }
    });
});

describe("age labelling", () => {
    it("reads in months under two years, because 18 months and 1 year are different children", () => {
        expect(childAgeLabel("2025-06-14", NOW)).toBe("14 mo");
        expect(childAgeLabel("2024-09-14", NOW)).toBe("23 mo");
    });

    it("switches to years AT two, not after", () => {
        expect(childAgeLabel("2024-08-14", NOW)).toBe("2 yr");
        expect(childAgeLabel("2024-08-13", NOW)).toBe("2 yr");
        expect(childAgeLabel("2022-03-09", NOW)).toBe("4 yr 5 mo");
    });

    it("is null rather than a guess when the date is missing or unusable", () => {
        expect(childAgeLabel(null, NOW)).toBeNull();
        expect(childAgeLabel("", NOW)).toBeNull();
        expect(childAgeLabel("not-a-date", NOW)).toBeNull();
        // A future DOB is bad data, not a negative age.
        expect(childAgeLabel("2027-01-01", NOW)).toBeNull();
    });
});

// ── E — optional operational-host enrichment ─────────────────────────────────────────

describe("operational host is enrichment and cannot change the record", () => {
    // `workUnitKey` is nullable in the contract — a case whose unit went inactive is a KEYLESS
    // host, which the last test in this block exercises. Inferring the literal type here would
    // have made that case untypeable while the assertion still read as if it ran.
    type OperationalHost = { opportunityId: string; workUnitKey: string | null };
    const HOST: OperationalHost = { opportunityId: "opp-active", workUnitKey: "enrollment_pipeline" };

    async function childModel(host: OperationalHost | null) {
        const { result } = await compose(activeEnrollmentStore());
        const subject = (result as { ok: true; subject: DurableChildSubject }).subject;
        return focusPanelWorkModeModelFromDurableChild({
            mode: "summary",
            subject,
            canMutate: true,
            now: NOW,
            operationalHost: host,
        });
    }

    it("is carried when supplied, and null when not", async () => {
        expect((await childModel(HOST)).context.operationalHost).toEqual(HOST);
        expect((await childModel(null)).context.operationalHost).toBeNull();
    });

    it("changes neither the subject identity nor the title", async () => {
        const withHost = await childModel(HOST);
        const without = await childModel(null);
        expect(withHost.subject).toEqual(without.subject);
        expect(withHost.title).toBe(without.title);
    });

    it("changes NO card — composition is a property of the subject, not of someone else's queue", async () => {
        const withHost = await childModel(HOST);
        const without = await childModel(null);
        expect([...withHost.cardModels.keys()]).toEqual([...without.cardModels.keys()]);
        expect(withHost.cardModels.get("child_identity")).toEqual(
            without.cardModels.get("child_identity"),
        );
        expect([...withHost.cardReadiness]).toEqual([...without.cardReadiness]);
    });

    it("never becomes the subject's businessProcess", async () => {
        // The host says a family case is worked somewhere. It does not say what stage THIS subject
        // is at, and there is no honest way to derive one from it.
        expect((await childModel(HOST)).context.businessProcess).toEqual({
            key: null,
            label: null,
            stageKey: null,
        });
    });

    it("carries a keyless host as-is — a case with no active unit is not a destination", async () => {
        const model = await childModel({ opportunityId: "opp-closed", workUnitKey: null });
        expect(model.context.operationalHost).toEqual({
            opportunityId: "opp-closed",
            workUnitKey: null,
        });
    });
});
