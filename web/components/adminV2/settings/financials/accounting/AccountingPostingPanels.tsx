"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AlloySelect } from "@/components/workspace/AlloySelect";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";

/**
 * WHERE MONEY POSTS, AND WHEN — the two configuration facts Financials enforced and showed nobody.
 *
 * ── WHY BOTH PANELS LIVE ON ONE SURFACE ────────────────────────────────────────────────────────
 *
 * The Accounting chapter already answers "which GL accounts exist" (GL Codes, above this). It did
 * not answer either of the questions an operator actually has once charges start posting:
 *
 *   WHERE does a charge category post?   `gl_account_mappings` — canonical, enforced, and until now
 *                                        authored by nothing. The certification tenant had ten
 *                                        active GL accounts and ZERO mappings, which is why every
 *                                        row of every ledger read "unmapped". The projection was
 *                                        right; the configuration was absent and unreachable.
 *
 *   WHEN does it post?                   `financial_accounting_periods` — canonical, enforced by
 *                                        the `attribute_financial_journal_entry` trigger, and also
 *                                        visible nowhere. An operator could be refused a posting
 *                                        for a closed month and have no way to see the month.
 *
 * Two halves of one operator question, so they sit together under Accounting rather than becoming
 * two more chapters.
 *
 * ── WHAT EACH PANEL MAY DO ─────────────────────────────────────────────────────────────────────
 *
 * Mappings are EDITABLE: choosing which account a category posts to is exactly the decision the
 * table exists to record, and the keys are code-owned so the operator picks an account, never a key.
 *
 * The calendar is READ-ONLY, deliberately. Closing a period is what makes a month final, no
 * governed close/reopen action exists yet, and writing one around the journal enforcement is the
 * shortcut that trigger was built to prevent. The panel says so rather than offering a control that
 * would either lie or bypass.
 */

type GlAccount = { id: string; code: string; name: string; type: string; is_active: boolean };
type MappingRow = { categoryKey: string; categoryLabel: string; mappingKey: string; glAccountId: string | null };
type Calendar = { id: string; calendar_key: string; name: string; period_style: string; is_active: boolean };
type Period = {
    id: string;
    calendar_id: string;
    period_key: string;
    label: string | null;
    starts_on: string;
    ends_on: string;
    status: string;
    closed_at: string | null;
};

const PERIOD_STYLE_LABEL: Record<string, string> = {
    calendar_month: "Calendar month",
    four_four_five: "4-4-5",
    custom: "Custom",
};

export default function AccountingPostingPanels() {
    return (
        <div className="mt-6 space-y-6" data-testid="accounting-posting-panels">
            <GlMappingPanel />
            <AccountingCalendarPanel />
        </div>
    );
}

// ── WHERE A CATEGORY POSTS ──────────────────────────────────────────────────────────────────────

