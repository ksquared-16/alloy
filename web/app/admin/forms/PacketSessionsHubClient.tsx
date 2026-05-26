"use client";

import clsx from "clsx";
import Link from "next/link";
import { TechnicalDetailDisclosure } from "@/components/forms/review";
import {
    FormsOperationalLink,
    FormsWorkspaceShell,
} from "@/components/forms/workspace";
import { PacketSessionInboxRow as PacketSessionInboxRowView } from "@/components/forms/workspace/PacketSessionInboxRow";
import { IntakeWorkspaceRegion } from "@/components/forms/workspace/IntakeWorkspaceRegion";
import { intakeWorkspaceBtnSecondary } from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { FORMS_MODULE_ROUTES, formsWorkspaceBreadcrumbs } from "@/lib/forms/formsModuleNav";
import {
    groupPacketSessionsIntoInboxLanes,
    PACKET_SESSION_INBOX_LANE_COPY,
    type PacketSessionInboxLaneKey,
    type PacketSessionInboxRow,
} from "@/lib/forms/packets/packetSessionsInboxPresentation";
import {
    opCaseFileCanvas,
    opGroupedSurface,
    opMetadata,
    opOrientationSurface,
    opRegionSeparator,
    opStackPage,
} from "@/lib/operational/ui/operationalVisualTokens";

export type { PacketSessionInboxRow as PacketSessionListRow };

type Props = {
    sessions: PacketSessionInboxRow[];
    errorMessage?: string | null;
};

function InboxLaneSection({
    laneKey,
    sessions,
    viewerTz,
    emphasize,
}: {
    laneKey: PacketSessionInboxLaneKey;
    sessions: PacketSessionInboxRow[];
    viewerTz: string;
    emphasize?: boolean;
}) {
    const copy = PACKET_SESSION_INBOX_LANE_COPY[laneKey];

    return (
        <IntakeWorkspaceRegion
            title={copy.title}
            lead={copy.lead}
            data-testid={copy.testId}
        >
            {sessions.length === 0 ?
                <p className={opMetadata}>{copy.empty}</p>
            :   <ul className={clsx(opGroupedSurface, emphasize && "overflow-hidden")}>
                    {sessions.map((session) => (
                        <PacketSessionInboxRowView
                            key={session.id}
                            session={session}
                            lane={laneKey}
                            viewerTz={viewerTz}
                            emphasize={emphasize}
                        />
                    ))}
                </ul>
            }
        </IntakeWorkspaceRegion>
    );
}

export default function PacketSessionsHubClient({ sessions, errorMessage }: Props) {
    const viewerTz = useAdminViewerTimezone();
    const lanes = groupPacketSessionsIntoInboxLanes(sessions);
    const reviewCount = lanes.needsReview.length + lanes.needsCorrection.length;

    return (
        <FormsWorkspaceShell
            title="Packet sessions inbox"
            subtitle="Review work queue for intake packets — prioritized by what needs your attention."
            breadcrumbs={formsWorkspaceBreadcrumbs([{ label: "Sessions" }])}
            actions={
                <>
                    <FormsOperationalLink href={FORMS_MODULE_ROUTES.workspace}>Workspace</FormsOperationalLink>
                    <FormsOperationalLink href={FORMS_MODULE_ROUTES.submissionsHub}>Submissions</FormsOperationalLink>
                    <FormsOperationalLink href={FORMS_MODULE_ROUTES.packetDefinitions}>Packets</FormsOperationalLink>
                </>
            }
            contentClassName="space-y-0"
        >
            {errorMessage ?
                <p className="text-sm text-alloy-ember">{errorMessage}</p>
            : sessions.length === 0 ?
                <p className={opMetadata}>
                    No packet sessions yet. Configure a packet under{" "}
                    <FormsOperationalLink href={FORMS_MODULE_ROUTES.packetDefinitions}>Packets</FormsOperationalLink>
                    , then mint a packet public link to start intake.
                </p>
            :   <div className={clsx(opCaseFileCanvas, opStackPage)} data-testid="packet-sessions-inbox">
                    <div className={opOrientationSurface}>
                        <p className={opMetadata}>
                            {reviewCount > 0 ?
                                `${reviewCount} session${reviewCount === 1 ? "" : "s"} ready for review`
                            :   "No sessions waiting for review"}
                            {" · "}
                            {lanes.inProgress.length} in progress
                            {" · "}
                            {lanes.recentlyCompleted.length} recently completed
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Link href={FORMS_MODULE_ROUTES.workspace} className={intakeWorkspaceBtnSecondary}>
                                Back to workspace
                            </Link>
                            {reviewCount > 0 && lanes.needsReview[0] ?
                                <Link
                                    href={`${FORMS_MODULE_ROUTES.packetSessions}/${encodeURIComponent(lanes.needsReview[0].id)}`}
                                    className={intakeWorkspaceBtnSecondary}
                                >
                                    Open next review
                                </Link>
                            :   null}
                        </div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                        <InboxLaneSection
                            laneKey="needsReview"
                            sessions={lanes.needsReview}
                            viewerTz={viewerTz}
                            emphasize
                        />
                        <InboxLaneSection
                            laneKey="needsCorrection"
                            sessions={lanes.needsCorrection}
                            viewerTz={viewerTz}
                            emphasize
                        />
                    </div>

                    <div className={clsx(opRegionSeparator, "grid gap-5 lg:grid-cols-2")}>
                        <InboxLaneSection laneKey="inProgress" sessions={lanes.inProgress} viewerTz={viewerTz} />
                        <InboxLaneSection
                            laneKey="recentlyCompleted"
                            sessions={lanes.recentlyCompleted}
                            viewerTz={viewerTz}
                        />
                    </div>

                    <div className={opRegionSeparator}>
                        <TechnicalDetailDisclosure
                            title="All sessions"
                            helperText={`${sessions.length} total — chronological reference.`}
                        >
                            <ul className={opGroupedSurface} data-testid="packet-inbox-all-sessions">
                                {sessions.map((session) => (
                                    <PacketSessionInboxRowView
                                        key={`all-${session.id}`}
                                        session={session}
                                        lane="all"
                                        viewerTz={viewerTz}
                                    />
                                ))}
                            </ul>
                        </TechnicalDetailDisclosure>
                    </div>
                </div>
            }
        </FormsWorkspaceShell>
    );
}
