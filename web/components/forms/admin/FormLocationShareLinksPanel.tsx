"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import type { FormPublicLinkRow } from "@/components/forms/workspace/FormDistributionPanel";
import { distributionIsPreviewLink } from "@/lib/forms/distributionPresentation";
import { buildFormEmbedIframeSnippet } from "@/lib/forms/formSharePresentation";
import type { OutcomeRoutingLabelCatalog } from "@/lib/forms/outcomeConfigLabelCatalog";
import { readLinkEmbedUrl } from "@/lib/forms/intakeRuntimeOrchestrationStorage";
import {
    SHARE_BY_LOCATION_COPY,
    shareByLocationRowLabel,
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
    formKey: string;
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

/** Share by Location — one form, per-campus embed links (Firefly multi-site). */
export function FormLocationShareLinksPanel({
    formId,
    formKey,
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
    const siteFilter = useWorkspaceSiteFilter();
    const [labelCatalog, setLabelCatalog] = useState<OutcomeRoutingLabelCatalog | null>(null);
    const [siteOptions, setSiteOptions] = useState<ShareByLocationSiteOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [locationId, setLocationId] = useState("");
    const [localErr, setLocalErr] = useState<string | null>(null);

    const loadPickers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `/api/admin/forms/${encodeURIComponent(formId)}/outcome-labels?include_picker_options=1`,
                { credentials: "include" }
            );
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                const data = json as OutcomeRoutingLabelCatalog & {
                    shareByLocationSites?: ShareByLocationSiteOption[] | null;
                };
                setLabelCatalog({
                    locations: data.locations ?? {},
                    workUnits: data.workUnits ?? {},
                    departments: data.departments ?? {},
                    verticals: data.verticals ?? {},
                    opportunityStatusKeys: data.opportunityStatusKeys ?? {},
                });
                setSiteOptions(Array.isArray(data.shareByLocationSites) ? data.shareByLocationSites : []);
            }
        } finally {
            setLoading(false);
        }
    }, [formId]);

    useEffect(() => {
        void loadPickers();
    }, [loadPickers]);

    useEffect(() => {
        if (locationId || loading || siteOptions.length === 0) return;
        const stickySiteId = siteFilter?.selectedSiteId;
        if (stickySiteId && siteOptions.some((s) => s.id === stickySiteId)) {
            setLocationId(stickySiteId);
        }
    }, [loading, locationId, siteFilter?.selectedSiteId, siteOptions]);

    const operationalLinks = useMemo(
        () => links.filter((l) => !distributionIsPreviewLink(l)),
        [links]
    );

    const campusLinks = useMemo(
        () =>
            operationalLinks.filter((l) => {
                const meta = l.metadata;
                return meta && typeof meta === "object" && (meta as Record<string, unknown>).distribution_context === "location_specific";
            }),
        [operationalLinks]
    );

    const handleCreate = () => {
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
        void onCreateLocationLink({
            locationId: selected.id,
            locationName: selected.label,
        });
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

            {canMutate ?
                <div
                    className="mt-3 rounded-lg bg-white/95 px-3 py-3 ring-1 ring-alloy-midnight/[0.07]"
                    data-testid="location-share-link-create"
                >
                    <label className="block space-y-1">
                        <span className="text-xs font-medium text-alloy-midnight">{SHARE_BY_LOCATION_COPY.createPrompt}</span>
                        <select
                            className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm"
                            value={locationId}
                            disabled={loading}
                            data-testid="location-link-location"
                            onChange={(e) => setLocationId(e.target.value)}
                        >
                            <option value="">{loading ? "Loading schools…" : SHARE_BY_LOCATION_COPY.selectLocation}</option>
                            {siteOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    {!loading && siteOptions.length === 0 ?
                        <p className={clsx("mt-2 text-sm text-amber-900")} data-testid="location-link-empty-state">
                            {SHARE_BY_LOCATION_COPY.emptyLocations}
                        </p>
                    :   null}
                    {localErr || createErr ?
                        <p className="mt-2 text-sm text-alloy-ember" role="alert">
                            {localErr ?? createErr}
                        </p>
                    :   null}
                    <button
                        type="button"
                        className={clsx(intakeWorkspaceBtnPrimary, "mt-3")}
                        disabled={creating || loading || siteOptions.length === 0}
                        data-testid="location-link-create-submit"
                        onClick={handleCreate}
                    >
                        {creating ? "Creating…" : SHARE_BY_LOCATION_COPY.createButton}
                    </button>
                </div>
            :   null}

            <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm" data-testid="location-share-link-table">
                    <thead>
                        <tr className="border-b border-alloy-midnight/10 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                            <th className="px-2 py-1.5">{SHARE_BY_LOCATION_COPY.tableLocation}</th>
                            <th className="px-2 py-1.5">{SHARE_BY_LOCATION_COPY.tableStatus}</th>
                            <th className="px-2 py-1.5">{SHARE_BY_LOCATION_COPY.tableActions}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {campusLinks.length === 0 ?
                            <tr>
                                <td colSpan={3} className={clsx("px-2 py-3", opMetadata)}>
                                    {SHARE_BY_LOCATION_COPY.noLinksYet}
                                </td>
                            </tr>
                        :   campusLinks.map((link) => {
                                const rowLabel = shareByLocationRowLabel(
                                    link.metadata,
                                    labelCatalog?.locations,
                                    formKey
                                );
                                const embedUrl = readLinkEmbedUrl(link.id);
                                const iframeSnippet =
                                    embedUrl ? buildFormEmbedIframeSnippet(embedUrl, `${formName} — ${rowLabel}`) : null;

                                return (
                                    <tr
                                        key={link.id}
                                        className="border-b border-alloy-midnight/[0.06]"
                                        data-testid={`location-share-link-row-${link.id}`}
                                    >
                                        <td className="px-2 py-2 font-medium text-alloy-midnight">{rowLabel}</td>
                                        <td className="px-2 py-2">
                                            <StatusBadge
                                                label={link.is_active ? "Live" : "Inactive"}
                                                variant={link.is_active ? "success" : "neutral"}
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex flex-wrap gap-2">
                                                {iframeSnippet ?
                                                    <button
                                                        type="button"
                                                        className={intakeWorkspaceBtnSecondary}
                                                        data-testid={`location-link-copy-iframe-${link.id}`}
                                                        onClick={() => onCopy(`location-iframe-${link.id}`, iframeSnippet)}
                                                    >
                                                        {copied === `location-iframe-${link.id}` ? "Copied" : SHARE_BY_LOCATION_COPY.copyIframe}
                                                    </button>
                                                :   null}
                                                {embedUrl ?
                                                    <a
                                                        href={embedUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={intakeWorkspaceBtnSecondary}
                                                        data-testid={`location-link-open-${link.id}`}
                                                    >
                                                        {SHARE_BY_LOCATION_COPY.openLink}
                                                    </a>
                                                :   null}
                                                {!embedUrl ?
                                                    <span className={clsx("self-center", opMutedMeta)}>
                                                        {SHARE_BY_LOCATION_COPY.embedOnceHint}
                                                    </span>
                                                :   null}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
}
