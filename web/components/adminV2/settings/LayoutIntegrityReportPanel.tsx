"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { LayoutIntegrityIssue, LayoutIntegrityReportV1 } from "@/lib/config/layoutIntegrityTypes";
import {
    entityTypeLabel,
    fixLinksForIssue,
    formatIssueTargetLine,
    formatLayoutIntegritySummary,
    getLayoutIntegrityPanelState,
    groupIssuesBySeverity,
    issueCategory,
    issueCategoryLabel,
    issueOperatorTitle,
    type LayoutIntegrityPanelState,
} from "@/lib/config/layoutIntegrityPresentation";

const ENTITY_OPTIONS: { value: string; label: string }[] = [
    { value: "opportunity", label: "Opportunity" },
    { value: "job", label: "Job" },
    { value: "schedule", label: "Schedule" },
    { value: "person", label: "Person" },
    { value: "customer", label: "Customer" },
    { value: "vendor", label: "Vendor" },
    { value: "location", label: "Location" },
];

function severityBadgeClass(severity: LayoutIntegrityIssue["severity"]): string {
    return severity === "error"
        ? "bg-red-100 text-red-950 border-red-200/80"
        : "bg-amber-100 text-amber-950 border-amber-200/80";
}

function panelStateBanner(state: LayoutIntegrityPanelState): { tone: string; message: string } | null {
    switch (state) {
        case "idle":
            return {
                tone: "bg-alloy-stone/10 text-alloy-midnight/70 border-alloy-stone/20",
                message: "Not run yet — choose an entity type and run a check when you want a diagnostic snapshot.",
            };
        case "loading":
            return {
                tone: "bg-alloy-stone/10 text-alloy-midnight/70 border-alloy-stone/20",
                message: "Running integrity check…",
            };
        case "error":
            return null;
        case "clean":
            return {
                tone: "bg-alloy-pine/10 text-alloy-pine border-alloy-pine/25",
                message: "No issues found for this entity type. Field definitions, sections, and effective drawer layout align.",
            };
        case "issues":
            return null;
        default:
            return null;
    }
}

