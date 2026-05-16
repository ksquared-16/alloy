"use client";

import Link from "next/link";

import type { WorkflowAssistDraftReviewV1 } from "@/lib/agent/workflowAssist/workflowAssistDraftEnrichmentV1";
import { brand, derived, neutral, semantic } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section
            className="space-y-1 rounded-md border px-2 py-1.5"
            style={{ borderColor: derived.border }}
            data-command-surface-workflow-assist-review-section={title.replace(/\s+/g, "_").toLowerCase()}
        >
            <h4 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: CMD.textLabel }}>
                {title}
            </h4>
            {children}
        </section>
    );
}

export function WorkflowAssistProposalReviewPanel({ review }: { review: WorkflowAssistDraftReviewV1 }) {
    return (
        <div className="space-y-2" data-command-surface-workflow-assist-draft-review="true">
            <div className="flex flex-wrap gap-1.5">
                <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                    style={{ backgroundColor: "rgba(39, 63, 82, 0.08)", color: CMD.textLabel }}
                >
                    Disabled draft
                </span>
                <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                    style={{ backgroundColor: "rgba(0, 162, 131, 0.1)", color: brand.secondary }}
                    data-command-surface-workflow-assist-message-provenance={review.message_preview.provenance}
                >
                    {review.message_preview.provenance_label}
                </span>
                {review.message_preview.needs_review ?
                    <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                        style={{ backgroundColor: "rgba(220, 38, 38, 0.1)", color: semantic.warning }}
                    >
                        Needs review
                    </span>
                : null}
                <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                    style={{ backgroundColor: "rgba(39, 63, 82, 0.06)", color: CMD.textLabel }}
                    title="AI suggestions are advisory; normalized values are authoritative for apply"
                >
                    AI-assisted · {review.ai_suggestions.confidence}
                </span>
            </div>

            <Section title="Workflow summary">
                <p className="text-[11px] font-semibold" style={{ color: CMD.textBody }}>
                    {review.workflow_summary.name}
                </p>
                <p className="text-[10px]" style={{ color: CMD.textSupporting }}>
                    Scope: {review.workflow_summary.scope_label}
                </p>
                {review.workflow_summary.description ?
                    <p className="text-[10px] leading-snug" style={{ color: CMD.textSupporting }}>
                        {review.workflow_summary.description}
                    </p>
                : null}
            </Section>

            <Section title="Trigger & timing">
                <p className="text-[10px]" style={{ color: CMD.textBody }}>
                    {review.trigger.human_label}
                </p>
                <p className="text-[10px]" style={{ color: CMD.textLabel }}>
                    {review.trigger.event_type} · {review.trigger.entity_type}
                </p>
                <p className="text-[10px]" style={{ color: CMD.textSupporting }}>
                    {review.trigger.timing_description}
                </p>
            </Section>

            {review.conditions.length ?
                <Section title="Conditions">
                    <ul className="list-disc pl-4 text-[10px]" style={{ color: CMD.textSupporting }}>
                        {review.conditions.map((c, i) => (
                            <li key={i}>{c}</li>
                        ))}
                    </ul>
                </Section>
            : null}

            <Section title="Action preview">
                <p className="text-[10px]" style={{ color: CMD.textBody }}>
                    {review.action_preview.summary}
                </p>
                {review.action_preview.channel ?
                    <p className="text-[10px]" style={{ color: CMD.textLabel }}>
                        Channel: {review.action_preview.channel}
                        {review.action_preview.scaffold_only ? " (scaffold only — not live)" : ""}
                    </p>
                : null}
            </Section>

            <Section title="Message preview">
                <pre
                    className="max-h-[min(120px,24vh)] overflow-y-auto whitespace-pre-wrap rounded border px-2 py-1 text-[10px]"
                    style={{ borderColor: derived.border, color: CMD.textBody }}
                    data-command-surface-workflow-assist-message-preview-body="true"
                >
                    {review.message_preview.body}
                </pre>
            </Section>

            {review.ai_suggestions.missing_information.length || review.ai_suggestions.warnings.length ?
                <Section title="AI suggestions & warnings">
                    {review.ai_suggestions.missing_information.length ?
                        <>
                            <p className="text-[10px] font-semibold" style={{ color: CMD.textLabel }}>
                                Missing information
                            </p>
                            <ul className="list-disc pl-4 text-[10px]" style={{ color: CMD.textSupporting }}>
                                {review.ai_suggestions.missing_information.map((m, i) => (
                                    <li key={i}>{m}</li>
                                ))}
                            </ul>
                        </>
                    : null}
                    {review.ai_suggestions.warnings.length ?
                        <ul className="list-disc pl-4 text-[10px]" style={{ color: semantic.warning }}>
                            {review.ai_suggestions.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                            ))}
                        </ul>
                    : null}
                </Section>
            : null}

            <Section title="Review checklist">
                <ul className="space-y-1 text-[10px]" style={{ color: CMD.textBody }}>
                    {review.review_checklist.map((item) => (
                        <li key={item.id} className="flex gap-1.5">
                            <span aria-hidden>{item.required ? "☐" : "○"}</span>
                            <span>{item.label}</span>
                        </li>
                    ))}
                </ul>
            </Section>

            <p className="text-[10px] leading-snug" style={{ color: CMD.textLabel }}>
                AI-generated fields are suggestions only. Apply writes a{" "}
                <span className="font-semibold">disabled</span> workflow using normalized schema values — enable only
                from{" "}
                <Link href="/adminV2/workflows" className="font-semibold underline-offset-2 hover:underline" style={{ color: brand.secondary }}>
                    Automations
                </Link>
                .
            </p>
        </div>
    );
}
