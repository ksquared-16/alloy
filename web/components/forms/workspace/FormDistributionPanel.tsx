"use client";

import clsx from "clsx";
import { StatusBadge } from "@/components/admin/StatusBadge";
import PrimaryButton from "@/components/PrimaryButton";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { ADMIN_PREVIEW_LINK_LABEL } from "@/lib/forms/adminFormPreview";
import { MEDICATION_AUTHORIZATION_DEMO_FORM_KEY } from "@/lib/forms/seeds/medicationAuthorizationDemo";
import { opGroupedRowInner, opGroupedSurface, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

export type FormPublicLinkRow = {
    id: string;
    is_active: boolean;
    expires_at: string | null;
    token_prefix: string | null;
    pinned_form_definition_version_id: string | null;
    created_at: string;
    metadata?: Record<string, unknown>;
};

export type CreatedLinkPayload = {
    plaintext_token: string;
    embed_path: string;
    embed_url: string | null;
};

function linkLabel(link: FormPublicLinkRow): string {
    const meta = link.metadata;
    const label =
        meta && typeof meta.label === "string" && meta.label.trim() ? meta.label.trim() : null;
    if (label) return label;
    if (meta && (meta as { admin_preview?: unknown }).admin_preview === true) return ADMIN_PREVIEW_LINK_LABEL;
    if (link.token_prefix) return `Link · ${link.token_prefix}`;
    return "Public link";
}

function isPreviewLink(link: FormPublicLinkRow): boolean {
    const meta = link.metadata;
    if (!meta) return false;
    if ((meta as { admin_preview?: unknown }).admin_preview === true) return true;
    return typeof meta.label === "string" && meta.label.trim() === ADMIN_PREVIEW_LINK_LABEL;
}

type Props = {
    formKey: string;
    canMutate: boolean;
    creating: boolean;
    createErr: string | null;
    links: FormPublicLinkRow[];
    createdOnce: CreatedLinkPayload | null;
    copied: string | null;
    copyWarn: string | null;
    viewerTz: string;
    onCreateLink: () => void;
    onCopy: (key: string, text: string) => void;
};

/** Distribution panel — where this form is shared (OW-3). */
export function FormDistributionPanel({
    formKey,
    canMutate,
    creating,
    createErr,
    links,
    createdOnce,
    copied,
    copyWarn,
    viewerTz,
    onCreateLink,
    onCopy,
}: Props) {
    const activeLinks = links.filter((l) => l.is_active);
    const inactiveLinks = links.filter((l) => !l.is_active);

    return (
        <div data-testid="form-distribution-panel">
            {!canMutate ?
                <p className={opMetadata}>Admin role required to create links.</p>
            :   <PrimaryButton
                    type="button"
                    className="!px-3.5 !py-2 text-sm"
                    onClick={onCreateLink}
                    disabled={creating}
                >
                    {creating ? "Creating…" : "Create public link"}
                </PrimaryButton>
            }
            {createErr ?
                <p className="mt-2 text-sm text-alloy-ember">{createErr}</p>
            :   null}
            {formKey === MEDICATION_AUTHORIZATION_DEMO_FORM_KEY ?
                <p className={clsx("mt-2 max-w-2xl", opMetadata)}>
                    Demo links enable CRM intake when your org has an active cleaning vertical configured.
                </p>
            :   null}

            {createdOnce ?
                <div className="mt-4 rounded-lg bg-amber-50/80 px-4 py-3 ring-1 ring-amber-200/60">
                    <p className="text-sm font-semibold text-alloy-midnight">Copy now — token shown only once</p>
                    <div className="mt-2 space-y-2 text-sm">
                        <div>
                            <span className={opMutedMeta}>Token</span>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">
                                    {createdOnce.plaintext_token}
                                </code>
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-alloy-blue hover:underline"
                                    onClick={() => onCopy("token", createdOnce.plaintext_token)}
                                >
                                    {copied === "token" ? "Copied" : "Copy"}
                                </button>
                            </div>
                        </div>
                        <div>
                            <span className={opMutedMeta}>Embed URL</span>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">
                                    {createdOnce.embed_url ??
                                        `${typeof window !== "undefined" ? window.location.origin : ""}${createdOnce.embed_path}`}
                                </code>
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-alloy-blue hover:underline"
                                    onClick={() =>
                                        onCopy(
                                            "url",
                                            createdOnce.embed_url ??
                                                `${typeof window !== "undefined" ? window.location.origin : ""}${createdOnce.embed_path}`
                                        )
                                    }
                                >
                                    {copied === "url" ? "Copied" : "Copy"}
                                </button>
                            </div>
                        </div>
                    </div>
                    {copyWarn ?
                        <p className={clsx("mt-3", opMetadata)}>{copyWarn}</p>
                    :   null}
                </div>
            :   null}

            <p className={clsx("mt-4", opMetadata)}>
                Active distribution links for this form. Full tokens are never shown again after creation — only
                prefixes for identification.
            </p>

            {activeLinks.length === 0 && links.length === 0 ?
                <p className={clsx("mt-3", opMetadata)}>No links yet. Create one when you are ready to share intake.</p>
            :   <ul className={clsx(opGroupedSurface, "mt-3")}>
                    {activeLinks.map((link) => (
                        <li key={link.id} className={opGroupedRowInner}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-alloy-midnight">{linkLabel(link)}</p>
                                    <p className={clsx("mt-0.5", opMutedMeta)}>
                                        Created {formatDateTimeForUserDisplay(link.created_at, viewerTz)}
                                        {link.expires_at ?
                                            ` · Expires ${formatDateTimeForUserDisplay(link.expires_at, viewerTz)}`
                                        :   ""}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {isPreviewLink(link) ?
                                        <StatusBadge label="Preview" variant="info" />
                                    :   null}
                                    <StatusBadge label="Active" variant="success" />
                                </div>
                            </div>
                        </li>
                    ))}
                    {inactiveLinks.map((link) => (
                        <li key={link.id} className={clsx(opGroupedRowInner, "opacity-75")}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-alloy-midnight">{linkLabel(link)}</p>
                                    <p className={clsx("mt-0.5", opMutedMeta)}>
                                        Created {formatDateTimeForUserDisplay(link.created_at, viewerTz)}
                                    </p>
                                </div>
                                <StatusBadge label="Inactive" variant="neutral" />
                            </div>
                        </li>
                    ))}
                </ul>
            }
        </div>
    );
}
