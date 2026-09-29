"use client";

import { useEffect, useState } from "react";

import type { QaJourney } from "./readQaJourney";

/**
 * "Open the family's paperwork" — the one control Track A starts from.
 *
 * It opens the journey that is ALREADY launched. It does not launch anything: the button is a link,
 * the fee reading is a GET of the participant's own view, and there is no POST on this page at all.
 * The identifiers are here so the person doing QA never has to hold one.
 */

type PaymentView = {
    state?: string | null;
    label?: string | null;
    explanation?: string | null;
    outstandingCents?: number | null;
    grossCents?: number | null;
    currencyCode?: string | null;
    payable?: boolean | null;
    unpayableReason?: string | null;
};

type FeeState = { kind: "loading" } | { kind: "ready"; view: PaymentView } | { kind: "unavailable"; message: string };

function money(cents: number | null | undefined, currency: string | null | undefined): string | null {
    if (typeof cents !== "number" || cents <= 0) return null;
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(cents / 100);
    } catch {
        return `${(cents / 100).toFixed(2)}`;
    }
}

/** The fee in a parent's words, not the runtime's. */
function feeSentence(view: PaymentView): string {
    const amount = money(view.outstandingCents ?? view.grossCents, view.currencyCode);
    if (view.state === "NOT_DUE") return `Not due yet${view.explanation ? ` — ${view.explanation}` : ""}`;
    if (view.state === "PAID") return "Paid in full";
    if (amount) return `${amount} outstanding${view.payable ? " and payable now" : ""}`;
    return view.explanation || view.state || "No fee information";
}

export default function ParticipantJourneyCard({ journey }: { journey: QaJourney }) {
    const [fee, setFee] = useState<FeeState>({ kind: "loading" });

    useEffect(() => {
        const token = journey.participantToken;
        if (!token) {
            setFee({ kind: "unavailable", message: "No participant link is recorded for this journey." });
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(
                    `/api/public/forms/${encodeURIComponent(token)}/enrollment-payment`,
                    { credentials: "omit" },
                );
                const body = (await res.json().catch(() => ({}))) as { data?: { payment?: PaymentView }; error?: string };
                if (cancelled) return;
                if (!res.ok || !body.data?.payment) {
                    setFee({ kind: "unavailable", message: body.error || `The fee view answered ${res.status}.` });
                    return;
                }
                setFee({ kind: "ready", view: body.data.payment });
            } catch (e) {
                if (!cancelled) setFee({ kind: "unavailable", message: e instanceof Error ? e.message : "Unreadable" });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [journey.participantToken]);

    const progress = journey.totalSteps
        ? `Step ${Math.min(journey.currentStepNumber, journey.totalSteps)} of ${journey.totalSteps}`
        : "No steps";

    return (
        <section
            className="my-8 rounded-2xl border border-alloy-midnight/12 bg-white p-5"
            data-qa-participant-journey="true"
        >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                Track A · the journey under QA
            </p>
            <h2 className="mt-1 text-[19px] font-semibold text-alloy-midnight">{journey.childName}</h2>
            <p className="mt-0.5 text-[13px] text-alloy-midnight/70">
                {journey.householdName ?? "Household not recorded"}
                {journey.stageLabel ? ` · ${journey.stageLabel}` : ""}
            </p>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Paperwork</dt>
                    <dd className="mt-0.5 text-[13px] text-alloy-midnight">
                        {journey.packetName ?? "Packet"} · {progress}
                    </dd>
                </div>
                <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Enrollment fee</dt>
                    <dd className="mt-0.5 text-[13px] text-alloy-midnight">
                        {fee.kind === "loading" ? "Reading…" : fee.kind === "ready" ? feeSentence(fee.view) : fee.message}
                    </dd>
                </div>
            </dl>

            {journey.steps.length ? (
                <ul className="mt-4 space-y-1.5">
                    {journey.steps.map((step) => (
                        <li key={step.sequenceIndex} className="flex items-baseline gap-2 text-[13px]">
                            <span
                                className={
                                    step.current
                                        ? "font-semibold text-alloy-midnight"
                                        : "text-alloy-midnight/75"
                                }
                            >
                                {step.name}
                            </span>
                            <span className="text-[11px] text-alloy-midnight/45">
                                {step.status}
                                {step.current ? " · where the family is now" : ""}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}

            {journey.participantPath ? (
                <a
                    href={journey.participantPath}
                    target="_blank"
                    rel="noreferrer"
                    data-qa-open-participant="true"
                    className="mt-5 inline-flex min-h-[44px] items-center rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white"
                >
                    Open participant experience
                </a>
            ) : (
                <p className="mt-5 rounded-xl border border-alloy-ember/25 bg-alloy-ember/[0.06] px-4 py-3 text-[13px] text-alloy-ember">
                    This journey has no participant link recorded, so it cannot be opened from here.
                </p>
            )}
            <p className="mt-2 text-[12px] text-alloy-midnight/55">
                Opens in a new tab as the parent, with no sign-in. This is the journey already sent — opening it
                does not start a new one.
                {journey.linkActive ? "" : " The link is marked inactive, which is itself a finding."}
            </p>
        </section>
    );
}
