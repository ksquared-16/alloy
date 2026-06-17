"use client";

/**
 * POS-FP9 (Sprint 2.5) — Classification panel for Processing Case detail.
 *
 * Read-only presentation of the deterministic classification stored on the case
 * (`metadata.classification`, surfaced via the read model). It shows label, key,
 * confidence, status, signals, and classified_at, with honest empty states
 * (awaiting / unknown / unsupported). It never shows extraction or proposed changes.
 *
 * Operator correction (confirm / change / mark unknown) is DEFERRED this sprint:
 * the actions are rendered DISABLED with a "Planned" badge rather than faked. They
 * become live once the mutation endpoint exists:
 *   PATCH /api/admin/processing/cases/[caseId]/classification
 *   body: { classification_key, status: "classified" | "unknown" }
 *   (annotation-only; reuses dbStoreProcessingCaseClassification; sets source "operator").
 */

import type { ReactNode } from "react";
import { resolveClassificationPanelView, type ConfidenceTier } from "@/lib/pos/processingCase/classification/classificationPanelView";
import type { StoredProcessingClassification } from "@/lib/pos/processingCase/classification/types";

const KEY_LABELS: Record<string, string> = {
    subsidy_contract: "Subsidy contract",
    remittance: "Remittance",
    immunization_record: "Immunization record",
    enrollment_document: "Enrollment document",
    form_like_document: "Form-like document",
    unknown: "Unknown",
};

const CONFIDENCE_STYLE: Record<ConfidenceTier, string> = {
    high: "bg-emerald-50 text-emerald-800",
    medium: "bg-amber-50 text-amber-800",
    low: "bg-amber-50 text-amber-800",
    none: "bg-stone-100 text-stone-600",
};

function formatWhen(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Eyebrow({ children }: { children: ReactNode }) {
    return <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-stone-400">{children}</div>;
}

function Shell({ children }: { children: ReactNode }) {
    return (
        <section className="mb-5 rounded-lg border border-stone-200 bg-white p-3.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-500">Classification</span>
                <span className="text-[10px] text-stone-400">Deterministic · no extraction</span>
            </div>
            {children}
        </section>
    );
}

/** Deferred operator-correction row: visible decision model, disabled until the endpoint exists. */
function CorrectionActions() {
    const actions = ["Confirm", "Change classification", "Mark unknown"];
    return (
        <div className="mt-3 border-t border-stone-100 pt-2.5">
            <Eyebrow>Operator correction</Eyebrow>
            <div className="flex flex-wrap items-center gap-2">
                {actions.map((label) => (
                    <button
                        key={label}
                        type="button"
                        disabled
                        title="Planned — enables once PATCH /api/admin/processing/cases/[caseId]/classification ships"
                        className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-[12px] text-stone-400"
                    >
                        {label}
                        <span className="rounded bg-stone-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-stone-400">
                            Planned
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

export default function ClassificationPanel({
    classification,
    primarySourceKind,
}: {
    classification: StoredProcessingClassification | null;
    primarySourceKind: string | null;
}) {
    const view = resolveClassificationPanelView({ classification, primarySourceKind });

    if (view.mode === "hidden") return null;

    if (view.mode === "awaiting") {
        return (
            <Shell>
                <div className="text-[13px] font-medium text-stone-700">Awaiting classification</div>
                <p className="mt-0.5 text-[12px] text-stone-500">
                    This source hasn’t been classified yet. Classification runs automatically when a document case is opened.
                </p>
            </Shell>
        );
    }

    if (view.mode === "unsupported") {
        return (
            <Shell>
                <div className="text-[13px] font-medium text-stone-700">Unsupported source</div>
                <p className="mt-0.5 text-[12px] text-stone-500">
                    This source kind isn’t classified here — forms and packets use their own intake path.
                </p>
            </Shell>
        );
    }

    if (view.mode === "unknown") {
        return (
            <Shell>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                        Unknown document
                    </span>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-medium text-stone-600">
                        No confidence
                    </span>
                </div>
                <p className="mt-1 text-[12px] text-stone-500">
                    No filename, type, or metadata signal matched a known category. An operator can set it manually.
                </p>
                <div className="mt-2 text-[11.5px] text-stone-400">Classified {formatWhen(view.classifiedAt)}</div>
                <CorrectionActions />
            </Shell>
        );
    }

    // mode === "classified"
    return (
        <Shell>
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#00A283] px-2 py-0.5 text-[11px] font-semibold text-white">
                    {KEY_LABELS[view.key] ?? view.label}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${CONFIDENCE_STYLE[view.confidenceTier]}`}>
                    {view.confidencePct}% confidence
                </span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-medium text-stone-600">
                    {view.statusLabel}
                </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-stone-400">
                <code className="rounded bg-stone-100 px-1 py-0.5 text-[10px] text-stone-500">{view.key}</code>
                <span>· {view.classifierVersion}</span>
                <span>· {formatWhen(view.classifiedAt)}</span>
            </div>

            <div className="mt-3">
                <Eyebrow>Signals ({view.signals.length})</Eyebrow>
                {view.signals.length === 0 ? (
                    <div className="text-[12px] text-stone-400">No explainable signals recorded.</div>
                ) : (
                    <ul className="flex flex-wrap gap-1.5">
                        {view.signals.map((s, i) => (
                            <li
                                key={`${s.source}:${s.value}:${i}`}
                                className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-stone-50/60 px-2 py-0.5 text-[11.5px] text-stone-700"
                            >
                                <span className="text-stone-400">{s.source}:</span>
                                <span className="font-medium">{s.value}</span>
                                <span className="rounded bg-stone-100 px-1 py-0.5 text-[9.5px] text-stone-500">+{s.weightPct}%</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <CorrectionActions />
        </Shell>
    );
}
