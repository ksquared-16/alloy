"use client";

/**
 * POS-FP16 — Configuration Discovery: concept-first review.
 *
 * The operator reviews the imported document as a governed OPERATING-MODEL PROPOSAL — existing
 * fields matched, new fields proposed, relationships, requirements, static/legal, output copies —
 * NOT by reconstructing 112 raw questions. The detailed field/question review stays available as a
 * secondary drill-down. Renders the deterministic `ConfigurationDiscoveryResult`; decisions are the
 * operator's (accept / ignore / bulk-accept high-confidence).
 */

import { useMemo } from "react";
import { Check, ChevronRight, Layers } from "lucide-react";
import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";
import {
    confidenceLabel,
    type BusinessConceptCandidate,
    type ConfidenceBand,
    type ConfigurationDiscoveryResult,
    type ConfigurationProposal,
    type DiscoveryCategory,
    type ProposalDecisionState,
    type ProposalDisposition,
} from "@/lib/pos/discovery/contracts";

const CATEGORY_ORDER: DiscoveryCategory[] = [
    "existing_fields",
    "relationships",
    "new_fields",
    "form_responses",
    "upload_requirements",
    "acknowledgements",
    "signatures",
    "static_content",
    "output_copies",
    "needs_review",
];

const DISPOSITION_LABEL: Record<ProposalDisposition, string> = {
    reuse_canonical_field: "Existing field",
    reuse_existing_field: "Existing field",
    create_proposed_field: "New field",
    form_only_response: "Form response",
    relationship_binding: "Relationship",
    upload_requirement: "Upload requirement",
    acknowledgement: "Acknowledgement",
    signature_requirement: "Signature",
    static_content: "Static content",
    output_binding: "Output copy",
    derived_value: "Derived value",
    unresolved: "Needs classification",
};

function categoryFor(p: ConfigurationProposal): DiscoveryCategory {
    switch (p.disposition) {
        case "reuse_canonical_field":
        case "reuse_existing_field":
            return "existing_fields";
        case "create_proposed_field":
            return "new_fields";
        case "form_only_response":
            return "form_responses";
        case "relationship_binding":
            return "relationships";
        case "upload_requirement":
            return "upload_requirements";
        case "acknowledgement":
            return "acknowledgements";
        case "signature_requirement":
            return "signatures";
        case "static_content":
            return "static_content";
        case "output_binding":
            return "output_copies";
        default:
            return "needs_review";
    }
}

const CATEGORY_TITLE: Record<DiscoveryCategory, string> = {
    existing_fields: "Existing data",
    relationships: "Relationships",
    new_fields: "New fields",
    form_responses: "Form responses",
    upload_requirements: "Document requirements",
    acknowledgements: "Acknowledgements",
    signatures: "Signatures",
    static_content: "Static & legal",
    output_copies: "Internal / output",
    needs_review: "Needs review",
};

function bandChip(band: ConfidenceBand) {
    const cls =
        band === "high"
            ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
            : band === "review"
              ? "bg-amber-100 text-amber-800"
              : band === "attention"
                ? "bg-orange-100 text-orange-800"
                : "bg-alloy-stone/20 text-alloy-midnight/60";
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{confidenceLabel(band)}</span>;
}

function targetSummary(p: ConfigurationProposal): string {
    if (p.target_field_source) return `${p.target_field_source.entity_type} · ${p.target_field_source.field_key}`;
    if (p.target_relationship_role) return `role · ${p.target_relationship_role.replace(/_/g, " ")}`;
    if (p.target_requirement_type) return p.target_requirement_type;
    if (p.proposed_field) return `new · ${p.proposed_field.entity_type} · ${p.proposed_field.data_type}`;
    return "";
}

