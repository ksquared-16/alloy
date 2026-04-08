"use client";

import Link from "next/link";
import type { WorkspaceActionsBlock } from "@/lib/workspace/types";

export function ActionsBlock({
    block,
    presentation = "flat",
}: {
    block: WorkspaceActionsBlock;
    presentation?: "flat" | "bridge";
}) {
    if (!block.actions.length) return null;

    if (presentation === "bridge") {
        let solidUsed = 0;
        const maxSolid = 2;
        return (
            <section
                className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
                data-workspace-block="actions"
                aria-label={block.title ?? "Actions"}
            >
                <h3 className="adminv2-ws-actions-rail-title">{block.title ?? "Actions"}</h3>
                <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column">
                    {block.actions.map((a) => {
                        const wantsSolid = a.variant === "primary" || a.variant === undefined;
                        const useSolid = wantsSolid && solidUsed < maxSolid;
                        if (useSolid) solidUsed += 1;
                        const cls = useSolid ? "adminv2-ws-actions-rail-primary" : "adminv2-ws-actions-rail-secondary";
                        return (
                            <Link
                                key={a.id}
                                href={a.href}
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
                {block.actions.map((a) => (
                    <Link
                        key={a.id}
                        href={a.href}
                        className={
                            a.variant === "primary"
                                ? "inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-alloy-blue text-white hover:opacity-90"
                                : "inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-admin-border text-alloy-midnight hover:bg-alloy-stone/30"
                        }
                    >
                        {a.label}
                    </Link>
                ))}
            </div>
        </section>
    );
}
