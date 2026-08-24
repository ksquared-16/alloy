"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    CardBody,
    EmptyLine,
    Fact,
    FactGrid,
    FooterAction,
    PersonRow,
    StatChips,
} from "@/components/cardLab/CardLabKit";
import type { StaffEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Staff — "Who is caring for, or operationally responsible for, this child right now?"
 *
 * The closest relative of Household and Children in this set, and deliberately so: open person
 * rows with the same avatar, the same name weight, the same role pill in the Primary / Guardian
 * slot, and the same two-column label-over-value pair beneath. No enclosure, no dividers, no
 * category headings — why a person is relevant is carried by the pill plus the room line.
 *
 * Scope is the child's current site → program → room → date. A configured non-room relationship
 * (the enrollment owner) is one more row with its own pill, never a second section, so the card
 * cannot drift into an organization directory.
 */
export default function StaffCard({
    evidence,
    onManage,
}: {
    evidence: StaffEvidence;
    onManage?: () => void;
}) {
    const isEmpty = evidence.people.length === 0;

    return (
        <div className="alloy-os-staff" data-staff-card="true">
            <UniversalCard
                title="Staff"
                insight={isEmpty ? "No staff assigned" : evidence.answerLine}
                supportingInsight={isEmpty ? null : evidence.supportingLine}
                iconName="Users"
                tier="reference"
                archetype="collection"
                density="compact"
                gridSpan={1}
                data-universal-card-key="staff"
                footerAction={<FooterAction onClick={onManage}>Manage staff →</FooterAction>}
            >
                {isEmpty ? (
                    <CardBody>
                        <EmptyLine>No one is assigned to this child&apos;s room today.</EmptyLine>
                    </CardBody>
                ) : (
                    <CardBody>
                        {evidence.people.map((p) => (
                            <PersonRow
                                key={p.id}
                                name={p.name}
                                pill={p.relationship}
                                pillTone={p.lead ? "positive" : "neutral"}
                                secondary={
                                    <FactGrid>
                                        {p.facts.map((fct) => (
                                            <Fact key={fct.label} label={fct.label} value={fct.value} />
                                        ))}
                                    </FactGrid>
                                }
                            />
                        ))}
                        {evidence.othersCount ? (
                            <StatChips
                                items={[{ count: String(evidence.othersCount), label: evidence.othersLabel }]}
                            />
                        ) : null}
                    </CardBody>
                )}
            </UniversalCard>
        </div>
    );
}
