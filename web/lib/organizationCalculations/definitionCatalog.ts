/**
 * Published population / weighting options for the definition builder.
 * Exact-version identity only — never silently follows “latest”.
 */

export type PublishedPopulationOption = {
    populationId: string;
    versionId: string;
    versionNumber: number;
    name: string;
    predicate: string;
    membershipSummary: string;
    label: string;
};

export type PublishedWeightingOption = {
    weightingId: string;
    versionId: string;
    versionNumber: number;
    name: string;
    scheme: "unweighted" | "days_per_week";
    factors: Record<string, number>;
    fullTimeDays: number;
    summary: string;
    label: string;
};

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

export function mapPublishedWeightings(
    weightings: Array<{
        id: string;
        name: string;
        lifecycle: string;
        published_version_id: string | null;
        versions: Array<{
            id: string;
            version_number: number;
            immutable: boolean;
            scheme: "unweighted" | "days_per_week";
            factors: Record<string, number>;
            full_time_days: number;
            summary: string;
        }>;
    }>,
): PublishedWeightingOption[] {
    const out: PublishedWeightingOption[] = [];
    for (const w of weightings) {
        if (w.lifecycle === "archived" || !w.published_version_id) continue;
        const version = w.versions.find((v) => v.id === w.published_version_id && v.immutable);
        if (!version) continue;
        out.push({
            weightingId: w.id,
            versionId: version.id,
            versionNumber: version.version_number,
            name: w.name,
            scheme: version.scheme,
            factors: version.factors,
            fullTimeDays: version.full_time_days,
            summary: version.summary,
            label: `${w.name} · v${version.version_number}`,
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Weightings compatible with a population (V1: all published weightings are compatible). */
export function compatibleWeightingsForPopulation(
    weightings: PublishedWeightingOption[],
    _populationVersionId: string | null | undefined,
): PublishedWeightingOption[] {
    return weightings;
}

export function formatWeightingTable(weighting: PublishedWeightingOption | null): Array<{
    schedule: string;
    value: string;
}> {
    if (!weighting) return [];
    if (weighting.scheme === "unweighted") {
        return [{ schedule: "Each matching child", value: "1.0" }];
    }
    return Object.entries(weighting.factors)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([days, factor]) => ({
            schedule: `${days} day${days === "1" ? "" : "s"} per week`,
            value: Number(factor).toFixed(2),
        }));
}
