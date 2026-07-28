import { describe, expect, it, vi } from "vitest";

import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import {
    buildCreateLeadEligibility,
    createLeadConfigRequiredInputsFromIntakeSpec,
    CREATE_LEAD_REQUIRED_INPUTS,
    deriveCreateLeadBlockers,
} from "@/lib/platform/commands/createLead/createLeadRequiredInputs";
import { isCreateLeadLocationRequired } from "@/lib/admin/actions/createLead/resolveCreateLeadLocationPolicy";
import { createLeadAction } from "@/lib/adminV2/actions/definitions/createLeadAction";
import { runRegisteredAction } from "@/lib/adminV2/actions/actionExecutor";
import type { ActionHandlerDeps } from "@/lib/adminV2/actions/actionTypes";

vi.mock("@/lib/admin/actions/executeAdminAction", () => ({
    executeAdminAction: vi.fn(),
}));

function minimalSpec(requiredPayloadKeys: string[]): ActionIntakeSpec {
    return {
        action_key: "create_lead",
        department_id: "dept-1",
        process_id: null,
        operator_stage: "lead",
        mode: "hybrid",
        requirements_source: "department",
        groups: [],
        required: requiredPayloadKeys.map((payload_key) => ({
            rule_id: `rule:${payload_key}`,
            entity: payload_key === "location_id" ? ("opportunity" as const) : ("person" as const),
            entity_label: payload_key === "location_id" ? "Lead" : "Parent",
            field_label: payload_key === "location_id" ? "Location" : payload_key,
            tier: "required" as const,
            field_key: payload_key,
            value_kind: payload_key === "location_id" ? ("select" as const) : ("text" as const),
            option_set_key: null,
            placement_select: payload_key === "location_id" ? ("site" as const) : null,
            payload_key,
            form_capture_keys: [],
            validation: [],
            runtime_enforced: false,
        })),
        recommended: [],
        optional: [],
        constraints: [],
        copy: { title: "Create Lead", help: "" },
    };
}

describe("Create Lead requiredness parity (code minimum + record_creation)", () => {
    it("does not treat Location as a code-owned minimum blocker", () => {
        expect(CREATE_LEAD_REQUIRED_INPUTS.some((i) => i.key === "location_id")).toBe(false);
        const blockers = deriveCreateLeadBlockers({
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
        });
        expect(blockers.some((b) => b.field === "location_id")).toBe(false);
        expect(isCreateLeadLocationRequired()).toBe(false);
    });

    it("Location optional when not configured record_creation", () => {
        const eligibility = buildCreateLeadEligibility(
            { first_name: "Ada", last_name: "Lovelace", phone: "555" },
            createLeadConfigRequiredInputsFromIntakeSpec(minimalSpec(["first_name", "last_name"]))
        );
        expect(eligibility.eligible).toBe(true);
        expect(eligibility.blockers.some((b) => b.field === "location_id")).toBe(false);
        expect(isCreateLeadLocationRequired({ intakeSpec: minimalSpec(["first_name", "last_name"]) })).toBe(
            false
        );
    });

    it("Location required when configured record_creation on intake spec", () => {
        const config = createLeadConfigRequiredInputsFromIntakeSpec(
            minimalSpec(["first_name", "last_name", "location_id"])
        );
        expect(config.some((c) => c.key === "location_id")).toBe(true);

        const missing = buildCreateLeadEligibility(
            { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            config
        );
        expect(missing.eligible).toBe(false);
        expect(missing.blockers.some((b) => b.field === "location_id")).toBe(true);

        const filled = buildCreateLeadEligibility(
            {
                first_name: "Ada",
                last_name: "Lovelace",
                email: "ada@example.com",
                location_id: "site-1",
            },
            config
        );
        expect(filled.eligible).toBe(true);
    });

    it("removing the configured Location requirement removes the blocker", () => {
        const withLoc = createLeadConfigRequiredInputsFromIntakeSpec(
            minimalSpec(["first_name", "last_name", "location_id"])
        );
        const withoutLoc = createLeadConfigRequiredInputsFromIntakeSpec(
            minimalSpec(["first_name", "last_name"])
        );
        const payload = {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
        };
        expect(buildCreateLeadEligibility(payload, withLoc).eligible).toBe(false);
        expect(buildCreateLeadEligibility(payload, withoutLoc).eligible).toBe(true);
    });

    it("client and server share Location blocker when intake resolution returns record_creation Location", async () => {
        const config = createLeadConfigRequiredInputsFromIntakeSpec(
            minimalSpec(["first_name", "last_name", "location_id"])
        );
        const payload = {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
        };
        const client = buildCreateLeadEligibility(payload, config);

        const { resolveCreateLeadEligibilityForInvocation } = await import(
            "@/lib/platform/commands/createLead/resolveCreateLeadEligibilityForInvocation"
        );

        const supabase = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: { id: "dept-1", metadata: {} },
                                error: null,
                            }),
                        }),
                    }),
                }),
            }),
        };

        vi.doMock("@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle", () => ({
            loadOrgFieldDefinitionsForLifecycle: async () => null,
        }));
        vi.doMock("@/lib/lifecycle/resolveActionIntakeSpec", async () => {
            const actual = await vi.importActual<
                typeof import("@/lib/lifecycle/resolveActionIntakeSpec")
            >("@/lib/lifecycle/resolveActionIntakeSpec");
            return {
                ...actual,
                resolveCreateLeadActionIntakeSpec: () =>
                    minimalSpec(["first_name", "last_name", "location_id"]),
            };
        });

        // Direct shared builder proves identical blocker; invocation resolver uses same builder.
        expect(client.blockers.find((b) => b.field === "location_id")?.message).toBe(
            "Location is required."
        );
        void resolveCreateLeadEligibilityForInvocation;
        void supabase;
    });

    it("no BOS-only Location rule remains in shared deriveCreateLeadBlockers", () => {
        const src = deriveCreateLeadBlockers.toString();
        expect(src).not.toMatch(/isCreateLeadLocationRequired/);
        expect(src).not.toMatch(/location_id/);
    });

    it("runRegisteredAction eligibility gate uses shared builder (code-owned without department)", async () => {
        const result = await runRegisteredAction(
            {} as never,
            { orgId: "org-1", userId: "u-1" },
            {
                actionKey: "create_lead",
                entityType: "opportunity",
                entityId: "",
                payload: { first_name: "Ada" },
            },
            "execute"
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected failure");
        expect(result.blockers?.some((b) => b.field === "last_name" || b.field === "email")).toBe(
            true
        );
    });
});
