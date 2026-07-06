"use client";

import "@/app/adminV2/components/alloyOsRuntime.css";
import { useMemo, useState } from "react";
import QueueRowBuilderV2 from "@/components/adminV2/settings/surfaces/QueueRowBuilderV2";
import type { ProcessStageOption } from "@/components/adminV2/settings/surfaces/QueueRowVariantStagePicker";
import { buildDefaultQueueRowSurfaceEnvelope, createQueueRowVariant, type QueueRowSurfaceEnvelope } from "@/lib/presentation/runtime/queueRowSurfaceMetadata";
import { defaultQueueRowSurfaceName } from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import type { QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";

const STAGES: ProcessStageOption[] = [
    { value: "new_lead", label: "New Leads" },
    { value: "tour_scheduled", label: "Tour Scheduled" },
    { value: "waitlist", label: "Waitlist" },
    { value: "enrolling", label: "Enrolling" },
];

export default function QueueRowSurfaceEditorDevClient() {
    const surfaceId = "queue-row-dept-1-proc-1";
    const [envelope, setEnvelope] = useState<QueueRowSurfaceEnvelope>(() =>
        buildDefaultQueueRowSurfaceEnvelope({ catalogId: "dept-1:proc-1", processKey: "enrollment", processName: "Enrollment" }),
    );
    const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const activeVariant = activeVariantId ? envelope.layout.variants?.find((v) => v.id === activeVariantId) : null;
    const activeLayout = useMemo(() => {
        if (!activeVariantId) return envelope.layout;
        const variant = envelope.layout.variants?.find((v) => v.id === activeVariantId);
        return variant ? { ...envelope.layout, columns: variant.columns, fixedControls: variant.fixedControls ?? envelope.layout.fixedControls } : envelope.layout;
    }, [envelope.layout, activeVariantId]);

    return (
        <div style={{ background: "#f4f6f9", minHeight: "100vh", padding: 24 }}>
            <div style={{ height: 900, width: 1240, maxWidth: "100%", background: "#fff", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column" }}>
                <header className="mb-3 border-b border-alloy-stone/10 pb-3">
                    <p className="text-lg font-semibold">{envelope.name || defaultQueueRowSurfaceName("Enrollment")}</p>
                </header>
                <div className="mb-3 flex gap-2">
                    <button type="button" onClick={() => setActiveVariantId(null)} className={`rounded-full px-3 py-1 text-xs font-semibold ${!activeVariantId ? "bg-alloy-pine text-white" : "bg-alloy-stone/10"}`}>Default</button>
                    {(envelope.layout.variants ?? []).map((v) => (
                        <button key={v.id} type="button" onClick={() => setActiveVariantId(v.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${activeVariantId === v.id ? "bg-alloy-pine text-white" : "bg-alloy-stone/10"}`}>{v.label}</button>
                    ))}
                    <button type="button" onClick={() => {
                        const v = createQueueRowVariant({ label: `Variant ${(envelope.layout.variants?.length ?? 0) + 2}`, priority: 10, seedFrom: envelope.layout });
                        setEnvelope((p) => ({ ...p, layout: { ...p.layout, variants: [...(p.layout.variants ?? []), v] } }));
                        setActiveVariantId(v.id);
                    }} className="rounded-full border border-dashed px-3 py-1 text-xs">+ Add variant</button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                    <QueueRowBuilderV2
                        key={activeVariantId ?? "__default__"}
                        surfaceId={surfaceId}
                        embedded
                        controlledLayout={activeLayout}
                        onControlledLayoutChange={(layout) => {
                            setEnvelope((prev) => {
                                if (!activeVariantId) return { ...prev, layout };
                                return { ...prev, layout: { ...prev.layout, variants: (prev.layout.variants ?? []).map((v) => v.id === activeVariantId ? { ...v, columns: layout.columns, fixedControls: layout.fixedControls } : v) } };
                            });
                            setDirty(true);
                        }}
                        onDirtyChange={setDirty}
                        embeddedVariantEditor={activeVariant ? { variant: activeVariant, processStages: STAGES, stagesLoading: false, onPatch: (patch) => setEnvelope((p) => ({ ...p, layout: { ...p.layout, variants: (p.layout.variants ?? []).map((v) => v.id === activeVariant.id ? { ...v, ...patch } : v) } })), onClose: () => setActiveVariantId(null) } : undefined}
                    />
                </div>
            </div>
        </div>
    );
}
