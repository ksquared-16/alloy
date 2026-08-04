"use client";

/**
 * Assignments proposal controls — requested days/week + tuition plan + Generate Quote.
 * Saves participation via child-participation; quote via assignment-quote API.
 * Commercial estimate only — never posts ledger charges.
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { patchChildParticipation } from "@/lib/admin/drawer/inquiryChildFieldEdit";
import { parseRequestedDaysPerWeekInput } from "@/lib/enrollment/requestedDaysPerWeek";
import { resolveRequestedDaysPerWeek } from "@/lib/enrollment/effectiveDateAuthority";
import type { FinancialConfigApiResponse } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigTypes";

const T = {
    forge: "#273F52",
    slate: "#4b5563",
    muted: "#59678b",
    pine: "#00A283",
    ember: "#b4532a",
    border: "#e5e9ef",
    stone: "#F4F6F9",
};

export type AssignmentTuitionRateOption = {
    id: string;
    label: string;
};

type Props = {
    customerMemberId: string;
    opportunityId: string | null;
    /** Participation metadata for this child (from truth bag / PI). */
    participationMetadata?: Record<string, unknown> | null;
    /** Optional eligible tuition plans (preferred when caller already resolved them). */
    rates?: AssignmentTuitionRateOption[] | null;
    onSaved?: () => void;
    style?: CSSProperties;
};

