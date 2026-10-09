"use client";

import { useMemo, useState } from "react";
import {
    ConfigurationDetailCard,
    ConfigurationInlineButton,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigDateInput,
    ConfigFieldLabel,
    ConfigNumberInput,
    ConfigSelectInput,
    ConfigVersionBadge,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import { useFinancialPolicies } from "@/components/adminV2/settings/financials/useFinancialPolicies";
import { buildVersionTimeline } from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";
import { formatEffectiveRange, formatYmd } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import {
    BILLING_TIMING_FALLBACK,
    BILLING_TIMING_RULE_DERIVES,
    BILLING_TIMING_RULE_LABEL,
    BILLING_TIMING_RULES,
    buildBillingTimingModel,
    ruleSentence,
    type BillingTimingRule,
    type RuleReading,
} from "@/lib/financials/policies/billingTimingViewModel";
import {
    DUE_DATE_STRATEGIES,
    INVOICE_TIMING_STRATEGIES,
    POLICY_TYPE_REGISTRY,
    type FinancialPolicyRow,
} from "@/lib/financials/policies/financialPolicyTypes";

/**
 * BILLING & PAYMENT TIMING — "how does this organization bill?", answered resolved-first.
 *
 * Organization default → only the locations that actually override → history, separately. Every
 * rule says what it derives, and every unconfigured rule says, in words, what happens instead.
 * Underneath it is the same effective-dated `financial_policies` lineage the charge writers resolve
 * (`resolveFinancialPolicy`); this page never shows raw rows as the primary reading.
 */

type Scope = { type: "org" } | { type: "location"; locationId: string; locationName: string };
type EditorState = { rule: BillingTimingRule; scope: Scope; mode: "now" | "schedule"; reading: RuleReading | null };

function localToday(): string {
    return new Date().toLocaleDateString("en-CA");
}

function dayAfter(ymd: string): string {
    const t = Date.parse(`${ymd}T00:00:00Z`);
    return new Date(t + 86_400_000).toISOString().slice(0, 10);
}

export default function BillingTimingConfigurationPanel({
    locations,
    canMutate = true,
}: {
    locations: { id: string; name: string }[];
    canMutate?: boolean;
}) {
    const todayYmd = localToday();
    const { policies, loading, error, busy, createPolicy, versionPolicy, retirePolicy, voidPolicy } = useFinancialPolicies();
    const model = useMemo(() => buildBillingTimingModel({ policies, locations, todayYmd }), [policies, locations, todayYmd]);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [historyOpen, setHistoryOpen] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const run = async (fn: () => Promise<void>) => {
        setActionError(null);
        try {
            await fn();
        } catch (e) {
            setActionError(e instanceof Error ? e.message : "That change could not be saved.");
        }
    };

    const returnToDefault = (reading: RuleReading) =>
        run(async () => {
            for (const row of reading.history) {
                if (row.is_active === false) continue;
                if (row.effective_start > todayYmd) await voidPolicy(row.id);
            }
            if (reading.current) await retirePolicy({ id: reading.current.id, effective_end: todayYmd });
        });

    return (
        <section className="space-y-3" data-testid="billing-timing">
            <div>
                <h2 className="text-sm font-semibold text-alloy-midnight">Billing &amp; payment timing</h2>
                <p className="mt-1 max-w-2xl text-sm text-alloy-midnight/60">
                    How this organization bills. Every charge&apos;s billing period, invoice date, due date and posting are
                    derived from these four rules — in this order:
                </p>
                <p className="mt-1 text-xs font-medium text-alloy-midnight/70" data-testid="billing-timing-chain">
                    Service date → Billing period → Invoice date → Due date → Posting
                </p>
                <p className="mt-1 text-xs text-alloy-midnight/55">
                    Accounting periods are separate — configured under Accounting, attributed from each entry&apos;s
                    effective date, never from the billing period.
                </p>
            </div>

            {error || actionError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {actionError ?? error}
                </p>
            ) : null}

            {loading ? (
                <p className="text-sm text-alloy-midnight/55">Loading billing configuration…</p>
            ) : (
                <>
                    <ConfigurationDetailCard title="Organization default" testId="billing-timing-org-default">
                        <ul className="divide-y divide-alloy-stone/25">
                            {model.orgDefault.map((reading) => (
                                <RuleRow
                                    key={reading.rule}
                                    reading={reading}
                                    scope={{ type: "org" }}
                                    todayYmd={todayYmd}
                                    canMutate={canMutate}
                                    busy={busy}
                                    historyOpen={historyOpen === `org:${reading.rule}`}
                                    onToggleHistory={() =>
                                        setHistoryOpen((h) => (h === `org:${reading.rule}` ? null : `org:${reading.rule}`))
                                    }
                                    onEdit={(mode) => setEditor({ rule: reading.rule, scope: { type: "org" }, mode, reading })}
                                    onCancelScheduled={(id) => void run(() => voidPolicy(id))}
                                />
                            ))}
                        </ul>
                        {editor && editor.scope.type === "org" ? (
                            <RuleEditor
                                state={editor}
                                todayYmd={todayYmd}
                                busy={busy}
                                onCancel={() => setEditor(null)}
                                onSave={(value, effectiveStart) =>
                                    run(async () => {
                                        await saveRule({ editor, value, effectiveStart, createPolicy, versionPolicy });
                                        setEditor(null);
                                    })
                                }
                            />
                        ) : null}
                    </ConfigurationDetailCard>

                    <ConfigurationDetailCard title="Overrides" testId="billing-timing-overrides">
                        {model.overrides.length === 0 ? (
                            <p className="text-sm text-alloy-midnight/60" data-testid="billing-timing-no-overrides">
                                No location overrides — every location bills on the organization default.
                            </p>
                        ) : (
                            <ul className="space-y-4">
                                {model.overrides.map((o) => (
                                    <li key={o.locationId} data-testid={`billing-timing-override-${o.locationId}`}>
                                        <p className="text-sm font-semibold text-alloy-midnight">{o.locationName}</p>
                                        <ul className="mt-1 divide-y divide-alloy-stone/20">
                                            {o.rules.map((r) =>
                                                r.overridden ? (
                                                    <RuleRow
                                                        key={r.rule}
                                                        reading={r.reading}
                                                        scope={{ type: "location", locationId: o.locationId, locationName: o.locationName }}
                                                        todayYmd={todayYmd}
                                                        canMutate={canMutate}
                                                        busy={busy}
                                                        historyOpen={historyOpen === `${o.locationId}:${r.rule}`}
                                                        onToggleHistory={() =>
                                                            setHistoryOpen((h) =>
                                                                h === `${o.locationId}:${r.rule}` ? null : `${o.locationId}:${r.rule}`,
                                                            )
                                                        }
                                                        onEdit={(mode) =>
                                                            setEditor({
                                                                rule: r.rule,
                                                                scope: { type: "location", locationId: o.locationId, locationName: o.locationName },
                                                                mode,
                                                                reading: r.reading,
                                                            })
                                                        }
                                                        onReturnToDefault={() => void returnToDefault(r.reading)}
                                                        onCancelScheduled={(id) => void run(() => voidPolicy(id))}
                                                    />
                                                ) : (
                                                    <li
                                                        key={r.rule}
                                                        className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-[13px]"
                                                        data-testid={`billing-timing-inherits-${o.locationId}-${r.rule}`}
                                                    >
                                                        <span className="w-36 shrink-0 text-alloy-forge/70">{BILLING_TIMING_RULE_LABEL[r.rule]}</span>
                                                        <span className="flex-1 text-alloy-midnight/60">
                                                            Inherits organization default · {r.inheritedSentence}
                                                        </span>
                                                        {canMutate ? (
                                                            <ConfigurationInlineButton
                                                                onClick={() =>
                                                                    setEditor({
                                                                        rule: r.rule,
                                                                        scope: { type: "location", locationId: o.locationId, locationName: o.locationName },
                                                                        mode: "now",
                                                                        reading: null,
                                                                    })
                                                                }
                                                                disabled={busy}
                                                            >
                                                                Override
                                                            </ConfigurationInlineButton>
                                                        ) : null}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {editor && editor.scope.type === "location" ? (
                            <RuleEditor
                                state={editor}
                                todayYmd={todayYmd}
                                busy={busy}
                                onCancel={() => setEditor(null)}
                                onSave={(value, effectiveStart) =>
                                    run(async () => {
                                        await saveRule({ editor, value, effectiveStart, createPolicy, versionPolicy });
                                        setEditor(null);
                                    })
                                }
                            />
                        ) : null}

                        {canMutate && !editor ? (
                            adding ? (
                                <AddOverrideForm
                                    locations={locations}
                                    onCancel={() => setAdding(false)}
                                    onPick={(locationId, rule) => {
                                        const name = locations.find((l) => l.id === locationId)?.name ?? "Location";
                                        setAdding(false);
                                        setEditor({ rule, scope: { type: "location", locationId, locationName: name }, mode: "now", reading: null });
                                    }}
                                />
                            ) : (
                                <div className="mt-3">
                                    <ConfigurationSecondaryButton onClick={() => setAdding(true)} data-testid="billing-timing-add-override">
                                        Add override
                                    </ConfigurationSecondaryButton>
                                </div>
                            )
                        ) : null}

                        {model.accountCalendarCount > 0 ? (
                            <p className="mt-3 text-xs text-alloy-midnight/60" data-testid="billing-timing-account-calendars">
                                {model.accountCalendarCount === 1
                                    ? "1 account has its own billing period"
                                    : `${model.accountCalendarCount} accounts have their own billing period`}{" "}
                                — a household attending more than one location needs one.
                            </p>
                        ) : null}
                    </ConfigurationDetailCard>
                </>
            )}
        </section>
    );
}

function RuleRow({
    reading,
    scope,
    todayYmd,
    canMutate,
    busy,
    historyOpen,
    onToggleHistory,
    onEdit,
    onReturnToDefault,
    onCancelScheduled,
}: {
    reading: RuleReading;
    scope: Scope;
    todayYmd: string;
    canMutate: boolean;
    busy: boolean;
    historyOpen: boolean;
    onToggleHistory: () => void;
    onEdit: (mode: "now" | "schedule") => void;
    onReturnToDefault?: () => void;
    onCancelScheduled?: (rowId: string) => void;
}) {
    const scopeKey = scope.type === "org" ? "org" : scope.locationId;
    const fallback = reading.isFallback && scope.type === "org";
    return (
        <li className="py-2" data-testid={`billing-timing-rule-${scopeKey}-${reading.rule}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="w-36 shrink-0 text-[13px] text-alloy-forge/70">{BILLING_TIMING_RULE_LABEL[reading.rule]}</span>
                <span className="min-w-0 flex-1">
                    <span
                        className={`text-[13px] font-medium ${fallback ? (BILLING_TIMING_FALLBACK[reading.rule].blocksBilling ? "text-red-700" : "text-amber-700") : "text-alloy-midnight"}`}
                        data-testid={`billing-timing-value-${scopeKey}-${reading.rule}`}
                    >
                        {reading.current || !reading.scheduled ? reading.sentence : "Not in force yet"}
                    </span>
                    {reading.current && reading.through ? (
                        <span className="ml-2 text-xs text-alloy-midnight/55">through {formatYmd(reading.through)}</span>
                    ) : null}
                    {reading.scheduled ? (
                        <span className="mt-0.5 block text-xs text-alloy-midnight/70" data-testid={`billing-timing-scheduled-${scopeKey}-${reading.rule}`}>
                            Scheduled · {reading.scheduled.sentence} · effective {formatYmd(reading.scheduled.row.effective_start)}
                        </span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-alloy-midnight/50">{BILLING_TIMING_RULE_DERIVES[reading.rule]}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                    {canMutate ? (
                        <>
                            <ConfigurationInlineButton onClick={() => onEdit("now")} disabled={busy}>
                                {reading.isFallback ? "Set" : "Edit"}
                            </ConfigurationInlineButton>
                            <ConfigurationInlineButton onClick={() => onEdit("schedule")} disabled={busy}>
                                Schedule change
                            </ConfigurationInlineButton>
                            {reading.scheduled && onCancelScheduled ? (
                                <ConfigurationInlineButton
                                    onClick={() => onCancelScheduled(reading.scheduled!.row.id)}
                                    disabled={busy}
                                    data-testid={`billing-timing-cancel-scheduled-${scopeKey}-${reading.rule}`}
                                >
                                    Cancel scheduled change
                                </ConfigurationInlineButton>
                            ) : null}
                            {onReturnToDefault ? (
                                <ConfigurationInlineButton onClick={onReturnToDefault} disabled={busy}>
                                    Return to organization default
                                </ConfigurationInlineButton>
                            ) : null}
                        </>
                    ) : null}
                    {reading.history.length > 0 ? (
                        <ConfigurationInlineButton onClick={onToggleHistory}>
                            {historyOpen ? "Hide history" : "View history"}
                        </ConfigurationInlineButton>
                    ) : null}
                </span>
            </div>
            {historyOpen ? <RuleHistory reading={reading} todayYmd={todayYmd} /> : null}
        </li>
    );
}

function RuleHistory({ reading, todayYmd }: { reading: RuleReading; todayYmd: string }) {
    const timeline = buildVersionTimeline(reading.history, todayYmd);
    return (
        <ul className="mt-2 space-y-1 rounded-md bg-alloy-stone/10 px-3 py-2" data-testid={`billing-timing-history-${reading.rule}`}>
            {timeline.map(({ row, status }) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 text-xs text-alloy-midnight/75">
                    <ConfigVersionBadge status={status} />
                    <span className="font-medium">{ruleSentence(reading.rule, row.value)}</span>
                    <span className="text-alloy-midnight/50">{formatEffectiveRange(row)}</span>
                </li>
            ))}
        </ul>
    );
}

function AddOverrideForm({
    locations,
    onCancel,
    onPick,
}: {
    locations: { id: string; name: string }[];
    onCancel: () => void;
    onPick: (locationId: string, rule: BillingTimingRule) => void;
}) {
    const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
    const [rule, setRule] = useState<BillingTimingRule>("billing_calendar");
    return (
        <div className="mt-3 flex flex-wrap items-end gap-3" data-testid="billing-timing-add-override-form">
            <ConfigFieldLabel label="Location">
                <ConfigSelectInput
                    value={locationId}
                    onChange={setLocationId}
                    options={locations.map((l) => ({ value: l.id, label: l.name }))}
                />
            </ConfigFieldLabel>
            <ConfigFieldLabel label="Rule">
                <ConfigSelectInput
                    value={rule}
                    onChange={(v) => setRule(v as BillingTimingRule)}
                    options={BILLING_TIMING_RULES.map((r) => ({ value: r, label: BILLING_TIMING_RULE_LABEL[r] }))}
                />
            </ConfigFieldLabel>
            <ConfigurationPrimaryButton onClick={() => locationId && onPick(locationId, rule)} disabled={!locationId}>
                Continue
            </ConfigurationPrimaryButton>
            <ConfigurationSecondaryButton onClick={onCancel}>Cancel</ConfigurationSecondaryButton>
        </div>
    );
}

function initialValue(rule: BillingTimingRule, current: FinancialPolicyRow | null): Record<string, string> {
    const v = (current?.value ?? {}) as Record<string, unknown>;
    switch (rule) {
        case "billing_calendar":
            return { cadence: String(v.cadence ?? "monthly"), anchor_on: v.anchor_on ? String(v.anchor_on) : "" };
        case "invoice_timing":
            return { strategy: String(v.strategy ?? "days_before_period_start"), offset_days: String(v.offset_days ?? 7) };
        case "due_date":
            return { strategy: String(v.strategy ?? "on_period_start"), offset_days: String(v.offset_days ?? 0) };
        case "posting_review":
            return { required: v.required === true ? "yes" : "no" };
    }
}

function valueFrom(rule: BillingTimingRule, f: Record<string, string>): Record<string, unknown> {
    switch (rule) {
        case "billing_calendar":
            return { cadence: f.cadence, anchor_on: f.cadence === "monthly" ? null : f.anchor_on || null };
        case "invoice_timing":
            return { strategy: f.strategy, offset_days: f.strategy === "days_before_period_start" ? Number(f.offset_days || 0) : 0 };
        case "due_date":
            return {
                strategy: f.strategy,
                offset_days: f.strategy === "days_after_invoice" || f.strategy === "days_after_period_start" ? Number(f.offset_days || 0) : 0,
            };
        case "posting_review":
            return { required: f.required === "yes" };
    }
}

function RuleEditor({
    state,
    todayYmd,
    busy,
    onCancel,
    onSave,
}: {
    state: EditorState;
    todayYmd: string;
    busy: boolean;
    onCancel: () => void;
    onSave: (value: Record<string, unknown>, effectiveStart: string) => void;
}) {
    const [f, setF] = useState<Record<string, string>>(() => initialValue(state.rule, state.reading?.current ?? null));
    const [effective, setEffective] = useState(state.mode === "schedule" ? dayAfter(todayYmd) : todayYmd);
    const set = (k: string) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
    const where = state.scope.type === "org" ? "Organization default" : `${state.scope.locationName} override`;
    const preview = ruleSentence(state.rule, valueFrom(state.rule, f));
    return (
        <div className="mt-3 rounded-md border border-alloy-stone/40 p-3" data-testid={`billing-timing-editor-${state.rule}`}>
            <p className="text-xs font-semibold text-alloy-midnight">
                {BILLING_TIMING_RULE_LABEL[state.rule]} · {where} · {state.mode === "schedule" ? "schedule a change" : "change from today"}
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
                {state.rule === "billing_calendar" ? (
                    <>
                        <ConfigFieldLabel label="Cadence">
                            <ConfigSelectInput
                                value={f.cadence}
                                onChange={set("cadence")}
                                options={POLICY_TYPE_REGISTRY.billing_calendar.fields[0]!.options ?? []}
                                testId="billing-timing-editor-cadence"
                            />
                        </ConfigFieldLabel>
                        {f.cadence !== "monthly" ? (
                            <ConfigFieldLabel label="First period starts">
                                <ConfigDateInput value={f.anchor_on ?? ""} onChange={set("anchor_on")} />
                            </ConfigFieldLabel>
                        ) : null}
                    </>
                ) : null}
                {state.rule === "invoice_timing" ? (
                    <>
                        <ConfigFieldLabel label="Invoice">
                            <ConfigSelectInput
                                value={f.strategy}
                                onChange={set("strategy")}
                                options={INVOICE_TIMING_STRATEGIES}
                                testId="billing-timing-editor-invoice-strategy"
                            />
                        </ConfigFieldLabel>
                        {f.strategy === "days_before_period_start" ? (
                            <ConfigFieldLabel label="Days before">
                                <ConfigNumberInput value={f.offset_days ?? "0"} onChange={set("offset_days")} min="0" testId="billing-timing-editor-invoice-days" />
                            </ConfigFieldLabel>
                        ) : null}
                    </>
                ) : null}
                {state.rule === "due_date" ? (
                    <>
                        <ConfigFieldLabel label="Due">
                            <ConfigSelectInput
                                value={f.strategy}
                                onChange={set("strategy")}
                                options={DUE_DATE_STRATEGIES}
                                testId="billing-timing-editor-due-strategy"
                            />
                        </ConfigFieldLabel>
                        {f.strategy === "days_after_invoice" || f.strategy === "days_after_period_start" ? (
                            <ConfigFieldLabel label="Days">
                                <ConfigNumberInput value={f.offset_days ?? "0"} onChange={set("offset_days")} min="0" />
                            </ConfigFieldLabel>
                        ) : null}
                    </>
                ) : null}
                {state.rule === "posting_review" ? (
                    <ConfigFieldLabel label="Review before posting">
                        <ConfigSelectInput
                            value={f.required}
                            onChange={set("required")}
                            options={[
                                { value: "no", label: "No review required" },
                                { value: "yes", label: "Every charge waits for review" },
                            ]}
                        />
                    </ConfigFieldLabel>
                ) : null}
                {state.mode === "schedule" ? (
                    <ConfigFieldLabel label="Effective">
                        <ConfigDateInput value={effective} onChange={setEffective} min={dayAfter(todayYmd)} />
                    </ConfigFieldLabel>
                ) : null}
            </div>
            <p className="mt-2 text-xs text-alloy-midnight/70" data-testid="billing-timing-editor-preview">
                {preview}
                {state.mode === "schedule" ? ` · effective ${formatYmd(effective)}` : " · from today"}
            </p>
            <div className="mt-2 flex gap-2">
                <ConfigurationPrimaryButton
                    onClick={() => onSave(valueFrom(state.rule, f), effective)}
                    disabled={busy || (state.rule === "billing_calendar" && f.cadence !== "monthly" && !f.anchor_on)}
                    data-testid="billing-timing-editor-save"
                >
                    Save
                </ConfigurationPrimaryButton>
                <ConfigurationSecondaryButton onClick={onCancel}>Cancel</ConfigurationSecondaryButton>
            </div>
        </div>
    );
}

/**
 * A change is a NEW VERSION of the rule at that scope, superseding the latest version that starts
 * before it — or the first version when the scope has none. Effective dating stays underneath; the
 * operator chose "from today" or a date, never a row.
 */
async function saveRule(args: {
    editor: EditorState;
    value: Record<string, unknown>;
    effectiveStart: string;
    createPolicy: (b: Record<string, unknown>) => Promise<void>;
    versionPolicy: (b: Record<string, unknown>) => Promise<void>;
}): Promise<void> {
    const { editor, value, effectiveStart } = args;
    const prior = (editor.reading?.history ?? [])
        .filter((r) => r.is_active !== false && r.effective_start < effectiveStart)
        .sort((a, b) => (a.effective_start < b.effective_start ? 1 : -1))[0];
    if (prior) {
        await args.versionPolicy({ prior_id: prior.id, effective_start: effectiveStart, value });
        return;
    }
    await args.createPolicy({
        scope_type: editor.scope.type,
        location_id: editor.scope.type === "location" ? editor.scope.locationId : null,
        policy_type: editor.rule,
        value,
        effective_start: effectiveStart,
    });
}
