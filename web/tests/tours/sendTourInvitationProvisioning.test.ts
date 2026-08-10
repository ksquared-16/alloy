/**
 * `send_tour_invitation` is provisioned onto an operator surface.
 *
 * Slice D shipped the code half of this capability and not the config half. The
 * handler was registered, minted invitations and enqueued on both channels — and
 * appeared on NO operator surface, because nothing ever wrote an
 * `action_definitions` row or an `action_placements` row. A certification run
 * caught it: the Manage menu offered Schedule / Reschedule / Confirm tour and
 * nothing else, and the tenant held zero invitation messages.
 *
 * Unit tests could not catch that, because a registered handler tests green
 * whether or not any operator can reach it. These tests read the MIGRATION —
 * the artifact that decides reachability — and the last one generalises the
 * rule so the next capability cannot ship half-wired.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { getRegisteredAction, hasRegisteredHandler, listRegisteredActionKeys } from "@/lib/adminV2/actions/actionRegistry";
import { resolveClientCommandDispatch } from "@/lib/admin/actions/clientCommandDispatch";
import { sendTourInvitationAction } from "@/lib/adminV2/actions/definitions/sendTourInvitationAction";

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");
const PROVISIONING = "20260805090000_send_tour_invitation_action_provisioning.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, PROVISIONING), "utf8");

/** Every migration concatenated — provisioning may legitimately live anywhere. */
function allMigrationSql(): string {
    return readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
        .join("\n");
}

// --- 1-2. registered AND defined -------------------------------------------

