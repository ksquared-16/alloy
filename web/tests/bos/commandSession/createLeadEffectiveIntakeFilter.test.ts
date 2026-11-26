import { describe, expect, it } from "vitest";

import { filterPayloadToEffectiveIntake } from "@/lib/bos/commandSession/createLeadEffectiveIntakeFilter";
import { CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import { CREATE_LEAD_INTAKE_HOUSEHOLD_KEY } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

function specWithFields(payloadKeys: readonly string[]): ActionIntakeSpec {
    return {
        action_key: "create_lead",
        required: payloadKeys.map((payload_key) => ({
            payload_key,
            label: payload_key,
            field_type: "text",
        })),
        recommended: [],
        optional: [],
    } as unknown as ActionIntakeSpec;
}

describe("filterPayloadToEffectiveIntake", () => {
    const spec = specWithFields(["first_name", "last_name", "child_first_name"]);

    it("keeps the household envelope keys that carry non-primary members", () => {
        // Regression: these are structural envelopes, never intake field keys, so gating them on
        // the spec's field set silently reduced every household to primary parent + primary child.
        const payload = {
            first_name: "Brian",
            last_name: "Fitz",
            [CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY]: '{"parents":[{},{}],"children":[{},{}]}',
            [CREATE_LEAD_INTAKE_HOUSEHOLD_KEY]: '{"parents_guardians":[{},{}],"children":[{},{}]}',
        };
        const out = filterPayloadToEffectiveIntake(payload, spec);
        expect(out[CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY]).toBe(
            payload[CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY]
        );
        expect(out[CREATE_LEAD_INTAKE_HOUSEHOLD_KEY]).toBe(payload[CREATE_LEAD_INTAKE_HOUSEHOLD_KEY]);
    });

    it("still drops fields outside the effective intake", () => {
        const out = filterPayloadToEffectiveIntake(
            { first_name: "Brian", not_in_spec: "x" },
            spec
        );
        expect(out.first_name).toBe("Brian");
        expect(out).not.toHaveProperty("not_in_spec");
    });

    it("keeps the envelope even when Child is not an effective entity", () => {
        // Child entity absent must empty the selection's children (that is
        // filterCommitSelectionToEffectiveIntake's job) — not delete the envelope wholesale,
        // which would also discard every non-primary parent.
        const parentOnly = specWithFields(["first_name", "last_name"]);
        const out = filterPayloadToEffectiveIntake(
            {
                first_name: "Brian",
                child_first_name: "Ember",
                [CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY]: "{}",
            },
            parentOnly
        );
        expect(out).not.toHaveProperty("child_first_name");
        expect(out[CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY]).toBe("{}");
    });
});
