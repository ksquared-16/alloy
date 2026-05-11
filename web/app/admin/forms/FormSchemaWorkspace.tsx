"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import SectionCard from "@/components/admin/SectionCard";
import StructuredFormSchemaEditor from "@/components/admin/forms/StructuredFormSchemaEditor";
import { emptyFormSchema } from "@/lib/forms/adminFormSchemaBuilder";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

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
                    body: JSON.stringify({ schema_json: schema }),
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
        } catch (e) {
            setSaveErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <SectionCard title="Form fields & draft version">
            {!canMutate ? <p className="text-sm text-[#59678b]">Admin role required to edit schema.</p> : null}
            {loadErr ? <p className="text-sm text-red-700">{loadErr}</p> : null}
            {saveErr ? <p className="text-sm text-red-700">{saveErr}</p> : null}

            {!draftMeta && canMutate ? (
                <div className="space-y-3 text-sm text-[#31394d]">
                    <p className="text-[#59678b]">
                        No draft version yet. Create a draft to edit fields, then publish when ready. Published versions stay
                        immutable; editing again creates a new draft from a published snapshot.
                    </p>
                    <div className="flex flex-wrap gap-2">
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
                                New draft from published v{latestPublished.version_number}
                            </PrimaryButton>
                        ) : (
                            <span className="self-center text-xs text-[#59678b]">Publish a first version before you can clone.</span>
                        )}
                    </div>
                </div>
            ) : null}

            {schema && draftVersionId ? (
                <div className="mt-4 space-y-3">
                    <p className="text-xs text-[#59678b]">
                        Editing draft <span className="font-mono">{draftVersionId.slice(0, 8)}…</span>
                    </p>
                    <StructuredFormSchemaEditor schema={schema} onChange={setSchema} disabled={!canMutate || busy} />
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
                <p className="text-sm text-[#59678b]">Loading draft…</p>
            ) : null}
        </SectionCard>
    );
}
