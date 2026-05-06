"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import PrimaryButton from "@/components/PrimaryButton";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

type VersionRow = {
    id: string;
    version_number: number;
    status: string;
    published_at: string | null;
    created_at: string;
    updated_at: string | null;
};

type FormDetail = {
    id: string;
    key: string;
    name: string;
    kind: string;
    is_active: boolean;
    versions: VersionRow[];
};

type PublicLinkRow = {
    id: string;
    is_active: boolean;
    expires_at: string | null;
    token_prefix: string | null;
    pinned_form_definition_version_id: string | null;
    created_at: string;
};

type CreatedLinkPayload = {
    plaintext_token: string;
    embed_path: string;
    embed_url: string | null;
};

export default function FormDetailClient() {
    const params = useParams();
    const formId = typeof params?.formId === "string" ? params.formId : "";
    const { canMutate } = useAdminAuth();

    const [detail, setDetail] = useState<FormDetail | null>(null);
    const [links, setLinks] = useState<PublicLinkRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);
    const [createdOnce, setCreatedOnce] = useState<CreatedLinkPayload | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

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
                setLinks((linksJson as { data?: PublicLinkRow[] }).data ?? []);
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
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            setCopied(null);
        }
    };

    const createPublicLink = async () => {
        if (!formId || !canMutate) return;
        setCreating(true);
        setCreateErr(null);
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

    const published = detail?.versions.filter((v) => v.status === "published") ?? [];
    const latestPublished = published.sort((a, b) => b.version_number - a.version_number)[0];

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
                        <Link
                            href={`/admin/forms/${encodeURIComponent(formId)}/submissions`}
                            className="text-sm font-medium text-[#00458C] hover:underline"
                        >
                            Submissions
                        </Link>
                        <Link href="/admin/forms" className="text-sm font-medium text-[#00458C] hover:underline">
                            All forms
                        </Link>
                    </div>
                }
            />

            {loading ? (
                <p className="text-sm text-[#59678b]">Loading…</p>
            ) : error ? (
                <p className="text-sm text-red-700">{error}</p>
            ) : detail ? (
                <>
                    <SectionCard title="Published versions">
                        {latestPublished ? (
                            <p className="text-sm text-[#31394d]">
                                Latest published:{" "}
                                <span className="font-medium">v{latestPublished.version_number}</span>
                                {latestPublished.published_at ? (
                                    <> · {formatDateTime(latestPublished.published_at)}</>
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
                                                {v.published_at ? formatDateTime(v.published_at) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>

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
                                                {createdOnce.embed_url ?? `${window.location.origin}${createdOnce.embed_path}`}
                                            </code>
                                            <button
                                                type="button"
                                                className="text-[#00458C] hover:underline"
                                                onClick={() =>
                                                    void copyText(
                                                        "url",
                                                        createdOnce.embed_url ??
                                                            `${window.location.origin}${createdOnce.embed_path}`
                                                    )
                                                }
                                            >
                                                {copied === "url" ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {links.length > 0 ? (
                            <div className="mt-4 overflow-x-auto">
                                <p className="mb-2 text-xs text-[#59678b]">
                                    Existing links (token prefix only; full token not stored in plaintext)
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
                                                    {L.expires_at ? formatDateTime(L.expires_at) : "—"}
                                                </td>
                                                <td className="py-2 text-[#59678b]">{formatDateTime(L.created_at)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </SectionCard>
                </>
            ) : null}
        </div>
    );
}
