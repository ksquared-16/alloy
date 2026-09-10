"use client";

import type { ReactNode } from "react";

import { DistributionLinksPanel } from "@/components/forms/workspace/DistributionLinksPanel";
import type { DistributionCreatedLinkPayload, DistributionLinkRow } from "@/lib/forms/distributionPresentation";

export type PacketPublicLinkRow = DistributionLinkRow & {
    form_definition_id: string;
    token_prefix: string | null;
};

export type PacketCreatedLinkPayload = {
    embed_url: string | null;
    embed_path: string;
};

type Props = {
    packetName: string;
    busy: boolean;
    links: PacketPublicLinkRow[];
    createdLink: PacketCreatedLinkPayload | null;
    viewerTz: string;
    onMintLink: () => void;
    onToggleLink: (link: PacketPublicLinkRow, nextActive: boolean) => void;
    /**
     * Who this launch is for, rendered above the launch control.
     *
     * A packet launched at nobody produces a session with an empty CRM snapshot, so the family is
     * asked for everything the school already knows. The slot is optional because an unscoped link
     * is still a legitimate thing to mint — for testing, or a packet that genuinely has no subject
     * yet. It is a slot rather than a picker so this wrapper keeps owning presentation only.
     */
    launchTarget?: ReactNode;
};

function toCreatedLink(payload: PacketCreatedLinkPayload | null): DistributionCreatedLinkPayload | null {
    if (!payload) return null;
    return {
        embed_path: payload.embed_path,
        embed_url: payload.embed_url,
    };
}

/** Packet distribution wrapper around shared DistributionLinksPanel (OW-7). */
export function PacketDistributionLaunchPanel({
    packetName,
    busy,
    links,
    createdLink,
    viewerTz,
    onMintLink,
    onToggleLink,
    launchTarget,
}: Props) {
    return (
        <div data-testid="packet-distribution-launch-panel">
            {launchTarget ? (
                <div className="mb-3" data-testid="packet-launch-target">
                    {launchTarget}
                </div>
            ) : null}
            <DistributionLinksPanel
                mode="packet"
                subjectName={packetName}
                canMutate
                busy={busy}
                links={links}
                createdLink={toCreatedLink(createdLink)}
                viewerTz={viewerTz}
                onLaunchPacket={onMintLink}
                onToggleLink={(link, nextActive) => onToggleLink(link as PacketPublicLinkRow, nextActive)}
            />
        </div>
    );
}
