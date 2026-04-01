"use client";

import type { JobChargeBalanceRow } from "@/lib/admin/jobPaymentBalances";
import { formatDate, formatMoneyFromCents } from "@/lib/adminFormatters";

export type JobReceivableChargesPanelProps = {
    receivableSource?: "charges" | "legacy_job";
    chargeRows?: JobChargeBalanceRow[] | null;
    openChargeCount?: number;
    /** When set (e.g. schedule detail / collect from visit), highlight charges tied to this schedule_id. */
    contextScheduleId?: string | null;
    /** Tighter layout for modals */
    compact?: boolean;
    className?: string;
};

function labelChargeType(t: string): string {
    const k = t.toLowerCase();
    if (k === "service") return "Service";
    if (k === "fee") return "Fee";
    if (k === "adjustment") return "Adjustment";
    if (k === "cancellation_fee") return "Cancellation fee";
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "—";
}

/** Short sub-label so adjustment vs cancellation fee is obvious in finance surfaces. */
function chargeTypeHint(chargeType: string): string | null {
    const k = chargeType.toLowerCase();
    if (k === "adjustment") return "Pricing change (credit or additional charge)";
    if (k === "cancellation_fee") return "From schedule cancellation rules";
    if (k === "service") return "Primary visit / service receivable";
    if (k === "fee") return "Other fee";
    return null;
}

function labelChargeStatus(s: string): string {
    const k = s.toLowerCase();
    const map: Record<string, string> = {
        draft: "Draft",
        posted: "Posted",
        partially_paid: "Partially paid",
        paid: "Paid",
        void: "Void",
    };
    return map[k] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");
}

function shortId(id: string): string {
    if (id.length <= 10) return id;
    return `…${id.slice(-8)}`;
}

function dateCell(service: string | null, due: string | null): string {
    const parts: string[] = [];
    if (service) parts.push(`Svc ${formatDate(service)}`);
    if (due) parts.push(`Due ${formatDate(due)}`);
    return parts.length ? parts.join(" · ") : "—";
}

function formatOutstanding(cents: number): { text: string; isCredit: boolean } {
    if (cents < 0) {
        return { text: `${formatMoneyFromCents(cents)} (credit)`, isCredit: true };
    }
    return { text: formatMoneyFromCents(cents), isCredit: false };
}

/**
 * Lists receivable charges when the job uses the charge read model; otherwise shows a short legacy note.
 */
export function JobReceivableChargesPanel({
    receivableSource,
    chargeRows,
    openChargeCount,
    contextScheduleId,
    compact = false,
    className = "",
}: JobReceivableChargesPanelProps) {
    const rows = chargeRows ?? [];
    const ctxSid = contextScheduleId?.trim() || null;

    if (receivableSource === "legacy_job") {
        return (
            <div
                className={`rounded-md border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2 text-xs text-alloy-midnight/60 leading-relaxed ${className}`}
            >
                Balance uses priced job lines (no receivable charges on file yet). When pricing locks, a service charge is created and
                totals follow charges.
            </div>
        );
    }

    if (receivableSource !== "charges" || rows.length === 0) {
        return null;
    }

    const th = compact ? "text-[10px] py-1 pr-2" : "text-[11px] py-1.5 pr-2";
    const td = compact ? "text-xs py-1.5 pr-2 align-top" : "text-sm py-2 pr-2 align-top";

    return (
        <div className={`rounded-md border border-alloy-stone/30 bg-white px-3 py-2 ${className}`}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className={`font-semibold text-alloy-midnight ${compact ? "text-xs" : "text-sm"}`}>Open receivable charges</p>
                {openChargeCount != null && openChargeCount > 0 ? (
                    <span className="text-[11px] text-alloy-midnight/55 tabular-nums">{openChargeCount} with balance</span>
                ) : (
                    <span className="text-[11px] text-alloy-midnight/45">No outstanding balance</span>
                )}
            </div>
            <p className="text-[11px] text-alloy-midnight/55 mb-2 leading-snug">
                {ctxSid ? (
                    <>
                        Rows <span className="font-medium text-alloy-midnight/70">highlighted</span> are linked to this visit (
                        <span className="font-mono text-[10px]">schedule_id</span>). The summary totals still reflect{" "}
                        <strong>all</strong> charges on the job; card collection allocates against open balances on the server.
                    </>
                ) : (
                    <>
                        Summary totals are the sum of these charge amounts. Posted payments allocate to charges (plus any legacy job-only
                        allocations). Adjustments and cancellation fees appear as their own rows.
                    </>
                )}
            </p>
            <div className="overflow-x-auto -mx-1">
                <table className={`w-full ${compact ? "" : "min-w-[520px]"}`}>
                    <thead>
                        <tr className="border-b border-alloy-stone/25 text-left text-alloy-midnight/60 uppercase tracking-wide">
                            {!compact && <th className={th}>ID</th>}
                            <th className={th}>Type</th>
                            <th className={th}>Status</th>
                            <th className={`${th} text-right`}>Amount</th>
                            <th className={`${th} text-right`}>Paid</th>
                            <th className={`${th} text-right`}>Outstanding</th>
                            <th className={th}>Dates</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => {
                            const linkedVisit = !!(ctxSid && r.schedule_id && r.schedule_id === ctxSid);
                            const out = formatOutstanding(r.outstanding_cents);
                            const hint = chargeTypeHint(r.charge_type);
                            return (
                                <tr
                                    key={r.charge_id}
                                    className={`border-b border-alloy-stone/15 last:border-0 ${linkedVisit ? "bg-alloy-blue/[0.06]" : ""}`}
                                >
                                    {!compact && (
                                        <td className={`${td} font-mono text-alloy-midnight/50`} title={r.charge_id}>
                                            {shortId(r.charge_id)}
                                        </td>
                                    )}
                                    <td className={td}>
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <span className="font-medium text-alloy-midnight">{labelChargeType(r.charge_type)}</span>
                                            {linkedVisit ? (
                                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-blue bg-alloy-blue/10 px-1.5 py-0.5 rounded">
                                                    This visit
                                                </span>
                                            ) : null}
                                        </span>
                                        {hint ? (
                                            <span
                                                className={`block font-normal text-alloy-midnight/50 leading-snug mt-0.5 ${
                                                    compact ? "text-[10px]" : "text-[11px]"
                                                }`}
                                            >
                                                {hint}
                                            </span>
                                        ) : null}
                                        {r.description ? (
                                            <span
                                                className={`block font-normal text-alloy-midnight/55 leading-snug mt-0.5 ${
                                                    compact ? "text-[10px]" : "text-[11px]"
                                                }`}
                                            >
                                                {r.description}
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className={td}>{labelChargeStatus(r.status)}</td>
                                    <td className={`${td} text-right tabular-nums font-medium`}>{formatMoneyFromCents(r.amount_cents)}</td>
                                    <td className={`${td} text-right tabular-nums`}>{formatMoneyFromCents(r.posted_allocated_cents)}</td>
                                    <td
                                        className={`${td} text-right tabular-nums font-medium ${
                                            out.isCredit ? "text-alloy-juniper" : "text-alloy-midnight"
                                        }`}
                                    >
                                        {out.text}
                                    </td>
                                    <td className={`${td} text-alloy-midnight/70 whitespace-nowrap`}>
                                        {dateCell(r.service_date, r.due_date)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/** First summary row label: charge receivables vs legacy job pricing. */
export function jobTotalSummaryLabel(receivableSource?: "charges" | "legacy_job"): string {
    return receivableSource === "charges" ? "Total charged (sum of charges)" : "Job total (legacy pricing)";
}
