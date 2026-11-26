import { Suspense } from "react";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { buildPublicFormResolvePayload } from "@/lib/public/forms/buildPublicFormResolvePayload";
import { embedOriginFromHeaders } from "@/lib/public/forms/embedOrigin";
import { participantBrandFromEffective, type ParticipantBrand } from "@/lib/public/forms/participantBrandTheme";
import { loadPublicBrandLayers } from "@/lib/branding/loadPublicBrand";
import { PUBLIC_TOUR_CTA_DEFAULT, resolveEffectivePublicBrand, tourBrandUsesForm } from "@/lib/branding/publicBrand";
import {
    PUBLIC_TOUR_CALENDAR_UNAVAILABLE_MESSAGE,
    resolvePublicTourCalendar,
} from "@/lib/tours/publicCalendar/publicTourCalendarServer";
import PublicTourJourneyClient from "./PublicTourJourneyClient";

export const dynamic = "force-dynamic";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

function Unavailable() {
    return (
        <main className="mx-auto max-w-md space-y-3 p-6 pt-16" data-testid="public-tour-unavailable">
            <h1 className="text-xl font-semibold text-alloy-midnight">Tour booking unavailable</h1>
            <p className="text-[15px] leading-relaxed text-alloy-midnight/70">
                {PUBLIC_TOUR_CALENDAR_UNAVAILABLE_MESSAGE} Please contact the school directly.
            </p>
        </main>
    );
}

/**
 * `/tours/[token]` — a school's public tour calendar and lead form (S7), standalone or framed
 * on the school's website.
 *
 * Resolved on the SERVER: the token must name an active, location-scoped intake link that
 * publishes a tour calendar, for an active location with a tour schedule, and — when the link
 * names allowed embed origins — be framed only by those (the same Referer rule as
 * `/forms/embed`). Anything else renders one non-committal sentence; a probe cannot tell an
 * unknown token from an unpublished one. The browser receives the brand, the location's name
 * and zone, and the published form — no organization or location id, no capacity, no booking.
 */
export default async function PublicTourPage({ params }: { params: Promise<{ token: string }> }) {
    const { token: raw } = await params;
    const token = plaintextToken(raw ?? "");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return <Unavailable />;

    const h = await headers();
    const origin = embedOriginFromHeaders((name) => h.get(name));
    const supabase = createServiceRoleClient();

    let calendar: Awaited<ReturnType<typeof resolvePublicTourCalendar>>;
    try {
        calendar = await resolvePublicTourCalendar(supabase, token, { embedOrigin: origin });
    } catch {
        return <Unavailable />;
    }
    if (!calendar.ok) return <Unavailable />;

    let initialResolve: Record<string, unknown> | null = null;
    try {
        const resolved = await buildPublicFormResolvePayload(supabase, token, origin);
        if (resolved.ok) initialResolve = resolved.data;
    } catch {
        /* the form runtime fetches on its own */
    }
    /*
     * The TOUR's brand (`resolveTourPublicBrand`): the school's own — location → organization →
     * platform — on the calendar AND on the form step inside the tour. The attached form's published
     * brand leads only where the school explicitly chose `tour_brand_source: "form"`; then it is the
     * form's resolve brand, exactly as on the form's own link. The form's configuration is not touched.
     */
    const formBrand = (initialResolve?.brand ?? null) as ParticipantBrand | null;
    let brand: ParticipantBrand | null = formBrand;
    let ctaLabel = PUBLIC_TOUR_CTA_DEFAULT;
    try {
        const layers = await loadPublicBrandLayers(supabase, { orgId: calendar.value.orgId, locationId: calendar.value.locationId });
        const school = resolveEffectivePublicBrand(layers);
        ctaLabel = school.tourCtaLabel;
        if (!tourBrandUsesForm(layers)) brand = participantBrandFromEffective(school);
    } catch {
        /* the platform defaults never break the page */
    }
    if (initialResolve && brand !== formBrand) initialResolve = { ...initialResolve, brand };

    return (
        <Suspense fallback={null}>
            <PublicTourJourneyClient
                token={raw ?? ""}
                brand={brand}
                ctaLabel={ctaLabel}
                locationLabel={calendar.value.locationLabel}
                locationAddress={calendar.value.locationAddress}
                timezone={calendar.value.timezone}
                initialResolve={initialResolve}
                formBrandOverride={brand !== formBrand ? brand : undefined}
            />
        </Suspense>
    );
}
