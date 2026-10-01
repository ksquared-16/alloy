"use client";

/**
 * THE REVIEW BEFORE THE PAPERWORK GOES OUT.
 *
 * The command surface owns the lifecycle — subject, preview, blockers, confirmation, execution,
 * result. This is the enrollment-specific BODY it renders in the preview step, and it is only a
 * body: it decides nothing about whether the launch may run, computes no requirement set, and runs
 * no launch of its own. It reads `GET /api/admin/enrollment/packet-launch` and, on confirm, POSTs
 * the same route, which delegates to the canonical `startEnrollment`.
 *
 * ── WHY NOT THE EXISTING MODAL ──
 *
 * `OpportunityEnrollmentPacketModal` asks the operator to CHOOSE a packet definition, which was the
 * model before the packet became derived. Under the current doctrine the packet is a projection of
 * the stage's requirements and is verified against them on every reuse, so offering a choice would
 * offer a way to send a family paperwork the process does not configure. Its recipient and delivery
 * controls remain the right shape for the older header path and are left untouched; what is reused
 * here is its ANATOMY — subject, recipient, requirement summary, confirmation — not its execution.
 *
 * ── WHAT IT REFUSES TO SHOW ──
 *
 * A fee amount. The preview names the fee and says the amount comes from Financials when it becomes
 * due, because a number printed from configuration would be Enrollment quoting money it does not own.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type PreviewRequirement = {
    position: number;
    kind: "form" | "financial";
    label: string;
    detail: string;
    publishedVersionLabel?: string;
};

type Preview = {
    child: { customerMemberId: string; name: string };
    householdName: string | null;
    locationName: string | null;
    recipientName: string | null;
    governing: { stageKey: string; businessProcessRevisionId: string | null };
    requirements: PreviewRequirement[];
    existing: { sessionId: string; status: string | null; participantPath: string | null } | null;
    outcomeSentence: string;
    blocker: string | null;
};

type LaunchResult = {
    journeyReused: boolean;
    launch:
        | {
              realized: true;
              sessionId: string;
              participantPath: string | null;
              outcome: "created" | "resumed";
          }
        | { realized: false; code: string; detail: string };
};

export default function EnrollmentPacketCommandBody({
    customerMemberId,
    onClose,
    onLaunched,
}: {
    customerMemberId: string;
    onClose: () => void;
    onLaunched?: () => void;
}) {
    const [preview, setPreview] = useState<Preview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<LaunchResult | null>(null);

    useEffect(() => {
        let live = true;
        setLoading(true);
        void fetch(
            `/api/admin/enrollment/packet-launch?customer_member_id=${encodeURIComponent(customerMemberId)}`,
            { credentials: "include" },
        )
            .then(async (r) => ({ ok: r.ok, json: (await r.json().catch(() => ({}))) as Record<string, unknown> }))
            .then(({ ok, json }) => {
                if (!live) return;
                if (!ok) throw new Error(String(json.error ?? "This launch could not be previewed."));
                setPreview(json.data as Preview);
                setError(null);
            })
            .catch((e) => {
                if (live) setError((e as Error).message);
            })
            .finally(() => {
                if (live) setLoading(false);
            });
        return () => {
            live = false;
        };
    }, [customerMemberId]);

    const confirm = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/enrollment/packet-launch", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer_member_id: customerMemberId }),
            });
            const json = (await res.json().catch(() => ({}))) as { data?: LaunchResult; error?: string };
            if (!res.ok || !json.data) throw new Error(json.error ?? "The paperwork could not be sent.");
            setResult(json.data);
            onLaunched?.();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [customerMemberId, onLaunched]);

    return (
        <section
            data-enrollment-packet-command="body"
            className="mt-3 rounded-xl border border-alloy-midnight/12 bg-white p-4"
        >
            <div className="flex items-start justify-between gap-3">
                <h4 className="text-[0.875rem] font-semibold text-alloy-midnight">Send enrollment paperwork</h4>
                <button
                    type="button"
                    onClick={onClose}
                    data-enrollment-packet-command="close"
                    className="text-[0.75rem] text-alloy-midnight/55"
                >
                    Close
                </button>
            </div>

            {loading ? (
                <p className="mt-3 flex items-center gap-1.5 text-[0.8125rem] text-alloy-midnight/60">
                    <Loader2 size={13} className="animate-spin" /> Checking what would be sent…
                </p>
            ) : null}

            {/* A refusal is the answer, not an error state to decorate. */}
            {error && !preview ? (
                <p className="mt-3 text-[0.8125rem] text-alloy-ember" role="alert" data-enrollment-packet-command="error">
                    {error}
                </p>
            ) : null}

            {result ? (
                <div className="mt-3 space-y-2" data-enrollment-packet-command="result">
                    {result.launch.realized ? (
                        <>
                            <p className="text-[0.8125rem] font-medium text-alloy-bend-pine">
                                {result.launch.outcome === "created"
                                    ? "Paperwork sent."
                                    : "This family already had an open packet — reopened, not sent twice."}
                            </p>
                            {result.launch.participantPath ? (
                                <p className="text-[0.75rem] text-alloy-midnight/70">
                                    Family link:{" "}
                                    <a
                                        href={result.launch.participantPath}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="underline"
                                        data-enrollment-packet-command="participant-link"
                                    >
                                        {result.launch.participantPath}
                                    </a>
                                </p>
                            ) : null}
                        </>
                    ) : (
                        <p className="text-[0.8125rem] text-alloy-ember" role="alert">
                            The journey started but nothing could be sent: {result.launch.detail}
                        </p>
                    )}
                </div>
            ) : preview ? (
                <div className="mt-3 space-y-3">
                    <dl className="space-y-1 text-[0.8125rem]">
                        <div className="flex gap-2">
                            <dt className="text-alloy-midnight/55">Child</dt>
                            <dd className="font-medium text-alloy-midnight" data-enrollment-packet-command="child">
                                {preview.child.name}
                                {preview.locationName ? ` · ${preview.locationName}` : ""}
                            </dd>
                        </div>
                        {preview.householdName ? (
                            <div className="flex gap-2">
                                <dt className="text-alloy-midnight/55">Family</dt>
                                <dd className="text-alloy-midnight">{preview.householdName}</dd>
                            </div>
                        ) : null}
                        <div className="flex gap-2">
                            <dt className="text-alloy-midnight/55">Goes to</dt>
                            <dd className="text-alloy-midnight" data-enrollment-packet-command="recipient">
                                {/* Never a guess: the launch defaults to this person, so the preview says so. */}
                                {preview.recipientName ?? "the family's primary contact"}
                            </dd>
                        </div>
                    </dl>

                    <div>
                        <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                            What the family will be asked for
                        </p>
                        <ol className="space-y-1" data-enrollment-packet-command="requirements">
                            {preview.requirements.map((r) => (
                                <li key={`${r.kind}-${r.position}`} className="text-[0.8125rem] text-alloy-midnight">
                                    {r.position}. {r.label}
                                    <span className="text-alloy-midnight/55">
                                        {" — "}
                                        {r.detail}
                                        {r.publishedVersionLabel ? ` · ${r.publishedVersionLabel}` : ""}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </div>

                    {preview.existing ? (
                        <p
                            className="rounded-lg bg-alloy-midnight/[0.04] px-3 py-2 text-[0.75rem] text-alloy-midnight/70"
                            data-enrollment-packet-command="existing"
                        >
                            An open packet already exists for this child.
                        </p>
                    ) : null}

                    <p className="text-[0.75rem] text-alloy-midnight/60" data-enrollment-packet-command="outcome">
                        {preview.outcomeSentence}
                    </p>

                    {preview.blocker ? (
                        <p className="text-[0.8125rem] text-alloy-ember" role="alert" data-enrollment-packet-command="blocker">
                            {preview.blocker}
                        </p>
                    ) : (
                        <button
                            type="button"
                            onClick={confirm}
                            disabled={busy}
                            data-enrollment-packet-command="confirm"
                            className="w-full rounded-xl bg-alloy-bend-pine px-4 py-2.5 text-[0.875rem] font-medium text-white disabled:opacity-40"
                        >
                            {busy ? "Sending…" : preview.existing ? "Reopen this packet" : "Send the paperwork"}
                        </button>
                    )}

                    {error ? (
                        <p className="text-[0.8125rem] text-alloy-ember" role="alert">
                            {error}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
