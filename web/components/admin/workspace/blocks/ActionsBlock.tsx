"use client";

import Link from "next/link";
import { resolveWorkspaceActionHref } from "@/lib/workspace/resolveWorkspaceActionHref";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
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
    workspaceBasePath = "/admin/workspace",
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
        const maxSolid = 2;
        const solidFlags: boolean[] = [];
        let solidUsed = 0;
        for (const a of block.actions) {
            const wantsSolid = a.variant === "primary" || a.variant === undefined;
            const useSolid = wantsSolid && solidUsed < maxSolid;
            solidFlags.push(useSolid);
            if (useSolid) solidUsed += 1;
        }
        return (
            <section
                className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
                data-workspace-block="actions"
                aria-label={block.title ?? "Actions"}
            >
                <h3 className="adminv2-ws-actions-rail-title">{block.title ?? "Actions"}</h3>
                <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column">
                    {block.actions.map((a, i) => {
                        const useSolid = solidFlags[i] ?? false;
                        const cls = useSolid ? "adminv2-ws-actions-rail-primary" : "adminv2-ws-actions-rail-secondary";
                        const h = hrefFor(a, ctx);
                        return (
                            <Link
                                key={a.id}
                                href={h}
                                prefetch={pf(h)}
                                className={`${cls} text-center no-underline rounded-md font-bold text-[11px]`}
                            >
                                {a.label}
                            </Link>
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
                    <Link
                        key={a.id}
                        href={h}
                        prefetch={pf(h)}
                        className={
                            a.variant === "primary"
                                ? "inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md hover:opacity-92 adminv2-ws-btn-primary-solid"
                                : "inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-admin-border text-alloy-midnight hover:bg-alloy-stone/30 adminv2-ws-btn-secondary-outline"
                        }
                    >
                        {a.label}
                    </Link>
                    );
                })}
            </div>
        </section>
    );
}
