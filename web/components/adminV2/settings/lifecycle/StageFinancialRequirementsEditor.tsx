"use client";

/**
 * Author whether a stage requires a FEE, and on what grain — in a director's words.
 *
 * "Families pay the $75 enrollment fee before they're enrolled" was, until now, unsayable. A stage
 * could require a field, a form, or its own work; it could not require money. The fee therefore
 * lived wherever someone had put a currency question on a form, which made it a typed answer rather
 * than an obligation: nothing was owed, nothing could be paid, and nothing could tell a family what
 * was left.
 *
 * ── WHAT THIS SCREEN DOES NOT LET ANYONE DO ──
 *
 * Type an amount. There is no price field here and there is no price field in what gets stored,
 * because Enrollment does not own the number. The only thing authored is WHICH charge definition
 * applies, by key. The dollar figure beside each option is READ from that definition in Financials
 * and shown so the choice is legible — it is never copied into the requirement. Change the price by
 * versioning the charge definition in Financials, and every stage that references it follows; there
 * is no second copy here to drift out of date.
 *
 * That boundary is the whole reason this is a distinct requirement kind rather than a number on a
 * stage. Amount, discounts, who is responsible, what is expected from a subsidy, what is collectible
 * right now, payments and reversals are all Financials'. Enrollment owns exactly three decisions:
 * whether a fee applies, which definition applies, and whether it is owed once per family or once
 * per enrolling child.
 *
 * ── WHY GRAIN IS `scope`, NOT A NEW ENUM ──
 *
 * "Per family" and "per child" are not a new axis. `scope: record` already means the family record
 * and `scope: each_child` already means once per enrolling child, and every other requirement kind
 * is read through them. Adding a parallel `per_family | per_child` would have created a second
 * vocabulary for the same truth, and the first disagreement between the two would be a billing bug.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Loader2 } from "lucide-react";

import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { PersistedRequirementLevel } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type { RequirementEnforcement } from "@/lib/lifecycle/requirementTimingTypes";
import { requirementsOfOtherKinds } from "@/lib/lifecycle/stageRequirementsV1";

/** The two grains a fee can be owed on, said the way a director says them. */
const GRAINS = [
    { value: "record", label: "Once per family" },
    { value: "each_child", label: "Once per enrolling child" },
] as const;

type FeeGrain = (typeof GRAINS)[number]["value"];

const ENFORCEMENTS: RequirementEnforcement[] = ["informational", "attention", "blocking"];

type FinancialRequirementRow = {
    requirement_id: string;
    kind: "financial";
    charge_template_key: string;
    level: PersistedRequirementLevel;
    scope: FeeGrain;
    timing: "stage_exit";
    enforcement: RequirementEnforcement;
};

/** A charge definition as this screen needs it: a key, a name, and a price it does not own. */
type ChargeDefinitionOption = {
    template_key: string;
    label: string;
    charge_category: string;
    amount_cents: number | null;
    amount_strategy: string;
    currency_code: string;
    effective_start: string | null;
    is_active: boolean;
};

/**
 * Identity derived from the definition it references, so a reload does not look like a new fee.
 *
 * This is the same rule the work editor follows, and it matters more here: the requirement id is
 * what the family's screen reads a fee back by, so a random id per save would make one fee look
 * like a succession of different ones.
 */
export function requirementIdForChargeTemplate(templateKey: string): string {
    return `fee_${templateKey}`;
}

export function rowsFromStage(
    stage: LifecycleBuilderStageRecord | null | undefined,
): FinancialRequirementRow[] {
    const authored = stage?.requirements_v1?.requirements ?? [];
    return authored.flatMap((r) =>
        r.ref.kind === "financial" ?
            [
                {
                    requirement_id: r.requirement_id,
                    kind: "financial" as const,
                    charge_template_key: r.ref.charge_template_key,
                    level: r.level,
                    // Anything that is not the per-child grain is the family record — the same
                    // reading the runtime does, so the screen cannot disagree with the charge.
                    scope: (r.scope === "each_child" ? "each_child" : "record") as FeeGrain,
                    timing: "stage_exit" as const,
                    enforcement: (r.enforcement ?? "blocking") as RequirementEnforcement,
                },
            ]
        :   [],
    );
}

/**
 * The current version of each definition lineage.
 *
 * Charge definitions are effective-dated and superseded rather than edited, so a key legitimately
 * has several rows. Offering all of them would invite authoring against a retired price.
 */
