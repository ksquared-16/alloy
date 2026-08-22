"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { LabAbsent, LabFooter, LabGroup, LabHandoff, LabRow } from "@/components/cardLab/CardLabPrimitives";
import type { HealthSafetyCardEvidence } from "@/lib/cardLab/healthSafetyCardEvidence";

/**
 * Health & Safety card — configured projection over child field values, documents, requirements
 * and emergency contacts. Owns no medical truth and edits nothing in place.
 *
 * Design rules made visible here:
 *   - safety-critical prominence is CONFIGURED on the field, never inferred from the value
 *   - an unset field renders as nothing; it NEVER renders as "No known allergies"
 *   - an unresolved requirement is HELD, never counted toward "needs attention"
 *   - document expiry is absent everywhere (GAP-1) and is shown as such
 */
export default function HealthSafetyCard({
    evidence,
    expanded = false,
}: {
    evidence: HealthSafetyCardEvidence;
    expanded?: boolean;
}) {
    if (evidence.resolution === "unresolved") {
        return (
            <UniversalCard title="Health & Safety" insight="" tier="attention" archetype="status" iconName="shield" density="compact">
                <LabAbsent kind="unresolved">
                    The child field projection has not answered. The card HOLDS. On a safety surface this
                    matters most: a fabricated &ldquo;2 need attention&rdquo; would be a safety claim built on
                    unwired plumbing.
                </LabAbsent>
            </UniversalCard>
        );
    }

    return (
        <UniversalCard
            title="Health & Safety"
            insight={evidence.answerLine}
            supportingInsight={evidence.supportingLine}
            tier={evidence.criticalFacts.length > 0 || evidence.attentionCount > 0 ? "attention" : "context"}
            archetype="status"
            iconName="shield"
            statusChip={evidence.statusChip}
            statusTone={evidence.statusTone}
            density={expanded ? "expanded" : "compact"}
            data-universal-card-key="health_safety"
            footerAction={
                <LabFooter>
                    <LabHandoff label="View details" to="health_safety (expanded)" />
                    <LabHandoff label="Edit" to="customer-members PATCH (field owner)" />
                </LabFooter>
            }
        >
            {evidence.criticalFacts.length > 0 ? (
                <LabGroup title="Important">
                    {evidence.criticalFacts.map((f) => (
                        <LabRow key={f.fieldKey} name={f.value} detail={f.label} tone="critical" />
                    ))}
                </LabGroup>
            ) : null}

            {evidence.healthFacts.length > 0 ? (
                <LabGroup title="Health">
                    {(expanded ? evidence.healthFacts : evidence.healthFacts.slice(0, 3)).map((f) => (
                        <LabRow key={f.fieldKey} name={f.label} detail={f.value} />
                    ))}
                    {!expanded && evidence.healthFacts.length > 3 ? (
                        <span className="alloy-os-household__overflow">+{evidence.healthFacts.length - 3} more</span>
                    ) : null}
                </LabGroup>
            ) : null}

            {evidence.requirements.length > 0 ? (
                <LabGroup title="Requirements" count={evidence.attentionCount || null}>
                    {evidence.requirements.map((r) => (
                        <LabRow
                            key={r.key}
                            name={
                                <>
                                    <span
                                        aria-hidden
                                        style={{
                                            marginRight: 6,
                                            color: !r.resolved ? "#94a3b8" : r.met ? "#16a34a" : "#dc2626",
                                            fontWeight: 700,
                                        }}
                                    >
                                        {!r.resolved ? "·" : r.met ? "✓" : "○"}
                                    </span>
                                    {r.label}
                                </>
                            }
                            detail={r.detail}
                            status={!r.resolved ? "held" : undefined}
                            tone={!r.resolved ? "muted" : "neutral"}
                        />
                    ))}
                    {evidence.unresolvedCount > 0 ? (
                        <LabAbsent kind="held">
                            {evidence.unresolvedCount} requirement
                            {evidence.unresolvedCount === 1 ? " is" : "s are"} unresolved — no authoritative
                            source has answered. Not counted as missing, and no blocked verdict.
                        </LabAbsent>
                    ) : null}
                </LabGroup>
            ) : null}

            {expanded && evidence.documents.length > 0 ? (
                <LabGroup title="Documents">
                    {evidence.documents.map((d) => (
                        <LabRow
                            key={d.docTypeKey}
                            name={d.label}
                            status={d.onFile ? "On file" : "Missing"}
                            tone={d.onFile ? "neutral" : "muted"}
                        />
                    ))}
                    <LabAbsent kind="absent">
                        Expiration is not rendered for any document: neither <code>documents</code> nor{" "}
                        <code>document_versions</code> carries an expiry column anywhere in the schema (GAP-1).
                    </LabAbsent>
                </LabGroup>
            ) : null}

            {evidence.hasEmergencyContact ? (
                <LabGroup title="Emergency">
                    <LabRow
                        name={`${evidence.emergencyContactCount} contact${evidence.emergencyContactCount === 1 ? "" : "s"} on file`}
                        detail="person_child_relationships"
                    />
                </LabGroup>
            ) : null}

            {expanded ? (
                <LabAbsent kind="absent">
                    &ldquo;Emergency plan on file&rdquo; has no entity in Alloy. Severity is not inferred from
                    free-text allergy values — prominence is a configured property of the field.
                </LabAbsent>
            ) : null}
        </UniversalCard>
    );
}
