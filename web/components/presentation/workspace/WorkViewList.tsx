/**
 * Presentation Runtime V2 — WS.PROCESS_TILE_WORK_VIEWS: the ONE Workspace render site for
 * the configured Work View rows inside a process tile.
 *
 * Each row: configured icon (process accent) → name → mission → grain counts → attention → affordance.
 * Pure presenter of `WorkViewLinkModel[]` + process accent for identity consistency.
 */

import Link from "next/link";
import { useWorkUnitEntryGesture } from "@/lib/runtime/kernel/useWorkUnitEntryGesture";
import { parseOperatorWorkUnitEntryHref, warmWorkUnitSlugRoute } from "@/lib/admin/operatorWorkUnitEntryWarm";
import type { WorkViewLinkModel } from "@/lib/presentation/runtime";
import type { ProcessCardAccent } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import { grainCountUnitLabel, type WorkViewGrainBucket } from "@/lib/lifecycle/stageGrainV1";
import {
    workViewRowHoverClass,
    workViewRowIconClass,
    workViewRowIconWellClass,
    workViewRowIconWellHoverClass,
} from "@/lib/presentation/runtime/processCardAccentStyles";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { ProcessCardGlyph } from "./ProcessCardGlyph";

/** Intent-only warm for a work-view row's Work Unit route (deduped, in-flight guarded). */
function warmWorkViewRoute(href: string | null | undefined): void {
    const slug = href ? parseOperatorWorkUnitEntryHref(href).workUnitSlug : null;
    if (slug) void warmWorkUnitSlugRoute(slug, "workspace_work_view_row");
}

function positive(n: number | null | undefined): number | null {
    return typeof n === "number" && n > 0 ? n : null;
}

function resolveGrainUnitLabel(args: {
    kind?: WorkViewGrainBucket | null;
    count?: number | null;
    explicitLabel?: string | null;
}): string | null {
    const explicit = args.explicitLabel?.trim();
    if (explicit) return explicit;
    if (args.kind != null && typeof args.count === "number") {
        return grainCountUnitLabel(args.kind, args.count);
    }
    return null;
}

function rowAriaLabel(view: WorkViewLinkModel): string {
    const parts = [`Open ${view.label}`];
    if (view.description) parts.push(view.description);
    const primaryCount = view.primaryGrainCount ?? view.count;
    const primaryLabel = resolveGrainUnitLabel({
        kind: view.primaryGrainKind,
        count: primaryCount,
        explicitLabel: view.primaryGrainLabel,
    });
    if (primaryLabel && primaryCount != null) {
        parts.push(`${primaryCount} ${primaryLabel}`);
    } else if (primaryCount != null) {
        parts.push(String(primaryCount));
    }
    const supportingLabel = resolveGrainUnitLabel({
        kind: view.supportingGrainKind,
        count: view.supportingGrainCount,
        explicitLabel: view.supportingGrainLabel,
    });
    if (supportingLabel && view.supportingGrainCount != null) {
        parts.push(`${view.supportingGrainCount} ${supportingLabel}`);
    }
    const attention = positive(view.attentionCount);
    if (attention) parts.push(`${attention} need attention`);
    return parts.join(", ");
}