function GlMappingPanel() {
    const [accounts, setAccounts] = useState<GlAccount[]>([]);
    const [mappings, setMappings] = useState<MappingRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/financials/gl-mappings", { cache: "no-store", credentials: "include" });
            const json = (await res.json()) as { accounts?: GlAccount[]; mappings?: MappingRow[]; error?: string };
            if (!res.ok) throw new Error(json.error || "Could not read GL mappings.");
            setAccounts((json.accounts ?? []).filter((a) => a.is_active));
            setMappings(json.mappings ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not read GL mappings.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const options = useMemo(
        () => accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
        [accounts],
    );

    const setMapping = async (mappingKey: string, glAccountId: string) => {
        setSavingKey(mappingKey);
        try {
            const res = await fetch("/api/admin/financials/gl-mappings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ mappingKey, glAccountId }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(json.error || "Could not save the mapping.");
            setMappings((rows) =>
                rows.map((r) => (r.mappingKey === mappingKey ? { ...r, glAccountId: glAccountId || null } : r)),
            );
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save the mapping.");
        } finally {
            setSavingKey(null);
        }
    };

    const unmapped = mappings.filter((m) => !m.glAccountId).length;

    return (
        <section
            className="rounded-xl border border-alloy-stone/25 bg-white p-4"
            data-testid="gl-mapping-panel"
        >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <h3 className="text-[15px] font-semibold text-alloy-midnight">Where each charge category posts</h3>
                    <p className="mt-0.5 text-[12px] text-alloy-midnight/60">
                        Charge categories are fixed by the platform. Choose the GL account each one posts to.
                    </p>
                </div>
                {/*
                 * The count is the point of the header. An operator who has never opened this screen
                 * needs to learn in one line that their ledger has no accounts behind it.
                 */}
                {!loading ? (
                    <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            unmapped > 0 ? "bg-amber-100 text-amber-800" : "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                        }`}
                        data-testid="gl-mapping-unmapped-count"
                    >
                        {unmapped > 0 ? `${unmapped} unmapped` : "All categories mapped"}
                    </span>
                ) : null}
            </header>

            {error ? (
                <p className="mt-3 text-[12px] text-alloy-ember" role="alert" data-testid="gl-mapping-error">
                    {error}
                </p>
            ) : null}

            {loading ? (
                <p className="mt-3 text-[12px] text-alloy-midnight/50">Reading mappings…</p>
            ) : accounts.length === 0 ? (
                <p className="mt-3 text-[12px] text-alloy-midnight/60" data-testid="gl-mapping-no-accounts">
                    No active GL codes exist yet. Add one above, then choose where each category posts.
                </p>
            ) : (
                <ul className="mt-3 divide-y divide-alloy-stone/12" data-testid="gl-mapping-list">
                    {mappings.map((row) => (
                        <li
                            key={row.mappingKey}
                            className="flex flex-wrap items-center justify-between gap-3 py-2"
                            data-testid={`gl-mapping-row-${row.mappingKey}`}
                            data-gl-mapping-state={row.glAccountId ? "mapped" : "unmapped"}
                        >
                            <span className="min-w-0">
                                <span className="block text-[13px] font-medium text-alloy-midnight">
                                    {row.categoryLabel}
                                </span>
                                {/* The key is provenance, not a control: it is what the ledger resolves through. */}
                                <span className="block font-mono text-[10.5px] text-alloy-midnight/45">
                                    {row.mappingKey}
                                </span>
                            </span>
                            <span className="flex w-[16rem] shrink-0 items-center gap-2">
                                <AlloySelect
                                    value={row.glAccountId ?? ""}
                                    onChange={(v) => void setMapping(row.mappingKey, v)}
                                    options={options}
                                    placeholder="Not mapped"
                                    density="compact"
                                    aria-label={`GL account for ${row.categoryLabel}`}
                                    testId={`gl-mapping-select-${row.mappingKey}`}
                                    disabled={savingKey === row.mappingKey}
                                />
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

// ── WHEN IT POSTS ───────────────────────────────────────────────────────────────────────────────

function AccountingCalendarPanel() {
    const [calendars, setCalendars] = useState<Calendar[]>([]);
    const [periods, setPeriods] = useState<Period[]>([]);
    const [today, setToday] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/admin/financials/accounting-calendar", {
                    cache: "no-store",
                    credentials: "include",
                });
                const json = (await res.json()) as {
                    calendars?: Calendar[];
                    periods?: Period[];
                    today?: string;
                    error?: string;
                };
                if (!res.ok) throw new Error(json.error || "Could not read the accounting calendar.");
                setCalendars(json.calendars ?? []);
                setPeriods(json.periods ?? []);
                setToday(json.today ?? "");
            } catch (e) {
                setError(e instanceof Error ? e.message : "Could not read the accounting calendar.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const active = calendars.find((c) => c.is_active) ?? calendars[0] ?? null;
    const calendarPeriods = active ? periods.filter((p) => p.calendar_id === active.id) : [];
    /* The period today falls in — the server's day, not the browser's. */
    const current = calendarPeriods.find((p) => today && p.starts_on <= today && p.ends_on >= today) ?? null;

    return (
        <section
            className="rounded-xl border border-alloy-stone/25 bg-white p-4"
            data-testid="accounting-calendar-panel"
        >
            <header>
                <h3 className="text-[15px] font-semibold text-alloy-midnight">Accounting calendar</h3>
                <p className="mt-0.5 text-[12px] text-alloy-midnight/60">
                    The periods posted financial activity is attributed to. Separate from the billing period a charge
                    is billed in.
                </p>
            </header>

            {error ? (
                <p className="mt-3 text-[12px] text-alloy-ember" role="alert" data-testid="accounting-calendar-error">
                    {error}
                </p>
            ) : loading ? (
                <p className="mt-3 text-[12px] text-alloy-midnight/50">Reading the calendar…</p>
            ) : !active ? (
                /*
                 * NOT AN EMPTY TABLE. With no calendar there is nothing for the attribution trigger
                 * to resolve against and posting is refused — a state an operator must be told
                 * plainly rather than shown as a blank list that looks like a working calendar.
                 */
                <p className="mt-3 text-[12px] text-alloy-midnight/70" data-testid="accounting-calendar-absent">
                    This organization has no accounting calendar. Financial activity cannot be attributed to an
                    accounting period until one exists.
                </p>
            ) : (
                <>
                    <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-2" data-testid="accounting-calendar-summary">
                        <Fact label="Calendar" value={active.name} />
                        <Fact label="Shape" value={PERIOD_STYLE_LABEL[active.period_style] ?? active.period_style} />
                        <Fact label="Status" value={active.is_active ? "Active" : "Inactive"} />
                        <Fact
                            label="Current period"
                            value={current ? periodName(current) : "No period covers today"}
                            tone={current ? (current.status === "open" ? "ok" : "due") : "due"}
                        />
                    </dl>

                    {calendarPeriods.length === 0 ? (
                        <p className="mt-3 text-[12px] text-alloy-midnight/70" data-testid="accounting-calendar-no-periods">
                            The calendar has no periods yet. Posting is refused until a period covers the date being
                            posted.
                        </p>
                    ) : (
                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full min-w-[34rem] border-collapse text-[12px]" data-testid="accounting-period-table">
                                <thead>
                                    <tr className="border-b border-alloy-stone/20 text-left text-[10px] uppercase tracking-wide text-alloy-midnight/45">
                                        <th className="py-1.5 pr-3 font-semibold">Period</th>
                                        <th className="py-1.5 pr-3 font-semibold">Starts</th>
                                        <th className="py-1.5 pr-3 font-semibold">Ends</th>
                                        <th className="py-1.5 pr-3 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {calendarPeriods.map((p) => (
                                        <tr
                                            key={p.id}
                                            className="border-b border-alloy-stone/10"
                                            data-testid={`accounting-period-${p.period_key}`}
                                            data-accounting-period-status={p.status}
                                            data-accounting-period-current={p.id === current?.id ? "true" : "false"}
                                        >
                                            <td className="py-1.5 pr-3 text-alloy-midnight">
                                                {periodName(p)}
                                                {p.id === current?.id ? (
                                                    <span className="ml-2 rounded-full bg-alloy-bend-pine/10 px-1.5 py-0.5 text-[10px] font-semibold text-alloy-bend-pine">
                                                        Current
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="py-1.5 pr-3 tabular-nums text-alloy-midnight/70">
                                                {formatDisplayDate(p.starts_on)}
                                            </td>
                                            <td className="py-1.5 pr-3 tabular-nums text-alloy-midnight/70">
                                                {formatDisplayDate(p.ends_on)}
                                            </td>
                                            <td className="py-1.5 pr-3">
                                                <span
                                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                                        p.status === "open"
                                                            ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                                            : "bg-alloy-midnight/[0.07] text-alloy-midnight/65"
                                                    }`}
                                                >
                                                    {p.status === "open" ? "Open" : "Closed"}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/*
                     * WHY THERE IS NO CLOSE BUTTON, SAID OUT LOUD.
                     *
                     * Closing a period is what makes a month final and it has no governed action in
                     * this platform yet. A control here would either bypass the journal enforcement
                     * that guards it, or pretend to do something it cannot. Stating the limit is the
                     * honest version, and it is the same limit the Director QA scenario records.
                     */}
                    <p className="mt-3 text-[11px] text-alloy-midnight/50" data-testid="accounting-period-lifecycle-note">
                        Opening and closing a period is not yet an action in Alloy. Posting into a closed period is
                        already refused, and a period that has posted activity cannot have its dates changed.
                    </p>
                </>
            )}
        </section>
    );
}

/** `2026-09` with a stored label falls back to the key — configuration owns the word. */
function periodName(p: Period): string {
    return p.label?.trim() || p.period_key;
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "ok" | "due" }) {
    return (
        <div>
            <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/45">{label}</dt>
            <dd
                className={`text-[13px] font-semibold ${
                    tone === "due" ? "text-amber-700" : tone === "ok" ? "text-alloy-bend-pine" : "text-alloy-midnight"
                }`}
            >
                {value}
            </dd>
        </div>
    );
}
