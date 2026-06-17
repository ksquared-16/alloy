"use client";

/**
 * POS → Documents (prototype surface).
 *
 * Shows the two intended document intake workflows so the product story is
 * visible end-to-end:
 *   A. Document → Data    (extract values → open a Processing case → approve)
 *   B. Document → Form    (read structure → draft a form → publish)
 *
 * Storage + upload foundations already exist (`POST /api/admin/documents/upload`,
 * Supabase bucket `org_documents`). AI extraction / structure detection are NOT
 * wired yet — these actions are clearly marked Prototype and route the operator
 * to the relevant POS section so the flow is demonstrable today.
 */

import { ArrowRight, FileSearch, FileUp, Sparkles } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { PosSection } from "./posSections";

function WorkflowCard({
    badge,
    title,
    steps,
    cta,
    onCta,
    icon,
}: {
    badge: string;
    title: string;
    steps: string[];
    cta: string;
    onCta: () => void;
    icon: ReactNode;
}) {
    return (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-stone-700">
                    {icon}
                    <span className="text-sm font-semibold text-stone-900">{title}</span>
                </span>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">{badge}</span>
            </div>
            <ol className="mb-3 space-y-1">
                {steps.map((s, i) => (
                    <li key={s} className="flex items-center gap-2 text-[12px] text-stone-600">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-500">
                            {i + 1}
                        </span>
                        {s}
                        {i < steps.length - 1 ? <ArrowRight className="h-3 w-3 text-stone-300" aria-hidden /> : null}
                    </li>
                ))}
            </ol>
            <button
                type="button"
                onClick={onCta}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
                {cta}
            </button>
        </div>
    );
}

export default function PosDocumentsPanel({ onNavigate }: { onNavigate: (section: PosSection) => void }) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

    async function handleFile(file: File) {
        setUploading(true);
        setStatus(null);
        try {
            const form = new FormData();
            form.append("file", file);
            // POS document intake: open a Processing Case; no CRM entity required.
            form.append("open_processing_case", "true");
            const res = await fetch("/api/admin/documents/upload", {
                method: "POST",
                credentials: "same-origin",
                body: form,
            });
            const body = (await res.json().catch(() => ({}))) as {
                error?: string;
                processing_case_id?: string | null;
                classification_key?: string | null;
            };
            if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
            setStatus({
                kind: "ok",
                message: body.processing_case_id
                    ? `Uploaded — Processing case opened${body.classification_key ? ` · ${body.classification_key}` : ""}.`
                    : "Uploaded.",
            });
        } catch (e) {
            setStatus({ kind: "error", message: e instanceof Error ? e.message : "Upload failed" });
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="h-full overflow-y-auto bg-white p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-stone-900">Documents</h3>
                    <p className="mt-0.5 text-xs text-stone-500">
                        Upload a document and let Alloy turn it into data or a form. Storage is live; extraction is being wired.
                    </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleFile(f);
                            e.target.value = "";
                        }}
                    />
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#00A283] px-3 py-2 text-xs font-semibold text-white hover:bg-[#009276] disabled:opacity-60"
                    >
                        <FileUp className="h-3.5 w-3.5" aria-hidden />
                        {uploading ? "Uploading…" : "Upload Document"}
                    </button>
                    {status ? (
                        <span className={`text-[11px] ${status.kind === "ok" ? "text-emerald-700" : "text-amber-700"}`}>
                            {status.message}
                        </span>
                    ) : null}
                </div>
            </div>

            <div className="mb-4 grid gap-3 lg:grid-cols-2">
                <WorkflowCard
                    icon={<FileSearch className="h-4 w-4" />}
                    title="Document → Data"
                    badge="Prototype"
                    steps={["Upload", "Extract values", "Open Processing case", "Review", "Approve"]}
                    cta="See it in Processing"
                    onCta={() => onNavigate("processing")}
                />
                <WorkflowCard
                    icon={<Sparkles className="h-4 w-4" />}
                    title="Document → Form"
                    badge="Prototype"
                    steps={["Upload", "Read structure", "Draft form", "Review", "Publish"]}
                    cta="See it in Forms"
                    onCta={() => onNavigate("forms")}
                />
            </div>

            <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50/60 p-4 text-[12px] leading-relaxed text-stone-500">
                <span className="font-medium text-stone-600">Foundations in place:</span> document storage, upload API, and signed-url
                reads already exist. Extracted documents will open a Processing case (source kind <code className="rounded bg-stone-100 px-1 text-[11px]">document</code>)
                so they appear in the queue alongside form and packet intake — no separate inbox.
            </div>
        </div>
    );
}
