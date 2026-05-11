"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import SectionCard from "@/components/admin/SectionCard";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";

type FormListRow = { id: string; name: string; key: string; has_published_version?: boolean };
type PacketItem = {
    id: string;
    sequence_index: number;
    form_definition_id: string;
    pinned_form_definition_version_id: string | null;
    metadata?: Record<string, unknown>;
    form_definitions?: { id: string; name: string; key: string } | { id: string; name: string; key: string }[] | null;
};
type PublicLinkRow = {
    id: string;
    form_definition_id: string;
    is_active: boolean;
    token_prefix: string | null;
    metadata?: Record<string, unknown>;
    created_at: string;
};

type StepDraft = { form_definition_id: string; step_label: string };

export default function PacketDefinitionDetailClient() {
    const params = useParams();
    const packetDefId = typeof params?.packetDefId === "string" ? params.packetDefId : "";

    const [defName, setDefName] = useState("");
    const [defKey, setDefKey] = useState("");
    const [defDesc, setDefDesc] = useState("");
    const [defActive, setDefActive] = useState(true);
    const [items, setItems] = useState<PacketItem[]>([]);
    const [forms, setForms] = useState<FormListRow[]>([]);
    const [steps, setSteps] = useState<StepDraft[]>([{ form_definition_id: "", step_label: "" }]);
    const [links, setLinks] = useState<PublicLinkRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [createdLink, setCreatedLink] = useState<{ embed_url: string | null; embed_path: string } | null>(null);

    const loadAll = useCallback(async () => {
        if (!packetDefId) return;
        setLoading(true);
        setErr(null);
        try {
            const [pRes, fRes, lRes] = await Promise.all([
                fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}`),
                fetch("/api/admin/forms"),
                fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}/public-links`),
            ]);
            const pj = await pRes.json().catch(() => ({}));
            const fj = await fRes.json().catch(() => ({}));
            const lj = await lRes.json().catch(() => ({}));
            if (!pRes.ok) throw new Error((pj as { error?: string }).error ?? "Failed to load packet");
            const def = (pj as { data?: { definition?: { name: string; key: string; description: string | null; is_active: boolean }; items?: PacketItem[] } }).data;
            if (!def?.definition) throw new Error("Invalid response");
            setDefName(def.definition.name);
            setDefKey(def.definition.key);
            setDefDesc(def.definition.description ?? "");
            setDefActive(def.definition.is_active);
            const it = def.items ?? [];
            setItems(it);
            if (it.length) {
                setSteps(
                    it.map((row) => {
                        const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
                        const step_label = typeof meta.step_label === "string" ? meta.step_label : "";
                        return { form_definition_id: row.form_definition_id, step_label };
                    })
                );
            } else {
                setSteps([{ form_definition_id: "", step_label: "" }]);
            }
            if (fRes.ok) setForms((fj as { data?: FormListRow[] }).data ?? []);
            if (lRes.ok) setLinks((lj as { data?: PublicLinkRow[] }).data ?? []);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [packetDefId]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    const saveMeta = async () => {
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: defName.trim(),
                    description: defDesc.trim() || null,
                    is_active: defActive,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            await loadAll();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const saveSteps = async () => {
        setBusy(true);
        setErr(null);
        const clean = steps
            .filter((s) => s.form_definition_id)
            .map((s) => ({
                form_definition_id: s.form_definition_id,
                step_label: s.step_label.trim() || undefined,
            }));
        if (clean.length === 0) {
            setErr("Add at least one step with a form selected.");
            setBusy(false);
            return;
        }
        try {
            const res = await fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}/items`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: clean }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not save steps");
            await loadAll();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const addStep = () => setSteps((s) => [...s, { form_definition_id: "", step_label: "" }]);
    const removeStep = (i: number) => setSteps((s) => (s.length <= 1 ? s : s.filter((_, j) => j !== i)));
    const moveStep = (i: number, dir: -1 | 1) => {
        setSteps((s) => {
            const j = i + dir;
            if (j < 0 || j >= s.length) return s;
            const next = [...s];
            const t = next[i]!;
            next[i] = next[j]!;
            next[j] = t;
            return next;
        });
    };

    const mintLink = async () => {
        setBusy(true);
        setErr(null);
        setCreatedLink(null);
        try {
            const res = await fetch("/api/admin/forms/packet-links", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    packet_definition_id: packetDefId,
                    label: `${defName} link`,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not create link");
            const d = json as { data?: { embed_path?: string; embed_url?: string | null } };
            const embed_path = d.data?.embed_path;
            if (typeof embed_path !== "string") throw new Error("Missing embed path");
            setCreatedLink({
                embed_path,
                embed_url:
                    typeof d.data?.embed_url === "string" && d.data.embed_url.startsWith("http")
                        ? d.data.embed_url
                        : typeof window !== "undefined"
                          ? `${window.location.origin}${embed_path}`
                          : null,
            });
            await loadAll();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const toggleLink = async (link: PublicLinkRow, nextActive: boolean) => {
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch(
                `/api/admin/forms/${encodeURIComponent(link.form_definition_id)}/public-links/${encodeURIComponent(link.id)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_active: nextActive }),
                }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            await loadAll();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    if (!packetDefId) return <p className="p-6 text-sm text-red-700">Missing packet id.</p>;

    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6 text-[#31394d]">
            <p className="text-sm">
                <Link href={`${ADMIN_FORMS_UI_BASE}/packet-definitions`} className="font-medium text-[#00458C] hover:underline">
                    ← All packets
                </Link>
            </p>
            {loading ? <p className="text-sm text-[#59678b]">Loading…</p> : null}
            {err ? <p className="text-sm text-red-700">{err}</p> : null}

            {!loading ? (
                <>
                    <SectionCard title="Packet settings">
                        <p className="mb-3 font-mono text-xs text-[#59678b]">Key: {defKey}</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1 text-sm">
                                <span className="text-xs font-semibold uppercase text-[#59678b]">Name</span>
                                <input
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5"
                                    value={defName}
                                    onChange={(e) => setDefName(e.target.value)}
                                />
                            </label>
                            <label className="flex items-center gap-2 pt-6 text-sm">
                                <input type="checkbox" checked={defActive} onChange={(e) => setDefActive(e.target.checked)} />
                                Active
                            </label>
                            <label className="space-y-1 text-sm sm:col-span-2">
                                <span className="text-xs font-semibold uppercase text-[#59678b]">Description</span>
                                <input
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5"
                                    value={defDesc}
                                    onChange={(e) => setDefDesc(e.target.value)}
                                />
                            </label>
                        </div>
                        <div className="mt-3">
                            <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={busy} onClick={() => void saveMeta()}>
                                Save settings
                            </PrimaryButton>
                        </div>
                    </SectionCard>

                    <SectionCard title="Steps (ordered)">
                        <p className="mb-3 text-xs text-[#59678b]">
                            Each step uses a form&apos;s latest published version unless you pin a version in the API. Forms must
                            have a published version before they can be added here.
                        </p>
                        {steps.map((s, idx) => (
                            <div key={idx} className="mb-3 flex flex-wrap items-end gap-2 rounded border border-[#e6e8ec] p-3">
                                <label className="min-w-[200px] flex-1 space-y-1 text-sm">
                                    <span className="text-xs font-semibold uppercase text-[#59678b]">Form</span>
                                    <select
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                        value={s.form_definition_id}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setSteps((rows) => rows.map((r, j) => (j === idx ? { ...r, form_definition_id: v } : r)));
                                        }}
                                    >
                                        <option value="">Select form…</option>
                                        {forms.map((f) => (
                                            <option key={f.id} value={f.id} disabled={!f.has_published_version}>
                                                {f.name} {!f.has_published_version ? "(not published)" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="min-w-[160px] flex-1 space-y-1 text-sm">
                                    <span className="text-xs font-semibold uppercase text-[#59678b]">Step label (optional)</span>
                                    <input
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                        value={s.step_label}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setSteps((rows) => rows.map((r, j) => (j === idx ? { ...r, step_label: v } : r)));
                                        }}
                                    />
                                </label>
                                <div className="flex gap-1">
                                    <button type="button" className="text-xs text-[#00458C]" disabled={busy || idx === 0} onClick={() => moveStep(idx, -1)}>
                                        Up
                                    </button>
                                    <button
                                        type="button"
                                        className="text-xs text-[#00458C]"
                                        disabled={busy || idx >= steps.length - 1}
                                        onClick={() => moveStep(idx, 1)}
                                    >
                                        Down
                                    </button>
                                    <button type="button" className="text-xs text-red-700" disabled={busy || steps.length <= 1} onClick={() => removeStep(idx)}>
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                            <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={busy} onClick={addStep}>
                                Add step
                            </PrimaryButton>
                            <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={busy} onClick={() => void saveSteps()}>
                                Save steps
                            </PrimaryButton>
                        </div>
                        {items.length > 0 ? (
                            <p className="mt-3 text-xs text-amber-900">
                                If this packet already has sessions, step changes are blocked — create a new packet definition instead.
                            </p>
                        ) : null}
                    </SectionCard>

                    <SectionCard title="Public packet links">
                        <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={busy} onClick={() => void mintLink()}>
                            Create packet link
                        </PrimaryButton>
                        {createdLink ? (
                            <div className="mt-3 rounded-lg border border-[#DBC078]/50 bg-[#e6d3a0]/15 p-3 text-sm">
                                <p className="font-semibold">Copy embed URL now</p>
                                <code className="mt-1 block break-all text-xs">{createdLink.embed_url ?? createdLink.embed_path}</code>
                            </div>
                        ) : null}
                        {links.length > 0 ? (
                            <ul className="mt-4 divide-y divide-[#e6e8ec] text-sm">
                                {links.map((L) => (
                                    <li key={L.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                        <span className="font-mono text-xs">{L.token_prefix ?? L.id.slice(0, 8)}</span>
                                        <span className="text-xs text-[#59678b]">{L.is_active ? "active" : "inactive"}</span>
                                        <button
                                            type="button"
                                            className="text-xs text-[#00458C]"
                                            disabled={busy}
                                            onClick={() => void toggleLink(L, !L.is_active)}
                                        >
                                            {L.is_active ? "Deactivate" : "Activate"}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-2 text-xs text-[#59678b]">No links yet for this packet.</p>
                        )}
                    </SectionCard>
                </>
            ) : null}
        </div>
    );
}
