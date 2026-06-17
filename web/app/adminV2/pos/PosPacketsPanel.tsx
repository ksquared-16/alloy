"use client";

/**
 * POS → Packets (prototype).
 *
 * Introduces the parent-facing guided journey concept: instead of Form → Form →
 * Form, a family completes ONE Enrollment Packet. Behind the scenes Alloy
 * generates forms/documents, (eventually) PDFs + emails, updates records, and
 * opens Processing cases only for review/exceptions.
 *
 * Packet definitions + session review are presented natively (prototype — no jump
 * to the legacy /admin/forms app). The journey stepper below is an illustrative
 * prototype of the parent experience.
 */

import { Check, FileSignature, FileText, FolderUp, Send, User, Users } from "lucide-react";
import type { ReactNode } from "react";

const JOURNEY_STEPS: Array<{ icon: ReactNode; title: string; detail: string }> = [
    { icon: <User className="h-4 w-4" />, title: "Child information", detail: "Confirm pre-filled child details." },
    { icon: <Users className="h-4 w-4" />, title: "Parent / guardian", detail: "Confirm family + contact info." },
    { icon: <FolderUp className="h-4 w-4" />, title: "Upload immunizations", detail: "Attach required documents." },
    { icon: <FileText className="h-4 w-4" />, title: "Review generated forms", detail: "Consent, policy, state-required." },
    { icon: <FileSignature className="h-4 w-4" />, title: "Sign", detail: "Sign once, where required." },
    { icon: <Send className="h-4 w-4" />, title: "Submit", detail: "One submission completes the packet." },
];

const BEHIND_THE_SCENES = [
    "Forms are generated from the packet definition",
    "Documents (immunizations, IDs) are collected in-flow",
    "Final PDFs are created and emailed to parents (later)",
    "Child / family records are updated",
    "Processing cases open only for review or exceptions",
];

export default function PosPacketsPanel() {
    return (
        <div className="h-full overflow-y-auto bg-white p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-stone-900">Packets</h3>
                    <p className="mt-0.5 text-xs text-stone-500">
                        One guided journey, many forms behind it. A parent never sees “form after form.”
                    </p>
                </div>
                <button
                    type="button"
                    disabled
                    title="Prototype — native packet builder lands next"
                    className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-[#00A283]/60 px-3 py-2 text-xs font-semibold text-white"
                >
                    Create Packet
                </button>
            </div>

            {/* Parent-facing journey (prototype illustration) */}
            <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                        Enrollment Packet · parent journey
                    </span>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Prototype</span>
                </div>
                <ol className="grid gap-2 sm:grid-cols-3">
                    {JOURNEY_STEPS.map((s, i) => (
                        <li key={s.title} className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50/60 p-2.5">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                                {s.icon}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-[12px] font-medium text-stone-900">
                                    {i + 1}. {s.title}
                                </span>
                                <span className="block text-[11px] leading-snug text-stone-500">{s.detail}</span>
                            </span>
                        </li>
                    ))}
                </ol>
            </section>

            {/* Behind the scenes (operator value) */}
            <section className="mb-5">
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Behind the scenes</h4>
                <ul className="space-y-1.5 rounded-lg border border-stone-200 bg-white p-3">
                    {BEHIND_THE_SCENES.map((b) => (
                        <li key={b} className="flex items-start gap-2 text-[12px] text-stone-700">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                            {b}
                        </li>
                    ))}
                </ul>
            </section>

            {/* Real operator surfaces */}
            <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Manage</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700">
                        <span className="block font-medium text-stone-900">Packet definitions</span>
                        <span className="mt-0.5 block text-[11px] text-stone-500">Build the ordered steps a packet contains</span>
                        <span className="mt-1 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-stone-400">
                            Native builder — prototype
                        </span>
                    </div>
                    <div className="rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700">
                        <span className="block font-medium text-stone-900">Packet sessions</span>
                        <span className="mt-0.5 block text-[11px] text-stone-500">Review submitted packets + approve outcomes</span>
                        <span className="mt-1 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-stone-400">
                            Native review — prototype
                        </span>
                    </div>
                </div>
            </section>
        </div>
    );
}
