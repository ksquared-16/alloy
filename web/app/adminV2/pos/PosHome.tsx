"use client";

/**
 * Processing landing — Work / Studio / Recent assets inside the existing modal shell.
 * Reuses queue + forms APIs; no new backend.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderUp, PackageOpen, Plus, RefreshCw, Settings2, Sparkles } from "lucide-react";
import type { ProcessingCaseQueueRow } from "@/lib/pos/processingCase/readModel/types";
import WorkspaceSectionHeader from "@/components/workspace/WorkspaceSectionHeader";
import { WS_EYEBROW } from "@/components/workspace/workspaceTokens";
import PosPanel from "./PosPanel";
import type { PosSection } from "./posSections";
import { useProcessingQueueWarm } from "@/lib/pos/useProcessingQueueWarm";

interface FormRow {
    id: string;
    name: string | null;
    key: string;
    metadata?: Record<string, unknown>;
    has_published_version?: boolean;
}

interface PacketRow {
    packet_definition_id: string;
    name: string;
    key: string;
}

function isToday(iso: string | null | undefined): boolean {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isDocumentRow(row: ProcessingCaseQueueRow): boolean {
    const kind = row.primarySource?.kind;
    return kind === "document" || kind === "upload" || kind === "recreated_document";
}

export default function PosHome({
    onNavigate,
    onOpenCase,
}: {
    onNavigate: (section: PosSection) => void;
    onOpenCase: (caseId: string) => void;
}) {
    const { data: queueData, loading: queueLoading, refresh: refreshQueue } = useProcessingQueueWarm();
    const rows = queueData?.rows ?? [];
    const counts = queueData?.counts ?? {};

    const [forms, setForms] = useState<FormRow[]>([]);
    const [packets, setPackets] = useState<PacketRow[]>([]);
    const [assetsLoading, setAssetsLoading] = useState(true);

    const loadAssets = useCallback(async () => {
        setAssetsLoading(true);
        try {
            const [formsRes, packetsRes] = await Promise.all([
                fetch("/api/admin/forms", { credentials: "same-origin" }),
                fetch("/api/admin/pos/packets", { credentials: "same-origin" }),
            ]);
            const formsBody = (await formsRes.json().catch(() => ({}))) as { data?: FormRow[] };
            const packetsBody = (await packetsRes.json().catch(() => ({}))) as { data?: PacketRow[] };
            setForms(formsBody.data ?? []);
            setPackets(packetsBody.data ?? []);
        } catch {
            setForms([]);
            setPackets([]);
        } finally {
            setAssetsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadAssets();
    }, [loadAssets]);

    const documentRows = useMemo(() => rows.filter(isDocumentRow), [rows]);

    const workCounts = useMemo(() => {
        const needsReview = documentRows.filter(
            (r) =>
                !r.formDraftSummary?.generatedFormId &&
                (r.status === "needs_review" ||
                    r.status === "needs_resolution" ||
                    r.status === "received" ||
                    r.status === "processing" ||
                    (r.formDraftSummary?.questionCount ?? 0) > 0)
        ).length;
        const readyToGenerate = documentRows.filter(
            (r) => !r.formDraftSummary?.generatedFormId && r.formDraftSummary && (r.formDraftSummary.questionCount ?? 0) > 0
        ).length;
        const readyToPublish = forms.filter(
            (f) => f.metadata?.source === "document_form_draft" && !f.has_published_version
        ).length;
        const completedToday = rows.filter((r) => r.status === "completed" && isToday(r.statusChangedAt)).length;
        return { needsReview, readyToGenerate, readyToPublish, completedToday };
    }, [documentRows, forms, rows]);

    const recentAssets = useMemo(() => {
        const formAssets = forms.slice(0, 5).map((f) => ({
            id: f.id,
            name: f.name || f.key,
            type: "Form" as const,
            source: f.metadata?.source === "document_form_draft" ? "From document" : "Manual",
            status: f.has_published_version ? "Published" : "Draft",
        }));
        const packetAssets = packets.slice(0, 3).map((p) => ({
            id: p.packet_definition_id,
            name: p.name || p.key,
            type: "Packet" as const,
            source: "Studio",
            status: "Draft",
        }));
        return [...formAssets, ...packetAssets].slice(0, 8);
    }, [forms, packets]);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceSectionHeader
                title="Processing"
                subtitle="The digital mailroom for your operation. Turn incoming documents into native Alloy forms."
                right={
                    <button
                        type="button"
                        onClick={() => {
                            void refreshQueue();
                            void loadAssets();
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/20 px-1.5 py-0.5 text-[11px] font-medium text-alloy-midnight/55 hover:border-alloy-stone/35"
                    >
                        <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
                    </button>
                }
            />

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {/* Work */}
                <div className="mb-4">
                    <div className={`mb-2 ${WS_EYEBROW}`}>Work</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <WorkCard
                            label="Needs review"
                            value={workCounts.needsReview || Number(counts.needs_review ?? 0)}
                            hint="Questions detected that need your review."
                            tone="amber"
                            loading={queueLoading}
                            onClick={() => onNavigate("processing")}
                        />
                        <WorkCard
                            label="Ready to generate"
                            value={workCounts.readyToGenerate}
                            hint="Reviewed and ready to create native forms."
                            tone="sky"
                            loading={queueLoading}
                            onClick={() => onNavigate("processing")}
                        />
                        <WorkCard
                            label="Ready to publish"
                            value={workCounts.readyToPublish}
                            hint="Native forms ready for final review."
                            tone="emerald"
                            loading={assetsLoading}
                            onClick={() => onNavigate("forms")}
                        />
                        <WorkCard
                            label="Completed today"
                            value={workCounts.completedToday}
                            hint="Forms finished in Processing today."
                            tone="stone"
                            loading={queueLoading}
                            onClick={() => onNavigate("processing")}
                        />
                    </div>
                </div>

                {/* Studio */}
                <div className="mb-4">
                    <div className={`mb-2 ${WS_EYEBROW}`}>Studio</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <StudioAction
                            icon={<FolderUp className="h-4 w-4" />}
                            title="Import existing form"
                            body="Upload a PDF and Alloy detects questions."
                            primary
                            onClick={() => onNavigate("documents")}
                        />
                        <StudioAction
                            icon={<Plus className="h-4 w-4" />}
                            title="Create blank form"
                            body="Build a form from scratch."
                            onClick={() => onNavigate("forms")}
                        />
                        <StudioAction
                            icon={<PackageOpen className="h-4 w-4" />}
                            title="Create packet"
                            body="Assemble forms into a packet."
                            onClick={() => onNavigate("packets")}
                        />
                        <StudioAction
                            icon={<Settings2 className="h-4 w-4" />}
                            title="Recognition templates"
                            body="Manage detection and mapping rules."
                            onClick={() => onNavigate("settings")}
                        />
                    </div>
                </div>

                {/* Recent assets */}
                <PosPanel eyebrow="Recent assets" accent={false}>
                    {assetsLoading && recentAssets.length === 0 ? (
                        <p className="text-[12px] text-alloy-midnight/45">Loading assets…</p>
                    ) : recentAssets.length === 0 ? (
                        <p className="text-[12px] text-alloy-midnight/45">
                            No forms or packets yet. Import an existing form to get started.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[28rem] text-left text-[11.5px]">
                                <thead>
                                    <tr className="border-b border-alloy-stone/15 text-[10px] uppercase tracking-wide text-alloy-midnight/45">
                                        <th className="pb-2 pr-3 font-medium">Name</th>
                                        <th className="pb-2 pr-3 font-medium">Type</th>
                                        <th className="pb-2 pr-3 font-medium">Source</th>
                                        <th className="pb-2 font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentAssets.map((a) => (
                                        <tr key={`${a.type}-${a.id}`} className="border-b border-alloy-stone/10 last:border-0">
                                            <td className="py-2 pr-3 font-medium text-alloy-midnight">{a.name}</td>
                                            <td className="py-2 pr-3 text-alloy-midnight/60">{a.type}</td>
                                            <td className="py-2 pr-3 text-alloy-midnight/60">{a.source}</td>
                                            <td className="py-2">
                                                <span
                                                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                                        a.status === "Published"
                                                            ? "bg-emerald-50 text-emerald-700"
                                                            : "bg-amber-50 text-amber-700"
                                                    }`}
                                                >
                                                    {a.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </PosPanel>

                {/* Quick path for document cases waiting */}
                {documentRows.length > 0 ? (
                    <PosPanel eyebrow="Documents waiting for review" className="mt-4">
                        <ul className="space-y-1.5">
                            {documentRows.slice(0, 5).map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => onOpenCase(r.id)}
                                        className="flex w-full items-center justify-between gap-2 rounded-md border border-alloy-stone/20 bg-white px-2.5 py-2 text-left hover:border-alloy-juniper/40 hover:bg-alloy-juniper/[0.04]"
                                    >
                                        <span className="min-w-0 truncate text-[12.5px] font-medium text-alloy-midnight">
                                            {r.sourceDisplay?.label ?? "Untitled document"}
                                        </span>
                                        <span className="shrink-0 text-[10px] font-medium text-alloy-juniper">Review →</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </PosPanel>
                ) : null}
            </div>
        </div>
    );
}

function WorkCard({
    label,
    value,
    hint,
    tone,
    loading,
    onClick,
}: {
    label: string;
    value: number;
    hint: string;
    tone: "amber" | "sky" | "emerald" | "stone";
    loading?: boolean;
    onClick: () => void;
}) {
    const toneClass =
        tone === "amber"
            ? "border-amber-200/80 bg-amber-50/60 hover:border-amber-300"
            : tone === "sky"
              ? "border-sky-200/80 bg-sky-50/50 hover:border-sky-300"
              : tone === "emerald"
                ? "border-emerald-200/80 bg-emerald-50/50 hover:border-emerald-300"
                : "border-alloy-stone/18 bg-white hover:border-alloy-stone/30";
    return (
        <button type="button" onClick={onClick} className={`rounded-lg border p-3 text-left transition-colors ${toneClass}`}>
            <div className="text-[22px] font-semibold tabular-nums text-alloy-midnight">{loading ? "…" : value}</div>
            <div className="mt-0.5 text-[12px] font-semibold text-alloy-midnight">{label}</div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-alloy-midnight/50">{hint}</p>
        </button>
    );
}

function StudioAction({
    icon,
    title,
    body,
    primary = false,
    onClick,
}: {
    icon: React.ReactNode;
    title: string;
    body: string;
    primary?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-lg border p-3 text-left transition-colors ${
                primary
                    ? "border-alloy-juniper/40 bg-alloy-juniper/[0.06] hover:border-alloy-juniper/60 hover:bg-alloy-juniper/[0.10]"
                    : "border-alloy-stone/20 bg-white hover:border-alloy-juniper/35 hover:bg-alloy-juniper/[0.04]"
            }`}
        >
            <div className="flex items-center gap-1.5 text-alloy-juniper">
                {icon}
                <span className="text-[12.5px] font-semibold text-alloy-midnight">{title}</span>
                {primary ? <Sparkles className="ml-auto h-3.5 w-3.5 text-alloy-juniper" aria-hidden /> : null}
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-alloy-midnight/50">{body}</p>
        </button>
    );
}
