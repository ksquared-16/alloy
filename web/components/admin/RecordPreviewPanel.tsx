"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminPreview } from "@/contexts/AdminPreviewContext";
import { useAdminDrawer, type AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDate, formatDateTime, formatPhoneUS } from "@/lib/adminFormatters";
import { ExternalLink } from "lucide-react";

const PANEL_WIDTH = 340;
const GAP = 8;

function useEntityPreview(type: AdminDrawerEntityType | null, id: string | null) {
    const [data, setData] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!type || !id || id === "new") {
            setData(null);
            setLoading(false);
            setError(null);
            return;
        }
        setLoading(true);
        setError(null);
        fetch(`/api/admin/entity/${type}/${id}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
            .then((json) => {
                setData(json);
                setError(null);
            })
            .catch((e) => {
                setError(e?.message ?? "Failed to load");
                setData(null);
            })
            .finally(() => setLoading(false));
    }, [type, id]);

    return { data, loading, error };
}

function PreviewContent({
    type,
    data,
    loading,
    error,
    onOpenFull,
}: {
    type: AdminDrawerEntityType;
    data: Record<string, unknown> | null;
    loading: boolean;
    error: string | null;
    onOpenFull: () => void;
}) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-10 text-sm text-alloy-muted">
                Loading…
            </div>
        );
    }
    if (error || !data) {
        return (
            <div className="py-6 px-4 text-center">
                <p className="text-sm text-alloy-muted">{error ?? "Not found"}</p>
                <button
                    type="button"
                    onClick={onOpenFull}
                    className="mt-3 text-sm font-medium text-alloy-pine hover:text-alloy-pine/80 focus:outline-none focus:ring-2 focus:ring-alloy-pine/30 rounded"
                >
                    Open full record
                </button>
            </div>
        );
    }

    const d = data as Record<string, unknown>;
    const name = (d.name as string) ?? (d.title as string) ?? null;
    const firstName = (d.first_name as string) ?? "";
    const lastName = (d.last_name as string) ?? "";
    const personName = [firstName, lastName].filter(Boolean).join(" ") || (d.display_name as string) || name || "—";
    const statusKey = (d.status_key as string) ?? (d.status as string) ?? null;
    const statusLabel = (d.status as string) ?? statusKey;

    const summaryLines: { icon?: string; line: React.ReactNode }[] = [];

    switch (type) {
        case "customers": {
            const contact = (d._primary_contact_name as string) || (d._primary_person_name as string);
            const email = (d._customer_email as string) || (d._primary_contact_email as string) || (d._primary_person_email as string);
            const phone = (d._customer_phone as string) || (d._primary_contact_phone as string) || (d._primary_person_phone as string);
            if (contact) summaryLines.push({ line: contact });
            if (email || phone) summaryLines.push({ line: email ? `${email}${phone ? ` · ${formatPhoneUS(phone)}` : ""}` : formatPhoneUS(phone) });
            const jobs = d._active_jobs_count;
            const opps = d._open_opportunities_count;
            if (typeof jobs === "number" || typeof opps === "number") {
                summaryLines.push({ line: `Jobs ${Number(jobs) || 0} · Opportunities ${Number(opps) || 0}` });
            }
            break;
        }
        case "persons": {
            const email = (d.email as string) ?? "";
            const phone = (d.phone as string) ?? "";
            if (email) summaryLines.push({ line: email });
            if (phone) summaryLines.push({ line: formatPhoneUS(phone) });
            break;
        }
        case "jobs": {
            const customerName = (d._customer_name as string) ?? (d.customer_id as string) ?? "—";
            const scheduled = d.scheduled_at ? formatDateTime(d.scheduled_at as string) : null;
            summaryLines.push({ line: customerName });
            if (scheduled) summaryLines.push({ line: scheduled });
            const gross = d.gross_price_cents;
            if (gross != null && typeof gross === "number") {
                summaryLines.push({ line: `$${(gross / 100).toFixed(2)}` });
            }
            break;
        }
        case "opportunities": {
            const customerName = (d._customer_name as string) ?? "—";
            const stage = (d._pipeline_stage_name as string) ?? (d.pipeline_stage_id as string);
            const jobDate = (d.job_date as string) ? formatDate((d.job_date as string).slice(0, 10)) : null;
            summaryLines.push({ line: customerName });
            if (stage) summaryLines.push({ line: stage });
            if (jobDate) summaryLines.push({ line: jobDate });
            break;
        }
        case "vendors": {
            const company = (d.company_name as string) ?? "";
            const email = (d.email as string) ?? "";
            const phone = (d.phone as string) ?? "";
            if (company) summaryLines.push({ line: company });
            if (email || phone) summaryLines.push({ line: email ? `${email}${phone ? ` · ${formatPhoneUS(phone)}` : ""}` : formatPhoneUS(phone) });
            break;
        }
        case "schedules": {
            const job = d._job as { title?: string | null } | null | undefined;
            const jobTitle = (d._job_title as string) ?? job?.title ?? (d.job_id as string) ?? "—";
            const start = d.start_at ? formatDateTime(d.start_at as string) : null;
            const end = d.end_at ? formatDateTime(d.end_at as string) : null;
            summaryLines.push({ line: jobTitle });
            if (start) summaryLines.push({ line: end ? `${start} – ${end}` : start });
            if (d.canceled_at) summaryLines.push({ line: "Canceled" });
            break;
        }
        default: {
            const email = typeof d.email === "string" ? d.email : undefined;
            const phone = typeof d.phone === "string" ? d.phone : undefined;
            if (email) summaryLines.push({ line: email });
            if (phone) summaryLines.push({ line: formatPhoneUS(phone) });
        }
    }

    const title = type === "persons" ? personName : (name ?? personName ?? "—");

    return (
        <div className="space-y-4">
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-alloy-forge truncate pr-2">{title}</h3>
                    {statusKey != null && statusLabel != null && (
                        <StatusBadge label={statusLabel} variant={getStatusVariant(statusKey)} />
                    )}
                </div>
                {summaryLines.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-alloy-midnight/85">
                        {summaryLines.map((s, i) => (
                            <li key={i} className="leading-snug">{s.line}</li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="pt-2 border-t border-admin-border flex justify-end">
                <button
                    type="button"
                    onClick={onOpenFull}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-alloy-pine text-white hover:bg-alloy-pine/90 focus:outline-none focus:ring-2 focus:ring-alloy-pine focus:ring-offset-1 transition-colors"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open full record
                </button>
            </div>
        </div>
    );
}

export default function RecordPreviewPanel() {
    const { preview, closePreview } = useAdminPreview();
    const { openDrawer } = useAdminDrawer();
    const panelRef = useRef<HTMLDivElement>(null);
    const { data, loading, error } = useEntityPreview(preview?.type ?? null, preview?.id ?? null);

    const openFull = useCallback(() => {
        if (preview) {
            openDrawer({ type: preview.type, id: preview.id });
            closePreview();
        }
    }, [preview, openDrawer, closePreview]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                closePreview();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") closePreview();
        };
        if (preview) {
            document.addEventListener("mousedown", handleClick);
            document.addEventListener("keydown", handleEscape);
        }
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [preview, closePreview]);

    if (!preview) return null;

    const { anchor } = preview;
    const rightSpace = typeof window !== "undefined" ? window.innerWidth - anchor.right : 400;
    const left = rightSpace >= PANEL_WIDTH + GAP ? anchor.right + GAP : anchor.left - PANEL_WIDTH - GAP;
    let top = anchor.top;
    if (typeof window !== "undefined") {
        const maxBottom = window.innerHeight - 24;
        if (top + 320 > maxBottom) top = Math.max(24, maxBottom - 320);
        if (top < 24) top = 24;
    }

    const panel = (
        <div
            ref={panelRef}
            role="dialog"
            aria-label="Record preview"
            className="fixed z-[100] rounded-xl border border-admin-border border-l-4 border-l-alloy-pine bg-admin-surface-card shadow-xl overflow-hidden transition-shadow duration-150"
            style={{
                left,
                top,
                width: PANEL_WIDTH,
                maxHeight: "calc(100vh - 48px)",
            }}
        >
            <div className="p-4 overflow-y-auto max-h-[min(420px,calc(100vh-56px))]">
                <PreviewContent
                    type={preview.type}
                    data={data}
                    loading={loading}
                    error={error}
                    onOpenFull={openFull}
                />
            </div>
        </div>
    );

    if (typeof document !== "undefined" && document.body) {
        return createPortal(panel, document.body);
    }
    return panel;
}
