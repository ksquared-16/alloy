"use client";

import clsx from "clsx";
import PrimaryButton from "@/components/PrimaryButton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { FormsOperationalLink } from "@/components/forms/workspace/FormsOperationalLink";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import { opGroupedRowInner, opGroupedSurface, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

export type PacketPublicLinkRow = {
    id: string;
    form_definition_id: string;
    is_active: boolean;
    token_prefix: string | null;
    metadata?: Record<string, unknown>;
    created_at: string;
};

export type PacketCreatedLinkPayload = {
    embed_url: string | null;
    embed_path: string;
};

function linkLabel(link: PacketPublicLinkRow, packetName: string): string {
    const meta = link.metadata;
    const label = meta && typeof meta.label === "string" && meta.label.trim() ? meta.label.trim() : null;
    return label || `${packetName} link`;
}

type Props = {
    packetName: string;
    busy: boolean;
    links: PacketPublicLinkRow[];
    createdLink: PacketCreatedLinkPayload | null;
    viewerTz: string;
    onMintLink: () => void;
    onToggleLink: (link: PacketPublicLinkRow, nextActive: boolean) => void;
};

/** Distribution / launch panel for packet builder (OW-4). */
export function PacketDistributionLaunchPanel({
    packetName,
    busy,
    links,
    createdLink,
    viewerTz,
    onMintLink,
    onToggleLink,
}: Props) {
    const activeLinks = links.filter((l) => l.is_active);

    return (
        <div data-testid="packet-distribution-launch-panel">
            <p className={opMetadata}>
                Launch this intake workflow — families complete each step in order. Completed runs appear in the{" "}
                <FormsOperationalLink href={FORMS_MODULE_ROUTES.packetSessions}>session inbox</FormsOperationalLink> for
                review.
            </p>
            <div className="mt-3">
                <PrimaryButton type="button" className="!px-3.5 !py-2 text-sm" disabled={busy} onClick={onMintLink}>
                    Launch packet link
                </PrimaryButton>
            </div>

            {createdLink ?
                <div className="mt-4 rounded-lg bg-amber-50/80 px-4 py-3 ring-1 ring-amber-200/60">
                    <p className="text-sm font-semibold text-alloy-midnight">Copy this URL once</p>
                    <code className="mt-1 block break-all text-xs">{createdLink.embed_url ?? createdLink.embed_path}</code>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <PrimaryButton
                            type="button"
                            className="!px-3 !py-2 text-sm"
                            onClick={() => {
                                const u =
                                    createdLink.embed_url ??
                                    `${typeof window !== "undefined" ? window.location.origin : ""}${createdLink.embed_path}`;
                                void navigator.clipboard.writeText(u).catch(() => {});
                            }}
                        >
                            Copy URL
                        </PrimaryButton>
                        <a
                            className="inline-flex items-center rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2 text-sm font-medium text-alloy-blue hover:bg-alloy-stone/20"
                            href={createdLink.embed_url ?? createdLink.embed_path}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Open link
                        </a>
                    </div>
                </div>
            :   null}

            {activeLinks.length === 0 && links.length === 0 ?
                <p className={clsx("mt-4", opMetadata)}>No launch links yet. Create one when steps are saved and ready.</p>
            :   <ul className={clsx(opGroupedSurface, "mt-4")}>
                    {links.map((link) => (
                        <li key={link.id} className={opGroupedRowInner}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-alloy-midnight">{linkLabel(link, packetName)}</p>
                                    <p className={clsx("mt-0.5", opMutedMeta)}>
                                        Created {formatDateTimeForUserDisplay(link.created_at, viewerTz)}
                                        {link.token_prefix ? ` · ${link.token_prefix}` : ""}
                                    </p>
                                </div>
                                <StatusBadge label={link.is_active ? "Active" : "Inactive"} variant={link.is_active ? "success" : "neutral"} />
                            </div>
                            <div className="mt-2">
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-alloy-blue hover:underline"
                                    disabled={busy}
                                    onClick={() => onToggleLink(link, !link.is_active)}
                                >
                                    {link.is_active ? "Deactivate" : "Activate"}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            }
        </div>
    );
}
