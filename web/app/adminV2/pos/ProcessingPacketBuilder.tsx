"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PacketBuilderWorkspaceLayout } from "@/components/forms/workspace/PacketBuilderWorkspaceLayout";
import type { StepDraft } from "@/components/forms/workspace/PacketStepCompositionEditor";
import type { PacketCreatedLinkPayload, PacketPublicLinkRow } from "@/components/forms/workspace/PacketDistributionLaunchPanel";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { mergeFormListWithPacketItems, type PacketStepFormOption } from "@/lib/admin/forms/packetDefinitionStepForms";
import { trimLeadingEmptyStepRows } from "@/lib/admin/forms/packetStepRecentFormPlacement";
import { countSessionsByPacketDefinition } from "@/lib/forms/packets/packetOrchestrationPresentation";
import { opMetadata } from "@/lib/operational/ui/operationalVisualTokens";
import { dispatchAdminV2OpenProcessingModal } from "@/lib/adminV2/workspaceModalEvents";
import PacketDeferredCapabilities, { type PacketDeferredCapability } from "./PacketDeferredCapabilities";

type PacketItem = {
    id: string;
    sequence_index: number;
    form_definition_id: string;
    pinned_form_definition_version_id: string | null;
    metadata?: Record<string, unknown>;
    step_has_published_version?: boolean;
    form_definitions?: PacketStepFormOption | PacketStepFormOption[] | null;
};

/**
 * Studio-hosted packet-definition builder. Ports the state/fetch/mutation logic of the
 * legacy route-bound PacketDefinitionDetailClient, keyed on a `packetDefId` prop instead
 * of useParams/useSearchParams, and composes the preserved PacketBuilderWorkspaceLayout view.
 */
export default function ProcessingPacketBuilder({
    packetDefId,
    onBack,
}: {
    packetDefId: string;
    onBack: () => void;
}) {
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
    const [deferred, setDeferred] = useState<PacketDeferredCapability[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [okBanner, setOkBanner] = useState<string | null>(null);
    const [createdLink, setCreatedLink] = useState<PacketCreatedLinkPayload | null>(null);

    const hasCompletedInitialLoad = useRef(false);

    useEffect(() => {
        hasCompletedInitialLoad.current = false;
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
            const def = (pj as { data?: { definition?: { name: string; key: string; description: string | null; is_active: boolean; metadata?: Record<string, unknown> }; items?: PacketItem[] } }).data;
            if (!def?.definition) throw new Error("Invalid response");
            setDefName(def.definition.name);
            setDefKey(def.definition.key);
            setDefDesc(def.definition.description ?? "");
            setDefActive(def.definition.is_active);
            // What the packet knowingly does not ask for, recorded when it was realized.
            const dc = def.definition.metadata?.deferred_capabilities;
            setDeferred(Array.isArray(dc) ? (dc as PacketDeferredCapability[]) : []);
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

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-alloy-stone" data-testid="processing-packet-builder">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-alloy-midnight/[0.06] bg-white px-4 py-2.5">
                <button type="button" onClick={onBack} className="text-[12px] text-alloy-midnight/50 hover:text-alloy-midnight">
                    ← Packets
                </button>
                <span className="text-[14px] font-semibold text-alloy-midnight">{defName || "Packet builder"}</span>
                {refreshing ? (
                    <span className={opMetadata} aria-live="polite">
                        Updating…
                    </span>
                ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {loading ? (
                    <p className={opMetadata}>Loading packet builder…</p>
                ) : (
                    <>
                        {err ? <p className="text-sm text-alloy-ember">{err}</p> : null}
                        {okBanner ? (
                            <div
                                className="mb-4 rounded-lg bg-alloy-bend-pine/[0.08] px-4 py-3 text-sm text-alloy-midnight ring-1 ring-alloy-bend-pine/20"
                                role="status"
                            >
                                {okBanner}
                                <button
                                    type="button"
                                    className="ml-3 text-xs font-semibold text-alloy-bend-pine underline"
                                    onClick={() => setOkBanner(null)}
                                >
                                    Dismiss
                                </button>
                            </div>
                        ) : null}
                        <PacketDeferredCapabilities items={deferred} />
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
                            onOpenWorkQueue={() =>
                                dispatchAdminV2OpenProcessingModal({ mode: "work", workView: "work" })
                            }
                        />
                    </>
                )}
            </div>
        </div>
    );
}
