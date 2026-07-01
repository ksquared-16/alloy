import type { ActionLinkDisplayDetails } from "@/lib/actionLinkDisplayDetails";

function formatDateTime(iso: string | null | undefined, tz: string | null | undefined): string | null {
    if (!iso) return null;
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        if (tz) {
            return d.toLocaleString(undefined, { timeZone: tz, dateStyle: "medium", timeStyle: "short" });
        }
        return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
        return iso;
    }
}

function formatWindow(start: string | null, end: string | null, tz: string | null): string | null {
    const a = formatDateTime(start, tz);
    const b = formatDateTime(end, tz);
    if (a && b) return `${a} – ${b}`;
    return a ?? b ?? null;
}

type Props = {
    details: ActionLinkDisplayDetails;
    heading?: string;
    className?: string;
};

/**
 * Shared “booking summary” block for public action links (cancel, reschedule review, vendor accept).
 */
export default function ActionLinkDetailsPanel({ details, heading = "Booking details", className = "" }: Props) {
    const when = formatWindow(details.start_at, details.end_at, details.timezone);
    const serviceBits = [details.service_label, details.visit_type].filter(Boolean).join(" · ");

    return (
        <div className={`rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] overflow-hidden ${className}`}>
            <div className="px-4 py-3 border-b border-alloy-stone/15 bg-white/60">
                <h2 className="text-xs font-semibold tracking-wide text-alloy-midnight/55">{heading}</h2>
            </div>
            <div className="px-4 py-4 space-y-4 text-sm text-alloy-midnight/85">
                {when && (
                    <div>
                        <div className="text-xs font-medium text-alloy-midnight/50 mb-0.5">Service date &amp; time</div>
                        <div className="text-alloy-midnight font-medium leading-snug">{when}</div>
                        {details.timezone && (
                            <div className="text-xs text-alloy-midnight/55 mt-1">Time zone: {details.timezone}</div>
                        )}
                    </div>
                )}

                {(details.job_title || serviceBits) && (
                    <div>
                        <div className="text-xs font-medium text-alloy-midnight/50 mb-0.5">Service</div>
                        <div className="leading-snug">
                            {details.job_title && <span className="font-medium text-alloy-midnight">{details.job_title}</span>}
                            {details.job_title && serviceBits && <span className="text-alloy-midnight/50"> · </span>}
                            {serviceBits && <span>{serviceBits}</span>}
                        </div>
                        {details.job_description && (
                            <p className="text-xs text-alloy-midnight/65 mt-1.5 leading-relaxed">{details.job_description}</p>
                        )}
                    </div>
                )}

                {details.location_summary && (
                    <div>
                        <div className="text-xs font-medium text-alloy-midnight/50 mb-0.5">Location</div>
                        <div className="leading-relaxed text-alloy-midnight">{details.location_summary}</div>
                    </div>
                )}

                {details.house_detail_lines.length > 0 && (
                    <div>
                        <div className="text-xs font-medium text-alloy-midnight/50 mb-0.5">Property</div>
                        <ul className="list-disc list-inside space-y-0.5 text-alloy-midnight/80">
                            {details.house_detail_lines.map((line, i) => (
                                <li key={i}>{line}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {details.price_display && (
                    <div className="pt-1 border-t border-alloy-stone/15">
                        <div className="text-xs font-medium text-alloy-midnight/50 mb-0.5">Price</div>
                        <div className="text-lg font-semibold text-alloy-midnight tracking-tight">{details.price_display}</div>
                    </div>
                )}

                {!when && !details.job_title && !serviceBits && !details.location_summary && !details.price_display && details.house_detail_lines.length === 0 && (
                    <p className="text-alloy-midnight/55 text-sm">No additional booking details are available for this link.</p>
                )}
            </div>
        </div>
    );
}
