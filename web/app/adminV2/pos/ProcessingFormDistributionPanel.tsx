"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProcessingCollapsibleInspectorSection from "./ProcessingCollapsibleInspectorSection";
import { BosExecutionLoader } from "@/components/admin/actions/BosExecutionLoader";
import {
    deriveProcessingFormPublishStatus,
    isProcessingIntakeLink,
} from "@/lib/pos/processingPublicLinkMetadata";
import {
    buildProcessingPublicFormIframeHtml,
    resolveProcessingPublicShareUrl,
    resolveProcessingPublicSlug,
} from "@/lib/pos/processingPublicRuntime";
import { readLinkEmbedUrl, writeLinkEmbedUrl } from "@/lib/forms/intakeRuntimeOrchestrationStorage";
import { resolveLinkLocationLabel } from "@/lib/forms/locationSpecificPublicLinkMetadata";
import { linkScopeLocationId, readShareEmbedPath } from "@/lib/admin/forms/distributionLinkReuse";
import type { ProcessingFormPublicLinkRow, ProcessingMintedPublicLink } from "./useProcessingFormApi";

type SiteOption = { id: string; label: string };

type MintArgs = {
    formName: string;
    formKey: string;
    existingMeta?: Record<string, unknown>;
    publishedVersionId?: string | null;
    locationId?: string;
    locationName?: string;
};

type Props = {
    formId: string;
    formKey: string;
    formName: string;
    formActive?: boolean;
    hasPublishedVersion?: boolean;
    existingMeta?: Record<string, unknown>;
    canMutate?: boolean;
    listPublicLinks: (formId: string) => Promise<ProcessingFormPublicLinkRow[]>;
    loadPublishedVersionId: (formId: string) => Promise<string | null>;
    mintProcessingPublicLink: (formId: string, args: MintArgs) => Promise<ProcessingMintedPublicLink>;
    unpublishProcessingPublicLinks: (formId: string, links: ProcessingFormPublicLinkRow[]) => Promise<void>;
    onPublishRepublish?: () => Promise<void>;
    onBackToForms?: () => void;
    publishBusy?: boolean;
    publishJustSucceeded?: boolean;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Render inner content without the own collapsible wrapper (for composing under a parent section). */
    bare?: boolean;
};

const STATUS_LABELS = {
    draft: "Draft",
    published: "Published",
    archived: "Archived",
} as const;

function resolveLinkShareUrl(link: ProcessingFormPublicLinkRow, origin: string | null): string | null {
    // Retrievable posture: the reconstructable embed path is persisted in link metadata, so any operator
    // can re-copy the URL in any session. Fall back to the legacy per-tab sessionStorage cache.
    const persisted = readShareEmbedPath(link.metadata);
    if (persisted) return origin ? `${origin.replace(/\/$/, "")}${persisted}` : persisted;
    const stored = readLinkEmbedUrl(link.id);
    if (stored) return stored;
    return null;
}

