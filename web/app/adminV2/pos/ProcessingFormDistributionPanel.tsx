"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProcessingCollapsibleInspectorSection from "./ProcessingCollapsibleInspectorSection";
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
import type { ProcessingFormPublicLinkRow, ProcessingMintedPublicLink } from "./useProcessingFormApi";

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
    mintProcessingPublicLink: (
        formId: string,
        args: {
            formName: string;
            formKey: string;
            existingMeta?: Record<string, unknown>;
            publishedVersionId?: string | null;
        }
    ) => Promise<ProcessingMintedPublicLink>;
    unpublishProcessingPublicLinks: (formId: string, links: ProcessingFormPublicLinkRow[]) => Promise<void>;
    onPublishRepublish?: () => Promise<void>;
    publishBusy?: boolean;
};

const STATUS_LABELS = {
    draft: "Draft",
    published: "Published",
    archived: "Archived",
} as const;

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
    publishBusy = false,
}: Props) {
    const [links, setLinks] = useState<ProcessingFormPublicLinkRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [minted, setMinted] = useState<ProcessingMintedPublicLink | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [copyWarn, setCopyWarn] = useState<string | null>(null);

    const processingLinks = useMemo(() => links.filter((l) => isProcessingIntakeLink(l.metadata)), [links]);
    const activeProcessingLinks = useMemo(() => processingLinks.filter((l) => l.is_active), [processingLinks]);
    const storedShareUrl = useMemo(() => {
        for (const link of activeProcessingLinks) {
            const url = readLinkEmbedUrl(link.id);
            if (url) return url;
        }
        return null;
    }, [activeProcessingLinks]);
    const publishStatus = deriveProcessingFormPublishStatus({
        formActive,
        hasPublishedVersion,
        hasActiveProcessingLink: activeProcessingLinks.length > 0,
    });
    const publicSlug = resolveProcessingPublicSlug(formKey, formName, existingMeta);
    const shareUrl = minted
        ? resolveProcessingPublicShareUrl({
              embedUrl: minted.embed_url,
              embedPath: minted.embed_path,
              origin: typeof window !== "undefined" ? window.location.origin : null,
          })
        : storedShareUrl;
    const iframeHtml = shareUrl ? buildProcessingPublicFormIframeHtml({ embedUrl: shareUrl, formTitle: formName }) : null;

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

    const handlePublishPublic = async () => {
        if (!canMutate || !hasPublishedVersion) return;
        setBusy(true);
        setErr(null);
        try {
            const publishedVersionId = await loadPublishedVersionId(formId);
            const created = await mintProcessingPublicLink(formId, {
                formName,
                formKey,
                existingMeta,
                publishedVersionId,
            });
            const embedUrl = resolveProcessingPublicShareUrl({
                embedUrl: created.embed_url,
                embedPath: created.embed_path,
                origin: typeof window !== "undefined" ? window.location.origin : null,
            });
            writeLinkEmbedUrl(created.id, embedUrl);
            setMinted(created);
            await reload();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not publish public link");
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

    return (
        <ProcessingCollapsibleInspectorSection
            title="Publish"
            subtitle="Public URL, embed, and intake status"
            accent
            defaultOpen={publishStatus === "published"}
            testId="processing-form-distribution-panel"
        >
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className="rounded-full bg-alloy-stone/[0.12] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/60"
                        data-testid="processing-form-publish-status"
                    >
                        {STATUS_LABELS[publishStatus]}
                    </span>
                    <span className="text-[11px] text-alloy-midnight/45">Slug: {publicSlug}</span>
                </div>

                <p className="text-[11px] leading-relaxed text-alloy-midnight/55">
                    Publish the form, then share a public link or iframe embed. Submissions enter Processing for review — no
                    records are created automatically.
                </p>

                {loading ? <p className="text-[11px] text-alloy-midnight/45">Loading share links…</p> : null}
                {err ? <p className="text-[11px] text-rose-700">{err}</p> : null}
                {copyWarn ? <p className="text-[11px] text-amber-800">{copyWarn}</p> : null}

                {activeProcessingLinks.length > 0 ? (
                    <div className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.04] px-3 py-2">
                        <p className="text-[11px] font-semibold text-alloy-midnight">Active public links</p>
                        <ul className="mt-2 space-y-1.5">
                            {activeProcessingLinks.map((link) => (
                                <li key={link.id} className="text-[11px] text-alloy-midnight/60">
                                    <span className="font-mono">{link.token_prefix ?? link.id.slice(0, 8)}</span>
                                    {link.pinned_form_definition_version_id ? (
                                        <span className="ml-2 text-alloy-midnight/40">pinned version</span>
                                    ) : (
                                        <span className="ml-2 text-alloy-midnight/40">latest published</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {minted && shareUrl ? (
                    <div
                        className="rounded-lg bg-amber-50/80 px-3 py-2 ring-1 ring-amber-200/60"
                        data-testid="processing-form-one-time-link"
                    >
                        <p className="text-[11px] font-semibold text-alloy-midnight">Copy this link now</p>
                        <p className="mt-1 text-[10px] text-alloy-midnight/55">
                            For security, the full URL is shown once after minting.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <code className="break-all rounded bg-white px-2 py-1 font-mono text-[10px]">{shareUrl}</code>
                            <button
                                type="button"
                                className="text-[10px] font-semibold text-alloy-blue hover:underline"
                                onClick={() => void copyText("url", shareUrl)}
                                data-testid="processing-form-copy-url"
                            >
                                {copied === "url" ? "Copied" : "Copy link"}
                            </button>
                        </div>
                        {iframeHtml ? (
                            <div className="mt-3">
                                <button
                                    type="button"
                                    className="text-[10px] font-semibold text-alloy-blue hover:underline"
                                    onClick={() => void copyText("iframe", iframeHtml)}
                                    data-testid="processing-form-copy-iframe"
                                >
                                    {copied === "iframe" ? "Copied" : "Copy iframe"}
                                </button>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                    {hasPublishedVersion && publishStatus !== "published" ? (
                        <button
                            type="button"
                            disabled={!canMutate || busy}
                            onClick={() => void handlePublishPublic()}
                            className="rounded-md bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                            data-testid="processing-form-publish-public"
                        >
                            {busy ? "Publishing…" : "Publish public link"}
                        </button>
                    ) : null}
                    {publishStatus === "published" && shareUrl ? (
                        <>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void copyText("url", shareUrl)}
                                className="config-secondary-btn text-[11px]"
                                data-testid="processing-form-copy-link"
                            >
                                {copied === "url" ? "Copied" : "Copy link"}
                            </button>
                            {iframeHtml ? (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void copyText("iframe", iframeHtml)}
                                    className="config-secondary-btn text-[11px]"
                                    data-testid="processing-form-copy-iframe-btn"
                                >
                                    {copied === "iframe" ? "Copied" : "Copy iframe"}
                                </button>
                            ) : null}
                        </>
                    ) : null}
                    {onPublishRepublish ? (
                        <button
                            type="button"
                            disabled={!canMutate || publishBusy}
                            onClick={() => void onPublishRepublish()}
                            className="config-secondary-btn text-[11px] disabled:opacity-50"
                            data-testid="processing-form-republish"
                        >
                            {publishBusy ? "Republishing…" : "Republish"}
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
                            {busy ? "Unpublishing…" : "Unpublish"}
                        </button>
                    ) : null}
                </div>

                {!hasPublishedVersion ? (
                    <p className="text-[10px] text-alloy-midnight/45">Publish the form from the toolbar before sharing publicly.</p>
                ) : null}
            </div>
        </ProcessingCollapsibleInspectorSection>
    );
}
