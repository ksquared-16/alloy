"use client";

export default function QueueRowCanvasHint() {
    return (
        <section className="rounded-xl border border-alloy-stone/14 bg-white p-4 shadow-sm" data-testid="queue-row-canvas-hint">
            <p className="text-sm font-medium text-alloy-midnight/70">Edit the queue row</p>
            <p className="mt-1 text-[11px] text-alloy-midnight/50">Used when no stage-specific variant matches.</p>
            <ul className="mt-2 space-y-1.5 text-[12px] text-alloy-midnight/55">
                <li>Click an empty zone on the row to add fields or widgets</li>
                <li>Click a configured section to inspect, reorder, or remove it</li>
                <li>Use variant tabs above for stage-specific layouts</li>
            </ul>
        </section>
    );
}
