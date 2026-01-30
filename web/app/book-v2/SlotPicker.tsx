"use client";

import { useState, useEffect } from "react";

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
                <p className="text-red-800 text-sm">{slotError || error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (slots.length === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-alloy-midnight/70">No available slots found. Please try again later.</p>
            </div>
        );
    }

    // Group slots by date (with guards for invalid dates)
    const slotsByDate = slots.reduce((acc, slot) => {
        try {
            // Guard: ensure start is a valid Date object
            if (!(slot.start instanceof Date) || isNaN(slot.start.getTime())) {
                console.warn("Invalid start date in slot:", slot);
                return acc;
            }
            
            const dateKey = slot.start.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                timeZone: timezone,
            });
            
            if (!acc[dateKey]) {
                acc[dateKey] = [];
            }
            acc[dateKey].push(slot);
        } catch (err) {
            console.warn("Failed to group slot by date:", slot, err);
        }
        return acc;
    }, {} as Record<string, TimeSlot[]>);

    return (
        <div className="space-y-6">
            {Object.entries(slotsByDate).map(([dateLabel, dateSlots]) => (
                <div key={dateLabel}>
                    <h3 className="text-sm font-semibold text-alloy-midnight/80 mb-3">{dateLabel}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {dateSlots.map((slot) => {
                            const isSelected = selectedSlot?.isoStart === slot.isoStart;
                            return (
                                <button
                                    key={slot.isoStart}
                                    onClick={() => onSelectSlot(slot)}
                                    className={`
                                        px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all
                                        ${
                                            isSelected
                                                ? "border-alloy-blue bg-alloy-blue text-white"
                                                : "border-alloy-stone/40 bg-white text-alloy-midnight hover:border-alloy-blue hover:bg-alloy-stone/20"
                                        }
                                    `}
                                >
                                    {slot.display}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

