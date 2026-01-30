"use client";

import { useState, useEffect, useMemo } from "react";

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

    // Helper to format time in timezone
    const formatTime = (date: Date): string => {
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

    // Helper to format date label
    const formatDateLabel = (date: Date): { full: string; short: string } => {
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

    // Group slots by date
    const dateGroups = useMemo(() => {
        const groups: DateGroup[] = [];
        const grouped = slots.reduce((acc, slot) => {
            try {
                if (!(slot.start instanceof Date) || isNaN(slot.start.getTime())) {
                    return acc;
                }
                
                // Create a date key (YYYY-MM-DD in timezone)
                const dateKey = slot.start.toLocaleDateString("en-CA", {
                    timeZone: timezone,
                }); // en-CA gives YYYY-MM-DD format
                
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
                const labels = formatDateLabel(dateSlots[0].start);
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
    }, [slots, timezone]);

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

    // Format timezone label
    const timezoneLabel = useMemo(() => {
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
    }, [timezone]);

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
        <div className="space-y-4">
            {/* Timezone label */}
            <div className="text-xs text-alloy-midnight/60 text-center">
                Times shown in {timezoneLabel}
            </div>

            {/* Date list + Time grid layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left: Date selector */}
                <div className="md:col-span-1">
                    <div className="bg-alloy-stone/20 rounded-lg p-2 space-y-1">
                        <div className="text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide px-3 py-2">
                            Select Date
                        </div>
                        <div className="max-h-[400px] overflow-y-auto space-y-1">
                            {dateGroups.map((group) => {
                                const isSelected = selectedDateKey === group.dateKey;
                                return (
                                    <button
                                        key={group.dateKey}
                                        onClick={() => setSelectedDateKey(group.dateKey)}
                                        className={`
                                            w-full text-left px-3 py-3 rounded-md transition-all
                                            ${
                                                isSelected
                                                    ? "bg-alloy-blue text-white shadow-sm"
                                                    : "bg-white text-alloy-midnight hover:bg-alloy-stone/40"
                                            }
                                        `}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className={`font-medium ${isSelected ? "text-white" : "text-alloy-midnight"}`}>
                                                    {group.dateShort}
                                                </div>
                                                <div className={`text-xs mt-0.5 ${isSelected ? "text-white/90" : "text-alloy-midnight/60"}`}>
                                                    {group.slots.length} {group.slots.length === 1 ? "slot" : "slots"}
                                                </div>
                                            </div>
                                            {isSelected && (
                                                <svg
                                                    className="w-5 h-5 text-white"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M5 13l4 4L19 7"
                                                    />
                                                </svg>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right: Time slots for selected date */}
                <div className="md:col-span-2">
                    {selectedDateKey && selectedDateSlots.length > 0 ? (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-alloy-midnight mb-1">
                                    {dateGroups.find(g => g.dateKey === selectedDateKey)?.dateLabel}
                                </h3>
                                <p className="text-sm text-alloy-midnight/60">
                                    Select a time slot
                                </p>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                                {selectedDateSlots.map((slot) => {
                                    const isSelected = selectedSlot?.isoStart === slot.isoStart;
                                    return (
                                        <button
                                            key={slot.isoStart}
                                            onClick={() => onSelectSlot(slot)}
                                            className={`
                                                px-3 sm:px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px] flex items-center justify-center
                                                ${
                                                    isSelected
                                                        ? "border-alloy-blue bg-alloy-blue text-white shadow-md"
                                                        : "border-alloy-stone/40 bg-white text-alloy-midnight hover:border-alloy-blue hover:bg-alloy-stone/20 hover:shadow-sm"
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
                        <div className="text-center py-12">
                            <p className="text-alloy-midnight/70">No slots available for selected date.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
