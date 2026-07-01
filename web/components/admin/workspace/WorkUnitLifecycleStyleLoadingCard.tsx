"use client";

/** Lifecycle-tile shimmer used while work-unit entry resolves (Pass 2 perceived perf). */
export function WorkUnitLifecycleStyleLoadingCard() {
    return (
        <div
            className="adminv2-ws-lifecycle-command-card adminv2-ws-lifecycle-command-card--skeleton mb-4 min-h-[7.5rem] max-w-lg rounded-[1.35rem]"
            data-work-unit-entry-lifecycle-shimmer="true"
            aria-hidden
        />
    );
}
