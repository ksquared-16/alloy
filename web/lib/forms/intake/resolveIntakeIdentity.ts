/**
 * POS-FP8a — non-mutating, match-first identity resolver.
 *
 * Read-only foundation for Processing's "what should happen?" recommendation. It
 * reuses the SAME matching primitives as the legacy intake auto path
 * (`decidePersonMatchFromIdLists`, `normalizeIntake*`, the shared person lookups),
 * so behavior stays in parity — but it WRITES NOTHING. Storage reads are injected
 * (DI) so the orchestration is unit-testable without a database.
 *
 * FP8a scope is the person identity spine (link / create / route). Family /
 * opportunity / child depth and approval-time writes are later (FP8b–c).
 */

import {
    decidePersonMatchFromIdLists,
    normalizeIntakeEmail,
    normalizeIntakePhone,
} from "./intakePersonMatch";

export type IntakeDecision = "link" | "create" | "route";
export type IntakeConfidence = "high" | "medium" | "low" | "none";

export interface IntakeCandidate {
    entityType: "person";
    id: string;
    label: string;
    matchReason: string;
}

export interface ProposedPerson {
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
}

export interface IntakeRecommendation {
    decision: IntakeDecision;
    confidence: IntakeConfidence;
    proposed: { person: ProposedPerson };
    /** Existing records the operator could link to (the matched/ambiguous persons). */
    candidates: IntakeCandidate[];
    /** Identifiers that drove the match, e.g. ["email"], ["phone"]. */
    matchedOn: string[];
    /** Why this routed for review, e.g. ["ambiguous_email"], ["missing_identifiers"]. */
    blockers: string[];
    /** When `decision === "link"`, the candidate to link to. */
    recommendedCandidateId?: string;
}

export interface IntakeIdentityInput {
    orgId: string;
    person: { email: string | null; phone: string | null; firstName: string | null; lastName: string | null };
}

/** Injected read-only storage. No write methods exist — the resolver cannot mutate. */
export interface IntakeIdentityResolverDeps {
    listPersonIdsByEmail(orgId: string, emailNorm: string): Promise<string[]>;
    listPersonIdsByPhone(orgId: string, phoneNorm: string): Promise<string[]>;
    getPersonLabels(orgId: string, ids: string[]): Promise<Map<string, string>>;
}

export async function resolveIntakeIdentity(
    deps: IntakeIdentityResolverDeps,
    input: IntakeIdentityInput
): Promise<IntakeRecommendation> {
    const emailNorm = normalizeIntakeEmail(input.person.email);
    const phoneNorm = normalizeIntakePhone(input.person.phone);
    const proposed: ProposedPerson = {
        email: emailNorm,
        phone: phoneNorm,
        firstName: input.person.firstName?.trim() || null,
        lastName: input.person.lastName?.trim() || null,
    };
    const base = { proposed: { person: proposed } };

    if (!emailNorm && !phoneNorm) {
        return {
            ...base,
            decision: "route",
            confidence: "none",
            candidates: [],
            matchedOn: [],
            blockers: ["missing_identifiers"],
        };
    }

    const emailMatchIds = emailNorm ? await deps.listPersonIdsByEmail(input.orgId, emailNorm) : [];
    const phoneMatchIds = phoneNorm ? await deps.listPersonIdsByPhone(input.orgId, phoneNorm) : [];

    const decision = decidePersonMatchFromIdLists({ emailNorm, phoneNorm, emailMatchIds, phoneMatchIds });

    const labelCandidates = async (ids: string[], matchReason: string): Promise<IntakeCandidate[]> => {
        const labels = await deps.getPersonLabels(input.orgId, ids);
        return ids.map((id) => ({ entityType: "person" as const, id, label: labels.get(id) ?? id, matchReason }));
    };

    switch (decision.kind) {
        case "matched_email": {
            const candidates = await labelCandidates([decision.personId], "parent email");
            return {
                ...base,
                decision: "link",
                confidence: "high",
                candidates,
                matchedOn: ["email"],
                blockers: [],
                recommendedCandidateId: decision.personId,
            };
        }
        case "matched_phone": {
            const candidates = await labelCandidates([decision.personId], "phone");
            return {
                ...base,
                decision: "link",
                confidence: "medium",
                candidates,
                matchedOn: ["phone"],
                blockers: [],
                recommendedCandidateId: decision.personId,
            };
        }
        case "ambiguous_email": {
            const candidates = await labelCandidates(emailMatchIds, "parent email");
            return { ...base, decision: "route", confidence: "low", candidates, matchedOn: ["email"], blockers: ["ambiguous_email"] };
        }
        case "ambiguous_phone": {
            const candidates = await labelCandidates(phoneMatchIds, "phone");
            return { ...base, decision: "route", confidence: "low", candidates, matchedOn: ["phone"], blockers: ["ambiguous_phone"] };
        }
        case "no_match":
        default:
            return { ...base, decision: "create", confidence: "medium", candidates: [], matchedOn: [], blockers: [] };
    }
}
