import { NextRequest } from "next/server";
import { loadTourPublicResolveLabels } from "@/lib/tours/public/loadTourPublicResolveLabels";
import { tourPublicErr, tourPublicJson } from "@/lib/tours/public/tourPublicHttp";
import { guardTourActionRoute } from "@/lib/tours/public/tourActionRouteGuard";

/**
 * GET /api/public/tour-booking/[token]/resolve
 *
 * Minimal safe context for the focused no-login surface. Read-only: it accepts
 * a VIEWING credential only, so a selection-, decline- or cancel-only token
 * cannot be used to enumerate context.
 *
 * Discloses labels and status only — never a person, opportunity, process or
 * household identifier.
 */
const REQUIRED_ACTIONS = ["view_tour_slots", "view_tour_details"] as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const guard = await guardTourActionRoute({
        request,
        rawToken: raw ?? "",
        routeName: "resolve",
        requiredActions: REQUIRED_ACTIONS,
    });
    if (!guard.ok) return guard.response;

    const { auth, supabase } = guard;
    const labels = await loadTourPublicResolveLabels(supabase, auth.link);
    if ("error" in labels) return tourPublicErr(labels.error, labels.status);

    return tourPublicJson({
        ok: true,
        opportunity_label: labels.opportunity_label,
        location_label: labels.location_label,
        invitation_status: auth.invitation.status,
        // What the parent may do next, derived from the credential they hold.
        available_actions: [auth.actionKind],
    });
}
