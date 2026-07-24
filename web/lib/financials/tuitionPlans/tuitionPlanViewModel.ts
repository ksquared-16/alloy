import {
    ATTENDANCE_TYPE_LABELS,
    type AttendanceType,
    type ProgramOffering,
} from "@/lib/programs/programOfferings";
import {
    sortVariants,
    variantDisplayLabel,
    type ProgramOfferingVariant,
} from "@/lib/programs/programOfferingVariants";
import {
    buildTuitionRateMap,
    formatRateCents,
    tuitionRateCellKey,
    type TuitionRateRow,
} from "@/lib/commercial/tuitionRates";
import { cadenceLabel, type BillingCadence } from "@/lib/commercial/billingCadences";
import {
    formatTuitionDateLabel,
    isRateCurrent,
    isRateUpcoming,
    parseMetaString,
    readPriceHistory,
    readTuitionLocationApplicability,
    todayIso,
    TUITION_BILLING_FREQUENCY_META_KEY,
    TUITION_REVENUE_CATEGORY_META_KEY,
} from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";

export type TuitionPlanOperatorStatus = "draft" | "scheduled" | "active" | "ended" | "archived";

export type TuitionPlanCollectionRow = {
    id: string;
    name: string;
    programKey: string;
    programLabel: string;
    careFormatLabel: string;
    billingFrequencyKey: string | null;
    billingFrequencyLabel: string;
    enrollmentOptionsCount: number;
    priceRangeLabel: string | null;
    priceMinCents: number | null;
    priceMaxCents: number | null;
    availabilityLabel: string;
    nextChangeLabel: string | null;
    nextChangeDate: string | null;
    status: TuitionPlanOperatorStatus;
    statusLabel: string;
    hasRevenueGl: boolean;
};

export type TuitionOptionRow = {
    variantId: string;
    commitmentLabel: string;
    organizationPriceCents: number | null;
    organizationPriceLabel: string;
    locationOverrideCount: number;
    locationDifferencesLabel: string;
    effectiveSince: string | null;
    effectiveSinceLabel: string;
    status: "active" | "scheduled" | "ended" | "not_offered" | "unset";
    statusLabel: string;
    rateId: string | null;
    notOffered: boolean;
};

export type TuitionLocationSummaryRow = {
    locationId: string;
    locationName: string;
    behavior: "organization" | "customized";
    behaviorLabel: string;
    overrideCount: number;
    nextChangeLabel: string | null;
};

export type TuitionPlanDetailVm = {
    id: string;
    name: string;
    programKey: string;
    programLabel: string;
    careFormat: AttendanceType;
    careFormatLabel: string;
    billingFrequencyKey: string | null;
    billingFrequencyLabel: string;
    enrollmentOptionsCount: number;
    appliesToLabel: string;
    revenueCategoryId: string | null;
    revenueGlLabel: string | null;
    revenueGlAccountId: string | null;
    status: TuitionPlanOperatorStatus;
    statusLabel: string;
    currentAsOfLabel: string;
    priceMinCents: number | null;
    priceMaxCents: number | null;
    priceRangeLabel: string | null;
    lowestOption: { label: string; priceLabel: string } | null;
    highestOption: { label: string; priceLabel: string } | null;
    locationsWithOverrides: { locationId: string; locationName: string; overrideCount: number }[];
    upcomingChange: {
        effectiveDate: string;
        effectiveDateLabel: string;
        summary: string;
    } | null;
    options: TuitionOptionRow[];
    locationSummaries: TuitionLocationSummaryRow[];
    offering: ProgramOffering;
    variants: ProgramOfferingVariant[];
};

export type TuitionHistoryPeriod = {
    key: string;
    start: string | null;
    end: string | null;
    label: string;
    rows: { commitmentLabel: string; priceLabel: string }[];
};

export type PlanReadinessChip = "ready" | "needs_gl" | "no_tuition";

export type PlanReadinessChipVm = {
    chip: PlanReadinessChip;
    label: string;
};

