"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    FormLifecycleWorkspaceLayout,
} from "@/components/forms/workspace/FormLifecycleWorkspaceLayout";
import {
    type CreatedLinkPayload,
    type FormPublicLinkRow,
} from "@/components/forms/workspace/FormDistributionPanel";
import { FormsOperationalLink, FormsWorkspaceShell } from "@/components/forms/workspace";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    ADMIN_PREVIEW_LINK_LABEL,
    ADMIN_PREVIEW_LINK_METADATA,
    appendPreviewQueryToFullUrl,
    buildPreviewEmbedUrl,
    previewEmbedSessionStorageKey,
} from "@/lib/forms/adminFormPreview";
import {
    buildConnectedSystemsBullets,
    formVersionHasDocumentMapping,
    parseOperatorContext,
    resolveAfterSubmissionParagraph,
    resolvePurposeParagraph,
    resolveWhoCompletesParagraph,
} from "@/lib/forms/operatorFormGuidance";
import {
    buildFormLifecycleSteps,
    formLifecyclePurposeLine,
    formLifecyclePublishSummaryLabel,
} from "@/lib/forms/formLifecyclePresentation";
import { formsWorkspaceBreadcrumbs, FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";
import { opMetadata } from "@/lib/operational/ui/operationalVisualTokens";

type VersionRow = {
    id: string;
    version_number: number;
    status: string;
    published_at: string | null;
    created_at: string;
    updated_at: string | null;
    pdf_mapping_json?: unknown | null;
};

type FormDetail = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    kind: string;
    is_active: boolean;
    metadata: Record<string, unknown>;
    versions: VersionRow[];
};

