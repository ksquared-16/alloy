"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PacketOrchestrationHubView } from "@/components/forms/workspace/PacketOrchestrationHubView";
import { FormsWorkspaceShell } from "@/components/forms/workspace";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { formsWorkspaceBreadcrumbs, FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    countSessionsByPacketDefinition,
    type PacketOrchestrationListRow,
} from "@/lib/forms/packets/packetOrchestrationPresentation";

type PacketDef = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    is_active: boolean;
    updated_at: string | null;
};

type PacketDetailResponse = {
    definition?: PacketDef;
    items?: { step_has_published_version?: boolean }[];
};

export default function PacketDefinitionsHubClient() {
    const searchParams = useSearchParams();
    const addFormId = searchParams.get("addForm")?.trim() ?? "";

    const [rows, setRows] = useState<PacketOrchestrationListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(Boolean(addFormId));
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [defRes, sessRes] = await Promise.all([
                fetch("/api/admin/forms/packet-definitions", { credentials: "include" }),
                fetch("/api/admin/forms/packet-sessions", { credentials: "include" }),
            ]);
            const defJson = await defRes.json().catch(() => ({}));
            const sessJson = await sessRes.json().catch(() => ({}));
            if (!defRes.ok) throw new Error((defJson as { error?: string }).error ?? "Failed to load packets");

            const defs = (defJson as { data?: PacketDef[] }).data ?? [];
            const sessions = sessRes.ok ?
                ((sessJson as { data?: { packet_definition_id?: string }[] }).data ?? [])
            :   [];
            const sessionCounts = countSessionsByPacketDefinition(sessions);

            const enriched = await Promise.all(
                defs.map(async (def) => {
                    let stepCount = 0;
                    let allStepsPublished = false;
                    try {
                        const detailRes = await fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(def.id)}`, {
                            credentials: "include",
                        });
                        const detailJson = await detailRes.json().catch(() => ({}));
                        if (detailRes.ok) {
                            const data = (detailJson as { data?: PacketDetailResponse }).data;
                            const items = data?.items ?? [];
                            stepCount = items.length;
                            allStepsPublished = stepCount > 0 && items.every((i) => i.step_has_published_version === true);
                        }
                    } catch {
                        /* keep zeros */
                    }
                    return {
                        ...def,
                        step_count: stepCount,
                        session_count: sessionCounts[def.id] ?? 0,
                        all_steps_published: allStepsPublished,
                    } satisfies PacketOrchestrationListRow;
                })
            );

            setRows(enriched);
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const createPacket = async () => {
        setCreating(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/forms/packet-definitions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || null,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            const id = (json as { data?: { id: string } }).data?.id;
            setName("");
            setDescription("");
            setShowCreate(false);
            await load();
            if (id) {
                const q = addFormId ? `?addForm=${encodeURIComponent(addFormId)}` : "";
                window.location.href = `${ADMIN_FORMS_UI_BASE}/packet-definitions/${id}${q}`;
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setCreating(false);
        }
    };

    return (
        <FormsWorkspaceShell
            title="Packet orchestration"
            subtitle="Build and manage multi-step intake workflows."
            breadcrumbs={formsWorkspaceBreadcrumbs([{ label: "Packets" }])}
            actions={
                <a href={FORMS_MODULE_ROUTES.packetSessions} className="text-xs font-semibold text-alloy-blue hover:underline">
                    Session inbox
                </a>
            }
            contentClassName="space-y-0"
        >
            <PacketOrchestrationHubView
                rows={rows}
                loading={loading}
                error={error}
                addFormId={addFormId}
                showCreate={showCreate}
                creating={creating}
                createName={name}
                createDescription={description}
                onToggleCreate={() => setShowCreate((v) => !v)}
                onCreateNameChange={setName}
                onCreateDescriptionChange={setDescription}
                onCreatePacket={() => void createPacket()}
            />
        </FormsWorkspaceShell>
    );
}
