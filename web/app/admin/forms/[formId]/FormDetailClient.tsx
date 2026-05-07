"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import PrimaryButton from "@/components/PrimaryButton";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import {
    buildConnectedSystemsBullets,
    formVersionHasDocumentMapping,
    parseOperatorContext,
    resolveAfterSubmissionParagraph,
    resolvePurposeParagraph,
    resolveWhoCompletesParagraph,
} from "@/lib/forms/operatorFormGuidance";
import {
    ADMIN_PREVIEW_LINK_LABEL,
    ADMIN_PREVIEW_LINK_METADATA,
    appendPreviewQueryToFullUrl,
    buildPreviewEmbedUrl,
    previewEmbedSessionStorageKey,
} from "@/lib/forms/adminFormPreview";
import { MEDICATION_AUTHORIZATION_DEMO_FORM_KEY } from "@/lib/forms/seeds/medicationAuthorizationDemo";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";

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

type PublicLinkRow = {
    id: string;
    is_active: boolean;
    expires_at: string | null;
    token_prefix: string | null;
    pinned_form_definition_version_id: string | null;
    created_at: string;
    metadata?: Record<string, unknown>;
};

type CreatedLinkPayload = {
    plaintext_token: string;
    embed_path: string;
    embed_url: string | null;
};

export default function FormDetailClient() {
    const params = useParams();
    const formId = typeof params?.formId === "string" ? params.formId : "";
    const viewerTz = useAdminViewerTimezone();
    const { canMutate } = useAdminAuth();

    const [detail, setDetail] = useState<FormDetail | null>(null);
    const [links, setLinks] = useState<PublicLinkRow[]>([]);
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
            const [formRes, linksRes] = await Promise.all([
                fetch(`/api/admin/forms/${encodeURIComponent(formId)}`),
                fetch(`/api/admin/forms/${encodeURIComponent(formId)}/public-links`),
            ]);
            const formJson = await formRes.json().catch(() => ({}));
            const linksJson = await linksRes.json().catch(() => ({}));
            if (!formRes.ok) throw new Error((formJson as { error?: string }).error ?? "Failed to load form");
            setDetail((formJson as { data?: FormDetail }).data ?? null);
            if (linksRes.ok) {
                const raw = (linksJson as { data?: Record<string, unknown>[] }).data ?? [];
                setLinks(
                    raw.map((row) => {
                        const { token_hash: _h, plaintext_token: _p, ...rest } = row;
                        void _h;
                        void _p;
                        return rest as PublicLinkRow;
                    })
                );
            } else {
                setLinks([]);
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
            setCopyWarn("Clipboard unavailable in this browser — select the text above and copy manually.");
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
            const d = (json as { data?: CreatedLinkPayload }).data;
            if (d?.plaintext_token && d.embed_path) {
                setCreatedOnce({
                    plaintext_token: d.plaintext_token,
                    embed_path: d.embed_path,
                    embed_url:
                        d.embed_url ??
                        (typeof window !== "undefined" ? `${window.location.origin}${d.embed_path}` : null),
                });
            }
            void load();
        } catch (e) {
            setCreateErr((e as Error).message);
        } finally {
            setCreating(false);
        }
    };

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
                /* fall through — mint fresh preview link */
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
                /* quota / privacy mode */
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
    const latestPublished = published.sort((a, b) => b.version_number - a.version_number)[0];

    const operatorContext = useMemo(() => parseOperatorContext(detail?.metadata), [detail?.metadata]);

    const leadCaptureConfigured = useMemo(
        () => links.some((L) => linkRequiresLeadCapture(L.metadata)),
        [links]
    );

    const documentGenerationConfigured = useMemo(
        () => (latestPublished ? formVersionHasDocumentMapping(latestPublished.pdf_mapping_json) : false),
        [latestPublished]
    );

    const connectedBullets = useMemo(
        () =>
            buildConnectedSystemsBullets({
                leadCaptureConfigured,
                documentGenerationConfigured,
                operatorNotes: operatorContext?.connected_notes ?? null,
            }),
        [leadCaptureConfigured, documentGenerationConfigured, operatorContext?.connected_notes]
    );

    const openPublicEmbedUrl = useMemo(() => {
        if (!createdOnce) return null;
        return (
            createdOnce.embed_url ??
            (typeof window !== "undefined" ? `${window.location.origin}${createdOnce.embed_path}` : null)
        );
    }, [createdOnce]);

    const submissionsHref = `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}/submissions`;

    if (!formId) {
        return <p className="p-6 text-sm text-red-700">Missing form id.</p>;
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title={detail?.name ?? "Form"}
                subtitle={detail ? `Key ${detail.key}` : "Loading…"}
                actions={
                    <div className="flex flex-wrap items-center gap-3">
                        {openPublicEmbedUrl ? (
                            <a
                                href={openPublicEmbedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-semibold text-[#00458C] hover:underline"
                            >
                                Open public form
                            </a>
                        ) : null}
                        <Link href={submissionsHref} className="text-sm font-medium text-[#00458C] hover:underline">
                            Submissions
                        </Link>
                        <Link href={ADMIN_FORMS_UI_BASE} className="text-sm font-medium text-[#00458C] hover:underline">
                            All forms
                        </Link>
                    </div>
                }
            />

            {detail && !loading ? (
                <div className="rounded-lg border border-[#e6e8ec] bg-[#fafbfd] px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-sm font-semibold text-[#31394d]">Preview the public form</p>
                            <p className="text-sm leading-relaxed text-[#59678b]">
                                Opens the real embed experience (same page families and staff see) in a{" "}
                                <strong className="font-medium text-[#31394d]">new browser tab</strong>. Alloy cannot
                                reconstruct old share URLs from this screen, so preview creates a dedicated link tagged{" "}
                                <span className="whitespace-nowrap font-mono text-xs text-[#31394d]">
                                    {ADMIN_PREVIEW_LINK_LABEL}
                                </span>{" "}
                                — you can deactivate it later if you do not want extra links.
                            </p>
                            {!canMutate ? (
                                <p className="text-sm text-amber-900">
                                    Admin role is required to create a preview link.
                                </p>
                            ) : null}
                            {!latestPublished ? (
                                <p className="text-sm text-amber-900">
                                    Publish at least one version before preview — the public page needs a published schema.
                                </p>
                            ) : null}
                            {previewErr ? <p className="text-sm text-red-700">{previewErr}</p> : null}
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-stretch gap-2 sm:items-end">
                            <PrimaryButton
                                type="button"
                                className="!px-4 !py-2.5 text-sm whitespace-nowrap sm:min-w-[148px]"
                                onClick={() => void handlePreviewForm()}
                                disabled={
                                    previewBusy || creating || !canMutate || !latestPublished
                                }
                            >
                                {previewBusy ? "Opening…" : "Preview form"}
                            </PrimaryButton>
                            <p className="max-w-[220px] text-center text-[11px] leading-snug text-[#59678b] sm:text-right">
                                Reuses this browser tab&apos;s session when possible so you may not get a new link every
                                click.
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}

            {loading ? (
                <p className="text-sm text-[#59678b]">Loading…</p>
            ) : error ? (
                <p className="text-sm text-red-700">{error}</p>
            ) : detail ? (
                <>
                    <SectionCard title="Operator guide">
                        <div className="space-y-5 text-sm text-[#31394d]">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-[#59678b]">How this form flows</p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-5">
                                    {[
                                        { step: 1, title: "Share", hint: "Preview or create a link" },
                                        { step: 2, title: "Open", hint: "Recipient opens the form" },
                                        { step: 3, title: "Submit", hint: "They complete & send" },
                                        { step: 4, title: "Review", hint: "You check Submissions" },
                                        { step: 5, title: "Document", hint: "Generate PDF when mapped" },
                                    ].map((s) => (
                                        <div
                                            key={s.step}
                                            className="flex flex-col rounded-lg border border-[#e6e8ec] bg-white px-3 py-2.5 text-center shadow-sm"
                                        >
                                            <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#00458C] text-xs font-bold text-white">
                                                {s.step}
                                            </span>
                                            <span className="mt-2 text-xs font-semibold text-[#31394d]">{s.title}</span>
                                            <span className="mt-0.5 text-[11px] leading-snug text-[#59678b]">{s.hint}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <details className="rounded-lg border border-[#e6e8ec] bg-white px-4 py-3 open:bg-[#fafbfd]">
                                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                    What this form is for
                                </summary>
                                <p className="mt-2 leading-relaxed">
                                    {resolvePurposeParagraph(operatorContext, detail.description, detail.name)}
                                </p>
                            </details>
                            <details className="rounded-lg border border-[#e6e8ec] bg-white px-4 py-3 open:bg-[#fafbfd]">
                                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                    Who completes this?
                                </summary>
                                <p className="mt-2 leading-relaxed">{resolveWhoCompletesParagraph(operatorContext, detail.kind)}</p>
                            </details>
                            <details className="rounded-lg border border-[#e6e8ec] bg-white px-4 py-3 open:bg-[#fafbfd]">
                                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                    After someone submits
                                </summary>
                                <p className="mt-2 leading-relaxed">{resolveAfterSubmissionParagraph(operatorContext)}</p>
                            </details>
                            <details className="rounded-lg border border-[#e6e8ec] bg-white px-4 py-3 open:bg-[#fafbfd]">
                                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                    Connected systems
                                </summary>
                                <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
                                    {connectedBullets.map((b) => (
                                        <li key={b.id}>{b.text}</li>
                                    ))}
                                </ul>
                            </details>
                            <details className="rounded-lg border border-[#e6e8ec] bg-white px-4 py-3 open:bg-[#fafbfd]">
                                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-[#59678b]">
                                    Detailed checklist
                                </summary>
                                <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed">
                                    <li>
                                        Use <strong className="font-medium text-[#31394d]">Preview form</strong> (above) for a
                                        safe live tab — preview links are labeled so you can deactivate them later.
                                    </li>
                                    <li>
                                        <a href="#form-public-embed-links" className="font-medium text-[#00458C] hover:underline">
                                            Create a public link
                                        </a>{" "}
                                        when you need a URL to share; copy it immediately.
                                    </li>
                                    <li>Send the link to the person who should fill it out.</li>
                                    <li>
                                        <Link href={submissionsHref} className="font-medium text-[#00458C] hover:underline">
                                            Review submissions
                                        </Link>{" "}
                                        and open one for full answers.
                                    </li>
                                    <li>Use Generate document on a submission when PDF mapping is configured.</li>
                                </ol>
                                {openPublicEmbedUrl ? (
                                    <p className="mt-3 text-xs text-[#59678b]">
                                        Session link:{" "}
                                        <a
                                            href={openPublicEmbedUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium text-[#00458C] hover:underline"
                                        >
                                            Open public form
                                        </a>
                                    </p>
                                ) : null}
                            </details>
                            <p className="text-xs text-[#59678b]">
                                Tailored copy: set{" "}
                                <code className="rounded bg-[#F4F6F9] px-1 font-mono text-[11px]">metadata.operator_context</code>{" "}
                                via API (purpose, who completes, after submission, notes).
                            </p>
                        </div>
                    </SectionCard>

                    <SectionCard title="Published versions">
                        {latestPublished ? (
                            <p className="text-sm text-[#31394d]">
                                Latest published:{" "}
                                <span className="font-medium">v{latestPublished.version_number}</span>
                                {latestPublished.published_at ? (
                                    <> · {formatDateTimeForUserDisplay(latestPublished.published_at, viewerTz)}</>
                                ) : null}
                            </p>
                        ) : (
                            <p className="text-sm text-[#59678b]">No published version yet.</p>
                        )}
                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[#e6e8ec]">
                                        <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Ver</th>
                                        <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Status</th>
                                        <th className="pb-2 text-left font-semibold text-[#59678b]">Published</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#e6e8ec]">
                                    {detail.versions.map((v) => (
                                        <tr key={v.id}>
                                            <td className="py-2 pr-4">{v.version_number}</td>
                                            <td className="py-2 pr-4">
                                                <StatusBadge label={v.status} variant={getStatusVariant(v.status)} />
                                            </td>
                                            <td className="py-2 text-[#59678b]">
                                                {v.published_at ? formatDateTimeForUserDisplay(v.published_at, viewerTz) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>

                    <div id="form-public-embed-links">
                        <SectionCard title="Public embed links">
                            {!canMutate ? (
                                <p className="text-sm text-[#59678b]">Admin role required to create links.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    <PrimaryButton
                                        type="button"
                                        className="!px-3 !py-2 text-sm"
                                        onClick={() => void createPublicLink()}
                                        disabled={creating}
                                    >
                                        {creating ? "Creating…" : "Create public link"}
                                    </PrimaryButton>
                                </div>
                            )}
                            {createErr ? <p className="mt-2 text-sm text-red-700">{createErr}</p> : null}
                            {detail?.key === MEDICATION_AUTHORIZATION_DEMO_FORM_KEY ?
                                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[#59678b]">
                                    New links for this demo automatically enable CRM intake when your org has an active{" "}
                                    <strong className="font-medium text-[#31394d]">cleaning</strong> vertical (lead capture,
                                    default vertical, and demo auto-create flags). Preview links use the same defaults.
                                </p>
                            : null}

                            <div className="mt-3 rounded-md bg-[#F4F6F9]/80 p-3 text-sm text-[#59678b]">
                                <p className="font-medium text-[#31394d]">About links and tokens</p>
                                <p className="mt-1 leading-relaxed">
                                    For security, existing links cannot be revealed again. The table only shows a short{" "}
                                    <strong>prefix</strong> so you can tell links apart — not the full secret URL (Alloy stores
                                    a hash of the token).
                                </p>
                                <p className="mt-2 leading-relaxed">
                                    Create a new public link when you need a copyable URL. Copy the embed URL or token right
                                    away; it is shown only once at creation.
                                </p>
                            </div>

                            {createdOnce ? (
                                <div className="mt-4 rounded-lg border border-[#DBC078]/50 bg-[#e6d3a0]/15 p-4">
                                    <p className="text-sm font-semibold text-[#31394d]">
                                        Copy now — token is shown only once
                                    </p>
                                    <div className="mt-2 space-y-2 text-sm">
                                        <div>
                                            <span className="text-[#59678b]">Token</span>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">
                                                    {createdOnce.plaintext_token}
                                                </code>
                                                <button
                                                    type="button"
                                                    className="text-[#00458C] hover:underline"
                                                    onClick={() => void copyText("token", createdOnce.plaintext_token)}
                                                >
                                                    {copied === "token" ? "Copied" : "Copy"}
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-[#59678b]">Embed URL</span>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">
                                                    {createdOnce.embed_url ??
                                                        `${typeof window !== "undefined" ? window.location.origin : ""}${createdOnce.embed_path}`}
                                                </code>
                                                <button
                                                    type="button"
                                                    className="text-[#00458C] hover:underline"
                                                    onClick={() =>
                                                        void copyText(
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
                                    {copyWarn ? <p className="mt-3 text-xs text-[#59678b]">{copyWarn}</p> : null}
                                </div>
                            ) : null}

                            {links.length > 0 ? (
                                <div className="mt-4 overflow-x-auto">
                                    <p className="mb-2 text-xs text-[#59678b]">
                                        Existing links — prefix only. For security, full URLs are not shown here; create a new
                                        link for a copyable URL.
                                    </p>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-[#e6e8ec]">
                                                <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Prefix</th>
                                                <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Active</th>
                                                <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Expires</th>
                                                <th className="pb-2 text-left font-semibold text-[#59678b]">Created</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e6e8ec]">
                                            {links.map((L) => (
                                                <tr key={L.id}>
                                                    <td className="py-2 pr-4 font-mono text-xs">{L.token_prefix ?? "—"}</td>
                                                    <td className="py-2 pr-4">
                                                        <StatusBadge
                                                            label={L.is_active ? "yes" : "no"}
                                                            variant={L.is_active ? "success" : "neutral"}
                                                        />
                                                    </td>
                                                    <td className="py-2 pr-4 text-[#59678b]">
                                                        {L.expires_at ? formatDateTimeForUserDisplay(L.expires_at, viewerTz) : "—"}
                                                    </td>
                                                    <td className="py-2 text-[#59678b]">{formatDateTimeForUserDisplay(L.created_at, viewerTz)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : null}
                        </SectionCard>
                    </div>
                </>
            ) : null}
        </div>
    );
}
