"use client";

import { useMemo } from "react";

import { RecordDrawerManageMenu } from "@/components/admin/drawer/record/RecordDrawerManageMenu";
import {
    carrierActionIsExecutable,
    type ActionableDrawerCarrier,
} from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrier";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

/**
 * PHASE 1, MOUNTED — the operator's command set before the record exists.
 *
 * This renders the SAME canonical Manage menu the resolved header renders, from the SAME resolver
 * answer, through the SAME selection handler. It is not a preview of the header and not a second
 * command surface: it is the header's own control, mounted earlier, with the actions whose canonical
 * execution inputs are not yet available held disabled.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not take `overviewData`, and there is nowhere to pass
 * one: the resolved header's `overviewData` reaches only the attention block and the BOS CTA, and
 * neither exists in this rail. Synthesising a record to satisfy a prop would have put fabricated
 * values one render away from the action arguments.
 *
 * THE TRIGGER IS DISABLED WHEN NOTHING IS EXECUTABLE. An enabled Manage button over a menu of
 * entirely disabled entries would read as "you may act" and measure as FIRST ACTIONABLE while the
 * operator can do nothing — the exact false-green this programme has already had to throw
 * measurements away for.
 */
export default function FocusPanelCarrierActionRail({
    carrier,
    onActionSelect,
    actionLoadingKey,
    canMutate,
}: {
    carrier: ActionableDrawerCarrier;
    onActionSelect: (action: ResolvedActionForClient) => void;
    actionLoadingKey: string | null;
    canMutate: boolean;
}) {
    const actions = useMemo<ResolvedActionForClient[]>(
        // The readiness field is stripped on the way into the shared menu: it is phase-1 bookkeeping,
        // and the menu's contract is the resolver's own action shape.
        () => carrier.header_menu.map(({ readiness: _readiness, ...action }) => action),
        [carrier.header_menu],
    );

    const notYetExecutable = useMemo(
        () => new Set(carrier.header_menu.filter((a) => !carrierActionIsExecutable(a)).map((a) => a.key)),
        [carrier.header_menu],
    );

    const executableCount = actions.length - notYetExecutable.size;

    return (
        <div
            className="flex w-auto min-w-0 shrink-0 flex-col items-stretch gap-0.5"
            data-opportunity-header-controls="true"
            data-opportunity-header-controls-layout="modal-actions"
            data-focus-panel-carrier-actions="true"
            data-focus-panel-carrier-executable-count={String(executableCount)}
            data-focus-panel-carrier-subject={carrier.subject.opportunity_id}
        >
            <div
                className="flex shrink-0 flex-nowrap items-center justify-end gap-2 self-start"
                data-opportunity-header-controls-row="actions"
            >
                <RecordDrawerManageMenu
                    registryActions={actions}
                    inquiryWorkflow
                    proofLayoutActions
                    disabled={!canMutate || executableCount === 0 || Boolean(actionLoadingKey)}
                    disabledReason={
                        !canMutate ? "You don't have permission to manage this record."
                        : actionLoadingKey ? "An action is running — wait for it to finish."
                        : executableCount === 0 ?
                            "Available when this record finishes loading."
                        :   null
                    }
                    onRegistryActionSelect={onActionSelect}
                    registryActionLoadingKey={actionLoadingKey}
                    registryActionDisabledKeys={notYetExecutable}
                    registryActionDisabledReason="Available when this record finishes loading."
                />
            </div>
        </div>
    );
}
