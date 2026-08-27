"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { CardBody, EmptyLine, FooterAction, SectionHead } from "@/components/cardLab/CardLabKit";
import type { HealthEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Health & Safety — read in the order an operator actually needs it:
 *
 *   1  CRITICAL      is there anything I must know to care for this child safely?
 *   2  HEALTH        what ongoing needs affect their care, and what do I give for each?
 *   3  ENROLLMENT    is the required documentation complete?
 *   4  emergency     who do I call — projected from Household, never stored here
 *   5  detail        where the complete health record lives
 *
 * Two structural decisions carry the hierarchy:
 *
 * **Critical is a contained region with a RESTRAINED risk treatment.** A narrow risk rail, a small
 * labelled heading with a risk glyph, and otherwise a normal card surface in ordinary card ink.
 * Red is spent on exactly two things: the severity, and what staff actually do. The card carries
 * DURABLE safety information, not an active incident — a red wash would make a calm operational
 * health profile read as an emergency surface. Multiple critical items stack INSIDE the one
 * region, so two facts never become two alerts. With none, the region does not render, and
 * nothing says "No alerts". Reserve stronger alarm for an active condition, if Alloy ever
 * distinguishes one.
 *
 * **Medication nests under the need it supports.** An operator understands "asthma, and here is
 * the inhaler for it", not "conditions" and "medications" as two lists to cross-reference.
 * Canonical ownership stays separate underneath; this is presentation. A medication with no
 * associated need still appears on its own.
 *
 * The card is a safety and care snapshot, NOT the medical chart — the complete record is behind
 * View health details.
 *
 * @see docs/platform/operator/child-health-information-architecture.md
 */
export default function HealthSafetyCard({
    evidence,
    onViewDetails,
}: {
    evidence: HealthEvidence;
    onViewDetails?: () => void;
}) {
    const hasCritical = evidence.critical.length > 0;
    const isEmpty =
        !hasCritical &&
        evidence.needs.length === 0 &&
        evidence.unattachedMedications.length === 0 &&
        evidence.requirements.length === 0;

    return (
        <div className="alloy-os-health" data-health-card="true">
            <UniversalCard
                title="Health & Safety"
                // The header names the card and nothing else. A summary here repeated either the
                // critical region or the HEALTH section immediately below it.
                insight={isEmpty ? "No health information recorded" : ""}
                iconName="HeartPulse"
                tier="context"
                archetype="status"
                density="compact"
                gridSpan={1}
                data-universal-card-key="health_safety"
                footerAction={
                    <div className="alloy-os-health__footer">
                        {evidence.emergencyPrimary && !isEmpty ? (
                            <span className="alloy-os-health__emergency">
                                {evidence.emergencyCount} emergency contacts ·{" "}
                                <strong>{evidence.emergencyPrimary}</strong> first
                            </span>
                        ) : (
                            <span />
                        )}
                        <FooterAction onClick={onViewDetails}>
                            {isEmpty ? "Add health information →" : "View health details →"}
                        </FooterAction>
                    </div>
                }
            >
                {isEmpty ? (
                    <CardBody>
                        <EmptyLine>Nothing has been recorded for this child yet.</EmptyLine>
                    </CardBody>
                ) : (
                    <CardBody>
                        {hasCritical ? (
                            <section className="alloy-os-health__critical" data-health-critical>
                                <p className="alloy-os-health__critical-label">
                                    <svg
                                        className="alloy-os-health__critical-icon"
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d="M8 1.8 15 14.2H1L8 1.8Z"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinejoin="round"
                                        />
                                        <path d="M8 6.3v3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        <circle cx="8" cy="11.6" r="0.85" fill="currentColor" />
                                    </svg>
                                    Critical
                                </p>
                                {evidence.critical.map((c) => (
                                    <div key={c.name} className="alloy-os-health__critical-item">
                                        <p className="alloy-os-health__critical-name">
                                            {c.name}
                                            <span className="alloy-os-health__severity">{c.severity}</span>
                                        </p>
                                        {c.reaction ? (
                                            <p className="alloy-os-health__critical-line">{c.reaction}</p>
                                        ) : null}
                                        {c.response ? (
                                            <p className="alloy-os-health__critical-line alloy-os-health__critical-line--do">
                                                {c.response}
                                            </p>
                                        ) : null}
                                    </div>
                                ))}
                            </section>
                        ) : null}

                        {evidence.needs.length || evidence.unattachedMedications.length ? (
                            <>
                                <SectionHead ruled={false}>Health</SectionHead>
                                {evidence.needs.map((n) =>
                                    n.medications.length ? (
                                        <div key={n.name} className="alloy-os-health__need">
                                            <p className="alloy-os-health__need-name">{n.name}</p>
                                            {n.detail ? (
                                                <p className="alloy-os-health__need-detail">{n.detail}</p>
                                            ) : null}
                                            {n.medications.map((m) => (
                                                <p key={m.name} className="alloy-os-health__med">
                                                    <span className="alloy-os-health__med-name">{m.name}</span>
                                                    {m.detail ? ` · ${m.detail}` : null}
                                                </p>
                                            ))}
                                        </div>
                                    ) : (
                                        <p key={n.name} className="alloy-os-health__need-inline">
                                            <span className="alloy-os-health__need-name">{n.name}</span>
                                            {n.detail ? (
                                                <span className="alloy-os-health__need-detail">{n.detail}</span>
                                            ) : null}
                                        </p>
                                    ),
                                )}
                                {/* A medication with no associated need is a care item in its own
                                    right, so it reads as one — not as something nested under the
                                    need that happens to precede it. */}
                                {evidence.unattachedMedications.map((m) => (
                                    <p key={m.name} className="alloy-os-health__need-inline">
                                        <span className="alloy-os-health__need-name">{m.name}</span>
                                        {m.detail ? (
                                            <span className="alloy-os-health__need-detail">{m.detail}</span>
                                        ) : null}
                                    </p>
                                ))}
                            </>
                        ) : null}

                        {evidence.requirements.length ? (
                            <>
                                {/* NOT "Enrollment health". The card is Health & Safety and is not owned by any one
                                    business process; naming a section after Enrollment encoded one
                                    process's vocabulary into a cross-process card. The requirements
                                    themselves stay Business Process-owned — Health only projects the
                                    evidence state where it is operationally useful. */}
                                <SectionHead ruled={false}>Required information</SectionHead>
                                <div className="alloy-os-health__reqs">
                                    {evidence.requirements.map((r) => (
                                        <p key={r.name} className="alloy-os-health__req">
                                            <span className="alloy-os-health__req-name">{r.name}</span>
                                            <span
                                                className={
                                                    r.missing
                                                        ? "alloy-os-health__req-value alloy-os-health__req-value--missing"
                                                        : "alloy-os-health__req-value"
                                                }
                                            >
                                                {r.value}
                                            </span>
                                        </p>
                                    ))}
                                </div>
                            </>
                        ) : null}
                    </CardBody>
                )}
            </UniversalCard>
        </div>
    );
}
