/**
 * Slice 0.7 — compile-time proof that cost is representable and bounded.
 *
 * The widening this slice performs is TYPE-ONLY, so no runtime test can prove
 * it: vitest strips types, and a literal `0` behaves identically to `number` at
 * run time. These assertions are checked by `npm run typecheck:tests`, which CI
 * runs on every PR.
 *
 * `@ts-expect-error` is itself an error when the expected error disappears, so
 * the negative cases below fail the build if the contract is ever loosened.
 *
 * Same pattern as `trustContractTypeInvariants.test-d.ts` from Trust Runtime V1.
 */

import type { DecisionPackageEconomics } from "@/lib/trust/package/decisionPackageTypes";
import type { ProviderCostUnits } from "@/lib/trust/economics/providerCostUnits";
import type { ReasoningOutcome } from "@/lib/trust/reasoning/reasoningStrategy";

type PackageCost = DecisionPackageEconomics["provider_cost_units"];

// ---------------------------------------------------------------------------
// Representable: the whole point of the slice
// ---------------------------------------------------------------------------

// 1 — zero still compiles, so nothing that recorded zero has to change.
const zero: PackageCost = 0;

// 2 — a small measured decimal compiles. THIS is the assertion that fails if
//     the type is ever restored to the literal `0`.
const smallDecimal: PackageCost = 0.000125;

// 3 — an ordinary positive value compiles.
const ordinary: PackageCost = 3.750125;

// 4 — a computed value compiles: cost arrives from measurement, not a literal.
declare const measured: number;
const fromMeasurement: PackageCost = measured;

// 5 — the exported alias is the same contract the package uses.
const viaAlias: ProviderCostUnits = 0.5;
const aliasIsAssignable: PackageCost = viaAlias;

// ---------------------------------------------------------------------------
// Still bounded: cost is a number of units, never a price or a credential
// ---------------------------------------------------------------------------

// 6 — a string is not a cost.
// @ts-expect-error Provider cost units are numeric, never a formatted string.
const notAString: PackageCost = "0.000125";

// 7 — a money object is not a cost. This slice adds no currency semantics.
// @ts-expect-error Provider cost units carry no currency or amount structure.
const notMoney: PackageCost = { amount: 125, currency: "USD" };

// 8 — null is not a cost; omission is expressed at the reporting boundary.
// @ts-expect-error The package always carries a concrete cost.
const notNull: PackageCost = null;

// ---------------------------------------------------------------------------
// The reporting boundary
// ---------------------------------------------------------------------------

// 9 — a strategy may report cost on the success branch.
const successWithCost: ReasoningOutcome = {
    ok: true,
    proposal: {
        recommendation: {},
        confidence: 1,
        evidence: [],
        explanation: "e",
        remaining_uncertainty: [],
    },
    cost_units: 0.25,
};

// 10 — and on the declining branch: a provider call that failed still spent.
const declineWithCost: ReasoningOutcome = {
    ok: false,
    refusal_code: "REASONING_UNABLE",
    detail: "d",
    cost_units: 0.25,
};

// 11 — reporting nothing is legal; omission means zero.
const declineWithoutCost: ReasoningOutcome = {
    ok: false,
    refusal_code: "REASONING_UNABLE",
    detail: "d",
};

// 12 — a strategy may not report a price object instead of units.
const priceShaped: ReasoningOutcome = {
    ok: false,
    refusal_code: "REASONING_UNABLE",
    detail: "d",
    // @ts-expect-error Cost is a number of units, never a currency amount.
    cost_units: { amount: 1, currency: "USD" },
};

// ---------------------------------------------------------------------------
// ADR-2: the package economics contract names no provider
// ---------------------------------------------------------------------------

// 13 — provider identity is not a field of package economics.
// @ts-expect-error Provider identity belongs to usage/economics telemetry, not the package.
const noProviderKey: DecisionPackageEconomics["provider_key"] = "openai";

// 14 — nor is a model identifier.
// @ts-expect-error Model identity never appears in a Decision Package.
const noModelId: DecisionPackageEconomics["model_id"] = "gpt-4o";

export type {};
void zero;
void smallDecimal;
void ordinary;
void fromMeasurement;
void viaAlias;
void aliasIsAssignable;
void notAString;
void notMoney;
void notNull;
void successWithCost;
void declineWithCost;
void declineWithoutCost;
void priceShaped;
void noProviderKey;
void noModelId;