export default function ProcessingFormDistributionPanel({
    formId,
    formKey,
    formName,
    formActive = true,
    hasPublishedVersion = false,
    existingMeta = {},
    canMutate = true,
    listPublicLinks,
    loadPublishedVersionId,
    mintProcessingPublicLink,
    unpublishProcessingPublicLinks,
    onPublishRepublish,
    onBackToForms,
    publishBusy = false,
    publishJustSucceeded = false,
    defaultOpen = false,
    open,
    onOpenChange,
    bare = false,
}: Props) {
    const [links, setLinks] = useState<ProcessingFormPublicLinkRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [minted, setMinted] = useState<ProcessingMintedPublicLink | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [copyWarn, setCopyWarn] = useState<string | null>(null);
    const [sites, setSites] = useState<SiteOption[]>([]);
    const [sitesLoading, setSitesLoading] = useState(false);
    const [distributionScope, setDistributionScope] = useState<"all_sites" | "selected_sites">("all_sites");
    const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);

    const origin = typeof window !== "undefined" ? window.location.origin : null;

    const processingLinks = useMemo(() => links.filter((l) => isProcessingIntakeLink(l.metadata)), [links]);
    const activeProcessingLinks = useMemo(() => processingLinks.filter((l) => l.is_active), [processingLinks]);

    const siteCatalog = useMemo(() => {
        const map: Record<string, string> = {};
        for (const s of sites) map[s.id] = s.label;
        return map;
    }, [sites]);

    const publishStatus = deriveProcessingFormPublishStatus({
        formActive,
        hasPublishedVersion,
        hasActiveProcessingLink: activeProcessingLinks.length > 0,
    });
    const publicSlug = resolveProcessingPublicSlug(formKey, formName, existingMeta);

    const mintedShareUrl = minted
        ? resolveProcessingPublicShareUrl({
              embedUrl: minted.embed_url,
              embedPath: minted.embed_path,
              origin,
          })
        : null;

    const reload = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const rows = await listPublicLinks(formId);
            setLinks(rows);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to load share links");
            setLinks([]);
        } finally {
            setLoading(false);
        }
    }, [formId, listPublicLinks]);

    useEffect(() => {
        void reload();
    }, [reload, hasPublishedVersion]);

    useEffect(() => {
        if (!hasPublishedVersion) return;
        let cancelled = false;
        setSitesLoading(true);
        (async () => {
            try {
                const res = await fetch("/api/admin/workspace/site-filter", { credentials: "same-origin" });
                const body = (await res.json()) as { sites?: Array<{ id: string; label: string }> };
                if (cancelled) return;
                setSites((body.sites ?? []).map((s) => ({ id: s.id, label: s.label })));
            } catch {
                if (!cancelled) setSites([]);
            } finally {
                if (!cancelled) setSitesLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [hasPublishedVersion]);

    const copyText = async (key: string, text: string) => {
        setCopyWarn(null);
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            setCopied(null);
            setCopyWarn("Clipboard unavailable — select the text and copy manually.");
        }
    };

    const mintLinks = async (targets: Array<{ locationId?: string; locationName?: string }>) => {
        const publishedVersionId = await loadPublishedVersionId(formId);
        const created: ProcessingMintedPublicLink[] = [];
        for (const target of targets) {
            const link = await mintProcessingPublicLink(formId, {
                formName,
                formKey,
                existingMeta,
                publishedVersionId,
                ...(target.locationId ? { locationId: target.locationId, locationName: target.locationName } : {}),
            });
            const embedUrl = resolveProcessingPublicShareUrl({
                embedUrl: link.embed_url,
                embedPath: link.embed_path,
                origin,
            });
            if (embedUrl) writeLinkEmbedUrl(link.id, embedUrl);
            created.push(link);
        }
        if (created.length === 1) setMinted(created[0]!);
        await reload();
    };

    const handleCreateDistributionLinks = async () => {
        if (!canMutate || !hasPublishedVersion) return;
        setBusy(true);
        setErr(null);
        try {
            if (distributionScope === "all_sites") {
                await mintLinks([{}]);
            } else {
                if (selectedSiteIds.length === 0) {
                    setErr("Select at least one site.");
                    return;
                }
                const targets = selectedSiteIds.map((id) => {
                    const site = sites.find((s) => s.id === id);
                    return { locationId: id, locationName: site?.label ?? "Location" };
                });
                await mintLinks(targets);
            }
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not create distribution links");
        } finally {
            setBusy(false);
        }
    };

    const handleUnpublish = async () => {
        if (!canMutate) return;
        setBusy(true);
        setErr(null);
        try {
            await unpublishProcessingPublicLinks(formId, links);
            setMinted(null);
            await reload();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not unpublish");
        } finally {
            setBusy(false);
        }
    };

    const regenerateLink = async (link: ProcessingFormPublicLinkRow) => {
        if (!canMutate) return;
        setBusy(true);
        setErr(null);
        try {
            const publishedVersionId = await loadPublishedVersionId(formId);
            const locationId = linkScopeLocationId(link.metadata) ?? undefined;
            const created = await mintProcessingPublicLink(formId, {
                formName,
                formKey,
                existingMeta,
                publishedVersionId,
                regenerate: true,
                ...(locationId
                    ? { locationId, locationName: siteCatalog[locationId] ?? "Location" }
                    : {}),
            });
            const embedUrl = resolveProcessingPublicShareUrl({
                embedUrl: created.embed_url,
                embedPath: created.embed_path,
                origin,
            });
            if (embedUrl) writeLinkEmbedUrl(created.id, embedUrl);
            setMinted(created);
            await reload();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not regenerate link");
        } finally {
            setBusy(false);
        }
    };

    const toggleSite = (siteId: string) => {
        setSelectedSiteIds((prev) => (prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]));
    };

    const body = (
        <div className="space-y-3" data-testid="processing-form-distribution-panel">
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className="rounded-full bg-alloy-stone/[0.12] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/60"
                        data-testid="processing-form-publish-status"
                    >
                        {hasPublishedVersion ? STATUS_LABELS.published : STATUS_LABELS.draft}
                    </span>
                    {activeProcessingLinks.length > 0 ? (
                        <span className="text-[10px] text-alloy-bend-pine">
                            {activeProcessingLinks.length} active link{activeProcessingLinks.length === 1 ? "" : "s"}
                        </span>
                    ) : null}
                    <span className="text-[11px] text-alloy-midnight/45">Slug: {publicSlug}</span>
                </div>

                {publishJustSucceeded ? (
                    <div
                        className="rounded-lg border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.06] px-3 py-2"
                        data-testid="processing-form-publish-success"
                    >
                        <p className="text-[11px] font-semibold text-alloy-bend-pine">Published successfully</p>
                        <p className="text-[11px] text-alloy-midnight/55">
                            Your form version is live. Create distribution links below to share it publicly.
                        </p>
                    </div>
                ) : null}

                {loading ? <BosExecutionLoader variant="inline" title="Loading links" /> : null}
                {err ? <p className="text-[11px] text-rose-700">{err}</p> : null}
                {copyWarn ? <p className="text-[11px] text-alloy-ember">{copyWarn}</p> : null}

                {!hasPublishedVersion ? (
                    <p className="text-[11px] text-alloy-midnight/45">
                        Publish the form from the toolbar first. Distribution links can be created after publish.
                    </p>
                ) : (
                    <>
                        <fieldset className="space-y-2">
                            <legend className="text-[11px] font-semibold text-alloy-midnight">Distribution scope</legend>
                            <label className="flex items-center gap-2 text-[11px]">
                                <input
                                    type="radio"
                                    name={`distribution-scope-${formId}`}
                                    checked={distributionScope === "all_sites"}
                                    onChange={() => setDistributionScope("all_sites")}
                                    data-testid="processing-distribution-all-sites"
                                />
                                All sites (org-wide link)
                            </label>
                            <label className="flex items-center gap-2 text-[11px]">
                                <input
                                    type="radio"
                                    name={`distribution-scope-${formId}`}
                                    checked={distributionScope === "selected_sites"}
                                    onChange={() => setDistributionScope("selected_sites")}
                                    data-testid="processing-distribution-selected-sites"
                                />
                                Selected sites (one link per site)
                            </label>
                        </fieldset>

                        {distributionScope === "selected_sites" ? (
                            <div className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.03] px-3 py-2">
                                {sitesLoading ? (
                                    <BosExecutionLoader variant="inline" title="Loading sites" />
                                ) : sites.length === 0 ? (
                                    <p className="text-[11px] text-alloy-midnight/45">No sites available for this organization.</p>
                                ) : (
                                    <ul className="max-h-32 space-y-1 overflow-y-auto">
                                        {sites.map((site) => (
                                            <li key={site.id}>
                                                <label className="flex items-center gap-2 text-[11px]">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedSiteIds.includes(site.id)}
                                                        onChange={() => toggleSite(site.id)}
                                                        data-testid={`processing-distribution-site-${site.id}`}
                                                    />
                                                    {site.label}
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ) : null}

                        <button
                            type="button"
                            disabled={!canMutate || busy}
                            onClick={() => void handleCreateDistributionLinks()}
                            className="rounded-md bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                            data-testid="processing-form-create-distribution-links"
                        >
                            {busy ? "Creating…" : "Create distribution link(s)"}
                        </button>
                    </>
                )}

                {activeProcessingLinks.length > 0 ? (
                    <ul className="space-y-2" data-testid="processing-form-active-links">
                        {activeProcessingLinks.map((link) => {
                            const locationLabel = resolveLinkLocationLabel(
                                link.metadata as Record<string, unknown>,
                                siteCatalog
                            );
                            const shareUrl =
                                link.id === minted?.id && mintedShareUrl
                                    ? mintedShareUrl
                                    : resolveLinkShareUrl(link, origin);
                            const iframeHtml = shareUrl
                                ? buildProcessingPublicFormIframeHtml({ embedUrl: shareUrl, formTitle: formName })
                                : null;
                            return (
                                <li
                                    key={link.id}
                                    className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.04] px-3 py-2"
                                >
                                    <p className="text-[11px] font-semibold text-alloy-midnight">
                                        {locationLabel ?? "Org-wide"}
                                    </p>
                                    <p className="text-[10px] text-alloy-midnight/40">
                                        {link.token_prefix ?? link.id.slice(0, 8)}
                                        {link.pinned_form_definition_version_id ? " · pinned version" : " · latest published"}
                                    </p>
                                    {shareUrl ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="config-secondary-btn text-[10px]"
                                                onClick={() => void copyText(`url-${link.id}`, shareUrl)}
                                                data-testid={`processing-form-copy-link-${link.id}`}
                                            >
                                                {copied === `url-${link.id}` ? "Copied" : "Copy link"}
                                            </button>
                                            {iframeHtml ? (
                                                <button
                                                    type="button"
                                                    className="config-secondary-btn text-[10px]"
                                                    onClick={() => void copyText(`iframe-${link.id}`, iframeHtml)}
                                                >
                                                    {copied === `iframe-${link.id}` ? "Copied" : "Copy iframe"}
                                                </button>
                                            ) : null}
                                            <a
                                                href={shareUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="config-secondary-btn text-[10px]"
                                                data-testid={`processing-form-open-link-${link.id}`}
                                            >
                                                Open
                                            </a>
                                            <button
                                                type="button"
                                                disabled={!canMutate || busy}
                                                className="config-secondary-btn text-[10px] disabled:opacity-50"
                                                onClick={() => void regenerateLink(link)}
                                                data-testid={`processing-form-regenerate-link-${link.id}`}
                                                title="Rotate to a fresh link — the current URL stops working"
                                            >
                                                {busy ? "Working…" : "Regenerate"}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="mt-1 space-y-1">
                                            <p className="text-[10px] text-alloy-midnight/40">
                                                This link was minted before links were retrievable, so its URL can’t be
                                                shown. Regenerate a fresh, copyable link (the old one stops working).
                                            </p>
                                            <button
                                                type="button"
                                                disabled={!canMutate || busy}
                                                className="config-secondary-btn text-[10px] disabled:opacity-50"
                                                onClick={() => void regenerateLink(link)}
                                                data-testid={`processing-form-regenerate-link-${link.id}`}
                                            >
                                                {busy ? "Regenerating…" : "Regenerate link"}
                                            </button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                ) : null}

                {minted && mintedShareUrl ? (
                    <div
                        className="rounded-lg bg-alloy-ember/[0.06] px-3 py-2 ring-1 ring-alloy-ember/20"
                        data-testid="processing-form-one-time-link"
                    >
                        <p className="text-[11px] font-semibold text-alloy-midnight">Your distribution link</p>
                        <p className="mt-1 text-[10px] text-alloy-midnight/55">
                            Copy it now, or come back anytime — it stays retrievable from the list above.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <code className="break-all rounded bg-white px-2 py-1 font-mono text-[10px]">{mintedShareUrl}</code>
                            <button
                                type="button"
                                className="text-[10px] font-semibold text-alloy-bend-pine hover:underline"
                                onClick={() => void copyText("url", mintedShareUrl)}
                                data-testid="processing-form-copy-url"
                            >
                                {copied === "url" ? "Copied" : "Copy link"}
                            </button>
                            <a
                                href={mintedShareUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-semibold text-alloy-bend-pine hover:underline"
                                data-testid="processing-form-open-minted"
                            >
                                Open
                            </a>
                        </div>
                    </div>
                ) : null}

                <div className="flex flex-wrap gap-2 border-t border-alloy-stone/10 pt-3">
                    {onPublishRepublish && hasPublishedVersion ? (
                        <button
                            type="button"
                            disabled={!canMutate || publishBusy}
                            onClick={() => void onPublishRepublish()}
                            className="config-secondary-btn text-[11px] disabled:opacity-50"
                            data-testid="processing-form-republish"
                        >
                            {publishBusy ? "Republishing…" : "Republish version"}
                        </button>
                    ) : null}
                    {activeProcessingLinks.length > 0 ? (
                        <button
                            type="button"
                            disabled={!canMutate || busy}
                            onClick={() => void handleUnpublish()}
                            className="config-secondary-btn text-[11px] disabled:opacity-50"
                            data-testid="processing-form-unpublish"
                        >
                            {busy ? "Deactivating…" : "Deactivate links"}
                        </button>
                    ) : null}
                    {onBackToForms ? (
                        <button
                            type="button"
                            onClick={onBackToForms}
                            className="config-secondary-btn text-[11px]"
                            data-testid="processing-form-return-to-forms"
                        >
                            Return to Forms
                        </button>
                    ) : null}
                </div>
            </div>
    );

    if (bare) return body;

    return (
        <ProcessingCollapsibleInspectorSection
            title="Distribution"
            subtitle="Share links after publish — separate from publishing the form"
            accent
            defaultOpen={defaultOpen || publishStatus === "published" || publishJustSucceeded}
            open={open}
            onOpenChange={onOpenChange}
        >
            {body}
        </ProcessingCollapsibleInspectorSection>
    );
}
