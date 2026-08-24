"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    CardBody,
    EmptyLine,
    FactRow,
    FooterAction,
    SectionHead,
    StatChips,
} from "@/components/cardLab/CardLabKit";
import type { HealthEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Health & Safety — "What do I need to know about this child's health and safety?"
 *
 * An information card, not an evaluation. It shows the facts; it does not report Alloy's opinion
 * of the facts. A severe allergy is prominent because the fact itself is rendered in the family's
 * risk red, not because a banner announces a count. A missing required document is amber inside
 * its own section, which keeps enrollment-blocking gaps visible without duplicating Readiness.
 *
 * Emergency contacts are Household's truth, so this card shows a count chip and hands off.
 */
export default function HealthSafetyCard({
    evidence,
    onEdit,
}: {
    evidence: HealthEvidence;
    onEdit?: () => void;
}) {
    const isEmpty =
        evidence.allergies.length === 0 &&
        evidence.medical.length === 0 &&
        evidence.medications.length === 0 &&
        evidence.dietary.length === 0 &&
        evidence.requirements.length === 0;

    return (
        <div className="alloy-os-health" data-health-card="true">
            <UniversalCard
                title="Health & Safety"
                insight={isEmpty ? "No health information recorded" : evidence.answerLine}
                supportingInsight={isEmpty ? null : evidence.supportingLine}
                iconName="HeartPulse"
                tier="context"
                archetype="status"
                statusChip={evidence.statusChip ?? undefined}
                statusTone="at-risk"
                density="compact"
                gridSpan={1}
                data-universal-card-key="health_safety"
                footerAction={
                    <FooterAction onClick={onEdit}>
                        {isEmpty ? "Add health information →" : "Edit"}
                    </FooterAction>
                }
            >
                {isEmpty ? (
                    <CardBody>
                        <EmptyLine>Nothing has been recorded for this child yet.</EmptyLine>
                    </CardBody>
                ) : (
                    <CardBody>
                        {evidence.allergies.length ? (
                            <>
                                <SectionHead ruled={false}>Allergies</SectionHead>
                                {evidence.allergies.map((a) => (
                                    <FactRow key={a.name} name={a.name} detail={a.detail} severe={a.severe} />
                                ))}
                            </>
                        ) : null}

                        {evidence.medical.length || evidence.medications.length ? (
                            <>
                                <SectionHead ruled={false}>Medical</SectionHead>
                                {evidence.medical.map((m) => (
                                    <FactRow key={m.name} name={m.name} detail={m.detail} />
                                ))}
                                {evidence.medications.map((m) => (
                                    <FactRow key={m.name} name={m.name} detail={m.detail} />
                                ))}
                            </>
                        ) : null}

                        {evidence.dietary.length ? (
                            <>
                                <SectionHead ruled={false}>Dietary</SectionHead>
                                {evidence.dietary.map((d) => (
                                    <FactRow key={d.name} name={d.name} detail={d.detail} />
                                ))}
                            </>
                        ) : null}

                        {evidence.requirements.length ? (
                            <>
                                <SectionHead ruled={false}>Required information</SectionHead>
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

                        <SectionHead ruled={false}>Emergency</SectionHead>
                        {evidence.emergencyPrimary ? (
                            <FactRow name={evidence.emergencyPrimary} detail={evidence.emergencyDetail} />
                        ) : null}
                        <StatChips
                            items={[{ count: String(evidence.emergencyCount), label: "Emergency contacts" }]}
                        />
                    </CardBody>
                )}
            </UniversalCard>
        </div>
    );
}