export default function FormDetailClient() {
    const params = useParams();
    const formId = typeof params?.formId === "string" ? params.formId : "";
    const viewerTz = useAdminViewerTimezone();
    const { canMutate } = useAdminAuth();

    const [detail, setDetail] = useState<FormDetail | null>(null);
    const [links, setLinks] = useState<FormPublicLinkRow[]>([]);
    const [submissionStats, setSubmissionStats] = useState({ total: 0, submitted: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);
    const [createdOnce, setCreatedOnce] = useState<CreatedLinkPayload | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [copyWarn, setCopyWarn] = useState<string | null>(null);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [previewErr, setPreviewErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!formId) return;
        setLoading(true);
        setError(null);
        try {
            const [formRes, linksRes, subRes] = await Promise.all([
                fetch(`/api/admin/forms/${encodeURIComponent(formId)}`),
                fetch(`/api/admin/forms/${encodeURIComponent(formId)}/public-links`),
                fetch(`/api/admin/forms/submissions?form_definition_id=${encodeURIComponent(formId)}&limit=200`),
            ]);
            const formJson = await formRes.json().catch(() => ({}));
            const linksJson = await linksRes.json().catch(() => ({}));
            const subJson = await subRes.json().catch(() => ({}));
            if (!formRes.ok) throw new Error((formJson as { error?: string }).error ?? "Failed to load form");
            setDetail((formJson as { data?: FormDetail }).data ?? null);
            if (linksRes.ok) {
                const raw = (linksJson as { data?: Record<string, unknown>[] }).data ?? [];
                setLinks(
                    raw.map((row) => {
                        const { token_hash: _h, plaintext_token: _p, ...rest } = row;
                        void _h;
                        void _p;
                        return rest as FormPublicLinkRow;
                    })
                );
            } else {
                setLinks([]);
            }
            if (subRes.ok) {
                const subs = (subJson as { data?: { status?: string }[] }).data ?? [];
                setSubmissionStats({
                    total: subs.length,
                    submitted: subs.filter((s) => s.status === "submitted").length,
                });
            } else {
                setSubmissionStats({ total: 0, submitted: 0 });
            }
        } catch (e) {
            setError((e as Error).message);
            setDetail(null);
        } finally {
            setLoading(false);
        }
    }, [formId]);

    useEffect(() => {
        void load();
    }, [load]);

    const loadLinksQuiet = useCallback(async () => {
        if (!formId) return;
        try {
            const linksRes = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/public-links`);
            const linksJson = await linksRes.json().catch(() => ({}));
            if (linksRes.ok) {
                const raw = (linksJson as { data?: Record<string, unknown>[] }).data ?? [];
                setLinks(
                    raw.map((row) => {
                        const { token_hash: _h, plaintext_token: _p, ...rest } = row;
                        void _h;
                        void _p;
                        return rest as FormPublicLinkRow;
                    })
                );
            }
        } catch {
            /* keep existing links on background refresh failure */
        }
    }, [formId]);

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

    const createPublicLink = async () => {
        if (!formId || !canMutate) return;
        setCreating(true);
        setCreateErr(null);
        setCopyWarn(null);
        try {
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/public-links`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setCreateErr((json as { error?: string }).error ?? "Could not create link");
                return;
            }
            const d = (json as {
                data?: CreatedLinkPayload &
                    Partial<FormPublicLinkRow> & { id?: string; created_at?: string; is_active?: boolean; metadata?: Record<string, unknown> };
            }).data;
            if (d?.plaintext_token && d.embed_path) {
                setCreatedOnce({
                    plaintext_token: d.plaintext_token,
                    embed_path: d.embed_path,
                    embed_url:
                        d.embed_url ??
                        (typeof window !== "undefined" ? `${window.location.origin}${d.embed_path}` : null),
                });
            }
            if (d?.id) {
                const linkId = d.id;
                setLinks((prev) => {
                    if (prev.some((link) => link.id === linkId)) return prev;
                    const nextLink: FormPublicLinkRow = {
                        id: linkId,
                        is_active: d.is_active ?? true,
                        created_at: d.created_at ?? new Date().toISOString(),
                        metadata: (d.metadata ?? {}) as Record<string, unknown>,
                        token_prefix: d.token_prefix ?? null,
                        pinned_form_definition_version_id: d.pinned_form_definition_version_id ?? null,
                    };
                    return [nextLink, ...prev];
                });
            }
            if (typeof window !== "undefined") {
                requestAnimationFrame(() => {
                    document.getElementById("lifecycle-distribute")?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
            }
            void loadLinksQuiet();
        } catch (e) {
            setCreateErr((e as Error).message);
        } finally {
            setCreating(false);
        }
    };

    const handleLinkMetadataSaved = useCallback((linkId: string, metadata: Record<string, unknown>) => {
        setLinks((prev) => prev.map((link) => (link.id === linkId ? { ...link, metadata } : link)));
    }, []);

    const handlePreviewForm = useCallback(async () => {
        if (!formId || !canMutate) return;
        setPreviewErr(null);
        if (typeof window !== "undefined") {
            try {
                const stored = sessionStorage.getItem(previewEmbedSessionStorageKey(formId));
                if (stored) {
                    const u = new URL(stored);
                    if (u.origin === window.location.origin) {
                        window.open(stored, "_blank", "noopener,noreferrer");
                        return;
                    }
                }
            } catch {
                /* fall through */
            }
        }

        if (typeof window === "undefined") return;

        setPreviewBusy(true);
        try {
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/public-links`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    metadata: { ...ADMIN_PREVIEW_LINK_METADATA, label: ADMIN_PREVIEW_LINK_LABEL },
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setPreviewErr((json as { error?: string }).error ?? "Could not start preview");
                return;
            }
            const payload = (json as { data?: Record<string, unknown> }).data;
            const embedPath = payload?.embed_path;
            if (typeof embedPath !== "string" || !embedPath.startsWith("/")) {
                setPreviewErr("Preview response missing embed path");
                return;
            }
            const embedUrlFromServer = payload?.embed_url;
            const previewUrl =
                typeof embedUrlFromServer === "string" && embedUrlFromServer.startsWith("http")
                    ? appendPreviewQueryToFullUrl(embedUrlFromServer)
                    : buildPreviewEmbedUrl(window.location.origin, embedPath);

            try {
                sessionStorage.setItem(previewEmbedSessionStorageKey(formId), previewUrl);
            } catch {
                /* quota */
            }
            window.open(previewUrl, "_blank", "noopener,noreferrer");
            void load();
        } catch (e) {
            setPreviewErr((e as Error).message);
        } finally {
            setPreviewBusy(false);
        }
    }, [formId, canMutate, load]);

    const published = detail?.versions.filter((v) => v.status === "published") ?? [];
    const drafts = detail?.versions.filter((v) => v.status === "draft") ?? [];
    const latestPublished = published.sort((a, b) => b.version_number - a.version_number)[0];
    const hasDraft = drafts.length > 0;
    const hasPublished = Boolean(latestPublished);
    const activeLinkCount = links.filter((l) => l.is_active).length;

    const operatorContext = useMemo(() => parseOperatorContext(detail?.metadata), [detail?.metadata]);

    const documentGenerationConfigured = useMemo(
        () => (latestPublished ? formVersionHasDocumentMapping(latestPublished.pdf_mapping_json) : false),
        [latestPublished]
    );

    const connectedBullets = useMemo(
        () =>
            buildConnectedSystemsBullets({
                leadCaptureConfigured: links.some((l) => linkRequiresLeadCapture(l.metadata)),
                documentGenerationConfigured,
                operatorNotes: operatorContext?.connected_notes ?? null,
            }),
        [links, documentGenerationConfigured, operatorContext?.connected_notes]
    );

    const lifecycleSteps = useMemo(
        () =>
            buildFormLifecycleSteps({
                hasDraft,
                hasPublished,
                activeLinkCount,
                submissionCount: submissionStats.total,
                submittedCount: submissionStats.submitted,
                documentGenerationConfigured,
            }),
        [hasDraft, hasPublished, activeLinkCount, submissionStats, documentGenerationConfigured]
    );

    const purposeLine = useMemo(() => {
        if (!detail) return null;
        return formLifecyclePurposeLine(operatorContext?.purpose ?? null, detail.description, detail.kind);
    }, [detail, operatorContext]);

    const openPublicEmbedUrl = useMemo(() => {
        if (!createdOnce) return null;
        return (
            createdOnce.embed_url ??
            (typeof window !== "undefined" ? `${window.location.origin}${createdOnce.embed_path}` : null)
        );
    }, [createdOnce]);

    const publishSummary = formLifecyclePublishSummaryLabel(hasDraft, hasPublished);
    const publishTone = hasPublished ? "success" : hasDraft ? "info" : "neutral";

    if (!formId) {
        return <p className="p-6 text-sm text-alloy-ember">Missing form id.</p>;
    }

    return (
        <FormsWorkspaceShell
            title={detail?.name ?? "Form workspace"}
            subtitle={purposeLine ?? "Manage this intake workflow — design through review."}
            breadcrumbs={
                detail ?
                    formsWorkspaceBreadcrumbs([{ label: detail.name }])
                :   formsWorkspaceBreadcrumbs([{ label: "Form" }])
            }
            actions={
                detail ?
                    <div className="flex flex-wrap items-center gap-2">
                        {openPublicEmbedUrl ?
                            <a
                                href={openPublicEmbedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-alloy-blue hover:underline"
                            >
                                Open public form
                            </a>
                        :   null}
                        <FormsOperationalLink href={FORMS_MODULE_ROUTES.packetDefinitions}>
                            Packets
                        </FormsOperationalLink>
                    </div>
                :   null
            }
            contentClassName="space-y-0"
        >
            {loading ?
                <p className={opMetadata}>Loading form workspace…</p>
            : error ?
                <p className="text-sm text-alloy-ember">{error}</p>
            : detail ?
                <FormLifecycleWorkspaceLayout
                    formId={formId}
                    detail={{
                        id: detail.id,
                        key: detail.key,
                        name: detail.name,
                        kind: detail.kind,
                        is_active: detail.is_active,
                        metadata: detail.metadata,
                        versions: detail.versions,
                    }}
                    viewerTz={viewerTz}
                    canMutate={canMutate}
                    publishSummary={publishSummary}
                    publishTone={publishTone}
                    purposeLine={purposeLine}
                    lifecycleSteps={lifecycleSteps}
                    submissionCount={submissionStats.total}
                    documentGenerationConfigured={documentGenerationConfigured}
                    links={links}
                    creating={creating}
                    createErr={createErr}
                    createdOnce={createdOnce}
                    copied={copied}
                    copyWarn={copyWarn}
                    previewBusy={previewBusy}
                    previewErr={previewErr}
                    hasPublished={hasPublished}
                    latestPublished={latestPublished}
                    operatorGuide={{
                        purpose: resolvePurposeParagraph(operatorContext, detail.description, detail.name),
                        whoCompletes: resolveWhoCompletesParagraph(operatorContext, detail.kind),
                        afterSubmission: resolveAfterSubmissionParagraph(operatorContext),
                        connectedBullets,
                    }}
                    onPreview={() => void handlePreviewForm()}
                    onCreateLink={() => void createPublicLink()}
                    onCopy={(key, text) => void copyText(key, text)}
                    onVersionsUpdated={() => void load()}
                    onLinkMetadataSaved={handleLinkMetadataSaved}
                />
            :   null}
        </FormsWorkspaceShell>
    );
}
