"use client";

/**
 * ONE packet review.
 *
 * Three source documents used to mean three disconnected importer runs, and reviewing them meant
 * reading 180 destinations one at a time. The review grain here is what the packet actually
 * MEANS — 86 semantic facts and 32 obligations — with the source destinations underneath as
 * evidence an operator opens when they want to know why Alloy thinks a fact belongs somewhere.
 *
 * Everything on this screen is a PROPOSAL. There is no publish control, because this surface has no
 * publish path: its only writes are the analysis and the operator's decisions about it.
 */

import { useMemo, useState } from "react";
import type { PacketIntakeResult } from "@/lib/pos/packetIntake/contracts";
import type { PacketReviewDecision } from "@/lib/pos/packetIntake/packetIntakeDb";
import type { BusinessConceptCandidate, ConfigurationProposal } from "@/lib/pos/discovery/contracts";

export type PacketLayer = "packet" | "facts" | "collections" | "obligations";

export interface PacketFactRow {
    /** Stable proposal id — what a decision is recorded against. */
    id: string;
    concept: BusinessConceptCandidate;
    proposal: ConfigurationProposal;
    documentId: string;
    documentTitle: string;
}

const LAYERS: ReadonlyArray<{ key: PacketLayer; label: string }> = [
    { key: "packet", label: "Packet" },
    { key: "facts", label: "Semantic facts" },
    { key: "collections", label: "Collections" },
    { key: "obligations", label: "Obligations" },
];

function band(b: string): string {
    if (b === "high") return "border-emerald-300 bg-emerald-50 text-emerald-800";
    if (b === "review") return "border-amber-300 bg-amber-50 text-amber-800";
    return "border-orange-300 bg-orange-50 text-orange-800";
}

