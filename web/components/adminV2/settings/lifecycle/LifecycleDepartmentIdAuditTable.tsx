"use client";

import type { LifecycleDepartmentIdAudit } from "@/lib/lifecycle/lifecycleDepartmentIdAudit";

type Row = { step: string; department_id: string | null; present: boolean };

function buildRows(
    audit: LifecycleDepartmentIdAudit,
    opts?: { reactStateIds?: string[]; browserRenderedIds?: string[] }
): Row[] {
    const sel = audit.selected_department_id;
    const reactIds = opts?.reactStateIds;
    const browserRendered = opts?.browserRenderedIds;
    const inReact = reactIds != null ? reactIds.includes(sel) : null;
    const inBrowserRendered = browserRendered != null ? browserRendered.includes(sel) : null;

    return [
        {
            step: "1. Lifecycle Builder catalog",
            department_id: audit.sources.catalog_row_department_id,
            present: audit.presence.in_builder_catalog && audit.presence.catalog_id_matches_selected,
        },
        {
            step: "2. Backing department query",
            department_id: audit.sources.backing_department_query_id,
            present: audit.presence.in_backing_department_row,
        },
        {
            step: "3. GET /api/admin/departments",
            department_id: sel,
            present: audit.presence.in_get_workspace_api,
        },
        {
            step: "4. Workspace React state",
            department_id: sel,
            present: inReact ?? inBrowserRendered ?? false,
        },
        {
            step: "5. Rendered workspace tiles",
            department_id: sel,
            present: inBrowserRendered ?? audit.presence.in_workspace_rendered_tiles,
        },
    ];
}

export default function LifecycleDepartmentIdAuditTable({
    audit,
    reactStateDepartmentIds,
    browserRenderedTileIds,
    title = "Selected lifecycle department ID audit",
}: {
    audit: LifecycleDepartmentIdAudit;
    reactStateDepartmentIds?: string[];
    browserRenderedTileIds?: string[];
    title?: string;
}) {
    const rows = buildRows(audit, {
        reactStateIds: reactStateDepartmentIds,
        browserRenderedIds: browserRenderedTileIds,
    });
    const sel = audit.selected_department_id;
    const apiMissing = !audit.presence.in_get_workspace_api;

    return (
        <div
            className="rounded-lg border border-alloy-forge/15 bg-alloy-stone/5 p-3 text-xs"
            data-testid="lifecycle-department-id-audit"
        >
            <p className="font-semibold text-alloy-midnight">{title}</p>
            <dl className="mt-2 grid gap-1 font-mono text-[10px] text-alloy-midnight/80">
                <div>
                    <dt className="inline text-alloy-midnight/50">selected department_id: </dt>
                    <dd className="inline break-all">{sel}</dd>
                </div>
                <div>
                    <dt className="inline text-alloy-midnight/50">lifecycle name: </dt>
                    <dd className="inline">{audit.selected_lifecycle_name}</dd>
                </div>
                <div>
                    <dt className="inline text-alloy-midnight/50">expected tile name: </dt>
                    <dd className="inline">{audit.expected_workspace_tile_name}</dd>
                </div>
                <div>
                    <dt className="inline text-alloy-midnight/50">validate route id: </dt>
                    <dd className="inline break-all">{audit.sources.validate_route_department_id}</dd>
                </div>
                <div>
                    <dt className="inline text-alloy-midnight/50">catalog row id: </dt>
                    <dd className="inline break-all">{audit.sources.catalog_row_department_id ?? "(none)"}</dd>
                </div>
            </dl>

            <table className="mt-3 w-full border-collapse text-[10px]">
                <thead>
                    <tr className="text-left text-alloy-midnight/55">
                        <th className="pb-1 pr-2">Step</th>
                        <th className="pb-1 pr-2">ID checked</th>
                        <th className="pb-1">Matches selected</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.step} data-testid={`lifecycle-audit-row-${r.step}`}>
                            <td className="py-0.5 pr-2 align-top">{r.step}</td>
                            <td className="py-0.5 pr-2 align-top font-mono break-all">
                                {r.department_id ?? "—"}
                            </td>
                            <td
                                className={`py-0.5 font-medium ${r.present && r.department_id === sel ? "text-alloy-pine" : "text-red-800"}`}
                            >
                                {r.department_id === sel || (r.step.includes("catalog") && audit.presence.catalog_id_matches_selected)
                                    ? r.present
                                        ? "yes"
                                        : "no"
                                    : r.department_id && r.department_id !== sel
                                      ? `wrong id (${r.department_id})`
                                      : r.present
                                        ? "yes"
                                        : "no"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <p className="mt-2 text-[10px] text-alloy-midnight/55">
                Workspace API returned {audit.workspace_api_department_ids.length} id(s):{" "}
                <span className="font-mono break-all">{audit.workspace_api_department_ids.join(", ") || "(none)"}</span>
            </p>

            {apiMissing ? (
                <p className="mt-2 font-medium text-red-800" data-testid="lifecycle-audit-api-missing">
                    Fail: Selected lifecycle department ID is not returned by /workspace API.
                    {audit.mismatch_hints.length ? (
                        <span className="mt-1 block font-normal">
                            {audit.mismatch_hints.map((h) => (
                                <span key={h} className="block">
                                    — {h}
                                </span>
                            ))}
                        </span>
                    ) : null}
                </p>
            ) : null}
        </div>
    );
}
