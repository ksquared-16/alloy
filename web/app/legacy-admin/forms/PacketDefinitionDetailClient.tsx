"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PacketBuilderWorkspaceLayout } from "@/components/forms/workspace/PacketBuilderWorkspaceLayout";
import type { StepDraft } from "@/components/forms/workspace/PacketStepCompositionEditor";
import type { PacketCreatedLinkPayload, PacketPublicLinkRow } from "@/components/forms/workspace/PacketDistributionLaunchPanel";
import { FormsWorkspaceShell } from "@/components/forms/workspace";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { mergeFormListWithPacketItems, type PacketStepFormOption } from "@/lib/admin/forms/packetDefinitionStepForms";
import { trimLeadingEmptyStepRows } from "@/lib/admin/forms/packetStepRecentFormPlacement";
import { formsWorkspaceBreadcrumbs, FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import { countSessionsByPacketDefinition } from "@/lib/forms/packets/packetOrchestrationPresentation";
import { opMetadata } from "@/lib/operational/ui/operationalVisualTokens";

type PacketItem = {
    id: string;
    sequence_index: number;
    form_definition_id: string;
    pinned_form_definition_version_id: string | null;
    metadata?: Record<string, unknown>;
    step_has_published_version?: boolean;
    form_definitions?: PacketStepFormOption | PacketStepFormOption[] | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function PacketDefinitionDetailClient() {
    const params = useParams();
    const searchParams = useSearchParams();
    const packetDefId = typeof params?.packetDefId === "string" ? params.packetDefId : "";
    const viewerTz = useAdminViewerTimezone();

    const [defName, setDefName] = useState("");
    const [defDesc, setDefDesc] = useState("");
    const [defActive, setDefActive] = useState(true);
    const [defKey, setDefKey] = useState("");
    const [items, setItems] = useState<PacketItem[]>([]);
    const [forms, setForms] = useState<PacketStepFormOption[]>([]);
    const [steps, setSteps] = useState<StepDraft[]>([{ form_definition_id: "", step_label: "" }]);
    const [links, setLinks] = useState<PacketPublicLinkRow[]>([]);
    const [sessionCount, setSessionCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [okBanner, setOkBanner] = useState<string | null>(null);
    const [createdLink, setCreatedLink] = useState<PacketCreatedLinkPayload | null>(null);

    const hasCompletedInitialLoad = useRef(false);
    const appliedAddFormPrefill = useRef(false);

    useEffect(() => {
        hasCompletedInitialLoad.current = false;
        appliedAddFormPrefill.current = false;
    }, [packetDefId]);

    const loadAll = useCallback(async () => {
        if (!packetDefId) return;
        const initialPass = !hasCompletedInitialLoad.current;
        if (initialPass) setLoading(true);
        else setRefreshing(true);
        setErr(null);
        try {
            const [pRes, fRes, lRes, sRes] = await Promise.all([
                fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}`),
                fetch("/api/admin/forms"),
                fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}/public-links`),
                fetch("/api/admin/forms/packet-sessions", { credentials: "include" }),
            ]);
            const pj = await pRes.json().catch(() => ({}));
            const fj = await fRes.json().catch(() => ({}));
            const lj = await lRes.json().catch(() => ({}));
            const sj = await sRes.json().catch(() => ({}));
            if (!pRes.ok) throw new Error((pj as { error?: string }).error ?? "Failed to load packet");
            const def = (pj as { data?: { definition?: { name: string; key: string; description: string | null; is_active: boolean }; items?: PacketItem[] } }).data;
            if (!def?.definition) throw new Error("Invalid response");
            setDefName(def.definition.name);
            setDefKey(def.definition.key);
            setDefDesc(def.definition.description ?? "");
            setDefActive(def.definition.is_active);
            const it = def.items ?? [];
            setItems(it);

            const rawForms = fRes.ok ? ((fj as { data?: PacketStepFormOption[] }).data ?? []) : [];
            setForms(mergeFormListWithPacketItems(rawForms, it));

            if (!fRes.ok) {
                setErr((fj as { error?: string }).error ?? "Could not load the form list for step pickers.");
            }

            if (it.length) {
                setSteps(
                    it.map((row) => {
                        const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
                        const step_label = typeof meta.step_label === "string" ? meta.step_label : "";
                        return {
                            packet_item_id: row.id,
                            form_definition_id: row.form_definition_id,
                            step_label,
                        };
                    })
                );
            } else {
                setSteps([{ form_definition_id: "", step_label: "" }]);
            }
            if (lRes.ok) setLinks((lj as { data?: PacketPublicLinkRow[] }).data ?? []);

            if (sRes.ok) {
                const sessions = (sj as { data?: { packet_definition_id?: string }[] }).data ?? [];
                setSessionCount(countSessionsByPacketDefinition(sessions)[packetDefId] ?? 0);
            } else {
                setSessionCount(0);
            }
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            if (initialPass) {
                setLoading(false);
                hasCompletedInitialLoad.current = true;
            } else {
                setRefreshing(false);
            }
        }
    }, [packetDefId]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    const addFormFromQuery = searchParams.get("addForm")?.trim() ?? "";

    useEffect(() => {
        if (loading || appliedAddFormPrefill.current || !addFormFromQuery || !UUID_RE.test(addFormFromQuery)) return;
        const hit = forms.find((f) => f.id === addFormFromQuery && f.has_published_version);
        if (!hit) return;
        setSteps((prev) => {
            if (prev.length === 1 && !prev[0].form_definition_id && !prev[0].step_label) {
                appliedAddFormPrefill.current = true;
                return [{ form_definition_id: addFormFromQuery, step_label: "" }];
            }
            return prev;
        });
    }, [loading, forms, addFormFromQuery]);

    const saveMeta = async () => {
        setBusy(true);
        setErr(null);
        setOkBanner(null);
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
            setOkBanner("Packet overview saved.");
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
        setOkBanner(null);
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
            setOkBanner("Pipeline saved. Launch a packet link when ready.");
            await loadAll();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const addStep = () => setSteps((s) => [...s, { form_definition_id: "", step_label: "" }]);
    const removeStep = (i: number) =>
        setSteps((s) => {
            const next = s.length <= 1 ? s : s.filter((_, j) => j !== i);
            return trimLeadingEmptyStepRows(next);
        });
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
        setOkBanner(null);
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
            setOkBanner("Packet link created — copy the URL below.");
            await loadAll();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const toggleLink = async (link: PacketPublicLinkRow, nextActive: boolean) => {
        setBusy(true);
        setErr(null);
        setOkBanner(null);
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
            setOkBanner(nextActive ? "Link activated." : "Link deactivated.");
            await loadAll();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const recentPublishedForms = forms.filter((f) => f.has_published_version).slice(0, 8);
    const allStepsPublished = items.length > 0 && items.every((i) => i.step_has_published_version === true);

    if (!packetDefId) return <p className="p-6 text-sm text-alloy-ember">Missing packet id.</p>;

    return (
        <FormsWorkspaceShell
            title={defName || "Packet builder"}
            subtitle="Compose steps, launch intake, and review sessions."
            breadcrumbs={formsWorkspaceBreadcrumbs([
                { label: "Packets", href: FORMS_MODULE_ROUTES.packetDefinitions },
                { label: defName || "Packet" },
            ])}
            contentClassName="space-y-0"
        >
            {loading ?
                <p className={opMetadata}>Loading packet builder…</p>
            :   <>
                    {refreshing ?
                        <p className={opMetadata} aria-live="polite">
                            Updating…
                        </p>
                    :   null}
                    {err ?
                        <p className="text-sm text-alloy-ember">{err}</p>
                    :   null}
                    {okBanner ?
                        <div
                            className="mb-4 rounded-lg bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950 ring-1 ring-emerald-200/60"
                            role="status"
                        >
                            {okBanner}
                            <button
                                type="button"
                                className="ml-3 text-xs font-semibold text-emerald-800 underline"
                                onClick={() => setOkBanner(null)}
                            >
                                Dismiss
                            </button>
                        </div>
                    :   null}
                    <PacketBuilderWorkspaceLayout
                        packetDefId={packetDefId}
                        defName={defName}
                        defDesc={defDesc}
                        defActive={defActive}
                        defKey={defKey}
                        stepCount={items.length}
                        sessionCount={sessionCount}
                        allStepsPublished={allStepsPublished}
                        savedItems={items}
                        steps={steps}
                        forms={forms}
                        recentPublishedForms={recentPublishedForms}
                        links={links}
                        createdLink={createdLink}
                        busy={busy}
                        viewerTz={viewerTz}
                        onDefNameChange={setDefName}
                        onDefDescChange={setDefDesc}
                        onDefActiveChange={setDefActive}
                        onSaveMeta={() => void saveMeta()}
                        onStepsChange={setSteps}
                        onAddStep={addStep}
                        onSaveSteps={() => void saveSteps()}
                        onMoveStep={moveStep}
                        onRemoveStep={removeStep}
                        onMintLink={() => void mintLink()}
                        onToggleLink={(link, next) => void toggleLink(link, next)}
                    />
                </>
            }
        </FormsWorkspaceShell>
    );
}
