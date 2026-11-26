"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormPublicLinkRow } from "@/components/forms/workspace/FormDistributionPanel";
import { readShareEmbedPath } from "@/lib/admin/forms/distributionLinkReuse";
import { distributionIsPreviewLink } from "@/lib/forms/distributionPresentation";
import { buildFormEmbedIframeSnippet } from "@/lib/forms/formSharePresentation";
import { readLinkEmbedUrl } from "@/lib/forms/intakeRuntimeOrchestrationStorage";
import {
    SHARE_BY_LOCATION_COPY,
    findLocationSpecificShareLinkForSite,
    parseOutcomeLabelsApiPayload,
    type ShareByLocationSiteOption,
} from "@/lib/forms/shareByLocationPresentation";
import {
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

export type CreateLocationLinkInput = {
    locationId: string;
    locationName: string;
};

type Props = {
    formId: string;
    formName: string;
    links: FormPublicLinkRow[];
    hasPublished: boolean;
    canMutate?: boolean;
    creating?: boolean;
    createErr?: string | null;
    copied?: string | null;
    onCopy: (key: string, text: string) => void;
    onCreateLocationLink: (input: CreateLocationLinkInput) => void | Promise<void>;
    shareCreationBlocked?: boolean;
    shareBlockButtonLabel?: string;
    shareBlockMessage?: string | null;
};

/** Share by Location — canonical org sites + location-specific public links only. */
export function FormLocationShareLinksPanel({
    formId,
    formName,
    links,
    hasPublished,
    canMutate = false,
    creating = false,
    createErr = null,
    copied = null,
    onCopy,
    onCreateLocationLink,
    shareCreationBlocked = false,
    shareBlockButtonLabel = "Add required fields first",
    shareBlockMessage = null,
}: Props) {
    const [siteOptions, setSiteOptions] = useState<ShareByLocationSiteOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState<string | null>(null);
    const [localErr, setLocalErr] = useState<string | null>(null);
    const [creatingSiteId, setCreatingSiteId] = useState<string | null>(null);

    const loadSites = useCallback(async () => {
        setLoading(true);
        setLoadErr(null);
        try {
            const res = await fetch(
                `/api/admin/forms/${encodeURIComponent(formId)}/outcome-labels?include_picker_options=1`,
                { credentials: "include" }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((json as { error?: string }).error ?? "Could not load schools");
            }
            const data = parseOutcomeLabelsApiPayload(json);
            setSiteOptions(Array.isArray(data?.shareByLocationSites) ? data!.shareByLocationSites! : []);
        } catch (e) {
            setLoadErr((e as Error).message);
            setSiteOptions([]);
        } finally {
            setLoading(false);
        }
    }, [formId]);

    useEffect(() => {
        void loadSites();
    }, [loadSites]);

    const operationalLinks = useMemo(
        () => links.filter((l) => !distributionIsPreviewLink(l)),
        [links]
    );

    /** Persisted path (any session, any operator) → session cache → nothing. */
    const resolveLinkEmbedUrl = (link: { id: string; metadata?: Record<string, unknown> }): string | null => {
        const persisted = readShareEmbedPath(link.metadata);
        if (persisted) {
            const origin = typeof window === "undefined" ? "" : window.location.origin;
            return origin ? `${origin}${persisted}` : persisted;
        }
        return readLinkEmbedUrl(link.id);
    };

    const handleCreate = (site: ShareByLocationSiteOption) => {
        setLocalErr(null);
        setCreatingSiteId(site.id);
        void Promise.resolve(
            onCreateLocationLink({
                locationId: site.id,
                locationName: site.label,
            })
        ).finally(() => setCreatingSiteId(null));
    };


    if (!hasPublished) {
        return (
            <p className={opMetadata} data-testid="location-share-links-publish-first">
                {SHARE_BY_LOCATION_COPY.publishFirst}
            </p>
        );
    }

    return (
        <div data-testid="form-location-share-links">
            <p className={opMutedMeta}>{SHARE_BY_LOCATION_COPY.helper}</p>
            {shareCreationBlocked && shareBlockMessage ?
                <p className="mt-2 text-sm text-alloy-ember" data-testid="location-share-links-blocked">
                    {shareBlockMessage}
                </p>
            :   null}

            {loading ?
                <p className={clsx("mt-3", opMetadata)}>Loading schools…</p>
            : loadErr ?
                <p className="mt-3 text-sm text-alloy-ember" role="alert">
                    {loadErr}
                </p>
            : siteOptions.length === 0 ?
                <p className="mt-3 text-sm text-alloy-ember" data-testid="location-link-empty-state">
                    {SHARE_BY_LOCATION_COPY.emptyLocations}
                </p>
            :   <ul className="mt-3 space-y-2" data-testid="location-share-link-rows">
                    {siteOptions.map((site) => {
                        const link = findLocationSpecificShareLinkForSite(operationalLinks, site.id);
                        // The API persists a reconstructable embed path on the link
                        // (SHARE_EMBED_PATH_META_KEY) precisely so a link stays retrievable for any
                        // operator in any session. Reading only the sessionStorage cache meant every
                        // link created in an earlier session showed an uncopyable dead end.
                        const embedUrl = link ? resolveLinkEmbedUrl(link) : null;
                        const iframeSnippet =
                            embedUrl ? buildFormEmbedIframeSnippet(embedUrl, `${formName} — ${site.label}`) : null;
                        const copyLinkKey = `location-link-${site.id}`;
                        const copyEmbedKey = `location-embed-${site.id}`;
                        const rowCreating = creating && creatingSiteId === site.id;

                        return (
                            <li
                                key={site.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/95 px-3 py-2.5 ring-1 ring-alloy-midnight/[0.07]"
                                data-testid={`location-share-site-row-${site.id}`}
                            >
                                <span className="text-sm font-medium text-alloy-midnight">{site.label}</span>
                                <div className="flex flex-wrap gap-2">
                                    {link && embedUrl ?
                                        <>
                                            <button
                                                type="button"
                                                className={intakeWorkspaceBtnSecondary}
                                                data-testid={`location-link-copy-link-${site.id}`}
                                                onClick={() => onCopy(copyLinkKey, embedUrl)}
                                            >
                                                {copied === copyLinkKey ? "Copied" : SHARE_BY_LOCATION_COPY.copyLink}
                                            </button>
                                            {iframeSnippet ?
                                                <button
                                                    type="button"
                                                    className={intakeWorkspaceBtnSecondary}
                                                    data-testid={`location-link-copy-embed-${site.id}`}
                                                    onClick={() => onCopy(copyEmbedKey, iframeSnippet)}
                                                >
                                                    {copied === copyEmbedKey ? "Copied" : SHARE_BY_LOCATION_COPY.copyEmbed}
                                                </button>
                                            :   null}
                                        </>
                                    : link ?
                                        // Legacy link: the token is hashed server-side and was never
                                        // persisted, so this URL is genuinely unrecoverable. Offer the
                                        // one action that helps — mint a fresh, retrievable link.
                                        canMutate ?
                                            <button
                                                type="button"
                                                className={intakeWorkspaceBtnSecondary}
                                                disabled={creating || shareCreationBlocked}
                                                data-testid={`location-link-regenerate-${site.id}`}
                                                title="This link was created before links were retrievable. Regenerate to get a copyable URL."
                                                onClick={() => handleCreate(site)}
                                            >
                                                {rowCreating ? "Regenerating…" : "Regenerate link"}
                                            </button>
                                        :   <span className={clsx("self-center text-sm", opMutedMeta)}>
                                                Link created — not retrievable
                                            </span>
                                    : canMutate ?
                                        <button
                                            type="button"
                                            className={intakeWorkspaceBtnSecondary}
                                            disabled={creating || shareCreationBlocked}
                                            data-testid={`location-link-create-${site.id}`}
                                            title={shareCreationBlocked ? shareBlockMessage ?? undefined : undefined}
                                            onClick={() => handleCreate(site)}
                                        >
                                            {rowCreating ?
                                                "Creating…"
                                            : shareCreationBlocked ?
                                                shareBlockButtonLabel
                                            :   SHARE_BY_LOCATION_COPY.createLink}
                                        </button>
                                    :   <span className={clsx("self-center text-sm", opMutedMeta)}>
                                            {SHARE_BY_LOCATION_COPY.notSetUp}
                                        </span>}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            }

            {localErr || createErr ?
                <p className="mt-3 text-sm text-alloy-ember" role="alert" data-testid="location-share-link-error">
                    {localErr ?? createErr}
                </p>
            :   null}
        </div>
    );
}
