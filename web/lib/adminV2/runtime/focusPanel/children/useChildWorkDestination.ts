"use client";

import { useEffect, useState } from "react";

import {
    operatorFocusSelectionFromDestination,
    type FocusDestinationLike,
    type OperatorFocusSelectionDetail,
} from "@/lib/runtime/focus/operatorFocusSelection";

export type ChildWorkDestination =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; selection: OperatorFocusSelectionDetail }
    | { status: "none" };

/**
 * E2E-18 — where a child's OWN work is opened, asked of the owner that already answers it.
 *
 * The durable child record's `relatedWork` is produced by Search's own destination resolver over the
 * child's subject contexts (`loadSubjectContexts`), so this is the exact destination a Search click
 * on the child would open — not a second resolver. Only a destination that names a Work View ROW
 * (`operational_member_id`: the child's participation on a child-grain lens) is the child's own work;
 * anything else would land on the family, which the caller already shows.
 *
 * `none` is a real answer: a child with no Enrollment track yet (E2E-21) has no child-grain work, and
 * the caller says so rather than inventing a subject.
 */
export function useChildWorkDestination(customerMemberId: string | null): ChildWorkDestination {
    const [state, setState] = useState<{ memberId: string | null; value: ChildWorkDestination }>({
        memberId: null,
        value: { status: "idle" },
    });

    useEffect(() => {
        const memberId = (customerMemberId ?? "").trim();
        if (!memberId) return;
        let cancelled = false;
        setState({ memberId, value: { status: "loading" } });
        void (async () => {
            let value: ChildWorkDestination = { status: "none" };
            try {
                const res = await fetch(
                    `/api/admin/durable-record?subject_type=child&subject_id=${encodeURIComponent(memberId)}`,
                    { credentials: "include" },
                );
                const json = (await res.json().catch(() => null)) as { ok?: boolean; relatedWork?: FocusDestinationLike[] } | null;
                const destinations = json?.ok ? json.relatedWork ?? [] : [];
                for (const destination of destinations) {
                    if (!(destination.operational_member_id ?? "").trim()) continue;
                    const selection = operatorFocusSelectionFromDestination(destination);
                    if (selection) {
                        value = { status: "ready", selection };
                        break;
                    }
                }
            } catch {
                value = { status: "none" };
            }
            if (!cancelled) setState({ memberId, value });
        })();
        return () => {
            cancelled = true;
        };
    }, [customerMemberId]);

    const memberId = (customerMemberId ?? "").trim();
    if (!memberId) return { status: "idle" };
    return state.memberId === memberId ? state.value : { status: "loading" };
}
