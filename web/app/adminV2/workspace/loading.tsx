import "@/app/adminV2/components/workspace/workspace.css";

function KpiStripSkeleton({ rails = 2 }: { rails?: 1 | 2 }) {
  if (rails === 1) {
    return (
      <div className="adminv2-ws-kpi-root-band" role="status" aria-label="Loading KPIs">
        <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--single-band" role="list" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="adminv2-ws-kpi-cell adminv2-ws-kpi-cell--single-band adminv2-ws-kpi-cell--placeholder">
              <span className="adminv2-ws-kpi-label"> </span>
              <span className="adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder">—</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

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

function DeptTileSkeleton() {
  return (
    <div className="adminv2-ws-company-dept-tile adminv2-ws-company-dept-tile--workspace-root rounded-xl border border-admin-border bg-white/70 p-4">
      <div className="adminv2-ws-company-dept-tile-head">
        <div className="h-4 w-40 skeleton-pulse rounded bg-alloy-stone/25" />
      </div>
      <div className="mt-2 space-y-2">
        <div className="h-3 w-full skeleton-pulse rounded bg-alloy-stone/15" style={{ animationDelay: "40ms" }} />
        <div className="h-3 w-5/6 skeleton-pulse rounded bg-alloy-stone/15" style={{ animationDelay: "90ms" }} />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-28 skeleton-pulse rounded bg-alloy-stone/15" style={{ animationDelay: "120ms" }} />
        <div className="h-3 w-24 skeleton-pulse rounded bg-alloy-stone/10" style={{ animationDelay: "160ms" }} />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div data-ws-surface="company" className="adminv2-ws-root adminv2-ws-company adminv2-ws-company-v2">
      <div className="adminv2-ws-dept-v2-contain">
        <nav className="text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 pb-2" aria-label="Breadcrumb">
          <span className="text-alloy-midnight/80 font-medium">Workspace</span>
        </nav>

        <div className="adminv2-ws-dept-v2-page-split">
          <div className="adminv2-ws-dept-v2-primary-column">
            <div className="adminv2-ws-dept-v2-control-deck">
              <div className="adminv2-ws-dept-v2-top-stack">
                <div className="adminv2-ws-dept-v2-brief">
                  <div className="adminv2-ws-dept-v2-brief-focus-label">Organization workspace</div>
                  <div className="adminv2-ws-dept-v2-brief-head-row">
                    <h2 className="adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder">
                      Loading organization
                    </h2>
                  </div>
                  <div className="mt-3 space-y-2 max-w-3xl" aria-hidden>
                    <div className="h-3 w-full skeleton-pulse rounded bg-alloy-stone/15" />
                    <div className="h-3 w-4/5 skeleton-pulse rounded bg-alloy-stone/15" style={{ animationDelay: "70ms" }} />
                  </div>
                </div>
              </div>
              <KpiStripSkeleton rails={1} />
            </div>

            <section className="mt-4" aria-label="Departments">
              <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
                <div className="space-y-2">
                    <div className="h-3 w-24 skeleton-pulse rounded bg-alloy-stone/15" />
                    <div className="h-3 w-72 skeleton-pulse rounded bg-alloy-stone/10" style={{ animationDelay: "80ms" }} />
                </div>
              </div>
              <div className="adminv2-ws-company-v2-main" data-production-workspace-root="true">
                <div className="adminv2-ws-company-v2-dept-grid adminv2-ws-company-v2-dept-grid--workspace-root" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <DeptTileSkeleton key={i} />
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
            <aside
              className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
              data-adminv2-workspace-command-rail
              aria-label="Workspace orientation"
            >
              <section className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-actions-rail--orientation px-3 pb-3 pt-3">
                <div className="h-4 w-28 skeleton-pulse rounded bg-alloy-stone/15" aria-hidden />
                <div className="mt-3 space-y-2" aria-hidden>
                  <div className="h-3 w-full skeleton-pulse rounded bg-alloy-stone/10" />
                  <div className="h-3 w-5/6 skeleton-pulse rounded bg-alloy-stone/10" style={{ animationDelay: "55ms" }} />
                  <div className="h-3 w-2/3 skeleton-pulse rounded bg-alloy-stone/10" style={{ animationDelay: "110ms" }} />
                </div>
                <div className="mt-4 space-y-2" aria-hidden>
                  <div className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10" />
                  <div className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10" style={{ animationDelay: "80ms" }} />
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

