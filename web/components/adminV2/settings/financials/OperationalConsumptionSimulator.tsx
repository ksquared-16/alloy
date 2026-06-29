"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrencyCents } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { ConfigurationDetailCard } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigButtonRow,
    ConfigFieldLabel,
    ConfigPrimaryButton,
    ConfigSecondaryButton,
    ConfigSelectInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import {
    ConfigField,
    ConfigFieldGrid,
    ConfigReadonlyNotice,
} from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";

const EVENT_KEY = "enrollment.registration";

type MemberRow = { id: string; display_name: string | null; first_name: string | null; last_name: string | null };
type AgreementRow = { id: string; status: string; start_date: string | null };

type ObligationView = {
    amountCents: number | null;
    currencyCode: string;
    occursOn: string | null;
    billableOn: string | null;
    reviewRequired: boolean;
    status: string;
    responsibilityKey: string | null;
};
type ConsumptionResult = {
    eventType: { eventKey: string; label: string; sourceFamily: string; chargeTemplateKey: string | null; scope: string } | null;
    matchedCommercial: { chargeTemplateKey: string; chargeTemplateLabel: string } | null;
    resolution: {
        event: { status: string; occursOn: string; idempotencyKey: string };
        obligations: ObligationView[];
    };
    chargePreview: { wouldWrite: string } | null;
    persisted?: { consumptionEventId: string; resolvedObligationIds: string[]; draftChargeId: string | null; draftChargeStatus: string | null };
};

