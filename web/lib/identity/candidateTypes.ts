/** Canonical identity candidate contracts (Processing Identity Resolution B1b). */

export type IdentitySubjectType =
    | "person"
    | "child"
    | "household"
    | "lead"
    | "process_participation";

export type CandidateConfidenceBand =
    | "confirmed"
    | "strong"
    | "possible"
    | "weak"
    | "conflicted"
    | "excluded";

export type IdentitySignalKind = "supporting" | "contradicting" | "excluding";

export type IdentitySignalStrength = "deterministic" | "strong" | "supporting" | "weak";

export type IdentitySignal = {
    key: string;
    kind: IdentitySignalKind;
    strength: IdentitySignalStrength;
    subjectFactRefs: string[];
    recordFieldRefs: string[];
    reasonCode: string;
    explanation: string;
};

export type IdentityCandidate = {
    subjectRef: string;
    entityType: IdentitySubjectType;
    recordId: string;
    matchedEntityType?: "person" | "customer" | "customer_member" | "opportunity" | "process_instance";
    confidenceBand: CandidateConfidenceBand;
    score?: number;
    signals: IdentitySignal[];
    blockingConflicts: IdentitySignal[];
    explanation: string;
    resolverVersion: string;
    archived?: boolean;
    displayName?: string;
};

export type PersonSubjectInput = {
    subjectRef: string;
    firstName: string;
    lastName: string;
    emailNorm: string | null;
    phoneNorm: string | null;
    role?: "parent" | "guardian";
    factRefs?: string[];
    trustedTokenMatchPersonId?: string | null;
};

export type ChildSubjectInput = {
    subjectRef: string;
    firstName: string;
    lastName: string;
    dob: string | null;
    factRefs?: string[];
    guardianPersonId?: string | null;
};

export type HouseholdGraphContext = {
    orgId: string;
    householdRef: string;
    parentCandidates: IdentityCandidate[];
    childCandidates: IdentityCandidate[];
    householdCustomerId?: string | null;
};
