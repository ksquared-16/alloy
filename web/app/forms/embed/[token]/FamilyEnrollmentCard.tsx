"use client";

/**
 * THE FAMILY'S ENROLLMENT, SEEN TOGETHER — quoted from `/family-enrollment`, decided nowhere here.
 *
 * A parent enrolling two or three children used to see only the child whose link they opened. The
 * family endpoint already composed every child's own journey — each child's state, what is done and
 * what is left, the household's shared information and the family's payment — and nothing showed it.
 *
 * Nothing here merges children or reports a family-level status of its own: each row is one child's
 * own state, a sibling's enrolment never reads as another child's progress, and a waitlisted child
 * is not shown as work. A sibling's own link is offered only when the server returned it, which it
 * does only for links addressed to the same person. No session, packet or process id is shown.
 *
 * A family of one child sees no sibling rows — only the way to ask about another child.
 *
 * "+ Add another child" is a REQUEST to the school, never an enrolment: choosing a child asks the
 * school to consider them, and the family is told exactly that. The server decides which children
 * can be asked about (`/enrollment-request`); a child already being considered, waitlisted, in
 * progress or enrolled is shown with where they stand instead of a button.
 */

import { useCallback, useEffect, useState } from "react";
import { onParticipantProgress } from "./participantProgressSignal";

type Row = {
    key: string;
    label: string;
    detail: string;
    complete: boolean;
    customerMemberId?: string;
};

type Child = {
    customerMemberId: string;
    displayName: string;
    participantPath: string | null;
    state?: string;
};

type Family = {
    familyName: string;
    headline: string;
    childCount: number;
    children: Child[];
    progress: Row[];
    complete: boolean;
    focusedCustomerMemberId: string | null;
};

type HouseholdChild = { customerMemberId: string; displayName: string; status: string };

const STATUS_WORDS: Record<string, string> = {
    being_reviewed: "The school is considering this child",
    waitlisted: "On the waitlist",
    in_progress: "Enrollment in progress",
    enrolled: "Enrolled",
};

type ChildRequest = { requestId: string; displayName: string; status: "pending" | "declined" };

const REQUEST_WORDS: Record<ChildRequest["status"], string> = {
    pending: "Sent to the school for review",
    declined: "The school didn't add this child — please contact them",
};