function memberLabel(m: MemberRow): string {
    return ((m.display_name ?? "").trim() || `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim()) || "Unnamed";
}

/**
 * Operational Consumption Simulator (Slice 1). Proves the platform boundary for
 * the first vertical: Enrollment Agreement Activated → Registration Fee
 * Consumption Event → Resolved Obligation → Draft Charge. Preview computes and
 * persists nothing; with an agreement, an operator can persist safe draft objects
 * (consumption event + obligation + draft charge). Never posts. No UUIDs shown.
 */
export default function OperationalConsumptionSimulator({ todayYmd }: { todayYmd: string }) {
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [agreements, setAgreements] = useState<AgreementRow[]>([]);
    const [memberId, setMemberId] = useState("");
    const [agreementId, setAgreementId] = useState("");
    const [result, setResult] = useState<ConsumptionResult | null>(null);
    const [draftMsg, setDraftMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const res = await fetch("/api/admin/customer-members", { credentials: "include" });
                const json = (await res.json()) as { members?: MemberRow[] };
                if (active && res.ok) setMembers(json.members ?? []);
            } catch {
                /* selector stays empty */
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const loadAgreements = useCallback(async (mid: string) => {
        setAgreements([]);
        setAgreementId("");
        if (!mid) return;
        try {
            const res = await fetch(`/api/admin/child-enrollment-agreements?customer_member_id=${encodeURIComponent(mid)}`, { credentials: "include" });
            const json = (await res.json()) as { agreements?: AgreementRow[] };
            if (res.ok) setAgreements(json.agreements ?? []);
        } catch {
            /* leave empty */
        }
    }, []);

    async function run(action: "preview" | "draft") {
        setBusy(true);
        setError(null);
        setDraftMsg(null);
        try {
            const body: Record<string, unknown> = {
                action,
                event_key: EVENT_KEY,
                source_family: "agreement",
                source_entity_type: "child_enrollment_agreements",
                source_entity_id: agreementId,
                subject_type: "customer_member",
                subject_id: memberId || null,
            };
            const res = await fetch("/api/admin/financial/consumption/simulate", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            setResult(json as ConsumptionResult);
            if (action === "draft") {
                const p = (json as ConsumptionResult).persisted;
                setDraftMsg(
                    `Persisted consumption event + ${p?.resolvedObligationIds.length ?? 0} obligation(s); draft charge ${p?.draftChargeStatus ?? "—"} (idempotent — re-running recalculates, never posts).`,
                );
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Simulation failed");
        } finally {
            setBusy(false);
        }
    }

    const obligation = result?.resolution.obligations[0] ?? null;

    return (
        <div className="space-y-3" data-testid="consumption-simulator">
            <ConfigReadonlyNotice testId="consumption-simulator-notice">
                <strong>Operational Consumption</strong> is runtime interpretation, not configuration. It reads an
                operational fact and asks <em>what commercial meaning should exist</em>:
                {" "}Enrollment Agreement Activated → Registration Fee Consumption Event → Resolved Obligation → Draft
                Charge. It posts nothing — Posting stays the only authoritative money write.
            </ConfigReadonlyNotice>

            <ConfigurationDetailCard title="Simulate — enrollment registration" testId="consumption-simulator-card">
                <p className="config-typo-sublabel mb-3 text-alloy-forge/60">
                    Pick a child + agreement, then preview the consumption of <code>{EVENT_KEY}</code> as of {todayYmd}.
                    Preview writes nothing; “Create draft” persists only safe draft objects (still not posted).
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                    <ConfigFieldLabel label="Child">
                        <ConfigSelectInput
                            value={memberId}
                            onChange={(v) => { setMemberId(v); setResult(null); void loadAgreements(v); }}
                            options={[{ value: "", label: "Select a child…" }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
                            disabled={busy}
                            testId="consumption-child"
                        />
                    </ConfigFieldLabel>
                    {memberId ? (
                        <ConfigFieldLabel label="Agreement">
                            <ConfigSelectInput
                                value={agreementId}
                                onChange={(v) => { setAgreementId(v); setResult(null); }}
                                options={[{ value: "", label: agreements.length ? "Select an agreement…" : "No agreements" }, ...agreements.map((a) => ({ value: a.id, label: `${a.status}${a.start_date ? ` · from ${a.start_date}` : ""}` }))]}
                                disabled={busy}
                                testId="consumption-agreement"
                            />
                        </ConfigFieldLabel>
                    ) : null}
                </div>

                <div className="mt-3">
                    <ConfigButtonRow>
                        <ConfigPrimaryButton onClick={() => void run("preview")} disabled={busy || !agreementId} testId="consumption-preview">
                            {busy ? "Running…" : "Preview"}
                        </ConfigPrimaryButton>
                        {agreementId ? (
                            <ConfigSecondaryButton onClick={() => void run("draft")} disabled={busy} testId="consumption-draft">
                                Create draft
                            </ConfigSecondaryButton>
                        ) : null}
                    </ConfigButtonRow>
                </div>

                {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
                {draftMsg ? <p className="mt-2 config-typo-sublabel text-alloy-forge/70" data-testid="consumption-draft-msg">{draftMsg}</p> : null}

                {result ? (
                    <div className="mt-3 space-y-3" data-testid="consumption-result">
                        <ConfigFieldGrid>
                            <ConfigField label="Consumption event" value={result.eventType?.label ?? result.resolution.event.status} />
                            <ConfigField label="Source family" value={result.eventType?.sourceFamily ?? "—"} />
                            <ConfigField label="Event status" value={result.resolution.event.status} />
                            <ConfigField label="Matched template" value={result.matchedCommercial?.chargeTemplateLabel ?? "none (no charge)"} />
                        </ConfigFieldGrid>
                        {obligation ? (
                            <ConfigFieldGrid>
                                <ConfigField label="Obligation amount" value={obligation.amountCents != null ? formatCurrencyCents(obligation.amountCents, obligation.currencyCode) : "resolves at posting"} />
                                <ConfigField label="Occurs on" value={obligation.occursOn} />
                                <ConfigField label="Billable on" value={obligation.billableOn} />
                                <ConfigField label="Responsibility" value={obligation.responsibilityKey ?? "default"} />
                                <ConfigField label="Review required" value={obligation.reviewRequired ? "Yes" : "No"} />
                                <ConfigField label="Obligation status" value={obligation.status} />
                                <ConfigField label="Draft charge" value={result.chargePreview ? result.chargePreview.wouldWrite : "—"} />
                            </ConfigFieldGrid>
                        ) : (
                            <p className="config-typo-sublabel text-amber-700">No obligation — this consumption event produces no charge.</p>
                        )}
                    </div>
                ) : null}
            </ConfigurationDetailCard>
        </div>
    );
}
