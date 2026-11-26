"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";
import {
    buildProcessingPublicFormIframeHtml,
    resolveProcessingPublicShareUrl,
    resolveProcessingPublicSlug,
} from "@/lib/pos/processingPublicRuntime";
import { isProcessingIntakeLink } from "@/lib/pos/processingPublicLinkMetadata";
import { readLinkEmbedUrl } from "@/lib/forms/intakeRuntimeOrchestrationStorage";
import type { ProcessingFormPublicLinkRow } from "./useProcessingFormApi";
import { AlloySecondaryButton } from "./ProcessingAlloyControls";

type Props = {
    formId: string;
    formKey: string;
    formName: string;
    existingMeta?: Record<string, unknown>;
    listPublicLinks: (formId: string) => Promise<ProcessingFormPublicLinkRow[]>;
    onManageDistribution: () => void;
    onRepublish?: () => void;
    onBackToForms?: () => void;
    republishBusy?: boolean;
};

export default function ProcessingFormPublishedBar({
    formId,
    formKey,
    formName,
    existingMeta = {},
    listPublicLinks,
    onManageDistribution,
    onRepublish,
    onBackToForms,
    republishBusy = false,
}: Props) {
    const [links, setLinks] = useState<ProcessingFormPublicLinkRow[]>([]);
    const [copied, setCopied] = useState<string | null>(null);

    const origin = typeof window !== "undefined" ? window.location.origin : null;
    const publicSlug = resolveProcessingPublicSlug(formKey, formName, existingMeta);

    const reload = useCallback(async () => {
        try {
            const rows = await listPublicLinks(formId);
            setLinks(rows.filter((l) => isProcessingIntakeLink(l.metadata) && l.is_active));
        } catch {
            setLinks([]);
        }
    }, [formId, listPublicLinks]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const primaryLink = links[0] ?? null;
    const shareUrl = useMemo(() => {
        if (!primaryLink) return null;
        const stored = readLinkEmbedUrl(primaryLink.id);
        if (stored) return stored;
        return resolveProcessingPublicShareUrl({
            embedUrl: null,
            embedPath: `/forms/${publicSlug}`,
            origin,
        });
    }, [primaryLink, publicSlug, origin]);

    const runtimeUrl = shareUrl;

    const copyText = async (label: string, text: string | null) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(label);
            window.setTimeout(() => setCopied(null), 2000);
        } catch {
            /* ignore */
        }
    };

    const iframeHtml =
        shareUrl && formName
            ? buildProcessingPublicFormIframeHtml({ embedUrl: shareUrl, formTitle: formName })
            : null;

    return (
        <div
            className="flex shrink-0 flex-wrap items-center gap-2 border-b border-alloy-bend-pine/15 bg-alloy-bend-pine/[0.04] px-4 py-2"
            data-testid="form-builder-published-bar"
        >
            <span className="text-[11px] font-semibold text-alloy-bend-pine">Published</span>
            <span className="hidden h-3 w-px bg-alloy-stone/25 sm:block" aria-hidden />
            <AlloySecondaryButton
                disabled={!shareUrl}
                onClick={() => void copyText("link", shareUrl)}
                testId="form-builder-copy-link"
            >
                {copied === "link" ? "Copied!" : "Copy link"}
            </AlloySecondaryButton>
            <AlloySecondaryButton
                disabled={!iframeHtml}
                onClick={() => void copyText("iframe", iframeHtml)}
                testId="form-builder-copy-iframe"
            >
                {copied === "iframe" ? "Copied!" : "Copy iframe"}
            </AlloySecondaryButton>
            {runtimeUrl ? (
                <a
                    href={runtimeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={WS_ACTION_SECONDARY}
                    data-testid="form-builder-open-runtime"
                >
                    Open runtime
                </a>
            ) : (
                <AlloySecondaryButton disabled testId="form-builder-open-runtime">
                    Open runtime
                </AlloySecondaryButton>
            )}
            <AlloySecondaryButton onClick={onManageDistribution} testId="form-builder-manage-distribution">
                Manage distribution
            </AlloySecondaryButton>
            {onRepublish ? (
                <AlloySecondaryButton disabled={republishBusy} onClick={onRepublish} testId="form-builder-republish-bar">
                    {republishBusy ? "Republishing…" : "Republish"}
                </AlloySecondaryButton>
            ) : null}
            <span className="flex-1" />
            {onBackToForms ? (
                <button
                    type="button"
                    onClick={onBackToForms}
                    className="text-[11px] font-semibold text-alloy-midnight/55 hover:text-alloy-midnight"
                    data-testid="form-builder-return-forms"
                >
                    Return to forms
                </button>
            ) : null}
        </div>
    );
}
