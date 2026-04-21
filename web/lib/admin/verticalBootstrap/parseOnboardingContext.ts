import type { VerticalBootstrapOnboardingContextV1 } from "@/lib/admin/verticalBootstrap/types";

/**
 * Optional onboarding metadata — validated lightly so the same JSON can round-trip through preview
 * and future services without breaking structural apply.
 */
export function parseOnboardingContext(
    raw: unknown,
    errors: string[]
): VerticalBootstrapOnboardingContextV1 | undefined {
    if (raw === undefined) return undefined;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push("onboarding_context must be an object when present");
        return undefined;
    }
    const o = raw as Record<string, unknown>;
    const out: VerticalBootstrapOnboardingContextV1 = {};

    if (typeof o.industry_key === "string" && o.industry_key.trim() !== "") {
        out.industry_key = o.industry_key.trim();
    }
    if (typeof o.industry_label === "string" && o.industry_label.trim() !== "") {
        out.industry_label = o.industry_label.trim();
    }

    if (o.terminology !== undefined) {
        if (o.terminology === null || typeof o.terminology !== "object" || Array.isArray(o.terminology)) {
            errors.push("onboarding_context.terminology must be a string map");
        } else {
            const t: Record<string, string> = {};
            for (const [k, v] of Object.entries(o.terminology as Record<string, unknown>)) {
                if (typeof v === "string") {
                    t[k] = v;
                }
            }
            out.terminology = t;
        }
    }

    if (o.action_expectations !== undefined) {
        if (!Array.isArray(o.action_expectations)) {
            errors.push("onboarding_context.action_expectations must be an array");
        } else {
            const items: VerticalBootstrapOnboardingContextV1["action_expectations"] = [];
            for (let i = 0; i < o.action_expectations.length; i++) {
                const row = o.action_expectations[i];
                if (row == null || typeof row !== "object" || Array.isArray(row)) {
                    errors.push(`onboarding_context.action_expectations[${i}]: must be an object`);
                    continue;
                }
                const r = row as Record<string, unknown>;
                const id = typeof r.id === "string" ? r.id.trim() : "";
                const description = typeof r.description === "string" ? r.description.trim() : "";
                if (!id || !description) {
                    errors.push(`onboarding_context.action_expectations[${i}]: id and description are required`);
                    continue;
                }
                items.push({
                    id,
                    description,
                    phase: typeof r.phase === "string" ? r.phase : undefined,
                    applies_to: typeof r.applies_to === "string" ? r.applies_to : undefined,
                    deferred_to_product: typeof r.deferred_to_product === "boolean" ? r.deferred_to_product : undefined,
                });
            }
            out.action_expectations = items;
        }
    }

    if (o.starter_field_intake !== undefined) {
        if (o.starter_field_intake === null || typeof o.starter_field_intake !== "object" || Array.isArray(o.starter_field_intake)) {
            errors.push("onboarding_context.starter_field_intake must be an object");
        } else {
            const s = o.starter_field_intake as Record<string, unknown>;
            if (s.registration !== "deferred") {
                errors.push('onboarding_context.starter_field_intake.registration must be "deferred" in v1');
            } else {
                out.starter_field_intake = {
                    registration: "deferred",
                    notes: typeof s.notes === "string" ? s.notes : undefined,
                    suggested_inputs_for_quote: Array.isArray(s.suggested_inputs_for_quote)
                        ? s.suggested_inputs_for_quote.filter((x): x is string => typeof x === "string")
                        : undefined,
                };
            }
        }
    }

    return out;
}
