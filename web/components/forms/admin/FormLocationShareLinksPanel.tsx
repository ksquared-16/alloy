"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormPublicLinkRow } from "@/components/forms/workspace/FormDistributionPanel";
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
    intakeWorkspaceBtnPrimary,
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
}: Props) {
    const [siteOptions, setSiteOptions] = useState<ShareByLocationSiteOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState<string | null>(null);
    const [locationId, setLocationId] = useState("");
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

    const handleCreateFromDropdown = () => {
        setLocalErr(null);
        if (!locationId.trim()) {
            setLocalErr("Choose a school.");
            return;
        }
        const selected = siteOptions.find((s) => s.id === locationId);
        if (!selected) {
            setLocalErr("Choose a valid school.");
            return;
        }
        handleCreate(selected);
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

            {loading ?
                <p className={clsx("mt-3", opMetadata)}>Loading schools…</p>
            : loadErr ?
                <p className="mt-3 text-sm text-alloy-ember" role="alert">
                    {loadErr}
                </p>
            : siteOptions.length === 0 ?
                <p className="mt-3 text-sm text-amber-900" data-testid="location-link-empty-state">
                    {SHARE_BY_LOCATION_COPY.emptyLocations}
                </p>
            :   <ul className="mt-3 space-y-2" data-testid="location-share-link-rows">
                    {siteOptions.map((site) => {
                        const link = findLocationSpecificShareLinkForSite(operationalLinks, site.id);
                        const embedUrl = link ? readLinkEmbedUrl(link.id) : null;
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
                                        <span className={clsx("self-center text-sm", opMutedMeta)}>
                                            Link created — copy embed right after creating a new link
                                        </span>
                                    : canMutate ?
                                        <button
                                            type="button"
                                            className={intakeWorkspaceBtnSecondary}
                                            disabled={creating}
                                            data-testid={`location-link-create-${site.id}`}
                                            onClick={() => handleCreate(site)}
                                        >
                                            {rowCreating ? "Creating…" : SHARE_BY_LOCATION_COPY.createLink}
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

            {canMutate && siteOptions.length > 0 ?
                <div
                    className="mt-4 rounded-lg bg-white/95 px-3 py-3 ring-1 ring-alloy-midnight/[0.07]"
                    data-testid="location-share-link-create"
                >
                    <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">
                        {SHARE_BY_LOCATION_COPY.createSectionTitle}
                    </p>
                    <label className="mt-2 block space-y-1">
                        <span className="text-xs font-medium text-alloy-midnight">{SHARE_BY_LOCATION_COPY.createPrompt}</span>
                        <select
                            className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm"
                            value={locationId}
                            disabled={loading || creating}
                            data-testid="location-link-location"
                            onChange={(e) => setLocationId(e.target.value)}
                        >
                            <option value="">{SHARE_BY_LOCATION_COPY.selectLocation}</option>
                            {siteOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    {localErr || createErr ?
                        <p className="mt-2 text-sm text-alloy-ember" role="alert">
                            {localErr ?? createErr}
                        </p>
                    :   null}
                    <button
                        type="button"
                        className={clsx(intakeWorkspaceBtnPrimary, "mt-3")}
                        disabled={creating || loading || !locationId}
                        data-testid="location-link-create-submit"
                        onClick={handleCreateFromDropdown}
                    >
                        {creating ? "Creating…" : SHARE_BY_LOCATION_COPY.createButton}
                    </button>
                </div>
            :   null}
        </div>
    );
}
