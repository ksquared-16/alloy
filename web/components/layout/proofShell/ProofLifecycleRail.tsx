"use client";

/**
 * PROOF-ONLY Lead lifecycle rail. Visually mirrors the staging
 * RecordLifecycleRail (web/components/admin/drawer/RecordLifecycleRail.tsx) —
 * horizontal dots + connectors + labels, Alloy tokens — but is self-contained
 * (hardcoded Lead Management stages, no queueDefinition / runtime resolution).
 * Visual only; highlights the current stage from the record status.
 */

const BEND_PINE = "#00A283";
const ALLOY_BLUE = "#00458C";

export const LEAD_LIFECYCLE_STAGES = [
    { key: "lead", label: "Lead" },
    { key: "qualification", label: "Qualification" },
    { key: "tour", label: "Tour" },
    { key: "waitlist", label: "Waitlist" },
    { key: "enrolling", label: "Enrolling" },
    { key: "enrolled", label: "Enrolled" },
] as const;

/** Map an opportunity status_key to a Lead lifecycle stage index. */
export function leadStageIndexForStatus(statusKey?: string | null): number {
    const k = (statusKey ?? "").toLowerCase();
    if (/(enrolled|won|complete)/.test(k)) return 5;
    if (/(enrolling|booked|accepted|active)/.test(k)) return 4;
    if (/waitlist/.test(k)) return 3;
    if (/(tour|scheduled|visit)/.test(k)) return 2;
    if (/qualif/.test(k)) return 1;
    return 0; // lead / new / contacted / quote_started
}

type StepState = "complete" | "current" | "future";

function dotClass(state: StepState): string {
    if (state === "complete") return "border-[#00A283] bg-[#00A283] text-white";
    if (state === "current") return "border-[#00458C] bg-[#00458C] text-white ring-2 ring-[#00458C]/20";
    return "border-[rgba(0,0,0,0.15)] bg-white text-[rgba(39,63,82,0.3)] ring-1 ring-[rgba(0,0,0,0.08)]";
}
function labelClass(state: StepState): string {
    if (state === "complete") return "font-medium text-[rgba(39,63,82,0.75)]";
    if (state === "current") return "font-semibold text-[rgba(39,63,82,0.92)]";
    return "text-[rgba(39,63,82,0.3)]";
}

export default function ProofLifecycleRail({ statusKey }: { statusKey?: string | null }) {
    const current = leadStageIndexForStatus(statusKey);
    return (
        <nav
            className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/80 px-2 py-1.5 shadow-sm ring-1 ring-[rgba(0,0,0,0.05)]"
            aria-label="Lifecycle"
            data-proof-lifecycle-rail="true"
        >
            <ol className="flex w-full min-w-0 list-none items-start overflow-x-auto pb-0.5">
                {LEAD_LIFECYCLE_STAGES.map((step, i) => {
                    const state: StepState = i < current ? "complete" : i === current ? "current" : "future";
                    const isLast = i === LEAD_LIFECYCLE_STAGES.length - 1;
                    return (
                        <li key={step.key} className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-1" data-stage={step.key} data-state={state}>
                            <div className="flex w-full items-center">
                                <span className={`mx-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold leading-none ${dotClass(state)}`}>
                                    {state === "complete" ? "✓" : i + 1}
                                </span>
                                {!isLast && (
                                    <span
                                        className="ml-1 h-0.5 min-w-[0.35rem] flex-1 rounded-full"
                                        style={{ backgroundColor: state === "complete" ? `${BEND_PINE}73` : state === "current" ? `${ALLOY_BLUE}59` : "rgba(0,0,0,0.12)" }}
                                        aria-hidden
                                    />
                                )}
                            </div>
                            <span className={`max-w-[5.5rem] text-center text-[10px] leading-tight tracking-wide ${labelClass(state)}`}>{step.label}</span>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
