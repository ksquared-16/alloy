"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import { FormDocumentAuthoringShell } from "@/components/forms/workspace/FormDocumentAuthoringShell";
import { emptyFormSchema } from "@/lib/forms/adminFormSchemaBuilder";
import { resolveDocumentComposition, patchSchemaComposition } from "@/lib/forms/documentCompositionAuthoring";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { opMetadata } from "@/lib/operational/ui/operationalVisualTokens";

type VersionRow = {
    id: string;
    version_number: number;
    status: string;
    published_at: string | null;
};

export default function FormSchemaWorkspace({
    formId,
    formName,
    versions,
    onVersionsUpdated,
}: {
    formId: string;
    formName: string;
    versions: VersionRow[];
    onVersionsUpdated: () => void;
}) {
    const { canMutate } = useAdminAuth();
    const [draftVersionId, setDraftVersionId] = useState<string | null>(null);
    const [schema, setSchema] = useState<FormSchemaV1 | null>(null);
    const [loadErr, setLoadErr] = useState<string | null>(null);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [publishSuccess, setPublishSuccess] = useState(false);

    const draftMeta = useMemo(() => {
        const drafts = versions.filter((v) => v.status === "draft");
        if (drafts.length === 0) return null;
        return drafts.sort((a, b) => b.version_number - a.version_number)[0] ?? null;
    }, [versions]);
    const latestPublished = useMemo(() => {
        const pub = versions.filter((v) => v.status === "published");
        return pub.sort((a, b) => b.version_number - a.version_number)[0] ?? null;
    }, [versions]);

    const loadDraft = useCallback(
        async (versionId: string) => {
            setLoadErr(null);
            setBusy(true);
            try {
                const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/versions/${encodeURIComponent(versionId)}`);
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load version");
                const row = json as { data?: { id: string; schema_json: unknown } };
                const sj = row.data?.schema_json;
                if (!sj || typeof sj !== "object") throw new Error("Version has no schema");
                setSchema(sj as FormSchemaV1);
                setDraftVersionId(versionId);
            } catch (e) {
                setLoadErr((e as Error).message);
                setSchema(null);
                setDraftVersionId(null);
            } finally {
                setBusy(false);
            }
        },
        [formId]
    );

    useEffect(() => {
        if (draftMeta?.id) void loadDraft(draftMeta.id);
        else {
            setDraftVersionId(null);
            setSchema(null);
            setLoadErr(null);
        }
    }, [draftMeta?.id, loadDraft]);

    const startBlankDraft = async () => {
        if (!canMutate) return;
        setSaveErr(null);
        setPublishSuccess(false);
        setBusy(true);
        try {
            const body = { schema_json: emptyFormSchema(formName) };
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/versions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not create draft");
            const id = (json as { data?: { id: string } }).data?.id;
            if (!id) throw new Error("Missing version id");
            onVersionsUpdated();
            await loadDraft(id);
        } catch (e) {
            setSaveErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const startFromPublished = async () => {
        if (!canMutate || !latestPublished) return;
        setSaveErr(null);
        setPublishSuccess(false);
        setBusy(true);
        try {
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/versions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clone_from_version_id: latestPublished.id }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not create draft from published");
            const id = (json as { data?: { id: string } }).data?.id;
            if (!id) throw new Error("Missing version id");
            onVersionsUpdated();
            await loadDraft(id);
        } catch (e) {
            setSaveErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const saveDraft = async () => {
        if (!canMutate || !draftVersionId || !schema) return;
        setSaveErr(null);
        setBusy(true);
        try {
            const res = await fetch(
                `/api/admin/forms/${encodeURIComponent(formId)}/versions/${encodeURIComponent(draftVersionId)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        schema_json: patchSchemaComposition(schema, resolveDocumentComposition(schema)),
                    }),
                }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            onVersionsUpdated();
        } catch (e) {
            setSaveErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const publishDraft = async () => {
        if (!canMutate || !draftVersionId) return;
        setSaveErr(null);
        setBusy(true);
        try {
            const res = await fetch(
                `/api/admin/forms/${encodeURIComponent(formId)}/versions/${encodeURIComponent(draftVersionId)}/publish`,
                { method: "POST" }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Publish failed");
            onVersionsUpdated();
            setDraftVersionId(null);
            setSchema(null);
            setPublishSuccess(true);
        } catch (e) {
            setSaveErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div data-testid="form-schema-workspace">
            {!canMutate ? <p className={opMetadata}>Admin role required to edit schema.</p> : null}
            {loadErr ? <p className="text-sm text-alloy-ember">{loadErr}</p> : null}
            {saveErr ? <p className="text-sm text-alloy-ember">{saveErr}</p> : null}

            {publishSuccess ? (
                <div
                    className="rounded-lg bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950 ring-1 ring-emerald-200/60"
                    role="status"
                >
                    <p className="font-medium">Published — this form can go into a packet.</p>
                    <p className="mt-2 text-emerald-900">
                        <Link
                            href={`${ADMIN_FORMS_UI_BASE}/packet-definitions?addForm=${encodeURIComponent(formId)}`}
                            className="font-semibold text-alloy-blue underline"
                        >
                            Create a new packet with this form
                        </Link>
                        {" · "}
                        <Link href={`${ADMIN_FORMS_UI_BASE}/packet-definitions`} className="font-semibold text-alloy-blue underline">
                            Browse packets to add a step
                        </Link>
                    </p>
                    <button type="button" className="mt-2 text-xs font-semibold text-emerald-800 underline" onClick={() => setPublishSuccess(false)}>
                        Dismiss
                    </button>
                </div>
            ) : null}

            {!draftMeta && canMutate ? (
                <div className="space-y-3 text-sm text-alloy-midnight">
                    <p className={opMetadata}>
                        Start a draft to add questions from the system field list, then publish. Published versions cannot be
                        edited in place — use “new draft from published” to iterate.
                    </p>
                    <div className="flex flex-wrap gap-2" data-testid="form-new-draft-actions">
                        <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={busy} onClick={() => void startBlankDraft()}>
                            New blank draft
                        </PrimaryButton>
                        {latestPublished ? (
                            <PrimaryButton
                                type="button"
                                className="!px-3 !py-2 text-sm"
                                disabled={busy}
                                onClick={() => void startFromPublished()}
                            >
                                New draft from published (v{latestPublished.version_number})
                            </PrimaryButton>
                        ) : (
                            <span className={clsx("self-center text-xs", opMetadata)}>Publish a first version before you can clone.</span>
                        )}
                    </div>
                </div>
            ) : null}

            {schema && draftVersionId ? (
                <div className="mt-4 space-y-3">
                    <FormDocumentAuthoringShell
                        schema={schema}
                        formName={formName}
                        onChange={setSchema}
                        disabled={!canMutate || busy}
                    />
                    <div className="flex flex-wrap gap-2">
                        <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={!canMutate || busy} onClick={() => void saveDraft()}>
                            Save draft
                        </PrimaryButton>
                        <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={!canMutate || busy} onClick={() => void publishDraft()}>
                            Publish draft
                        </PrimaryButton>
                    </div>
                </div>
            ) : draftMeta && busy && !schema ? (
                <p className={opMetadata}>Loading draft…</p>
            ) : null}
        </div>
    );
}