describe("send_tour_invitation is registered and provisioned", () => {
    it("has a registered handler", () => {
        expect(hasRegisteredHandler("send_tour_invitation")).toBe(true);
        expect(getRegisteredAction("send_tour_invitation")).toBe(sendTourInvitationAction);
    });

    it("has a provisioned action definition", () => {
        expect(sql).toContain("INSERT INTO public.action_definitions");
        expect(sql).toContain("'send_tour_invitation'::text");
        expect(sql).toContain("'Send tour invitation'::text");
    });

    it("is provisioned globally, not hand-seeded into one tenant", () => {
        // org_id NULL is the platform-owned convention every other tour action
        // uses. A tenant-specific seed would certify a tenant, not the product.
        expect(sql).toMatch(/NULL::uuid,\s*\n\s*'send_tour_invitation'::text/);
        expect(sql).toContain("ad.org_id IS NULL");
        expect(sql).not.toMatch(/org_id\s*=\s*'[0-9a-f]{8}-/i);
    });

    it("is active", () => {
        expect(sql).toContain("AND ad.is_active = true");
    });
});

// --- 3-5. the approved placement, and only that one ------------------------

describe("placement is Focus Panel Manage, and nowhere else", () => {
    it("provisions record_header / overflow on opportunity", () => {
        expect(sql).toContain("INSERT INTO public.action_placements");
        expect(sql).toContain("'record_header'::text");
        expect(sql).toContain("'overflow'::text");
        expect(sql).toContain("'opportunity'::text");
        expect(sql).toContain("'menu_item'::text");
    });

    it.each(["workspace", "right_rail", "queue_row", "work_unit", "department"])(
        "does not provision the %s surface",
        (surface) => {
            expect(sql).not.toContain(`'${surface}'::text`);
        }
    );

    it("does not claim the primary slot", () => {
        // Recommendation is owned by Business Process stage configuration.
        expect(sql).not.toContain("'primary'::text");
    });

    it("is not scoped to a department or work unit — it inherits the record", () => {
        expect(sql).toContain("department_id IS NULL");
        expect(sql).toContain("work_unit_id IS NULL");
    });

    it("orders ahead of confirm_tour (57) inside the overflow menu", () => {
        expect(sql).toMatch(/\n\s*56,\n\s*'menu_item'::text/);
    });

    it("declares opportunity as the configured entity type", () => {
        expect(sendTourInvitationAction.supportedEntityTypes).toEqual(["opportunity"]);
    });
});

// --- 6-7. current-record context and server authority ----------------------

describe("the command binds to the selected record and re-checks authority", () => {
    it("requires an entity id and an opportunity", () => {
        expect(sendTourInvitationAction.requiredContext.requiresEntityId).toBe(true);
        expect(sendTourInvitationAction.requiredContext.requiresOpportunity).toBe(true);
    });

    it("refuses a client-supplied recipient — identity is resolved server-side", () => {
        const result = sendTourInvitationAction.validatePayload({
            recipient_person_id: "attacker-supplied",
            to: "attacker@example.invalid",
            message_text: "  hello  ",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).not.toHaveProperty("recipient_person_id");
        expect(result.value).not.toHaveProperty("to");
        expect(result.value.message_text).toBe("hello");
    });

    it("mutates, so it is audited and requires explicit confirmation", () => {
        expect(sendTourInvitationAction.audit.mutates).toBe(true);
        expect(sendTourInvitationAction.audit.category).toBe("communication");
        expect(sendTourInvitationAction.confirmationPolicy).toBe("required");
    });

    it("placement visibility is documented as presentation, not security", () => {
        expect(sql).toMatch(/visibility is NOT security/i);
    });
});

// --- 13. idempotency --------------------------------------------------------

describe("the provisioning migration is idempotent", () => {
    it("guards both inserts on the natural key", () => {
        const guards = sql.match(/WHERE NOT EXISTS \(/g) ?? [];
        expect(guards.length).toBeGreaterThanOrEqual(2);
    });

    it("guards the definition on (key, org_id)", () => {
        expect(sql).toContain("WHERE x.key = v.key");
        expect(sql).toContain("AND x.org_id IS NOT DISTINCT FROM v.org_id");
    });

    it("guards the placement on its full natural key", () => {
        for (const clause of [
            "ap.surface = 'record_header'",
            "ap.slot = 'overflow'",
            "ap.entity_type = 'opportunity'",
            "ap.department_id IS NULL",
            "ap.work_unit_id IS NULL",
            "ap.section_key IS NULL",
        ]) {
            expect(sql).toContain(clause);
        }
    });

    it("performs no destructive DDL or delete", () => {
        expect(sql).not.toMatch(/\bDROP\b/i);
        expect(sql).not.toMatch(/\bTRUNCATE\b/i);
        expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    });
});

// --- 14. the general parity guard -------------------------------------------

/**
 * Registered handler with no provisioning = unreachable capability.
 *
 * This is the rule that would have caught Slice D on the day it shipped. It is
 * narrowly scoped on purpose: only actions this repository intends operators to
 * invoke are required to be provisioned. A capability that is deliberately
 * dormant, or driven by a host surface rather than the action registry, is
 * listed below with the reason — the list is the argument, not an escape hatch.
 */
const NOT_OPERATOR_PROVISIONED: Record<string, string> = {
    create_lead: "invoked from the global Create surface, not a record's action registry",
    schedule_create: "scheduling composer owns its own invocation surface",
    assignment_set_primary: "assignment actions are invoked from the assignments panel",
    assignment_create: "assignment actions are invoked from the assignments panel",
    assignment_promote_proposed: "assignment actions are invoked from the assignments panel",
    assignment_archive: "assignment actions are invoked from the assignments panel",
    assignment_delete_proposed: "assignment actions are invoked from the assignments panel",
    assignment_change_room: "assignment actions are invoked from the assignments panel",
};

describe("registry and database provisioning stay in parity", () => {
    it("every operator-invocable registered action has a provisioned definition", () => {
        const everySql = allMigrationSql();
        const registered = ["update_status", "confirm_tour", "send_tour_invitation"];

        const unprovisioned = registered
            .filter((key) => !(key in NOT_OPERATOR_PROVISIONED))
            .filter((key) => !everySql.includes(`'${key}'`));

        expect(unprovisioned).toEqual([]);
    });

    it("send_tour_invitation is not on the dormant list — it is operator-facing", () => {
        expect(NOT_OPERATOR_PROVISIONED).not.toHaveProperty("send_tour_invitation");
    });

    it("every dormant entry carries a stated reason", () => {
        for (const [key, reason] of Object.entries(NOT_OPERATOR_PROVISIONED)) {
            expect(reason.length, `${key} needs a reason`).toBeGreaterThan(20);
        }
    });
});

// --- the dispatch branch: provisioned must also mean executable ------------

/**
 * `ui_intent` dispatch used to be a hardcoded chain keyed on action key. A command
 * that was provisioned but had no branch rendered in the Manage menu and did NOTHING
 * when clicked — which reads to an operator as "I sent it" while no invitation, no
 * message and no event were created. Certification hit exactly that.
 *
 * That chain no longer decides reachability: the client resolves a command's host
 * from its capability declaration. So these assertions moved off this one key's
 * branch and onto the rule itself — every registered action must resolve to a host,
 * or it is unreachable no matter how green its handler tests.
 */
describe("the provisioned command is reachable from the client", () => {
    it("resolves send_tour_invitation to Communications compose", () => {
        expect(resolveClientCommandDispatch("send_tour_invitation")).toEqual({
            kind: "communications_composer",
            actionKey: "send_tour_invitation",
            defaultChannel: "email",
        });
    });

    it("leaves NO registered action without a client host", () => {
        // The generalisation the original test reached for: this fails for the next
        // capability that ships a handler no operator can reach.
        const unreachable = listRegisteredActionKeys().filter(
            (key) => resolveClientCommandDispatch(key).kind === "undeclared"
        );
        expect(unreachable).toEqual([]);
    });

    it("does not fire the runtime from the menu click for this command", () => {
        // Compose owns the send; a Manage click must not execute the invitation.
        expect(resolveClientCommandDispatch("send_tour_invitation").kind).not.toBe("actions_runtime");
    });
});
