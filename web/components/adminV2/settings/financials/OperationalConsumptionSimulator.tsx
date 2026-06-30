"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrencyCents } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { ConfigurationDetailCard } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigButtonRow,
    ConfigFieldLabel,
    ConfigPrimaryButton,
    ConfigSecondaryButton,
    ConfigSelectInput,
    ConfigNumberInput,
    ConfigTextInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import {
    ConfigField,
    ConfigFieldGrid,
    ConfigReadonlyNotice,
} from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";

type MemberRow = { id: string; display_name: string | null; first_name: string | null; last_name: string | null };
type AgreementRow = { id: string; status: string; start_date: string | null };

/** A simulator scenario maps to a request payload shape. */
type Scenario = {
    key: string;
    label: string;
    group: string;
    eventKey?: string;
    scheduleChangeKind?: string;
    attendanceFactType?: string;
    /** Whether a schedule basis selector is relevant. */
    needsBasis?: boolean;
    /** Whether prior-basis + proration day inputs are relevant. */
    needsProration?: boolean;
    needsPriorBasis?: boolean;
    /** Attendance: show check-out + late-threshold times. */
    needsLateTime?: boolean;
    /** Attendance: show an hours input. */
    needsHours?: boolean;
    /** Attendance: mark the child vacation-credit eligible. */
    vacationEligible?: boolean;
};

const SCENARIOS: Scenario[] = [
    { key: "registration", label: "Registration Fee", group: "Agreement", eventKey: "enrollment.registration" },
    { key: "recurring", label: "Recurring Tuition (e.g. MWF)", group: "Schedule", scheduleChangeKind: "recurring", needsBasis: true },
    { key: "temporary", label: "Temporary Schedule → Proration", group: "Schedule", scheduleChangeKind: "temporary", needsBasis: true, needsProration: true },
    { key: "extra_day", label: "Extra Day → Drop-In rate", group: "Schedule", scheduleChangeKind: "extra_day" },
    { key: "drop_in", label: "Drop-In", group: "Schedule", scheduleChangeKind: "drop_in" },
    { key: "replacement", label: "Schedule Replacement → Credit + Tuition", group: "Schedule", scheduleChangeKind: "replacement", needsBasis: true, needsPriorBasis: true },
    { key: "holiday_override", label: "Holiday Override (no impact)", group: "Schedule", scheduleChangeKind: "holiday_override" },
    { key: "exception", label: "Schedule Exception (no impact)", group: "Schedule", scheduleChangeKind: "exception" },
    // Attendance consumption (Slice 3)
    { key: "late_pickup", label: "Late Pickup (check-out time)", group: "Attendance", attendanceFactType: "check_out", needsLateTime: true },
    { key: "att_drop_in", label: "Drop-In attendance", group: "Attendance", attendanceFactType: "drop_in" },
    { key: "att_extra_day", label: "Extra Day attendance", group: "Attendance", attendanceFactType: "extra_day" },
    { key: "hourly_care", label: "Hourly Care", group: "Attendance", attendanceFactType: "hourly_care", needsHours: true },
    { key: "absence_vac", label: "Absence → Vacation Credit", group: "Attendance", attendanceFactType: "absence", vacationEligible: true },
    { key: "absence_none", label: "Absence (not eligible — no impact)", group: "Attendance", attendanceFactType: "absence" },
    { key: "excused", label: "Excused Absence (no impact)", group: "Attendance", attendanceFactType: "excused_absence" },
    { key: "room_transfer", label: "Room Transfer (no impact)", group: "Attendance", attendanceFactType: "room_transfer" },
    { key: "no_show", label: "No-Show", group: "Attendance", attendanceFactType: "no_show" },
];

const BASIS_OPTIONS = [
    { value: "three_day", label: "3 days/week (e.g. MWF)" },
    { value: "four_day", label: "4 days/week" },
    { value: "five_day", label: "5 days/week" },
];

