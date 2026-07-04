/**
 * Commercial Execution — evaluate() / evaluateSet() (pure, deterministic).
 *
 * Given a CommercialContext and a CommercialExport, resolve the applicable program,
 * offering, variant, tuition pricing, commercial products, cadence, accounting
 * metadata, effective dating, provenance, status/reason codes, config version,
 * rounding metadata, and a typed explanation graph — into a consumer-neutral
 * CommercialResolution.
 *
 * Phase 4 scope: NO policy execution (adjustments always empty), NO funding
 * (attribution null → residual is the full net to the consumer's primary payer),
 * NO expand(), NO materialization, NO writes, NO Billing vocabulary.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §3, §5, §6.
 */

import type {
    BillingCadenceDef,
    CommercialExport,
    CommercialProductDef,
} from "@/lib/commercial/execution/commercialExport";
import type { ExplanationStep, LineExplanation, ProvenanceRef, ResolutionExplanationGraph } from "@/lib/commercial/execution/explanation";
import type {
    CadenceRef,
    CommercialContext,
    CommercialResolution,
    PayerType,
    Precision,
    ResolvedCommercialLine,
    ResolutionStatus,
    ResolutionWarning,
} from "@/lib/commercial/execution/executionTypes";
import { money, resolutionKeyFor, isEffective } from "@/lib/commercial/execution/evaluate/evalUtils";
import { resolveAccounting } from "@/lib/commercial/execution/evaluate/resolveAccounting";
import { resolvePricing } from "@/lib/commercial/execution/evaluate/resolvePricing";
import { resolveProducts } from "@/lib/commercial/execution/evaluate/resolveProducts";
import type { RelationalScope } from "@/lib/commercial/execution/index";

const DEFAULT_PRECISION: Precision = { currency: "USD", roundingRule: "half_up" };

function cadenceRef(cadenceKey: string | null, cadences: BillingCadenceDef[]): CadenceRef {
    if (!cadenceKey) return null;
    const found = cadences.find((c) => c.cadenceKey === cadenceKey);
    return { cadenceKey, label: found?.label };
}

// ── Tuition line ─────────────────────────────────────────────────────────────

type LinePart = { line: ResolvedCommercialLine | null; warnings: ResolutionWarning[]; used: ProvenanceRef[] };

