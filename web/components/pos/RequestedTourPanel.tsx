"use client";

/**
 * The case's requested tour (S7) — on the Processing case, where the administrator decides.
 *
 * Says, in order: what the family asked for, whether it is accepted, whether the time is still
 * open, what Approve did with it, and what happened to the confirmation. A pending request is
 * never presented as a tour: nothing is booked and nothing has been sent until Approve.
 */

import { useEffect, useState } from "react";
import type { RequestedTourOperatorView } from "@/lib/tours/publicCalendar/requestedTourOperatorView";

type Load = { status: "loading" } | { status: "ready"; view: RequestedTourOperatorView } | { status: "error" };

const COMMS_LABEL: Record<string, string> = {
    sent: "Confirmation sent to the family",
    suppressed: "Confirmation suppressed by communication eligibility",
    not_applicable: "No confirmation — none is due for this booking state",
    failed: "Confirmation could not be queued",
};

export function RequestedTourView({ view }: { view: RequestedTourOperatorView }) {
    const tone =
        view.state === "booked"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : view.state === "pending_acceptance" && view.acceptance === "pending"
              ? "border-sky-200 bg-sky-50 text-sky-900"
              : "border-amber-200 bg-amber-50 text-amber-900";
    return (
        <div className="space-y-2 text-sm" data-testid="requested-tour-panel" data-requested-tour-state={view.state}>
            <div className={`rounded-md border px-2.5 py-1.5 text-[13px] font-medium ${tone}`} data-testid="requested-tour-headline">
                {view.headline}
            </div>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-[13px]">
                <dt className="text-stone-500">Requested</dt>
                <dd className="text-stone-900" data-testid="requested-tour-time">{view.requested.label}</dd>
                <dt className="text-stone-500">Location</dt>
                <dd className="text-stone-900">{view.location.label}</dd>
                {view.booking ? (
                    <>
                        <dt className="text-stone-500">Booking</dt>
                        <dd className="text-stone-900" data-testid="requested-tour-booking">
                            {view.booking.label} · {view.booking.status.replace(/_/g, " ")}
                        </dd>
                    </>
                ) : null}
                {view.comms ? (
                    <>
                        <dt className="text-stone-500">Family message</dt>
                        <dd className="text-stone-900" data-testid="requested-tour-comms" data-comms-status={view.comms.status}>
                            {COMMS_LABEL[view.comms.status] ?? view.comms.status}
                            {view.comms.detail ? <span className="block text-[12px] text-stone-500">{view.comms.detail}</span> : null}
                        </dd>
                    </>
                ) : null}
            </dl>

            {view.state === "pending_acceptance" && view.acceptance === "pending" ? (
                <p className="text-[12px] text-stone-600" data-testid="requested-tour-eligibility">
                    {view.stillAvailable === true
                        ? "This time is still open. Approving books it if it is still open then."
                        : view.stillAvailable === false
                          ? "This time is no longer open. Approving still accepts the lead; the tour will need rescheduling."
                          : "Availability could not be checked just now."}{" "}
                    Nothing is booked and nothing has been sent to the family yet.
                </p>
            ) : null}

            {view.reasonLabel ? (
                <p className="text-[12px] text-amber-800" data-testid="requested-tour-reason">
                    {view.reasonLabel} The original request is kept on this case. Schedule a time from the lead&rsquo;s tour
                    action — Alloy does not choose one.
                </p>
            ) : null}

            {view.error ? (
                <p className="text-[12px] text-amber-800" data-testid="requested-tour-error">
                    The lead is accepted. The tour step stopped ({view.error}); approve again to retry it.
                </p>
            ) : null}

            {view.alternatives.length ? (
                <div data-testid="requested-tour-alternatives">
                    <div className="text-[12px] font-medium text-stone-600">Current openings at {view.location.label}</div>
                    <ul className="mt-0.5 list-disc pl-5 text-[12px] text-stone-700">
                        {view.alternatives.map((a) => (
                            <li key={a.start_at}>{a.label}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

export default function RequestedTourPanel({ caseId, refreshKey }: { caseId: string; refreshKey: string }) {
    const [load, setLoad] = useState<Load>({ status: "loading" });
    useEffect(() => {
        let alive = true;
        setLoad({ status: "loading" });
        fetch(`/api/admin/processing/cases/${encodeURIComponent(caseId)}/requested-tour`)
            .then(async (r) => {
                const j = (await r.json().catch(() => null)) as { data?: RequestedTourOperatorView } | null;
                if (!alive) return;
                if (r.ok && j?.data) setLoad({ status: "ready", view: j.data });
                else setLoad({ status: "error" });
            })
            .catch(() => alive && setLoad({ status: "error" }));
        return () => {
            alive = false;
        };
    }, [caseId, refreshKey]);

    if (load.status === "loading") return <div className="h-12 animate-pulse rounded bg-stone-100" aria-busy="true" />;
    if (load.status === "error") return <p className="text-[12px] text-stone-500">The requested tour could not be loaded.</p>;
    return <RequestedTourView view={load.view} />;
}
