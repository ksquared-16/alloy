"use client";

import { useState, useEffect, useMemo } from "react";

// Helper to format date label - only call after mount to avoid hydration issues
const formatDateLabel = (date: Date, timezone: string): { full: string; short: string } => {
    try {
        const full = date.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: timezone,
        });
        const short = date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: timezone,
        });
        return { full, short };
    } catch {
        return { full: "Invalid date", short: "Invalid" };
    }
};

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
}: SlotPickerProps) {
    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [slotError, setSlotError] = useState<string | null>(null);
    const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
    const [apiTimezone, setApiTimezone] = useState<string>(timezone);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Helper to format time in timezone
    const formatTime = (date: Date): string => {
        if (!mounted) return ""; // Avoid hydration mismatch
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
                
                // Normalize slots: parse ISO strings to Date objects
                const normalizedSlots: TimeSlot[] = (data.slots || []).map((slot: any) => {
                    try {
                        // Parse start and end from ISO strings to Date objects
                        const startDate = slot.start instanceof Date 
                            ? slot.start 
                            : new Date(slot.start || slot.isoStart);
                        const endDate = slot.end instanceof Date 
                            ? slot.end 
                            : new Date(slot.end || slot.isoEnd);
                        
                        // Validate dates
                        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                            console.warn("Invalid date in slot:", slot);
                            return null;
                        }
                        
                        return {
                            start: startDate,
                            end: endDate,
                            display: slot.display || formatTime(startDate),
                            timeWindow: slot.timeWindow || `${formatTime(startDate)} - ${formatTime(endDate)}`,
                            isoStart: slot.isoStart || startDate.toISOString(),
                            isoEnd: slot.isoEnd || endDate.toISOString(),
                        };
                    } catch (err) {
                        console.warn("Failed to parse slot:", slot, err);
                        return null;
                    }
                }).filter((slot: TimeSlot | null): slot is TimeSlot => slot !== null);
                
                setSlots(normalizedSlots);
            } catch (err: any) {
                setSlotError(err.message || "Failed to load available slots");
                console.error("Failed to fetch slots:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchSlots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timezone]);

    // Calculate minimum bookable date: today + 2 days (date-based only, timezone-aware)
    const minBookableDateStr = useMemo(() => {
        if (!mounted) return ""; // Avoid hydration issues
        try {
            const now = new Date();
            // Get current date in target timezone
            const nowInTz = new Intl.DateTimeFormat("en-CA", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(now);
            
            // Parse and add 2 days
            const [year, month, day] = nowInTz.split("-").map(Number);
            const todayInTz = new Date(year, month - 1, day);
            const minBookableDate = new Date(todayInTz);
            minBookableDate.setDate(minBookableDate.getDate() + 2);
            
            // Format as YYYY-MM-DD
            return `${minBookableDate.getFullYear()}-${String(minBookableDate.getMonth() + 1).padStart(2, "0")}-${String(minBookableDate.getDate()).padStart(2, "0")}`;
        } catch {
            return "";
        }
    }, [mounted, timezone]);

    // Group slots by date and filter out dates before minimum bookable date
    const dateGroups = useMemo(() => {
        const groups: DateGroup[] = [];
        const grouped = slots.reduce((acc, slot) => {
            try {
                if (!(slot.start instanceof Date) || isNaN(slot.start.getTime())) {
                    return acc;
                }
                
                // Create a date key (YYYY-MM-DD in timezone) - only after mount to avoid hydration issues
                let dateKey: string;
                if (mounted) {
                    dateKey = slot.start.toLocaleDateString("en-CA", {
                        timeZone: timezone,
                    }); // en-CA gives YYYY-MM-DD format
                } else {
                    // Fallback: use ISO date string for grouping during SSR
                    dateKey = slot.start.toISOString().split("T")[0];
                }
                
                // Filter out dates before minimum bookable date (date-based only)
                if (mounted && minBookableDateStr && dateKey < minBookableDateStr) {
                    return acc;
                }
                
                if (!acc[dateKey]) {
                    acc[dateKey] = [];
                }
                acc[dateKey].push(slot);
            } catch (err) {
                console.warn("Failed to group slot:", err);
            }
            return acc;
        }, {} as Record<string, TimeSlot[]>);

        // Convert to array and sort by date
        Object.entries(grouped).forEach(([dateKey, dateSlots]) => {
            if (dateSlots.length > 0) {
                const labels = mounted ? formatDateLabel(dateSlots[0].start, timezone) : { full: dateKey, short: dateKey };
                groups.push({
                    dateKey,
                    dateLabel: labels.full,
                    dateShort: labels.short,
                    slots: dateSlots.sort((a, b) => a.start.getTime() - b.start.getTime()),
                });
            }
        });

        // Sort by date
        groups.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
        
        return groups;
    }, [slots, timezone, mounted, minBookableDateStr]);

    // Set default selected date to first available date
    useEffect(() => {
        if (dateGroups.length > 0 && !selectedDateKey) {
            setSelectedDateKey(dateGroups[0].dateKey);
        }
    }, [dateGroups, selectedDateKey]);

    // Get slots for selected date
    const selectedDateSlots = useMemo(() => {
        if (!selectedDateKey) return [];
        const group = dateGroups.find(g => g.dateKey === selectedDateKey);
        return group?.slots || [];
    }, [dateGroups, selectedDateKey]);

    // Format timezone label - only after mount to avoid hydration issues
    const timezoneLabel = useMemo(() => {
        if (!mounted) return timezone; // Return raw timezone during SSR
        try {
            // Get timezone abbreviation or name
            const formatter = new Intl.DateTimeFormat("en-US", {
                timeZone: timezone,
                timeZoneName: "short",
            });
            const parts = formatter.formatToParts(new Date());
            const tzName = parts.find(p => p.type === "timeZoneName")?.value || timezone;
            return tzName;
        } catch {
            return timezone;
        }
    }, [timezone, mounted]);

    if (loading || isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-alloy-blue border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-alloy-midnight/70">Loading available slots...</p>
                </div>
            </div>
        );
    }

    if (slotError || error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-red-800 text-sm font-medium mb-2">{slotError || error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="text-sm text-red-600 hover:text-red-800 underline"
                >
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
            {/* Timezone label */}
            <div className="text-xs text-alloy-midnight/60 text-center">
                Times shown in {timezoneLabel}
            </div>

            {/* Calendar grid + Time sidebar layout */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-4">
                {/* Left: Calendar grid (compact month view style) */}
                <div>
                    <div className="mb-2">
                        <h3 className="text-sm font-semibold text-alloy-midnight mb-1">Select a date</h3>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {/* Calendar header (day names) */}
                        <div className="col-span-7 grid grid-cols-7 gap-2 mb-1">
                            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                                <div key={day} className="text-xs font-medium text-alloy-midnight/60 text-center py-1">
                                    {day}
                                </div>
                            ))}
                        </div>
                        {/* Calendar dates - compact grid */}
                        {dateGroups.map((group) => {
                            const isSelected = selectedDateKey === group.dateKey;
                            // Extract day number from dateShort (e.g., "Wed, Jan 15" -> "15")
                            const dayNumber = group.dateShort.split(", ")[1]?.split(" ")[1] || group.dateShort.split(" ")[1] || "";
                            const dayName = group.dateShort.split(", ")[0]?.substring(0, 3) || "";
                            
                            return (
                                <button
                                    key={group.dateKey}
                                    onClick={() => setSelectedDateKey(group.dateKey)}
                                    className={`
                                        aspect-square rounded-lg border-2 transition-all flex flex-col items-center justify-center p-1 min-h-[60px]
                                        ${
                                            isSelected
                                                ? "border-alloy-blue bg-alloy-blue text-white shadow-md"
                                                : "border-alloy-stone/30 bg-white text-alloy-midnight hover:border-alloy-blue hover:bg-alloy-stone/10"
                                        }
                                    `}
                                >
                                    <span className={`text-xs font-medium ${isSelected ? "text-white" : "text-alloy-midnight/60"}`}>
                                        {dayName}
                                    </span>
                                    <span className={`text-base font-semibold ${isSelected ? "text-white" : "text-alloy-midnight"}`}>
                                        {dayNumber}
                                    </span>
                                    <span className={`text-[10px] ${isSelected ? "text-white/90" : "text-alloy-midnight/50"}`}>
                                        {group.slots.length}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Time slots sidebar (or below on mobile) */}
                <div className="lg:border-l lg:border-alloy-stone/20 lg:pl-4">
                    {selectedDateKey && selectedDateSlots.length > 0 ? (
                        <div className="space-y-3">
                            <div>
                                <h3 className="text-sm font-semibold text-alloy-midnight mb-1">
                                    {dateGroups.find(g => g.dateKey === selectedDateKey)?.dateLabel}
                                </h3>
                                <p className="text-xs text-alloy-midnight/60 mb-3">
                                    Available times
                                </p>
                            </div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {selectedDateSlots.map((slot) => {
                                    const isSelected = selectedSlot?.isoStart === slot.isoStart;
                                    return (
                                        <button
                                            key={slot.isoStart}
                                            onClick={() => onSelectSlot(slot)}
                                            className={`
                                                w-full px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all text-left
                                                ${
                                                    isSelected
                                                        ? "border-alloy-blue bg-alloy-blue text-white shadow-sm"
                                                        : "border-alloy-stone/30 bg-white text-alloy-midnight hover:border-alloy-blue hover:bg-alloy-stone/10"
                                                }
                                            `}
                                        >
                                            {slot.display}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-sm text-alloy-midnight/60">No slots available for selected date.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
