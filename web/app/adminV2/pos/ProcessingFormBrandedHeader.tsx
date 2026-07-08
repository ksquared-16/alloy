"use client";

import type { ProcessingFormBranding } from "@/lib/forms/processingFormBranding";
import { DEFAULT_FORM_ACCENT } from "@/lib/forms/processingFormBranding";

export default function ProcessingFormBrandedHeader({
    title,
    branding,
    runtime,
}: {
    title: string;
    branding: ProcessingFormBranding;
    runtime?: boolean;
}) {
    const accent = branding.accent_color || DEFAULT_FORM_ACCENT;
    const brandLabel = branding.brand_name.trim() || "Your school";

    return (
        <header
            className="overflow-hidden rounded-xl border border-alloy-stone/15 bg-white shadow-sm"
            data-testid="form-branded-header"
        >
            <div className="h-1.5" style={{ backgroundColor: accent }} aria-hidden />
            <div className="flex items-start gap-3 px-5 py-4">
                <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.06] text-[11px] font-bold uppercase tracking-wide text-alloy-midnight/35"
                    aria-hidden
                >
                    {branding.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={branding.logo_url} alt="" className="h-full w-full rounded-lg object-cover" />
                    ) : (
                        brandLabel.slice(0, 2)
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
                        {brandLabel}
                    </p>
                    <h2 className="mt-0.5 text-[18px] font-bold tracking-tight text-alloy-midnight">{title}</h2>
                    {branding.description ? (
                        <p className="mt-1 text-[12px] leading-snug text-alloy-midnight/55">{branding.description}</p>
                    ) : null}
                    {runtime ? (
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Published form
                        </p>
                    ) : (
                        <p className="mt-2 text-[10px] font-medium text-alloy-midnight/40">Preview — what families complete</p>
                    )}
                </div>
            </div>
        </header>
    );
}
