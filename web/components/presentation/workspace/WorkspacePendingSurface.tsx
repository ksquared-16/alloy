"use client";

/**
 * Presentation Runtime V2 — WS.PENDING: the Workspace while its composition resolves.
 *
 * MEASURED PROBLEM (Slice 16/18). The app shell paints in ~8 ms and global navigation and search are
 * usable immediately, but the Workspace's own content does not arrive for ~2.7 s. For that whole
 * window the content region showed a centred "Thinking…" boot shell: no identity, no structure, and
 * then everything appeared at once. The shell was already operational and the surface read as if it
 * were not. The ~2.7 s is legitimate composition work and this does not pretend otherwise — it is a
 * continuity repair, not a latency one.
 *
 * WHAT THIS RENDERS, AND WHY IT IS THE MOST IT MAY RENDER.
 *
 * Identity: the ORGANISATION NAME, which the shell already holds synchronously from
 * `WorkspaceOrgContext` — a tenant fact, not a guess. It deliberately does NOT render the published
 * header's title, subtitle or KPI values: `WorkspaceSurfaceModel.header` is a published-config model
 * that must "commit atomically with process tiles — do not flash a default header when a published
 * config exists", and inventing one here would be exactly that flash.
 *
 * Structure: reserved slots in the SAME grid the process surface uses, so the region has a stable
 * footprint before its content lands. They carry no business values — no counts, no names, no fake
 * cards — because a placeholder that looks like data is a lie with a short half-life.
 *
 * Emphatically NOT an empty state. "No active business processes are configured" is a settled answer
 * and this is not settled; rendering it here would tell an operator their workspace is unconfigured
 * while it is still composing.
 */

import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

/**
 * Structural floor for the pending region, in the neighbourhood of the settled process surface
 * (measured at 620 px for this tenant's single configured process). Deliberately a floor rather than
 * an exact match: the settled height depends on how many processes an org has configured, so the
 * region grows a little when content lands rather than collapsing — the direction that does not
 * throw away what the operator was already reading.
 */
const WORKSPACE_PENDING_MIN_HEIGHT = "32rem";

export function WorkspacePendingSurface({ orgName }: { orgName: string | null }) {
    const name = orgName?.trim() || null;
    return (
        <div
            data-workspace-pending="true"
            aria-busy="true"
            className="flex min-h-0 flex-1 flex-col gap-6"
        >
            {/* Immediate identity. The operator knows where they are before the content resolves. */}
            <div
                data-workspace-pending-identity="true"
                className="flex min-h-[4.875rem] flex-col justify-center gap-1"
            >
                {name ? (
                    <p className="text-lg font-semibold text-alloy-midnight">{name}</p>
                ) : null}
                <p className="text-sm text-alloy-midnight/55">Preparing your workspace…</p>
            </div>

            {/* Reserved process-surface geometry — same grid, no business values. */}
            <div
                {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processGrid)}
                data-workspace-pending-region="true"
                style={{ minHeight: WORKSPACE_PENDING_MIN_HEIGHT }}
                className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3"
            >
                {[0, 1].map((slot) => (
                    <div
                        key={slot}
                        data-workspace-pending-slot="true"
                        aria-hidden="true"
                        className="min-h-[15rem] rounded-lg border border-alloy-stone/18 bg-white/60"
                    />
                ))}
            </div>
        </div>
    );
}