function IssueCard({ issue }: { issue: LayoutIntegrityIssue }) {
    const target = formatIssueTargetLine(issue);
    const fixLinks = fixLinksForIssue(issue);
    const category = issueCategoryLabel(issueCategory(issue));

    return (
        <article className="rounded-lg border border-alloy-stone/15 bg-white/80 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
                <span
                    className={[
                        "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        severityBadgeClass(issue.severity),
                    ].join(" ")}
                >
                    {issue.severity}
                </span>
                <span className="rounded bg-alloy-stone/15 px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/65">
                    {category}
                </span>
            </div>
            <h4 className="mt-1.5 text-sm font-medium text-alloy-midnight">{issueOperatorTitle(issue)}</h4>
            {target ? <p className="mt-0.5 font-mono text-[11px] text-alloy-midnight/50">{target}</p> : null}
            <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/80">{issue.message}</p>
            {issue.recommendation ? (
                <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/60">
                    <span className="font-medium text-alloy-midnight/70">What to do: </span>
                    {issue.recommendation}
                </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {fixLinks.map((link) => (
                    <Link key={link.href} href={link.href} className="font-medium text-alloy-pine hover:underline">
                        {link.label}
                    </Link>
                ))}
            </div>
        </article>
    );
}

export default function LayoutIntegrityReportPanel() {
    const [entityType, setEntityType] = useState("opportunity");
    const [report, setReport] = useState<LayoutIntegrityReportV1 | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runCheck = useCallback(async () => {
        setLoading(true);
        setError(null);
        setReport(null);
        try {
            const res = await fetch(
                `/api/admin/config/layout-integrity?entity_type=${encodeURIComponent(entityType)}`,
                { credentials: "include" }
            );
            const json = (await res.json().catch(() => ({}))) as { report?: LayoutIntegrityReportV1; error?: string };
            if (!res.ok) {
                throw new Error(json.error ?? "Failed to run layout integrity check");
            }
            setReport(json.report ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to run layout integrity check");
        } finally {
            setLoading(false);
        }
    }, [entityType]);

    const panelState = getLayoutIntegrityPanelState({ loading, error, report });
    const banner = panelStateBanner(panelState);
    const grouped = useMemo(() => groupIssuesBySeverity(report?.issues ?? []), [report?.issues]);

    return (
        <section
            className="rounded-xl border border-alloy-stone/15 bg-white/60"
            aria-labelledby="layout-integrity-heading"
            data-layout-integrity-panel
            data-panel-state={panelState}
        >
            <div className="px-4 py-3">
                <h2 id="layout-integrity-heading" className="text-sm font-semibold text-alloy-midnight">
                    Layout integrity
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/65">
                    Checks whether your <strong>field definitions</strong>, <strong>field grouping</strong>, and{" "}
                    <strong>effective drawer layout</strong> point at valid fields and sections for the selected entity.
                    This is a read-only diagnostic — it does not change configuration. Fix findings in{" "}
                    <Link href="/adminV2/settings/fields" className="font-medium text-alloy-pine hover:underline">
                        Fields
                    </Link>
                    ,{" "}
                    <Link href="/adminV2/settings/field-sections" className="font-medium text-alloy-pine hover:underline">
                        Field grouping
                    </Link>
                    , or{" "}
                    <Link href="/adminV2/settings/layouts" className="font-medium text-alloy-pine hover:underline">
                        Layouts
                    </Link>{" "}
                    (section order / workflow sections where applicable).
                </p>
            </div>

            <div className="border-t border-alloy-stone/15 px-4 py-3">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor="layout-integrity-entity" className="block text-[11px] font-semibold text-alloy-midnight/60">
                            Entity type
                        </label>
                        <select
                            id="layout-integrity-entity"
                            value={entityType}
                            onChange={(e) => {
                                setEntityType(e.target.value);
                                setReport(null);
                                setError(null);
                            }}
                            disabled={loading}
                            className="mt-1 rounded-md border border-alloy-stone/25 bg-white px-2 py-1.5 text-sm text-alloy-midnight disabled:opacity-60"
                        >
                            {ENTITY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={() => void runCheck()}
                        disabled={loading}
                        className="rounded-md bg-alloy-pine px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {loading ? "Checking…" : "Run integrity check"}
                    </button>
                </div>
                <p className="mt-2 text-[11px] leading-snug text-alloy-midnight/50">
                    Checks run on demand only — nothing runs in the background. Re-run after you change fields, grouping, or
                    layout order.
                </p>
            </div>

            {banner ? (
                <div className={["border-t border-alloy-stone/15 px-4 py-2.5 text-xs", banner.tone].join(" ")}>
                    {banner.message}
                </div>
            ) : null}

            {error ? (
                <div
                    className="border-t border-red-200/80 bg-red-50 px-4 py-3"
                    role="alert"
                    data-layout-integrity-error
                >
                    <p className="text-sm font-medium text-red-900">Could not run check</p>
                    <p className="mt-0.5 text-xs text-red-800/90">{error}</p>
                    <button
                        type="button"
                        onClick={() => void runCheck()}
                        disabled={loading}
                        className="mt-2 rounded-md border border-red-300/80 bg-white px-2.5 py-1 text-xs font-medium text-red-900 hover:bg-red-50 disabled:opacity-50"
                    >
                        Try again
                    </button>
                </div>
            ) : null}

            {report && panelState === "issues" ? (
                <div className="border-t border-alloy-stone/15" data-layout-integrity-results>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-alloy-stone/10 px-4 py-2.5">
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-950">
                            {formatLayoutIntegritySummary(report)}
                        </span>
                        <span className="text-[11px] text-alloy-midnight/45">
                            {entityTypeLabel(report.entity_type)} · {new Date(report.checked_at_iso).toLocaleString()}
                        </span>
                    </div>
                    <div className="max-h-[min(28rem,70vh)] space-y-4 overflow-y-auto px-4 py-3">
                        {grouped.map((group) => (
                            <div key={group.severity}>
                                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                    {group.severity === "error" ? "Errors" : "Warnings"} ({group.issues.length})
                                </h3>
                                <ul className="space-y-2">
                                    {group.issues.map((issue, i) => (
                                        <li key={`${issue.code}-${issue.field_key ?? ""}-${issue.section_key ?? ""}-${i}`}>
                                            <IssueCard issue={issue} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {report && panelState === "clean" ? (
                <div className="border-t border-alloy-pine/20 bg-alloy-pine/5 px-4 py-3 text-xs text-alloy-pine">
                    <p>
                        Last checked {entityTypeLabel(report.entity_type)} at{" "}
                        {new Date(report.checked_at_iso).toLocaleString()}.
                    </p>
                </div>
            ) : null}
        </section>
    );
}
