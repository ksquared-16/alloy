import type { IdentitySignal, IdentitySignalKind, IdentitySignalStrength } from "./candidateTypes";

export function makeSignal(input: {
    key: string;
    kind: IdentitySignalKind;
    strength: IdentitySignalStrength;
    reasonCode: string;
    explanation: string;
    subjectFactRefs?: string[];
    recordFieldRefs?: string[];
}): IdentitySignal {
    return {
        key: input.key,
        kind: input.kind,
        strength: input.strength,
        subjectFactRefs: input.subjectFactRefs ?? [],
        recordFieldRefs: input.recordFieldRefs ?? [],
        reasonCode: input.reasonCode,
        explanation: input.explanation,
    };
}

export function signalsFromLegacyEvaluation(input: {
    confidence: import("@/lib/intake/resolve/types").IntakeRecordMatchConfidence;
    reasons: string[];
    blockingConflicts?: string[];
    strategy?: "email" | "phone" | "name" | "none";
    factRefs?: string[];
}): { signals: IdentitySignal[]; blockingConflicts: IdentitySignal[] } {
    const signals: IdentitySignal[] = [];
    const blockingConflicts: IdentitySignal[] = [];

    if (input.strategy === "email" && input.confidence !== "no_match") {
        signals.push(
            makeSignal({
                key: "exact_email",
                kind: "supporting",
                strength: "deterministic",
                reasonCode: "exact_email_match",
                explanation: "Exact canonical email match within organization.",
                subjectFactRefs: input.factRefs,
                recordFieldRefs: ["persons.email"],
            }),
        );
    }
    if (input.strategy === "phone" && input.confidence !== "no_match") {
        signals.push(
            makeSignal({
                key: "exact_phone",
                kind: "supporting",
                strength: "deterministic",
                reasonCode: "exact_phone_match",
                explanation: "Exact phone variant match within organization.",
                subjectFactRefs: input.factRefs,
                recordFieldRefs: ["persons.phone"],
            }),
        );
    }
    if (input.strategy === "name") {
        signals.push(
            makeSignal({
                key: "name_match",
                kind: "supporting",
                strength: "supporting",
                reasonCode: "full_name_match",
                explanation: "Full name match without stronger contact signal.",
                subjectFactRefs: input.factRefs,
                recordFieldRefs: ["persons.first_name", "persons.last_name"],
            }),
        );
    }

    for (const code of input.blockingConflicts ?? []) {
        blockingConflicts.push(
            makeSignal({
                key: code,
                kind: "contradicting",
                strength: "strong",
                reasonCode: code,
                explanation: input.reasons.join(" "),
                subjectFactRefs: input.factRefs,
            }),
        );
    }

    if (input.confidence === "conflict" && blockingConflicts.length === 0) {
        blockingConflicts.push(
            makeSignal({
                key: "legacy_conflict",
                kind: "contradicting",
                strength: "strong",
                reasonCode: "legacy_conflict",
                explanation: input.reasons.join(" "),
                subjectFactRefs: input.factRefs,
            }),
        );
    }

    return { signals, blockingConflicts };
}
