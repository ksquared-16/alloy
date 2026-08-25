"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import {
    CardBody,
    Fact,
    FactGrid,
    FooterAction,
    SectionHead,
    StatChips,
} from "@/components/cardLab/CardLabKit";
import type { StaffEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Staff — "Who is this employee, what is their role, where are they assigned, and what matters
 * operationally right now?"
 *
 * EMPLOYEE-grain: the subject is the staff person. Its child-grain relative is Care Team, which
 * projects the people around a child; the two answer different questions and are not variants.
 *
 * Visually it is a direct sibling of Household and Children — the identity block leads with the
 * avatar and the name, sections are label-over-value fact grids, and the only decoration is the
 * state pill. The Employment section carries `PersonEmploymentComposition.current` verbatim, in
 * the order the existing Employment card already uses: headline, then current period, then the
 * configured facts.
 *
 * It renders NO qualifications or credentials. No store for them exists in Alloy, and inventing
 * them to enrich a specimen is the failure this card is written to avoid.
 */
export default function StaffCard({
    evidence,
    onView,
}: {
    evidence: StaffEvidence;
    onView?: () => void;
}) {
    return (
        <div className="alloy-os-staff" data-staff-card="true">
            <UniversalCard
                title="Staff"
                insight={evidence.name}
                supportingInsight={evidence.answerLine}
                iconName="Users"
                tier="reference"
                archetype="profile"
                statusChip={evidence.stateLabel}
                statusTone={evidence.stateTone}
                density="compact"
                gridSpan={1}
                data-universal-card-key="staff"
                footerAction={<FooterAction onClick={onView}>View staff →</FooterAction>}
            >
                <CardBody>
                    {/* Identity block — the Household person row, at the top, as the subject. */}
                    <div className="alloy-os-household__row alloy-os-cardlab__person">
                        <CardAvatar name={evidence.name} size={40} role="contact" />
                        <div className="alloy-os-household__row-main">
                            {evidence.presenceLine ? (
                                <span className="alloy-os-staff__presence">{evidence.presenceLine}</span>
                            ) : (
                                <span className="alloy-os-staff__presence alloy-os-staff__presence--off">
                                    Not on site today
                                </span>
                            )}
                            <span className="alloy-os-household__row-detail">
                                {[evidence.contact.email, evidence.contact.phone].filter(Boolean).join(" · ")}
                            </span>
                        </div>
                    </div>

                    <SectionHead ruled={false}>Today</SectionHead>
                    <FactGrid>
                        {evidence.today.map((f) => (
                            <Fact key={f.label} label={f.label} value={f.value} />
                        ))}
                    </FactGrid>

                    <SectionHead ruled={false}>Employment</SectionHead>
                    <FactGrid>
                        {evidence.employment.map((f) => (
                            <Fact key={f.label} label={f.label} value={f.value} />
                        ))}
                    </FactGrid>

                    <SectionHead ruled={false}>Assignments</SectionHead>
                    <StatChips
                        items={evidence.assignments.map((a) => ({ count: a.room, label: a.when }))}
                    />
                </CardBody>
            </UniversalCard>
        </div>
    );
}
