"use client";

export default function QueueRowCanvasHint() {
    return (
        <section
            className="rounded-xl border border-alloy-stone/14 bg-white p-4 shadow-sm"
            data-testid="queue-row-canvas-hint"
        >
            <p className="text-sm text-alloy-midnight/60">Click anywhere on the row to begin building.</p>
        </section>
    );
}
