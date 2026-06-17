"use client";

/**
 * POS → Documents (prototype surface).
 *
 * Shows the two intended document intake workflows so the product story is
 * visible end-to-end:
 *   A. Document → Data    (extract values → open a Processing case → approve)
 *   B. Document → Form    (read structure → draft a form → publish)
 *
 * Storage + upload foundations already exist (`POST /api/admin/documents/upload`,
 * Supabase bucket `org_documents`). AI extraction / structure detection are NOT
 * wired yet — these actions are clearly marked Prototype and route the operator
 * to the relevant POS section so the flow is demonstrable today.
 */

import { ArrowRight, FileSearch, FileUp, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { PosSection } from "./posSections";

function WorkflowCard({
    badge,
    title,
    steps,
    cta,
    onCta,
    icon,
}: {
    badge: string;
    title: string;
    steps: string[];
    cta: string;
    onCta: () => void;
    icon: ReactNode;
}) {
    return (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-stone-700">
                    {icon}
                    <span className="text-sm font-semibold text-stone-900">{title}</span>
                </span>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">{badge}</span>
            </div>
            <ol className="mb-3 space-y-1">
                {steps.map((s, i) => (
                    <li key={s} className="flex items-center gap-2 text-[12px] text-stone-600">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-500">
                            {i + 1}
                        </span>
                        {s}
                        {i < steps.length - 1 ? <ArrowRight className="h-3 w-3 text-stone-300" aria-hidden /> : null}
                    </li>
                ))}
            </ol>
            <button
                type="button"
                onClick={onCta}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
                {cta}
            </button>
        </div>
    );
}

export default function PosDocumentsPanel({ onNavigate }: { onNavigate: (section: PosSection) => void }) {
    return (
        <div className="h-full overflow-y-auto bg-[#f7f6f3] p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-stone-900">Documents</h3>
                    <p className="mt-0.5 text-xs text-stone-500">
                        Upload a document and let Alloy turn it into data or a form. Storage is live; extraction is being wired.
                    </p>
                </div>
                <button
                    type="button"
                    disabled
                    title="Upload UI is wired to /api/admin/documents/upload; the POS picker lands next sprint"
                    className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-emerald-600/60 px-3 py-2 text-xs font-semibold text-white"
                >
                    <FileUp className="h-3.5 w-3.5" aria-hidden />
                    Upload Document
                </button>
            </div>

            <div className="mb-4 grid gap-3 lg:grid-cols-2">
                <WorkflowCard
                    icon={<FileSearch className="h-4 w-4" />}
                    title="Document → Data"
                    badge="Prototype"
                    steps={["Upload", "Extract values", "Open Processing case", "Review", "Approve"]}
                    cta="See it in Processing"
                    onCta={() => onNavigate("processing")}
                />
                <WorkflowCard
                    icon={<Sparkles className="h-4 w-4" />}
                    title="Document → Form"
                    badge="Prototype"
                    steps={["Upload", "Read structure", "Draft form", "Review", "Publish"]}
                    cta="See it in Forms"
                    onCta={() => onNavigate("forms")}
                />
            </div>

            <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50/60 p-4 text-[12px] leading-relaxed text-stone-500">
                <span className="font-medium text-stone-600">Foundations in place:</span> document storage, upload API, and signed-url
                reads already exist. Extracted documents will open a Processing case (source kind <code className="rounded bg-stone-100 px-1 text-[11px]">document</code>)
                so they appear in the queue alongside form and packet intake — no separate inbox.
            </div>
        </div>
    );
}
