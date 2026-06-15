"use client";

import { BosButton } from "@/app/adminV2/components/bos/identity/BosButton";
import { BosRevealSequence } from "@/app/adminV2/components/bos/identity/BosRevealSequence";
import { BOS_PASTE_CANVAS_MIN_HEIGHT } from "@/lib/admin/actions/bosWorkspaceShell";

type Props = {
    pasteText: string;
    onPasteTextChange: (value: string) => void;
    onAnalyze: () => void;
    analyzing?: boolean;
    disabled?: boolean;
    analyzeError?: string | null;
    hero?: boolean;
    sectionTitle?: string;
    sectionHint?: string;
};

export function ActionWorkspacePasteCanvas({
    pasteText,
    onPasteTextChange,
    onAnalyze,
    analyzing = false,
    disabled = false,
    analyzeError = null,
    hero = false,
    sectionTitle = "Tell BOS about the family",
    sectionHint = "Paste an email, call note, or web inquiry.",
}: Props) {
    const heroMinHeight = `min(${BOS_PASTE_CANVAS_MIN_HEIGHT}px, 36vh)`;
    const minHeight = hero ? heroMinHeight : 220;

    return (
        <section
            className="flex h-full min-h-0 w-full flex-col gap-3"
            data-testid="action-workspace-paste-canvas"
        >
            <div className="shrink-0">
                <h3 className="text-[17px] font-semibold tracking-tight text-alloy-midnight">
                    {sectionTitle}
                </h3>
                <p className="mt-1 text-[13px] text-alloy-midnight/50">{sectionHint}</p>
            </div>

            <div
                className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/10 bg-[#FAFBFC] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(15,35,52,0.04)]"
                style={{ minHeight: hero ? `calc(${heroMinHeight} + 8px)` : undefined }}
            >
                {analyzing ?
                    <div className="absolute inset-0 z-[1] flex items-center justify-center rounded-[14px] bg-white/88 backdrop-blur-[1px]">
                        <BosRevealSequence
                            mode="working"
                            message="Analyzing inquiry with BOS…"
                            active={analyzing}
                            markSize="lg"
                            data-testid="action-workspace-paste-analyzing"
                        />
                    </div>
                :   null}
                <textarea
                    value={pasteText}
                    onChange={(e) => onPasteTextChange(e.target.value)}
                    disabled={disabled || analyzing}
                    className="min-h-0 w-full flex-1 resize-none rounded-[14px] border-0 bg-white px-5 py-4 text-[15px] leading-[1.65] text-alloy-midnight shadow-[0_1px_2px_rgba(15,35,52,0.03)] placeholder:text-alloy-midnight/30 focus:outline-none focus:ring-2 focus:ring-[#00A283]/12 disabled:opacity-60"
                    style={{ minHeight: hero ? minHeight : undefined }}
                    placeholder={
                        "Paste email, call note, or web inquiry…\n\nParent: Jordan Lee\nEmail: jordan@example.com\nPhone: (555) 123-4567\nChild: Riley Lee\nProgram: Toddler Room"
                    }
                    data-testid="action-workspace-paste-textarea"
                />
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
                <BosButton
                    variant="primary"
                    size="md"
                    label={analyzing ? "Analyzing…" : "Analyze with BOS"}
                    disabled={disabled || analyzing || !pasteText.trim()}
                    onClick={onAnalyze}
                    data-testid="action-workspace-analyze-button"
                />
            </div>

            {analyzeError ?
                <p
                    className="shrink-0 rounded-xl border border-alloy-ember/20 bg-alloy-ember/5 px-4 py-2.5 text-[12px] text-alloy-ember"
                    role="alert"
                >
                    {analyzeError}
                </p>
            :   null}
        </section>
    );
}