type CommercialObjectRef = { kind: string; label: string; detail: string; matched: boolean };
type PolicyApplication = { policyType: string; scope: string | null; applied: boolean; effect: string };
type ObligationView = {
    obligationKind: string;
    amountCents: number | null;
    currencyCode: string;
    occursOn: string | null;
    billableOn: string | null;
    periodStart: string | null;
    reviewRequired: boolean;
    draftable: boolean;
    status: string;
    explanation: Record<string, unknown>;
};
type ConsumptionResult = {
    eventType: { eventKey: string; label: string; sourceFamily: string } | null;
    interpretation: { scheduleChangeKind: string; noImpactReason: string | null } | null;
    attendanceInterpretation?: { attendanceFactType: string; discardReason: string | null } | null;
    candidate?: { domain: string; factType: string; occursOn: string } | null;
    commercialObjectsUsed?: CommercialObjectRef[];
    policiesApplied?: PolicyApplication[];
    resolution: { event: { status: string; eventKey: string; occursOn: string }; obligations: ObligationView[] };
    chargePreview: { wouldWrite: string } | null;
    persisted?: { resolvedObligationIds: string[]; obligations: { obligationKind: string; draftChargeStatus: string | null }[] };
};

function memberLabel(m: MemberRow): string {
    return ((m.display_name ?? "").trim() || `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim()) || "Unnamed";
}

/**
 * Operational Consumption Simulator (Slice 2). Proves the platform end-to-end:
 *   Agreement → Schedule → Consumption Events → Commercial Objects Used →
 *   Policies Applied → Resolved Obligations → Draft Charges.
 * Every step explains WHY it happened, which Commercial objects matched, which
 * policies applied, and why obligations were or were not created. Preview writes
 * nothing; "Create draft" persists only safe draft objects. Never posts.
 */
export default function OperationalConsumptionSimulator({ todayYmd }: { todayYmd: string }) {
    const [scenarioKey, setScenarioKey] = useState("recurring");
    const [basis, setBasis] = useState("three_day");
    const [priorBasis, setPriorBasis] = useState("five_day");
    const [proratedDays, setProratedDays] = useState("10");
    const [periodDays, setPeriodDays] = useState("22");
    const [checkOutTime, setCheckOutTime] = useState("17:18");
    const [lateThreshold, setLateThreshold] = useState("17:00");
    const [hours, setHours] = useState("3");
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [agreements, setAgreements] = useState<AgreementRow[]>([]);
    const [memberId, setMemberId] = useState("");
    const [agreementId, setAgreementId] = useState("");
    const [result, setResult] = useState<ConsumptionResult | null>(null);
    const [draftMsg, setDraftMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const scenario = useMemo(() => SCENARIOS.find((s) => s.key === scenarioKey) ?? SCENARIOS[0], [scenarioKey]);

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
                source_entity_type: "child_enrollment_agreements",
                source_entity_id: agreementId,
                subject_type: "customer_member",
                subject_id: memberId || null,
            };
            if (scenario.eventKey) {
                body.event_key = scenario.eventKey;
                body.source_family = "agreement";
            }
            if (scenario.scheduleChangeKind) {
                body.schedule_change_kind = scenario.scheduleChangeKind;
                body.source_family = "schedule";
                if (scenario.needsBasis) body.schedule_basis = basis;
                if (scenario.needsPriorBasis) body.prior_schedule_basis = priorBasis;
                if (scenario.needsProration) {
                    body.prorated_days = Number(proratedDays);
                    body.period_days = Number(periodDays);
                }
            }
            if (scenario.attendanceFactType) {
                body.attendance_fact_type = scenario.attendanceFactType;
                body.source_family = "attendance";
                body.agreement_id = agreementId;
                if (scenario.needsLateTime) {
                    body.check_out_time = checkOutTime;
                    body.late_threshold_time = lateThreshold;
                }
                if (scenario.needsHours) body.hours = Number(hours);
                if (scenario.vacationEligible) body.vacation_eligible = true;
            }
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
                const drafted = (p?.obligations ?? []).filter((o) => o.draftChargeStatus && o.draftChargeStatus !== "not_writable").length;
                setDraftMsg(`Persisted consumption event + ${p?.resolvedObligationIds.length ?? 0} obligation(s); ${drafted} draft charge(s) (idempotent — re-running recalculates, never posts).`);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Simulation failed");
        } finally {
            setBusy(false);
        }
    }

    const obligations = result?.resolution.obligations ?? [];

    return (
        <div className="space-y-3" data-testid="consumption-simulator">
            <ConfigReadonlyNotice testId="consumption-simulator-notice">
                <strong>Operational Consumption</strong> is runtime interpretation, not configuration. Operational
                Scheduling answers <em>where should the child be?</em>; Consumption answers <em>what financially applies
                because of that schedule?</em> — Agreement → Schedule → Consumption Events → Commercial objects → Policies
                → Resolved Obligations → Draft Charges. It posts nothing.
            </ConfigReadonlyNotice>

            <ConfigurationDetailCard title="Simulate — the consumption pipeline (agreement · schedule · attendance)" testId="consumption-simulator-card">
                <p className="config-typo-sublabel mb-3 text-alloy-forge/60">
                    Pick a child + agreement and a scenario, then preview consumption as of {todayYmd}. Preview writes
                    nothing; “Create draft” persists only safe draft objects (still not posted).
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
                    <ConfigFieldLabel label="Scenario">
                        <ConfigSelectInput
                            value={scenarioKey}
                            onChange={(v) => { setScenarioKey(v); setResult(null); }}
                            options={SCENARIOS.map((s) => ({ value: s.key, label: `${s.group}: ${s.label}` }))}
                            disabled={busy}
                            testId="consumption-scenario"
                        />
                    </ConfigFieldLabel>
                    {scenario.needsLateTime ? (
                        <>
                            <ConfigFieldLabel label="Check-out time">
                                <ConfigTextInput value={checkOutTime} onChange={setCheckOutTime} disabled={busy} testId="consumption-checkout-time" />
                            </ConfigFieldLabel>
                            <ConfigFieldLabel label="Late threshold">
                                <ConfigTextInput value={lateThreshold} onChange={setLateThreshold} disabled={busy} testId="consumption-late-threshold" />
                            </ConfigFieldLabel>
                        </>
                    ) : null}
                    {scenario.needsHours ? (
                        <ConfigFieldLabel label="Hours of care">
                            <ConfigNumberInput value={hours} onChange={setHours} min="0" step="0.5" disabled={busy} testId="consumption-hours" />
                        </ConfigFieldLabel>
                    ) : null}
                    {scenario.needsBasis ? (
                        <ConfigFieldLabel label="Schedule (new)">
                            <ConfigSelectInput value={basis} onChange={setBasis} options={BASIS_OPTIONS} disabled={busy} testId="consumption-basis" />
                        </ConfigFieldLabel>
                    ) : null}
                    {scenario.needsPriorBasis ? (
                        <ConfigFieldLabel label="Prior schedule">
                            <ConfigSelectInput value={priorBasis} onChange={setPriorBasis} options={BASIS_OPTIONS} disabled={busy} testId="consumption-prior-basis" />
                        </ConfigFieldLabel>
                    ) : null}
                    {scenario.needsProration ? (
                        <>
                            <ConfigFieldLabel label="Prorated days">
                                <ConfigNumberInput value={proratedDays} onChange={setProratedDays} min="0" step="1" disabled={busy} testId="consumption-prorated-days" />
                            </ConfigFieldLabel>
                            <ConfigFieldLabel label="Period days">
                                <ConfigNumberInput value={periodDays} onChange={setPeriodDays} min="1" step="1" disabled={busy} testId="consumption-period-days" />
                            </ConfigFieldLabel>
                        </>
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
                    <div className="mt-4 space-y-4" data-testid="consumption-result">
                        {/* Consumption Candidate (pipeline entry) */}
                        {result.candidate ? (
                            <section data-testid="consumption-candidate">
                                <h4 className="config-typo-label mb-1">Consumption candidate</h4>
                                <ConfigFieldGrid>
                                    <ConfigField label="Domain" value={result.candidate.domain} />
                                    <ConfigField label="Fact type" value={result.candidate.factType} />
                                    <ConfigField label="Occurs on" value={result.candidate.occursOn} />
                                </ConfigFieldGrid>
                                {result.attendanceInterpretation?.discardReason ? (
                                    <p className="mt-1 config-typo-sublabel text-amber-700" data-testid="consumption-discarded">Candidate discarded — no consumption event: {result.attendanceInterpretation.discardReason}</p>
                                ) : null}
                            </section>
                        ) : null}

                        {/* Consumption Event */}
                        <section>
                            <h4 className="config-typo-label mb-1">Consumption event</h4>
                            <ConfigFieldGrid>
                                <ConfigField label="Event" value={result.eventType?.label ?? result.resolution.event.eventKey} />
                                <ConfigField label="Source family" value={result.eventType?.sourceFamily ?? result.candidate?.domain ?? "—"} />
                                <ConfigField label="Status" value={result.resolution.event.status} />
                            </ConfigFieldGrid>
                            {result.interpretation?.noImpactReason ? (
                                <p className="mt-1 config-typo-sublabel text-amber-700" data-testid="consumption-no-impact">No financial impact: {result.interpretation.noImpactReason}</p>
                            ) : null}
                        </section>

                        {/* Commercial objects used */}
                        {result.commercialObjectsUsed && result.commercialObjectsUsed.length ? (
                            <section data-testid="consumption-commercial">
                                <h4 className="config-typo-label mb-1">Commercial objects used</h4>
                                <ul className="config-typo-sublabel space-y-0.5 text-alloy-forge/80">
                                    {result.commercialObjectsUsed.map((c, i) => (
                                        <li key={i}>
                                            <span className={c.matched ? "text-alloy-forge" : "text-amber-700"}>{c.matched ? "✓" : "✗"}</span> <strong>{c.kind}</strong>: {c.label} <span className="text-alloy-forge/50">· {c.detail}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}

                        {/* Policies applied */}
                        {result.policiesApplied && result.policiesApplied.length ? (
                            <section data-testid="consumption-policies">
                                <h4 className="config-typo-label mb-1">Policies applied</h4>
                                <ul className="config-typo-sublabel space-y-0.5 text-alloy-forge/80">
                                    {result.policiesApplied.map((p, i) => (
                                        <li key={i}>
                                            <span className={p.applied ? "text-alloy-forge" : "text-alloy-forge/40"}>{p.applied ? "●" : "○"}</span> <strong>{p.policyType}</strong>{p.scope ? ` (${p.scope})` : ""}: {p.effect}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}

                        {/* Resolved obligations */}
                        <section data-testid="consumption-obligations">
                            <h4 className="config-typo-label mb-1">Resolved obligations ({obligations.length})</h4>
                            {obligations.length === 0 ? (
                                <p className="config-typo-sublabel text-alloy-forge/60">No obligations — this consumption produces no charge.</p>
                            ) : (
                                <div className="space-y-2">
                                    {obligations.map((o, i) => (
                                        <div key={i} className="rounded-lg border border-alloy-mist/60 p-2" data-testid={`consumption-obligation-${o.obligationKind}`}>
                                            <ConfigFieldGrid>
                                                <ConfigField label="Kind" value={o.obligationKind} />
                                                <ConfigField label="Amount" value={o.amountCents != null ? formatCurrencyCents(o.amountCents, o.currencyCode) : "not resolvable"} />
                                                <ConfigField label="Occurs / billable" value={`${o.occursOn ?? "—"} → ${o.billableOn ?? "—"}`} />
                                                <ConfigField label="Review" value={o.reviewRequired ? "Required" : "No"} />
                                                <ConfigField label="Draft charge" value={o.draftable ? (result.chargePreview?.wouldWrite ?? "yes") : "preview only"} />
                                                <ConfigField label="Status" value={o.status} />
                                            </ConfigFieldGrid>
                                            {typeof o.explanation?.directive_reason === "string" ? (
                                                <p className="mt-1 config-typo-sublabel text-alloy-forge/60">Why: {o.explanation.directive_reason as string}</p>
                                            ) : null}
                                            {typeof o.explanation?.no_charge_reason === "string" ? (
                                                <p className="mt-1 config-typo-sublabel text-amber-700">No charge: {o.explanation.no_charge_reason as string}</p>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                ) : null}
            </ConfigurationDetailCard>
        </div>
    );
}
