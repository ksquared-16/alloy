"use client";

/**
 * What am I looking at, and how much is left?
 *
 * The document-first review is right to show the paperwork and get out of the way — but a parent
 * several screens into their enrollment could not tell which of their school's forms was on screen,
 * how many were still to come, or what this one still wanted from them. All of it was already known
 * to the runtime; none of it was said.
 *
 * One line of state, one line of name, one line of what remains. No step numbers, no progress bar,
 * and no runtime vocabulary — the five states are the participant's, not the session item's.
 */

import clsx from "clsx";

import type { ParticipantArtifactStatus } from "@/lib/enrollment/participantRuntime/participantArtifactStatus";

export function ParticipantArtifactHeader({ status }: { status: ParticipantArtifactStatus }) {
    return (
        <header className="pb-5" data-artifact-status={status.state}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                    className={clsx(
                        "rounded-full px-2.5 py-1 text-[12px] font-medium",
                        status.state === "signed" || status.state === "complete"
                            ? "bg-alloy-bend-pine/12 text-alloy-bend-pine"
                            : status.state === "signature_required"
                              ? "bg-alloy-midnight/[0.07] text-alloy-midnight"
                              : "bg-alloy-midnight/[0.05] text-alloy-midnight/70",
                    )}
                >
                    {status.label}
                </span>
                {status.position ? (
                    <span className="text-[13px] text-alloy-midnight/50">{status.position}</span>
                ) : null}
            </div>
            <h2 className="pt-2 text-[19px] font-medium leading-snug text-alloy-midnight">{status.documentName}</h2>
            {status.remaining || status.next ? (
                <p className="pt-1 text-[14px] text-alloy-midnight/60">
                    {status.remaining ? <span>{status.remaining}</span> : null}
                    {status.remaining && status.next ? <span aria-hidden> · </span> : null}
                    {status.next ? <span>{status.next}</span> : null}
                </p>
            ) : null}
        </header>
    );
}
