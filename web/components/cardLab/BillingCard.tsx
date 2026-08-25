"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    Action,
    ActionRow,
    EmptyLine,
    FooterAction,
    SectionHead,
} from "@/components/cardLab/CardLabKit";
import type { BillingEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Billing — "Where does this family stand financially right now?"
 *
 * A financial operating snapshot, not a setup checklist. Three zones read left to right across a
 * full grid row, separated only by the grid gap — the family has no vertical rules.
 *
 * Payer identity is deliberately its own evidence: the household primary contact is not
 * necessarily a payer, and responsibility can be split across people and a funding source.
 *
 * Which action carries emphasis is decided by state — Pay now while anything is past due,
 * otherwise Manage payment.
 */
export default function BillingCard({
    evidence,
    onDetails,
    onViewLedger,
}: {
    evidence: BillingEvidence;
    onDetails?: () => void;
    onViewLedger?: () => void;
}) {
    const pastDue = evidence.pastDue;

    return (
        <div className="alloy-os-billing" data-billing-card="true">
            <UniversalCard
                title="Billing"
                insight={evidence.answerLine}
                supportingInsight={evidence.supportingLine}
                iconName="Receipt"
                tier="context"
                archetype="status"
                statusChip={pastDue ? evidence.statusChip ?? undefined : undefined}
                statusTone="due"
                density="compact"
                gridSpan="row"
                data-universal-card-key="billing"
                footerAction={<FooterAction onClick={onDetails}>Details →</FooterAction>}
            >
                <div className="alloy-os-billing__zones">
                    <section className="alloy-os-billing__zone">
                        <SectionHead ruled={false}>Current billing</SectionHead>
                        <p className="alloy-os-household__row-detail">{evidence.period.label}</p>
                        <div className="alloy-os-billing__lines">
                            {evidence.period.lines.map((l) => (
                                <div
                                    key={l.label}
                                    className={clsx(
                                        "alloy-os-billing__line",
                                        l.emphasis && "alloy-os-billing__line--emphasis",
                                    )}
                                >
                                    <span className="alloy-os-billing__line-label">{l.label}</span>
                                    <span className="alloy-os-billing__line-value">{l.value}</span>
                                </div>
                            ))}
                        </div>
                        <p className="alloy-os-billing__due">
                            {evidence.dueLabel} · <strong>{evidence.dueValue}</strong>
                        </p>
                        <SectionHead ruled={false}>Payers</SectionHead>
                        {evidence.payers.map((p) => (
                            <p key={p.name} className="alloy-os-billing__payer">
                                <span className="alloy-os-billing__payer-name">{p.name}</span>
                                <span className="alloy-os-billing__payer-share">{p.share}</span>
                                <span className="alloy-os-household__row-detail">{p.method}</span>
                            </p>
                        ))}
                    </section>

                    <section className="alloy-os-billing__zone">
                        <SectionHead ruled={false}>Past due</SectionHead>
                        {pastDue ? (
                            <>
                                <p className="alloy-os-billing__amount">{pastDue.amount}</p>
                                <p className="alloy-os-billing__age">
                                    Oldest unpaid · {pastDue.oldest} · {pastDue.age}
                                </p>
                                {pastDue.note ? (
                                    <p className="alloy-os-household__row-detail">{pastDue.note}</p>
                                ) : null}
                                <ActionRow>
                                    <Action primary>Pay now</Action>
                                </ActionRow>
                                <FooterAction>Manage payment →</FooterAction>
                            </>
                        ) : (
                            <>
                                <EmptyLine>Nothing past due.</EmptyLine>
                                <ActionRow>
                                    <Action>Manage payment</Action>
                                </ActionRow>
                            </>
                        )}
                    </section>

                    <section className="alloy-os-billing__zone">
                        <SectionHead ruled={false}>Recent ledger</SectionHead>
                        <div className="alloy-os-billing__ledger" role="table">
                            {evidence.ledger.map((e, i) => (
                                <div key={`${e.when}-${i}`} className="alloy-os-billing__entry">
                                    <span className="alloy-os-currentwork__recent-activity-when">{e.when}</span>
                                    <span className="alloy-os-billing__entry-label">{e.label}</span>
                                    <span
                                        className={clsx(
                                            "alloy-os-billing__entry-amount",
                                            e.kind === "credit" && "alloy-os-billing__entry-amount--credit",
                                        )}
                                    >
                                        {e.amount}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <FooterAction onClick={onViewLedger}>View ledger →</FooterAction>
                    </section>
                </div>
            </UniversalCard>
        </div>
    );
}
