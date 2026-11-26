"use client";

/**
 * ANNUAL CATALOG FEES — who would be charged, and when. A PREVIEW; nothing here bills.
 *
 * Required annual Catalog items (Annual Supply Fee, Registration Fee…) are owed by the enrolled
 * children their configured location and program reach. This lists, per item, each such child's
 * annual period, its due date and amount, and whether a charge of that item already exists for the
 * child in that period — in which case the schedule would not charge it again.
 *
 * It has no button that charges anyone: annual Catalog billing is not active, and its timing is a
 * proposal under review. Both are said first, in words, rather than implied by a missing control.
 */

import { useEffect, useState } from "react";

import { moneyExact } from "@/app/adminV2/financials/financialsFormat";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
import type { AnnualFeeItemSchedule, AnnualFeeRecipient } from "@/lib/financials/catalogRecurring/annualCatalogFeeSchedule";

type ScheduleResponse = {
    active: boolean;
    timing: string;
    asOf: string;
    items: AnnualFeeItemSchedule[];
    names: { children: Record<string, string>; households: Record<string, string> };
};

const STATE_LABEL: Record<AnnualFeeRecipient["state"], string> = {
    due: "Would be charged",
    upcoming: "Next",
    already_charged: "Already charged",
};

function date(ymd: string): string {
    return formatDisplayDate(ymd) || ymd;
}

export default function FinancialsAnnualCatalogBilling() {
    const [data, setData] = useState<ScheduleResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        void (async () => {
            try {
                const res = await fetch("/api/admin/financials/annual-catalog-billing", { credentials: "include", cache: "no-store" });
                const body = (await res.json().catch(() => ({}))) as Partial<ScheduleResponse> & { error?: string };
                if (!live) return;
                if (!res.ok) setError(body.error ?? "Could not read the annual Catalog schedule.");
                else setData(body as ScheduleResponse);
            } catch {
                if (live) setError("Could not read the annual Catalog schedule.");
            }
        })();
        return () => {
            live = false;
        };
    }, []);

    return (
        <section
            className="rounded-md border border-alloy-stone/15 px-3 py-2.5"
            data-financials-annual-catalog="true"
            data-financials-annual-catalog-active={data ? String(data.active) : "unknown"}
        >
            <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Annual Catalog fees · preview</p>
            {error ? (
                <p className="mt-1 text-xs text-alloy-ember" role="alert">{error}</p>
            ) : !data ? (
                <p className="mt-1 text-xs text-alloy-midnight/50">Reading the schedule…</p>
            ) : (
                <>
                    <p className="mt-1 text-sm text-alloy-midnight" data-financials-annual-catalog-state="true">
                        {data.active ? "On." : "Not active — nobody is charged until this is reviewed and turned on."}
                    </p>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/55" data-financials-annual-catalog-timing="true">{data.timing}</p>
                    {data.items.length === 0 ? (
                        <p className="mt-1.5 text-xs text-alloy-midnight/60">No annual fees in the Catalog.</p>
                    ) : (
                        <ul className="mt-2 space-y-2">
                            {data.items.map((item) => (
                                <AnnualItem key={item.productId} item={item} names={data.names} />
                            ))}
                        </ul>
                    )}
                </>
            )}
        </section>
    );
}

function AnnualItem({ item, names }: { item: AnnualFeeItemSchedule; names: ScheduleResponse["names"] }) {
    const counts = {
        due: item.recipients.filter((r) => r.state === "due").length,
        already: item.recipients.filter((r) => r.state === "already_charged").length,
    };
    return (
        <li className="rounded border border-alloy-stone/15 px-2.5 py-2" data-financials-annual-item={item.productId} data-financials-annual-item-status={item.status}>
            <p className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-alloy-midnight">{item.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-alloy-midnight">{moneyExact(item.amountCents, "USD")} / year</span>
            </p>
            {item.status !== "scheduled" ? (
                <p className="text-[11px] text-alloy-midnight/55">{item.reason}</p>
            ) : item.recipients.length === 0 ? (
                <p className="text-[11px] text-alloy-midnight/55">No enrolled child is in this item's scope.</p>
            ) : (
                <>
                    <p className="text-[11px] text-alloy-midnight/55" data-financials-annual-item-summary="true">
                        {`${counts.due} would be charged now · ${counts.already} already charged this year`}
                    </p>
                    <ul className="mt-1 divide-y divide-alloy-stone/10">
                        {item.recipients.map((r) => (
                            <li
                                key={r.occurrenceKey}
                                className="flex items-baseline justify-between gap-2 py-1 text-xs"
                                data-financials-annual-recipient={r.childMemberId}
                                data-financials-annual-recipient-state={r.state}
                                data-financials-annual-occurrence={r.occurrenceKey}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-alloy-midnight">
                                        {names.children[r.childMemberId] ?? "Unnamed child"}
                                        {r.customerId && names.households[r.customerId] ? (
                                            <span className="text-alloy-midnight/55">{` · ${names.households[r.customerId]}`}</span>
                                        ) : null}
                                    </span>
                                    <span className="block truncate text-[11px] text-alloy-midnight/55">
                                        {`${STATE_LABEL[r.state]} · due ${date(r.dueOn)} · year ${date(r.period.start)} – ${date(r.period.end)}`}
                                    </span>
                                </span>
                                <span className="shrink-0 tabular-nums text-alloy-midnight">{moneyExact(r.amountCents, "USD")}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {item.excluded.length > 0 ? (
                <details className="mt-1">
                    <summary className="cursor-pointer select-none text-[11px] font-medium text-alloy-ember">
                        {`${item.excluded.length} enrolled child${item.excluded.length === 1 ? "" : "ren"} cannot be scheduled`}
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                        {item.excluded.map((x) => (
                            <li key={`${x.childMemberId}:${x.agreementId}`} className="text-[11px] text-alloy-midnight/65" data-financials-annual-excluded={x.childMemberId}>
                                {`${names.children[x.childMemberId] ?? "Unnamed child"} — ${x.reason}`}
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </li>
    );
}
