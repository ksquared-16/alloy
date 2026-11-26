"use client";

/**
 * Shared week picker — jump to any Monday-start operating week.
 * Used by Room Board (and reusable elsewhere). Portal popover via Radix DropdownMenu.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function parseYmd(ymd: string): Date {
    const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
    return new Date(y!, m! - 1, d!);
}

function toYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** Monday of the week containing `ymd` (local). */
export function mondayOfWeekContaining(ymd: string): string {
    const d = parseYmd(ymd);
    const day = d.getDay(); // 0 Sun … 6 Sat
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return toYmd(d);
}

export function addDaysYmdLocal(ymd: string, days: number): string {
    const d = parseYmd(ymd);
    d.setDate(d.getDate() + days);
    return toYmd(d);
}

function fmtMonthDay(ymd: string): string {
    const d = parseYmd(ymd);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtWeekRange(weekStart: string): string {
    return `${fmtMonthDay(weekStart)}–${fmtMonthDay(addDaysYmdLocal(weekStart, 6))}`;
}

type Props = {
    /** Monday YYYY-MM-DD of the displayed week (may be empty while loading). */
    weekStart: string | null | undefined;
    weekLabel: string;
    pending?: boolean;
    onPrev: () => void;
    onNext: () => void;
    /** Jump to a Monday week start, or "" for this week. */
    onSelectWeek: (weekStart: string) => void;
};

export default function WeekPicker({
    weekStart,
    weekLabel,
    pending = false,
    onPrev,
    onNext,
    onSelectWeek,
}: Props) {
    const [open, setOpen] = useState(false);
    const todayMonday = useMemo(() => mondayOfWeekContaining(toYmd(new Date())), []);
    const selected = weekStart && weekStart.length >= 10 ? mondayOfWeekContaining(weekStart) : todayMonday;

    const weeks = useMemo(() => {
        // Show ~8 weeks back and ~16 ahead from today for quick jumps.
        const start = addDaysYmdLocal(todayMonday, -7 * 8);
        return Array.from({ length: 25 }, (_, i) => addDaysYmdLocal(start, i * 7));
    }, [todayMonday]);

    return (
        <div className="inline-flex overflow-hidden rounded-lg border border-alloy-stone/25" data-week-picker="true">
            <button
                type="button"
                className="px-2.5 py-1.5 text-alloy-slate hover:bg-alloy-stone/[0.06]"
                onClick={onPrev}
                aria-label="Previous week"
                data-week-picker-prev="true"
            >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className={`border-x border-alloy-stone/25 px-3 py-1.5 text-[12px] font-semibold text-alloy-midnight hover:bg-alloy-stone/[0.06] ${pending ? "opacity-60" : ""}`}
                        data-roster-week-label="true"
                        data-week-picker-trigger="true"
                        aria-label={`Week ${weekLabel}. Choose another week.`}
                    >
                        {weekLabel}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="z-[9999] w-[220px] p-2"
                    data-week-picker-panel="true"
                >
                    <div className="mb-2 flex gap-1">
                        <button
                            type="button"
                            className="flex-1 rounded-md bg-alloy-bend-pine/10 px-2 py-1.5 text-[11px] font-semibold text-alloy-bend-pine"
                            data-week-picker-today="true"
                            onClick={() => {
                                onSelectWeek("");
                                setOpen(false);
                            }}
                        >
                            This week
                        </button>
                    </div>
                    <ul className="max-h-[240px] space-y-0.5 overflow-y-auto" role="listbox" aria-label="Weeks">
                        {weeks.map((ws) => {
                            const isSelected = ws === selected;
                            const isThis = ws === todayMonday;
                            return (
                                <li key={ws}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] ${
                                            isSelected
                                                ? "bg-alloy-bend-pine/15 font-semibold text-alloy-bend-pine"
                                                : "text-alloy-midnight hover:bg-alloy-stone/40"
                                        }`}
                                        data-week-picker-option={ws}
                                        onClick={() => {
                                            onSelectWeek(isThis ? "" : ws);
                                            setOpen(false);
                                        }}
                                    >
                                        <span>{fmtWeekRange(ws)}</span>
                                        {isThis ? (
                                            <span className="text-[10px] font-semibold text-alloy-slate">Today</span>
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </DropdownMenuContent>
            </DropdownMenu>
            <button
                type="button"
                className="px-2.5 py-1.5 text-alloy-slate hover:bg-alloy-stone/[0.06]"
                onClick={onNext}
                aria-label="Next week"
                data-week-picker-next="true"
            >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
        </div>
    );
}
