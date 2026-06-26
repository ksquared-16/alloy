"use client";

import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";

export default function LifecycleTrackNav({
    tracks,
    activeTrackKey,
    onSelect,
}: {
    tracks: ProcessTracksV1;
    activeTrackKey: string;
    onSelect: (trackKey: string) => void;
}) {
    const sorted = [...tracks.tracks].sort((a, b) => a.sort_order - b.sort_order);
    return (
        <div
            className="flex flex-wrap gap-1 border-b border-alloy-forge/10 pb-2"
            role="tablist"
            aria-label="Tracks"
            data-testid="lifecycle-track-tabs"
        >
            {sorted.map((track) => {
                const active = track.key === activeTrackKey;
                return (
                    <button
                        key={track.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${
                            active
                                ? "bg-alloy-pine text-white"
                                : "bg-alloy-stone/15 text-alloy-midnight/70 hover:bg-alloy-stone/25"
                        }`}
                        onClick={() => onSelect(track.key)}
                        data-testid={`lifecycle-track-tab-${track.key}`}
                    >
                        {track.label}
                    </button>
                );
            })}
        </div>
    );
}
