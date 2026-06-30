"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrencyCents } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { ConfigurationDetailCard } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigButtonRow, ConfigFieldLabel, ConfigPrimaryButton, ConfigSecondaryButton, ConfigSelectInput } from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import { ConfigField, ConfigFieldGrid, ConfigReadonlyNotice } from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";

type ListItem = {
    id: string;
    obligationKind: string | null;
    status: string;
    reviewStatus: string;
    reviewRequired: boolean;
    amountCents: number | null;
    currencyCode: string;
    occursOn: string | null;
    billableOn: string | null;
    eventKey: string | null;
    sourceFamily: string | null;
    draftChargeId: string | null;
    eligibleForPosting: boolean;
};
type TimelineStep = { stage: string; label: string; at: string | null; detail: string; present: boolean };
type Detail = ListItem & {
    reviewedAt: string | null;
    suppressionReason: string | null;
    consumptionEvent: { eventKey: string | null; sourceFamily: string | null; sourceEntityType: string | null; sourceEntityId: string | null; occursOn: string | null; status: string | null } | null;
    draftCharge: { id: string; status: string; amountCents: number | null; occursOn: string | null; billableOn: string | null } | null;
    explanation: {
        sourceFact: { sourceFamily: string | null; sourceEntityType: string | null; sourceEntityId: string | null; occursOn: string | null; factType: string | null };
        candidate: { domain: string | null; factType: string | null } | null;
        interpretation: { summary: string | null; discardReason: string | null };
        matchedService: { label: string } | null;
        matchedRatePlan: { label: string; detail: string } | null;
        matchedRateRule: { label: string; detail: string } | null;
        matchedChargeTemplate: { key: string | null; label: string | null; amountStrategy: string | null } | null;
        matchedPolicies: { policyType: string; scope: string | null; applied: boolean; effect: string }[];
        amountCalculation: { amountCents: number | null; currencyCode: string; strategy: string | null; rateAmountCents: number | null; unitMultiplier: number | null; note: string | null };
        suppressionReason: string | null;
        recomputeStatus: { changed: boolean; currentAmountCents: number | null; recomputedAmountCents: number | null } | null;
    };
    timeline: TimelineStep[];
};

const REVIEW_STATUS_OPTS = [
    { value: "", label: "All review states" },
    { value: "pending", label: "Pending" },
    { value: "review_required", label: "Review required" },
    { value: "reviewed", label: "Reviewed" },
    { value: "suppressed", label: "Suppressed" },
    { value: "stale", label: "Stale" },
];
const FAMILY_OPTS = [
    { value: "", label: "All sources" },
    { value: "agreement", label: "Agreement" },
    { value: "schedule", label: "Schedule" },
    { value: "attendance", label: "Attendance" },
];

function amount(o: { amountCents: number | null; currencyCode: string }): string {
    return o.amountCents != null ? formatCurrencyCents(o.amountCents, o.currencyCode) : "—";
}

/**
 * Draft Obligation Review workspace (Slice 4) — the runtime counterpart to the
 * configuration in /settings/financials. PRE-POSTING: inspect every Resolved
 * Obligation and answer "why does Alloy think this should be charged?" then mark
 * reviewed / flag / suppress / restore / recompute. It posts nothing.
 */