export default function ProcessingConceptReview({
    discovery,
    conceptById,
    decisions,
    onDecision,
    onBulkAcceptHighConfidence,
    onOpenDetailed,
}: {
    discovery: ConfigurationDiscoveryResult;
    conceptById: Map<string, BusinessConceptCandidate>;
    decisions: Record<string, ProposalDecisionState>;
    onDecision: (proposalId: string, state: ProposalDecisionState) => void;
    onBulkAcceptHighConfidence: () => void;
    onOpenDetailed: () => void;
}) {
    const grouped = useMemo(() => {
        const map = new Map<DiscoveryCategory, ConfigurationProposal[]>();
        for (const p of discovery.proposals) {
            const c = categoryFor(p);
            const arr = map.get(c) ?? [];
            arr.push(p);
            map.set(c, arr);
        }
        return CATEGORY_ORDER.filter((c) => (map.get(c)?.length ?? 0) > 0).map((c) => ({ category: c, proposals: map.get(c)! }));
    }, [discovery.proposals]);

    const highConfidencePending = discovery.proposals.filter(
        (p) => p.confidence.band === "high" && (decisions[p.id] ?? p.decision_state) === "proposed"
    ).length;

    return (
        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-4" data-testid="processing-concept-review">
            <div className="mx-auto max-w-4xl">
                {/* header */}
                <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-alloy-bend-pine" aria-hidden />
                            <h2 className="text-[15px] font-semibold text-alloy-midnight">What this document configures</h2>
                        </div>
                        <p className="mt-1 text-[12px] text-alloy-midnight/55">
                            {discovery.concepts.length} concepts, reviewed as your operating model — not {countRawFields(discovery)} individual questions.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {highConfidencePending > 0 ? (
                            <button type="button" onClick={onBulkAcceptHighConfidence} className={WS_ACTION_SECONDARY} data-testid="concept-bulk-accept">
                                <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Accept {highConfidencePending} high-confidence
                            </button>
                        ) : null}
                        <button type="button" onClick={onOpenDetailed} className={WS_ACTION_SECONDARY} data-testid="concept-open-detailed">
                            View detailed questions <ChevronRight className="ml-0.5 inline h-3.5 w-3.5" aria-hidden />
                        </button>
                    </div>
                </header>

                {/* summary chips */}
                <div className="mt-4 flex flex-wrap gap-2" data-testid="concept-summary">
                    {discovery.summary.map((s) => (
                        <div key={s.category} className="rounded-xl border border-alloy-stone/15 bg-alloy-stone/[0.03] px-3 py-2">
                            <div className="text-[16px] font-semibold tabular-nums text-alloy-midnight">{s.count}</div>
                            <div className="text-[10px] font-medium text-alloy-midnight/55">{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* grouped concepts */}
                <div className="mt-5 space-y-5">
                    {grouped.map(({ category, proposals }) => (
                        <section key={category} data-testid={`concept-group-${category}`}>
                            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/40">{CATEGORY_TITLE[category]}</h3>
                            <div className="mt-2 space-y-1.5">
                                {proposals.map((p) => {
                                    const concept = conceptById.get(p.candidate_id);
                                    const state = decisions[p.id] ?? p.decision_state;
                                    const ignored = state === "ignored";
                                    const accepted = state === "accepted";
                                    return (
                                        <div
                                            key={p.id}
                                            className={`rounded-xl border px-3.5 py-2.5 transition-colors ${
                                                ignored
                                                    ? "border-alloy-stone/15 bg-alloy-stone/[0.03] opacity-55"
                                                    : accepted
                                                      ? "border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.04]"
                                                      : "border-alloy-stone/15 bg-white"
                                            }`}
                                            data-testid={`concept-row-${p.id}`}
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[13px] font-semibold text-alloy-midnight">{concept?.label ?? p.candidate_id}</span>
                                                    <span className="rounded border border-alloy-stone/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                                        {DISPOSITION_LABEL[p.disposition]}
                                                    </span>
                                                    {bandChip(p.confidence.band)}
                                                    {accepted ? <Check className="h-3.5 w-3.5 text-alloy-bend-pine" aria-hidden /> : null}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    {!ignored ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => onDecision(p.id, accepted ? "proposed" : "accepted")}
                                                            className="rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                                                            data-testid={`concept-accept-${p.id}`}
                                                        >
                                                            {accepted ? "Accepted" : "Accept"}
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        onClick={() => onDecision(p.id, ignored ? "proposed" : "ignored")}
                                                        className="rounded-lg border border-alloy-stone/20 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/60"
                                                        data-testid={`concept-ignore-${p.id}`}
                                                    >
                                                        {ignored ? "Restore" : "Ignore"}
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">{p.explanation}</p>
                                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-alloy-midnight/40">
                                                {targetSummary(p) ? <span className="font-medium text-alloy-midnight/55">{targetSummary(p)}</span> : null}
                                                <span>page {p.source.page} · {p.source.section_title}</span>
                                                {p.validation_issues.length ? <span className="text-orange-700">{p.validation_issues[0]}</span> : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>

                <div className="mt-6 flex items-center justify-end gap-2 border-t border-alloy-stone/12 pt-3">
                    <p className="mr-auto text-[11px] text-alloy-midnight/45">
                        Approving prepares a form + requirement draft. New fields are proposed — never created until you approve.
                    </p>
                    <button type="button" onClick={onOpenDetailed} className={WS_ACTION_PRIMARY} data-testid="concept-continue">
                        Continue to form
                    </button>
                </div>
            </div>
        </div>
    );
}

function countRawFields(d: ConfigurationDiscoveryResult): number {
    // A friendly "not N individual questions" figure — the pre-concept field count.
    return d.concepts.reduce((n, c) => n + Math.max(1, c.source.labels.length), 0);
}
