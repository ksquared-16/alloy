import "@/app/adminV2/components/workspace/workspace.css";
import { adminV2WorkUnitQueueLaneReserveStyle } from "@/lib/ui-v2/adminV2LoadingGeometry";
import { WorkspaceQuietKpiReserve } from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";

/** Thin indeterminate ribbon — route transition affordance without blocking the layout. */
export function WsRouteLoadingRibbon({ label = "Loading" }: { label?: string }) {
    return (
        <div
            className="ws-route-loading-ribbon"
            role="progressbar"
            aria-label={label}
            aria-busy="true"
        >
            <div className="ws-route-loading-ribbon__bar" />
        </div>
    );
}

function KpiBannerSkeleton() {
    return (
        <div className="adminv2-ws-kpi-root-band" role="status" aria-label="Loading KPI banner">
            <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--single-band" role="list" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div
                        key={i}
                        className="adminv2-ws-kpi-cell adminv2-ws-kpi-cell--single-band adminv2-ws-kpi-cell--placeholder"
                    >
                        <span className="adminv2-ws-kpi-label"> </span>
                        <span className="adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder">—</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function QueueCardSkeleton({ variant }: { variant: "standard" | "attention" }) {
    const cardClass =
        variant === "attention"
            ? "adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--attention adminv2-ws-wu-queue-card--tier-warning"
            : "adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard";
    return (
        <div className={`${cardClass} flex flex-col items-stretch border-alloy-stone/20 shadow-sm`} aria-hidden>
            <div className="adminv2-ws-wu-queue-card-compact-text">
                <div className="h-3 w-40 adminv2-shimmer-bar rounded bg-alloy-stone/20" />
                <div className="mt-2 h-3 w-56 adminv2-shimmer-bar rounded bg-alloy-stone/12" style={{ animationDelay: "70ms" }} />
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums" style={{ color: "var(--d-muted)" }}>
                    <div>
                        <span className="font-medium text-alloy-midnight/75">Count</span>{" "}
                        <span
                            className="inline-block h-3 w-10 align-middle adminv2-shimmer-bar rounded bg-alloy-stone/12"
                            style={{ animationDelay: "120ms" }}
                        />
                    </div>
                    <div className="text-right">
                        <span className="font-medium text-alloy-midnight/75">Value</span>{" "}
                        <span
                            className="inline-block h-3 w-14 align-middle adminv2-shimmer-bar rounded bg-alloy-stone/12"
                            style={{ animationDelay: "160ms" }}
                        />
                    </div>
                </div>
            </div>
            <div className="adminv2-ws-wu-queue-card-compact-aside">
                <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open">
                    <span
                        className="inline-block h-3 w-16 align-middle adminv2-shimmer-bar rounded bg-alloy-stone/10"
                        style={{ animationDelay: "90ms" }}
                    />
                </span>
            </div>
        </div>
    );
}

/** Department workspace body placeholder (no breadcrumb chrome — use inside `WorkspaceChrome` or route `loading`). */
export function DepartmentRouteSkeletonBody() {
    return (
        <div data-ws-surface="department" className="adminv2-ws-root adminv2-ws-department adminv2-ws-dept-v2">
            <div className="adminv2-ws-dept-v2-contain">
                <div className="adminv2-ws-dept-v2-page-split">
                    <div className="adminv2-ws-dept-v2-primary-column">
                        <div className="adminv2-ws-dept-v2-control-deck">
                            <div className="adminv2-ws-dept-v2-top-stack">
                                <div className="adminv2-ws-dept-v2-brief">
                                    <div className="adminv2-ws-dept-v2-brief-focus-label">Today&apos;s focus</div>
                                    <div className="adminv2-ws-dept-v2-brief-head-row">
                                        <h2 className="adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder">
                                            Loading department
                                        </h2>
                                    </div>
                                    <div className="mt-3 space-y-2 max-w-3xl" aria-hidden>
                                        <div className="h-3 w-full adminv2-shimmer-bar rounded bg-alloy-stone/15" />
                                        <div className="h-3 w-2/3 adminv2-shimmer-bar rounded bg-alloy-stone/10" style={{ animationDelay: "70ms" }} />
                                    </div>
                                </div>
                                <div data-workspace-zone="kpi-banner">
                                    <KpiBannerSkeleton />
                                </div>
                            </div>
                        </div>

                        <div
                            className="adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--triple"
                            aria-label="Operational lanes"
                        >
                            <div className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput" data-ws-lane-kind="throughput">
                                <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck">
                                    <section
                                        className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-dept-throughput-panel"
                                        aria-label="Pipeline lanes"
                                    >
                                        <header className="adminv2-ws-queue-header">
                                            <div className="adminv2-ws-queue-title-row">
                                                <h3 className="adminv2-ws-queue-title">Pipeline</h3>
                                            </div>
                                        </header>
                                        <div className="adminv2-ws-wu-v2" data-ws-surface="work_unit">
                                            <ul className="adminv2-ws-queue-list" role="list" aria-hidden>
                                                {Array.from({ length: 3 }).map((_, i) => (
                                                    <li key={i} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                        <QueueCardSkeleton variant="standard" />
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </section>
                                </div>
                            </div>

                            <div className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention" data-ws-lane-kind="attention">
                                <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-board-secondary-slot">
                                    <section
                                        className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--secondary adminv2-ws-dept-attention-panel"
                                        aria-label="Needs Attention"
                                    >
                                        <header className="adminv2-ws-attention-panel-header">
                                            <div>
                                                <div className="adminv2-ws-attention-panel-kicker">Needs attention</div>
                                                <h3 className="adminv2-ws-attention-panel-title">Needs Attention</h3>
                                                <div className="mt-2 space-y-2" aria-hidden>
                                                    <div className="h-3 w-48 adminv2-shimmer-bar rounded bg-alloy-stone/10" />
                                                    <div className="h-3 w-56 adminv2-shimmer-bar rounded bg-alloy-stone/10" style={{ animationDelay: "90ms" }} />
                                                </div>
                                            </div>
                                        </header>
                                        <div className="adminv2-ws-attention-stack" aria-hidden>
                                            <div className="adminv2-ws-attention-card adminv2-ws-attention-card--queue-aligned">
                                                <div className="adminv2-ws-wu-v2" data-ws-surface="work_unit">
                                                    <ul className="adminv2-ws-queue-list" role="list">
                                                        {Array.from({ length: 2 }).map((_, i) => (
                                                            <li key={i} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                                <QueueCardSkeleton variant="attention" />
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
                        <aside
                            className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
                            data-adminv2-workspace-command-rail
                            aria-label="Decisions and actions"
                        >
                            <section className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-3 pb-3 pt-3">
                                <div className="h-4 w-20 adminv2-shimmer-bar rounded bg-alloy-stone/15" aria-hidden />
                                <div className="mt-3 space-y-2" aria-hidden>
                                    <div className="h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10" />
                                    <div className="h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10" style={{ animationDelay: "55ms" }} />
                                    <div className="h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10" style={{ animationDelay: "110ms" }} />
                                </div>
                            </section>
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DualKpiRailsSkeleton() {
    return (
        <div className="adminv2-ws-dept-v2-kpi-measurement-strip" role="status" aria-label="Loading KPIs">
            <div className="adminv2-ws-dept-v2-kpi-dual" aria-hidden>
                <div className="adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--business">
                    <div className="adminv2-ws-dept-v2-kpi-rail-heading">Business metrics</div>
                    <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--dept-embedded" role="list">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="adminv2-ws-kpi-cell adminv2-ws-kpi-cell--placeholder">
                                <span className="adminv2-ws-kpi-label"> </span>
                                <span className="adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder">—</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--ai">
                    <div className="adminv2-ws-dept-v2-kpi-rail-heading">AI metrics</div>
                    <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--dept-embedded" role="list">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="adminv2-ws-kpi-cell adminv2-ws-kpi-cell--placeholder">
                                <span className="adminv2-ws-kpi-label"> </span>
                                <span className="adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder">—</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function WorkUnitQueuePickerPillsReserve() {
    const pillClass =
        "inline-flex shrink-0 h-7 min-w-[5rem] rounded-full border border-alloy-stone/20 bg-white shadow-sm ring-1 ring-alloy-stone/10 adminv2-shimmer-bar";
    return (
        <div className="adminv2-ws-wu-header-queue-picker mt-2 min-w-0" aria-hidden>
            <div className="adminv2-ws-queue-pill-scroll flex gap-2 py-0.5" role="group" aria-label="Loading queue filters">
                {Array.from({ length: 4 }).map((_, i) => (
                    <span key={i} className={pillClass} style={{ animationDelay: `${i * 45}ms` }} />
                ))}
            </div>
        </div>
    );
}

function WorkUnitLaneStripReserve() {
    return (
        <div
            className="adminv2-ws-wu-lane-strip mb-2.5 rounded-lg border border-alloy-stone/14 bg-white/90 px-2.5 py-2 shadow-sm"
            aria-hidden
        >
            <div className="h-3 w-[min(100%,10rem)] adminv2-shimmer-bar rounded bg-alloy-stone/18" />
            <div
                className="mt-1.5 h-3 w-[min(100%,16rem)] adminv2-shimmer-bar rounded bg-alloy-stone/12"
                style={{ animationDelay: "70ms" }}
            />
        </div>
    );
}

function WorkUnitOperLaneStatusChip() {
    return (
        <div
            className="pointer-events-none absolute bottom-3 right-3 z-[2] flex items-center gap-2 rounded-full border border-alloy-stone/18 bg-white/95 px-2.5 py-1 shadow-sm"
            aria-live="polite"
            aria-label="Loading queue"
        >
            <div
                className="h-4 w-4 rounded-full border-2 border-alloy-forge/15 border-t-alloy-forge/65 animate-spin motion-reduce:animate-none"
                style={{ animationDuration: "0.95s" }}
                aria-hidden
            />
            <span className="text-[11px] font-medium text-alloy-forge/75">Loading queue…</span>
        </div>
    );
}

/** Work unit lane body placeholder (no breadcrumb) — dept-like shell: brief, pills, KPI, lane strip, queue cards, rail. */
export function WorkUnitRouteSkeletonBody({
    laneHeadline = "Loading lane",
    reserveActionsRail = true,
}: {
    laneHeadline?: string;
    reserveActionsRail?: boolean;
}) {
    const queueLaneStyle = adminV2WorkUnitQueueLaneReserveStyle();
    return (
        <div data-ws-surface="work_unit" className="adminv2-ws-root adminv2-ws-work-unit adminv2-ws-wu-v2">
            <div className="adminv2-ws-dept-v2-contain">
                <div className="adminv2-ws-dept-v2-page-split">
                    <div className="adminv2-ws-dept-v2-primary-column">
                        <div className="adminv2-ws-dept-v2-control-deck">
                            <div className="adminv2-ws-dept-v2-top-stack">
                                <div className="adminv2-ws-dept-v2-brief">
                                    <div className="adminv2-ws-dept-v2-brief-kicker">Work unit</div>
                                    <div className="adminv2-ws-dept-v2-brief-head-row">
                                        <h2 className="adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder">
                                            {laneHeadline}
                                        </h2>
                                    </div>
                                    <WorkUnitQueuePickerPillsReserve />
                                </div>
                            </div>
                            <div data-workspace-zone="kpi-banner">
                                <WorkspaceQuietKpiReserve id="wu-route-kpi-quiet-reserve" />
                            </div>
                        </div>

                        <div
                            className="adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--double"
                            aria-label="Lane queue"
                            data-adminv2-wu-oper-region-loading="true"
                            aria-busy="true"
                        >
                            <div className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput" data-ws-lane-kind="lane_queue">
                                <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck">
                                    <section
                                        className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-dept-throughput-panel rounded-xl border border-alloy-stone/18 bg-white shadow-sm"
                                        aria-label="Lane queue"
                                    >
                                        <header className="adminv2-ws-queue-header border-b border-alloy-stone/12 px-2.5 py-2">
                                            <div className="adminv2-ws-queue-title-row">
                                                <h3 className="adminv2-ws-queue-title text-alloy-forge/90">Queue</h3>
                                            </div>
                                        </header>
                                        <div className="relative px-2 py-2" style={queueLaneStyle}>
                                            <WorkUnitLaneStripReserve />
                                            <div className="adminv2-ws-wu-v2" data-ws-surface="work_unit">
                                                <ul className="adminv2-ws-queue-list space-y-2" role="list" aria-hidden>
                                                    {Array.from({ length: 5 }).map((_, i) => (
                                                        <li key={i} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                            <QueueCardSkeleton variant="standard" />
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <WorkUnitOperLaneStatusChip />
                                        </div>
                                    </section>
                                </div>
                            </div>
                            <div
                                className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention adminv2-ws-dept-v2-lane--attention--hidden"
                                aria-hidden
                            />
                        </div>
                    </div>

                    {reserveActionsRail ? (
                        <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
                            <aside
                                className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
                                data-adminv2-workspace-command-rail
                                aria-label="Decisions and actions"
                            >
                                <section className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel rounded-xl border border-alloy-stone/16 bg-white px-3 pb-3 pt-3 shadow-sm">
                                    <div className="h-4 w-20 adminv2-shimmer-bar rounded bg-alloy-stone/20" aria-hidden />
                                    <div className="mt-3 space-y-2" aria-hidden>
                                        <div className="h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10" />
                                        <div
                                            className="h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10"
                                            style={{ animationDelay: "55ms" }}
                                        />
                                        <div
                                            className="h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10"
                                            style={{ animationDelay: "110ms" }}
                                        />
                                        <div
                                            className="h-8 w-full adminv2-shimmer-bar rounded-md bg-alloy-stone/10"
                                            style={{ animationDelay: "165ms" }}
                                        />
                                    </div>
                                </section>
                            </aside>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
