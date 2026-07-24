/**
 * Tuition Plan mutation helpers — existing offerings / variants / rates APIs.
 */

import type { AttendanceType, ProgramOffering } from "@/lib/programs/programOfferings";
import type { ProgramOfferingVariant, QuantityType } from "@/lib/programs/programOfferingVariants";
import type { TuitionRateRow } from "@/lib/commercial/tuitionRates";
import {
    appendPriceHistory,
    TUITION_BILLING_FREQUENCY_META_KEY,
    TUITION_LOCATION_IDS_META_KEY,
    TUITION_REVENUE_CATEGORY_META_KEY,
} from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";
import { writeLocationIdsMetadata } from "@/lib/financials/applicability/locationApplicability";

async function readError(res: Response): Promise<string> {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return json.error || `Request failed (${res.status})`;
}

export type CreateTuitionPlanInput = {
    name: string;
    programKey: string;
    careFormat: AttendanceType;
    billingFrequencyKey: string;
    revenueCategoryId: string | null;
    status: "active" | "draft";
    commitments: Array<{
        quantityType: QuantityType | null;
        quantityValue: number | null;
        label?: string | null;
        rateCents: number;
    }>;
    effectiveDate: string;
    locationMode?: "all" | "selected";
    locationIds?: string[];
};

export async function createTuitionPlan(input: CreateTuitionPlanInput): Promise<{
    offering: ProgramOffering;
    variants: ProgramOfferingVariant[];
}> {
    const offeringRes = await fetch("/api/admin/programs/offerings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            program_key: input.programKey,
            label: input.name.trim(),
            attendance_type: input.careFormat,
            status: input.status,
            metadata: writeLocationIdsMetadata(
                {
                    [TUITION_BILLING_FREQUENCY_META_KEY]: input.billingFrequencyKey,
                    ...(input.revenueCategoryId
                        ? { [TUITION_REVENUE_CATEGORY_META_KEY]: input.revenueCategoryId }
                        : {}),
                },
                { mode: input.locationMode ?? "all", locationIds: input.locationIds ?? [] },
                TUITION_LOCATION_IDS_META_KEY,
            ),
        }),
    });
    if (!offeringRes.ok) throw new Error(await readError(offeringRes));
    const offeringJson = (await offeringRes.json()) as { offering: ProgramOffering };
    const offering = offeringJson.offering;

    // Default transparent variant may already exist for no-quantity types.
    const existingVariantsRes = await fetch(`/api/admin/programs/offerings/${offering.id}/variants`, {
        credentials: "include",
    });
    const existingVariantsJson = (await existingVariantsRes.json().catch(() => ({}))) as {
        variants?: ProgramOfferingVariant[];
    };
    let variants = existingVariantsJson.variants ?? [];

    const created: ProgramOfferingVariant[] = [];
    for (const commitment of input.commitments) {
        const isDefault = commitment.quantityType == null && commitment.quantityValue == null;
        let variant = isDefault ? variants.find((row) => row.quantity_type == null && row.quantity_value == null) : null;
        if (!variant) {
            const variantRes = await fetch(`/api/admin/programs/offerings/${offering.id}/variants`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    quantity_type: commitment.quantityType,
                    quantity_value: commitment.quantityValue,
                    label: commitment.label ?? null,
                    status: "active",
                }),
            });
            if (!variantRes.ok) throw new Error(await readError(variantRes));
            const variantJson = (await variantRes.json()) as { variant: ProgramOfferingVariant };
            variant = variantJson.variant;
            variants = [...variants, variant];
        }
        created.push(variant);

        const rateRes = await fetch("/api/admin/commercial/tuition-rates", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                variant_id: variant.id,
                cadence_key: input.billingFrequencyKey,
                rate_cents: commitment.rateCents,
                location_id: null,
                effective_start: input.effectiveDate || null,
                revenue_category_id: input.revenueCategoryId,
            }),
        });
        if (!rateRes.ok) throw new Error(await readError(rateRes));
    }

    return { offering, variants: created.length ? created : variants };
}

