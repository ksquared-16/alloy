"use client";

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
}: Props) {
    return (
        <div data-testid="packet-distribution-launch-panel">
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