/** A new child the school doesn't know yet: the family's words, sent for review — never a child record. */
function AddNewChild({ token, onSent }: { token: string; onSent: () => void }) {
    const [first, setFirst] = useState("");
    const [last, setLast] = useState("");
    const [dob, setDob] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    const send = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/public/forms/${encodeURIComponent(token)}/enrollment-request`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ new_child: { first_name: first, last_name: last, date_of_birth: dob } }),
            });
            const json = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !json.ok) {
                setError(json.error ?? "We couldn't send your request just now.");
                return;
            }
            setSent(true);
            setFirst("");
            setLast("");
            setDob("");
            onSent();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div data-family-enrollment="new-child">
            <p>Tell the school about a child who isn't listed. The school will review the details before anything is added or enrolled.</p>
            <label>
                First name
                <input data-family-enrollment="new-child-first-name" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" />
            </label>
            <label>
                Last name
                <input data-family-enrollment="new-child-last-name" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" />
            </label>
            <label>
                Date of birth
                <input data-family-enrollment="new-child-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </label>
            <button
                type="button"
                data-family-enrollment="new-child-send"
                disabled={busy || !first.trim() || !last.trim() || !dob}
                onClick={() => void send()}
            >
                {busy ? "Sending…" : "Send to the school"}
            </button>
            {sent ? <p role="status" data-family-enrollment="new-child-sent">Your request has been sent to the school for review.</p> : null}
            {error ? <p role="alert" data-family-enrollment="new-child-error">{error}</p> : null}
        </div>
    );
}

function AddAnotherChild({ token, onRequested }: { token: string; onRequested: () => void }) {
    const [open, setOpen] = useState(false);
    const [children, setChildren] = useState<HouseholdChild[] | null>(null);
    const [requests, setRequests] = useState<ChildRequest[]>([]);
    const [mode, setMode] = useState<"existing" | "new">("existing");
    const [canRequest, setCanRequest] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch(`/api/public/forms/${encodeURIComponent(token)}/enrollment-request`, { credentials: "same-origin" });
        const json = (await res.json()) as { ok?: boolean; data?: { children: HouseholdChild[]; requests?: ChildRequest[]; canRequest: boolean }; error?: string };
        if (!res.ok || !json.ok || !json.data) {
            setError(json.error ?? "We couldn't load your children just now.");
            return;
        }
        setChildren(json.data.children);
        setRequests(json.data.requests ?? []);
        setCanRequest(json.data.canRequest);
    }, [token]);

    const ask = useCallback(
        async (child: HouseholdChild) => {
            setBusy(child.customerMemberId);
            setError(null);
            setMessage(null);
            const res = await fetch(`/api/public/forms/${encodeURIComponent(token)}/enrollment-request`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer_member_id: child.customerMemberId }),
            });
            const json = (await res.json()) as { ok?: boolean; error?: string };
            setBusy(null);
            if (!res.ok || !json.ok) {
                setError(json.error ?? "We couldn't send your request just now.");
            } else {
                setMessage(`We've asked the school to consider ${child.displayName}. They'll review it and let you know the next step — this isn't an enrollment yet.`);
                onRequested();
            }
            await load();
        },
        [token, load, onRequested],
    );

    if (!open) {
        return (
            <button
                type="button"
                data-family-enrollment="add-child"
                onClick={() => {
                    setOpen(true);
                    void load();
                }}
            >
                + Add another child
            </button>
        );
    }
    return (
        <div data-family-enrollment="add-child-panel">
            <p>Ask the school to consider another of your children for enrollment. They'll review it before anything is enrolled.</p>
            {children === null && !error ? <p>Loading…</p> : null}
            {children !== null && !canRequest ? (
                <p data-family-enrollment="add-child-unavailable">We can't add a request here right now. Please contact the school and they'll help you.</p>
            ) : null}
            {children !== null && canRequest ? (
                <div data-family-enrollment="add-child-choice">
                    <button type="button" data-family-enrollment="choose-existing" aria-pressed={mode === "existing"} onClick={() => setMode("existing")}>
                        Choose a child already in your family
                    </button>
                    <button type="button" data-family-enrollment="choose-new" aria-pressed={mode === "new"} onClick={() => setMode("new")}>
                        Add a new child
                    </button>
                </div>
            ) : null}
            {children !== null && canRequest && mode === "new" ? <AddNewChild token={token} onSent={() => { void load(); onRequested(); }} /> : null}
            {requests.length > 0 ? (
                <ul data-family-enrollment="child-requests">
                    {requests.map((r) => (
                        <li key={r.requestId} data-child-request-status={r.status}>
                            <span>{r.displayName}</span>
                            <span> — {REQUEST_WORDS[r.status] ?? r.status}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {children !== null && canRequest && mode === "existing" ? (
                <ul data-family-enrollment="household-children">
                    {children.map((c) => (
                        <li key={c.customerMemberId} data-household-child-status={c.status}>
                            <span>{c.displayName}</span>
                            {c.status === "available" ? (
                                <button
                                    type="button"
                                    data-family-enrollment="request-child"
                                    disabled={busy !== null}
                                    onClick={() => void ask(c)}
                                >
                                    {busy === c.customerMemberId ? "Sending…" : `Ask the school to enroll ${c.displayName}`}
                                </button>
                            ) : (
                                <span data-family-enrollment="child-status"> — {STATUS_WORDS[c.status] ?? c.status}</span>
                            )}
                        </li>
                    ))}
                </ul>
            ) : null}
            {message ? <p role="status" data-family-enrollment="request-sent">{message}</p> : null}
            {error ? <p role="alert" data-family-enrollment="request-error">{error}</p> : null}
        </div>
    );
}

export default function FamilyEnrollmentCard({ token }: { token: string }) {
    const [family, setFamily] = useState<Family | null>(null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(`/api/public/forms/${encodeURIComponent(token)}/family-enrollment`, {
                    credentials: "same-origin",
                });
                const json = (await res.json()) as { ok?: boolean; data?: { family: Family | null } };
                if (!cancelled && res.ok && json.ok) setFamily(json.data?.family ?? null);
            } catch {
                // The family view is additive; the child's own screen stands without it.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, version]);

    // Paperwork submitted or a fee paid anywhere on the page: re-read the family's own truth.
    useEffect(() => onParticipantProgress(() => setVersion((v) => v + 1)), []);

    if (!family) return null;

    const pathByChild = new Map(family.children.map((c) => [c.customerMemberId, c.participantPath]));

    return (
        <section data-family-enrollment="card" aria-label={family.headline} className="mt-4 rounded-2xl border border-alloy-midnight/[0.08] bg-white px-5 py-4 shadow-sm">
            <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">{family.headline}</h3>
            {family.childCount < 2 ? null : <ul data-family-enrollment="rows" className="divide-y divide-alloy-midnight/[0.06] text-[13.5px]">
                {family.progress.map((row) => {
                    const focused = row.customerMemberId != null && row.customerMemberId === family.focusedCustomerMemberId;
                    const path = row.customerMemberId ? pathByChild.get(row.customerMemberId) ?? null : null;
                    return (
                        <li
                            key={row.key}
                            data-family-enrollment-row={row.key.startsWith("child:") ? "child" : row.key}
                            data-family-enrollment-complete={row.complete ? "true" : "false"}
                            aria-current={focused ? "true" : undefined}
                            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
                        >
                            <span data-family-enrollment="label" className={focused ? "font-semibold text-alloy-midnight" : "text-alloy-midnight/80"}>{row.label}</span>
                            {/* Separators stay in the text for screen readers; the layout carries them visually. */}
                            <span className="sr-only"> — </span>
                            <span className="flex items-center gap-2">
                                <span data-family-enrollment="detail" className={row.complete ? "font-medium text-alloy-bend-pine" : "text-alloy-midnight/60"}>{row.detail}</span>
                                {focused ? <span data-family-enrollment="focused" className="text-[12px] text-alloy-midnight/45"><span className="sr-only"> · </span>You are here</span> : null}
                                {!focused && path ? (
                                    <>
                                        <span className="sr-only"> · </span>
                                        <a data-family-enrollment="open" href={path} className="text-[13px] font-medium text-alloy-bend-pine underline underline-offset-2">
                                            Open
                                        </a>
                                    </>
                                ) : null}
                            </span>
                        </li>
                    );
                })}
            </ul>}
            <AddAnotherChild token={token} onRequested={() => setVersion((v) => v + 1)} />
        </section>
    );
}
