"use client";

/**
 * Assignments Workspace — operator action pointers.
 * Commands execute from the Workspace header Actions menu and Roster selection toolbar.
 * This panel is informational only — not a parallel Actions page for execution.
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
        description: "Header Add Assignment, Focus Panel, or selected Roster child.",
        status: "available",
        registeredActionKey: "assignment.create",
        icon: <Plus className="h-4 w-4" strokeWidth={2} />,
    },
    {
        key: "bulk_assignment",
        label: "Bulk Assignment",
        description: "Select children on the Roster Assignments view, then Bulk assign.",
        status: "available",
        icon: <Users className="h-4 w-4" strokeWidth={2} />,
    },
    {
        key: "bulk_room_change",
        label: "Bulk Room Change",
        description: "Select assignments on the Roster, then Bulk room change with effective dating.",
        status: "available",
        icon: <ArrowRightLeft className="h-4 w-4" strokeWidth={2} />,
    },
    {
        key: "bulk_primary_change",
        label: "Bulk Primary Change",
        description: "Select secondary assignments on the Roster, then Make primary.",
        status: "available",
        registeredActionKey: "assignment.set_primary",
        icon: <Star className="h-4 w-4" strokeWidth={2} />,
    },
    {
        key: "bulk_archive",
        label: "Bulk Archive",
        description: "Select non-primary assignments on the Roster, then Archive.",
        status: "available",
        registeredActionKey: "assignment.archive",
        icon: <Archive className="h-4 w-4" strokeWidth={2} />,
    },
];

const STATUS_LABEL: Record<AssignmentWorkspaceActionStatus, string> = {
    available: "Available",
    planned: "Proposed",
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
                    Assignment commands for {siteName} run from the Workspace header Actions menu and the Roster
                    selection toolbar — not from a separate Actions page.
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
                    <p className="text-[12.5px] font-semibold text-alloy-midnight">Command surfaces</p>
                    <p className="mt-1 text-[11.5px] leading-snug text-alloy-slate">
                        Use header Actions for Add Assignment and bulk entry points, then complete selection and preview on
                        the Roster Assignments view.
                    </p>
                </div>
            </WorkspaceCard>
        </div>
    );
}
