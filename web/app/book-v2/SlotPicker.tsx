"use client";

import { useState, useEffect, useMemo } from "react";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_VALUE_TO_NUM: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

// Get weekday (0=Sun .. 6=Sat) of the first day of the month in the given timezone
function getFirstDayOfMonthWeekday(year: number, monthIndex: number, timezone: string): number {
    const d = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0));
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
    const value = formatter.format(d);
    return WEEKDAY_VALUE_TO_NUM[value] ?? 0;
}

function getDaysInMonth(year: number, monthIndex: number): number {
    return new Date(year, monthIndex + 1, 0).getDate();
}

export interface TimeSlot {
    start: Date;
    end: Date;
    display: string;
    timeWindow: string;
    isoStart: string;
    isoEnd: string;
}

interface SlotPickerProps {
    selectedSlot: TimeSlot | null;
    onSelectSlot: (slot: TimeSlot) => void;
    timezone: string;
    isLoading?: boolean;
    error?: string | null;
    /** Called when user clicks "Confirm time" in the sidebar. Optional; if not provided, no button is shown. */
    onConfirmTime?: () => void;
}

interface DateGroup {
    dateKey: string;
    dateLabel: string;
    dateShort: string;
    slots: TimeSlot[];
}

export default function SlotPicker({
    selectedSlot,
    onSelectSlot,
    timezone,
    isLoading = false,
    error = null,
    onConfirmTime,
}: SlotPickerProps) {
    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [slotError, setSlotError] = useState<string | null>(null);
    const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
    const [apiTimezone, setApiTimezone] = useState<string>(timezone);
    const [mounted, setMounted] = useState(false);
    // Visible month as YYYY-MM (first day of month for display)
    const [visibleMonthKey, setVisibleMonthKey] = useState<string>("");

    useEffect(() => {
        setMounted(true);
    }, []);

    const formatTime = (date: Date): string => {
        if (!mounted) return "";
        try {
            return date.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: timezone,
                hour12: true,
            });
        } catch {
            return "Invalid time";
        }
    };

    useEffect(() => {
        async function fetchSlots() {
            setLoading(true);
            setSlotError(null);
            try {
                const response = await fetch(`/api/book-v2/availability?timezone=${encodeURIComponent(timezone)}`);
                if (!response.ok) {
                    let errorMessage = "Failed to fetch available slots";
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.error || errorMessage;
                    } catch {
                        errorMessage = `Server error: ${response.status} ${response.statusText}`;
                    }
                    throw new Error(errorMessage);
                }
                const data = await response.json();
                setApiTimezone(data.timezone || timezone);
                const normalizedSlots: TimeSlot[] = (data.slots || []).map((slot: any) => {
                    try {
                        const startDate = slot.start instanceof Date ? slot.start : new Date(slot.start || slot.isoStart);
                        const endDate = slot.end instanceof Date ? slot.end : new Date(slot.end || slot.isoEnd);
                        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
                        return {
                            start: startDate,
                            end: endDate,
                            display: slot.display || formatTime(startDate),
                            timeWindow: slot.timeWindow || `${formatTime(startDate)} - ${formatTime(endDate)}`,
                            isoStart: slot.isoStart || startDate.toISOString(),
                            isoEnd: slot.isoEnd || endDate.toISOString(),
                        };
                    } catch {
                        return null;
                    }
                }).filter((s: TimeSlot | null): s is TimeSlot => s !== null);
                setSlots(normalizedSlots);
            } catch (err: any) {
                setSlotError(err.message || "Failed to load available slots");
                console.error("Failed to fetch slots:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchSlots();
    }, [timezone]);

    const minBookableDateStr = useMemo(() => {
        if (!mounted) return "";
        try {
            const now = new Date();
            const nowInTz = new Intl.DateTimeFormat("en-CA", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(now);
            const [year, month, day] = nowInTz.split("-").map(Number);
            const todayInTz = new Date(year, month - 1, day);
            const minBookableDate = new Date(todayInTz);
            minBookableDate.setDate(minBookableDate.getDate() + 2);
            return `${minBookableDate.getFullYear()}-${String(minBookableDate.getMonth() + 1).padStart(2, "0")}-${String(minBookableDate.getDate()).padStart(2, "0")}`;
        } catch {
            return "";
        }
    }, [mounted, timezone]);

    const firstValidMonthKey = useMemo(() => {
        if (!minBookableDateStr) return "";
        return minBookableDateStr.slice(0, 7);
    }, [minBookableDateStr]);

    const dateGroups = useMemo(() => {
        const groups: DateGroup[] = [];
        const grouped = slots.reduce((acc, slot) => {
            try {
                if (!(slot.start instanceof Date) || isNaN(slot.start.getTime())) return acc;
                const dateKey = mounted
                    ? slot.start.toLocaleDateString("en-CA", { timeZone: timezone })
                    : slot.start.toISOString().split("T")[0];
                if (mounted && minBookableDateStr && dateKey < minBookableDateStr) return acc;
                if (!acc[dateKey]) acc[dateKey] = [];
                acc[dateKey].push(slot);
            } catch {
                // skip
            }
            return acc;
        }, {} as Record<string, TimeSlot[]>);
        Object.entries(grouped).forEach(([dateKey, dateSlots]) => {
            if (dateSlots.length > 0) {
                const labels = mounted
                    ? (() => {
                        try {
                            const full = dateSlots[0].start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: timezone });
                            const short = dateSlots[0].start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: timezone });
                            return { full, short };
                        } catch {
                            return { full: dateKey, short: dateKey };
                        }
                    })()
                    : { full: dateKey, short: dateKey };
                groups.push({
                    dateKey,
                    dateLabel: labels.full,
                    dateShort: labels.short,
                    slots: dateSlots.sort((a, b) => a.start.getTime() - b.start.getTime()),
                });
            }
        });
        groups.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
        return groups;
    }, [slots, timezone, mounted, minBookableDateStr]);

    // Initialize visible month to first valid month
    useEffect(() => {
        if (firstValidMonthKey && !visibleMonthKey) {
            setVisibleMonthKey(firstValidMonthKey);
        }
    }, [firstValidMonthKey, visibleMonthKey]);

    // Default selected date to first available
    useEffect(() => {
        if (dateGroups.length > 0 && !selectedDateKey) {
            setSelectedDateKey(dateGroups[0].dateKey);
        }
    }, [dateGroups, selectedDateKey]);

    const effectiveMonthKey = visibleMonthKey || firstValidMonthKey;

    const firstValidDateInVisibleMonth = useMemo(() => {
        const [y, m] = (effectiveMonthKey || "").split("-").map(Number);
        if (!y || !m || !minBookableDateStr) return null;
        const monthIndex = m - 1;
        const days = getDaysInMonth(y, monthIndex);
        for (let day = 1; day <= days; day++) {
            const dateKey = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            if (dateKey >= minBookableDateStr) return dateKey;
        }
        return null;
    }, [effectiveMonthKey, minBookableDateStr]);

    // When visible month changes, if selected date is invalid or not in visible month, pick first valid in visible month
    useEffect(() => {
        if (!mounted || !selectedDateKey || !firstValidDateInVisibleMonth) return;
        const inVisibleMonth = selectedDateKey.startsWith(effectiveMonthKey || "");
        const valid = selectedDateKey >= minBookableDateStr;
        if (!inVisibleMonth || !valid) {
            setSelectedDateKey(firstValidDateInVisibleMonth);
        }
    }, [mounted, selectedDateKey, effectiveMonthKey, firstValidDateInVisibleMonth, minBookableDateStr]);

    const selectedDateSlots = useMemo(() => {
        if (!selectedDateKey) return [];
        const group = dateGroups.find(g => g.dateKey === selectedDateKey);
        return group?.slots || [];
    }, [dateGroups, selectedDateKey]);

    // Slot count per date (for day tile badges); only bookable dates have entries in dateGroups
    const slotsByDate = useMemo(() => {
        const m: Record<string, number> = {};
        dateGroups.forEach(g => {
            m[g.dateKey] = g.slots.length;
        });
        return m;
    }, [dateGroups]);

    const timezoneLabel = useMemo(() => {
        if (!mounted) return timezone;
        try {
            const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" });
            const parts = formatter.formatToParts(new Date());
            return parts.find(p => p.type === "timeZoneName")?.value || timezone;
        } catch {
            return timezone;
        }
    }, [timezone, mounted]);

    // Month grid: leading blanks + day numbers
    const monthGridCells = useMemo(() => {
        const [y, m] = (effectiveMonthKey || "").split("-").map(Number);
        if (!y || !m) return [];
        const year = y;
        const monthIndex = m - 1;
        const firstWeekday = getFirstDayOfMonthWeekday(year, monthIndex, timezone);
        const daysInMonth = getDaysInMonth(year, monthIndex);
        type Cell = { type: "blank" } | { type: "day"; dateKey: string; day: number; disabled: boolean; slotCount: number };
        const cells: Cell[] = [];
        for (let i = 0; i < firstWeekday; i++) cells.push({ type: "blank" });
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const disabled = mounted && !!minBookableDateStr && dateKey < minBookableDateStr;
            const slotCount = slotsByDate[dateKey] ?? 0;
            cells.push({ type: "day", dateKey, day, disabled, slotCount });
        }
        return cells;
    }, [effectiveMonthKey, timezone, mounted, minBookableDateStr, slotsByDate]);

    const visibleMonthLabel = useMemo(() => {
        const [y, m] = (effectiveMonthKey || "").split("-").map(Number);
        if (!y || !m) return "";
        try {
            const d = new Date(Date.UTC(y, m - 1, 15, 12, 0, 0));
            return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "long", year: "numeric" }).format(d);
        } catch {
            return `${y}-${String(m).padStart(2, "0")}`;
        }
    }, [effectiveMonthKey, timezone]);

    const canGoPrev = firstValidMonthKey && effectiveMonthKey && effectiveMonthKey > firstValidMonthKey;
    const goPrev = () => {
        if (!canGoPrev || !effectiveMonthKey) return;
        const [y, m] = effectiveMonthKey.split("-").map(Number);
        if (m === 1) {
            setVisibleMonthKey(`${y - 1}-12`);
        } else {
            setVisibleMonthKey(`${y}-${String(m - 1).padStart(2, "0")}`);
        }
    };
    const goNext = () => {
        if (!effectiveMonthKey) return;
        const [y, m] = effectiveMonthKey.split("-").map(Number);
        if (m === 12) {
            setVisibleMonthKey(`${y + 1}-01`);
        } else {
            setVisibleMonthKey(`${y}-${String(m + 1).padStart(2, "0")}`);
        }
    };

    if (loading || isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-alloy-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-alloy-midnight/70">Loading available slots...</p>
                </div>
            </div>
        );
    }

    if (slotError || error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-red-800 text-sm font-medium mb-2">{slotError || error}</p>
                <button onClick={() => window.location.reload()} className="text-sm text-red-600 hover:text-red-800 underline">
                    Try again
                </button>
            </div>
        );
    }

    if (slots.length === 0 || dateGroups.length === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-alloy-midnight/70 mb-2">No available slots found.</p>
                <p className="text-sm text-alloy-midnight/60">Please try again later or contact us for assistance.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="text-xs text-alloy-midnight/60 text-center">
                Times shown in {timezoneLabel}
            </div>

            {/* Desktop: 2-column grid, 280px sidebar, both panels 520px tall. Times are sibling column only. */}
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-6 lg:items-stretch">
                {/* Left: Month calendar — fixed height on desktop */}
                <div className="lg:h-[520px] lg:min-h-[520px] flex flex-col">
                    <h3 className="text-sm font-semibold text-alloy-midnight mb-2 shrink-0">Select a date</h3>
                    <div className="flex items-center justify-between mb-2 shrink-0">
                        <button
                            type="button"
                            onClick={goPrev}
                            disabled={!canGoPrev}
                            className="p-2 rounded-lg border border-alloy-stone/30 text-alloy-midnight disabled:opacity-40 disabled:cursor-not-allowed hover:bg-alloy-stone/10 transition-colors"
                            aria-label="Previous month"
                        >
                            <span className="sr-only">Previous</span>
                            <span aria-hidden>&lt;</span>
                        </button>
                        <span className="text-sm font-semibold text-alloy-midnight tabular-nums">
                            {visibleMonthLabel || "—"}
                        </span>
                        <button
                            type="button"
                            onClick={goNext}
                            className="p-2 rounded-lg border border-alloy-stone/30 text-alloy-midnight hover:bg-alloy-stone/10 transition-colors"
                            aria-label="Next month"
                        >
                            <span className="sr-only">Next</span>
                            <span aria-hidden>&gt;</span>
                        </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 shrink-0">
                        {WEEKDAY_LABELS.map((day) => (
                            <div key={day} className="text-xs font-medium text-alloy-midnight/60 text-center py-1">
                                {day}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 flex-1 min-h-0 content-start">
                        {monthGridCells.map((cell, idx) => {
                            if (cell.type === "blank") {
                                return <div key={`blank-${idx}`} className="aspect-square" />;
                            }
                            const showBadge = !cell.disabled && cell.slotCount > 0;
                            return (
                                <button
                                    key={cell.dateKey}
                                    type="button"
                                    disabled={cell.disabled}
                                    onClick={() => !cell.disabled && setSelectedDateKey(cell.dateKey)}
                                    className={`
                                        aspect-square rounded-lg border-2 text-sm font-medium transition-all flex flex-col items-center justify-center min-h-[44px] relative
                                        ${cell.disabled
                                            ? "border-transparent bg-alloy-stone/10 text-alloy-midnight/40 cursor-not-allowed"
                                            : selectedDateKey === cell.dateKey
                                                ? "border-alloy-blue bg-alloy-blue text-white shadow-md"
                                                : "border-alloy-stone/30 bg-white text-alloy-midnight hover:border-alloy-blue hover:bg-alloy-stone/10"
                                        }
                                    `}
                                >
                                    <span>{cell.day}</span>
                                    {showBadge && (
                                        <span className={`
                                            text-[10px] font-normal mt-0.5
                                            ${selectedDateKey === cell.dateKey ? "text-white/90" : "text-alloy-midnight/60"}
                                        `}>
                                            {cell.slotCount}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Times panel — exactly 520px on desktop; list scrolls inside; bottom aligns with calendar */}
                <div className="h-full lg:h-[520px] lg:min-h-[520px] lg:max-h-[520px] lg:overflow-hidden flex flex-col min-h-0 mt-4 lg:mt-0 lg:border-l lg:border-alloy-stone/20 lg:pl-6">
                    <h3 className="text-sm font-semibold text-alloy-midnight mb-1 shrink-0">
                        {selectedDateKey ? (dateGroups.find(g => g.dateKey === selectedDateKey)?.dateLabel ?? selectedDateKey) : "Select a date"}
                    </h3>
                    {/* Scrollable times list — only scrolling region; header + footer are shrink-0 */}
                    <div className="flex-1 min-h-0 flex flex-col">
                        {selectedDateKey ? (
                            selectedDateSlots.length > 0 ? (
                                <>
                                    <div className="text-xs text-alloy-midnight/60 mb-1.5 shrink-0">Available times</div>
                                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1 pr-1">
                                        {selectedDateSlots.map((slot) => {
                                            const isSelected = selectedSlot?.isoStart === slot.isoStart;
                                            return (
                                                <div key={slot.isoStart} className="w-full flex justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectSlot(slot)}
                                                        className={`
                                                            w-full lg:w-[180px] lg:max-w-[180px] min-h-[40px] px-3 py-2 rounded-md border-2 text-sm font-medium transition-all text-center
                                                            ${isSelected
                                                                ? "border-alloy-blue bg-alloy-blue text-white shadow-sm"
                                                                : "border-alloy-stone/30 bg-white text-alloy-midnight hover:border-alloy-blue hover:bg-alloy-stone/10"
                                                            }
                                                        `}
                                                    >
                                                        {slot.display}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <div className="py-6 text-center flex-1 flex items-center justify-center">
                                    <p className="text-sm text-alloy-midnight/60">No times available. Try another day.</p>
                                </div>
                            )
                        ) : (
                            <div className="py-6 text-center flex-1 flex items-center justify-center">
                                <p className="text-sm text-alloy-midnight/60">Select a date to see times.</p>
                            </div>
                        )}
                    </div>
                    {/* Footer: CTA at bottom; centered on desktop */}
                    {onConfirmTime != null && (
                        <div className="shrink-0 p-4 border-t border-alloy-stone/20 flex justify-center">
                            <button
                                type="button"
                                onClick={onConfirmTime}
                                disabled={!selectedSlot}
                                className="w-full lg:w-fit lg:min-w-[200px] px-6 py-2.5 bg-alloy-blue text-white font-semibold rounded-lg hover:bg-alloy-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm"
                            >
                                Confirm time
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
