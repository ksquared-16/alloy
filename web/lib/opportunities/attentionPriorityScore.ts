import type { OpportunityAttentionSeverity } from "@/lib/opportunities/opportunityAttentionConfig";
import type { AttentionSlaTier } from "@/lib/opportunities/attentionSla";

export type PriorityScoreDimension = "severity" | "sla" | "value" | "multi_reason" | "commitment";

export type PriorityDimensionContribution = {
    dimension: PriorityScoreDimension;
    points: number;
    detail?: Record<string, unknown>;
};

function severityPoints(s: OpportunityAttentionSeverity): number {
    switch (s) {
        case "critical":
            return 100;
        case "high":
            return 75;
        case "medium":
            return 50;
        case "low":
            return 25;
        default:
            return 50;
    }
}

function slaPoints(tier: AttentionSlaTier): number {
    switch (tier) {
        case "ok":
            return 15;
        case "approaching":
            return 55;
        case "breached":
            return 90;
        default:
            return 50;
    }
}

function valuePoints(monetaryValueCents: number | null | undefined): number {
    if (monetaryValueCents == null || !Number.isFinite(monetaryValueCents)) return 35;
    const k = monetaryValueCents / 100000;
    return Math.min(100, Math.max(15, Math.round(20 + k * 12)));
}

/**
 * Deterministic 0–100 priority score (GATE 3 foundation).
 * Weights are tunable later via config — constants here match approved defaults.
 */
export function computeAttentionPriorityScore(input: {
    severities: OpportunityAttentionSeverity[];
    slaTiers: AttentionSlaTier[];
    monetary_value_cents?: number | string | null;
    distinctReasonCount: number;
    hasCommitmentReason: boolean;
    weights?: Partial<Record<PriorityScoreDimension, number>>;
}): { score: number; breakdown: PriorityDimensionContribution[] } {
    const w = {
        severity: input.weights?.severity ?? 0.35,
        sla: input.weights?.sla ?? 0.3,
        value: input.weights?.value ?? 0.15,
        multi_reason: input.weights?.multi_reason ?? 0.1,
        commitment: input.weights?.commitment ?? 0.1,
    };
    const sumW = w.severity + w.sla + w.value + w.multi_reason + w.commitment;

    const worstSeverity = input.severities.reduce<OpportunityAttentionSeverity>((acc, s) => {
        const ord = (x: OpportunityAttentionSeverity) =>
            x === "critical" ? 4 : x === "high" ? 3 : x === "medium" ? 2 : 1;
        return ord(s) > ord(acc) ? s : acc;
    }, "low");

    const worstSla = input.slaTiers.reduce<AttentionSlaTier>((acc, t) => {
        const ord = (x: AttentionSlaTier) => (x === "breached" ? 3 : x === "approaching" ? 2 : 1);
        return ord(t) > ord(acc) ? t : acc;
    }, "ok");

    const sevPts = severityPoints(worstSeverity);
    const slaPts = slaPoints(worstSla);
    const cents =
        input.monetary_value_cents == null
            ? null
            : typeof input.monetary_value_cents === "string"
              ? Number(input.monetary_value_cents)
              : input.monetary_value_cents;
    const valPts = valuePoints(cents);
    const multiBoost = input.distinctReasonCount >= 2 ? Math.min(100, 40 + (input.distinctReasonCount - 2) * 10) : 20;
    const commitPts = input.hasCommitmentReason ? 85 : 25;

    const contrib: PriorityDimensionContribution[] = [
        { dimension: "severity", points: sevPts, detail: { worst: worstSeverity } },
        { dimension: "sla", points: slaPts, detail: { worst: worstSla } },
        { dimension: "value", points: valPts },
        { dimension: "multi_reason", points: multiBoost, detail: { n: input.distinctReasonCount } },
        { dimension: "commitment", points: commitPts, detail: { any: input.hasCommitmentReason } },
    ];

    let raw =
        (sevPts * w.severity +
            slaPts * w.sla +
            valPts * w.value +
            multiBoost * w.multi_reason +
            commitPts * w.commitment) /
        sumW;

    const score = Math.max(0, Math.min(100, Math.round(raw)));
    return { score, breakdown: contrib };
}
