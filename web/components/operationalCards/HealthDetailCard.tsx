"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { Action, ActionRow, SectionHead } from "@/components/cardLab/CardLabKit";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import type { HealthDetailEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Health detail — what "View health details →" opens.
 *
 * The child's canonical health record and operational safety surface. It is the SAME card at
 * `density="expanded"` — the centered Focus Card with a depth scrim that Household and Children
 * already use — not a separate health product.
 *
 * ── WHAT IT IS NOT ──
 *
 * Not a giant editable form. Nothing here is a live input. The operator reads, then chooses
 * Add or Edit, which opens a focused command against the canonical mutation path:
 * understand → choose → focused command → validate → save.
 *
 * ── THREE BOUNDARIES THE LAYOUT ENFORCES ──
 *
 *  1. **Medication authorization is a REQUIREMENT, not a medication field.** It appears on the
 *     medication record as a pointer, and its truth lives in the Requirements section, resolved
 *     against a document. The medication fact stays true whether or not the authorization exists.
 *  2. **Document existence is never a health boolean.** The Documents section shows the document,
 *     its version and its status; the Requirements section resolves against it.
 *  3. **Emergency contacts are relationship truth**, projected from
 *     `person.contact_role.emergency_contacts`. Health never owns a contact.
 *
 * Provenance reuses the existing lineage the platform already records — parent reported, document
 * extraction, operator confirmed — rather than introducing a health audit system.
 */
