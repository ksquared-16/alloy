/**
 * Feature gate for enforcing requirement policy on entity saves (Card 1).
 * Default: off — parsing/validation on admin writes still runs; runtime enforcement is opt-in.
 */

export function isFieldRequirementPolicyEnforcementEnabled(): boolean {
    const v = process.env.FIELD_REQUIREMENT_POLICY_ENFORCEMENT_ENABLED?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}
