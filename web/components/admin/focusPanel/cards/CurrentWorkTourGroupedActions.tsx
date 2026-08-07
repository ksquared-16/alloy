"use client";

import { useEffect, useId, useRef, useState } from "react";

import CurrentWorkActionButtonContent from "@/components/admin/focusPanel/cards/CurrentWorkActionButtonContent";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import { partitionTourGroupedActions } from "@/lib/adminV2/runtime/focusPanel/currentWork/groupTourPresentationActions";

type Props = {
    actions: CurrentWorkActionVM[];
    onAction: (action: CurrentWorkActionVM) => void;
    onWarm?: (action: CurrentWorkActionVM) => void;
    /** Summary row uses compact buttons; workspace uses list rows. */
    variant?: "summary" | "workspace";
};

/**
 * Presentation-only Tour ▾ grouping for What's Next helpful / more-actions lists.
 */
export default function CurrentWorkTourGroupedActions({
    actions,
    onAction,
    onWarm,
    variant = "summary",
}: Props) {
    const { tour, rest } = partitionTourGroupedActions(actions);
    const [open, setOpen] = useState(false);
    const menuId = useId();
    const rootRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

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
                    <li className="relative" ref={(el) => { rootRef.current = el; }}>
                        <button
                            type="button"
                            className="alloy-os-currentwork-workspace__action-row"
                            data-work-tour-menu-trigger="true"
                            aria-expanded={open}
                            aria-controls={menuId}
                            onClick={() => setOpen((v) => !v)}
                        >
                            Tour ▾
                        </button>
                        {open ?
                            <ul
                                id={menuId}
                                role="menu"
                                data-work-tour-menu="true"
                                className="absolute left-0 z-20 mt-1 min-w-[12rem] rounded-md border border-alloy-stone/20 bg-white py-1 shadow-md"
                            >
                                {tour.map((action) => (
                                    <li key={action.key} role="none">
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="block w-full px-3 py-1.5 text-left text-sm text-alloy-midnight hover:bg-alloy-stone/10 disabled:opacity-40"
                                            data-work-supporting-action={action.key}
                                            disabled={action.disabled}
                                            title={action.disabledReason ?? undefined}
                                            onClick={() => {
                                                setOpen(false);
                                                onAction(action);
                                            }}
                                        >
                                            {action.label}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        :   null}
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
                    className="alloy-os-currentwork__record-outcome alloy-os-currentwork__record-outcome--summary"
                    data-work-supporting-action={action.key}
                    onClick={() => onAction(action)}
                    onMouseEnter={() => onWarm?.(action)}
                    onFocus={() => onWarm?.(action)}
                >
                    <CurrentWorkActionButtonContent action={action} />
                </button>
            ))}
            {tour.length > 0 ?
                <div className="relative inline-flex" ref={rootRef as React.RefObject<HTMLDivElement | null>} data-work-tour-grouped="true">
                    <button
                        type="button"
                        className="alloy-os-currentwork__record-outcome alloy-os-currentwork__record-outcome--summary"
                        data-work-tour-menu-trigger="true"
                        aria-expanded={open}
                        aria-controls={menuId}
                        onClick={() => setOpen((v) => !v)}
                    >
                        Tour ▾
                    </button>
                    {open ?
                        <ul
                            id={menuId}
                            role="menu"
                            data-work-tour-menu="true"
                            className="absolute left-0 top-full z-20 mt-1 min-w-[12rem] rounded-md border border-alloy-stone/20 bg-white py-1 shadow-md"
                        >
                            {tour.map((action) => (
                                <li key={action.key} role="none">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="block w-full px-3 py-1.5 text-left text-sm text-alloy-midnight hover:bg-alloy-stone/10"
                                        data-work-supporting-action={action.key}
                                        onClick={() => {
                                            setOpen(false);
                                            onAction(action);
                                        }}
                                        onMouseEnter={() => onWarm?.(action)}
                                        onFocus={() => onWarm?.(action)}
                                    >
                                        {action.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    :   null}
                </div>
            :   null}
        </>
    );
}
