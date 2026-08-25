"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    CardBody,
    EmptyLine,
    FactRow,
    FooterAction,
    SectionHead,
} from "@/components/cardLab/CardLabKit";
import type { HealthEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Health & Safety — "What health and safety information do I need to know about this child?"
 *
 * Grouped by how the information is OWNED, not by how it was collected:
 *
 *   critical    → the insight and supporting line. The one fact an adult must know before
 *                 touching the child leads the card, so it needs no section and no banner.
 *   MEDICAL     → conditions and restrictions.
 *   MEDICATIONS → what is administered and where it is kept.
 *   ENROLLMENT  → Business Process requirement satisfaction, not health facts. Missing reads
 *                 amber inside its own section, so a blocking gap is visible without the card
 *                 becoming a second Readiness.
 *   emergency   → relationship truth, PROJECTED. Household owns it; this card points at it.
 *
 * @see docs/platform/operator/child-health-information-architecture.md
 */
export default function HealthSafetyCard({
    evidence,
    onViewDetails,
    onEdit,
}: {
    evidence: HealthEvidence;
    onViewDetails?: () => void;
    onEdit?: () => void;
}) {
    const isEmpty =
        !evidence.criticalLine &&
        evidence.medical.length === 0 &&
        evidence.medications.length === 0 &&
        evidence.requirements.length === 0;

    return (
        <div className="alloy-os-health" data-health-card="true">
            <UniversalCard
                title="Health & Safety"
                insight={isEmpty ? "No health information recorded" : (evidence.criticalLine ?? "No critical alerts")}
                supportingInsight={isEmpty ? null : evidence.criticalDetail}
                iconName="HeartPulse"
                tier="context"
                archetype="status"
                density="compact"
                gridSpan={1}
                data-universal-card-key="health_safety"
                className={evidence.criticalLine ? "alloy-os-health--critical" : undefined}
                footerAction={
                    isEmpty ? (
                        <FooterAction onClick={onEdit}>Add health information →</FooterAction>
                    ) : (
                        <FooterAction onClick={onViewDetails}>View health details →</FooterAction>
                    )
                }
            >
                {isEmpty ? (
                    <CardBody>
                        <EmptyLine>Nothing has been recorded for this child yet.</EmptyLine>
                    </CardBody>
                ) : (
                    <CardBody>
                        {evidence.medical.length ? (
                            <>
                                <SectionHead ruled={false}>Medical</SectionHead>
                                {evidence.medical.map((m) => (
                                    <FactRow key={m.name} name={m.name} detail={m.detail} />
                                ))}
                            </>
                        ) : null}

                        {evidence.medications.length ? (
                            <>
                                <SectionHead ruled={false}>Medications</SectionHead>
                                {evidence.medications.map((m) => (
                                    <FactRow key={m.name} name={m.name} detail={m.detail} />
                                ))}
                            </>
                        ) : null}

                        {evidence.requirements.length ? (
                            <>
                                <SectionHead ruled={false}>Enrollment health</SectionHead>
                                {evidence.requirements.map((r) => (
                                    <FactRow
                                        key={r.name}
                                        name={r.name}
                                        value={r.value}
                                        valueTone={r.missing ? "missing" : "neutral"}
                                    />
                                ))}
                            </>
                        ) : null}

                        {evidence.emergencyPrimary ? (
                            <p className="alloy-os-health__emergency">
                                <strong>{evidence.emergencyCount} emergency contacts</strong> ·{" "}
                                {evidence.emergencyPrimary} first
                            </p>
                        ) : null}
                    </CardBody>
                )}
            </UniversalCard>
        </div>
    );
}
