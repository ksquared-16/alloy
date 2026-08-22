"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { LabAbsent, LabFooter, LabGroup, LabHandoff, LabRow } from "@/components/cardLab/CardLabPrimitives";
import type { BillingCardEvidence } from "@/lib/cardLab/billingCardEvidence";

/**
 * Billing card — configuration, readiness and charge activity, which is what Alloy can answer.
 *
 * The financial-state half (balance, period, autopay, method, subsidy, family responsibility) is
 * fully specified in the evidence contract and is null in every production path today, because
 * no entity in the schema owns any of it (GAP-3). The renderer omits null rows rather than
 * inventing money, and the lab shows the held shape explicitly so the Director can review the
 * target design without it being mistaken for something that ships.
 */
export default function BillingCard({
    evidence,
    expanded = false,
    showHeldShape = false,
}: {
    evidence: BillingCardEvidence;
    expanded?: boolean;
    showHeldShape?: boolean;
}) {
    if (evidence.resolution === "unresolved") {
        return (
            <UniversalCard
                title="Billing"
                insight={evidence.answerLine}
                supportingInsight={evidence.supportingLine}
                tier="context"
                archetype="status"
                iconName="credit-card"
                density="compact"
                data-universal-card-key="billing"
            >
                <LabAbsent kind="unresolved">
                    The tuition rate is unresolved — the financial-config API has not answered. Reporting it as
                    &ldquo;missing&rdquo; would manufacture a blocked verdict out of unwired plumbing, on every
                    record, forever. The card states only what a source actually answered.
                </LabAbsent>
            </UniversalCard>
        );
    }

    return (
        <UniversalCard
            title="Billing"
            insight={evidence.answerLine}
            supportingInsight={evidence.supportingLine}
            tier="context"
            archetype="status"
            iconName="credit-card"
            statusChip={evidence.statusChip}
            statusTone={evidence.statusTone}
            density={expanded ? "expanded" : "compact"}
            data-universal-card-key="billing"
            footerAction={
                <LabFooter>
                    {evidence.isConfigured ? (
                        <LabHandoff label="View billing" to={evidence.billingHandoff ?? "billing_surface"} />
                    ) : (
                        <LabHandoff label="Complete billing setup" to={evidence.setupHandoff ?? "billing_setup"} />
                    )}
                </LabFooter>
            }
        >
            {evidence.tuitionRateLabel ? (
                <LabGroup title="Tuition">
                    <LabRow name="Rate" detail={evidence.tuitionRateLabel} />
                </LabGroup>
            ) : null}

            <LabGroup title={evidence.isConfigured ? "Payment" : "Still needed"}>
                {evidence.readinessItems
                    .filter((i) => (evidence.isConfigured ? i.met : true))
                    .map((i) => (
                        <LabRow
                            key={i.label}
                            name={
                                <>
                                    <span
                                        aria-hidden
                                        style={{
                                            marginRight: 6,
                                            color: !i.resolved ? "#94a3b8" : i.met ? "#16a34a" : "#dc2626",
                                            fontWeight: 700,
                                        }}
                                    >
                                        {!i.resolved ? "·" : i.met ? "✓" : "○"}
                                    </span>
                                    {i.label}
                                </>
                            }
                            detail={i.detail}
                            status={!i.resolved ? "held" : undefined}
                            tone={!i.resolved ? "muted" : "neutral"}
                        />
                    ))}
            </LabGroup>

            {evidence.charges.length > 0 ? (
                <LabGroup title="Recent">
                    {(expanded ? evidence.charges : evidence.charges.slice(0, 3)).map((c) => (
                        <LabRow
                            key={c.id}
                            name={c.label}
                            detail={c.amountLabel}
                            status={c.isPreview ? "preview" : c.status}
                            tone={c.isPreview ? "muted" : "neutral"}
                        />
                    ))}
                    {evidence.charges.some((c) => c.isPreview) ? (
                        <LabAbsent kind="held">
                            Rows marked <em>preview</em> come from <code>resolved_obligations</code> —
                            non-authoritative and recomputable. An unmarked preview would read as money that
                            was charged.
                        </LabAbsent>
                    ) : null}
                </LabGroup>
            ) : null}

            {showHeldShape ? (
                <>
                    <LabGroup title="Financial state — specified, no owner">
                        <LabRow name="Current period" detail="—" status="no entity" tone="muted" />
                        <LabRow name="Amount due / overdue" detail="—" status="no projection" tone="muted" />
                        <LabRow name="Family responsibility" detail="—" status="not projected" tone="muted" />
                        <LabRow name="Subsidy / funding" detail="—" status="no entity" tone="muted" />
                        <LabRow name="Autopay" detail="—" status="no entity" tone="muted" />
                        <LabRow name="Payment method + health" detail="—" status="no childcare reader" tone="muted" />
                        <LabRow name="Recent payments / refunds / failures" detail="—" status="job grain only" tone="muted" />
                    </LabGroup>
                    <LabAbsent kind="absent">
                        Every row above is typed on the evidence contract and null in every production path.
                        <code>resolved_obligations</code> writes no ledger; <code>payments</code> and{" "}
                        <code>ledger_transactions</code> are read only at job grain;{" "}
                        <code>customer_payment_methods</code> has no childcare reader; subsidy, autopay and
                        billing period have no entity at all (GAP-3).
                    </LabAbsent>
                </>
            ) : null}
        </UniversalCard>
    );
}
