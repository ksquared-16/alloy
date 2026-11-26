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

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY, WS_PANEL_SURFACE, WS_PANEL_SURFACE_FLAT, WS_PANEL_HEADER } from "@/components/workspace/workspaceTokens";

import { categoryFor } from "@/lib/pos/discovery/discoverConfiguration";
import {
    REVIEW_SECTIONS,
    acceptOutcome,
    conciseRow,
    needsOperatorReview,
    readinessSummary,
    sectionFor,
    stopReasonChip,
    type ReviewSectionKey,
} from "@/lib/pos/discovery/reviewPresentation";
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

/**
 * Ordered by what the operator must DECIDE, not by what the importer found most of.
 *
 * The old order opened with "Existing data" and buried the exceptions, while the headline offered to
 * accept fifty guesses. Three groups did not appear at all — held, safeguarding and, once added,
 * financial — so the rows that most needed a person were the ones with no home on the page.
 *
 * Exceptions first: the things nobody else can decide. Then the settled outcomes. Then the
 * bookkeeping. Same strip, no new chrome.
 */
const CATEGORY_ORDER: DiscoveryCategory[] = [
    // 1. What only a person can decide.
    "needs_ownership_review",
    "safeguarding",
    "new_fields",
    // 2. What the family will be asked — the packet's actual content.
    "form_responses",
    "held_for_owner",
    "financial",
    "relationships",
    "collections",
    // 3. Obligations executed through artifacts.
    "upload_requirements",
    "acknowledgements",
    "signatures",
    // 4. Conclusions to inspect, not decide.
    "existing_fields",
    "derived",
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
    structured_collection: "Repeating structure",
    upload_requirement: "Upload requirement",
    acknowledgement: "Acknowledgement",
    signature_requirement: "Signature",
    static_content: "Static content",
    output_binding: "Output copy",
    derived_value: "Derived value",
    held_for_canonical_owner: "Families provide",
    safeguarding_binding: "Safeguarding restriction",
    financial_payment: "Payments",
    derived_value_system: "Handled automatically",
    held_unknown_owner: "Needs your decision",
    unresolved: "Needs classification",
};

const CATEGORY_TITLE: Record<DiscoveryCategory, string> = {
    existing_fields: "Alloy already has",
    relationships: "Relationships",
    collections: "Repeating structures",
    new_fields: "New fields",
    held_for_owner: "Handled by another area",
    safeguarding: "Safeguarding",
    financial: "Payments",
    derived: "Handled automatically",
    needs_ownership_review: "Needs your decision",
    form_responses: "Families will provide",
    upload_requirements: "Document requirements",
    acknowledgements: "Acknowledgements",
    signatures: "Signatures",
    static_content: "Static & legal",
    output_copies: "Internal / output",
    needs_review: "Needs review",
};

/**
 * Groups the operator inspects rather than decides.
 *
 * The screen's priority is: what needs you, then what is ready, then what Alloy handled, then the
 * audit. A conclusion should not compete visually with a decision.
 */