export function derivePlanReadinessChip(detail: Pick<
    TuitionPlanDetailVm,
    "revenueCategoryId" | "priceRangeLabel" | "enrollmentOptionsCount" | "options"
>): PlanReadinessChipVm {
    const hasGl = Boolean(detail.revenueCategoryId);
    const hasTuition = Boolean(
        detail.priceRangeLabel ||
            detail.options.some((row) => row.organizationPriceCents != null && row.status === "active"),
    );
    if (!hasGl) return { chip: "needs_gl", label: "Accounting assignment needed" };
    if (!hasTuition) return { chip: "no_tuition", label: "Tuition not set" };
    return { chip: "ready", label: "Ready to use" };
}

export type TuitionSetupReadinessVm = {
    glCodes: { ok: boolean; count: number; actionLabel: string; href: string };
    billingFrequencies: { ok: boolean; count: number; actionLabel: string; href: string };
    enrollmentCommitments: { ok: boolean; count: number; actionLabel: string; href: string };
    tuitionPlans: { ok: boolean; count: number; actionLabel: string };
    locationOverrides: { ok: boolean; count: number; actionLabel: string };
    showGuide: boolean;
};

function statusLabel(status: TuitionPlanOperatorStatus): string {
    switch (status) {
        case "draft":
            return "Draft";
        case "scheduled":
            return "Scheduled";
        case "active":
            return "Active";
        case "ended":
            return "Ended";
        case "archived":
            return "Archived";
    }
}

function mapOfferingStatus(offering: ProgramOffering, hasFutureRate: boolean): TuitionPlanOperatorStatus {
    if (!offering.is_active || offering.status === "archived" || offering.status === "retired") {
        return "archived";
    }
    if (offering.status === "draft") return "draft";
    if (hasFutureRate) return "scheduled";
    if (offering.effective_end && offering.effective_end < todayIso()) return "ended";
    return "active";
}

/**
 * Availability label for a Tuition Plan — prefers the operator-selected
 * `tuition_location_ids` metadata, falling back to legacy program site count
 * for plans that predate location targeting.
 */
export function tuitionAvailabilityLabel(
    offering: ProgramOffering,
    totalLocations: number,
    siteCount: number,
): string {
    const applicability = readTuitionLocationApplicability(offering.metadata);
    if (applicability.mode === "selected") {
        const count = applicability.locationIds.length;
        return count === 0 ? "No locations" : `${count} location${count === 1 ? "" : "s"}`;
    }
    return siteCount <= 0 ? "No locations"
        : siteCount >= totalLocations && totalLocations > 0 ? "All locations"
        : `${siteCount} locations`;
}

export function readPlanBillingFrequencyKey(offering: ProgramOffering): string | null {
    return parseMetaString(offering.metadata, TUITION_BILLING_FREQUENCY_META_KEY);
}

export function readPlanRevenueCategoryId(offering: ProgramOffering): string | null {
    return parseMetaString(offering.metadata, TUITION_REVENUE_CATEGORY_META_KEY);
}

