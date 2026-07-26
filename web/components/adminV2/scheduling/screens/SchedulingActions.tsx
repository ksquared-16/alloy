"use client";

/**
 * Assignments Workspace — operator action framework.
 * Surfaces registered Assignment Platform commands; bulk commands are inventory-only until implemented.
 */

import type { ReactNode } from "react";
import { Archive, ArrowRightLeft, Layers, Plus, Star, Users } from "lucide-react";

import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { WS_EYEBROW } from "@/components/workspace/workspaceTokens";

export type AssignmentWorkspaceActionStatus = "available" | "planned" | "gated";

export type AssignmentWorkspaceAction = {
    key: string;
    label: string;
    description: string;
    status: AssignmentWorkspaceActionStatus;
    icon: ReactNode;
    registeredActionKey?: string;
};

const ASSIGNMENT_WORKSPACE_ACTIONS: AssignmentWorkspaceAction[] = [
    {
        key: "add_assignment",
        label: "Add Assignment",
        description: "Create a new operational assignment for a child from the Focus Panel or child record.",
        status: "available",
        registeredActionKey: "assignment.create",
        icon: <Plus className="h-4 w-4" strokeWidth={2} />,
    },
    {
        key: "bulk_assignment",
        label: "Bulk Assignment",
        description: "Apply an assignment pattern to many children at once.",
        status: "planned",
        icon: <Users className="h-4 w-4" strokeWidth={2} />,
    },
    {
        key: "bulk_room_change",
        label: "Bulk Room Change",
        description: "Move a cohort of assignments to a different room with effective dating.",
        status: "planned",
        icon: <ArrowRightLeft className="h-4 w-4" strokeWidth={2} />,
    },
    {
        key: "bulk_primary_change",
        label: "Bulk Primary Change",
        description: "Promote a secondary assignment to primary across selected children.",
        status: "planned",
        registeredActionKey: "assignment.set_primary",
        icon: <Star className="h-4 w-4" strokeWidth={2} />,
    },
    {
        key: "bulk_archive",
        label: "Bulk Archive",
        description: "End or archive assignments in bulk with audit trail.",
        status: "planned",
        registeredActionKey: "assignment.archive",
        icon: <Archive className="h-4 w-4" strokeWidth={2} />,
    },
];

const STATUS_LABEL: Record<AssignmentWorkspaceActionStatus, string> = {
    available: "Available",
    planned: "Planned",
    gated: "Setup required",
};

const STATUS_CLASS: Record<AssignmentWorkspaceActionStatus, string> = {
    available: "bg-alloy-bend-pine/10 text-alloy-bend-pine",
    planned: "bg-alloy-stone/40 text-alloy-midnight/55",
    gated: "bg-alloy-gold-dark/15 text-alloy-gold-dark",
};

export default function SchedulingActions({ siteName }: { siteName: string }) {
    return (
        <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4" data-assignment-workspace-actions="true">
            <div>
                <p className={WS_EYEBROW}>Workspace actions</p>
                <p className="mt-1 max-w-2xl text-[12.5px] text-alloy-slate">
                    Assignment commands run through the registered action platform at {siteName}. Open a child in the
                    Focus Panel to run <strong className="font-semibold text-alloy-midnight">Add Assignment</strong> today;
                    bulk commands are framed here for the next phase.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ASSIGNMENT_WORKSPACE_ACTIONS.map((action) => (
                    <WorkspaceCard
                        key={action.key}
                        className="p-4"
                        data-assignment-workspace-action={action.key}
                        data-assignment-action-status={action.status}
                    >
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-alloy-bend-pine/10 text-alloy-bend-pine">
                                {action.icon}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-[13px] font-semibold text-alloy-midnight">{action.label}</p>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_CLASS[action.status]}`}
                                    >
                                        {STATUS_LABEL[action.status]}
                                    </span>
                                </div>
                                <p className="mt-1 text-[11.5px] leading-snug text-alloy-slate">{action.description}</p>
                                {action.registeredActionKey ? (
                                    <p className="mt-2 text-[10px] text-alloy-midnight/45">
                                        Action key · <code className="text-alloy-midnight/40">{action.registeredActionKey}</code>
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    </WorkspaceCard>
                ))}
            </div>

            <WorkspaceCard flat className="flex items-start gap-3 p-4" data-assignment-actions-rail-note="true">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-alloy-stone/35 text-alloy-midnight">
                    <Layers className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <div>
                    <p className="text-[12.5px] font-semibold text-alloy-midnight">Command rail integration</p>
                    <p className="mt-1 text-[11.5px] leading-snug text-alloy-slate">
                        Workspace actions share the same registered command surface as the Focus Panel Scheduling card.
                        Bulk execution will mount here without a parallel assignment model.
                    </p>
                </div>
            </WorkspaceCard>
        </div>
    );
}
