"use client";

import { useCallback, useEffect, useState } from "react";
import Drawer from "@/components/admin/Drawer";
import PrimaryButton from "@/components/PrimaryButton";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface Pipeline {
    id: string;
    name: string;
}

interface PipelineStage {
    id: string;
    pipeline_id: string;
    name: string;
    position: number;
    show_in_funnel: boolean;
    show_in_pie_chart: boolean;
}

export default function SettingsClient() {
    const { canMutate } = useAdminAuth();
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [stages, setStages] = useState<PipelineStage[]>([]);
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
    const [loadingPipelines, setLoadingPipelines] = useState(true);
    const [loadingStages, setLoadingStages] = useState(false);

    const loadPipelines = useCallback(async () => {
        setLoadingPipelines(true);
        try {
            const res = await fetch("/api/admin/pipelines");
            const data = await res.json();
            if (res.ok && Array.isArray(data)) setPipelines(data);
            else setPipelines([]);
        } catch {
            setPipelines([]);
        } finally {
            setLoadingPipelines(false);
        }
    }, []);

    const loadStages = useCallback(async (pipelineId: string) => {
        if (!pipelineId) {
            setStages([]);
            return;
        }
        setLoadingStages(true);
        try {
            const res = await fetch(`/api/admin/pipeline-stages?pipeline_id=${encodeURIComponent(pipelineId)}`);
            const data = await res.json();
            if (res.ok && Array.isArray(data)) setStages(data);
            else setStages([]);
        } catch {
            setStages([]);
        } finally {
            setLoadingStages(false);
        }
    }, []);

    useEffect(() => {
        loadPipelines();
    }, [loadPipelines]);

    useEffect(() => {
        if (selectedPipelineId) loadStages(selectedPipelineId);
        else setStages([]);
    }, [selectedPipelineId, loadStages]);

    // Pipeline drawer
    const [pipeDrawerOpen, setPipeDrawerOpen] = useState(false);
    const [pipeEditingId, setPipeEditingId] = useState<string | null>(null);
    const [pipeName, setPipeName] = useState("");
    const [pipeSubmitting, setPipeSubmitting] = useState(false);
    const [pipeError, setPipeError] = useState<string | null>(null);

    const openCreatePipeline = () => {
        setPipeEditingId(null);
        setPipeName("");
        setPipeError(null);
        setPipeDrawerOpen(true);
    };
    const openEditPipeline = (p: Pipeline) => {
        setPipeEditingId(p.id);
        setPipeName(p.name);
        setPipeError(null);
        setPipeDrawerOpen(true);
    };
    const savePipeline = async () => {
        if (!pipeName.trim()) return;
        setPipeSubmitting(true);
        setPipeError(null);
        try {
            const url = pipeEditingId ? `/api/admin/pipelines/${pipeEditingId}` : "/api/admin/pipelines";
            const res = await fetch(url, {
                method: pipeEditingId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: pipeName.trim() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Failed to save pipeline");
            await loadPipelines();
            setPipeDrawerOpen(false);
        } catch (e: unknown) {
            setPipeError((e as Error).message);
        } finally {
            setPipeSubmitting(false);
        }
    };
    const deletePipeline = async (id: string) => {
        if (!confirm("Delete this pipeline? Stages in it will need to be deleted first or will be removed.")) return;
        try {
            const res = await fetch(`/api/admin/pipelines/${id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Failed to delete");
            await loadPipelines();
            if (selectedPipelineId === id) setSelectedPipelineId("");
        } catch (e: unknown) {
            alert((e as Error).message);
        }
    };

    // Stage drawer
    const [stageDrawerOpen, setStageDrawerOpen] = useState(false);
    const [stageEditingId, setStageEditingId] = useState<string | null>(null);
    const [stageForm, setStageForm] = useState({ name: "", position: 0, show_in_funnel: true, show_in_pie_chart: true });
    const [stageSubmitting, setStageSubmitting] = useState(false);
    const [stageError, setStageError] = useState<string | null>(null);

    const openCreateStage = () => {
        if (!selectedPipelineId) return;
        setStageEditingId(null);
        const nextPos = stages.length ? Math.max(...stages.map((s) => s.position), 0) + 1 : 0;
        setStageForm({ name: "", position: nextPos, show_in_funnel: true, show_in_pie_chart: true });
        setStageError(null);
        setStageDrawerOpen(true);
    };
    const openEditStage = (s: PipelineStage) => {
        setStageEditingId(s.id);
        setStageForm({
            name: s.name,
            position: s.position,
            show_in_funnel: s.show_in_funnel,
            show_in_pie_chart: s.show_in_pie_chart,
        });
        setStageError(null);
        setStageDrawerOpen(true);
    };
    const saveStage = async () => {
        if (!stageForm.name.trim()) return;
        if (!selectedPipelineId && !stageEditingId) return;
        setStageSubmitting(true);
        setStageError(null);
        try {
            const pipelineId = stageEditingId
                ? stages.find((s) => s.id === stageEditingId)?.pipeline_id
                : selectedPipelineId;
            if (!pipelineId) throw new Error("No pipeline selected");
            const payload = {
                pipeline_id: pipelineId,
                name: stageForm.name.trim(),
                position: Number(stageForm.position) || 0,
                show_in_funnel: !!stageForm.show_in_funnel,
                show_in_pie_chart: !!stageForm.show_in_pie_chart,
            };
            const url = stageEditingId ? `/api/admin/pipeline-stages/${stageEditingId}` : "/api/admin/pipeline-stages";
            const res = await fetch(url, {
                method: stageEditingId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Failed to save stage");
            if (selectedPipelineId) await loadStages(selectedPipelineId);
            setStageDrawerOpen(false);
        } catch (e: unknown) {
            setStageError((e as Error).message);
        } finally {
            setStageSubmitting(false);
        }
    };
    const deleteStage = async (id: string) => {
        if (!confirm("Delete this stage?")) return;
        try {
            const res = await fetch(`/api/admin/pipeline-stages/${id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Failed to delete");
            if (selectedPipelineId) await loadStages(selectedPipelineId);
        } catch (e: unknown) {
            alert((e as Error).message);
        }
    };

    return (
        <div className="space-y-10">
            <h1 className="text-3xl font-bold text-alloy-midnight">Pipelines & stages</h1>

            {/* Pipelines */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-alloy-midnight">Pipelines</h2>
                    {canMutate && (
                        <PrimaryButton onClick={openCreatePipeline}>Create Pipeline</PrimaryButton>
                    )}
                </div>
                {loadingPipelines ? (
                    <p className="text-alloy-midnight/60">Loading…</p>
                ) : (
                    <div className="border border-alloy-stone/40 rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-alloy-stone/20">
                                <tr>
                                    <th className="text-left px-4 py-2 font-medium">Name</th>
                                    {canMutate && <th className="w-32" />}
                                </tr>
                            </thead>
                            <tbody>
                                {pipelines.length === 0 ? (
                                    <tr><td colSpan={2} className="px-4 py-4 text-alloy-midnight/60">No pipelines yet.</td></tr>
                                ) : (
                                    pipelines.map((p) => (
                                        <tr key={p.id} className="border-t border-alloy-stone/30">
                                            <td className="px-4 py-2">{p.name}</td>
                                            {canMutate && (
                                                <td className="px-4 py-2">
                                                    <button type="button" onClick={() => openEditPipeline(p)} className="text-alloy-blue hover:underline mr-2">Edit</button>
                                                    <button type="button" onClick={() => deletePipeline(p.id)} className="text-red-600 hover:underline">Delete</button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Pipeline Stages */}
            <section>
                <h2 className="text-xl font-semibold text-alloy-midnight mb-4">Pipeline Stages</h2>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Pipeline</label>
                    <select
                        value={selectedPipelineId}
                        onChange={(e) => setSelectedPipelineId(e.target.value)}
                        className="w-full max-w-xs px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                    >
                        <option value="">— Select pipeline —</option>
                        {pipelines.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
                {selectedPipelineId && (
                    <>
                        {canMutate && (
                            <div className="mb-4">
                                <PrimaryButton onClick={openCreateStage}>Create Stage</PrimaryButton>
                            </div>
                        )}
                        {loadingStages ? (
                            <p className="text-alloy-midnight/60">Loading stages…</p>
                        ) : (
                            <div className="border border-alloy-stone/40 rounded-md overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-alloy-stone/20">
                                        <tr>
                                            <th className="text-left px-4 py-2 font-medium w-20">Position</th>
                                            <th className="text-left px-4 py-2 font-medium">Name</th>
                                            <th className="text-left px-4 py-2 font-medium">Show in funnel</th>
                                            <th className="text-left px-4 py-2 font-medium">Show in pie</th>
                                            {canMutate && <th className="w-32" />}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stages.length === 0 ? (
                                            <tr><td colSpan={5} className="px-4 py-4 text-alloy-midnight/60">No stages in this pipeline.</td></tr>
                                        ) : (
                                            stages.map((s) => (
                                                <tr key={s.id} className="border-t border-alloy-stone/30">
                                                    <td className="px-4 py-2">{s.position}</td>
                                                    <td className="px-4 py-2">{s.name}</td>
                                                    <td className="px-4 py-2">{s.show_in_funnel ? "Yes" : "No"}</td>
                                                    <td className="px-4 py-2">{s.show_in_pie_chart ? "Yes" : "No"}</td>
                                                    {canMutate && (
                                                        <td className="px-4 py-2">
                                                            <button type="button" onClick={() => openEditStage(s)} className="text-alloy-blue hover:underline mr-2">Edit</button>
                                                            <button type="button" onClick={() => deleteStage(s.id)} className="text-red-600 hover:underline">Delete</button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </section>

            {/* Pipeline drawer */}
            <Drawer
                isOpen={pipeDrawerOpen}
                onClose={() => setPipeDrawerOpen(false)}
                title={pipeEditingId ? "Edit Pipeline" : "Create Pipeline"}
            >
                <div className="space-y-4">
                    {pipeError && <p className="text-red-600 text-sm">{pipeError}</p>}
                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Name *</label>
                        <input
                            type="text"
                            value={pipeName}
                            onChange={(e) => setPipeName(e.target.value)}
                            className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                        />
                    </div>
                    <div className="flex gap-2">
                        <PrimaryButton onClick={savePipeline} disabled={pipeSubmitting || !pipeName.trim()}>
                            {pipeSubmitting ? "Saving…" : "Save"}
                        </PrimaryButton>
                        <button type="button" onClick={() => setPipeDrawerOpen(false)} className="px-4 py-2 border border-alloy-stone/80 rounded-md hover:bg-alloy-stone/30">Cancel</button>
                    </div>
                </div>
            </Drawer>

            {/* Stage drawer */}
            <Drawer
                isOpen={stageDrawerOpen}
                onClose={() => setStageDrawerOpen(false)}
                title={stageEditingId ? "Edit Stage" : "Create Stage"}
            >
                <div className="space-y-4">
                    {stageError && <p className="text-red-600 text-sm">{stageError}</p>}
                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Name *</label>
                        <input
                            type="text"
                            value={stageForm.name}
                            onChange={(e) => setStageForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight/70 mb-1">Position</label>
                        <input
                            type="number"
                            min={0}
                            value={stageForm.position}
                            onChange={(e) => setStageForm((f) => ({ ...f, position: parseInt(e.target.value, 10) || 0 }))}
                            className="w-full px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="show_in_funnel"
                            checked={stageForm.show_in_funnel}
                            onChange={(e) => setStageForm((f) => ({ ...f, show_in_funnel: e.target.checked }))}
                            className="rounded"
                        />
                        <label htmlFor="show_in_funnel" className="text-sm font-medium text-alloy-midnight/70">Show in funnel</label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="show_in_pie_chart"
                            checked={stageForm.show_in_pie_chart}
                            onChange={(e) => setStageForm((f) => ({ ...f, show_in_pie_chart: e.target.checked }))}
                            className="rounded"
                        />
                        <label htmlFor="show_in_pie_chart" className="text-sm font-medium text-alloy-midnight/70">Show in pie chart</label>
                    </div>
                    <div className="flex gap-2">
                        <PrimaryButton onClick={saveStage} disabled={stageSubmitting || !stageForm.name.trim()}>
                            {stageSubmitting ? "Saving…" : "Save"}
                        </PrimaryButton>
                        <button type="button" onClick={() => setStageDrawerOpen(false)} className="px-4 py-2 border border-alloy-stone/80 rounded-md hover:bg-alloy-stone/30">Cancel</button>
                    </div>
                </div>
            </Drawer>
        </div>
    );
}
