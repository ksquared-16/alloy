"use client";

/**
 * THE HOUSEHOLD CARD, reached from a child — with no Work Unit anywhere in the path.
 *
 * `Operations → Children → Lennon → Household` used to navigate out: the family was reachable only
 * by opening the household as a whole durable record, or by routing through a case that happened to
 * host a Household card. Both cost the operator the surface they were on to see one card about a
 * family they were already looking at a member of.
 *
 * ── IT COMPOSES NOTHING ──
 *
 * `composeDurableHouseholdSubject` already produces the canonical household — contacts, children,
 * truth — and `deriveHouseholdFocusPanelCards` already produces the canonical card MODEL from it.
 * This component fetches that composition through the endpoint that already exists and hands both to
 * `FocusPanelCardRenderer`, which is the same renderer the native Focus Panel uses.
 *
 * So the card an operator sees here is the Household card, not a Household-shaped card: same model,
 * same renderer, same actions, same truth bag. If this file ever starts deciding a household fact,
 * the platform has two answers about one family.
 *
 * ── WHY IT FETCHES RATHER THAN RECEIVING PROPS ──
 *
 * The child's own record does not carry its family's composition, and it should not: a household is
 * a different subject with its own contacts and its own children, and pre-loading it on every child
 * open would pay for a card most operators never select. It is fetched when it is chosen — the same
 * on-demand rule Operations Studio follows.
 */

import { useEffect, useState } from "react";

import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import { cardAppliesToGrain } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { deriveHouseholdFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveHouseholdFocusPanelCards";
import { buildDurableHouseholdOperationalContext } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import type { DurableHouseholdSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableHouseholdSubjectModel";

type State =
    | { status: "loading" }
    | { status: "ready"; subject: DurableHouseholdSubject }
    | { status: "error" };

export default function DurableHouseholdContextCard({
    householdId,
    contextKey,
}: {
    householdId: string;
    contextKey: string;
}) {
    const [state, setState] = useState<State>({ status: "loading" });

    useEffect(() => {
        let alive = true;
        setState({ status: "loading" });
        void (async () => {
            try {
                const res = await fetch(
                    `/api/admin/durable-record?subject_type=household&subject_id=${encodeURIComponent(householdId)}`,
                    { credentials: "include" },
                );
                const json = (await res.json().catch(() => null)) as
                    | { ok?: boolean; householdSubject?: DurableHouseholdSubject | null }
                    | null;
                if (!alive) return;
                if (!res.ok || !json?.ok || !json.householdSubject) {
                    setState({ status: "error" });
                    return;
                }
                setState({ status: "ready", subject: json.householdSubject });
            } catch {
                if (alive) setState({ status: "error" });
            }
        })();
        return () => {
            alive = false;
        };
    }, [householdId]);

    if (state.status === "loading") {
        return (
            <div
                className="rounded-lg border border-alloy-stone/22 bg-white p-3 text-[12px] text-alloy-midnight/50"
                data-contextual-card="loading"
            >
                Opening household…
            </div>
        );
    }

    if (state.status === "error") {
        return (
            <div
                className="rounded-lg border border-alloy-stone/22 bg-white p-3"
                data-contextual-card="error"
                data-contextual-card-context={contextKey}
            >
                <p className="text-[12.5px] font-medium text-alloy-midnight/75">Household</p>
                <p className="mt-1 max-w-[54ch] text-[12px] text-alloy-midnight/55">
                    This family could not be opened. It may be outside your access.
                </p>
            </div>
        );
    }

    // The registry is the gate here as everywhere: the card reaches the household grain because
    // someone declared that it can, not because this component wanted to render it.
    if (!cardAppliesToGrain("household", "household")) return null;
    const model = deriveHouseholdFocusPanelCards({ subject: state.subject }).get("household");
    if (!model) return null;

    return (
        <div
            className="rounded-lg border border-alloy-stone/22 bg-white"
            data-contextual-card="record"
            data-contextual-card-context={contextKey}
            data-contextual-card-canonical-card="household"
            data-contextual-card-household={state.subject.householdId}
        >
            <FocusPanelCardRenderer
                model={model}
                context={buildDurableHouseholdOperationalContext(state.subject, false, null)}
                focusPanelMode="summary"
                    // Tab-pane drill navigation, which a contextual card has no tabs for. The
                    // renderer requires it; pure cards ignore it.
                    compat={{ onSelectTab: () => {} }}
            />
        </div>
    );
}