export function currentDefinitions(rows: readonly ChargeDefinitionOption[]): ChargeDefinitionOption[] {
    const byKey = new Map<string, ChargeDefinitionOption>();
    for (const row of rows) {
        if (!row.template_key || row.is_active === false) continue;
        const held = byKey.get(row.template_key);
        if (!held || String(row.effective_start ?? "") > String(held.effective_start ?? "")) {
            byKey.set(row.template_key, row);
        }
    }
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** How a definition's price reads on screen. Display only — never stored on the requirement. */
export function priceLabel(def: ChargeDefinitionOption | undefined): string {
    if (!def) return "";
    if (def.amount_strategy !== "fixed" || def.amount_cents == null) {
        return "amount set by Financials";
    }
    const amount = (def.amount_cents / 100).toLocaleString(undefined, {
        style: "currency",
        currency: def.currency_code || "USD",
    });
    return def.amount_cents === 0 ? `${amount} — no charge` : amount;
}

export default function StageFinancialRequirementsEditor({
    departmentId,
    stageKey,
    stageRecord,
    process,
    onSaved,
}: {
    departmentId: string;
    stageKey: string;
    stageRecord?: LifecycleBuilderStageRecord | null;
    process?: LifecycleBuilderProcessRecord | null;
    onSaved?: () => void | Promise<void>;
}) {
    const [rows, setRows] = useState<FinancialRequirementRow[]>(() => rowsFromStage(stageRecord));
    const [definitions, setDefinitions] = useState<ChargeDefinitionOption[]>([]);
    const [loadFailed, setLoadFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Authored state is the server's, never the last thing typed.
    useEffect(() => {
        setRows(rowsFromStage(stageRecord));
        setError(null);
        setNotice(null);
    }, [stageRecord, stageKey]);

    useEffect(() => {
        let live = true;
        void fetch("/api/admin/financial/charge-templates", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("refused"))))
            .then((j) => {
                if (!live) return;
                setDefinitions(currentDefinitions(((j as { templates?: ChargeDefinitionOption[] }).templates ?? [])));
                setLoadFailed(false);
            })
            .catch(() => {
                if (!live) return;
                setDefinitions([]);
                setLoadFailed(true);
            });
        return () => {
            live = false;
        };
    }, []);

    const byKey = useMemo(() => new Map(definitions.map((d) => [d.template_key, d])), [definitions]);

    const add = useCallback((templateKey: string) => {
        setRows((prev) =>
            prev.some((r) => r.charge_template_key === templateKey) ?
                prev
            :   [
                    ...prev,
                    {
                        requirement_id: requirementIdForChargeTemplate(templateKey),
                        kind: "financial" as const,
                        charge_template_key: templateKey,
                        level: "required" as PersistedRequirementLevel,
                        scope: "record" as FeeGrain,
                        timing: "stage_exit" as const,
                        enforcement: "blocking" as RequirementEnforcement,
                    },
                ],
        );
    }, []);

    const update = useCallback((templateKey: string, patch: Partial<FinancialRequirementRow>) => {
        setRows((prev) => prev.map((r) => (r.charge_template_key === templateKey ? { ...r, ...patch } : r)));
    }, []);

    const remove = useCallback((templateKey: string) => {
        setRows((prev) => prev.filter((r) => r.charge_template_key !== templateKey));
    }, []);

    const save = useCallback(async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-builder`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "set_stage_requirements",
                        process_id: process?.id,
                        stage_key: stageKey,
                        // Carry the kinds this editor does not edit; the action replaces the section.
                        requirements: [
                            ...rows,
                            ...requirementsOfOtherKinds(stageRecord?.requirements_v1, "financial"),
                        ],
                    }),
                },
            );
            const json = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
            // The route's refusal IS the message — restating it would put a second explanation of
            // the same rule in a second place.
            if (!res.ok) {
                throw new Error([json.error, json.reason].filter(Boolean).join(" ") || "The change was refused.");
            }
            setNotice(
                rows.length ?
                    `Saved ${rows.length} fee requirement${rows.length === 1 ? "" : "s"}. Publish to make it live.`
                :   "Saved — this stage no longer requires a fee. Publish to make it live.",
            );
            await onSaved?.();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [departmentId, process?.id, stageKey, rows, stageRecord?.requirements_v1, onSaved]);

    if (!process?.id) {
        return <p className="stage-field__hint">Select a business process to configure fees.</p>;
    }

    const unselected = definitions.filter((d) => !rows.some((r) => r.charge_template_key === d.template_key));

    return (
        <div data-testid="stage-financial-requirements" className="mt-4 border-t border-alloy-midnight/8 pt-4">
            <div className="mb-2 flex items-center gap-1.5">
                <CircleDollarSign size={13} className="text-alloy-midnight/45" />
                <h4 className="text-[0.8125rem] font-semibold text-alloy-midnight">Fee required to leave this stage</h4>
            </div>
            <p className="stage-field__hint mb-3">
                Choose the charge definition that applies and whether it is owed once per family or once
                per enrolling child. Financials owns the amount, who owes it and what is still due — this
                stage only decides that it applies.
            </p>

            {rows.length ?
                <ul className="mb-3 space-y-2">
                    {rows.map((row) => {
                        const def = byKey.get(row.charge_template_key);
                        return (
                            <li
                                key={row.charge_template_key}
                                className="rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2"
                                data-testid={`stage-financial-requirement-${row.charge_template_key}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-[0.8125rem] text-alloy-midnight">
                                            {def?.label ?? row.charge_template_key}
                                        </p>
                                        <p
                                            className="text-[0.6875rem] text-alloy-midnight/45"
                                            data-testid={`stage-financial-price-${row.charge_template_key}`}
                                        >
                                            {def ?
                                                `${priceLabel(def)} · set in Financials`
                                                // A key with no current definition is the one case this
                                                // screen must not smooth over: the family will be told
                                                // the fee needs attention, not that it is $0 or settled.
                                            :   "No active charge definition for this key — families will see this fee as needing attention."}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="config-secondary-btn config-secondary-btn--sm shrink-0"
                                        onClick={() => remove(row.charge_template_key)}
                                        data-testid={`stage-financial-remove-${row.charge_template_key}`}
                                    >
                                        Remove
                                    </button>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-3 pl-0">
                                    <label className="flex items-center gap-2 text-[0.75rem] text-alloy-midnight/70">
                                        Applies
                                        <select
                                            className="rounded border border-alloy-midnight/15 px-1.5 py-0.5 text-[0.75rem]"
                                            value={row.scope}
                                            onChange={(e) =>
                                                update(row.charge_template_key, { scope: e.target.value as FeeGrain })
                                            }
                                            aria-label={`How often ${def?.label ?? row.charge_template_key} is owed`}
                                            data-testid={`stage-financial-grain-${row.charge_template_key}`}
                                        >
                                            {GRAINS.map((g) => (
                                                <option key={g.value} value={g.value}>
                                                    {g.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="flex items-center gap-2 text-[0.75rem] text-alloy-midnight/70">
                                        Required
                                        <input
                                            type="checkbox"
                                            checked={row.level === "required"}
                                            onChange={(e) =>
                                                update(row.charge_template_key, {
                                                    level: (e.target.checked ?
                                                        "required"
                                                    :   "optional") as PersistedRequirementLevel,
                                                })
                                            }
                                            aria-label={`Require ${def?.label ?? row.charge_template_key}`}
                                            data-testid={`stage-financial-required-${row.charge_template_key}`}
                                        />
                                    </label>

                                    <label className="flex items-center gap-2 text-[0.75rem] text-alloy-midnight/70">
                                        Enforcement
                                        <select
                                            className="rounded border border-alloy-midnight/15 px-1.5 py-0.5 text-[0.75rem]"
                                            value={row.enforcement}
                                            onChange={(e) =>
                                                update(row.charge_template_key, {
                                                    enforcement: e.target.value as RequirementEnforcement,
                                                })
                                            }
                                            aria-label={`Enforcement for ${def?.label ?? row.charge_template_key}`}
                                        >
                                            {ENFORCEMENTS.map((v) => (
                                                <option key={v} value={v}>
                                                    {v}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            :   <p className="mb-3 rounded-lg bg-alloy-midnight/[0.03] px-3 py-2 text-[0.75rem] text-alloy-midnight/55">
                    No fee is required to leave this stage.
                </p>
            }

            {loadFailed ?
                <p className="mb-3 text-[0.75rem] text-alloy-midnight/55" data-testid="stage-financial-definitions-unavailable">
                    Charge definitions could not be read, so none can be chosen here. Fees already
                    configured are shown above and are unaffected.
                </p>
            : unselected.length ?
                <label className="mb-3 block">
                    <span className="mb-1 block text-[0.6875rem] font-semibold text-alloy-midnight/60">
                        Add a fee
                    </span>
                    <select
                        className="w-full rounded-lg border border-alloy-forge/20 bg-white px-2 py-1.5 text-[0.75rem]"
                        value=""
                        disabled={busy}
                        data-testid="stage-financial-add"
                        onChange={(e) => {
                            if (e.target.value) add(e.target.value);
                        }}
                    >
                        <option value="">Choose a charge definition…</option>
                        {unselected.map((d) => (
                            <option key={d.template_key} value={d.template_key}>
                                {d.label} — {priceLabel(d)}
                            </option>
                        ))}
                    </select>
                </label>
            : definitions.length ?
                <p className="mb-3 text-[0.6875rem] text-alloy-midnight/45">
                    Every charge definition is already required here.
                </p>
            :   <p className="mb-3 rounded-lg bg-alloy-midnight/[0.03] px-3 py-2 text-[0.75rem] text-alloy-midnight/55">
                    No charge definitions exist yet. Create one in Financials, then it can be required here.
                </p>
            }

            <button
                type="button"
                className="rounded-md bg-alloy-pine px-3 py-1.5 text-[0.8125rem] font-semibold text-white disabled:opacity-40"
                onClick={save}
                disabled={busy}
                data-testid="stage-financial-requirements-save"
            >
                {busy ?
                    <span className="flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" /> Saving…
                    </span>
                :   "Save fee requirements"}
            </button>

            {error ?
                <p className="mt-2 text-[0.75rem] text-alloy-ember" data-testid="stage-financial-requirements-error">
                    {error}
                </p>
            :   null}
            {notice ?
                <p className="mt-2 text-[0.75rem] text-alloy-pine" data-testid="stage-financial-requirements-notice">
                    {notice}
                </p>
            :   null}
        </div>
    );
}
