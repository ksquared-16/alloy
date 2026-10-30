"use client";

/**
 * NEW BULK CHARGE — apply one charge to many accounts (W7-F021).
 *
 * Choose a catalog fee (its configured amount is the amount) and a service date; choose the
 * households — and, for a child-grained type, the children — it applies to; preview;
 * confirm. Every selected household receives its own canonical charge through the registered
 * `charge.add`, exactly as Add Charge on that account would create it. See `bulkChargePlan.ts` for why
 * that orchestration is safe (per-charge database idempotency, no shared obligation, posting by the
 * action's own rule).
 *
 * The preview is the same action in `preview` mode for every target, so the date chain an operator
 * reads — billing period, invoice date, due date, posting — is the canonical resolver's, per account.
 * A refused row is shown refused before anything is written, and stays visible after the run.
 *
 * The options are the organisation's Catalog, judged server-side by the same `catalogChargeOptions`
 * rule the account card uses: one-time fees chargeable; other catalog types listed, disabled, with the
 * flow that bills them; missing accounting blocked. No charge template is offered.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { AlloyDateInput } from "@/components/workspace/AlloyDateInput";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import { moneyExact } from "@/app/adminV2/financials/financialsFormat";
import {
    bulkPreviewOutcome,
    chargeAddRequest,
    legalBulkGrains,
    obligationsFor,
    refusalBeforeSending,
    runWithConcurrency,
    tallyBulk,
    type BulkGrain,
    type BulkRowState,
    type BulkTarget,
} from "@/lib/financials/bulkCharge/bulkChargePlan";
import type { CatalogChargeOption } from "@/lib/financials/catalogCharges/catalogChargeOffer";
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";

type Household = { customerId: string; householdName: string; children: Array<{ customerMemberId: string; name: string }> };

async function execute(body: unknown): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: Record<string, unknown>;
        error?: { message?: string } | string;
    };
    if (!res.ok || json.ok === false) {
        const error = typeof json.error === "string" ? json.error : json.error?.message;
        return { ok: false, error: error ?? `Refused (${res.status}).` };
    }
    return { ok: true, data: json.data };
}

export default function FinancialsBulkAddCharge({
    siteLocationId,
    onCommitted,
}: {
    siteLocationId: string;
    /** Re-read committed truth after the run. */
    onCommitted: () => Promise<void> | void;
}) {
    const [options, setOptions] = useState<CatalogChargeOption[]>([]);
    const [households, setHouseholds] = useState<Household[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [productId, setProductId] = useState("");
    /* The ORGANISATION's business date, from the server — never the browser's UTC day. */
    const [serviceDate, setServiceDate] = useState("");
    const [chosenGrain, setGrain] = useState<BulkGrain>("child");
    const [query, setQuery] = useState("");
    /* customerId → selected child ids (household grain uses the key alone). */
    const [selected, setSelected] = useState<Record<string, string[]>>({});
    const [states, setStates] = useState<Record<string, BulkRowState>>({});
    const [busy, setBusy] = useState<"preview" | "execute" | null>(null);
    const [ran, setRan] = useState(false);

    useEffect(() => {
        let live = true;
        void (async () => {
            try {
                const site = siteLocationId ? `?site_location_id=${encodeURIComponent(siteLocationId)}` : "";
                const h = await fetch(`/api/admin/financials/bulk-charge-targets${site}`, { credentials: "include" }).then((r) => r.json());
                if (!live) return;
                const catalog = (h.catalog ?? null) as { ok: boolean; options?: CatalogChargeOption[]; error?: string } | null;
                setOptions(catalog?.options ?? []);
                if (typeof h.businessDate === "string") setServiceDate((current) => current || h.businessDate);
                setHouseholds((h.households ?? []) as Household[]);
                if (h.ok === false) setLoadError(h.error ?? "Accounts could not be read.");
                else if (catalog && catalog.ok === false) setLoadError(`The catalog could not be read (${catalog.error ?? "unknown"}).`);
            } catch (e) {
                if (live) setLoadError(e instanceof Error ? e.message : "Bulk charge could not load.");
            }
        })();
        return () => {
            live = false;
        };
    }, [siteLocationId]);

    /* Only a chargeable item can be the selection; unsupported and blocked ones are listed, disabled. */
    const template = options.find((o) => o.id === productId && o.availability === "offerable") ?? null;
    const unavailable = options.filter((o) => o.availability !== "offerable");
    const grains = useMemo(() => (template ? legalBulkGrains(template.categoryKey) : []), [template]);
    /* The grain is DERIVED: the operator's choice when the charge type permits it, else what it permits. */
    const grain: BulkGrain = grains.length && !grains.includes(chosenGrain) ? grains[0]! : chosenGrain;
    const configured = template?.amountCents ?? null;

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return households.filter(
            (h) => !q || h.householdName.toLowerCase().includes(q) || h.children.some((c) => c.name.toLowerCase().includes(q)),
        );
    }, [households, query]);

    const targets: BulkTarget[] = useMemo(
        () =>
            households
                .filter((h) => selected[h.customerId] !== undefined)
                .map((h) => ({
                    customerId: h.customerId,
                    householdName: h.householdName,
                    children:
                        grain === "household"
                            ? []
                            : h.children.filter((c) => (selected[h.customerId] ?? []).includes(c.customerMemberId)),
                })),
        [households, selected, grain],
    );

    const input = useMemo(
        () =>
            template && serviceDate
                ? { catalogProductId: template.id, category: template.categoryKey, grain, serviceDate }
                : null,
        [template, serviceDate, grain],
    );
    const ready = Boolean(input) && targets.length > 0;
    const tally = tallyBulk(targets, grain, states);
    const unitCents = configured;
    const previewed = targets.length > 0 && targets.every((t) => states[t.customerId] && states[t.customerId]!.state !== "pending");
    const sendable = targets.filter((t) => states[t.customerId]?.state === "previewed");

    const toggleHousehold = (h: Household) => {
        setRan(false);
        setStates({});
        setSelected((prev) => {
            const next = { ...prev };
            if (next[h.customerId] !== undefined) delete next[h.customerId];
            else next[h.customerId] = h.children.map((c) => c.customerMemberId);
            return next;
        });
    };
    const toggleChild = (h: Household, childId: string) => {
        setRan(false);
        setStates({});
        setSelected((prev) => {
            const current = prev[h.customerId] ?? [];
            const nextChildren = current.includes(childId) ? current.filter((c) => c !== childId) : [...current, childId];
            return { ...prev, [h.customerId]: nextChildren };
        });
    };
    const selectAllShown = () => {
        setRan(false);
        setStates({});
        setSelected((prev) => {
            const next = { ...prev };
            for (const h of visible) next[h.customerId] = h.children.map((c) => c.customerMemberId);
            return next;
        });
    };

    const runPreview = useCallback(async () => {
        if (!input) return;
        setBusy("preview");
        setRan(false);
        const next: Record<string, BulkRowState> = {};
        await runWithConcurrency(targets, 4, async (t) => {
            const refusal = refusalBeforeSending(t, input);
            if (refusal) {
                next[t.customerId] = { state: "refused", reason: refusal };
                return;
            }
            next[t.customerId] = bulkPreviewOutcome(await execute(chargeAddRequest(t, input, "preview")));
            setStates({ ...next });
        });
        setStates({ ...next });
        setBusy(null);
    }, [input, targets]);

    const runExecute = useCallback(async () => {
        if (!input) return;
        setBusy("execute");
        const next: Record<string, BulkRowState> = { ...states };
        await runWithConcurrency(sendable, 3, async (t) => {
            const r = await execute(chargeAddRequest(t, input, "execute"));
            if (!r.ok) {
                next[t.customerId] = { state: "failed", reason: r.error ?? "The charge was not created." };
            } else {
                const detail = (r.data?.execution_result ?? {}) as { posted?: boolean; posts_on?: string; post_failed?: string; review_required?: boolean };
                next[t.customerId] = {
                    state: "created",
                    chargeIds: [String(r.data?.affected_id ?? "")].filter(Boolean),
                    /* W7-F027: the operator's lifecycle, never "Draft". */
                    note: detail.posted
                        ? "Posted"
                        : detail.posts_on
                          ? `Scheduled · activates ${formatDisplayDate(detail.posts_on) ?? detail.posts_on}`
                          : detail.post_failed
                            ? "Posting failed · needs attention"
                            : detail.review_required
                              ? "Review required"
                              : "Created",
                };
            }
            setStates({ ...next });
        });
        setStates({ ...next });
        setBusy(null);
        setRan(true);
        await onCommitted();
    }, [input, sendable, states, onCommitted]);

    /* The canonical date chain, as the resolver stated it for the first previewed account. */
    /*
     * The canonical date chain, as the resolver stated it for the first previewed account — named,
     * because two accounts on different billing calendars resolve different periods. The resolver's
     * lines carry ISO dates; they are read in the operator's words, and the bare `start → end` echo
     * of a period already named is dropped.
     */
    const firstTarget = targets.find((t) => states[t.customerId]?.state === "previewed") ?? null;
    const firstPreviewed = firstTarget ? states[firstTarget.customerId] : undefined;
    const chain =
        firstPreviewed?.state === "previewed"
            ? firstPreviewed.changes
                  .filter((c) => /^(Service|Billing period|Invoice date|Due|Posting|Posts|Draft)/i.test(c))
                  .map((c) =>
                      c
                          .replace(/\s·\s\d{4}-\d{2}-\d{2}\s→\s\d{4}-\d{2}-\d{2}/g, "")
                          .replace(/\d{4}-\d{2}-\d{2}/g, (iso) => formatDisplayDate(iso) ?? iso),
                  )
            : [];

    const obligationsToCreate = sendable.reduce((n, t) => n + obligationsFor(t, grain), 0);

    return (
        <div className="space-y-3" data-financials-bulk-charge="true">
            {loadError ? <p className="text-xs text-alloy-ember">{loadError}</p> : null}

            {/* 1–4 · WHAT, HOW MUCH, WHEN, AND TO WHOM IT IS BILLED */}
            <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-alloy-midnight/60">Charge type</span>
                    <AlloySelect
                        aria-label="Charge type"
                        testId="bulk-charge-template"
                        value={productId}
                        placeholder="Choose a catalog fee…"
                        options={options.map((o) => ({
                            value: o.id,
                            label: o.availability === "offerable" ? o.label : `${o.label} — not available here`,
                            disabled: o.availability !== "offerable",
                        }))}
                        onChange={(next) => {
                            setProductId(next);
                            setStates({});
                            setRan(false);
                        }}
                    />
                    {template?.accountLabel ? (
                        <span className="text-[11px] text-alloy-midnight/50">Posts to {template.accountLabel}</span>
                    ) : null}
                    {unavailable.length ? (
                        <ul className="text-[11px] text-alloy-midnight/55" data-financials-bulk-charge-unavailable="true">
                            {unavailable.map((o) => (
                                <li key={o.id} data-catalog-item={o.id} data-catalog-availability={o.availability}>
                                    {o.label}
                                    {o.amountCents != null ? ` · ${moneyExact(o.amountCents, o.currencyCode)}` : ""} — {o.unavailableReason}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-alloy-midnight/60">Amount</span>
                    <span className="py-1 text-sm text-alloy-midnight" data-financials-bulk-charge-amount="configured">
                        {template && configured != null ? `${moneyExact(configured, template.currencyCode)} · configured in Catalog` : "—"}
                    </span>
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-alloy-midnight/60">Service date</span>
                    <AlloyDateInput
                        aria-label="Service date"
                        testId="bulk-charge-service-date"
                        value={serviceDate}
                        onChange={(next) => {
                            setServiceDate(next);
                            setStates({});
                        }}
                    />
                </label>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-alloy-midnight/60">Applies to</span>
                    {template ? (
                        <span className="flex gap-1" data-financials-bulk-charge-grain={grain}>
                            {grains.map((g) => (
                                <button
                                    key={g}
                                    type="button"
                                    aria-pressed={grain === g}
                                    onClick={() => {
                                        setGrain(g);
                                        setStates({});
                                    }}
                                    className={`rounded-full px-2.5 py-1 text-xs ${grain === g ? "bg-alloy-bend-pine/10 font-medium text-alloy-midnight" : "text-alloy-midnight/60 hover:bg-alloy-stone/5"}`}
                                >
                                    {g === "child" ? "Each child" : "Household"}
                                </button>
                            ))}
                            {grains.length === 1 ? (
                                <span className="self-center text-[11px] text-alloy-midnight/50">
                                    {chargeCategoryLabel(template.categoryKey)} is billed {grains[0] === "child" ? "per child" : "to the household"}
                                </span>
                            ) : null}
                        </span>
                    ) : (
                        <span className="py-1 text-sm text-alloy-midnight/45">Choose a charge type first</span>
                    )}
                </div>
            </div>

            {/* 5–6 · SEARCH AND SELECT THE ACCOUNTS */}
            <div className="rounded-md border border-alloy-stone/15">
                <div className="flex items-center gap-2 border-b border-alloy-stone/10 px-2.5 py-1.5">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search household or child"
                        aria-label="Search household or child"
                        data-financials-bulk-charge-search="true"
                        className="min-w-0 flex-1 rounded-md border border-alloy-stone/30 bg-white px-2 py-1 text-xs"
                    />
                    <button type="button" onClick={selectAllShown} className="text-[11px] font-semibold text-alloy-bend-pine hover:underline">
                        Select all shown
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setSelected({});
                            setStates({});
                            setRan(false);
                        }}
                        className="text-[11px] font-semibold text-alloy-midnight/55 hover:underline"
                    >
                        Clear
                    </button>
                </div>
                <ul className="max-h-60 overflow-y-auto" data-financials-bulk-charge-targets="true">
                    {visible.map((h) => {
                        const on = selected[h.customerId] !== undefined;
                        const state = states[h.customerId];
                        return (
                            <li key={h.customerId} className="border-b border-alloy-stone/10 px-2.5 py-1.5 text-xs" data-financials-bulk-charge-target={h.customerId}>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={on} onChange={() => toggleHousehold(h)} aria-label={`Select ${h.householdName}`} />
                                    <span className="min-w-0 flex-1 truncate text-alloy-midnight">{h.householdName}</span>
                                    {state ? (
                                        <span
                                            className={`shrink-0 truncate text-[11px] ${state.state === "refused" || state.state === "failed" ? "text-alloy-ember" : "text-alloy-midnight/60"}`}
                                            data-financials-bulk-charge-row-state={state.state}
                                            title={state.state === "refused" || state.state === "failed" ? state.reason : undefined}
                                        >
                                            {state.state === "previewed"
                                                ? "Ready"
                                                : state.state === "created"
                                                  ? state.note
                                                  : state.state === "refused"
                                                    ? `Refused — ${state.reason}`
                                                    : state.state === "failed"
                                                      ? `Not created — ${state.reason}`
                                                      : ""}
                                        </span>
                                    ) : null}
                                </label>
                                {on && grain === "child" && h.children.length > 0 ? (
                                    <span className="ml-6 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                        {h.children.map((c) => (
                                            <label key={c.customerMemberId} className="flex items-center gap-1 text-[11px] text-alloy-midnight/70">
                                                <input
                                                    type="checkbox"
                                                    checked={(selected[h.customerId] ?? []).includes(c.customerMemberId)}
                                                    onChange={() => toggleChild(h, c.customerMemberId)}
                                                />
                                                {c.name}
                                            </label>
                                        ))}
                                    </span>
                                ) : null}
                            </li>
                        );
                    })}
                    {visible.length === 0 ? <li className="px-2.5 py-3 text-xs text-alloy-midnight/50">No account matches.</li> : null}
                </ul>
            </div>

            {/* 7 · PREVIEW — N accounts, the total, the date chain, and what is left out */}
            {previewed ? (
                <div className="rounded-md border border-alloy-stone/15 px-2.5 py-2 text-xs" data-financials-bulk-charge-preview="true">
                    <p className="text-alloy-midnight" data-financials-bulk-charge-tally="true">
                        <span className="font-semibold">{sendable.length}</span> account{sendable.length === 1 ? "" : "s"} ·{" "}
                        {obligationsToCreate} charge{obligationsToCreate === 1 ? "" : "s"}
                        {unitCents != null ? ` · ${moneyExact(unitCents * obligationsToCreate, template?.currencyCode ?? "USD")}` : ""}
                        {tally.refused ? ` · ${tally.refused} refused` : ""}
                    </p>
                    {chain.length ? (
                        <ul className="mt-1 text-[11px] text-alloy-midnight/60" data-financials-bulk-charge-date-chain="true">
                            <li className="font-medium text-alloy-midnight/70">Dates for {firstTarget?.householdName}</li>
                            {chain.map((c) => (
                                <li key={c}>{c}</li>
                            ))}
                        </ul>
                    ) : null}
                    <p className="mt-1 text-[11px] text-alloy-midnight/50">
                        Each account receives its own charge. Dates are resolved per account by the same rules Add Charge uses.
                    </p>
                </div>
            ) : null}

            {ran ? (
                <p className="text-xs text-alloy-midnight" data-financials-bulk-charge-result="true">
                    {tally.created} of {sendable.length} account{sendable.length === 1 ? "" : "s"} charged
                    {tally.failed ? ` · ${tally.failed} not created` : ""}
                    {tally.refused ? ` · ${tally.refused} refused` : ""}. Running the same charge again does not duplicate it.
                </p>
            ) : null}

            {/* 8 · CONFIRM */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="alloy-os-chargedetail__action alloy-os-chargedetail__action--secondary"
                    disabled={!ready || busy !== null}
                    onClick={() => void runPreview()}
                    data-financials-bulk-charge-preview-run="true"
                >
                    {busy === "preview" ? "Previewing…" : `Preview ${targets.length} account${targets.length === 1 ? "" : "s"}`}
                </button>
                {previewed && sendable.length > 0 && !ran ? (
                    <button
                        type="button"
                        className="alloy-os-chargedetail__action alloy-os-chargedetail__action--primary"
                        disabled={busy !== null}
                        onClick={() => void runExecute()}
                        data-financials-bulk-charge-confirm="true"
                    >
                        {busy === "execute"
                            ? "Creating…"
                            : `Create ${obligationsToCreate} charge${obligationsToCreate === 1 ? "" : "s"}${
                                  unitCents != null ? ` · ${moneyExact(unitCents * obligationsToCreate, template?.currencyCode ?? "USD")}` : ""
                              }`}
                    </button>
                ) : null}
            </div>
        </div>
    );
}