export default function AssignmentProposalControls({
    customerMemberId,
    opportunityId,
    participationMetadata,
    rates: ratesProp,
    onSaved,
    style,
}: Props) {
    const initialDays = resolveRequestedDaysPerWeek(participationMetadata ?? null);
    const [daysText, setDaysText] = useState(initialDays != null ? String(initialDays) : "");
    const [daysError, setDaysError] = useState<string | null>(null);
    const [daysBusy, setDaysBusy] = useState(false);

    const [rateOptions, setRateOptions] = useState<AssignmentTuitionRateOption[]>(ratesProp ?? []);
    const [offeringId, setOfferingId] = useState(
        typeof participationMetadata?.tuition_plan_id === "string"
            ? participationMetadata.tuition_plan_id
            : "",
    );
    const [quoteBusy, setQuoteBusy] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [quoteLabel, setQuoteLabel] = useState<string | null>(null);

    useEffect(() => {
        if (ratesProp && ratesProp.length > 0) {
            setRateOptions(ratesProp);
            return;
        }
        if (!opportunityId) return;
        let cancelled = false;
        fetch(`/api/admin/financial-config/opportunity/${opportunityId}`, {
            credentials: "include",
        })
            .then(async (res) => {
                if (!res.ok) return null;
                return (await res.json()) as FinancialConfigApiResponse;
            })
            .then((payload) => {
                if (cancelled || !payload?.enrollments?.length) return;
                const opts: AssignmentTuitionRateOption[] = [];
                for (const row of payload.enrollments) {
                    if (!row.resolvedRate) continue;
                    opts.push({
                        id: row.resolvedRate.rateId,
                        label: `${row.childLabel}: ${row.resolvedRate.rateLabel}`,
                    });
                }
                if (opts.length) setRateOptions(opts);
            })
            .catch(() => {
                /* optional enrichment — Generate Quote still auto-resolves */
            });
        return () => {
            cancelled = true;
        };
    }, [opportunityId, ratesProp]);

    const saveRequestedDays = useCallback(async () => {
        const parsed = parseRequestedDaysPerWeekInput(daysText);
        if (!parsed.ok) {
            setDaysError(parsed.error);
            return;
        }
        setDaysError(null);
        setDaysBusy(true);
        try {
            await patchChildParticipation({
                customerMemberId,
                opportunityId,
                patch: { requested_days_per_week: parsed.value },
            });
            onSaved?.();
        } catch (err) {
            setDaysError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setDaysBusy(false);
        }
    }, [customerMemberId, daysText, onSaved, opportunityId]);

    const generateQuote = useCallback(async () => {
        if (!opportunityId) {
            setQuoteError("Opportunity required to generate a quote.");
            return;
        }
        setQuoteError(null);
        setQuoteBusy(true);
        try {
            const res = await fetch("/api/admin/enrollment/assignment-quote", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    customer_member_id: customerMemberId,
                    opportunity_id: opportunityId,
                    offering_id: offeringId.trim() || undefined,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                error?: string;
                snapshot?: { offering_label?: string | null; amount_cents?: number };
            };
            if (!res.ok) throw new Error(json.error ?? "Quote generation failed");
            const label =
                json.snapshot?.offering_label
                ?? (typeof json.snapshot?.amount_cents === "number"
                    ? `$${(json.snapshot.amount_cents / 100).toFixed(2)}`
                    : "Quote generated");
            setQuoteLabel(label);
            if (json.snapshot && typeof (json.snapshot as { offering_id?: string }).offering_id === "string") {
                setOfferingId((json.snapshot as { offering_id: string }).offering_id);
            }
            onSaved?.();
        } catch (err) {
            setQuoteError(err instanceof Error ? err.message : "Quote generation failed");
        } finally {
            setQuoteBusy(false);
        }
    }, [customerMemberId, offeringId, onSaved, opportunityId]);

    return (
        <div
            data-assignment-proposal-controls="true"
            data-assignment-child={customerMemberId}
            style={{
                display: "grid",
                gap: 10,
                padding: "10px 12px",
                background: T.stone,
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                ...style,
            }}
        >
            <div style={{ display: "grid", gap: 4 }}>
                <label
                    htmlFor={`assignment-requested-days-${customerMemberId}`}
                    style={{ fontSize: 11, fontWeight: 650, color: T.slate }}
                >
                    Requested days per week
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                        id={`assignment-requested-days-${customerMemberId}`}
                        type="number"
                        min={1}
                        max={7}
                        inputMode="numeric"
                        value={daysText}
                        placeholder="1–7"
                        data-testid="assignment-requested-days"
                        data-assignment-requested-days={customerMemberId}
                        onChange={(e) => setDaysText(e.target.value)}
                        onBlur={() => {
                            void saveRequestedDays();
                        }}
                        style={{
                            width: 72,
                            padding: "6px 8px",
                            fontSize: 13,
                            borderRadius: 6,
                            border: `1px solid ${T.border}`,
                            color: T.forge,
                        }}
                    />
                    <button
                        type="button"
                        disabled={daysBusy}
                        onClick={() => {
                            void saveRequestedDays();
                        }}
                        style={{
                            appearance: "none",
                            border: `1px solid ${T.border}`,
                            background: "#fff",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            color: T.forge,
                            cursor: daysBusy ? "wait" : "pointer",
                        }}
                    >
                        {daysBusy ? "Saving…" : "Save"}
                    </button>
                </div>
                {daysError ? (
                    <div style={{ fontSize: 11.5, color: T.ember }} role="alert">
                        {daysError}
                    </div>
                ) : null}
            </div>

            <div style={{ display: "grid", gap: 4 }}>
                <label
                    htmlFor={`assignment-tuition-plan-${customerMemberId}`}
                    style={{ fontSize: 11, fontWeight: 650, color: T.slate }}
                >
                    Tuition plan
                </label>
                <select
                    id={`assignment-tuition-plan-${customerMemberId}`}
                    value={offeringId}
                    data-assignment-tuition-plan={customerMemberId}
                    onChange={(e) => setOfferingId(e.target.value)}
                    style={{
                        padding: "6px 8px",
                        fontSize: 13,
                        borderRadius: 6,
                        border: `1px solid ${T.border}`,
                        color: T.forge,
                        background: "#fff",
                    }}
                >
                    <option value="">Auto-match eligible plan</option>
                    {rateOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                            {r.label}
                        </option>
                    ))}
                </select>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                    type="button"
                    disabled={quoteBusy || !opportunityId}
                    data-testid="assignment-generate-quote"
                    data-assignment-generate-quote={customerMemberId}
                    onClick={() => {
                        void generateQuote();
                    }}
                    style={{
                        appearance: "none",
                        border: 0,
                        background: T.pine,
                        color: "#fff",
                        borderRadius: 6,
                        padding: "7px 12px",
                        fontSize: 12.5,
                        fontWeight: 650,
                        cursor: quoteBusy || !opportunityId ? "not-allowed" : "pointer",
                        opacity: quoteBusy || !opportunityId ? 0.65 : 1,
                    }}
                >
                    {quoteBusy ? "Generating…" : "Generate Quote"}
                </button>
                {quoteLabel ? (
                    <span style={{ fontSize: 12, color: T.pine, fontWeight: 600 }} data-assignment-quote-label="true">
                        {quoteLabel}
                    </span>
                ) : null}
            </div>
            {quoteError ? (
                <div style={{ fontSize: 11.5, color: T.ember }} role="alert">
                    {quoteError}
                </div>
            ) : null}
        </div>
    );
}
