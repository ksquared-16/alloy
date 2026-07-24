"use client";

/**
 * POS Processing — Column 2, the Case Detail spine (top half):
 *   Source Viewer → Classification → Record Context (when available) → Proposal (future)
 *
 * Honest by construction:
 *   • Source Viewer shows the SUBMITTED source content (forms) + source evidence —
 *     never "extracted" values it doesn't have.
 *   • Classification is its own first-class stage, BEFORE any proposal.
 *   • Proposal stays an explicit pending state until extraction/matching exist.
 * Read-only; nothing is promoted here (that's the Decision/Commit column).
 */

import type { PosCaseState } from "./usePosCase";
import { POS_SOURCE_KIND_LABELS } from "./posSections";
import PosPanel from "./PosPanel";
import ClassificationPanel from "./ClassificationPanel";
import WhatAlloyFound from "./WhatAlloyFound";
import { ProcessingCollectionEvidencePanel } from "@/components/pos/ProcessingCollectionEvidencePanel";
import { buildMatchedRecords } from "@/lib/pos/matchedRecordsPresentation";

function statusLabel(s: string): string {
    return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatWhen(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function PosCaseWorkColumn({ state }: { state: PosCaseState }) {
    const { detail, evidence, rec, recLoading, loading, error, reload } = state;

    if (loading && !detail) {
        return (
            <div className="space-y-3 p-3" aria-busy="true">
                <div className="h-16 animate-pulse rounded-lg bg-stone-100" />
                <div className="h-24 animate-pulse rounded-lg bg-stone-100" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="m-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-medium">Couldn’t load this case</div>
                <div className="mt-0.5 text-xs text-amber-700">{error}</div>
                <button
                    type="button"
                    onClick={() => void reload()}
                    className="mt-2 rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                    Retry
                </button>
            </div>
        );
    }
    if (!detail) return null;

    const primary = detail.sources.find((s) => s.role === "primary") ?? detail.sources[0] ?? null;
    const submitted = evidence.flatMap((e) => e.proposedValues);
    const collectionGroups = evidence.flatMap((e) => e.collectionEvidence?.groups ?? []);
    const collectionDiagnostics = evidence.flatMap((e) => e.collectionEvidence?.diagnostics ?? []);
    const matchedRecords =
        rec?.supported && rec.recommendation
            ? buildMatchedRecords({
                  recommendation: rec.recommendation,
                  intent: rec.intent ?? null,
                  submitted: submitted.map((v) => ({ label: v.label, value: v.value ?? null })),
              })
            : [];

    return (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {/* Source summary header */}
            <div className="rounded-lg border border-l-2 border-alloy-juniper border-alloy-stone/15 bg-alloy-bend-pine/[0.06] px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-alloy-midnight">
                        {detail.caseTitle ?? primary?.display.label ?? "Processing case"}
                    </span>
                    <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10.5px] font-medium text-alloy-bend-pine">
                        {statusLabel(detail.status)}
                    </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-stone-600">
                    <span>{POS_SOURCE_KIND_LABELS[primary?.kind ?? ""] ?? "Source"}</span>
                    {detail.caseTitle && primary?.display.label ? <span>· Submitted through {primary.display.label}</span> : null}
                    {primary?.display.channel ? <span>· via {primary.display.channel}</span> : null}
                    <span>· received {formatWhen(primary?.display.receivedAt ?? detail.createdAt)}</span>
                </div>
            </div>

            {/* 1 — What came in: submitted content + where it came from (the raw source).
                `!h-auto` overrides the accent surface's `h-full`: these panels are STACKED in a
                scrolling column, not filling a flex slot, so h-full stretched this panel down the
                entire column and left a large dead gap under "Where it came from". */}
            <PosPanel eyebrow="What came in" className="!h-auto">
                {submitted.length > 0 ? (
                    <>
                        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">Submitted values</div>
                        <dl className="space-y-1.5">
                            {submitted.map((v, i) => (
                                <div key={`${v.label}:${i}`} className="flex gap-2 text-[12.5px]">
                                    <dt className="w-40 shrink-0 text-stone-500">{v.label}</dt>
                                    <dd className="min-w-0 flex-1 font-medium text-alloy-midnight">{v.value ?? "—"}</dd>
                                </div>
                            ))}
                        </dl>
                    </>
                ) : (
                    <div className="text-[12.5px] text-stone-400">No submitted values on this source — see evidence below.</div>
                )}

                <div className="mt-2.5 border-t border-alloy-stone/10 pt-2">
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">Where it came from</div>
                    <ul className="space-y-1.5">
                        {detail.sources.map((s) => {
                            const ev = evidence.find((e) => e.kind === s.kind && e.id === s.id);
                            return (
                                <li
                                    key={`${s.kind}:${s.id}`}
                                    className="flex items-center gap-2 rounded-md border border-stone-200 px-2.5 py-1.5"
                                >
                                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
                                        {POS_SOURCE_KIND_LABELS[s.kind] ?? "Source"}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-stone-800">{s.display.label}</span>
                                    {ev?.documentId ? (
                                        <span className="shrink-0 text-[11px] font-medium text-alloy-juniper">Open document</span>
                                    ) : (
                                        <span className="shrink-0 text-[10px] text-stone-400">{s.role}</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </PosPanel>

            {/* 1b — What Alloy found: the existing records it matched, next to "What came in" so the
                operator can compare the two before deciding (§1). This is the primary place for
                match discovery — the right rail carries only the concise decision. */}
            <PosPanel eyebrow="What Alloy found" accent={false} className="!h-auto">
                <WhatAlloyFound rec={rec} recLoading={recLoading} />
            </PosPanel>

            {collectionGroups.length > 0 || collectionDiagnostics.length > 0 ? (
                <PosPanel eyebrow="Related records proposed" className="!h-auto">
                    <ProcessingCollectionEvidencePanel groups={collectionGroups} diagnostics={collectionDiagnostics} caseId={detail.id} onCommitted={reload} />
                    <p className="mt-2 text-[11px] text-stone-500">Existing Child updates can be approved field-by-field. New children and Parents/Guardians remain read-only.</p>
                </PosPanel>
            ) : null}

            {/* 2 — Classification (first-class, before any proposal) */}
            <ClassificationPanel
                classification={detail.classification}
                primarySourceKind={primary?.kind ?? null}
                caseId={detail.id}
                onCorrected={reload}
            />

            {/* 3 — Matched records: the actual proposed/confirmed records in human language */}
            <PosPanel eyebrow="Records" accent={false}>
                {matchedRecords.length > 0 ? (
                    <ul className="space-y-2">
                        {matchedRecords.map((r, i) => (
                            <li key={`${r.role}:${i}`} className="rounded-md border border-alloy-stone/25 bg-white px-3 py-2">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{r.title}</div>
                                {r.name ? <div className="mt-0.5 text-[13px] font-medium text-alloy-midnight">{r.name}</div> : null}
                                {r.details.map((d, j) => (
                                    <div key={j} className="text-[12px] text-alloy-midnight/70">{d}</div>
                                ))}
                                <div
                                    className={`mt-1 text-[11.5px] ${
                                        r.basisTone === "match"
                                            ? "text-alloy-bend-pine"
                                            : r.basisTone === "review"
                                              ? "text-alloy-gold-dark"
                                              : "text-alloy-midnight/50"
                                    }`}
                                >
                                    {r.basis}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-[12.5px] text-stone-400">No records to show yet — resolved at commit.</div>
                )}
            </PosPanel>
        </div>
    );
}