export default function DraftObligationReviewWorkspace() {
    const [reviewStatus, setReviewStatus] = useState("");
    const [sourceFamily, setSourceFamily] = useState("");
    const [reviewRequiredOnly, setReviewRequiredOnly] = useState("");
    const [items, setItems] = useState<ListItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<Detail | null>(null);
    const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const queryString = useMemo(() => {
        const p = new URLSearchParams();
        if (reviewStatus) p.set("review_status", reviewStatus);
        if (sourceFamily) p.set("source_family", sourceFamily);
        if (reviewRequiredOnly === "yes") p.set("review_required", "true");
        return p.toString();
    }, [reviewStatus, sourceFamily, reviewRequiredOnly]);

    const loadList = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch(`/api/admin/financial/consumption/obligations${queryString ? `?${queryString}` : ""}`, { credentials: "include" });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            setItems((json.obligations ?? []) as ListItem[]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load obligations");
        }
    }, [queryString]);

    useEffect(() => { void loadList(); }, [loadList]);

    const loadDetail = useCallback(async (id: string) => {
        setSelectedId(id);
        setRecomputeMsg(null);
        setError(null);
        try {
            const res = await fetch(`/api/admin/financial/consumption/obligations?id=${encodeURIComponent(id)}`, { credentials: "include" });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            setDetail(json.obligation as Detail);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load obligation");
        }
    }, []);

    async function act(action: string) {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        setRecomputeMsg(null);
        try {
            const body: Record<string, unknown> = { id: selectedId, action };
            if (action === "suppress") body.reason = "Suppressed via review workspace";
            if (action === "recompute_preview") { body.action = "recompute"; body.persist = false; }
            else if (action === "recompute") { body.persist = true; }
            const res = await fetch("/api/admin/financial/consumption/obligations", {
                method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            if (json.recompute) {
                const r = json.recompute;
                setRecomputeMsg(r.changed ? `Recompute preview: amount would change ${r.current.amountCents ?? "—"}¢ → ${r.recomputed?.amountCents ?? "—"}¢ (not applied).` : "Recompute preview: no change.");
            } else if (json.obligation) {
                setDetail(json.obligation as Detail);
                await loadList();
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Action failed");
        } finally {
            setBusy(false);
        }
    }

    const x = detail?.explanation;

    return (
        <div className="space-y-3" data-testid="obligation-review-workspace">
            <ConfigReadonlyNotice testId="obligation-review-notice">
                <strong>Draft Obligation Review</strong> is <em>pre-posting</em>. Resolved Obligations are inspected and
                triaged here — <em>why does Alloy think this should be charged?</em> — before they ever become
                authoritative money. Nothing here posts, invoices, collects payment, or writes the ledger; Posting remains
                downstream.
            </ConfigReadonlyNotice>

            <div className="flex flex-wrap gap-3" data-testid="obligation-filters">
                <ConfigFieldLabel label="Review state">
                    <ConfigSelectInput value={reviewStatus} onChange={setReviewStatus} options={REVIEW_STATUS_OPTS} testId="filter-review-status" />
                </ConfigFieldLabel>
                <ConfigFieldLabel label="Source">
                    <ConfigSelectInput value={sourceFamily} onChange={setSourceFamily} options={FAMILY_OPTS} testId="filter-source-family" />
                </ConfigFieldLabel>
                <ConfigFieldLabel label="Review required">
                    <ConfigSelectInput value={reviewRequiredOnly} onChange={setReviewRequiredOnly} options={[{ value: "", label: "Any" }, { value: "yes", label: "Only review-required" }]} testId="filter-review-required" />
                </ConfigFieldLabel>
            </div>

            {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : null}

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)]">
                {/* LEFT: queue */}
                <ConfigurationDetailCard title={`Obligations (${items.length})`} testId="obligation-queue">
                    {items.length === 0 ? (
                        <p className="config-typo-sublabel text-alloy-forge/60">No obligations match. Run the Consumption simulator (draft mode) to create some.</p>
                    ) : (
                        <ul className="space-y-1">
                            {items.map((o) => (
                                <li key={o.id}>
                                    <button
                                        type="button"
                                        onClick={() => void loadDetail(o.id)}
                                        data-testid="obligation-row"
                                        className={`w-full rounded-lg border px-2 py-1.5 text-left config-typo-sublabel ${selectedId === o.id ? "border-alloy-forge/40 bg-alloy-mist/40" : "border-alloy-mist/50"}`}
                                    >
                                        <span className="font-medium text-alloy-forge">{o.obligationKind ?? "obligation"}</span> · {amount(o)}
                                        <span className="block text-alloy-forge/55">{o.sourceFamily ?? "?"} · {o.reviewStatus}{o.reviewRequired ? " · review!" : ""}{o.eligibleForPosting ? "" : " · suppressed"}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </ConfigurationDetailCard>

                {/* CENTER: detail + actions */}
                <ConfigurationDetailCard title="Selected obligation" testId="obligation-detail">
                    {!detail ? (
                        <p className="config-typo-sublabel text-alloy-forge/60">Select an obligation to inspect it.</p>
                    ) : (
                        <div className="space-y-3" data-testid="obligation-detail-body">
                            <ConfigFieldGrid>
                                <ConfigField label="Kind" value={detail.obligationKind ?? "—"} />
                                <ConfigField label="Amount" value={amount(detail)} />
                                <ConfigField label="Occurs / billable" value={`${detail.occursOn ?? "—"} → ${detail.billableOn ?? "—"}`} />
                                <ConfigField label="Resolution status" value={detail.status} />
                                <ConfigField label="Review status" value={detail.reviewStatus} />
                                <ConfigField label="Eligible for posting" value={detail.eligibleForPosting ? "Yes" : "No (suppressed/none)"} />
                                <ConfigField label="Draft charge" value={detail.draftCharge ? `${detail.draftCharge.status} · ${amount({ amountCents: detail.draftCharge.amountCents, currencyCode: detail.currencyCode })}` : "none"} />
                                {detail.suppressionReason ? <ConfigField label="Suppression reason" value={detail.suppressionReason} /> : null}
                            </ConfigFieldGrid>
                            <ConfigButtonRow>
                                <ConfigPrimaryButton onClick={() => void act("mark_reviewed")} disabled={busy} testId="action-mark-reviewed">Mark reviewed</ConfigPrimaryButton>
                                <ConfigSecondaryButton onClick={() => void act("flag")} disabled={busy} testId="action-flag">Flag for review</ConfigSecondaryButton>
                                {detail.reviewStatus === "suppressed"
                                    ? <ConfigSecondaryButton onClick={() => void act("restore")} disabled={busy} testId="action-restore">Restore</ConfigSecondaryButton>
                                    : <ConfigSecondaryButton onClick={() => void act("suppress")} disabled={busy} testId="action-suppress">Suppress</ConfigSecondaryButton>}
                                <ConfigSecondaryButton onClick={() => void act("recompute_preview")} disabled={busy} testId="action-recompute-preview">Recompute (preview)</ConfigSecondaryButton>
                                <ConfigSecondaryButton onClick={() => void act("recompute")} disabled={busy} testId="action-recompute">Recompute (apply)</ConfigSecondaryButton>
                            </ConfigButtonRow>
                            {recomputeMsg ? <p className="config-typo-sublabel text-alloy-forge/70" data-testid="recompute-msg">{recomputeMsg}</p> : null}
                        </div>
                    )}
                </ConfigurationDetailCard>

                {/* RIGHT: explanation + timeline */}
                <ConfigurationDetailCard title="Why this exists" testId="obligation-explanation">
                    {!detail || !x ? (
                        <p className="config-typo-sublabel text-alloy-forge/60">The full reasoning chain appears here.</p>
                    ) : (
                        <div className="space-y-3">
                            <ConfigFieldGrid>
                                <ConfigField label="Source fact" value={`${x.sourceFact.sourceFamily ?? "?"} · ${x.sourceFact.factType ?? "?"}`} />
                                <ConfigField label="Consumption event" value={detail.consumptionEvent?.eventKey ?? "—"} />
                                <ConfigField label="Interpretation" value={x.interpretation.summary ?? "—"} />
                                <ConfigField label="Service" value={x.matchedService?.label ?? "—"} />
                                <ConfigField label="Rate plan" value={x.matchedRatePlan?.label ?? "—"} />
                                <ConfigField label="Rate rule" value={x.matchedRateRule ? `${x.matchedRateRule.label} · ${x.matchedRateRule.detail}` : "—"} />
                                <ConfigField label="Charge template" value={x.matchedChargeTemplate ? `${x.matchedChargeTemplate.label ?? x.matchedChargeTemplate.key ?? "?"} (${x.matchedChargeTemplate.amountStrategy ?? "?"})` : "—"} />
                                <ConfigField label="Amount calc" value={x.amountCalculation.rateAmountCents != null ? `rate ${x.amountCalculation.rateAmountCents}¢ × ${x.amountCalculation.unitMultiplier ?? 1}` : x.amountCalculation.strategy ?? "—"} />
                            </ConfigFieldGrid>
                            {x.interpretation.discardReason ? <p className="config-typo-sublabel text-amber-700">No charge: {x.interpretation.discardReason}</p> : null}
                            {x.recomputeStatus?.changed ? <p className="config-typo-sublabel text-amber-700" data-testid="recompute-drift">Recompute drift: stored {x.recomputeStatus.currentAmountCents ?? "—"}¢ vs recomputed {x.recomputeStatus.recomputedAmountCents ?? "—"}¢.</p> : null}

                            <div data-testid="obligation-policies">
                                <h5 className="config-typo-label mb-1">Policies applied</h5>
                                {x.matchedPolicies.length === 0 ? <p className="config-typo-sublabel text-alloy-forge/55">none</p> : (
                                    <ul className="config-typo-sublabel space-y-0.5 text-alloy-forge/80">
                                        {x.matchedPolicies.map((p, i) => (<li key={i}><span className={p.applied ? "text-alloy-forge" : "text-alloy-forge/40"}>{p.applied ? "●" : "○"}</span> {p.policyType}: {p.effect}</li>))}
                                    </ul>
                                )}
                            </div>

                            <div data-testid="obligation-timeline">
                                <h5 className="config-typo-label mb-1">Timeline</h5>
                                <ol className="config-typo-sublabel space-y-0.5 text-alloy-forge/80">
                                    {detail.timeline.map((t, i) => (
                                        <li key={i}><span className={t.present ? "text-alloy-forge" : "text-alloy-forge/40"}>{t.present ? "▸" : "·"}</span> <strong>{t.label}</strong>{t.at ? ` (${t.at})` : ""} — {t.detail}</li>
                                    ))}
                                </ol>
                            </div>
                        </div>
                    )}
                </ConfigurationDetailCard>
            </div>
        </div>
    );
}
