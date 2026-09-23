"use client";

import { useState } from "react";

/**
 * "Give me a link I can open as the parent."
 *
 * ## Why this exists
 *
 * Part F cannot be run without a participant link, and there is currently no way for the operator
 * to get one for this fixture: `Send enrollment packet` only appears once a child reaches
 * **Enrolled**, and the QA child sits at **Enrolling**. Until that gap is closed the alternative was
 * for the person doing QA to ask an engineer for a fresh token every run, or for a token to be
 * pasted into the document — where it would be stale by the time anyone read it.
 *
 * ## What it is NOT
 *
 * A new capability, or a second way to launch paperwork. It calls the SAME operator endpoint the
 * `Send enrollment packet` modal calls, with the same body shape, on a page that already refuses to
 * render anywhere hosted. Nothing about Enrollment behaves differently because this button exists;
 * it only spares the QA run a round trip through an engineer.
 *
 * The fixture is named here deliberately. This is a QA affordance for ONE disposable family, not a
 * launcher pointed at whatever record happens to be open — a QA tool that can be aimed at a real
 * household is a liability, not a convenience.
 */

/** The disposable QA family Part F is written against. */
const FIXTURE = {
    opportunityId: "8baf8418-654d-41dc-9779-1c8c44198e41",
    childCustomerMemberId: "9c6ba9a5-62ac-4ff0-99ab-bc985eca9a04",
    packetDefinitionId: "8c633a53-d642-465a-b69f-e876720db53d",
    familyLabel: "Disposable0913 Family",
    childLabel: "Touree Disposable0913",
} as const;

type State =
    | { kind: "idle" }
    | { kind: "working" }
    | { kind: "ready"; url: string }
    | { kind: "failed"; message: string };

export default function ParticipantLinkLauncher() {
    const [state, setState] = useState<State>({ kind: "idle" });

    const launch = async () => {
        setState({ kind: "working" });
        try {
            const res = await fetch(
                `/api/admin/opportunities/${FIXTURE.opportunityId}/enrollment-packet-launch`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        packet_definition_id: FIXTURE.packetDefinitionId,
                        // A LIST, one link per child — the launch contract's own shape. Passing a
                        // single `customer_member_id` is silently ignored and produces a
                        // family-wide link with no enrollee, which is how an earlier QA pass came
                        // to believe the launch was broken.
                        customer_member_ids: [FIXTURE.childCustomerMemberId],
                        delivery: "copy_only",
                    }),
                },
            );
            const body = (await res.json().catch(() => ({}))) as {
                created_links?: { embed_url?: string | null; customer_member_id?: string | null }[];
                error?: string;
            };
            if (!res.ok) {
                setState({ kind: "failed", message: body.error || `Launch failed (${res.status})` });
                return;
            }
            const created = body.created_links?.[0];
            const raw = typeof created?.embed_url === "string" ? created.embed_url : "";
            if (!raw) {
                setState({ kind: "failed", message: "The launch returned no link." });
                return;
            }
            /*
             * The launch answers with the tailnet origin it was configured with. The person doing
             * QA is on this machine, reading this page on 127.0.0.1, and a link that sends them to
             * a different host is a link they cannot open.
             */
            let url = raw;
            try {
                const parsed = new URL(raw);
                url = `${window.location.origin}${parsed.pathname}`;
            } catch {
                /* A relative path is already what we want. */
            }
            setState({ kind: "ready", url });
        } catch (e) {
            setState({ kind: "failed", message: e instanceof Error ? e.message : "Launch failed" });
        }
    };

    return (
        <section className="my-8 rounded-2xl border border-alloy-midnight/12 bg-alloy-midnight/[0.02] p-5">
            <h2 className="text-[15px] font-semibold text-alloy-midnight">Get a participant link</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-alloy-midnight/70">
                Opens {FIXTURE.childLabel}&rsquo;s paperwork for {FIXTURE.familyLabel} as a parent would see
                it. A link carries one session, so take a fresh one for each run rather than reusing a
                finished one.
            </p>

            <button
                type="button"
                onClick={() => void launch()}
                disabled={state.kind === "working"}
                className="mt-4 flex min-h-[44px] items-center rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
                data-qa-launch-participant-link="true"
            >
                {state.kind === "working" ? "Launching…" : "Get a fresh participant link"}
            </button>

            {state.kind === "ready" ? (
                <div className="mt-4">
                    <a
                        href={state.url}
                        target="_blank"
                        rel="noreferrer"
                        data-qa-participant-link={state.url}
                        className="block break-all rounded-xl border border-alloy-bend-pine/30 bg-white px-4 py-3 font-mono text-[13px] text-alloy-bend-pine underline underline-offset-2"
                    >
                        {state.url}
                    </a>
                    <p className="mt-2 text-[12px] text-alloy-midnight/60">
                        Opens in a new tab. No sign-in — this is the parent&rsquo;s view.
                    </p>
                </div>
            ) : null}

            {state.kind === "failed" ? (
                <p className="mt-4 rounded-xl border border-alloy-ember/25 bg-alloy-ember/[0.06] px-4 py-3 text-[13px] text-alloy-ember">
                    {state.message}
                </p>
            ) : null}
        </section>
    );
}
