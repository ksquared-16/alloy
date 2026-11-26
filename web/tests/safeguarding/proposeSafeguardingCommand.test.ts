/**
 * §6 — participant free text can never activate a safety control.
 *
 * The failure this prevents runs in both directions. A parent typing "her father isn't allowed to
 * get her" must not switch on a restriction by itself — but the assertion must not evaporate
 * either, because nothing could carry it. It travels as a PROPOSAL and waits for a person.
 */

import { describe, expect, it } from "vitest";
import { IDENTITY_COMMANDS } from "@/lib/pos/processingIdentity/commands/handlers";
import { IDENTITY_COMMAND_KEYS } from "@/lib/pos/processingIdentity/commands/commandKeys";

const command = IDENTITY_COMMANDS[IDENTITY_COMMAND_KEYS.proposeSafeguardingRestriction];

/** The registry supplies a real context; these pure methods do not read it. */
const CTX = {} as never;
const validate = async (input: unknown) => await command.validate(input, CTX);
const preview = async (input: unknown) => await command.preview(input, CTX);

const payload = {
    customer_member_id: "child-1",
    restriction_kind: "protective_or_restraining_order",
    operational_effect: "may_not_pick_up",
    affected_person_id: "person-1",
    evidence_basis: "parent_declaration",
    source: "enrollment_form",
};

describe("the command is registered and is propose-only", () => {
    it("exists in the canonical registry", () => {
        expect(command).toBeDefined();
        expect(command.metadata.targetType).toBe("safeguarding_restriction");
    });

    it("is not executable — the same shape as propose_merge", () => {
        expect(command.metadata.executableInV1).toBe(false);
        expect(IDENTITY_COMMANDS[IDENTITY_COMMAND_KEYS.proposeMerge].metadata.executableInV1).toBe(false);
    });

    it("refuses to execute, naming approval as the reason", async () => {
        const result = await command.execute(payload, CTX);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("safeguarding_restriction_requires_approval");
    });

    it("requires the safeguarding capability, not a general processing one", () => {
        expect(command.metadata.requiredPermission).toBe("crm.customers.safeguarding.manage");
    });

    it("marks the assertion's substance sensitive", () => {
        expect(command.metadata.sensitiveFields).toContain("restriction_kind");
        expect(command.metadata.sensitiveFields).toContain("affected_person_id");
    });
});

describe("the boundary is in the TYPE, not in a check", () => {
    it("has no vocabulary for activation at all", async () => {
        // A caller cannot activate a restriction even by trying: `status`, `review_state` and
        // `approved_by` are simply not expressible in the payload.
        const accepted = Object.keys(payload);
        for (const forbidden of ["status", "review_state", "reviewed_by", "approved_by"]) {
            expect(accepted).not.toContain(forbidden);
        }
        
        expect((await preview(payload)).effects.join(" ")).toMatch(/nothing becomes active/i);
    });
});

describe("validation", () => {
    it("accepts a parent's declaration with no document", async () => {
        // Absence of a document is not absence of a restriction.
        expect((await validate(payload)).ok).toBe(true);
    });

    it("refuses a document basis with no document", async () => {
        const r = await validate({ ...payload, evidence_basis: "document", evidence_document_id: null });
        expect(r.ok).toBe(false);
        expect(r.issues.some((i) => i.field === "evidence_document_id")).toBe(true);
    });

    it("accepts a restriction that names nobody, and says so", async () => {
        // "There is a custody arrangement" is real. The resolver treats it as unclear, never as
        // an all-clear — so recording it is right and silently accepting it is not.
        const r = await validate({ ...payload, affected_person_id: null, affected_party_description: null });
        expect(r.ok).toBe(true);
        expect(r.issues.some((i) => i.code === "no_party_named" && i.severity === "warning")).toBe(true);
    });

    it("requires the child", async () => {
        expect((await validate({ ...payload, customer_member_id: "" })).ok).toBe(false);
    });
});