function resolveTuitionLine(exp: CommercialExport, ctx: CommercialContext, precision: Precision): LinePart {
    const warnings: ResolutionWarning[] = [];
    const used: ProvenanceRef[] = [];

    // Resolve variant (directly, or the sole active variant of a given offering).
    let variantId = ctx.scope.variantId ?? null;
    let offeringId: string | null = ctx.scope.offeringId ?? null;

    if (variantId) {
        const variant = exp.variants.find((v) => v.id === variantId);
        if (!variant) return unresolvedTuition(ctx, "missing_required_input", warnings, used, "variant not found");
        offeringId = variant.offeringId;
        used.push({ entity: "program_offering_variants", id: variant.id, label: variant.label });
    } else if (offeringId) {
        const active = exp.variants.filter((v) => v.offeringId === offeringId && v.isActive);
        if (active.length === 1) {
            variantId = active[0].id;
            used.push({ entity: "program_offering_variants", id: active[0].id, label: active[0].label });
        } else if (active.length === 0) {
            return unresolvedTuition(ctx, "no_effective_config", warnings, used, "offering has no active variant");
        } else {
            return unresolvedTuition(ctx, "missing_required_input", warnings, used, "offering has multiple variants; specify one");
        }
    } else {
        // No tuition context at all — resolve products only.
        warnings.push({ code: "no_tuition_context", message: "No offering/variant in context; tuition not resolved." });
        return { line: null, warnings, used };
    }

    // Validate offering belongs to the program and is active/effective.
    const offering = exp.offerings.find((o) => o.id === offeringId);
    if (!offering || offering.programKey !== ctx.scope.programKey) {
        return unresolvedTuition(ctx, "no_effective_config", warnings, used, "offering not under program");
    }
    used.push({ entity: "program_offerings", id: offering.id, label: offering.label });
    if (!offering.isActive || !isEffective(offering.effective, ctx.asOf)) {
        return unresolvedTuition(ctx, "no_effective_config", warnings, used, "offering inactive or not effective at date");
    }

    const cadenceKey = ctx.commitment?.cadenceKey ?? null;
    if (!cadenceKey) return unresolvedTuition(ctx, "missing_required_input", warnings, used, "no cadence in commitment");

    const payerType: PayerType = ctx.commitment?.payerIntent ?? "private_pay";
    const pricing = resolvePricing(exp, { variantId, cadenceKey, payerType, locationId: ctx.scope.locationId ?? null, asOf: ctx.asOf });
    const lineKey = `tuition:${variantId}:${cadenceKey}`;

    if (pricing.kind === "unresolved") {
        warnings.push({ code: "tuition_unpriced", message: `Tuition unpriced (${pricing.reason}).`, lineKey });
        return {
            line: mkLine({
                lineKey,
                status: "unresolved",
                reason: pricing.reason,
                kind: "tuition",
                source: { entity: "commercial_tuition_rates", id: "", scope: ctx.scope },
                cadence: cadenceRef(cadenceKey, exp.cadences),
                grossCents: 0,
                precision,
                accounting: { revenueCategoryId: null, glAccountId: null, recognition: "deferred" },
                behavior: {},
                steps: [step("selection", `variant ${variantId} under offering ${offering.label}`, used)],
                origin: { entity: "commercial_tuition_rates", id: "" },
            }),
            warnings,
            used,
        };
    }

    if (pricing.kind === "not_offered") {
        used.push({ entity: "commercial_tuition_rates", id: pricing.rate.id });
        return {
            line: mkLine({
                lineKey,
                status: "not_offered",
                reason: "not_offered_at_scope",
                kind: "tuition",
                source: { entity: "commercial_tuition_rates", id: pricing.rate.id, scope: ctx.scope },
                cadence: cadenceRef(cadenceKey, exp.cadences),
                grossCents: 0,
                precision,
                accounting: { revenueCategoryId: null, glAccountId: null, recognition: "deferred" },
                behavior: {},
                steps: [
                    step("selection", `variant ${variantId} under offering ${offering.label}`, used),
                    step("pricing", `explicitly not offered at ${pricing.scope}`, [{ entity: "commercial_tuition_rates", id: pricing.rate.id }]),
                ],
                origin: { entity: "commercial_tuition_rates", id: pricing.rate.id },
            }),
            warnings,
            used,
        };
    }

    // Priced.
    const rate = pricing.rate;
    used.push({ entity: "commercial_tuition_rates", id: rate.id });
    const acct = resolveAccounting(rate.revenueCategoryId, "tuition", {}, exp, lineKey);
    warnings.push(...acct.warnings);
    used.push(...acct.used);

    return {
        line: mkLine({
            lineKey,
            status: "resolved",
            kind: "tuition",
            source: { entity: "commercial_tuition_rates", id: rate.id, scope: ctx.scope },
            cadence: cadenceRef(cadenceKey, exp.cadences),
            grossCents: rate.rateCents,
            precision,
            accounting: acct.accounting,
            behavior: {},
            steps: [
                step("selection", `variant ${variantId} under offering ${offering.label}`, used),
                step("pricing", `matrix rate (${pricing.scope}) for cadence ${cadenceKey}, payer ${payerType}`, [{ entity: "commercial_tuition_rates", id: rate.id }], {
                    rate_cents: rate.rateCents,
                    scope: pricing.scope,
                }),
                step("accounting", acct.accounting.glAccountId ? "revenue category → GL" : "revenue category unmapped", acct.used),
            ],
            origin: { entity: "commercial_tuition_rates", id: rate.id },
        }),
        warnings,
        used,
    };
}

function unresolvedTuition(
    ctx: CommercialContext,
    reason: ResolvedCommercialLine["reason"] & string,
    warnings: ResolutionWarning[],
    used: ProvenanceRef[],
    detail: string,
): LinePart {
    const lineKey = `tuition:${ctx.scope.variantId ?? ctx.scope.offeringId ?? "?"}`;
    warnings.push({ code: "tuition_unpriced", message: `Tuition unpriced: ${detail}.`, lineKey });
    return {
        line: mkLine({
            lineKey,
            status: "unresolved",
            reason,
            kind: "tuition",
            source: { entity: "commercial_tuition_rates", id: "", scope: ctx.scope },
            cadence: null,
            grossCents: 0,
            precision: DEFAULT_PRECISION,
            accounting: { revenueCategoryId: null, glAccountId: null, recognition: "deferred" },
            behavior: {},
            steps: [step("selection", detail, used)],
            origin: { entity: "commercial_tuition_rates", id: "" },
        }),
        warnings,
        used,
    };
}

// ── Product lines ────────────────────────────────────────────────────────────

function resolveProductLine(product: CommercialProductDef, exp: CommercialExport, ctx: CommercialContext, precision: Precision): LinePart {
    const warnings: ResolutionWarning[] = [];
    const used: ProvenanceRef[] = [{ entity: "commercial_products", id: product.id, label: product.name }];
    const lineKey = `product:${product.id}`;
    const acct = resolveAccounting(product.revenueCategoryId, product.commercialType, product.behavior, exp, lineKey);
    warnings.push(...acct.warnings);
    used.push(...acct.used);

    return {
        line: mkLine({
            lineKey,
            status: "resolved",
            kind: product.commercialType,
            source: { entity: "commercial_products", id: product.id, scope: { programKey: ctx.scope.programKey, locationId: ctx.scope.locationId } },
            cadence: cadenceRef(product.cadenceKey, exp.cadences),
            grossCents: product.amountCents,
            precision,
            accounting: acct.accounting,
            behavior: product.behavior,
            steps: [
                step("selection", `product "${product.name}" applicable to program/location scope`, [{ entity: "commercial_products", id: product.id }]),
                step("pricing", `configured amount`, [{ entity: "commercial_products", id: product.id }], { amount_cents: product.amountCents }),
                step("accounting", acct.accounting.glAccountId ? "revenue category → GL" : "revenue category unmapped", acct.used),
            ],
            origin: { entity: "commercial_products", id: product.id },
        }),
        warnings,
        used,
    };
}

