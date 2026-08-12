"use client";

import { useState } from "react";

import CurrentWorkActionButtonContent from "@/components/admin/focusPanel/cards/CurrentWorkActionButtonContent";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import { partitionTourGroupedActions } from "@/lib/adminV2/runtime/focusPanel/currentWork/groupTourPresentationActions";

type Props = {
    actions: CurrentWorkActionVM[];
    onAction: (action: CurrentWorkActionVM) => void;
    onWarm?: (action: CurrentWorkActionVM) => void;
    /** Summary row uses compact buttons; workspace uses list rows. */
    variant?: "summary" | "workspace";
};

const TOUR_MENU_LABELS: Record<string, string> = {
    send_tour_invitation: "Send Tour Invitation",
    schedule_tour: "Schedule Tour",
};

function tourMenuLabel(action: CurrentWorkActionVM): string {
    const key = (action.handlerKey ?? action.key).trim();
    return TOUR_MENU_LABELS[key] ?? TOUR_MENU_LABELS[action.key] ?? action.label;
}

/**
 * Presentation-only Tour ▾ grouping for What's Next helpful / more-actions lists.
 * Uses the shared Alloy DropdownMenu primitive (not a one-off menu skin).
 */
export default function CurrentWorkTourGroupedActions({
    actions,
    onAction,
    onWarm,
    variant = "summary",
}: Props) {
    const { tour, rest } = partitionTourGroupedActions(actions);
    const [open, setOpen] = useState(false);

    if (variant === "workspace") {
        return (
            <ul className="alloy-os-currentwork-workspace__action-list" data-work-tour-grouped="true">
                {rest.map((action) => (
                    <li key={action.key}>
                        <button
                            type="button"
                            className="alloy-os-currentwork-workspace__action-row"
                            data-work-supporting-action={action.key}
                            disabled={action.disabled}
                            title={action.disabledReason ?? undefined}
                            onClick={() => onAction(action)}
                        >
                            {action.label}
                        </button>
                    </li>
                ))}
                {tour.length > 0 ?
                    <li className="relative w-full" data-work-tour-grouped="true">
                        <DropdownMenu open={open} onOpenChange={setOpen}>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="alloy-os-currentwork-workspace__action-row w-full"
                                    data-work-tour-menu-trigger="true"
                                    aria-expanded={open}
                                >
                                    Tour ▾
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="start"
                                sideOffset={4}
                                data-work-tour-menu="true"
                                className="alloy-os-currentwork__tour-menu"
                            >
                                {tour.map((action) => (
                                    <DropdownMenuItem
                                        key={action.key}
                                        disabled={action.disabled}
                                        title={action.disabledReason ?? undefined}
                                        data-work-supporting-action={action.key}
                                        className="alloy-os-currentwork__tour-menu-item"
                                        onSelect={() => onAction(action)}
                                    >
                                        {tourMenuLabel(action)}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </li>
                :   null}
            </ul>
        );
    }

    return (
        <>
            {rest.map((action) => (
                <button
                    key={action.key}
                    type="button"
                    className="alloy-os-currentwork__helpful-action"
                    data-work-supporting-action={action.key}
                    disabled={action.disabled}
                    title={action.disabledReason ?? undefined}
                    onClick={() => onAction(action)}
                    onMouseEnter={() => onWarm?.(action)}
                    onFocus={() => onWarm?.(action)}
                >
                    <CurrentWorkActionButtonContent action={action} />
                </button>
            ))}
            {tour.length > 0 ?
                <div className="relative w-full min-w-0" data-work-tour-grouped="true">
                    <DropdownMenu open={open} onOpenChange={setOpen}>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="alloy-os-currentwork__helpful-action"
                                data-work-tour-menu-trigger="true"
                                aria-expanded={open}
                                onMouseEnter={() => {
                                    for (const action of tour) onWarm?.(action);
                                }}
                                onFocus={() => {
                                    for (const action of tour) onWarm?.(action);
                                }}
                            >
                                Tour ▾
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="start"
                            sideOffset={4}
                            data-work-tour-menu="true"
                            className="alloy-os-currentwork__tour-menu"
                        >
                            {tour.map((action) => (
                                <DropdownMenuItem
                                    key={action.key}
                                    disabled={action.disabled}
                                    title={action.disabledReason ?? undefined}
                                    data-work-supporting-action={action.key}
                                    className="alloy-os-currentwork__tour-menu-item"
                                    onSelect={() => onAction(action)}
                                    onFocus={() => onWarm?.(action)}
                                >
                                    {tourMenuLabel(action)}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            :   null}
        </>
    );
}
