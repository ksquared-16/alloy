"use client";

import "@/app/adminV2/components/alloyOsRuntime.css";
import { useMemo, useState } from "react";
import QueueRowBuilderV2 from "@/components/adminV2/settings/surfaces/QueueRowBuilderV2";
import QueueRowVariantSettings from "@/components/adminV2/settings/surfaces/QueueRowVariantSettings";
import type { ProcessStageOption } from "@/components/adminV2/settings/surfaces/QueueRowVariantStagePicker";
import { buildDefaultQueueRowSurfaceEnvelope, createQueueRowVariant, type QueueRowSurfaceEnvelope } from "@/lib/presentation/runtime/queueRowSurfaceMetadata";
import {
    resolveQueueRowCatalogIsWaitlist,
    resolveQueueRowIncludeWaitlistLibraryFields,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderPreview";
import { subjectFocusToUi } from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import { defaultQueueRowSurfaceName } from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";

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
    const libraryCatalogIsWaitlist = resolveQueueRowCatalogIsWaitlist({ processStages: STAGES });
    const libraryIncludeWaitlistFields = resolveQueueRowIncludeWaitlistLibraryFields({
        activeVariant,
        processStages: STAGES,
    });
    const rowFocusUi = subjectFocusToUi(activeVariant?.subjectFocus);

    return (
        <div style={{ background: "#f4f6f9", minHeight: "100vh", padding: 24 }}>
            <div style={{ height: 900, width: 1240, maxWidth: "100%", background: "#fff", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column" }}>
                <header className="mb-3 border-b border-alloy-stone/10 pb-3">
                    <p className="text-lg font-semibold">{envelope.name || defaultQueueRowSurfaceName("Enrollment")}</p>
                </header>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setActiveVariantId(null)} className={`rounded-full px-3 py-1 text-xs font-semibold ${!activeVariantId ? "bg-alloy-pine text-white" : "bg-alloy-stone/10"}`}>Default</button>
                    {(envelope.layout.variants ?? []).map((v) => (
                        <button key={v.id} type="button" onClick={() => setActiveVariantId(v.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${activeVariantId === v.id ? "bg-alloy-pine text-white" : "bg-alloy-stone/10"}`}>{v.label}</button>
                    ))}
                    <button type="button" onClick={() => {
                        const v = createQueueRowVariant({ label: "Variant", priority: 10 });
                        setEnvelope((p) => ({ ...p, layout: { ...p.layout, variants: [...(p.layout.variants ?? []), v] } }));
                        setActiveVariantId(v.id);
                    }} className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed text-sm">+</button>
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
                        libraryCatalogIsWaitlist={libraryCatalogIsWaitlist}
                        libraryIncludeWaitlistFields={libraryIncludeWaitlistFields}
                        rowFocusUi={rowFocusUi}
                    />
                    {activeVariant ? (
                        <div className="mt-4">
                            <QueueRowVariantSettings
                                variant={activeVariant}
                                processStages={STAGES}
                                onPatch={(patch) => setEnvelope((p) => ({ ...p, layout: { ...p.layout, variants: (p.layout.variants ?? []).map((v) => v.id === activeVariant.id ? { ...v, ...patch } : v) } }))}
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
