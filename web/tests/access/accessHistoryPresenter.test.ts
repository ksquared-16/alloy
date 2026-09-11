/**
 * D2 — the operator sentence, and the three things it must never say.
 *
 * The presenter is the single seam between a `mutation_events` row and the words an operator reads.
 * Three surfaces consume it, so what it refuses to say matters as much as what it says:
 *
 *   1. never a dotted permission key as the summary;
 *   2. never "added a role" for an operation that REPLACED the role set (W-17);
 *   3. never a fabricated current label for something that has been deleted.
 */
import { describe, expect, it } from "vitest";

import { presentAccessEvent, scopeDisplay, type AccessEventRow } from "@/lib/access/accessHistoryPresenter";
import { discoverCatalogEntries } from "./permissionCatalogDiscovery";

const CATALOG = discoverCatalogEntries();

const NAMES = {
    people: new Map([
        ["kelly", "Kelly"],
        ["jordan", "Jordan"],
    ]),
    roles: new Map([
        ["billing_specialist", "Billing Specialist"],
        ["ops", "Ops"],
    ]),
    locations: new Map([
        ["loc-riverside", "Riverside"],
        ["loc-lakeside", "Lakeside"],
    ]),
};

function row(over: Partial<AccessEventRow>): AccessEventRow {
    return {
        id: "evt-1",
        committed_at: "2026-09-11T19:00:00.000Z",
        command_key: "access.role.grants_changed",
        subject_id: "role-uuid",
        subject_type: "role",
        previous_state: "",
        new_state: "",
        operator_id: "kelly",
        origin: "operator",
        context_payload: { role_key: "billing_specialist", correlation_id: "corr-1" },
        ...over,
    };
}

describe("the operator sentence", () => {
    it("renders a capability grant as an area level change, not as a key", () => {
        const e = presentAccessEvent(
            row({ previous_state: "", new_state: "fin.read" }),
            NAMES,
            CATALOG
        );
        expect(e.summary).toContain("Kelly");
        expect(e.summary).toContain("Billing Specialist");
        expect(e.summary).toContain("Financials");
        expect(e.summary).toContain("No access");
        expect(e.summary).toContain("View");
        // The thing the instruction forbids as the primary presentation.
        expect(e.summary).not.toContain("fin.read");
        expect(e.summary).not.toMatch(/\b[a-z_]+\.[a-z_.]+\b/);
        // …and the key is still available, one disclosure away.
        expect(e.technical.newState).toBe("fin.read");
    });

    it("renders a revoke as the reverse, and keeps both directions legible", () => {
        const e = presentAccessEvent(row({ previous_state: "fin.read", new_state: "" }), NAMES, CATALOG);
        expect(e.summary).toContain("Financials");
        expect(e.summary).toContain("from View to No access");
    });

    it("says roles were REPLACED, because they were — W-17 is not softened", () => {
        const e = presentAccessEvent(
            row({
                command_key: "access.user.roles_changed",
                subject_type: "membership",
                subject_id: "jordan",
                previous_state: "billing_specialist,ops",
                new_state: "billing_specialist",
                context_payload: { correlation_id: "c", discarded_roles: ["ops"], replacement_semantics: "w17_replaces_role_set" },
            }),
            NAMES,
            CATALOG
        );
        expect(e.summary).toBe("Kelly changed Jordan's roles from Billing Specialist + Ops to Billing Specialist");
        expect(e.summary).not.toMatch(/added|granted a role/i);
        expect(e.technical.contextPayload?.replacement_semantics).toBe("w17_replaces_role_set");
    });

    it("explains a removal by what was removed, not by an absence", () => {
        const e = presentAccessEvent(
            row({
                command_key: "access.user.removed",
                subject_type: "membership",
                subject_id: "jordan",
                previous_state: "ops",
                new_state: "",
                context_payload: { correlation_id: "c", person_deleted: false },
            }),
            NAMES,
            CATALOG
        );
        expect(e.summary).toBe("Kelly removed Jordan's organization access");
        expect(e.changes[0]).toEqual({ area: "Organization access", from: "Ops", to: "No access" });
    });

    it("renders scope with location names on both sides", () => {
        const e = presentAccessEvent(
            row({
                command_key: "access.user.scope_changed",
                subject_type: "access_scope",
                subject_id: "jordan",
                previous_state: "dept=all;site=restricted:loc-riverside",
                new_state: "dept=all;site=restricted:loc-riverside,loc-lakeside",
                context_payload: { correlation_id: "c" },
            }),
            NAMES,
            CATALOG
        );
        expect(e.summary).toBe(
            "Kelly changed Jordan's location access from Riverside to Riverside + Lakeside"
        );
    });
});

describe("history outlives its subject", () => {
    /*
     * Proven live: deleting a role does not delete the events describing it. So the presenter has to
     * render an event whose role is gone — truthfully, without inventing a current label and without
     * dropping the event, which is what an inner join would have done.
     */
    it("names a deleted role as deleted, and still renders the event", () => {
        const e = presentAccessEvent(
            row({ previous_state: "", new_state: "fin.read", context_payload: { role_key: "vanished_role" } }),
            NAMES,
            CATALOG
        );
        expect(e.subjectDisplay).toContain("Deleted role");
        expect(e.subjectDisplay).toContain("vanished_role");
        expect(e.summary).toContain("Financials");
    });

    it("names a system actor as a system, not as a departed colleague", () => {
        /*
         * The ladder's third rung says "this thing is gone", and for a person that is right. A
         * provisioning script, an automation or a service principal was never a member to be removed
         * from anything, so "Removed user (fixture:access-personas)" would have been a fabrication of
         * exactly the kind this module refuses everywhere else.
         */
        for (const [origin, word] of [
            ["system", "System"],
            ["automation", "Automation"],
            ["api", "API client"],
        ] as const) {
            const presented = presentAccessEvent(
                row({ origin, operator_id: "fixture:access-personas" }),
                NAMES,
                CATALOG
            );
            expect(presented.actorDisplay).toBe(`${word} (fixture:access-personas)`);
            expect(presented.actorDisplay).not.toMatch(/Removed user/);
        }
    });

    it("still names a PERSON who acted through the API as that person", () => {
        // A human using the API is a human. Only an unresolvable actor is described by its channel.
        const presented = presentAccessEvent(row({ origin: "api", operator_id: "kelly" }), NAMES, CATALOG);
        expect(presented.actorDisplay).toBe("Kelly");
    });

    it("names a removed actor as removed rather than as nobody", () => {
        const e = presentAccessEvent(row({ operator_id: "ghost", new_state: "fin.read" }), NAMES, CATALOG);
        expect(e.actorDisplay).toContain("Removed user");
        expect(e.actorDisplay).toContain("ghost");
    });

    it("names a deleted location rather than silently dropping it from scope", () => {
        expect(scopeDisplay("dept=all;site=restricted:loc-gone", NAMES.locations)).toBe(
            "Deleted location (loc-gone)"
        );
    });

    it("renders an unrestricted scope as all locations", () => {
        expect(scopeDisplay("dept=all;site=all", NAMES.locations)).toBe("All locations");
    });
});
