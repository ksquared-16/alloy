"use client";

import { ClipboardPaste, Eraser, FileText, Mail, MessageSquare, PenLine, Phone, Plus, Upload, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { BosRevealSequence } from "@/app/adminV2/components/bos/identity/BosRevealSequence";
import type { CreateLeadMaterialCard } from "@/lib/admin/actions/createLeadOperationalIntakeModel";

type Props = {
    material: CreateLeadMaterialCard | null;
    pasteDraft: string;
    onPasteDraftChange: (value: string) => void;
    onCommitPaste: () => void;
    onRemoveMaterial: () => void;
    onAnalyze: () => void;
    analyzing: boolean;
    disabled?: boolean;
    analyzeError?: string | null;
    composerOpen: boolean;
    onComposerOpenChange: (open: boolean) => void;
    manualMode: boolean;
    onEnterManually: () => void;
    onClearMaterial: () => void;
    onAddSource: () => void;
    hasMaterial: boolean;
};

const INTAKE_ACTIONS: Array<{ icon: LucideIcon; label: string; hint: string; enabled: boolean }> = [
    { icon: ClipboardPaste, label: "Paste inquiry text", hint: "Email, web form, or notes", enabled: true },
    { icon: Mail, label: "Drop email", hint: "Coming soon", enabled: false },
    { icon: Phone, label: "Add call note", hint: "Coming soon", enabled: false },
    { icon: Upload, label: "Upload source", hint: "Coming soon", enabled: false },
    { icon: MessageSquare, label: "Type details", hint: "Coming soon", enabled: false },
    { icon: FileText, label: "Website form", hint: "Coming soon", enabled: false },
];

function materialStatusLabel(status: CreateLeadMaterialCard["status"]): string {
    if (status === "reading") return "Reading";
    if (status === "read") return "Read";
    return "Unread";
}

export function CreateLeadMaterialStackColumn({
    material,
    pasteDraft,
    onPasteDraftChange,
    onCommitPaste,
    onRemoveMaterial,
    onAnalyze,
    analyzing,
    disabled = false,
    analyzeError = null,
    composerOpen,
    onComposerOpenChange,
    manualMode,
    onEnterManually,
    onClearMaterial,
    onAddSource,
    hasMaterial,
}: Props) {
    const [localDraft, setLocalDraft] = useState("");

    const openComposer = () => {
        setLocalDraft(pasteDraft);
        onComposerOpenChange(true);
    };

    const commitComposer = () => {
        onPasteDraftChange(localDraft);
        onCommitPaste();
        onComposerOpenChange(false);
    };

    return (
        <section
            className="flex min-h-0 flex-col border-r border-alloy-stone/10 bg-[#FAFBFC]"
            data-create-lead-column="material"
            data-testid="create-lead-material-stack"
        >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-alloy-stone/10 px-4 py-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/40">
                        Intake
                    </p>
                    <p className="mt-0.5 text-[12px] text-alloy-midnight/45">
                        {material ? "1 source" : "Add source material"}
                    </p>
                </div>
                {material && material.status === "unread" && !analyzing ?
                    <button
                        type="button"
                        disabled={disabled || analyzing}
                        onClick={onAnalyze}
                        className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-1.5 text-[11px] font-semibold text-alloy-midnight/65 transition-colors hover:border-alloy-stone/25 hover:bg-[#FAFBFC] disabled:opacity-50"
                        data-testid="action-workspace-analyze-button"
                    >
                        Analyze
                    </button>
                :   null}
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
                {analyzing ?
                    <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#FAFBFC]/90 backdrop-blur-[1px]">
                        <BosRevealSequence
                            mode="working"
                            message="Analyzing inquiry with BOS…"
                            active={analyzing}
                            markSize="md"
                            data-testid="action-workspace-paste-analyzing"
                        />
                    </div>
                :   null}

                {!material && !composerOpen ?
                    <div className="flex h-full min-h-[16rem] flex-col gap-3">
                        <p className="text-[13px] font-medium text-alloy-midnight/70">Add inquiry material</p>
                        <div className="grid gap-2">
                            {INTAKE_ACTIONS.map((action) => {
                                const Icon = action.icon;
                                return (
                                    <button
                                        key={action.label}
                                        type="button"
                                        disabled={!action.enabled || disabled}
                                        onClick={() => {
                                            if (action.enabled) openComposer();
                                        }}
                                        className="flex items-center gap-3 rounded-xl border border-alloy-stone/12 bg-white px-3.5 py-3 text-left transition-colors hover:border-alloy-stone/20 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                                        data-testid={
                                            action.enabled ? "create-lead-add-material-button" : undefined
                                        }
                                    >
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloy-stone/10 text-alloy-midnight/45">
                                            <Icon className="h-4 w-4" strokeWidth={1.75} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[13px] font-medium text-alloy-midnight">
                                                {action.label}
                                            </span>
                                            <span className="mt-0.5 block text-[11px] text-alloy-midnight/45">
                                                {action.hint}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                :   null}

                {composerOpen ?
                    <div
                        className="rounded-xl border border-[#00A283]/18 bg-white p-3 shadow-[0_2px_12px_rgba(15,35,52,0.04)]"
                        data-testid="create-lead-material-composer"
                    >
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[12px] font-semibold text-alloy-midnight">Paste inquiry material</p>
                            <button
                                type="button"
                                onClick={() => onComposerOpenChange(false)}
                                className="rounded-md p-1 text-alloy-midnight/40 hover:bg-alloy-stone/10 hover:text-alloy-midnight/70"
                                aria-label="Close composer"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        <textarea
                            value={localDraft}
                            onChange={(e) => setLocalDraft(e.target.value)}
                            disabled={disabled || analyzing}
                            rows={6}
                            className="w-full resize-none rounded-lg border border-alloy-stone/12 bg-[#FAFBFC] px-3 py-2.5 text-[13px] leading-relaxed text-alloy-midnight placeholder:text-alloy-midnight/30 focus:outline-none focus:ring-2 focus:ring-[#00A283]/12 disabled:opacity-60"
                            placeholder={
                                "Parent: Jordan Lee\nEmail: jordan@example.com\nPhone: (555) 123-4567\nChild: Riley Lee\nProgram: Toddler Room"
                            }
                            data-testid="action-workspace-paste-textarea"
                        />
                        <div className="mt-2 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => onComposerOpenChange(false)}
                                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-alloy-midnight/55 hover:bg-alloy-stone/10"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={!localDraft.trim() || disabled}
                                onClick={commitComposer}
                                className="rounded-lg border border-[#00A283]/25 bg-[#00A283]/10 px-3 py-1.5 text-[11px] font-semibold text-[#007A63] hover:bg-[#00A283]/15 disabled:opacity-50"
                                data-testid="create-lead-commit-material-button"
                            >
                                Add to stack
                            </button>
                        </div>
                    </div>
                :   null}

                {material && !composerOpen ?
                    <article
                        className="rounded-xl border border-alloy-stone/12 bg-white p-3.5 shadow-[0_1px_0_rgba(15,35,52,0.03)]"
                        data-testid="create-lead-material-card"
                        data-material-status={material.status}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                    {material.label}
                                </p>
                                <p className="mt-1 text-[11px] font-medium text-[#007A63]">
                                    {materialStatusLabel(material.status)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onRemoveMaterial}
                                disabled={analyzing}
                                className="rounded-md p-1 text-alloy-midnight/35 hover:bg-alloy-stone/10 hover:text-alloy-midnight/70 disabled:opacity-40"
                                aria-label="Remove material"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        <p className="mt-2 max-h-40 overflow-hidden whitespace-pre-wrap text-[13px] leading-relaxed text-alloy-midnight/75">
                            {material.snippet}
                        </p>
                    </article>
                :   null}

                {analyzeError ?
                    <p
                        className="mt-3 rounded-xl border border-alloy-ember/20 bg-alloy-ember/5 px-3 py-2 text-[12px] text-alloy-ember"
                        role="alert"
                    >
                        {analyzeError}
                    </p>
                :   null}
            </div>

            <div className="shrink-0 space-y-1 border-t border-alloy-stone/10 px-4 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-alloy-midnight/35">
                    Actions
                </p>
                <button
                    type="button"
                    onClick={onEnterManually}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition-colors ${
                        manualMode ?
                            "bg-white text-alloy-midnight shadow-sm"
                        :   "text-alloy-midnight/60 hover:bg-white hover:text-alloy-midnight"
                    }`}
                    data-testid="create-lead-enter-manually-button"
                >
                    <PenLine className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                    Enter manually
                </button>
                <button
                    type="button"
                    onClick={onClearMaterial}
                    disabled={!hasMaterial}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-alloy-midnight/60 transition-colors hover:bg-white hover:text-alloy-midnight disabled:opacity-40"
                    data-testid="create-lead-clear-material-button"
                >
                    <Eraser className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                    Clear material
                </button>
                <button
                    type="button"
                    onClick={onAddSource}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-alloy-midnight/60 transition-colors hover:bg-white hover:text-alloy-midnight"
                    data-testid="create-lead-add-source-button"
                >
                    <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                    Add another source
                </button>
            </div>
        </section>
    );
}