export default function HealthDetailCard({ evidence }: { evidence: HealthDetailEvidence }) {
    return (
        <div className="alloy-os-health alloy-os-health--detail" data-health-detail="true">
            <UniversalCard
                title="Health & Safety"
                insight={evidence.childLabel}
                supportingInsight={evidence.lastUpdated}
                iconName="HeartPulse"
                tier="context"
                archetype="profile"
                density="expanded"
                gridSpan="row"
                data-universal-card-key="health_detail"
            >
                <div className="alloy-os-healthdetail">
                    {/* ── A · Critical safety ─────────────────────────────────── */}
                    <section className="alloy-os-healthdetail__full">
                        <div className="alloy-os-health__critical">
                            <p className="alloy-os-health__critical-label">Critical safety</p>
                            {evidence.critical.map((c) => (
                                <div key={c.name} className="alloy-os-health__critical-item">
                                    <p className="alloy-os-health__critical-name">
                                        {c.name}
                                        <span className="alloy-os-health__severity">{c.severity}</span>
                                    </p>
                                    {c.reaction ? <p className="alloy-os-health__critical-line">{c.reaction}</p> : null}
                                    {c.response ? (
                                        <p className="alloy-os-health__critical-line alloy-os-health__critical-line--do">
                                            {c.response}
                                        </p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="alloy-os-healthdetail__cols">
                        <section className="alloy-os-healthdetail__col">
                            {/* ── B · Allergies ──────────────────────────────── */}
                            <SectionHead ruled={false}>Allergies</SectionHead>
                            {evidence.allergies.map((a) => (
                                <article key={a.allergen} className="alloy-os-healthdetail__record">
                                    <p className="alloy-os-healthdetail__record-name">
                                        {a.allergen}
                                        <span className="alloy-os-health__severity">{a.severity}</span>
                                    </p>
                                    <Fact label="Reaction" value={a.reaction} />
                                    <Fact label="Care" value={a.careInstruction} />
                                    {a.treatment ? <Fact label="Treatment" value={a.treatment} /> : null}
                                    {a.emergencyMedication ? (
                                        <Fact label="Emergency medication" value={a.emergencyMedication} />
                                    ) : null}
                                    <Prov effective={a.effective} p={a.provenance} />
                                </article>
                            ))}
                            <ActionRow>
                                <Action>Add allergy</Action>
                            </ActionRow>

                            {/* ── C · Conditions ─────────────────────────────── */}
                            <SectionHead>Conditions</SectionHead>
                            {evidence.conditions.map((c) => (
                                <article key={c.condition} className="alloy-os-healthdetail__record">
                                    <p className="alloy-os-healthdetail__record-name">{c.condition}</p>
                                    {c.symptoms ? <Fact label="Presentation" value={c.symptoms} /> : null}
                                    <Fact label="Care" value={c.careInstruction} />
                                    {c.restrictions ? <Fact label="Restrictions" value={c.restrictions} /> : null}
                                    {c.relatedMedications.length ? (
                                        <Fact label="Medications" value={c.relatedMedications.join(" · ")} />
                                    ) : null}
                                    <Prov effective={c.effective} p={c.provenance} />
                                </article>
                            ))}
                            <ActionRow>
                                <Action>Add condition</Action>
                            </ActionRow>

                            {/* ── E · Profile facts ──────────────────────────── */}
                            <SectionHead>Dietary &amp; accommodations</SectionHead>
                            {evidence.profile.map((p) => (
                                <Fact key={p.label} label={p.label} value={p.value} />
                            ))}
                            <ActionRow>
                                <Action>Edit health profile</Action>
                            </ActionRow>
                        </section>

                        <section className="alloy-os-healthdetail__col">
                            {/* ── D · Medications ────────────────────────────── */}
                            <SectionHead ruled={false}>Medications</SectionHead>
                            {evidence.medications.map((m) => (
                                <article key={m.medication} className="alloy-os-healthdetail__record">
                                    <p className="alloy-os-healthdetail__record-name">
                                        {m.medication}
                                        {m.relatedTo ? (
                                            <span className="alloy-os-healthdetail__link">for {m.relatedTo}</span>
                                        ) : null}
                                    </p>
                                    <Fact label="Dose" value={`${m.dosage} · ${m.frequency}`} />
                                    <Fact label="Administration" value={m.administration} />
                                    <Fact label="Storage" value={m.storage} />
                                    {m.expires ? <Fact label="Expires" value={m.expires} /> : null}
                                    <p
                                        className={clsx(
                                            "alloy-os-healthdetail__auth",
                                            !m.authorization.satisfied && "alloy-os-healthdetail__auth--missing",
                                        )}
                                    >
                                        {m.authorization.label}
                                        <span className="alloy-os-healthdetail__auth-note">requirement, not a field</span>
                                    </p>
                                    <Prov effective={""} p={m.provenance} />
                                </article>
                            ))}
                            <ActionRow>
                                <Action>Add medication</Action>
                            </ActionRow>

                            {/* ── F · Documents ──────────────────────────────── */}
                            <SectionHead>Health documents</SectionHead>
                            <div className="alloy-os-healthdetail__table" role="table">
                                <div className="alloy-os-healthdetail__docrow alloy-os-healthdetail__docrow--head">
                                    <span>Document</span>
                                    <span>Received</span>
                                    <span>Expires</span>
                                    <span>Status</span>
                                </div>
                                {evidence.documents.map((d) => (
                                    <div key={d.docType} className="alloy-os-healthdetail__docrow">
                                        <span className="alloy-os-healthdetail__docname">
                                            {d.docType}
                                            {d.version !== "—" ? (
                                                <span className="alloy-os-healthdetail__ver">{d.version}</span>
                                            ) : null}
                                        </span>
                                        <span>{d.received}</span>
                                        <span>{d.expires ?? "—"}</span>
                                        <span
                                            className={clsx(
                                                d.status === "Not received" && "alloy-os-health__req-value--missing",
                                            )}
                                        >
                                            {d.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <ActionRow>
                                <Action>Upload document</Action>
                            </ActionRow>
                        </section>

                        <section className="alloy-os-healthdetail__col">
                            {/* ── G · Requirements ───────────────────────────── */}
                            <SectionHead ruled={false}>Required information</SectionHead>
                            {evidence.requirements.map((r) => (
                                <article key={r.requirement} className="alloy-os-healthdetail__record">
                                    <p className="alloy-os-healthdetail__record-name">
                                        {r.requirement}
                                        <span
                                            className={clsx(
                                                "alloy-os-healthdetail__state",
                                                `alloy-os-healthdetail__state--${r.state}`,
                                            )}
                                        >
                                            {r.stateLabel}
                                        </span>
                                    </p>
                                    <Fact label="Evidence" value={r.evidence ?? "None"} />
                                    {r.due ? <Fact label="Due" value={r.due} /> : null}
                                    <p className="alloy-os-healthdetail__why">{r.appliesBecause}</p>
                                </article>
                            ))}

                            {/* ── H · Emergency contacts ─────────────────────── */}
                            <SectionHead>Emergency contacts</SectionHead>
                            {evidence.emergencyContacts.map((c) => (
                                <div key={c.name} className="alloy-os-household__row alloy-os-cardlab__person">
                                    <CardAvatar name={c.name} size={30} role="contact" />
                                    <div className="alloy-os-household__row-main">
                                        <span className="alloy-os-household__row-name">
                                            {c.name}
                                            <span className="alloy-os-card-pill alloy-os-card-pill--neutral">
                                                {c.order}
                                            </span>
                                        </span>
                                        <span className="alloy-os-household__row-detail">
                                            {c.relationship} · {c.phone}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            <p className="alloy-os-healthdetail__why">
                                Projected from Household — Health never owns a contact.
                            </p>
                        </section>
                    </div>
                </div>
            </UniversalCard>
        </div>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <p className="alloy-os-healthdetail__fact">
            <span className="alloy-os-healthdetail__fact-label">{label}</span>
            <span className="alloy-os-healthdetail__fact-value">{value}</span>
        </p>
    );
}

/** Provenance, from the lineage the platform already records. */
function Prov({
    effective,
    p,
}: {
    effective: string;
    p: { source: string; detail: string | null; confirmed: boolean };
}) {
    return (
        <p className="alloy-os-healthdetail__prov">
            {effective ? <span>{effective} · </span> : null}
            <span className={clsx(p.confirmed && "alloy-os-healthdetail__prov--confirmed")}>{p.source}</span>
            {p.detail ? <span> · {p.detail}</span> : null}
        </p>
    );
}
