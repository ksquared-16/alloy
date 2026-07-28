/**
 * Director-readable equivalency explanations (no implementation jargon).
 */

import {
    normalizeEquivalencyStrategy,
    strategyShortLabel,
    type EquivalencyVersion,
} from "@/lib/organizationWeightings/types";

export function formatEquivalencyDefinitionLines(version: EquivalencyVersion): string[] {
    const strategy = normalizeEquivalencyStrategy(version.scheme);
    if (strategy === "unweighted") {
        return ["Each matching child counts as 1"];
    }
    if (strategy === "weekly_hours") {
        const hours = version.full_time_hours ?? 50;
        return [`Scheduled weekly hours ÷ ${hours}`];
    }
    if (strategy === "category") {
        return Object.entries(version.factors)
            .filter(([k]) => !["ft", "pt", "full-time", "part-time"].includes(k))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${humanCategory(k)} = ${formatFactor(v)}`);
    }
    // session_or_day
    if (version.session_basis === "attendance_type") {
        return Object.entries(version.factors)
            .filter(([k]) => !k.includes("-") || k === k.toLowerCase())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${humanCategory(k)} = ${formatFactor(v)}`);
    }
    return Object.entries(version.factors)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([days, factor]) => `${days} day${days === "1" ? "" : "s"} = ${formatFactor(factor)}`);
}

function humanCategory(key: string): string {
    return key
        .replace(/_/g, " ")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFactor(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function buildEquivalentCountExplanation(args: {
    populationName: string;
    roomLabel?: string | null;
    strategy: EquivalencyVersion;
    equivalentValue: number;
    memberCount: number;
}): string[] {
    const room = args.roomLabel?.trim() || null;
    const who =
        room ? `${args.populationName} in ${room}` : args.populationName;
    const lines: string[] = [
        "Population",
        who,
        "Strategy",
        strategyShortLabel(args.strategy.scheme),
        "Equivalent definition",
        ...formatEquivalencyDefinitionLines(args.strategy),
        "Equivalent children",
        String(args.equivalentValue),
    ];
    return lines;
}
