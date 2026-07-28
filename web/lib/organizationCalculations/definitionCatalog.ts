/**
 * Published population / equivalency options for the definition builder.
 * Exact-version identity only — never silently follows “latest”.
 */

import {
    strategyOperatorLabel,
    strategyShortLabel,
    type EquivalencyStrategyId,
} from "@/lib/organizationWeightings/types";
import { formatEquivalencyDefinitionLines } from "@/lib/organizationWeightings/explain";

export type PublishedPopulationOption = {
    populationId: string;
    versionId: string;
    versionNumber: number;
    name: string;
    predicate: string;
    membershipSummary: string;
    label: string;
};

export type PublishedEquivalencyOption = {
    equivalencyId: string;
    /** @deprecated Use equivalencyId */
    weightingId: string;
    versionId: string;
    versionNumber: number;
    name: string;
    scheme: EquivalencyStrategyId;
    factors: Record<string, number>;
    fullTimeDays: number;
    fullTimeHours: number | null;
    sessionBasis: "days_per_week" | "attendance_type" | null;
    summary: string;
    label: string;
    strategyLabel: string;
};

/** @deprecated Use PublishedEquivalencyOption */
export type PublishedWeightingOption = PublishedEquivalencyOption;

export function mapPublishedPopulations(
    populations: Array<{
        id: string;
        name: string;
        lifecycle: string;
        published_version_id: string | null;
        versions: Array<{
            id: string;
            version_number: number;
            immutable: boolean;
            predicate: string;
            membership_summary: string;
        }>;
    }>,
): PublishedPopulationOption[] {
    const out: PublishedPopulationOption[] = [];
    for (const p of populations) {
        if (p.lifecycle === "archived" || !p.published_version_id) continue;
        const version = p.versions.find((v) => v.id === p.published_version_id && v.immutable);
        if (!version) continue;
        out.push({
            populationId: p.id,
            versionId: version.id,
            versionNumber: version.version_number,
            name: p.name,
            predicate: version.predicate,
            membershipSummary: version.membership_summary,
            label: `${p.name} · v${version.version_number}`,
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function mapPublishedEquivalencies(
    rows: Array<{
        id: string;
        name: string;
        lifecycle: string;
        published_version_id: string | null;
        versions: Array<{
            id: string;
            version_number: number;
            immutable: boolean;
            scheme: EquivalencyStrategyId;
            factors: Record<string, number>;
            full_time_days: number;
            full_time_hours?: number | null;
            session_basis?: "days_per_week" | "attendance_type" | null;
            summary: string;
        }>;
    }>,
): PublishedEquivalencyOption[] {
    const out: PublishedEquivalencyOption[] = [];
    for (const w of rows) {
        if (w.lifecycle === "archived" || !w.published_version_id) continue;
        const version = w.versions.find((v) => v.id === w.published_version_id && v.immutable);
        if (!version) continue;
        out.push({
            equivalencyId: w.id,
            weightingId: w.id,
            versionId: version.id,
            versionNumber: version.version_number,
            name: w.name,
            scheme: version.scheme,
            factors: version.factors,
            fullTimeDays: version.full_time_days,
            fullTimeHours: version.full_time_hours ?? null,
            sessionBasis: version.session_basis ?? null,
            summary: version.summary,
            label: `${w.name} · v${version.version_number}`,
            strategyLabel: strategyShortLabel(version.scheme),
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** @deprecated Use mapPublishedEquivalencies */
export const mapPublishedWeightings = mapPublishedEquivalencies;

/** Equivalencies compatible with a population (V1: all published). */
export function compatibleEquivalenciesForPopulation(
    equivalencies: PublishedEquivalencyOption[],
    _populationVersionId: string | null | undefined,
): PublishedEquivalencyOption[] {
    return equivalencies;
}

/** @deprecated Use compatibleEquivalenciesForPopulation */
export const compatibleWeightingsForPopulation = compatibleEquivalenciesForPopulation;

export function formatEquivalencyTable(equivalency: PublishedEquivalencyOption | null): Array<{
    schedule: string;
    value: string;
}> {
    if (!equivalency) return [];
    if (equivalency.scheme === "unweighted") {
        return [{ schedule: "Each matching child", value: "1.0" }];
    }
    if (equivalency.scheme === "weekly_hours") {
        const hours = equivalency.fullTimeHours ?? 50;
        return [{ schedule: "Scheduled weekly hours", value: `÷ ${hours}` }];
    }
    const asVersion = {
        scheme: equivalency.scheme,
        factors: equivalency.factors,
        full_time_days: equivalency.fullTimeDays,
        full_time_hours: equivalency.fullTimeHours,
        session_basis: equivalency.sessionBasis,
        unmatched_policy: "proportional" as const,
        id: equivalency.versionId,
        version_number: equivalency.versionNumber,
        immutable: true,
        summary: equivalency.summary,
        published_at: null,
        created_at: "",
    };
    return formatEquivalencyDefinitionLines(asVersion).map((line) => {
        const [left, right] = line.split(" = ");
        return { schedule: left ?? line, value: right ?? "" };
    });
}

/** @deprecated Use formatEquivalencyTable */
export const formatWeightingTable = formatEquivalencyTable;

export function equivalencyChoicePrompt(option: PublishedEquivalencyOption | null): string {
    if (!option) return "How should scheduled children count?";
    return strategyOperatorLabel(option.scheme);
}
