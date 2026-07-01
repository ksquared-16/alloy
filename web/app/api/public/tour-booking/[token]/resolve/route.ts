import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { decodePublicTourToken, resolveTourPublicBookingLinkByToken } from "@/lib/tours/public/resolveTourPublicBookingLink";
import { loadTourPublicResolveLabels } from "@/lib/tours/public/loadTourPublicResolveLabels";
import { takeTourPublicRateLimit } from "@/lib/tours/public/tourPublicRateLimit";
import { tourPublicErr, tourPublicJson, tourPublicRateLimited } from "@/lib/tours/public/tourPublicHttp";

/** GET /api/public/tour-booking/[token]/resolve — minimal disclosure for booking UI. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return tourPublicErr("Server misconfiguration", 500);
    }
    const { token: raw } = await params;
    const token = decodePublicTourToken(raw ?? "");
    const retry = takeTourPublicRateLimit(request, "resolve", token);
    if (retry != null) {
        return tourPublicRateLimited(retry);
    }

    const supabase = createServiceRoleClient();
    const resolved = await resolveTourPublicBookingLinkByToken(supabase, token);
    if (!resolved.ok) {
        const codeMap = { NOT_FOUND: 404, INACTIVE: 403, EXPIRED: 403 };
        return tourPublicErr(resolved.error.message, codeMap[resolved.error.code] ?? 400, { code: resolved.error.code });
    }
    const labels = await loadTourPublicResolveLabels(supabase, resolved.row);
    if ("error" in labels) {
        return tourPublicErr(labels.error, labels.status);
    }
    return tourPublicJson({
        ok: true,
        opportunity_label: labels.opportunity_label,
        location_label: labels.location_label,
    });
}
