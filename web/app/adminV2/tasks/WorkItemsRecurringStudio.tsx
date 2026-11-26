"use client";

/**
 * Studio → Recurring Work.
 *
 * The authority model is settled and written down (see the governance doc); the generation runtime
 * is not built. This surface states that plainly rather than rendering an empty definition table
 * that would imply an administrator's definition would start producing work — the operator-facing
 * cost of a convincing shell over an absent runtime is missed operational work.
 */

import { CalendarClock } from "lucide-react";

const CADENCES = ["Daily", "Selected weekdays", "Weekly", "Monthly", "Annual", "Custom interval"];

const EXAMPLES = [
    { title: "Opening checklist", cadence: "Every weekday, 6:00 AM", assignee: "Opening director" },
    { title: "Fire extinguisher inspection", cadence: "First Monday monthly", assignee: "Site director" },
    { title: "Subsidy review", cadence: "Every Wednesday", assignee: "Billing specialist" },
    { title: "Classroom sanitation review", cadence: "Every Friday, one per room", assignee: "Room lead" },
];

export default function WorkItemsRecurringStudio() {
    return (
        <div className="mx-auto w-full max-w-2xl space-y-5 py-2" data-work-items-studio-recurring="true">
            <header className="space-y-1.5">
                <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-alloy-juniper" aria-hidden strokeWidth={2} />
                    <h2 className="text-[15px] font-semibold text-alloy-midnight">Recurring Work</h2>
                </div>
                <p className="text-[12px] leading-relaxed text-alloy-midnight/62">
                    Define operational work that should be created on a cadence — an opening checklist, a
                    monthly inspection, a weekly review — and it arrives in the Work Items queue like any
                    other work.
                </p>
            </header>

            <div
                className="rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.025] px-4 py-3.5"
                data-work-items-recurring-status="specified"
            >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Not yet generating work
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-alloy-midnight/68">
                    The product and authority model for recurring work is settled: a definition creates
                    manual operational work on a schedule, and it never masquerades as Business Process
                    stage work. The generation runtime is specified but not built, so no definitions can be
                    created here yet — an administrator saving one today would be promised work that never
                    arrives.
                </p>
            </div>

            <section className="space-y-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                    What it will create
                </h3>
                <ul className="space-y-1.5">
                    {EXAMPLES.map((e) => (
                        <li
                            key={e.title}
                            className="flex items-baseline justify-between gap-3 rounded-lg border border-alloy-stone/16 bg-white px-3 py-2"
                        >
                            <span className="text-[12px] font-medium text-alloy-midnight/85">{e.title}</span>
                            <span className="shrink-0 text-right text-[11px] text-alloy-midnight/52">
                                {e.cadence}
                                <span className="block text-alloy-midnight/40">{e.assignee}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="space-y-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                    Cadences in scope
                </h3>
                <div className="flex flex-wrap gap-1.5">
                    {CADENCES.map((c) => (
                        <span
                            key={c}
                            className="rounded-full border border-alloy-stone/20 bg-white px-2.5 py-0.5 text-[11px] text-alloy-midnight/62"
                        >
                            {c}
                        </span>
                    ))}
                </div>
            </section>
        </div>
    );
}
