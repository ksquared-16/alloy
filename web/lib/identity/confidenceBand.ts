import type { IntakeRecordMatchConfidence } from "@/lib/intake/resolve/types";
import type { CandidateConfidenceBand } from "./candidateTypes";

/** Map legacy 5-band intake confidence to frozen V1 6-band classifier output. */
export function mapLegacyConfidenceToBand(
    confidence: IntakeRecordMatchConfidence,
    strategy?: "email" | "phone" | "name" | "none",
): CandidateConfidenceBand {
    switch (confidence) {
        case "exact_match":
            if (strategy === "email" || strategy === "phone") return "confirmed";
            return "strong";
        case "probable_match":
            return "strong";
        case "possible_match":
            return "possible";
        case "conflict":
            return "conflicted";
        case "no_match":
            return "excluded";
        default:
            return "weak";
    }
}

export function bandRank(band: CandidateConfidenceBand): number {
    switch (band) {
        case "confirmed":
            return 6;
        case "strong":
            return 5;
        case "possible":
            return 4;
        case "weak":
            return 3;
        case "conflicted":
            return 2;
        case "excluded":
            return 1;
        default:
            return 0;
    }
}

/** Deterministic ordering: higher band first, then record id lexicographic. */
export function sortCandidatesByBand<T extends { confidenceBand: CandidateConfidenceBand; recordId: string }>(
    candidates: T[],
): T[] {
    return [...candidates].sort((a, b) => {
        const diff = bandRank(b.confidenceBand) - bandRank(a.confidenceBand);
        if (diff !== 0) return diff;
        return a.recordId.localeCompare(b.recordId);
    });
}
