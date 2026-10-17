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
 * A family of one child has nothing to show beyond that child's own screen, so this renders nothing.
 */

import { useEffect, useState } from "react";

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

export default function FamilyEnrollmentCard({ token }: { token: string }) {
    const [family, setFamily] = useState<Family | null>(null);

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
    }, [token]);

    if (!family || family.childCount < 2) return null;

    const pathByChild = new Map(family.children.map((c) => [c.customerMemberId, c.participantPath]));

    return (
        <section data-family-enrollment="card" aria-label={family.headline}>
            <h3>{family.headline}</h3>
            <ul data-family-enrollment="rows">
                {family.progress.map((row) => {
                    const focused = row.customerMemberId != null && row.customerMemberId === family.focusedCustomerMemberId;
                    const path = row.customerMemberId ? pathByChild.get(row.customerMemberId) ?? null : null;
                    return (
                        <li
                            key={row.key}
                            data-family-enrollment-row={row.key.startsWith("child:") ? "child" : row.key}
                            data-family-enrollment-complete={row.complete ? "true" : "false"}
                            aria-current={focused ? "true" : undefined}
                        >
                            <span data-family-enrollment="label">{row.label}</span>
                            {" — "}
                            <span data-family-enrollment="detail">{row.detail}</span>
                            {focused ? <span data-family-enrollment="focused"> · You are here</span> : null}
                            {!focused && path ? (
                                <>
                                    {" · "}
                                    <a data-family-enrollment="open" href={path}>
                                        Open
                                    </a>
                                </>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
