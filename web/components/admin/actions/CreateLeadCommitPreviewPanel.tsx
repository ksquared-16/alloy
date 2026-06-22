"use client";

import type { CreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";

type Props = {
    preview: CreateLeadCommitPreview;
    className?: string;
};

function PreviewList({
    title,
    items,
    tone,
    testId,
}: {
    title: string;
    items: CreateLeadCommitPreview["will_create"];
    tone: "create" | "defer";
    testId: string;
}) {
    if (items.length === 0) return null;
    return (
        <div data-testid={testId}>
            <p
                className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                    tone === "create" ? "text-[#007A63]" : "text-alloy-midnight/45"
                }`}
            >
                {title}
            </p>
            <ul className="mt-1.5 space-y-1">
                {items.map((item) => (
                    <li
                        key={`${item.label}:${item.detail ?? ""}`}
                        className="text-[12px] text-alloy-midnight/75"
                        data-testid={`create-lead-commit-preview-item-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                        <span className="font-medium text-alloy-midnight/85">{item.label}</span>
                        {item.detail ?
                            <span className="text-alloy-midnight/55"> — {item.detail}</span>
                        :   null}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Pre-commit scope summary — what Create Lead will and will not persist today. */
export function CreateLeadCommitPreviewPanel({ preview, className = "" }: Props) {
    if (preview.will_create.length === 0 && preview.not_created.length === 0) return null;

    return (
        <section
            className={`rounded-xl border border-alloy-stone/10 bg-[#FAFBFC] p-3 ${className}`}
            data-testid="create-lead-commit-preview-panel"
        >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/45">
                Commit preview
            </p>
            <div className="mt-3 space-y-3">
                <PreviewList
                    title="Will create / link now"
                    items={preview.will_create}
                    tone="create"
                    testId="create-lead-commit-preview-will-create"
                />
                <PreviewList
                    title="Needs review / excluded"
                    items={preview.not_created}
                    tone="defer"
                    testId="create-lead-commit-preview-not-created"
                />
            </div>
        </section>
    );
}