export function derivePrimaryCadence(
    offering: ProgramOffering,
    variants: ProgramOfferingVariant[],
    rates: TuitionRateRow[],
    cadences: BillingCadence[],
): string | null {
    const stored = readPlanBillingFrequencyKey(offering);
    if (stored) return stored;
    const variantIds = new Set(variants.map((v) => v.id));
    const counts = new Map<string, number>();
    for (const rate of rates) {
        if (rate.location_id != null) continue;
        if (!variantIds.has(rate.variant_id)) continue;
        if (rate.not_offered) continue;
        counts.set(rate.cadence_key, (counts.get(rate.cadence_key) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = -1;
    for (const [key, count] of counts) {
        if (count > bestCount) {
            best = key;
            bestCount = count;
        }
    }
    if (best) return best;
    return cadences[0]?.item_key ?? "monthly";
}

export function buildTuitionSetupReadiness(input: {
    revenueCategoryCount: number;
    cadenceCount: number;
    commitmentPatternCount: number;
    planCount: number;
    overrideCount: number;
}): TuitionSetupReadinessVm {
    const glOk = input.revenueCategoryCount > 0;
    const freqOk = input.cadenceCount > 0;
    const commitOk = input.commitmentPatternCount > 0;
    const plansOk = input.planCount > 0;
    return {
        glCodes: {
            ok: glOk,
            count: input.revenueCategoryCount,
            actionLabel: "Set up GL Codes",
            href: "/organization/financials?chapter=accounting",
        },
        billingFrequencies: {
            ok: freqOk,
            count: input.cadenceCount,
            actionLabel: "Manage Billing Frequencies",
            href: "/organization/financials?chapter=tuition&setup=frequencies",
        },
        enrollmentCommitments: {
            ok: commitOk,
            count: input.commitmentPatternCount,
            actionLabel: "Manage Enrollment Commitments",
            href: "/organization/financials?chapter=tuition&setup=commitments",
        },
        tuitionPlans: {
            ok: plansOk,
            count: input.planCount,
            actionLabel: "Create Tuition Plan",
        },
        locationOverrides: {
            ok: true,
            count: input.overrideCount,
            actionLabel: "Review Location Overrides",
        },
        showGuide: !(glOk && freqOk && commitOk && plansOk),
    };
}

export function buildTuitionPlanCollectionRows(input: {
    offerings: ProgramOffering[];
    variants: ProgramOfferingVariant[];
    rates: TuitionRateRow[];
    programs: { key: string; label: string; siteCount: number }[];
    locations: { id: string; name: string }[];
    cadences: BillingCadence[];
    asOf?: string;
}): TuitionPlanCollectionRow[] {
    const asOf = input.asOf ?? todayIso();
    const variantsByOffering = new Map<string, ProgramOfferingVariant[]>();
    for (const variant of input.variants) {
        const list = variantsByOffering.get(variant.offering_id) ?? [];
        list.push(variant);
        variantsByOffering.set(variant.offering_id, list);
    }
    const programLabel = new Map(input.programs.map((p) => [p.key, p.label]));

    return [...input.offerings]
        .sort((a, b) => {
            const pa = programLabel.get(a.program_key) ?? a.program_key;
            const pb = programLabel.get(b.program_key) ?? b.program_key;
            if (pa !== pb) return pa.localeCompare(pb);
            return a.label.localeCompare(b.label);
        })
        .map((offering) => {
            const variants = sortVariants(variantsByOffering.get(offering.id) ?? []).filter((v) => v.is_active);
            const cadenceKey = derivePrimaryCadence(offering, variants, input.rates, input.cadences);
            const orgMap = buildTuitionRateMap(input.rates, null);
            let min: number | null = null;
            let max: number | null = null;
            let nextChange: string | null = null;
            let hasFuture = false;
            for (const variant of variants) {
                if (!cadenceKey) continue;
                const rate = orgMap.get(tuitionRateCellKey(variant.id, cadenceKey));
                if (!rate || rate.not_offered) continue;
                if (isRateUpcoming(rate, asOf)) {
                    hasFuture = true;
                    if (!nextChange || (rate.effective_start && rate.effective_start < nextChange)) {
                        nextChange = rate.effective_start;
                    }
                    continue;
                }
                if (!isRateCurrent(rate, asOf)) continue;
                min = min == null ? rate.rate_cents : Math.min(min, rate.rate_cents);
                max = max == null ? rate.rate_cents : Math.max(max, rate.rate_cents);
            }
            const siteCount = input.programs.find((p) => p.key === offering.program_key)?.siteCount ?? 0;
            const status = mapOfferingStatus(offering, hasFuture);
            const freqLabel = cadenceKey ? cadenceLabel(cadenceKey, input.cadences) : "Not set";
            return {
                id: offering.id,
                name: offering.label,
                programKey: offering.program_key,
                programLabel: programLabel.get(offering.program_key) ?? offering.program_key,
                careFormatLabel: ATTENDANCE_TYPE_LABELS[offering.attendance_type] ?? offering.attendance_type,
                billingFrequencyKey: cadenceKey,
                billingFrequencyLabel: freqLabel,
                enrollmentOptionsCount: variants.length,
                priceMinCents: min,
                priceMaxCents: max,
                priceRangeLabel:
                    min == null || max == null
                        ? null
                        : min === max
                          ? `${formatRateCents(min)} / ${freqLabel.toLowerCase()}`
                          : `${formatRateCents(min)}–${formatRateCents(max)}`,
                availabilityLabel: tuitionAvailabilityLabel(offering, input.locations.length, siteCount),
                nextChangeDate: nextChange,
                nextChangeLabel: nextChange ? formatTuitionDateLabel(nextChange) : null,
                status,
                statusLabel: statusLabel(status),
                hasRevenueGl: Boolean(readPlanRevenueCategoryId(offering)),
            } satisfies TuitionPlanCollectionRow;
        });
}

export function buildTuitionPlanDetail(input: {
    offering: ProgramOffering;
    variants: ProgramOfferingVariant[];
    rates: TuitionRateRow[];
    programs: { key: string; label: string; siteCount: number }[];
    locations: { id: string; name: string }[];
    cadences: BillingCadence[];
    revenueCategories: { id: string; label: string; mapped_gl_account_id?: string | null }[];
    asOf?: string;
}): TuitionPlanDetailVm {
    const asOf = input.asOf ?? todayIso();
    const variants = sortVariants(input.variants.filter((v) => v.offering_id === input.offering.id && v.is_active));
    const cadenceKey = derivePrimaryCadence(input.offering, variants, input.rates, input.cadences);
    const freqLabel = cadenceKey ? cadenceLabel(cadenceKey, input.cadences) : "Not set";
    const orgMap = buildTuitionRateMap(input.rates, null);
    const program = input.programs.find((p) => p.key === input.offering.program_key);
    const revenueCategoryId = readPlanRevenueCategoryId(input.offering);
    const revenue = input.revenueCategories.find((row) => row.id === revenueCategoryId) ?? null;

    const options: TuitionOptionRow[] = variants.map((variant) => {
        const rate = cadenceKey ? orgMap.get(tuitionRateCellKey(variant.id, cadenceKey)) : undefined;
        let overrideCount = 0;
        for (const location of input.locations) {
            const locMap = buildTuitionRateMap(input.rates, location.id);
            const cell = cadenceKey ? locMap.get(tuitionRateCellKey(variant.id, cadenceKey)) : undefined;
            if (cell && cell.location_id === location.id) overrideCount += 1;
        }
        let status: TuitionOptionRow["status"] = "unset";
        if (!rate) status = "unset";
        else if (rate.not_offered) status = "not_offered";
        else if (isRateUpcoming(rate, asOf)) status = "scheduled";
        else if (!isRateCurrent(rate, asOf)) status = "ended";
        else status = "active";

        const priceCents = rate && !rate.not_offered && status === "active" ? rate.rate_cents : null;
        return {
            variantId: variant.id,
            commitmentLabel: variantDisplayLabel(variant),
            organizationPriceCents: priceCents,
            organizationPriceLabel:
                priceCents == null ? "—" : `${formatRateCents(priceCents)} / ${freqLabel.toLowerCase()}`,
            locationOverrideCount: overrideCount,
            locationDifferencesLabel:
                overrideCount === 0 ? "None" : `${overrideCount} override${overrideCount === 1 ? "" : "s"}`,
            effectiveSince: rate?.effective_start ?? null,
            effectiveSinceLabel: formatTuitionDateLabel(rate?.effective_start ?? null),
            status,
            statusLabel:
                status === "unset" ? "Not set"
                : status === "not_offered" ? "Not offered"
                : status === "scheduled" ? "Scheduled"
                : status === "ended" ? "Ended"
                : "Active",
            rateId: rate?.id ?? null,
            notOffered: rate?.not_offered === true,
        };
    });

    const priced = options.filter((row) => row.organizationPriceCents != null);
    const min = priced.reduce<number | null>((acc, row) => {
        const cents = row.organizationPriceCents!;
        return acc == null ? cents : Math.min(acc, cents);
    }, null);
    const max = priced.reduce<number | null>((acc, row) => {
        const cents = row.organizationPriceCents!;
        return acc == null ? cents : Math.max(acc, cents);
    }, null);
    const lowest = priced.find((row) => row.organizationPriceCents === min) ?? null;
    const highest = priced.find((row) => row.organizationPriceCents === max) ?? null;

    let nextChange: string | null = null;
    for (const variant of variants) {
        if (!cadenceKey) continue;
        const rate = orgMap.get(tuitionRateCellKey(variant.id, cadenceKey));
        if (rate && isRateUpcoming(rate, asOf) && rate.effective_start) {
            if (!nextChange || rate.effective_start < nextChange) nextChange = rate.effective_start;
        }
    }

    const locationsWithOverrides: TuitionPlanDetailVm["locationsWithOverrides"] = [];
    const locationSummaries: TuitionLocationSummaryRow[] = input.locations.map((location) => {
        let overrideCount = 0;
        const locMap = buildTuitionRateMap(input.rates, location.id);
        for (const variant of variants) {
            if (!cadenceKey) continue;
            const cell = locMap.get(tuitionRateCellKey(variant.id, cadenceKey));
            if (cell && cell.location_id === location.id) overrideCount += 1;
        }
        if (overrideCount > 0) {
            locationsWithOverrides.push({
                locationId: location.id,
                locationName: location.name,
                overrideCount,
            });
        }
        return {
            locationId: location.id,
            locationName: location.name,
            behavior: overrideCount > 0 ? "customized" : "organization",
            behaviorLabel: overrideCount > 0 ? "Customized" : "Organization pricing",
            overrideCount,
            nextChangeLabel: nextChange ? formatTuitionDateLabel(nextChange) : null,
        };
    });

    const status = mapOfferingStatus(input.offering, Boolean(nextChange));
    const siteCount = program?.siteCount ?? 0;

    return {
        id: input.offering.id,
        name: input.offering.label,
        programKey: input.offering.program_key,
        programLabel: program?.label ?? input.offering.program_key,
        careFormat: input.offering.attendance_type,
        careFormatLabel: ATTENDANCE_TYPE_LABELS[input.offering.attendance_type],
        billingFrequencyKey: cadenceKey,
        billingFrequencyLabel: freqLabel,
        enrollmentOptionsCount: variants.length,
        appliesToLabel: tuitionAvailabilityLabel(input.offering, input.locations.length, siteCount),
        revenueCategoryId,
        revenueGlLabel: revenue?.label ?? null,
        revenueGlAccountId: revenue?.mapped_gl_account_id ?? null,
        status,
        statusLabel: statusLabel(status),
        currentAsOfLabel: "Current as of today",
        priceMinCents: min,
        priceMaxCents: max,
        priceRangeLabel:
            min == null || max == null
                ? null
                : min === max
                  ? `${formatRateCents(min)} / ${freqLabel.toLowerCase()}`
                  : `${formatRateCents(min)}–${formatRateCents(max)} / ${freqLabel.toLowerCase()}`,
        lowestOption: lowest
            ? { label: lowest.commitmentLabel, priceLabel: lowest.organizationPriceLabel }
            : null,
        highestOption: highest
            ? { label: highest.commitmentLabel, priceLabel: highest.organizationPriceLabel }
            : null,
        locationsWithOverrides,
        upcomingChange: nextChange
            ? {
                  effectiveDate: nextChange,
                  effectiveDateLabel: formatTuitionDateLabel(nextChange),
                  summary: `A price change is scheduled for ${formatTuitionDateLabel(nextChange)}.`,
              }
            : null,
        options,
        locationSummaries,
        offering: input.offering,
        variants,
    };
}

export function buildTuitionHistoryPeriods(input: {
    variants: ProgramOfferingVariant[];
    rates: TuitionRateRow[];
    cadenceKey: string | null;
}): TuitionHistoryPeriod[] {
    if (!input.cadenceKey) return [];
    const periods = new Map<string, TuitionHistoryPeriod>();
    const orgRates = input.rates.filter(
        (rate) => rate.location_id == null && rate.cadence_key === input.cadenceKey,
    );

    for (const variant of sortVariants(input.variants)) {
        const rate = orgRates.find((row) => row.variant_id === variant.id);
        if (!rate) continue;
        for (const entry of readPriceHistory(rate)) {
            const key = `${entry.effective_start ?? "open"}::${entry.effective_end ?? "open"}`;
            const existing = periods.get(key) ?? {
                key,
                start: entry.effective_start,
                end: entry.effective_end,
                label: `${formatTuitionDateLabel(entry.effective_start)} – ${entry.effective_end ? formatTuitionDateLabel(entry.effective_end) : "Present"}`,
                rows: [],
            };
            existing.rows.push({
                commitmentLabel: variantDisplayLabel(variant),
                priceLabel: formatRateCents(entry.rate_cents),
            });
            periods.set(key, existing);
        }
        if (!rate.not_offered) {
            const key = `current::${rate.effective_start ?? "open"}::${rate.effective_end ?? "open"}`;
            const existing = periods.get(key) ?? {
                key,
                start: rate.effective_start,
                end: rate.effective_end,
                label: `${formatTuitionDateLabel(rate.effective_start)} – ${rate.effective_end ? formatTuitionDateLabel(rate.effective_end) : "Present"}`,
                rows: [],
            };
            existing.rows.push({
                commitmentLabel: variantDisplayLabel(variant),
                priceLabel: formatRateCents(rate.rate_cents),
            });
            periods.set(key, existing);
        }
    }

    return Array.from(periods.values()).sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""));
}

export function buildCompareLocationsMatrix(input: {
    variants: ProgramOfferingVariant[];
    rates: TuitionRateRow[];
    locations: { id: string; name: string }[];
    cadenceKey: string | null;
    asOf?: string;
}): {
    commitments: string[];
    columns: { key: string; label: string }[];
    cells: Record<string, Record<string, { label: string; differs: boolean }>>;
} {
    const asOf = input.asOf ?? todayIso();
    const cadenceKey = input.cadenceKey;
    const variants = sortVariants(input.variants);
    const orgMap = buildTuitionRateMap(input.rates, null);
    const columns = [
        { key: "organization", label: "Organization Default" },
        ...input.locations.map((location) => ({ key: location.id, label: location.name })),
    ];
    const cells: Record<string, Record<string, { label: string; differs: boolean }>> = {};

    for (const variant of variants) {
        const commitment = variantDisplayLabel(variant);
        cells[commitment] = {};
        const orgRate = cadenceKey ? orgMap.get(tuitionRateCellKey(variant.id, cadenceKey)) : undefined;
        const orgLabel =
            !orgRate ? "—"
            : orgRate.not_offered ? "Not offered"
            : isRateUpcoming(orgRate, asOf) ? `${formatRateCents(orgRate.rate_cents)} (scheduled)`
            : formatRateCents(orgRate.rate_cents);
        cells[commitment].organization = { label: orgLabel, differs: false };
        for (const location of input.locations) {
            const locMap = buildTuitionRateMap(input.rates, location.id);
            const locRate = cadenceKey ? locMap.get(tuitionRateCellKey(variant.id, cadenceKey)) : undefined;
            const effective = locRate ?? orgRate;
            const label =
                !effective ? "—"
                : effective.not_offered ? "Not offered"
                : formatRateCents(effective.rate_cents);
            const differs = Boolean(
                locRate &&
                    locRate.location_id === location.id &&
                    (!orgRate ||
                        locRate.rate_cents !== orgRate.rate_cents ||
                        locRate.not_offered !== orgRate.not_offered),
            );
            cells[commitment][location.id] = { label, differs };
        }
    }

    return {
        commitments: variants.map((variant) => variantDisplayLabel(variant)),
        columns,
        cells,
    };
}
