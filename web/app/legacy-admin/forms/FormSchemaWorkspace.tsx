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

function schemaPayload(schema: FormSchemaV1): FormSchemaV1 {
    return patchSchemaComposition(schema, resolveDocumentComposition(schema));
}

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
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not create form version");
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
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not create version from published");
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

    const persistDraft = useCallback(async (): Promise<boolean> => {
        if (!canMutate || !draftVersionId || !schema) return false;
        setSaveErr(null);
        try {
            const res = await fetch(
                `/api/admin/forms/${encodeURIComponent(formId)}/versions/${encodeURIComponent(draftVersionId)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ schema_json: schemaPayload(schema) }),
                }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            onVersionsUpdated();
            return true;
        } catch (e) {
            setSaveErr((e as Error).message);
            return false;
        }
    }, [canMutate, draftVersionId, formId, onVersionsUpdated, schema]);

    const saveDraft = async () => {
        if (!canMutate || !draftVersionId || !schema) return;
        setBusy(true);
        try {
            await persistDraft();
        } finally {
            setBusy(false);
        }
    };

    const publishDraft = async () => {
        if (!canMutate || !draftVersionId || !schema) return;
        if (schema.fields.length === 0) {
            setSaveErr("Add at least one question before publishing.");
            return;
        }
        setSaveErr(null);
        setBusy(true);
        try {
            const saved = await persistDraft();
            if (!saved) return;

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
                    <p className="font-medium">Published — families can open this form from your share link.</p>
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
                    {!latestPublished ?
                        <p className={opMetadata}>Add questions, then publish so families can open the form.</p>
                    :   null}
                    <div className="flex flex-wrap gap-2" data-testid="form-new-draft-actions">
                        {!latestPublished ?
                            <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={busy} onClick={() => void startBlankDraft()}>
                                Start form
                            </PrimaryButton>
                        :   <PrimaryButton
                                type="button"
                                className="!px-3 !py-2 text-sm"
                                disabled={busy}
                                data-testid="form-action-edit"
                                onClick={() => void startFromPublished()}
                            >
                                Edit form
                            </PrimaryButton>}
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
                            Publish changes
                        </PrimaryButton>
                        <button
                            type="button"
                            className="self-center text-sm font-semibold text-alloy-midnight/70 underline-offset-2 hover:underline disabled:opacity-50"
                            disabled={!canMutate || busy}
                            data-testid="form-action-discard-changes"
                            onClick={() => void loadDraft(draftVersionId)}
                        >
                            Discard changes
                        </button>
                    </div>
                </div>
            ) : draftMeta && busy && !schema ? (
                <p className={opMetadata}>Loading form…</p>
            ) : null}
        </div>
    );
}
