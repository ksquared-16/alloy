"use client";

import { useParams, useRouter } from "next/navigation";
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
import {
    isOutcomeConfiguredForIntent,
    readStoredOperationalIntent,
    resolveEffectiveOperationalIntent,
} from "@/lib/forms/operationalIntentTemplates";
import { formsWorkspaceBreadcrumbs, FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";
import {
    readActiveRuntimeLinkId,
    writeActiveRuntimeLinkId,
    writeLinkEmbedUrl,
} from "@/lib/forms/intakeRuntimeOrchestrationStorage";
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
    const router = useRouter();
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
    const [selectedRuntimeLinkId, setSelectedRuntimeLinkId] = useState<string | null>(null);
    const [createdOnceLinkId, setCreatedOnceLinkId] = useState<string | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteErr, setDeleteErr] = useState<string | null>(null);
    const [creatingLocationLink, setCreatingLocationLink] = useState(false);
    const [locationLinkErr, setLocationLinkErr] = useState<string | null>(null);
    const [duplicateBusy, setDuplicateBusy] = useState(false);
    const [duplicateErr, setDuplicateErr] = useState<string | null>(null);

    type CreatedLinkResponse = CreatedLinkPayload &
        Partial<FormPublicLinkRow> & {
            id?: string;
            created_at?: string;
            is_active?: boolean;
            metadata?: Record<string, unknown>;
            token_prefix?: string | null;
            pinned_form_definition_version_id?: string | null;
        };

    const applyCreatedLinkResponse = useCallback(
        (d: CreatedLinkResponse | undefined, options?: { scrollToOrchestration?: boolean }) => {
            if (d?.plaintext_token && d.embed_path) {
                const embedUrl =
                    d.embed_url ??
                    (typeof window !== "undefined" ? `${window.location.origin}${d.embed_path}` : null);
                setCreatedOnce({
                    plaintext_token: d.plaintext_token,
                    embed_path: d.embed_path,
                    embed_url: embedUrl,
                });
                if (d.id && embedUrl) {
                    writeLinkEmbedUrl(d.id, embedUrl);
                }
            }
            if (d?.id) {
                const linkId = d.id;
                setCreatedOnceLinkId(linkId);
                setSelectedRuntimeLinkId(linkId);
                writeActiveRuntimeLinkId(formId, linkId);
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
            if (options?.scrollToOrchestration && typeof window !== "undefined") {
                requestAnimationFrame(() => {
                    document.getElementById("lifecycle-orchestration")?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
            }
        },
        [formId]
    );

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
            applyCreatedLinkResponse((json as { data?: CreatedLinkResponse }).data, { scrollToOrchestration: true });
        } catch (e) {
            setCreateErr((e as Error).message);
        } finally {
            setCreating(false);
        }
    };

    const createLocationPublicLink = useCallback(
        async (input: { label: string; locationId: string; workUnitId?: string | null }) => {
            if (!formId || !canMutate) return;
            setCreatingLocationLink(true);
            setLocationLinkErr(null);
            setCopyWarn(null);
            try {
                const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/public-links`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        label: input.label,
                        default_location_id: input.locationId,
                        ...(input.workUnitId ? { default_work_unit_id: input.workUnitId } : {}),
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setLocationLinkErr((json as { error?: string }).error ?? "Could not create location link");
                    return;
                }
                applyCreatedLinkResponse((json as { data?: CreatedLinkResponse }).data, { scrollToOrchestration: true });
            } catch (e) {
                setLocationLinkErr((e as Error).message);
            } finally {
                setCreatingLocationLink(false);
            }
        },
        [applyCreatedLinkResponse, canMutate, formId]
    );

    const handleLinkMetadataSaved = useCallback((linkId: string, metadata: Record<string, unknown>) => {
        setLinks((prev) => prev.map((link) => (link.id === linkId ? { ...link, metadata } : link)));
    }, []);

    const handleFormMetadataUpdated = useCallback((metadata: Record<string, unknown>) => {
        setDetail((prev) => (prev ? { ...prev, metadata } : prev));
    }, []);

    const handleSelectedRuntimeLinkChange = useCallback(
        (linkId: string) => {
            setSelectedRuntimeLinkId(linkId);
            writeActiveRuntimeLinkId(formId, linkId);
        },
        [formId]
    );

    useEffect(() => {
        if (!formId || selectedRuntimeLinkId) return;
        const stored = readActiveRuntimeLinkId(formId);
        if (stored) setSelectedRuntimeLinkId(stored);
    }, [formId, selectedRuntimeLinkId]);

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

    const handleDuplicateForm = useCallback(async () => {
        if (!formId || !canMutate || !detail) return;
        setDuplicateErr(null);
        setDuplicateBusy(true);
        try {
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/duplicate`, { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not duplicate form");
            const newId = (json as { data?: { id?: string } }).data?.id;
            if (!newId) throw new Error("Duplicate response missing form id");
            router.push(`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(newId)}`);
        } catch (e) {
            setDuplicateErr((e as Error).message);
        } finally {
            setDuplicateBusy(false);
        }
    }, [canMutate, detail, formId, router]);

    const handleArchiveForm = useCallback(async () => {
        if (!formId || !canMutate || !detail) return;
        const confirmed = window.confirm(
            `Archive “${detail.name}”?\n\nThis hides the form from active use and keeps past submissions. Public share links will stop accepting new responses.`
        );
        if (!confirmed) return;
        setDeleteErr(null);
        setDeleteBusy(true);
        try {
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/archive`, { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not archive form");
            router.push(ADMIN_FORMS_UI_BASE);
        } catch (e) {
            setDeleteErr((e as Error).message);
        } finally {
            setDeleteBusy(false);
        }
    }, [canMutate, detail, formId, router]);

    const published = detail?.versions.filter((v) => v.status === "published") ?? [];
    const drafts = detail?.versions.filter((v) => v.status === "draft") ?? [];
    const latestPublished = published.sort((a, b) => b.version_number - a.version_number)[0];
    const hasDraft = drafts.length > 0;
    const hasPublished = Boolean(latestPublished);
    const activeLinkCount = links.filter((l) => l.is_active).length;

    const selectedRuntimeLink = useMemo(() => {
        const operational = links.filter((l) => {
            const meta = l.metadata;
            return meta && typeof meta === "object" && (meta as Record<string, unknown>).mode !== "preview";
        });
        if (selectedRuntimeLinkId) {
            return operational.find((l) => l.id === selectedRuntimeLinkId) ?? operational[0] ?? null;
        }
        return operational[0] ?? null;
    }, [links, selectedRuntimeLinkId]);

    const intentConfigured = useMemo(() => {
        if (!detail) return false;
        return Boolean(
            readStoredOperationalIntent(detail.metadata) ??
                resolveEffectiveOperationalIntent({
                    formMetadata: detail.metadata,
                    linkMetadata: selectedRuntimeLink?.metadata ?? null,
                    formKey: detail.key,
                })
        );
    }, [detail, selectedRuntimeLink?.metadata]);

    const outcomeConfigured = useMemo(() => {
        if (!detail) return false;
        const intent =
            readStoredOperationalIntent(detail.metadata) ??
            resolveEffectiveOperationalIntent({
                formMetadata: detail.metadata,
                linkMetadata: selectedRuntimeLink?.metadata ?? null,
                formKey: detail.key,
            });
        return isOutcomeConfiguredForIntent(selectedRuntimeLink?.metadata ?? null, intent);
    }, [detail, selectedRuntimeLink?.metadata]);

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
                intentConfigured,
                outcomeConfigured,
            }),
        [hasDraft, hasPublished, activeLinkCount, submissionStats, documentGenerationConfigured, intentConfigured, outcomeConfigured]
    );

    const purposeLine = useMemo(() => {
        if (!detail) return null;
        return formLifecyclePurposeLine(operatorContext?.purpose ?? null, detail.description, detail.kind);
    }, [detail, operatorContext]);

    const openPublicEmbedUrl = useMemo(() => {
        if (!hasPublished || !createdOnce) return null;
        return (
            createdOnce.embed_url ??
            (typeof window !== "undefined" ? `${window.location.origin}${createdOnce.embed_path}` : null)
        );
    }, [createdOnce, hasPublished]);

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
                        {canMutate && detail.is_active !== false ?
                            <>
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-alloy-blue hover:underline disabled:opacity-50"
                                    disabled={duplicateBusy}
                                    data-testid="form-action-duplicate"
                                    onClick={() => void handleDuplicateForm()}
                                >
                                    {duplicateBusy ? "Duplicating…" : "Duplicate form"}
                                </button>
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-alloy-ember hover:underline disabled:opacity-50"
                                    disabled={deleteBusy}
                                    data-testid="form-action-archive"
                                    onClick={() => void handleArchiveForm()}
                                >
                                    {deleteBusy ? "Archiving…" : "Archive form"}
                                </button>
                            </>
                        :   null}
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
                <>
                    {deleteErr ?
                        <p className="mb-3 text-sm text-alloy-ember" role="alert">{deleteErr}</p>
                    :   null}
                    {duplicateErr ?
                        <p className="mb-3 text-sm text-alloy-ember" role="alert">{duplicateErr}</p>
                    :   null}
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
                    onCreateLocationLink={(input) => void createLocationPublicLink(input)}
                    creatingLocationLink={creatingLocationLink}
                    locationLinkErr={locationLinkErr}
                    onCopy={(key, text) => void copyText(key, text)}
                    onVersionsUpdated={() => void load()}
                    onLinkMetadataSaved={handleLinkMetadataSaved}
                    onFormMetadataUpdated={handleFormMetadataUpdated}
                    selectedRuntimeLinkId={selectedRuntimeLinkId}
                    onSelectedRuntimeLinkChange={handleSelectedRuntimeLinkChange}
                    createdOnceLinkId={createdOnceLinkId}
                    openPublicEmbedUrl={openPublicEmbedUrl}
                />
                </>
            :   null}
        </FormsWorkspaceShell>
    );
}