function Chip({ children, tone = "" }: { children: React.ReactNode; tone?: string }) {
    return (
        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${tone || "border-alloy-stone/25 text-alloy-midnight/55"}`}>
            {children}
        </span>
    );
}

export default function PacketIntakeReview({
    packet,
    facts,
    decisions,
    onDecision,
    onRenameArtifact,
}: {
    packet: PacketIntakeResult;
    facts: PacketFactRow[];
    decisions: Record<string, PacketReviewDecision>;
    onDecision: (d: Omit<PacketReviewDecision, "decided_by" | "decided_at">) => void;
    onRenameArtifact: (artifactId: string, name: string) => void;
}) {
    const [layer, setLayer] = useState<PacketLayer>("packet");
    const [openFact, setOpenFact] = useState<string | null>(null);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    const collections = useMemo(() => facts.filter((f) => !!f.concept.repetition || f.concept.kind === "relationship_group"), [facts]);
    const scalarFacts = useMemo(() => facts.filter((f) => !collections.includes(f)), [facts, collections]);
    const decidedCount = Object.keys(decisions).length;

    const counts = {
        sources: packet.sources.length,
        artifacts: packet.artifacts.length,
        destinations: packet.reconciliation.total_accounted,
        facts: facts.length,
        obligations: packet.obligations.length,
        signatures: packet.signatures.length,
    };

    return (
        <div className="flex flex-col gap-3" data-testid="packet-intake-review">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    {LAYERS.map((l) => (
                        <button
                            key={l.key}
                            type="button"
                            onClick={() => setLayer(l.key)}
                            data-testid={`packet-layer-${l.key}`}
                            aria-pressed={layer === l.key}
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                                layer === l.key ? "border-alloy-bend-pine bg-alloy-bend-pine text-white" : "border-alloy-stone/25 text-alloy-midnight/70"
                            }`}
                        >
                            {l.label}
                        </button>
                    ))}
                </div>
                <span className="text-[11px] text-alloy-midnight/50" data-testid="packet-decision-count">
                    {decidedCount} decision{decidedCount === 1 ? "" : "s"} recorded · nothing published
                </span>
            </div>

            {/* ── Packet ─────────────────────────────────────────────── */}
            {layer === "packet" ? (
                <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-alloy-stone/22 bg-alloy-stone/15 sm:grid-cols-3 lg:grid-cols-6">
                        {[
                            ["Sources", counts.sources],
                            ["Artifacts", counts.artifacts],
                            ["Destinations", counts.destinations],
                            ["Facts", counts.facts],
                            ["Obligations", counts.obligations],
                            ["Signatures", counts.signatures],
                        ].map(([label, n]) => (
                            <div key={String(label)} className="bg-white px-3 py-2">
                                <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{label}</div>
                                <div className="text-[17px] font-semibold tabular-nums text-alloy-midnight">{n as number}</div>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-xl border border-alloy-stone/22 bg-white p-3" data-testid="packet-reconciliation">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Destination reconciliation</div>
                        {packet.reconciliation.by_source.map((s) => (
                            <div key={s.document_id} className="flex items-baseline justify-between gap-3 border-b border-alloy-stone/12 py-1 text-[12px] last:border-b-0">
                                <span className="truncate text-alloy-midnight/75">{s.title}</span>
                                <span className="shrink-0 tabular-nums text-alloy-midnight/55">
                                    {s.raw !== null && s.raw !== s.reported ? `${s.raw} source → ` : ""}
                                    {s.reported} normalized · {s.accounted} accounted
                                </span>
                            </div>
                        ))}
                        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                            {packet.reconciliation.balanced ? (
                                <Chip tone="border-emerald-300 bg-emerald-50 text-emerald-800">Balanced</Chip>
                            ) : (
                                <Chip tone="border-red-300 bg-red-50 text-red-800">Unbalanced</Chip>
                            )}
                            <span className="text-alloy-midnight/50">
                                {packet.reconciliation.total_accounted} of {packet.reconciliation.total_reported} normalized destinations accounted for,{" "}
                                {packet.reconciliation.duplicated.length} counted twice
                            </span>
                        </div>
                    </div>

                    <div className="rounded-xl border border-alloy-stone/22 bg-white p-3">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Logical artifacts</div>
                        {packet.artifacts.map((a) => {
                            const decided = decisions[`artifact:${a.id}`];
                            const shown = decided?.name ?? a.title;
                            return (
                                <div key={`${a.document_id}:${a.id}`} className="flex flex-wrap items-center gap-2 border-b border-alloy-stone/12 py-1.5 last:border-b-0" data-testid={`packet-artifact-${a.id}`}>
                                    <span className="text-[12px] font-medium text-alloy-midnight">{shown}</span>
                                    {a.needs_name && !decided?.name ? <Chip tone="border-amber-300 bg-amber-50 text-amber-800">Needs a name</Chip> : null}
                                    {a.unsigned ? <Chip>Collects</Chip> : <Chip>{a.signature_ids.length} signature</Chip>}
                                    <span className="text-[11px] text-alloy-midnight/45">{a.destination_ids.length} destinations</span>
                                    {renaming === a.id ? (
                                        <span className="flex items-center gap-1">
                                            <input
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                className="rounded border border-alloy-stone/30 px-1.5 py-0.5 text-[11px]"
                                                data-testid={`packet-artifact-rename-input-${a.id}`}
                                                aria-label={`Name for ${shown}`}
                                            />
                                            <button
                                                type="button"
                                                className="rounded bg-alloy-bend-pine px-2 py-0.5 text-[10px] font-semibold text-white"
                                                data-testid={`packet-artifact-rename-save-${a.id}`}
                                                onClick={() => {
                                                    if (renameValue.trim()) onRenameArtifact(a.id, renameValue.trim());
                                                    setRenaming(null);
                                                }}
                                            >
                                                Save
                                            </button>
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            className="rounded border border-alloy-stone/25 px-2 py-0.5 text-[10px] text-alloy-midnight/65"
                                            data-testid={`packet-artifact-rename-${a.id}`}
                                            onClick={() => {
                                                setRenaming(a.id);
                                                setRenameValue(shown);
                                            }}
                                        >
                                            Rename
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {packet.warnings.length > 0 ? (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900" data-testid="packet-warnings">
                            {packet.warnings.map((w) => (
                                <div key={w}>{w}</div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* ── Semantic facts ─────────────────────────────────────── */}
            {layer === "facts" || layer === "collections" ? (
                <div className="flex flex-col gap-1.5" data-testid={`packet-${layer}-list`}>
                    {(layer === "facts" ? scalarFacts : collections).map((f) => {
                        const decision = decisions[`fact:${f.id}`];
                        const target = f.proposal.target_field_source;
                        const open = openFact === f.id;
                        return (
                            <div key={f.id} className="rounded-xl border border-alloy-stone/22 bg-white px-3 py-2" data-testid={`packet-fact-${f.id}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <span className="truncate text-[13px] font-semibold text-alloy-midnight">{f.concept.label}</span>
                                        <Chip tone={band(f.proposal.confidence.band)}>{f.proposal.confidence.band}</Chip>
                                        {f.concept.repetition ? <Chip>×{f.concept.repetition.instances}</Chip> : null}
                                        {f.concept.party ? <Chip>{f.concept.party.replace(/_/g, " ")}</Chip> : null}
                                        {decision ? <Chip tone="border-emerald-300 bg-emerald-50 text-emerald-800">{decision.decision}</Chip> : null}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <button
                                            type="button"
                                            className="rounded-lg border border-alloy-stone/25 px-2 py-1 text-[11px] text-alloy-midnight/70"
                                            data-testid={`packet-fact-evidence-${f.id}`}
                                            onClick={() => setOpenFact(open ? null : f.id)}
                                        >
                                            {open ? "Hide evidence" : `Evidence (${f.concept.source.destinations?.length ?? 0})`}
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white"
                                            data-testid={`packet-fact-accept-${f.id}`}
                                            onClick={() => onDecision({ subject: "fact", subject_id: f.id, decision: "accepted", ...(target ? { field_source: target } : {}) })}
                                        >
                                            Accept
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-lg border border-alloy-stone/25 px-2.5 py-1 text-[11px] text-alloy-midnight/65"
                                            data-testid={`packet-fact-form-only-${f.id}`}
                                            onClick={() => onDecision({ subject: "fact", subject_id: f.id, decision: "form_only" })}
                                        >
                                            Form only
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-lg border border-alloy-stone/25 px-2.5 py-1 text-[11px] text-alloy-midnight/65"
                                            data-testid={`packet-fact-reject-${f.id}`}
                                            onClick={() => onDecision({ subject: "fact", subject_id: f.id, decision: "rejected" })}
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>

                                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">{f.proposal.explanation}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-alloy-midnight/45">
                                    <span>{f.documentTitle}</span>
                                    {target ? <span className="font-medium text-alloy-midnight/60">→ {target.entity_type}.{target.field_key}</span> : <span>no canonical binding proposed</span>}
                                    {f.concept.source.destinations ? <span>{f.concept.source.destinations.length} source destination(s)</span> : null}
                                    {f.proposal.refused_binding ? (
                                        <span className="text-orange-700" data-testid={`packet-fact-refused-${f.id}`}>
                                            refused {f.proposal.refused_binding.target.entity_type}.{f.proposal.refused_binding.target.field_key}
                                        </span>
                                    ) : null}
                                </div>

                                {f.proposal.refused_binding ? (
                                    <p className="mt-1 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] text-orange-900">
                                        {f.proposal.refused_binding.reason}
                                    </p>
                                ) : null}

                                {open ? (
                                    <div className="mt-2 rounded-lg border border-alloy-stone/20 bg-alloy-stone/6 p-2" data-testid={`packet-fact-lineage-${f.id}`}>
                                        {(f.concept.source.destinations ?? []).map((d) => (
                                            <div key={d.evidence} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-alloy-stone/12 py-1 text-[11px] last:border-b-0">
                                                <span className="font-medium text-alloy-midnight/75">{d.label}</span>
                                                <span className="text-alloy-midnight/45">
                                                    {f.documentTitle} · {d.section_title}
                                                    {d.page ? ` · page ${d.page}` : ""}
                                                    {d.logical_artifact_id ? ` · ${d.logical_artifact_id}` : ""}
                                                </span>
                                                <code className="text-[10px] text-alloy-midnight/40">{d.evidence}</code>
                                            </div>
                                        ))}
                                        {(f.concept.source.destinations ?? []).length === 0 ? (
                                            <span className="text-[11px] text-alloy-midnight/45">No destination lineage — this fact came from prose.</span>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {/* ── Obligations ────────────────────────────────────────── */}
            {layer === "obligations" ? (
                <div className="flex flex-col gap-1.5" data-testid="packet-obligations-list">
                    {packet.signatures.map((s) => (
                        <div key={s.id} className="rounded-xl border border-alloy-stone/22 bg-white px-3 py-2" data-testid={`packet-signature-${s.id}`}>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[13px] font-semibold text-alloy-midnight">Signature</span>
                                <Chip>{s.variant}</Chip>
                                <Chip>{s.signer_grain}</Chip>
                                <span className="text-[11px] text-alloy-midnight/55">executes {s.logical_artifact_title ?? "—"}</span>
                                {s.date_destination_id ? <Chip tone="border-emerald-300 bg-emerald-50 text-emerald-800">dated</Chip> : <Chip>no date</Chip>}
                            </div>
                            <p className="mt-1 text-[11px] text-alloy-midnight/50">{s.date_signals[0]}</p>
                        </div>
                    ))}
                    {packet.obligations.map((o) => {
                        const decision = decisions[`obligation:${o.id}`];
                        return (
                            <div key={o.id} className="rounded-xl border border-alloy-stone/22 bg-white px-3 py-2" data-testid={`packet-obligation-${o.id}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <Chip>{o.kind.replace(/_/g, " ")}</Chip>
                                        <Chip tone={o.relation === "same_obligation" ? "border-sky-300 bg-sky-50 text-sky-800" : ""}>{o.relation.replace(/_/g, " ")}</Chip>
                                        {o.members.length > 1 ? <Chip>{o.members.length} artifacts</Chip> : null}
                                        {decision ? <Chip tone="border-emerald-300 bg-emerald-50 text-emerald-800">{decision.decision}</Chip> : null}
                                    </div>
                                    <button
                                        type="button"
                                        className="shrink-0 rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white"
                                        data-testid={`packet-obligation-confirm-${o.id}`}
                                        onClick={() => onDecision({ subject: "obligation", subject_id: o.id, decision: "confirmed" })}
                                    >
                                        Confirm
                                    </button>
                                </div>
                                <p className="mt-1 line-clamp-2 text-[12px] text-alloy-midnight/75">{o.members[0]?.label}</p>
                                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">{o.explanation}</p>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
