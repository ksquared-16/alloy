"use client";

import Link from "next/link";
import type { WorkspaceActionsBlock } from "@/lib/workspace/types";

export function ActionsBlock({ block }: { block: WorkspaceActionsBlock }) {
    if (!block.actions.length) return null;
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
