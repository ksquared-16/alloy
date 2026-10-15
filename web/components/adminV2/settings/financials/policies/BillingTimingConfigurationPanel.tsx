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
import { formatYmd } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { humanRange } from "@/lib/financials/dates/humanDates";
import {
    BILLING_TIMING_FALLBACK,
    BILLING_TIMING_RULE_LABEL,
    BILLING_TIMING_RULES,
    buildBillingTimingModel,
    ruleSentence,
    type BillingTimingRule,
    type RuleReading,
} from "@/lib/financials/policies/billingTimingViewModel";
import { isWithdrawnPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
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

function dayBefore(ymd: string): string {
    const t = Date.parse(`${ymd}T00:00:00Z`);
    return new Date(t - 86_400_000).toISOString().slice(0, 10);
}

export default function BillingTimingConfigurationPanel({
    locations,
    locationsLoading = false,
    canMutate = true,
}: {
    locations: { id: string; name: string }[];
    /** True until the location list has loaded; overrides then name a pending location neutrally. */
    locationsLoading?: boolean;
    canMutate?: boolean;
}) {
    const todayYmd = localToday();
    const { policies, loading, error, busy, createPolicy, versionPolicy, retirePolicy, voidPolicy } = useFinancialPolicies();
    const model = useMemo(
        () => buildBillingTimingModel({ policies, locations, locationsLoaded: !locationsLoading, todayYmd }),
        [policies, locations, locationsLoading, todayYmd],
    );
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
                if (isWithdrawnPolicy(row)) continue;
                if (row.effective_start > todayYmd) await voidPolicy(row.id);
            }
            /*
             * The override's last day is YESTERDAY, so the organization default governs from today and
             * the override keeps answering for the dates it covered. One that began today can end no
             * earlier than today.
             */
            if (reading.current) {
                const end = dayBefore(todayYmd) < reading.current.effective_start ? todayYmd : dayBefore(todayYmd);
                await retirePolicy({ id: reading.current.id, effective_end: end });
            }
        });

    const openEditor = (rule: BillingTimingRule, scope: Scope, mode: "now" | "schedule", reading: RuleReading | null) =>
        setEditor({ rule, scope, mode, reading });
    const toggleHistory = (key: string) => setHistoryOpen((h) => (h === key ? null : key));

    /* The open history panel, found wherever its rule lives — rendered once, below its grid. */
    const orgHistory = model.orgDefault.find((r) => historyOpen === `org:${r.rule}`) ?? null;
    const overrideHistory = (() => {
        for (const o of model.overrides) {
            for (const r of o.rules) {
                if (r.overridden && historyOpen === `${o.locationId}:${r.rule}`) {
                    return { locationName: o.locationName ?? "Location", reading: r.reading };
                }
            }
        }
        return null;
    })();

    /*
     * ── W7-F011: ONE GRID, NOT FOUR STACKED SECTIONS ────────────────────────────────────────
     *
     * The model is unchanged and accepted; the presentation was too vertical and word-heavy. The
     * organization default is one row of four rules, the overrides are one table with every
     * location in it, and inheritance is explained ONCE, at the top. Each rule keeps its actions
     * (Edit · Schedule change · History), CURRENT / SCHEDULED / HISTORY stay three distinct things,
     * and history stays secondary and expandable. Every value is the same resolver's answer.
     */
    return (
        <section className="space-y-3" data-testid="billing-timing">
            <div>
                <h2 className="text-sm font-semibold text-alloy-midnight">Billing &amp; payment timing</h2>
                <p className="mt-1 max-w-3xl text-[13px] text-alloy-midnight/60">
                    Every charge&apos;s dates follow from these four rules:{" "}
                    <span className="font-medium text-alloy-midnight/75" data-testid="billing-timing-chain">
                        Service date → Billing period → Invoice date → Due date → Posting
                    </span>
                    . Locations <strong className="font-medium">inherit</strong> the organization default unless they
                    override a rule; a household attending more than one location uses its own account billing period.
                    Accounting periods are separate.
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
                        <div
                            className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4"
                            data-testid="billing-timing-org-summary"
                        >
                            {model.orgDefault.map((reading) => (
                                <OrgRuleCell
                                    key={reading.rule}
                                    reading={reading}
                                    canMutate={canMutate}
                                    busy={busy}
                                    historyOpen={historyOpen === `org:${reading.rule}`}
                                    onToggleHistory={() => toggleHistory(`org:${reading.rule}`)}
                                    onEdit={(mode) => openEditor(reading.rule, { type: "org" }, mode, reading)}
                                    onCancelScheduled={(id) => void run(() => voidPolicy(id))}
                                />
                            ))}
                        </div>
                        {orgHistory ? (
                            <RuleHistory reading={orgHistory} todayYmd={todayYmd} title={`${BILLING_TIMING_RULE_LABEL[orgHistory.rule]} · organization default`} />
                        ) : null}
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
                            <p className="mb-2 text-[13px] text-alloy-midnight/60" data-testid="billing-timing-no-overrides">
                                No location overrides — every location bills on the organization default.
                            </p>
                        ) : null}
                        {model.overrides.length + model.inheritingLocations.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[640px] text-left text-[13px]" data-testid="billing-timing-overrides-table">
                                    <thead>
                                        <tr className="text-[11px] uppercase tracking-[0.06em] text-alloy-forge/60">
                                            <th scope="col" className="py-1.5 pr-4 font-semibold">Scope</th>
                                            {BILLING_TIMING_RULES.map((rule) => (
                                                <th key={rule} scope="col" className="py-1.5 pr-4 font-semibold">{BILLING_TIMING_RULE_LABEL[rule]}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-alloy-stone/25">
                                        {model.overrides.map((o) => {
                                            const scope: Scope = { type: "location", locationId: o.locationId, locationName: o.locationName ?? "Location" };
                                            return (
                                                <tr key={o.locationId} className="align-top" data-testid={`billing-timing-override-${o.locationId}`}>
                                                    <th scope="row" className="py-2 pr-4 font-medium text-alloy-midnight">
                                                        {o.locationName != null ? (
                                                            o.locationName
                                                        ) : (
                                                            <span
                                                                className="inline-block h-4 w-28 animate-pulse rounded bg-alloy-stone/25"
                                                                aria-busy="true"
                                                                aria-label="Loading location"
                                                                data-testid="billing-timing-override-name-pending"
                                                            />
                                                        )}
                                                    </th>
                                                    {o.rules.map((r) =>
                                                        r.overridden ? (
                                                            <OverrideCell
                                                                key={r.rule}
                                                                reading={r.reading}
                                                                scopeKey={o.locationId}
                                                                canMutate={canMutate}
                                                                busy={busy}
                                                                historyOpen={historyOpen === `${o.locationId}:${r.rule}`}
                                                                onToggleHistory={() => toggleHistory(`${o.locationId}:${r.rule}`)}
                                                                onEdit={(mode) => openEditor(r.rule, scope, mode, r.reading)}
                                                                onReturnToDefault={() => void returnToDefault(r.reading)}
                                                                onCancelScheduled={(id) => void run(() => voidPolicy(id))}
                                                            />
                                                        ) : (
                                                            <InheritsCell
                                                                key={r.rule}
                                                                testId={`billing-timing-inherits-${o.locationId}-${r.rule}`}
                                                                inheritedSentence={r.inheritedSentence}
                                                                canMutate={canMutate}
                                                                busy={busy}
                                                                onOverride={() => openEditor(r.rule, scope, "now", null)}
                                                            />
                                                        ),
                                                    )}
                                                </tr>
                                            );
                                        })}
                                        {model.inheritingLocations.map((l) => (
                                            <tr key={l.locationId} className="align-top" data-testid={`billing-timing-inheriting-${l.locationId}`}>
                                                <th scope="row" className="py-2 pr-4 font-medium text-alloy-midnight/80">{l.locationName}</th>
                                                {model.orgDefault.map((r) => (
                                                    <InheritsCell
                                                        key={r.rule}
                                                        testId={`billing-timing-inherits-${l.locationId}-${r.rule}`}
                                                        inheritedSentence={r.sentence}
                                                        canMutate={canMutate}
                                                        busy={busy}
                                                        onOverride={() =>
                                                            openEditor(r.rule, { type: "location", locationId: l.locationId, locationName: l.locationName }, "now", null)
                                                        }
                                                    />
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}

                        {overrideHistory ? (
                            <RuleHistory
                                reading={overrideHistory.reading}
                                todayYmd={todayYmd}
                                title={`${BILLING_TIMING_RULE_LABEL[overrideHistory.reading.rule]} · ${overrideHistory.locationName}`}
                            />
                        ) : null}

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

/** The quiet action links under a rule — never four full-width buttons. */
function RuleActions({
    reading,
    scopeKey,
    canMutate,
    busy,
    historyOpen,
    onToggleHistory,
    onEdit,
    onReturnToDefault,
    onCancelScheduled,
}: {
    reading: RuleReading;
    scopeKey: string;
    canMutate: boolean;
    busy: boolean;
    historyOpen: boolean;
    onToggleHistory: () => void;
    onEdit: (mode: "now" | "schedule") => void;
    onReturnToDefault?: () => void;
    onCancelScheduled?: (rowId: string) => void;
}) {
    return (
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
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
                            Cancel scheduled
                        </ConfigurationInlineButton>
                    ) : null}
                    {onReturnToDefault ? (
                        <ConfigurationInlineButton onClick={onReturnToDefault} disabled={busy}>
                            Return to default
                        </ConfigurationInlineButton>
                    ) : null}
                </>
            ) : null}
            {reading.history.length > 0 ? (
                <ConfigurationInlineButton onClick={onToggleHistory} aria-expanded={historyOpen}>
                    {historyOpen ? "Hide history" : "History"}
                </ConfigurationInlineButton>
            ) : null}
        </span>
    );
}

/** CURRENT, then SCHEDULED — two distinct lines, never merged into one reading. */
function RuleValue({ reading, scopeKey, fallbackTone }: { reading: RuleReading; scopeKey: string; fallbackTone: boolean }) {
    return (
        <>
            <span
                className={`block text-[13px] font-medium ${fallbackTone ? (BILLING_TIMING_FALLBACK[reading.rule].blocksBilling ? "text-red-700" : "text-amber-700") : "text-alloy-midnight"}`}
                title={reading.current || !reading.scheduled ? reading.sentence : undefined}
                data-testid={`billing-timing-value-${scopeKey}-${reading.rule}`}
            >
                {reading.current || !reading.scheduled ? reading.short : "Not in force yet"}
            </span>
            {reading.current && reading.through ? (
                <span className="block text-xs text-alloy-midnight/55">through {formatYmd(reading.through)}</span>
            ) : null}
            {reading.scheduled ? (
                <span
                    className="mt-0.5 block text-xs text-alloy-midnight/70"
                    title={reading.scheduled.sentence}
                    data-testid={`billing-timing-scheduled-${scopeKey}-${reading.rule}`}
                >
                    <span className="font-semibold uppercase tracking-[0.05em] text-[10px] text-alloy-forge/70">Scheduled</span>{" "}
                    {reading.scheduled.short} · from {formatYmd(reading.scheduled.row.effective_start)}
                </span>
            ) : null}
        </>
    );
}

function OrgRuleCell({
    reading,
    canMutate,
    busy,
    historyOpen,
    onToggleHistory,
    onEdit,
    onCancelScheduled,
}: {
    reading: RuleReading;
    canMutate: boolean;
    busy: boolean;
    historyOpen: boolean;
    onToggleHistory: () => void;
    onEdit: (mode: "now" | "schedule") => void;
    onCancelScheduled?: (rowId: string) => void;
}) {
    return (
        <div className="min-w-0" data-testid={`billing-timing-rule-org-${reading.rule}`}>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-forge/60">
                {BILLING_TIMING_RULE_LABEL[reading.rule]}
            </span>
            <RuleValue reading={reading} scopeKey="org" fallbackTone={reading.isFallback} />
            <RuleActions
                reading={reading}
                scopeKey="org"
                canMutate={canMutate}
                busy={busy}
                historyOpen={historyOpen}
                onToggleHistory={onToggleHistory}
                onEdit={onEdit}
                onCancelScheduled={onCancelScheduled}
            />
        </div>
    );
}

function OverrideCell({
    reading,
    scopeKey,
    canMutate,
    busy,
    historyOpen,
    onToggleHistory,
    onEdit,
    onReturnToDefault,
    onCancelScheduled,
}: {
    reading: RuleReading;
    scopeKey: string;
    canMutate: boolean;
    busy: boolean;
    historyOpen: boolean;
    onToggleHistory: () => void;
    onEdit: (mode: "now" | "schedule") => void;
    onReturnToDefault: () => void;
    onCancelScheduled?: (rowId: string) => void;
}) {
    return (
        <td className="py-2 pr-4" data-testid={`billing-timing-rule-${scopeKey}-${reading.rule}`}>
            <RuleValue reading={reading} scopeKey={scopeKey} fallbackTone={false} />
            <RuleActions
                reading={reading}
                scopeKey={scopeKey}
                canMutate={canMutate}
                busy={busy}
                historyOpen={historyOpen}
                onToggleHistory={onToggleHistory}
                onEdit={onEdit}
                onReturnToDefault={onReturnToDefault}
                onCancelScheduled={onCancelScheduled}
            />
        </td>
    );
}

/** "Inherits" — one word. What it inherits is the organization default row above, and a tooltip. */
function InheritsCell({
    testId,
    inheritedSentence,
    canMutate,
    busy,
    onOverride,
}: {
    testId: string;
    inheritedSentence: string;
    canMutate: boolean;
    busy: boolean;
    onOverride: () => void;
}) {
    return (
        <td className="py-2 pr-4" data-testid={testId}>
            <span className="block text-[13px] text-alloy-midnight/50" title={`Inherits the organization default: ${inheritedSentence}`}>
                Inherits
            </span>
            {canMutate ? (
                <span className="mt-1 block text-xs">
                    <ConfigurationInlineButton onClick={onOverride} disabled={busy}>
                        Override
                    </ConfigurationInlineButton>
                </span>
            ) : null}
        </td>
    );
}

/** HISTORY — secondary, expandable, every version with its effective dates in words. */
function RuleHistory({ reading, todayYmd, title }: { reading: RuleReading; todayYmd: string; title: string }) {
    const timeline = buildVersionTimeline(reading.history, todayYmd);
    return (
        <div className="mt-3 rounded-md bg-alloy-stone/10 px-3 py-2" data-testid={`billing-timing-history-${reading.rule}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-forge/60">History · {title}</p>
            <ul className="mt-1 space-y-1">
                {timeline.map(({ row, status }) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2 text-xs text-alloy-midnight/75">
                        <ConfigVersionBadge status={status} />
                        <span className="font-medium">{ruleSentence(reading.rule, row.value)}</span>
                        <span className="text-alloy-midnight/50">{humanRange(row.effective_start, row.effective_end)}</span>
                    </li>
                ))}
            </ul>
        </div>
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
