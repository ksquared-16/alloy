"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import {
    communicationTemplateDraftSeedFromPreview,
    fetchCommunicationTemplateCurrentVersion,
    type CommunicationTemplateDraftSeed,
} from "@/lib/communications/v2/communicationTemplateDraftSeed";
import type { TemplateChannel } from "@/lib/communications/v2/templateSchema";

const TEMPLATES_API = "/api/admin/communications/templates";

type TemplateOption = { id: string; name: string; channel: TemplateChannel };

/**
 * Template ▾ in the composer toolbar — the existing Template Library, applied to the draft.
 *
 * It sits with the editor actions rather than beside Email / SMS because it acts on CONTENT, not on
 * transport. Applying one resolves the template's CURRENT version and copies it into the editable
 * subject/body (`communicationTemplateDraftSeed`, the same helper Compose New and Announcements
 * use). Nothing is sent and nothing is linked: the operator edits the copy freely afterwards, and
 * the send is the composer's ordinary send.
 */
export default function ComposerTemplateMenu({
    channel,
    buttonClassName,
    onApply,
}: {
    channel: "email" | "sms";
    buttonClassName: string;
    onApply: (seed: CommunicationTemplateDraftSeed) => void;
}) {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<TemplateOption[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    // Loaded on first open only — the composer paints without a template round trip.
    useEffect(() => {
        if (!open || options !== null) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(`${TEMPLATES_API}?status=active`, { credentials: "include" });
                const json = (await res.json().catch(() => ({}))) as { templates?: Record<string, unknown>[] };
                if (cancelled) return;
                if (!res.ok || !Array.isArray(json.templates)) {
                    setOptions([]);
                    setError("Templates are unavailable.");
                    return;
                }
                setOptions(
                    json.templates
                        .map((t) => ({
                            id: String(t.id),
                            name: String(t.name ?? ""),
                            channel: String(t.channel ?? "") as TemplateChannel,
                        }))
                        .filter((t) => t.channel === "email" || t.channel === "sms"),
                );
            } catch {
                if (!cancelled) {
                    setOptions([]);
                    setError("Templates are unavailable.");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, options]);

    const apply = useCallback(
        async (templateId: string) => {
            setBusy(true);
            setError(null);
            try {
                const preview = await fetchCommunicationTemplateCurrentVersion(TEMPLATES_API, templateId);
                if (!preview) throw new Error("Failed to load template");
                onApply(communicationTemplateDraftSeedFromPreview(preview, channel));
                setOpen(false);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to apply template");
            } finally {
                setBusy(false);
            }
        },
        [channel, onApply],
    );

    const channelOptions = (options ?? []).filter((t) => t.channel === channel);

    return (
        <div className="relative" ref={rootRef} data-cc-template-menu="true">
            <button
                type="button"
                aria-label="Template"
                aria-expanded={open}
                aria-haspopup="menu"
                data-cc-template-trigger="true"
                disabled={busy}
                onClick={() => setOpen((v) => !v)}
                className={`${buttonClassName} inline-flex items-center gap-0.5 px-1.5 text-[11px] font-medium`}
            >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Template
                <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
            </button>
            {open ? (
                <div
                    role="menu"
                    data-cc-template-menu-panel="true"
                    className="absolute right-0 top-full z-30 mt-1 max-h-64 w-60 overflow-auto rounded-lg border border-alloy-stone/30 bg-white py-1 shadow-md"
                >
                    {options === null ? (
                        <p className="px-3 py-1.5 text-[11px] text-alloy-midnight/50">Loading templates…</p>
                    ) : channelOptions.length === 0 ? (
                        <p className="px-3 py-1.5 text-[11px] text-alloy-midnight/50">
                            {error ?? `No active ${channel === "sms" ? "SMS" : "email"} templates.`}
                        </p>
                    ) : (
                        channelOptions.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                role="menuitem"
                                data-cc-template-option={t.id}
                                disabled={busy}
                                onClick={() => void apply(t.id)}
                                className="block w-full truncate px-3 py-1.5 text-left text-[12px] text-alloy-midnight hover:bg-alloy-juniper/10 hover:text-alloy-juniper disabled:opacity-40"
                            >
                                {t.name || "Untitled template"}
                            </button>
                        ))
                    )}
                    {error && channelOptions.length > 0 ? (
                        <p className="border-t border-alloy-stone/15 px-3 py-1.5 text-[11px] text-alloy-ember" role="status">
                            {error}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
