"use client";

import { CANONICAL_OPERATOR_BASE } from "@/lib/admin/canonicalAdminRoutes";
import { WorkspaceActionRailButton } from "@/app/adminV2/components/workspace/WorkspaceActionRailButton";
import { resolveWorkspaceActionRailTierClasses } from "@/lib/adminV2/workspace/workspaceActionRailButton";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import { resolveWorkspaceActionHref } from "@/lib/workspace/resolveWorkspaceActionHref";
import type { WorkspaceActionsBlock, WorkspaceActionItem } from "@/lib/workspace/types";

function hrefFor(
    a: WorkspaceActionItem,
    ctx: { departmentId: string; workspaceBasePath: string }
): string {
    return resolveWorkspaceActionHref(a, ctx);
}

export function ActionsBlock({
    block,
    presentation = "flat",
    departmentId = "",
    workspaceBasePath = CANONICAL_OPERATOR_BASE,
}: {
    block: WorkspaceActionsBlock;
    presentation?: "flat" | "bridge";
    /** Required when any action uses `deptRoute`. */
    departmentId?: string;
    workspaceBasePath?: string;
}) {
    if (!block.actions.length) return null;

    const ctx = { departmentId, workspaceBasePath };
    const pf = (u: string) => (shouldDisableAdminV2LinkPrefetch(u) ? false : undefined);

    if (presentation === "bridge") {
        const tiers = resolveWorkspaceActionRailTierClasses(block.actions, 2);
        return (
            <section
                className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
                data-workspace-block="actions"
                aria-label={block.title ?? "Actions"}
            >
                <h3 className="adminv2-ws-actions-rail-title">{block.title ?? "Actions"}</h3>
                <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column">
                    {block.actions.map((a, i) => {
                        const h = hrefFor(a, ctx);
                        return (
                            <WorkspaceActionRailButton
                                key={a.id}
                                as="link"
                                href={h}
                                prefetch={pf(h)}
                                tier={tiers[i] ?? "secondary"}
                            >
                                {a.label}
                            </WorkspaceActionRailButton>
                        );
                    })}
                </div>
            </section>
        );
    }

    return (
        <section className="rounded-xl border border-admin-border bg-white p-5 shadow-sm" data-workspace-block="actions">
            <h2 className="text-sm font-semibold text-alloy-midnight">{block.title ?? "Actions"}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
                {block.actions.map((a) => {
                    const h = hrefFor(a, ctx);
                    return (
                        <WorkspaceActionRailButton
                            key={a.id}
                            as="link"
                            href={h}
                            prefetch={pf(h)}
                            tier={a.variant === "primary" ? "primary" : "secondary"}
                            className={
                                a.variant === "primary" ?
                                    "inline-flex items-center hover:opacity-92"
                                :   "inline-flex items-center hover:bg-alloy-stone/30"
                            }
                        >
                            {a.label}
                        </WorkspaceActionRailButton>
                    );
                })}
            </div>
        </section>
    );
}
