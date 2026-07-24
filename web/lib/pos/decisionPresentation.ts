/**
 * Decision Conversation presentation resolver.
 *
 * ONE place that translates the canonical engine output — the identity recommendation
 * (`resolveIntakeIdentity`: link / create / route + confidence) plus the form's configured
 * operational intent — into the operator-facing decision language the Digital Mailroom shows.
 *
 * The engine vocabulary is unchanged. This layer never re-decides; it only names things:
 *   • the business NOUN + ACTION come from the form's Purpose / Intent (not hardcoded globally)
 *   • READINESS/CONFIDENCE is corrected here so a create-new with a searched-but-unmatched
 *     identifier reads as "Ready to create", not "medium confidence" (§2). No raw scoring
 *     terminology leaks to the UI.
 */

import type { IntakeRecommendation } from "@/lib/forms/intake/resolveIntakeIdentity";
import type { OperationalIntentKey } from "@/lib/forms/operationalIntentTemplates";

/** Business noun for each configured intent. Fallback is intentionally generic + safe. */
const INTENT_NOUN: Record<OperationalIntentKey, string> = {
    enrollment_lead: "enrollment lead",
    existing_family: "enrollment lead",
    waitlist: "waitlist opportunity",
    operational_document: "document",
    packet_step: "packet step",
    custom: "record",
};

/** Readiness/confidence tone — drives label styling (semantic, not raw scores). */
export type DecisionReadinessTone = "ready" | "match" | "review" | "neutral";

export interface DecisionReadiness {
    /** Operator-facing label, e.g. "Ready to create", "High-confidence match", "Review advised". */
    label: string;
    /** One supporting line, e.g. "No existing match found.", "Exact parent email match." */
    detail: string;
    tone: DecisionReadinessTone;
}

export interface DecisionPresentation {
    /** Business noun derived from the form intent, e.g. "enrollment lead". */
    noun: string;
    /** Top pill: "Create new" | "Link existing" | "Route for review". */
    recommendsLabel: string;
    /** Sentence headline, e.g. "Create a new enrollment lead". */
    headline: string;
    /** Approve-bar action, e.g. "Create enrollment lead" | "Link existing". */
    approveAction: string;
    readiness: DecisionReadiness;
}

function capitalizeFirst(s: string): string {
    return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Resolve the business noun for a form's configured intent, with a safe fallback. */
export function decisionNounForIntent(intent: OperationalIntentKey | null | undefined): string {
    if (intent && intent in INTENT_NOUN) return INTENT_NOUN[intent];
    return "record";
}

/**
 * Corrected readiness semantics (§2). Separates:
 *   • create-new readiness (no match found + a searched identifier → Ready to create)
 *   • match confidence (exact deterministic id → High-confidence match)
 *   • review gating (weak/missing/ambiguous identifiers → Review advised)
 */
export function resolveDecisionReadiness(rec: IntakeRecommendation): DecisionReadiness {
    const hasIdentifier = Boolean(rec.proposed.person.email || rec.proposed.person.phone);

    if (rec.decision === "create") {
        // Engine only reaches "create" after a successful identifier search returned no candidate.
        return hasIdentifier
            ? { label: "Ready to create", detail: "No existing match found.", tone: "ready" }
            : { label: "Review advised", detail: "Not enough information to create automatically.", tone: "review" };
    }

    if (rec.decision === "link") {
        // Exact deterministic identifier (normalized email OR phone) uniquely matched one record.
        const via = rec.matchedOn.includes("email")
            ? "Exact parent email match."
            : rec.matchedOn.includes("phone")
              ? "Exact phone number match."
              : "Exact identifier match.";
        return { label: "High-confidence match", detail: via, tone: "match" };
    }

    // route
    if (rec.blockers.includes("missing_identifiers")) {
        return { label: "Review advised", detail: "No email or phone was captured to match on.", tone: "review" };
    }
    if (rec.blockers.includes("ambiguous_email")) {
        return { label: "Review advised", detail: "Several records share this email — confirm which is right.", tone: "review" };
    }
    if (rec.blockers.includes("ambiguous_phone")) {
        return { label: "Review advised", detail: "Several records share this phone — confirm which is right.", tone: "review" };
    }
    return { label: "Review advised", detail: "Alloy could not settle this automatically.", tone: "review" };
}

export interface DecisionPresentationInput {
    recommendation: IntakeRecommendation;
    intent: OperationalIntentKey | null | undefined;
}

/** Translate a recommendation + configured intent into operator-facing decision language. */
export function resolveDecisionPresentation(input: DecisionPresentationInput): DecisionPresentation {
    const noun = decisionNounForIntent(input.intent);
    const readiness = resolveDecisionReadiness(input.recommendation);
    const decision = input.recommendation.decision;

    if (decision === "create") {
        return {
            noun,
            recommendsLabel: "Create new",
            headline: `Create a new ${noun}`,
            approveAction: `Create ${noun}`,
            readiness,
        };
    }
    if (decision === "link") {
        return {
            noun,
            recommendsLabel: "Link existing",
            headline: `Link to an existing ${noun}`,
            approveAction: "Link existing",
            readiness,
        };
    }
    return {
        noun,
        recommendsLabel: "Route for review",
        headline: "Route for human review",
        approveAction: "Route for review",
        readiness,
    };
}

/** Approve-bar label for a resolved decision, e.g. "Approve — Create enrollment lead". */
export function approveButtonLabel(presentation: DecisionPresentation): string {
    return `Approve — ${capitalizeFirst(presentation.approveAction)}`;
}
