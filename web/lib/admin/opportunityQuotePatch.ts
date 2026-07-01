/**
 * Server-side opportunity quote PATCH: pricing RPC, discount resolution, manual override, and final settlement.
 * Precedence: base from pricing engine → discount on base → override replaces displayed final (discount columns retained).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    discountProgramRowSelectableForJobAdmin,
    parseJobDiscountSelectionInput,
    resolveJobDiscountSelection,
    type ResolvedJobDiscount,
} from "@/lib/admin/jobDiscountSelection";

const SNAPSHOT_KEY = "quote_pricing_snapshot";

export type QuotePricingSnapshot = {
    base_quote_total: number;
    engine_price_breakdown: string | null;
    priced_at: string;
};

export type OpportunityPricingExistingRow = {
    vertical_id: string | null;
    quote_subtotal: number | null;
    quote_total: number | null;
    price_breakdown: string | null;
    discount_amount: number | null;
    discount_code: string | null;
    discount_code_id: string | null;
    discount_program_id: string | null;
    discount_validated_at: string | null;
    quote_is_overridden?: boolean | null;
    quote_override_total?: number | null;
    quote_override_reason?: string | null;
    estimated_price_cents?: number | null;
    monetary_value_cents?: number | null;
    metadata: Record<string, unknown> | null;
};

function numOrNull(v: unknown): number | null {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function roundMoney(n: number): number {
    return Math.round(n * 100) / 100;
}

function readSnapshot(meta: Record<string, unknown> | null): QuotePricingSnapshot | null {
    const raw = meta?.[SNAPSHOT_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const base = numOrNull(o.base_quote_total);
    if (base == null) return null;
    return {
        base_quote_total: base,
        engine_price_breakdown: o.engine_price_breakdown == null ? null : String(o.engine_price_breakdown),
        priced_at: typeof o.priced_at === "string" ? o.priced_at : new Date().toISOString(),
    };
}

function getBaseDollars(row: OpportunityPricingExistingRow, meta: Record<string, unknown>): number | null {
    const sub = numOrNull(row.quote_subtotal);
    if (sub != null) return sub;
    const snap = readSnapshot(meta);
    if (snap) return snap.base_quote_total;
    return null;
}

function dollarsFromResolvedDiscount(r: ResolvedJobDiscount): number {
    return roundMoney(r.discount_amount / 100);
}

function buildDisplayPriceBreakdown(args: {
    engineText: string | null;
    baseDollars: number | null;
    discountDollars: number;
    discountCodeLabel: string | null;
    finalDollars: number | null;
    isOverridden: boolean;
    overrideTotal: number | null;
    overrideReason: string | null;
}): string {
    const fmt = (d: number) => `$${d.toFixed(2)}`;
    const parts: string[] = [];
    if (args.engineText?.trim()) {
        parts.push(args.engineText.trim());
    }
    if (args.baseDollars != null) {
        parts.push(`Subtotal (base): ${fmt(args.baseDollars)}`);
    } else {
        parts.push("Subtotal (base): (not computed yet)");
    }
    if (args.discountDollars > 0) {
        const label = args.discountCodeLabel?.trim() ? ` (${args.discountCodeLabel.trim()})` : "";
        parts.push(`Discount${label}: -${fmt(args.discountDollars)}`);
    }
    if (args.isOverridden && args.overrideTotal != null) {
        if (args.overrideReason?.trim()) {
            parts.push(`Manual override note: ${args.overrideReason.trim()}`);
        }
        parts.push(`Final (manual override): ${fmt(args.overrideTotal)}`);
    } else if (args.finalDollars != null) {
        parts.push(`Final: ${fmt(args.finalDollars)}`);
    }
    return parts.join("\n\n");
}

function syncValueCents(quoteTotal: number | null): { estimated_price_cents: number | null; monetary_value_cents: number | null } {
    if (quoteTotal == null || !Number.isFinite(quoteTotal)) {
        return { estimated_price_cents: null, monetary_value_cents: null };
    }
    const c = Math.round(quoteTotal * 100);
    return { estimated_price_cents: c, monetary_value_cents: c };
}

export function opportunityQuotePipelineActive(body: Record<string, unknown>): boolean {
    return (
        body.quote_inputs !== undefined ||
        body.apply_quote_discount === true ||
        body.clear_quote_discount === true ||
        body.clear_quote_override === true ||
        body.quote_is_overridden !== undefined ||
        body.quote_override_total !== undefined
    );
}

async function getVerticalSlug(supabase: SupabaseClient, verticalId: string | null): Promise<string | null> {
    if (!verticalId) return null;
    const { data } = await supabase.from("verticals").select("slug").eq("id", verticalId).maybeSingle();
    const s = (data as { slug?: string } | null)?.slug;
    return s ? String(s).trim().toLowerCase() : null;
}

async function runCleaningQuoteRpc(
    supabase: SupabaseClient,
    verticalId: string,
    quote_inputs: Record<string, unknown>
): Promise<
    | { ok: true; baseDollars: number; engineBreakdown: string | null; normalizedQuoteInputs: Record<string, unknown> }
    | { ok: false; error: string }
> {
    const sqftRaw = quote_inputs.square_footage;
    const frequencyRaw = quote_inputs.frequency;
    const cleaningTypeRaw = quote_inputs.cleaning_type;
    const addonsRaw = quote_inputs.add_ons;

    const hasInputsToCompute = sqftRaw != null && (typeof sqftRaw === "string" || typeof sqftRaw === "number");
    if (!hasInputsToCompute) {
        return { ok: false, error: "quote_inputs must include square_footage to compute pricing" };
    }

    const { loadSqftTiersForVertical, normalizeSqftKeyInput, loadPricingFrequenciesForVertical } =
        await import("@/lib/book-v2/loadCleaningPricingCatalog");
    const { resolveRpcFrequencyKey } = await import("@/lib/book-v2/resolveCleaningFrequencyRpc");

    const sqftTierRows = await loadSqftTiersForVertical(supabase as never, verticalId);
    const sqftTierKey = normalizeSqftKeyInput(sqftRaw as string | number, sqftTierRows);

    const freqRows = await loadPricingFrequenciesForVertical(supabase as never, verticalId);
    const rpcFrequencyKey = resolveRpcFrequencyKey(
        typeof frequencyRaw === "string" ? frequencyRaw : frequencyRaw == null ? null : String(frequencyRaw),
        freqRows
    );

    const addonKeys: string[] = Array.isArray(addonsRaw) ? (addonsRaw as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean) : [];

    const { mapCleaningTypeOptionToServiceKey } = await import("@/lib/quoteIntake/resolveCleaningQuoteIntakeFields");
    const service_key = mapCleaningTypeOptionToServiceKey(
        typeof cleaningTypeRaw === "string" ? cleaningTypeRaw : cleaningTypeRaw == null ? "" : String(cleaningTypeRaw)
    );

    const { data: rpcData, error: rpcError } = await supabase.rpc("get_quote_pricing", {
        p_vertical_slug: "cleaning",
        p_service_key: service_key,
        p_sqft_key: sqftTierKey,
        p_frequency_key: rpcFrequencyKey,
        p_addon_keys: addonKeys,
    });
    if (rpcError) {
        return { ok: false, error: `Quote pricing failed: ${rpcError.message}` };
    }
    const row = Array.isArray(rpcData) ? (rpcData[0] as Record<string, unknown> | undefined) : (rpcData as Record<string, unknown> | null);
    if (!row) {
        return { ok: false, error: "Quote pricing returned no data" };
    }
    const totalFirstVisitCents = row.total_first_visit_cents as number | null | undefined;
    const firstCleanCents = row.first_clean_cents as number | null | undefined;
    const addonsTotalCents = row.addons_total_cents as number | null | undefined;
    const derivedTotalCents =
        typeof totalFirstVisitCents === "number"
            ? totalFirstVisitCents
            : (typeof firstCleanCents === "number" ? firstCleanCents : 0) + (typeof addonsTotalCents === "number" ? addonsTotalCents : 0);
    const baseDollars = Number((derivedTotalCents / 100).toFixed(2));
    const breakdown = row.price_breakdown;
    const engineBreakdown = breakdown == null ? null : String(breakdown);

    const normalizedQuoteInputs = {
        ...quote_inputs,
        square_footage_tier_key: sqftTierKey,
        cleaning_frequency_key: rpcFrequencyKey || null,
    };

    return { ok: true, baseDollars, engineBreakdown, normalizedQuoteInputs };
}

async function resolvePromoCodeString(
    supabase: SupabaseClient,
    rawCode: string,
    grossCents: number,
    verticalSlug: string | null,
    orgId: string
): Promise<{ ok: true; value: ResolvedJobDiscount } | { ok: false; error: string }> {
    const code = rawCode.trim();
    if (!code) {
        return { ok: false, error: "discount_code is empty" };
    }

    const { data: prows } = await supabase.from("discount_programs_admin_v").select("*").ilike("code", code);
    const programs = ((prows ?? []) as Record<string, unknown>[]).filter((r) => discountProgramRowSelectableForJobAdmin(r));
    const scored = programs
        .map((r) => ({
            row: r,
            orgMatch: (r.org_id as string | null | undefined) === orgId ? 1 : r.org_id == null ? 0 : -1,
        }))
        .filter((x) => x.orgMatch >= 0)
        .sort((a, b) => b.orgMatch - a.orgMatch);

    for (const { row } of scored) {
        const pid = row.id as string;
        const res = await resolveJobDiscountSelection(
            supabase,
            { kind: "program", programId: pid },
            grossCents,
            verticalSlug,
            orgId
        );
        if (res.ok) return res;
    }

    const { data: codes } = await supabase
        .from("discount_codes")
        .select("id, code, is_active, discount_type, discount_value, applies_to_vertical_slug, starts_at, ends_at")
        .ilike("code", code);

    const list = (codes ?? []) as {
        id: string;
        code: string | null;
        is_active: boolean | null;
        discount_type: string | null;
        discount_value: number | string | null;
        applies_to_vertical_slug: string | null;
        starts_at: string | null;
        ends_at: string | null;
    }[];

    const norm = code.toLowerCase();
    const ordered = [
        ...list.filter((c) => String(c.code ?? "").trim().toLowerCase() === norm),
        ...list.filter((c) => String(c.code ?? "").trim().toLowerCase() !== norm),
    ];

    for (const c of ordered) {
        const res = await resolveJobDiscountSelection(
            supabase,
            { kind: "legacy_code", codeId: c.id },
            grossCents,
            verticalSlug,
            orgId
        );
        if (res.ok) return res;
    }

    return { ok: false, error: "No valid discount matched that code for this vertical" };
}

export type OpportunityQuotePatchResult = {
    updates: Record<string, unknown>;
    metadataFragment: Record<string, unknown>;
    ownedKeys: Set<string>;
};

export async function mergeOpportunityQuotePricing(args: {
    supabase: SupabaseClient;
    orgId: string;
    existing: OpportunityPricingExistingRow;
    body: Record<string, unknown>;
}): Promise<OpportunityQuotePatchResult | { error: string; status: number }> {
    const { supabase, orgId, existing, body } = args;
    const ownedKeys = new Set<string>();
    const updates: Record<string, unknown> = {};
    const metadataFragment: Record<string, unknown> = {};

    let workingMeta: Record<string, unknown> = { ...(existing.metadata ?? {}) };

    let quote_subtotal = numOrNull(existing.quote_subtotal);
    let quote_total = numOrNull(existing.quote_total);
    let discount_amount = numOrNull(existing.discount_amount);
    let discount_code = existing.discount_code ?? null;
    let discount_code_id = existing.discount_code_id ?? null;
    let discount_program_id = existing.discount_program_id ?? null;
    let discount_validated_at = existing.discount_validated_at ?? null;

    let quote_is_overridden = existing.quote_is_overridden === true;
    let quote_override_total = numOrNull(existing.quote_override_total);
    let quote_override_reason =
        existing.quote_override_reason == null || existing.quote_override_reason === ""
            ? null
            : String(existing.quote_override_reason);

    const verticalSlug = await getVerticalSlug(supabase, existing.vertical_id ?? null);

    const clearingOverride = body.clear_quote_override === true;
    if (clearingOverride) {
        quote_is_overridden = false;
        quote_override_total = null;
        quote_override_reason = null;
        updates.quote_is_overridden = false;
        updates.quote_override_total = null;
        updates.quote_override_reason = null;
        ownedKeys.add("quote_is_overridden");
        ownedKeys.add("quote_override_total");
        ownedKeys.add("quote_override_reason");
    }

    if (body.quote_is_overridden !== undefined) {
        quote_is_overridden = body.quote_is_overridden === true;
        updates.quote_is_overridden = quote_is_overridden;
        ownedKeys.add("quote_is_overridden");
        if (!quote_is_overridden) {
            quote_override_total = null;
            quote_override_reason = null;
            updates.quote_override_total = null;
            updates.quote_override_reason = null;
            ownedKeys.add("quote_override_total");
            ownedKeys.add("quote_override_reason");
        }
    }
    if (body.quote_override_total !== undefined) {
        quote_override_total = numOrNull(body.quote_override_total);
        updates.quote_override_total = quote_override_total;
        ownedKeys.add("quote_override_total");
    }

    if (quote_is_overridden && body.quote_override_total !== undefined) {
        const ot = numOrNull(body.quote_override_total);
        if (ot != null && ot < 0) {
            return { error: "quote_override_total must be non-negative", status: 400 };
        }
    }

    const needFullSettleFromBody =
        body.apply_quote_discount === true ||
        body.clear_quote_discount === true ||
        body.clear_quote_override === true ||
        body.quote_is_overridden !== undefined ||
        body.quote_override_total !== undefined;

    let rpcRan = false;

    // --- quote_inputs + optional RPC ---
    if (body.quote_inputs !== undefined) {
        const qiRaw = body.quote_inputs;
        if (qiRaw == null || typeof qiRaw !== "object" || Array.isArray(qiRaw)) {
            return { error: "quote_inputs must be an object", status: 400 };
        }
        let quote_inputs = qiRaw as Record<string, unknown>;
        metadataFragment.quote_inputs = quote_inputs;
        workingMeta = { ...workingMeta, quote_inputs };

        const verticalId = existing.vertical_id ?? null;
        if (!verticalId) {
            return { error: "Opportunity vertical_id is required to compute quote", status: 400 };
        }

        const skipRpcBecauseOverridden = quote_is_overridden === true && !clearingOverride;
        const sqftRaw = quote_inputs.square_footage;
        const hasInputsToCompute = sqftRaw != null && (typeof sqftRaw === "string" || typeof sqftRaw === "number");
        const vs = await getVerticalSlug(supabase, verticalId);

        const onlyMetadataQuoteInputs =
            !needFullSettleFromBody &&
            (!hasInputsToCompute || vs !== "cleaning" || skipRpcBecauseOverridden);

        if (onlyMetadataQuoteInputs) {
            return {
                updates: { ...updates },
                metadataFragment,
                ownedKeys: new Set(ownedKeys),
            };
        }

        if (hasInputsToCompute && !skipRpcBecauseOverridden && vs === "cleaning") {
            const rpc = await runCleaningQuoteRpc(supabase, verticalId, quote_inputs);
            if (!rpc.ok) {
                return { error: rpc.error, status: 400 };
            }
            rpcRan = true;
            quote_subtotal = rpc.baseDollars;
            quote_inputs = rpc.normalizedQuoteInputs;
            metadataFragment.quote_inputs = rpc.normalizedQuoteInputs;
            workingMeta = { ...workingMeta, quote_inputs: rpc.normalizedQuoteInputs };

            const snap: QuotePricingSnapshot = {
                base_quote_total: rpc.baseDollars,
                engine_price_breakdown: rpc.engineBreakdown,
                priced_at: new Date().toISOString(),
            };
            metadataFragment[SNAPSHOT_KEY] = snap;
            workingMeta[SNAPSHOT_KEY] = snap;

            updates.quote_subtotal = quote_subtotal;
            ownedKeys.add("quote_subtotal");

            if (body.clear_quote_discount !== true && (discount_program_id || discount_code_id)) {
                const grossCents = Math.round(rpc.baseDollars * 100);
                const token =
                    discount_program_id != null
                        ? `program:${discount_program_id}`
                        : discount_code_id != null
                          ? `code:${discount_code_id}`
                          : null;
                const parsed = parseJobDiscountSelectionInput(token);
                if (parsed) {
                    const res = await resolveJobDiscountSelection(supabase, parsed, grossCents, verticalSlug, orgId);
                    if (!res.ok) {
                        return { error: res.error, status: 400 };
                    }
                    discount_amount = dollarsFromResolvedDiscount(res.value);
                    discount_code = res.value.discount_code;
                    discount_code_id = res.value.discount_code_id;
                    discount_program_id = res.value.discount_program_id;
                    discount_validated_at = new Date().toISOString();
                    updates.discount_amount = discount_amount;
                    updates.discount_code = discount_code;
                    updates.discount_code_id = discount_code_id;
                    updates.discount_program_id = discount_program_id;
                    updates.discount_validated_at = discount_validated_at;
                    ownedKeys.add("discount_amount");
                    ownedKeys.add("discount_code");
                    ownedKeys.add("discount_code_id");
                    ownedKeys.add("discount_program_id");
                    ownedKeys.add("discount_validated_at");
                }
            }
        }
    }

    const clearingDiscount = body.clear_quote_discount === true;
    if (clearingDiscount) {
        discount_amount = null;
        discount_code = null;
        discount_code_id = null;
        discount_program_id = null;
        discount_validated_at = null;
        metadataFragment.quote_discount = null;
        updates.discount_amount = null;
        updates.discount_code = null;
        updates.discount_code_id = null;
        updates.discount_program_id = null;
        updates.discount_validated_at = null;
        ownedKeys.add("discount_amount");
        ownedKeys.add("discount_code");
        ownedKeys.add("discount_code_id");
        ownedKeys.add("discount_program_id");
        ownedKeys.add("discount_validated_at");
    }

    // --- apply discount (server-side) ---
    if (body.apply_quote_discount === true) {
        const rowForBase: OpportunityPricingExistingRow = {
            ...existing,
            quote_subtotal,
            metadata: workingMeta,
        };
        const base = getBaseDollars(rowForBase, workingMeta);
        if (base == null || base <= 0) {
            return { error: "Quote base is unknown; run quote intake (square footage) before applying a discount", status: 400 };
        }
        const grossCents = Math.max(0, Math.round(base * 100));

        const selectionRaw = body.quote_discount_selection;
        const promoRaw = body.discount_code;

        let resolved: { ok: true; value: ResolvedJobDiscount } | { ok: false; error: string };

        if (typeof selectionRaw === "string" && selectionRaw.trim()) {
            const parsed = parseJobDiscountSelectionInput(selectionRaw.trim());
            if (!parsed) {
                return { error: "quote_discount_selection must be program:<uuid> or code:<uuid>", status: 400 };
            }
            resolved = await resolveJobDiscountSelection(supabase, parsed, grossCents, verticalSlug, orgId);
        } else if (typeof promoRaw === "string" && promoRaw.trim()) {
            resolved = await resolvePromoCodeString(supabase, promoRaw, grossCents, verticalSlug, orgId);
        } else {
            return { error: "apply_quote_discount requires quote_discount_selection or discount_code", status: 400 };
        }

        if (!resolved.ok) {
            return { error: resolved.error, status: 400 };
        }

        const v = resolved.value;
        discount_amount = dollarsFromResolvedDiscount(v);
        discount_code = v.discount_code;
        discount_code_id = v.discount_code_id;
        discount_program_id = v.discount_program_id;
        discount_validated_at = new Date().toISOString();

        metadataFragment.quote_discount = {
            applied_at: discount_validated_at,
            discount_amount_dollars: discount_amount,
            discount_program_id: discount_program_id ?? null,
            discount_code_id: discount_code_id ?? null,
            discount_code: discount_code ?? null,
            base_quote_dollars: base,
            source: "admin_patch",
        };

        updates.discount_amount = discount_amount;
        updates.discount_code = discount_code;
        updates.discount_code_id = discount_code_id;
        updates.discount_program_id = discount_program_id;
        updates.discount_validated_at = discount_validated_at;
        ownedKeys.add("discount_amount");
        ownedKeys.add("discount_code");
        ownedKeys.add("discount_code_id");
        ownedKeys.add("discount_program_id");
        ownedKeys.add("discount_validated_at");
    }

    const shouldSettle = needFullSettleFromBody || rpcRan;

    if (!shouldSettle) {
        return {
            updates,
            metadataFragment,
            ownedKeys,
        };
    }

    // --- final totals ---
    const rowForBase: OpportunityPricingExistingRow = {
        ...existing,
        quote_subtotal,
        metadata: workingMeta,
    };
    const baseDollars = getBaseDollars(rowForBase, workingMeta);

    if (quote_is_overridden) {
        const ot = quote_override_total;
        if (ot == null || ot < 0) {
            return { error: "quote_is_overridden requires quote_override_total", status: 400 };
        }
        quote_total = roundMoney(ot);
    } else {
        if (baseDollars == null) {
            return { error: "Cannot settle quote: missing base (run quote intake first)", status: 400 };
        }
        const disc = discount_amount ?? 0;
        quote_total = roundMoney(Math.max(0, baseDollars - disc));
    }

    updates.quote_total = quote_total;
    ownedKeys.add("quote_total");

    const snapForDisplay = readSnapshot(workingMeta);
    const engineText = snapForDisplay?.engine_price_breakdown ?? null;
    const discD = discount_amount ?? 0;

    const price_breakdown = buildDisplayPriceBreakdown({
        engineText,
        baseDollars,
        discountDollars: discD,
        discountCodeLabel: discount_code,
        finalDollars: quote_total,
        isOverridden: quote_is_overridden,
        overrideTotal: quote_override_total,
        overrideReason: quote_override_reason,
    });
    updates.price_breakdown = price_breakdown;
    ownedKeys.add("price_breakdown");

    const cents = syncValueCents(quote_total);
    updates.estimated_price_cents = cents.estimated_price_cents;
    updates.monetary_value_cents = cents.monetary_value_cents;
    ownedKeys.add("estimated_price_cents");
    ownedKeys.add("monetary_value_cents");

    return {
        updates,
        metadataFragment,
        ownedKeys,
    };
}
