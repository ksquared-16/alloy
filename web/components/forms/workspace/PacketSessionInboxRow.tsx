"use client";

import clsx from "clsx";
import Link from "next/link";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import {
    packetSessionInboxMetaLine,
    packetSessionInboxPrimaryAction,
    packetSessionInboxReviewHref,
    packetSessionInboxStatusBadges,
    packetSessionInboxSubjectLine,
    resolvePacketSessionInboxLane,
    type PacketSessionInboxLaneKey,
    type PacketSessionInboxRow,
} from "@/lib/forms/packets/packetSessionsInboxPresentation";
import { opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";
import { intakeWorkspaceBtnPrimary, intakeWorkspaceBtnSecondary } from "@/components/forms/workspace/IntakeWorkspaceHubView";

type Props = {
    session: PacketSessionInboxRow;
    lane: PacketSessionInboxLaneKey | "all";
    viewerTz: string;
    emphasize?: boolean;
};

export function PacketSessionInboxRow({ session, lane, viewerTz, emphasize = false }: Props) {
    const packetName = session.packet_name?.trim() || "Packet session";
    const subject = packetSessionInboxSubjectLine(session);
    const meta = packetSessionInboxMetaLine(session);
    const badges = packetSessionInboxStatusBadges(session, lane === "all" ? resolveDisplayLane(session) : lane);
    const action = packetSessionInboxPrimaryAction(lane === "all" ? resolveDisplayLane(session) : lane);
    const href = packetSessionInboxReviewHref(session.id);
    const timestamp =
        session.completed_at ?
            `Submitted ${formatDateTimeForUserDisplay(session.completed_at, viewerTz)}`
        : session.status === "in_progress" ?
            `Started ${formatDateTimeForUserDisplay(session.created_at ?? "", viewerTz)}`
        :   `Created ${formatDateTimeForUserDisplay(session.created_at ?? "", viewerTz)}`;

    const actionClass =
        action.kind === "review" ? intakeWorkspaceBtnPrimary
        : action.kind === "monitor" ? intakeWorkspaceBtnSecondary
        : intakeWorkspaceBtnSecondary;

    return (
        <li
            className={clsx(
                "px-4 py-3",
                emphasize && "bg-amber-50/70 ring-1 ring-inset ring-amber-200/60 first:rounded-t-xl last:rounded-b-xl"
            )}
            data-testid={`packet-inbox-row-${session.id}`}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <Link href={href} className="text-sm font-medium text-alloy-midnight hover:underline">
                        {packetName}
                    </Link>
                    {subject ?
                        <p className={clsx("mt-0.5 line-clamp-2", opMutedMeta)}>{subject}</p>
                    :   null}
                    <p className={clsx("mt-0.5", opMutedMeta)}>{timestamp}</p>
                    {meta ?
                        <p className={clsx("mt-0.5", opMutedMeta)}>{meta}</p>
                    :   null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {badges.map((badge) => (
                        <FormsReviewBadge key={badge.label} label={badge.label} tone={badge.tone} />
                    ))}
                </div>
            </div>
            <div className="mt-2.5">
                <Link href={href} className={actionClass} data-testid={`packet-inbox-action-${session.id}`}>
                    {action.label}
                </Link>
            </div>
        </li>
    );
}

function resolveDisplayLane(session: PacketSessionInboxRow): PacketSessionInboxLaneKey {
    return resolvePacketSessionInboxLane(session);
}