function quietCategory(category: DiscoveryCategory): boolean {
    return category === "derived" || category === "existing_fields" || category === "static_content" || category === "output_copies";
}

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
    onReviewProposal,
    onApply,
    applying = false,
    applicationCounts = null,
}: {
    discovery: ConfigurationDiscoveryResult;
    conceptById: Map<string, BusinessConceptCandidate>;
    decisions: Record<string, ProposalDecisionState>;
    onDecision: (proposalId: string, state: ProposalDecisionState) => void;
    onBulkAcceptHighConfidence: () => void;
    onOpenDetailed: () => void;
    /** Open the detailed question review focused on this proposal, so the operator can actually change it. */
    onReviewProposal?: (proposal: ConfigurationProposal) => void;
    onApply?: () => void;
    applying?: boolean;
    applicationCounts?: Record<string, number> | null;
}) {
    // ONE canonical result set, sectioned for presentation. `sections` is a membership index over
    // the same proposals — nothing is re-analysed, re-fetched, or recomputed per section, so a
    // count on a tab and the rows behind it can never disagree.
    const { sections, counts, byCategory } = useMemo(() => {
        const membership = new Map<ReviewSectionKey, ConfigurationProposal[]>();
        const byCat = new Map<DiscoveryCategory, ConfigurationProposal[]>();
        for (const p of discovery.proposals) {
            const category = categoryFor(p);
            byCat.set(category, [...(byCat.get(category) ?? []), p]);
            for (const key of sectionFor(p, category)) {
                membership.set(key, [...(membership.get(key) ?? []), p]);
            }
        }
        return {
            sections: membership,
            counts: Object.fromEntries(REVIEW_SECTIONS.map((s) => [s.key, membership.get(s.key)?.length ?? 0])) as Record<ReviewSectionKey, number>,
            byCategory: byCat,
        };
    }, [discovery.proposals]);

    // Open on the operator's work, not on the audit. Everything else is one click away.
    const [section, setSection] = useState<ReviewSectionKey>(counts.needs_review > 0 ? "needs_review" : "all");
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const visible = sections.get(section) ?? [];
    const grouped = useMemo(() => {
        // Inside a section the rows stay grouped by their settled category, so "All" still reads as
        // the audit it is rather than as one long ribbon.
        const map = new Map<DiscoveryCategory, ConfigurationProposal[]>();
        for (const p of visible) {
            const c = categoryFor(p);
            map.set(c, [...(map.get(c) ?? []), p]);
        }
        return CATEGORY_ORDER.filter((c) => (map.get(c)?.length ?? 0) > 0).map((c) => ({ category: c, proposals: map.get(c)! }));
    }, [visible]);

    const readiness = useMemo(() => readinessSummary(discovery.proposals, decisions), [discovery.proposals, decisions]);
    void byCategory;

    // Review progress, shown in the pinned bar so the operator always knows what is left.
    const totalProposals = discovery.proposals.length;
    const pendingCount = discovery.proposals.filter((p) => (decisions[p.id] ?? p.decision_state) === "proposed").length;
    const decidedCount = totalProposals - pendingCount;

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-white" data-testid="processing-concept-review">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="mx-auto max-w-4xl">
                {/* header */}
                <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-alloy-bend-pine" aria-hidden />
                            <h2 className="text-[15px] font-semibold text-alloy-midnight">What this document configures</h2>
                        </div>
                        <p className="mt-1 text-[12px] text-alloy-midnight/55">
                            {discovery.concepts.length} concepts from {countRawFields(discovery)} questions. Alloy decided who owns each answer.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {readiness.bulkSafe > 0 ? (
                            <button
                                type="button"
                                onClick={onBulkAcceptHighConfidence}
                                className={WS_ACTION_SECONDARY}
                                data-testid="concept-bulk-accept"
                                title="Only rows that need no modelling judgement — nothing held, sensitive or financial"
                            >
                                <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Accept {readiness.bulkSafe} safe to accept
                            </button>
                        ) : null}
                        <button type="button" onClick={onOpenDetailed} className={WS_ACTION_SECONDARY} data-testid="concept-open-detailed">
                            View detailed questions <ChevronRight className="ml-0.5 inline h-3.5 w-3.5" aria-hidden />
                        </button>
                    </div>
                </header>

                {/* The first thing to understand: what is done, what is mine, is anything blocking. */}
                <div className="mt-3 flex flex-wrap items-stretch gap-2" data-testid="concept-summary">
                    <div className="flex-1 rounded-lg border border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.05] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-bend-pine">Alloy handled</p>
                        <p className="mt-0.5 text-[13px] text-alloy-midnight">
                            <span className="text-[17px] font-semibold tabular-nums">{readiness.handled}</span>{" "}
                            <span className="text-alloy-midnight/60">decisions made for you</span>
                        </p>
                    </div>
                    <div className="flex-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Needs your review</p>
                        <p className="mt-0.5 text-[13px] text-alloy-midnight">
                            <span className="text-[17px] font-semibold tabular-nums">{readiness.needsReview}</span>{" "}
                            <span className="text-alloy-midnight/60">
                                {readiness.needsReview === 1 ? "decision only you can make" : "decisions only you can make"}
                            </span>
                        </p>
                    </div>
                    <div
                        className={`flex-1 rounded-lg border px-3 py-2 ${
                            readiness.blocking > 0 ? "border-orange-300 bg-orange-50" : "border-alloy-stone/22 bg-alloy-stone/[0.03]"
                        }`}
                        data-testid="concept-publish-readiness"
                    >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/55">Publication</p>
                        <p className="mt-0.5 text-[13px] text-alloy-midnight/70">
                            {readiness.blocking > 0
                                ? `${readiness.blocking} unclassified — blocks publishing`
                                : "Nothing here blocks publishing"}
                        </p>
                    </div>
                </div>

                {/* Sections. Presentation only — one result set, filtered. */}
                <nav className="mt-3 flex flex-wrap gap-1" data-testid="concept-sections" aria-label="Review sections">
                    {REVIEW_SECTIONS.filter((s) => (counts[s.key] ?? 0) > 0).map((s) => {
                        const active = s.key === section;
                        return (
                            <button
                                key={s.key}
                                type="button"
                                onClick={() => setSection(s.key)}
                                aria-current={active ? "true" : undefined}
                                data-testid={`concept-section-${s.key}`}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    active
                                        ? "border-alloy-bend-pine bg-alloy-bend-pine text-white"
                                        : "border-alloy-stone/25 bg-white text-alloy-midnight/65 hover:border-alloy-stone/45"
                                }`}
                            >
                                {s.label}{" "}
                                <span className={`tabular-nums ${active ? "text-white/70" : "text-alloy-midnight/40"}`}>{counts[s.key]}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* grouped concepts */}
                <div className="mt-5 space-y-5">
                    {grouped.map(({ category, proposals }) => (
                        // Each category is its own bounded group, so the eye can tell where one kind
                        // of decision ends and the next begins instead of reading one long ribbon.
                        <section
                            key={category}
                            // Focus Panel card doctrine — the same surface, radius, elevation and ring
                            // the drawer panels use. A decision screen should not look like a
                            // different product from the record it configures. Quieter treatment for
                            // groups the operator only inspects.
                            className={quietCategory(category) ? WS_PANEL_SURFACE_FLAT : WS_PANEL_SURFACE}
                            data-testid={`concept-group-${category}`}
                        >
                            <h3 className={`${WS_PANEL_HEADER} px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/70`}>
                                {CATEGORY_TITLE[category]}
                            </h3>
                            <div className="space-y-1.5 p-2.5">
                                {proposals.map((p) => {
                                    const concept = conceptById.get(p.candidate_id);
                                    const state = decisions[p.id] ?? p.decision_state;
                                    const ignored = state === "ignored";
                                    const accepted = state === "accepted";
                                    // A decided proposal needs far less room than one still asking for
                                    // attention: accepted/ignored rows collapse to a single line so the
                                    // list stays scannable and the undecided items stand out.
                                    const settled = accepted || ignored;

                                    if (settled) {
                                        return (
                                            <div
                                                key={p.id}
                                                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 ${
                                                    ignored
                                                        ? "border-alloy-stone/22 bg-alloy-stone/[0.04] opacity-60"
                                                        : "border-alloy-bend-pine/35 bg-alloy-bend-pine/[0.05]"
                                                }`}
                                                data-testid={`concept-row-${p.id}`}
                                                data-concept-state={ignored ? "ignored" : "accepted"}
                                            >
                                                <div className="flex min-w-0 items-center gap-2">
                                                    {accepted ? (
                                                        <Check className="h-3.5 w-3.5 shrink-0 text-alloy-bend-pine" aria-hidden />
                                                    ) : null}
                                                    <span className="truncate text-[12px] font-semibold text-alloy-midnight">
                                                        {concept?.label ?? p.candidate_id}
                                                    </span>
                                                    <span className="shrink-0 text-[10px] text-alloy-midnight/45">
                                                        {DISPOSITION_LABEL[p.disposition]}
                                                    </span>
                                                    {targetSummary(p) ? (
                                                        <span className="truncate text-[10px] text-alloy-midnight/40">{targetSummary(p)}</span>
                                                    ) : null}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => onDecision(p.id, "proposed")}
                                                    className="shrink-0 text-[10px] font-medium text-alloy-midnight/50 hover:text-alloy-midnight hover:underline"
                                                    data-testid={`concept-undo-${p.id}`}
                                                    title="Change this decision"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        );
                                    }

                                    const row = conciseRow(p);
                                    const isOpen = expanded[p.id] === true;
                                    const mine = needsOperatorReview(p);

                                    return (
                                        <div
                                            className="rounded-xl border border-alloy-stone/22 bg-white px-3.5 py-2.5 shadow-[0_1px_3px_rgba(24,39,58,0.05)] transition-colors"
                                            key={p.id}
                                            data-testid={`concept-row-${p.id}`}
                                            data-concept-state="proposed"
                                            data-needs-review={mine ? "true" : "false"}
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-[13px] font-semibold text-alloy-midnight">
                                                            {concept?.label ?? p.candidate_id}
                                                        </span>
                                                        {/* How many destinations this ONE decision covers — the whole point of
                                                            reviewing a repeating structure once instead of N times. */}
                                                        {concept?.repetition ? (
                                                            <span
                                                                className="rounded border border-alloy-stone/25 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-alloy-midnight/50"
                                                                title={`${concept.repetition.member_labels.length} destinations in the source document`}
                                                            >
                                                                ×{concept.repetition.instances}
                                                            </span>
                                                        ) : null}
                                                        {/* In the operator's own queue, WHY Alloy stopped is the scannable fact —
                                                            twenty rows should sort themselves by eye into a few kinds of decision. */}
                                                        {mine ? (
                                                            <span
                                                                className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                                                                data-testid={`concept-stop-reason-${p.id}`}
                                                            >
                                                                {stopReasonChip(p)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <p className="mt-0.5 text-[11px] font-medium text-alloy-midnight/70">{row.ownership}</p>
                                                    <p className="text-[11px] leading-snug text-alloy-midnight/55">{row.consequence}</p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    {mine && onReviewProposal ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => onReviewProposal(p)}
                                                            className="rounded-lg border border-alloy-stone/25 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:border-alloy-stone/45"
                                                            data-testid={`concept-review-${p.id}`}
                                                        >
                                                            Review
                                                        </button>
                                                    ) : null}
                                                    {/* One verb, with the outcome named beside it. A different CTA per
                                                        category would be a zoo and would say less. */}
                                                    <button
                                                        type="button"
                                                        onClick={() => onDecision(p.id, "accepted")}
                                                        className="rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                                                        data-testid={`concept-accept-${p.id}`}
                                                        title={`Accept — ${acceptOutcome(p)}`}
                                                    >
                                                        Accept
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onDecision(p.id, "ignored")}
                                                        className="rounded-lg border border-alloy-stone/25 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/60"
                                                        data-testid={`concept-ignore-${p.id}`}
                                                    >
                                                        Ignore
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-alloy-midnight/45">
                                                <span className="text-alloy-midnight/40">Accept · {acceptOutcome(p)}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !isOpen }))}
                                                    className="inline-flex items-center gap-0.5 font-medium text-alloy-midnight/55 hover:text-alloy-midnight hover:underline"
                                                    data-testid={`concept-why-${p.id}`}
                                                    aria-expanded={isOpen}
                                                >
                                                    Why
                                                    <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                                                </button>
                                            </div>

                                            {/* The audit, on demand. Hiding complexity, not deleting evidence: every
                                                fact certification depends on is still one click away on every row. */}
                                            {isOpen ? (
                                                <dl
                                                    className="mt-2 grid gap-x-4 gap-y-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.03] px-3 py-2 text-[10px] sm:grid-cols-[auto_1fr]"
                                                    data-testid={`concept-detail-${p.id}`}
                                                >
                                                    <dt className="font-semibold text-alloy-midnight/55">Source wording</dt>
                                                    <dd className="text-alloy-midnight/70">{concept?.label ?? "—"}</dd>
                                                    <dt className="font-semibold text-alloy-midnight/55">Artifact</dt>
                                                    <dd className="text-alloy-midnight/70">
                                                        page {p.source.page} · {p.source.section_title}
                                                    </dd>
                                                    <dt className="font-semibold text-alloy-midnight/55">Disposition</dt>
                                                    <dd className="text-alloy-midnight/70">{p.disposition}</dd>
                                                    {targetSummary(p) ? (
                                                        <>
                                                            <dt className="font-semibold text-alloy-midnight/55">Destination</dt>
                                                            <dd className="text-alloy-midnight/70">{targetSummary(p)}</dd>
                                                        </>
                                                    ) : null}
                                                    <dt className="font-semibold text-alloy-midnight/55">Confidence</dt>
                                                    <dd className="flex items-center gap-1.5 text-alloy-midnight/70">
                                                        {bandChip(p.confidence.band)}
                                                        <span>{p.confidence.percent}%</span>
                                                    </dd>
                                                    {p.confidence.signals.length ? (
                                                        <>
                                                            <dt className="font-semibold text-alloy-midnight/55">Signals</dt>
                                                            <dd className="text-alloy-midnight/70">{p.confidence.signals.join(" · ")}</dd>
                                                        </>
                                                    ) : null}
                                                    {p.ownership_routing ? (
                                                        <>
                                                            <dt className="font-semibold text-alloy-midnight/55">Ownership</dt>
                                                            <dd className="text-alloy-midnight/70">
                                                                {p.ownership_routing.owner} — {p.ownership_routing.basis}
                                                            </dd>
                                                        </>
                                                    ) : null}
                                                    {p.refused_binding ? (
                                                        <>
                                                            <dt className="font-semibold text-alloy-midnight/55">Refused binding</dt>
                                                            <dd className="text-orange-700">
                                                                {p.refused_binding.target.entity_type}.{p.refused_binding.target.field_key} —{" "}
                                                                {p.refused_binding.reason}
                                                            </dd>
                                                        </>
                                                    ) : null}
                                                    {p.validation_issues.length ? (
                                                        <>
                                                            <dt className="font-semibold text-alloy-midnight/55">Issues</dt>
                                                            <dd className="text-orange-700">{p.validation_issues.join(" · ")}</dd>
                                                        </>
                                                    ) : null}
                                                    <dt className="font-semibold text-alloy-midnight/55">Reasoning</dt>
                                                    <dd className="text-alloy-midnight/70">{p.explanation}</dd>
                                                    <dt className="font-semibold text-alloy-midnight/55">Lineage</dt>
                                                    <dd className="font-mono text-alloy-midnight/55">{p.id}</dd>
                                                </dl>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>

                {applicationCounts ? (
                    <div className="mt-5 rounded-xl border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.04] px-4 py-3" data-testid="concept-application-result">
                        <p className="text-[12px] font-semibold text-alloy-midnight">Configuration applied</p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-alloy-midnight/60">
                            {Object.entries(applicationCounts)
                                .filter(([, n]) => n > 0)
                                .map(([k, n]) => (
                                    <span key={k}>
                                        <span className="font-semibold text-alloy-midnight">{n}</span> {k.replace(/_/g, " ")}
                                    </span>
                                ))}
                        </div>
                    </div>
                ) : null}

            </div>
            </div>

            {/* PINNED action bar — the operator should never have to scroll a long review to the
                bottom just to apply it. Sits outside the scroll container, so it is always reachable. */}
            <div
                className="flex shrink-0 items-center justify-end gap-2 border-t border-alloy-stone/22 bg-white px-5 py-2.5 shadow-[0_-2px_8px_rgba(24,39,58,0.06)]"
                data-testid="concept-action-bar"
            >
                <p className="mr-auto text-[11px] text-alloy-midnight/45">
                    {decidedCount > 0 ? (
                        <>
                            <span className="font-semibold text-alloy-midnight">{decidedCount}</span> of {totalProposals} reviewed
                            {pendingCount > 0 ? ` · ${pendingCount} still to review` : " · all reviewed"}
                        </>
                    ) : (
                        "New fields are never created until you confirm."
                    )}
                </p>
                <button type="button" onClick={onOpenDetailed} className={WS_ACTION_SECONDARY} data-testid="concept-continue">
                    Detailed form
                </button>
                {onApply ? (
                    <button type="button" onClick={onApply} disabled={applying} className={WS_ACTION_PRIMARY} data-testid="concept-apply">
                        {applying ? "Applying…" : "Apply approved configuration"}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function countRawFields(d: ConfigurationDiscoveryResult): number {
    // A friendly "not N individual questions" figure — the pre-concept field count.
    return d.concepts.reduce((n, c) => n + Math.max(1, c.source.labels.length), 0);
}