export async function updateTuitionPlanDetails(input: {
    offeringId: string;
    name: string;
    careFormat: AttendanceType;
    /** When provided and equal to careFormat, attendance_type is omitted so location/GL saves are not blocked. */
    previousCareFormat?: AttendanceType;
    billingFrequencyKey: string;
    revenueCategoryId: string | null;
    status: "active" | "draft" | "archived";
    metadata: Record<string, unknown>;
    locationMode?: "all" | "selected";
    locationIds?: string[] | null;
}): Promise<ProgramOffering> {
    const metadata: Record<string, unknown> = {
        ...input.metadata,
        [TUITION_BILLING_FREQUENCY_META_KEY]: input.billingFrequencyKey,
        ...(input.revenueCategoryId
            ? { [TUITION_REVENUE_CATEGORY_META_KEY]: input.revenueCategoryId }
            : { [TUITION_REVENUE_CATEGORY_META_KEY]: undefined }),
    };
    if (!input.revenueCategoryId) delete metadata[TUITION_REVENUE_CATEGORY_META_KEY];
    const patchedMetadata =
        input.locationMode != null
            ? writeLocationIdsMetadata(
                  metadata,
                  { mode: input.locationMode, locationIds: input.locationIds ?? [] },
                  TUITION_LOCATION_IDS_META_KEY,
              )
            : metadata;

    const body: Record<string, unknown> = {
        label: input.name.trim(),
        status: input.status === "archived" ? "archived" : input.status,
        is_active: input.status !== "archived",
        metadata: patchedMetadata,
    };
    const careFormatChanged =
        input.previousCareFormat == null || input.previousCareFormat !== input.careFormat;
    if (careFormatChanged) {
        body.attendance_type = input.careFormat;
    }

    const res = await fetch(`/api/admin/programs/offerings/${input.offeringId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readError(res));
    const json = (await res.json()) as { offering: ProgramOffering };
    return json.offering;
}

export async function addEnrollmentCommitment(input: {
    offeringId: string;
    quantityType: QuantityType;
    quantityValue: number;
    label?: string | null;
    rateCents: number;
    billingFrequencyKey: string;
    effectiveDate: string;
}): Promise<ProgramOfferingVariant> {
    const variantRes = await fetch(`/api/admin/programs/offerings/${input.offeringId}/variants`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            quantity_type: input.quantityType,
            quantity_value: input.quantityValue,
            label: input.label ?? null,
            status: "active",
        }),
    });
    if (!variantRes.ok) throw new Error(await readError(variantRes));
    const variantJson = (await variantRes.json()) as { variant: ProgramOfferingVariant };
    const variant = variantJson.variant;

    const rateRes = await fetch("/api/admin/commercial/tuition-rates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            variant_id: variant.id,
            cadence_key: input.billingFrequencyKey,
            rate_cents: input.rateCents,
            location_id: null,
            effective_start: input.effectiveDate || null,
        }),
    });
    if (!rateRes.ok) throw new Error(await readError(rateRes));
    return variant;
}

export async function stopOfferingCommitment(input: {
    offeringId: string;
    variantId: string;
}): Promise<void> {
    const res = await fetch(`/api/admin/programs/offerings/${input.offeringId}/variants/${input.variantId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: false, status: "archived" }),
    });
    if (!res.ok) throw new Error(await readError(res));
}

export async function upsertTuitionPrice(input: {
    existing: TuitionRateRow | null;
    variantId: string;
    cadenceKey: string;
    locationId: string | null;
    rateCents: number;
    effectiveStart: string | null;
    notOffered?: boolean;
    preserveHistory?: boolean;
}): Promise<TuitionRateRow> {
    const metadata =
        input.existing && input.preserveHistory !== false
            ? appendPriceHistory(input.existing, {
                  rate_cents: input.existing.rate_cents,
                  effective_start: input.existing.effective_start,
                  effective_end: input.effectiveStart,
              })
            : (input.existing?.metadata ?? {});

    if (input.existing?.id) {
        const res = await fetch(`/api/admin/commercial/tuition-rates/${input.existing.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                rate_cents: input.rateCents,
                effective_start: input.effectiveStart,
                not_offered: input.notOffered === true,
                metadata,
            }),
        });
        if (!res.ok) throw new Error(await readError(res));
        const json = (await res.json()) as { rate: TuitionRateRow };
        return json.rate;
    }

    const res = await fetch("/api/admin/commercial/tuition-rates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            variant_id: input.variantId,
            cadence_key: input.cadenceKey,
            rate_cents: input.rateCents,
            location_id: input.locationId,
            effective_start: input.effectiveStart,
            not_offered: input.notOffered === true,
            metadata,
        }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const json = (await res.json()) as { rate: TuitionRateRow };
    return json.rate;
}

export async function clearLocationOverride(rateId: string): Promise<void> {
    const res = await fetch(`/api/admin/commercial/tuition-rates/${rateId}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok) throw new Error(await readError(res));
}

export function applyQuickAdjustment(
    currentCents: number,
    kind: "percent" | "amount" | "round",
    value: number,
): number {
    if (kind === "percent") return Math.round(currentCents * (1 + value / 100));
    if (kind === "amount") return Math.max(0, currentCents + Math.round(value * 100));
    const step = Math.max(1, Math.round(value * 100));
    return Math.round(currentCents / step) * step;
}
