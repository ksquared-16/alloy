"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { LabAbsent, LabFooter, LabGroup, LabHandoff, LabRow } from "@/components/cardLab/CardLabPrimitives";
import type { StaffCardEvidence } from "@/lib/cardLab/staffCardEvidence";

/**
 * Staff card — a relationship card in presentation, a composed projection in derivation.
 *
 * There is no stored child↔staff edge and there must not be one; relevance is derived from
 * effective `schedule_assignments` (child room ∩ staff room ∩ date) and the covering employment.
 * The card reads assignments and hands off to `scheduling`; it never edits one.
 */
export default function StaffCard({
    evidence,
    expanded = false,
}: {
    evidence: StaffCardEvidence;
    expanded?: boolean;
}) {
    if (evidence.resolution === "unresolved") {
        return (
            <UniversalCard title="Staff" insight="" tier="context" archetype="collection" iconName="users" density="compact">
                <LabAbsent kind="unresolved">
                    The assignment projection has not answered. The card HOLDS — printing &ldquo;No staff
                    assigned&rdquo; here would raise an operational alarm out of a loading state.
                </LabAbsent>
            </UniversalCard>
        );
    }

    return (
        <UniversalCard
            title="Staff"
            insight={evidence.answerLine}
            supportingInsight={evidence.supportingLine}
            tier="context"
            archetype="collection"
            iconName="users"
            statusChip={evidence.statusChip}
            statusTone={evidence.statusTone}
            density={expanded ? "expanded" : "compact"}
            data-universal-card-key="staff"
            footerAction={
                <LabFooter>
                    <LabHandoff label="View staff" to="staff (expanded)" />
                    <LabHandoff label="Change assignment" to={evidence.assignmentHandoff ?? "scheduling"} />
                </LabFooter>
            }
        >
            {evidence.totalCount === 0 ? (
                <p className="alloy-os-household__row-detail">
                    Nobody covers this subject&rsquo;s room on this date.
                </p>
            ) : (
                evidence.groups.map((group) => (
                    <LabGroup key={group.key} title={group.label} count={group.people.length > 1 ? group.people.length : null}>
                        {(expanded ? group.people : group.people.slice(0, 2)).map((p) => (
                            <LabRow
                                key={p.personId}
                                name={p.name}
                                detail={[p.positionLabel, p.roomLabel].filter(Boolean).join(" · ") || null}
                                status={expanded ? (p.assignmentTypeLabel ?? undefined) : undefined}
                            />
                        ))}
                        {!expanded && group.people.length > 2 ? (
                            <span className="alloy-os-household__overflow">+{group.people.length - 2} more</span>
                        ) : null}
                    </LabGroup>
                ))
            )}

            {expanded ? (
                <LabAbsent kind="held">
                    Position labels come from <code>employment_positions</code> and role labels from{" "}
                    <code>operational_assignment_types</code> — both configuration-owned tenant words, never a
                    platform enum. Staff presence today is a handoff to Attendance, not a fact of this card.
                </LabAbsent>
            ) : null}
        </UniversalCard>
    );
}
