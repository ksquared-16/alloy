"use client";

import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { recordDrawerHeaderActionClassName } from "@/components/admin/drawer/record/RecordDrawerActionRail";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

type Props = {
    actions: ResolvedActionForClient[];
    inquiryWorkflow?: boolean;
    disabled?: boolean;
    busyKey?: string | null;
    onSelect: (action: ResolvedActionForClient) => void;
};

/** Single Actions dropdown — all configured record_header actions; no visible pills. */
export function OpportunityDrawerHeaderActionsMenu({
    actions,
    inquiryWorkflow = false,
    disabled = false,
    busyKey = null,
    onSelect,
}: Props) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const menuId = useId();
    const btnClass = recordDrawerHeaderActionClassName(inquiryWorkflow);

    const close = useCallback(() => {
        setOpen(false);
        setActiveIndex(0);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDoc = (ev: MouseEvent) => {
            if (!rootRef.current?.contains(ev.target as Node)) close();
        };
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === "Escape") close();
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open, close]);

    useEffect(() => {
        if (open) setActiveIndex(0);
    }, [open, actions.length]);

    if (!actions.length) return null;

    const onTriggerKeyDown = (ev: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (ev.key === "ArrowDown" || ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            setOpen(true);
        }
    };

    const onMenuKeyDown = (ev: ReactKeyboardEvent<HTMLDivElement>) => {
        if (ev.key === "ArrowDown") {
            ev.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, actions.length - 1));
        } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (ev.key === "Home") {
            ev.preventDefault();
            setActiveIndex(0);
        } else if (ev.key === "End") {
            ev.preventDefault();
            setActiveIndex(actions.length - 1);
        } else if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            const a = actions[activeIndex];
            if (a && !disabled && busyKey !== a.key) {
                close();
                onSelect(a);
            }
        }
    };

    return (
        <div ref={rootRef} className="relative shrink-0" data-opportunity-header-actions-menu="true">
            <button
                type="button"
                disabled={disabled}
                className={`${btnClass} inline-flex items-center gap-1`}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-controls={menuId}
                onClick={() => setOpen((v) => !v)}
                onKeyDown={onTriggerKeyDown}
            >
                <span>Actions</span>
                <span className="text-[10px] opacity-60" aria-hidden>
                    ▾
                </span>
            </button>
            {open ?
                <div
                    id={menuId}
                    role="menu"
                    tabIndex={-1}
                    aria-label="Record actions"
                    onKeyDown={onMenuKeyDown}
                    className="absolute right-0 top-[calc(100%+6px)] z-[120] max-h-[min(22rem,70vh)] min-w-[11rem] max-w-[16rem] overflow-y-auto overflow-x-hidden rounded-xl border border-alloy-stone/15 bg-gradient-to-b from-white via-white to-alloy-stone/[0.035] py-1.5 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.18)] ring-1 ring-alloy-stone/10 backdrop-blur-[2px]"
                >
                    {actions.map((a, index) => (
                        <button
                            key={a.key}
                            type="button"
                            role="menuitem"
                            disabled={disabled || busyKey === a.key}
                            title={a.label}
                            aria-current={index === activeIndex ? "true" : undefined}
                            className={`block w-full min-w-0 max-w-[16rem] truncate whitespace-nowrap px-3 py-2 text-left text-[12px] font-medium leading-none text-alloy-midnight/88 transition-colors hover:bg-alloy-blue/[0.07] focus-visible:bg-alloy-blue/[0.08] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-alloy-blue/30 disabled:opacity-50 ${
                                index === activeIndex ? "bg-alloy-blue/[0.05]" : ""
                            }`}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => {
                                close();
                                onSelect(a);
                            }}
                        >
                            {busyKey === a.key ? "…" : a.label}
                        </button>
                    ))}
                </div>
            :   null}
        </div>
    );
}
