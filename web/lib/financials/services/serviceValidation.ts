/**
 * Service operational validation (Alloy Services V1 blueprint §15, §V1.8).
 *
 * Validation speaks operational *consequence*, not form constraints, and routes
 * to a fix. Severities: "attention" (ember — would break billing), "advisory"
 * (gold — suboptimal but safe), "info" (stone). Pure — computed from the
 * service's capabilities + the relationship facts the UI already has (does it
 * have a Rate Plan? a revenue home?). Never blocks understanding.
 */

import type { ServiceCapabilityMap } from "@/lib/financials/services/serviceCapabilities";
import { rhythmOf, type ServiceRhythm } from "@/lib/financials/services/serviceCapabilities";
import type { FinancialServiceType } from "@/lib/financials/services/financialServicesStore";

export type ServiceValidationSeverity = "attention" | "advisory" | "info";

export type ServiceValidationFinding = {
    severity: ServiceValidationSeverity;
    /** Which card / area this decorates. */
    target: "pricing" | "switchboard" | "revenue" | "identity";
    message: string;
    /** Optional fix path label (deep-link target, e.g. "Rate Plans", "Accounting"). */
    fixLabel?: string;
};

export type ServiceValidationContext = {
    label: string;
    serviceType: FinancialServiceType;
    capabilities: ServiceCapabilityMap;
    /** Does this service have at least one Rate Plan attached? */
    hasRatePlan: boolean;
    /** Does this service have a default revenue category mapped? */
    hasRevenueHome: boolean;
};

/**
 * Compute the operational findings for a service. Order: attention first.
 */
export function validateService(ctx: ServiceValidationContext): ServiceValidationFinding[] {
    const findings: ServiceValidationFinding[] = [];
    const rhythm: ServiceRhythm = rhythmOf(ctx.serviceType);
    const caps = ctx.capabilities;

    // Attention — recurring, priced by a Rate Plan, but no price exists.
    if (rhythm === "recurring" && caps.uses_rate_plans && !ctx.hasRatePlan) {
        findings.push({
            severity: "attention",
            target: "pricing",
            message: `${ctx.label} is recurring but has no price. A family enrolling today would have no tuition.`,
            fixLabel: "Rate Plans",
        });
    }

    // Attention — no revenue home means charges couldn't post.
    if (!ctx.hasRevenueHome) {
        findings.push({
            severity: "attention",
            target: "revenue",
            message: `${ctx.label}'s revenue has no home yet — charges couldn't post.`,
            fixLabel: "Accounting",
        });
    }

    // Advisory — tracks attendance but creates no schedule (attended-days pricing has nothing to schedule against).
    if (caps.tracks_attendance && !caps.creates_schedule) {
        findings.push({
            severity: "advisory",
            target: "switchboard",
            message: `${ctx.label} tracks attendance but creates no schedule — attended-days pricing would have nothing to schedule against.`,
        });
    }

    // Advisory — priced by a Rate Plan but not a recurring service (Rate Plans are for recurring tuition).
    if (caps.uses_rate_plans && rhythm !== "recurring") {
        findings.push({
            severity: "advisory",
            target: "switchboard",
            message: `${ctx.label} is priced by a Rate Plan, but Rate Plans are meant for recurring tuition. Recurring services use Rate Plans; one-time and usage charges live in Charges.`,
        });
    }

    // Advisory — capacity without scheduling on a recurring service is unusual.
    if (rhythm === "recurring" && caps.consumes_capacity && !caps.creates_schedule) {
        findings.push({
            severity: "advisory",
            target: "switchboard",
            message: `${ctx.label} consumes capacity but creates no schedule — capacity is usually consumed by scheduled enrollments.`,
        });
    }

    return findings;
}

/** The single worst severity present (for the queue glyph / card decoration). */
export function worstSeverity(findings: ServiceValidationFinding[]): ServiceValidationSeverity | null {
    if (findings.some((f) => f.severity === "attention")) return "attention";
    if (findings.some((f) => f.severity === "advisory")) return "advisory";
    if (findings.some((f) => f.severity === "info")) return "info";
    return null;
}