function RowGlyph({ view, accent }: { view: WorkViewLinkModel; accent: ProcessCardAccent | null }) {
    return (
        <span
            aria-hidden
            data-work-view-icon={view.icon ?? "fallback"}
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${workViewRowIconWellClass(accent)} ${workViewRowIconWellHoverClass(accent)} ${workViewRowIconClass(accent)}`}
        >
            <ProcessCardGlyph icon={view.icon ?? "grid"} className="h-[14px] w-[14px]" />
        </span>
    );
}

function GrainCountLine({
    count,
    label,
    prominent = false,
}: {
    count: number;
    label: string | null;
    prominent?: boolean;
}) {
    return (
        <span
            className={`tabular-nums leading-none ${prominent ? "text-[13px] font-semibold text-alloy-midnight" : "text-[10px] font-medium text-alloy-midnight/38"}`}
            data-work-view-grain-count={prominent ? "primary" : "supporting"}
        >
            {count.toLocaleString()}
            {label ? ` ${label}` : null}
        </span>
    );
}

function RowCounts({ view, showCounts }: { view: WorkViewLinkModel; showCounts: boolean }) {
    if (!showCounts) return null;

    const attention = positive(view.attentionCount);
    const primaryCount = view.primaryGrainCount ?? view.count;
    const primaryLabel = resolveGrainUnitLabel({
        kind: view.primaryGrainKind,
        count: primaryCount,
        explicitLabel: view.primaryGrainLabel,
    });
    const supportingLabel = resolveGrainUnitLabel({
        kind: view.supportingGrainKind,
        count: view.supportingGrainCount,
        explicitLabel: view.supportingGrainLabel,
    });
    const hasDualGrain =
        view.primaryGrainCount != null &&
        view.supportingGrainCount != null &&
        view.supportingGrainCount > 0 &&
        primaryLabel &&
        supportingLabel;

    if (primaryCount == null && view.count == null) {
        return (
            // RESERVED SETTLEMENT GEOMETRY — Work View counts are Settlement (U-S6). The badge
            // reserves its width so the row never reflows when the count settles; it does not
            // animate, because visible construction is budgeted at 0.
            <span aria-hidden data-settlement-reserved="count" className="inline-block h-3.5 w-5 rounded bg-alloy-midnight/[0.06]" />
        );
    }

    return (
        <div className="flex shrink-0 flex-col items-end gap-0.5 pr-0.5 text-right" data-work-view-counts>
            {hasDualGrain && view.primaryGrainCount != null ? (
                <>
                    <GrainCountLine
                        count={view.primaryGrainCount}
                        label={primaryLabel}
                        prominent
                    />
                    <GrainCountLine
                        count={view.supportingGrainCount!}
                        label={supportingLabel}
                    />
                </>
            ) : primaryCount != null ? (
                <GrainCountLine count={primaryCount} label={primaryLabel} prominent />
            ) : null}
            {attention ? (
                <span
                    className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold leading-none text-alloy-ember"
                    data-work-view-attention
                    title={`${attention} need attention`}
                >
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-alloy-ember" />
                    {attention.toLocaleString()} Needs Attention
                </span>
            ) : null}
        </div>
    );
}


/**
 * One Today's-Work row. Exists so the K1 entry gesture has a component to live in — the row list is
 * a .map(), and a hook cannot run there. This row is the SECOND Workspace entry point to a Work
 * Unit; certification caught it navigating while the process CTA was wired, which blanked the
 * surface because the route is seed-only.
 */
function WorkViewRowLink({
    view,
    hoverClass,
    processAccent,
    showCounts,
}: {
    view: WorkViewLinkModel;
    hoverClass: string;
    processAccent: ProcessCardAccent | null;
    showCounts: boolean;
}) {
    const onGesture = useWorkUnitEntryGesture(view.href);
    if (!view.href) return null;
    return (
                        <Link
                            onClick={onGesture}
                            href={view.href}
                            // Heavy Work Unit route — never eagerly prefetch on viewport (a wall of
                            // work-view rows across every process card would storm the router, and
                            // re-render re-prefetch doubles it). Warm only on pointer/focus intent.
                            prefetch={false}
                            onPointerEnter={() => warmWorkViewRoute(view.href)}
                            onPointerDown={() => warmWorkViewRoute(view.href)}
                            onFocus={() => warmWorkViewRoute(view.href)}
                            aria-label={rowAriaLabel(view)}
                            className={`${ROW_BODY_CLASS} motion-control no-underline ${hoverClass} focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-midnight/25`}
                        >
                            <WorkViewRowBody view={view} showCounts={showCounts} accent={processAccent} />
                        </Link>
    );
}

function WorkViewRowBody({
    view,
    showCounts,
    accent,
}: {
    view: WorkViewLinkModel;
    showCounts: boolean;
    accent: ProcessCardAccent | null;
}) {
    return (
        <>
            <RowGlyph view={view} accent={accent} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold leading-snug text-alloy-midnight">
                    {view.label}
                </span>
                {view.description ? (
                    <span
                        className="mt-0.5 block line-clamp-1 text-[10px] leading-relaxed text-alloy-midnight/40"
                        data-work-view-description
                    >
                        {view.description}
                    </span>
                ) : null}
            </span>
            <div className="flex shrink-0 items-center gap-3.5">
                <RowCounts view={view} showCounts={showCounts} />
                <span
                    aria-hidden
                    className="motion-control w-3.5 shrink-0 text-center text-[12px] text-alloy-midnight/28 group-hover/row:text-alloy-midnight/50"
                >
                    ›
                </span>
            </div>
        </>
    );
}

const ROW_BODY_CLASS =
    "group/row flex w-full items-center gap-2.5 rounded-lg border-l-2 border-l-transparent px-1.5 py-1.5 text-left transition-colors";

export function WorkViewList({
    workViews,
    showCounts = true,
    processAccent = null,
}: {
    workViews: WorkViewLinkModel[];
    showCounts?: boolean;
    /** Process identity accent from Surface config — tints row icons and hover. */
    processAccent?: ProcessCardAccent | null;
}) {
    if (!workViews.length) return null;
    const hoverClass = workViewRowHoverClass(processAccent);
    return (
        <ul
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processTileWorkViews)}
            data-alloy-section="WS.PROCESS_TILE_WORK_VIEWS"
            className="divide-y divide-alloy-stone/18"
            aria-label="Work views"
        >
            {workViews.map((view) => (
                <li key={view.id} data-work-view-id={view.id}>
                    {view.href ? (
                        <WorkViewRowLink view={view} hoverClass={hoverClass} processAccent={processAccent ?? null} showCounts={showCounts} />
                    ) : (
                        <div className={`${ROW_BODY_CLASS} text-alloy-midnight/50`}>
                            <WorkViewRowBody view={view} showCounts={showCounts} accent={processAccent} />
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}
