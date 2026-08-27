"use client";

import { useCallback, useEffect, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ApprovedHealthSafetyCard from "@/components/operationalCards/HealthSafetyCard";
import HealthDetailCard from "@/components/operationalCards/HealthDetailCard";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import { adaptHealthVmToHealthCard } from "@/lib/adminV2/runtime/focusPanel/healthSafety/adaptHealthVmToHealthCard";
import { adaptHealthVmToHealthDetail } from "@/lib/adminV2/runtime/focusPanel/healthSafety/adaptHealthVmToHealthDetail";
import type { HealthSafetyCardVM } from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

/**
 * HEALTH & SAFETY — what an operator needs to know to care for this child safely right now.
 *
 * The hierarchy is locked and is not redesigned here:
 *
 *   critical safety  →  ongoing care  →  enrollment health  →  emergency context
 *
 * ── THE CRITICAL REGION IS RESTRAINED ON PURPOSE ──
 *
 * A neutral surface with a narrow risk rail, and emphasis spent on the SEVERITY and the INSTRUCTION.
 * No large red wash: a card that shouts at every glance is a card an operator learns to skim, and
 * the one time it matters they will skim it too. The rail marks the region; the words carry the
 * urgency.
 *
 * ── THE SUBJECT IS THE SCOPED PARTICIPANT, OR NOBODY ──
 *
 * With several children and none scoped this renders no health information at all. Every other card
 * can afford a sensible default; this one cannot. Showing one sibling's allergies under another
 * child's name is the specific harm the whole vertical was built to prevent, and an operator would
 * have no way to see the substitution.
 *
 * ── AN EMPTY CARD AND A FORBIDDEN CARD ARE DIFFERENT ANSWERS ──
 *
 * A permission refusal says so. Rendering an empty health card to someone who may not see health
 * information would imply this child has no allergies, which is the most dangerous thing this
 * surface could say.
 */
export default function HealthSafetyCard({ model, context, receded = false, coordination }: Props) {
    const scope = context.participantScope ?? null;
    const memberId = scope?.customerMemberId ?? null;
    const [vm, setVm] = useState<HealthSafetyCardVM | null>(null);
    const [loading, setLoading] = useState(false);
    const [denied, setDenied] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const load = useCallback(async () => {
        if (!memberId) {
            setVm(null);
            setDenied(false);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(
                `/api/admin/health/card?customer_member_id=${encodeURIComponent(memberId)}`,
                { credentials: "include" },
            );
            const json = (await res.json()) as {
                ok?: boolean;
                permission_denied?: boolean;
                vm?: HealthSafetyCardVM;
            };
            setDenied(Boolean(json?.permission_denied));
            // Keyed on the child the request was FOR: a slower response for the child the operator
            // just left must never paint over the child they are looking at now.
            setVm(
                json?.ok && json.vm?.participant?.customerMemberId === memberId ? json.vm : null,
            );
        } catch {
            setVm(null);
            setDenied(false);
        } finally {
            setLoading(false);
        }
    }, [memberId]);

    useEffect(() => {
        // Clear FIRST. Health data from the previous child must not linger for even one frame.
        setVm(null);
        setDenied(false);
        void load();
    }, [load]);

    const name = scope?.displayName ?? null;
    const criticalCount = vm?.criticalFacts.length ?? 0;

    /*
     * ── THE SUMMARY IS THE APPROVED CARD, RENDERED BY THE APPROVED COMPONENT ──
     *
     * Everything above this line is the card's DATA work — resolving the participant, loading the
     * record, handling the permission refusal. None of it is presentation and none of it changes.
     *
     * What changes is that the summary no longer draws itself. It renders
     * `components/operationalCards/HealthSafetyCard`, the same component the design lab renders, so
     * the approved section grammar (CRITICAL / HEALTH / ENROLLMENT HEALTH / emergency contacts)
     * reaches production intact. The approximation dropped the sections and rendered the enrollment
     * requirements as a cloud of "missing" pills — four warnings where the specimen shows one
     * checklist with four rows.
     *
     * The refusal paths below are untouched. A permission refusal and an unresolved participant are
     * NOT empty health records and must never render as one.
     */
    /*
     * The detail rides the Focus Panel's OWN depth layer — the same centered card and scrim the
     * Financials detail uses. Reporting "focused" is what raises it; the scrim click and ESC come
     * back through `useDismissSignal` rather than a close control this card owns.
     */
    useReportPerspective(coordination, "health_safety", expanded ? "focused" : "base");
    useDismissSignal(coordination, "health_safety", () => setExpanded(false));

    /*
     * ── VIEW HEALTH DETAILS — the approved detail, PROJECTING the existing owners ──
     *
     * Not a second health model and not a copy: every field is already resolved by
     * `buildHealthSafetyCardVM` from `person_health_facts`, documents, evaluated requirements and
     * relationships. The refusal paths below still win — a permission refusal is not an empty
     * health record, and must never open as one.
     */
    if (expanded && vm && !denied && !vm.unavailableReason) {
        return (
            <div className="alloy-os-health" data-health-card="true" data-health-overlay="detail">
                <HealthDetailCard evidence={adaptHealthVmToHealthDetail(vm, name)} />
            </div>
        );
    }

    if (vm && !denied && !vm.unavailableReason) {
        return (
            <div
                className="alloy-os-health"
                data-health-card="true"
                data-health-subject={memberId ?? undefined}
            >
                <ApprovedHealthSafetyCard
                    evidence={adaptHealthVmToHealthCard(vm)}
                    onViewDetails={() => setExpanded(true)}
                />
            </div>
        );
    }

    return (
        <div className="alloy-os-health" data-health-card="true" data-health-subject={memberId ?? undefined}>
            <UniversalCard
                title={model.title}
                insight={insightFor(vm, denied, name, Boolean(memberId), loading)}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                density="compact"
                gridSpan={expanded ? "row" : model.span}
                receded={receded}
                data-universal-card-key="health_safety"
                footerAction={null}
            >
                {!memberId ? (
                    /* No scoped participant. Health is too sensitive for a first-child fallback. */
                    <p className="alloy-os-health__empty" data-health-empty="no-participant">
                        Select a child to see their health information.
                    </p>
                ) : denied ? (
                    <p className="alloy-os-health__empty" data-health-empty="permission">
                        You do not have permission to view health information.
                    </p>
                ) : vm?.unavailableReason ? (
                    <p className="alloy-os-health__empty" data-health-empty="unavailable">
                        {vm.unavailableReason}
                    </p>
                ) : !vm ? (
                    <p className="alloy-os-health__empty" data-health-empty="loading">
                        {loading ? "Loading health information…" : "No health record."}
                    </p>
                ) : (
                    <>
                        {/* 1 · CRITICAL SAFETY — the region an operator must not miss. */}
                        {criticalCount > 0 ? (
                            <section className="alloy-os-health__critical" data-health-region="critical">
                                {vm.criticalFacts.map((f) => (
                                    <div
                                        key={f.factId}
                                        className="alloy-os-health__critical-row"
                                        data-health-fact={f.factId}
                                        data-health-severity={f.severity ?? undefined}
                                    >
                                        <span className="alloy-os-health__rail" aria-hidden="true" />
                                        <span className="alloy-os-health__critical-body">
                                            <span className="alloy-os-health__critical-head">
                                                <span className="alloy-os-health__fact-label">{f.label}</span>
                                                {f.severity ? (
                                                    <span className="alloy-os-health__severity">
                                                        {severityLabel(f.severity)}
                                                    </span>
                                                ) : null}
                                            </span>
                                            {f.effect ? (
                                                <span className="alloy-os-health__effect">{f.effect}</span>
                                            ) : null}
                                            {f.instruction ? (
                                                /* The line an operator ACTS on carries the emphasis. */
                                                <span className="alloy-os-health__instruction">
                                                    {f.instruction}
                                                </span>
                                            ) : null}
                                            {medicationsFor(vm, f.factId).map((m) => (
                                                <span
                                                    key={m.factId}
                                                    className="alloy-os-health__paired-med"
                                                    data-health-paired-medication={m.factId}
                                                >
                                                    {m.label}
                                                    {m.dosage ? ` · ${m.dosage}` : ""}
                                                    {m.asNeeded ? " · as needed" : m.frequency ? ` · ${m.frequency}` : ""}
                                                </span>
                                            ))}
                                        </span>
                                    </div>
                                ))}
                            </section>
                        ) : null}

                        {/*
                            NO STRUCTURED HEALTH FACTS IS A QUIET STATE, NOT AN ABSENT CARD.
                            Health facts and Enrollment Health requirements are different sections
                            with different owners, so an empty Health section must not suppress the
                            requirements below it — nor turn the card into a list of warnings.
                        */}
                        {vm.criticalFacts.length === 0
                        && vm.careFacts.length === 0
                        && vm.medications.length === 0
                        && vm.profileFacts.length === 0 ? (
                            <p className="alloy-os-health__empty" data-health-empty="no-facts">
                                No recorded allergies, conditions or medications.
                            </p>
                        ) : null}

                        {/* 2 · ONGOING CARE */}
                        {vm.careFacts.length > 0 || unpairedMedications(vm).length > 0 || vm.profileFacts.length > 0 ? (
                            <section className="alloy-os-health__care" data-health-region="care">
                                {vm.careFacts.map((f) => (
                                    <p key={f.factId} className="alloy-os-health__line" data-health-fact={f.factId}>
                                        <span className="alloy-os-health__fact-label">{f.label}</span>
                                        {f.instruction ?? f.effect ? (
                                            <span className="alloy-os-health__care-detail">
                                                {f.instruction ?? f.effect}
                                            </span>
                                        ) : null}
                                    </p>
                                ))}
                                {unpairedMedications(vm).map((m) => (
                                    <p key={m.factId} className="alloy-os-health__line" data-health-fact={m.factId}>
                                        <span className="alloy-os-health__fact-label">{m.label}</span>
                                        <span className="alloy-os-health__care-detail">
                                            {[m.dosage, m.asNeeded ? "as needed" : m.frequency]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </span>
                                    </p>
                                ))}
                                {vm.profileFacts.map((p) => (
                                    <p key={p.key} className="alloy-os-health__line" data-health-profile={p.key}>
                                        <span className="alloy-os-health__fact-label">{p.label}</span>
                                        <span className="alloy-os-health__care-detail">{p.value}</span>
                                    </p>
                                ))}
                            </section>
                        ) : null}

                        {/* 3 · ENROLLMENT HEALTH — requirements, evaluated from evidence. */}
                        {vm.requirements.length > 0 ? (
                            <section className="alloy-os-health__requirements" data-health-region="requirements">
                                {vm.requirements.map((r) => (
                                    <span
                                        key={r.key}
                                        className="alloy-os-health__requirement"
                                        data-health-requirement={r.key}
                                        data-health-requirement-satisfied={r.satisfied ? "true" : "false"}
                                    >
                                        {r.label}
                                        <span className="alloy-os-health__requirement-state">
                                            {r.satisfied ? "on file" : "missing"}
                                        </span>
                                    </span>
                                ))}
                            </section>
                        ) : null}

                        {/* 4 · EMERGENCY CONTEXT — projected from Relationships, never copied. */}
                        {vm.emergencyContacts.length > 0 ? (
                            <p className="alloy-os-health__contacts" data-health-region="contacts">
                                {vm.emergencyContacts.slice(0, expanded ? undefined : 2).map((c) => (
                                    <span
                                        key={c.personId}
                                        className="alloy-os-health__contact"
                                        data-health-contact={c.personId}
                                    >
                                        {c.name ?? "Contact"}
                                        {c.relationship ? ` · ${c.relationship}` : ""}
                                        {c.phone ? ` · ${c.phone}` : ""}
                                    </span>
                                ))}
                            </p>
                        ) : null}

                        {/* ── EXPANDED DETAIL: documents and provenance, on request ── */}
                        {expanded ? (
                            <section className="alloy-os-health__detail" data-health-region="detail">
                                {vm.documents.length > 0 ? (
                                    <div data-health-documents="true">
                                        {vm.documents.map((d) => (
                                            <p
                                                key={d.documentId}
                                                className="alloy-os-health__line"
                                                data-health-document={d.documentId}
                                            >
                                                <span className="alloy-os-health__fact-label">
                                                    {d.title ?? d.docType ?? "Document"}
                                                </span>
                                                <span className="alloy-os-health__care-detail">
                                                    {d.status ?? "—"}
                                                </span>
                                            </p>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="alloy-os-health__empty">No health documents on file.</p>
                                )}
                                {/* Provenance — who asserted each fact. The question an operator asks
                                    when a health fact surprises them. */}
                                <div data-health-provenance="true">
                                    {[...vm.criticalFacts, ...vm.careFacts, ...vm.medications].map((f) => (
                                        <p key={f.factId} className="alloy-os-health__provenance">
                                            <span className="alloy-os-health__fact-label">{f.label}</span>
                                            <span className="alloy-os-health__care-detail">
                                                {provenanceLabel(f.provenance.sourceKind)}
                                                {f.effectiveFrom ? ` · since ${f.effectiveFrom}` : ""}
                                            </span>
                                        </p>
                                    ))}
                                </div>
                                {vm.gaps.map((g) => (
                                    <p
                                        key={g.concept}
                                        className="alloy-os-health__empty"
                                        data-health-gap={g.concept}
                                    >
                                        {g.reason}
                                    </p>
                                ))}
                            </section>
                        ) : null}

                        <button
                            type="button"
                            className="alloy-os-health__details"
                            data-health-details="true"
                            onClick={() => {
                                setExpanded((v) => !v);
                                coordination?.reportPerspective?.("health_safety", expanded ? "base" : "focused");
                            }}
                        >
                            {expanded ? "← Less" : "Details →"}
                        </button>
                    </>
                )}
            </UniversalCard>
        </div>
    );
}

/** Medications that treat a specific fact — shown beside what they serve, not in a separate silo. */
function medicationsFor(vm: HealthSafetyCardVM, factId: string) {
    return vm.medications.filter((m) => m.relatedFactId === factId);
}

/** Medications that stand alone, so nothing is hidden by the pairing above. */
function unpairedMedications(vm: HealthSafetyCardVM) {
    const paired = new Set(
        vm.medications.filter((m) => m.relatedFactId && vm.criticalFacts.some((f) => f.factId === m.relatedFactId)),
    );
    return vm.medications.filter((m) => !paired.has(m));
}

function severityLabel(s: string): string {
    switch (s) {
        case "life_threatening":
            return "Life-threatening";
        case "severe":
            return "Severe";
        case "moderate":
            return "Moderate";
        case "mild":
            return "Mild";
        default:
            return s;
    }
}

function provenanceLabel(sourceKind: string): string {
    switch (sourceKind) {
        case "form_submission":
            return "From an enrollment form";
        case "document_extraction":
            return "From a document";
        case "operator":
            return "Recorded by staff";
        case "import":
            return "Imported";
        default:
            return sourceKind;
    }
}

function insightFor(
    vm: HealthSafetyCardVM | null,
    denied: boolean,
    name: string | null,
    hasSubject: boolean,
    loading: boolean,
): string {
    if (!hasSubject || denied) return "";
    if (loading && !vm) return "";
    if (!vm || vm.unavailableReason) return "";
    const critical = vm.criticalFacts.length;
    if (critical > 0) {
        const top = vm.criticalFacts[0]!;
        return `${name ? `${name} · ` : ""}${top.label}${top.severity ? ` · ${severityLabel(top.severity)}` : ""}`;
    }
    /*
     * ABSENCE IS NOT THE CARD'S IDENTITY.
     *
     * This used to read "Lennon Kurzman · No recorded health facts", which announced the emptiness as
     * the headline. The card already exists in the child's context; the child's name is the answer,
     * and the quiet empty state inside the Health section says the rest. Where there IS ongoing care
     * to summarise, it is summarised.
     */
    const total = vm.careFacts.length + vm.medications.length + vm.profileFacts.length;
    if (!name) return "";
    return total === 0 ? name : `${name} · ${total} care note${total === 1 ? "" : "s"}`;
}
