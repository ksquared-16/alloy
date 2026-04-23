import "@/app/adminV2/components/workspace/workspace.css";

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

function QueueRowSkeleton() {
  return (
    <div className="adminv2-ws-wu-queue-row" aria-hidden>
      <div className="adminv2-ws-wu-queue-row-main">
        <div className="h-3 w-44 skeleton-pulse rounded bg-alloy-stone/20" />
        <div className="mt-2 h-3 w-64 skeleton-pulse rounded bg-alloy-stone/12" style={{ animationDelay: "70ms" }} />
      </div>
      <div className="adminv2-ws-wu-queue-row-meta">
        <div className="h-3 w-16 skeleton-pulse rounded bg-alloy-stone/10" style={{ animationDelay: "110ms" }} />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="w-full max-w-none mx-0 px-0 pt-2 pb-0 space-y-4 relative">
      <nav className="text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 px-1" aria-label="Breadcrumb">
        <span className="flex items-center gap-1">
          <span className="text-alloy-midnight/80 font-medium">Workspace</span>
        </span>
        <span className="text-alloy-midnight/40" aria-hidden>
          /
        </span>
        <span className="text-alloy-midnight/60" aria-hidden>
          …
        </span>
        <span className="text-alloy-midnight/40" aria-hidden>
          /
        </span>
        <span className="text-alloy-midnight/60" aria-hidden>
          …
        </span>
      </nav>

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
                        Loading lane
                      </h2>
                    </div>
                  </div>
                </div>
                <div data-workspace-zone="kpi-banner">
                  <DualKpiRailsSkeleton />
                </div>
              </div>

              <div className="adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--double" aria-label="Lane queue">
                <div className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput" data-ws-lane-kind="lane_queue">
                  <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck">
                    <div className="adminv2-ws-wu-lane-strip" aria-label="Lane status" aria-hidden>
                      <p className="adminv2-ws-wu-lane-strip-line">
                        <span className="adminv2-ws-wu-lane-strip-k">Lane status</span>
                        <span className="inline-block h-3 w-56 align-middle skeleton-pulse rounded bg-alloy-stone/10" />
                      </p>
                      <p className="adminv2-ws-wu-lane-strip-line">
                        <span className="adminv2-ws-wu-lane-strip-k">Recommended</span>
                        <span className="inline-block h-3 w-44 align-middle skeleton-pulse rounded bg-alloy-stone/10" style={{ animationDelay: "80ms" }} />
                      </p>
                    </div>
                    <div className="adminv2-ws-wu-queue" aria-hidden>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <QueueRowSkeleton key={i} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention adminv2-ws-dept-v2-lane--attention--hidden" aria-hidden />
              </div>
            </div>

            <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
              <aside
                className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
                data-adminv2-workspace-command-rail
                aria-label="Decisions and actions"
              >
                <section className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-3 pb-3 pt-3">
                  <div className="h-4 w-20 skeleton-pulse rounded bg-alloy-stone/15" aria-hidden />
                  <div className="mt-3 space-y-2" aria-hidden>
                    <div className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10" />
                    <div className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10" style={{ animationDelay: "55ms" }} />
                    <div className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10" style={{ animationDelay: "110ms" }} />
                    <div className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10" style={{ animationDelay: "165ms" }} />
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </div>
      </div>
      <div className="ws-loading-overlay" aria-hidden>
        <div className="ws-loading-indicator">
          <span className="ws-loading-spinner" />
          Loading work unit
        </div>
      </div>
    </div>
  );
}

