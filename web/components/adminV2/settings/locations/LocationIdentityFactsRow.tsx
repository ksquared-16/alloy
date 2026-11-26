"use client";

import { Clock, MapPin } from "lucide-react";
import {
    formatLocationLocality,
    formatLocationTimezoneLabel,
} from "@/lib/locations/locationIdentityPresentation";

/**
 * Muted place/time meta under the location hero — iconized facts, not a second title.
 */
export function LocationIdentityFactsRow({
    city,
    state,
    timezoneIana,
    testId = "locations-identity-facts",
}: {
    city?: string | null;
    state?: string | null;
    timezoneIana?: string | null;
    testId?: string;
}) {
    const locality = formatLocationLocality({ city, state });
    const timezone = formatLocationTimezoneLabel(timezoneIana);
    if (!locality && !timezone) return null;

    return (
        <div
            className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-snug text-alloy-midnight/50"
            data-testid={testId}
        >
            {locality ?
                <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0 text-alloy-midnight/40" strokeWidth={2} aria-hidden />
                    <span>{locality}</span>
                </span>
            :   null}
            {timezone ?
                <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 shrink-0 text-alloy-midnight/40" strokeWidth={2} aria-hidden />
                    <span>{timezone}</span>
                </span>
            :   null}
        </div>
    );
}