// ── Line + explanation builders ──────────────────────────────────────────────

function step(stage: ExplanationStep["stage"], summary: string, used: ProvenanceRef[], detail?: ExplanationStep["detail"]): ExplanationStep {
    return { stage, summary, used, detail };
}

function mkLine(args: {
    lineKey: string;
    status: ResolutionStatus;
    reason?: ResolvedCommercialLine["reason"];
    kind: ResolvedCommercialLine["kind"];
    source: ResolvedCommercialLine["source"];
    cadence: CadenceRef;
    grossCents: number;
    precision: Precision;
    accounting: ResolvedCommercialLine["accounting"];
    behavior: Record<string, unknown>;
    steps: ExplanationStep[];
    origin: ProvenanceRef;
}): ResolvedCommercialLine {
    const gross = money(args.grossCents, args.precision.currency, args.precision.roundingRule);
    // Phase 4: no policy → net === gross. Funding null → residual is the full net.
    const net = gross;
    const explanation: LineExplanation = { steps: args.steps, origin: args.origin };
    return {
        lineKey: args.lineKey,
        status: args.status,
        reason: args.reason,
        kind: args.kind,
        source: args.source,
        cadence: args.cadence,
        gross,
        adjustments: [],
        net,
        funding: null,
        accounting: args.accounting,
        behavior: args.behavior,
        explanation,
    };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** evaluate(): one Commercial Context → one Commercial Resolution. Pure. */
export function evaluate(context: CommercialContext, cfg: CommercialExport): CommercialResolution {
    const precision = DEFAULT_PRECISION;
    const lines: ResolvedCommercialLine[] = [];
    const warnings: ResolutionWarning[] = [];
    const configUsed: ProvenanceRef[] = [];

    const program = cfg.programs.find((p) => p.programKey === context.scope.programKey);

    if (program) {
        configUsed.push({ entity: "location_program_categories", id: program.programKey, label: program.label });

        const tuition = resolveTuitionLine(cfg, context, precision);
        if (tuition.line) lines.push(tuition.line);
        warnings.push(...tuition.warnings);
        configUsed.push(...tuition.used);

        for (const product of resolveProducts(cfg, { programKey: context.scope.programKey, locationId: context.scope.locationId ?? null, asOf: context.asOf })) {
            const part = resolveProductLine(product, cfg, context, precision);
            if (part.line) lines.push(part.line);
            warnings.push(...part.warnings);
            configUsed.push(...part.used);
        }
    }

    const status = rollUp(!!program, lines);
    const explanation: ResolutionExplanationGraph = {
        configUsed: dedupProvenance(configUsed),
        policiesConsidered: [], // Phase 5
        fundingConsidered: [], // Phase 6
        notes: program ? undefined : [`No Program matches program_key "${context.scope.programKey}".`],
    };

    return {
        resolutionKey: resolutionKeyFor(context, cfg.version.version),
        configVersion: cfg.version,
        context,
        status,
        lines,
        warnings,
        precision,
        effective: { asOf: context.asOf, window: context.period },
        explanation,
    };
}

/**
 * evaluateSet(): group evaluation. Phase-4 SCAFFOLD — evaluates each context
 * independently (no relational/cross-subject policy yet; that arrives with the
 * Policy stage in Phase 5). The `group` is accepted and echoed so callers can
 * adopt the API now without a later signature change.
 */
export function evaluateSet(contexts: CommercialContext[], _group: RelationalScope, cfg: CommercialExport): CommercialResolution[] {
    return contexts.map((c) => evaluate(c, cfg));
}

function rollUp(hasProgram: boolean, lines: ResolvedCommercialLine[]): ResolutionStatus {
    if (!hasProgram) return "unresolved";
    const resolved = lines.filter((l) => l.status === "resolved").length;
    const notOffered = lines.filter((l) => l.status === "not_offered").length;
    const unresolved = lines.filter((l) => l.status === "unresolved").length;
    if (unresolved === 0 && notOffered === 0) return "resolved"; // includes the empty-but-valid case
    if (resolved > 0) return "partial";
    if (notOffered > 0) return "not_offered";
    return "unresolved";
}

function dedupProvenance(refs: ProvenanceRef[]): ProvenanceRef[] {
    const seen = new Set<string>();
    const out: ProvenanceRef[] = [];
    for (const r of refs) {
        const k = `${r.entity}:${r.id}`;
        if (r.id && !seen.has(k)) {
            seen.add(k);
            out.push(r);
        }
    }
    return out;
}
