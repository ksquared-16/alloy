"use client";

/**
 * A school's public tour journey (S7): step one picks a time, step two is the school's own
 * published lead form — the existing Forms runtime, not a second contact form.
 *
 * The step lives in the URL (`?start=&end=`), so the browser's Back button returns to the
 * calendar and Forward returns to the form. The form stays mounted once opened and its draft
 * is autosaved by the runtime, so going back to change the time loses no answer. The selected
 * time is also kept in this tab's session storage for a few hours, never longer.
 *
 * Submitting sends a REQUEST: the screen after it says received, never booked.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEmbedClient, type PublicFormTourRequest } from "@/app/forms/embed/[token]/FormEmbedClient";
import { IntakeCard, IntakeFrame } from "@/app/forms/embed/[token]/ParentIntakeShell";
import type { ParticipantBrand } from "@/lib/public/forms/participantBrandTheme";
import { formatParentDayLabel, formatParentTimeOnly, tourSlotDayKey } from "@/lib/tours/public/tourParentView";
import PublicTourCalendar, { type PublicTourPick } from "./PublicTourCalendar";

const SELECTION_TTL_MS = 6 * 60 * 60 * 1000;

function selectionKey(token: string): string {
    return `alloy_public_tour_selection:${encodeURIComponent(token)}`;
}

function readStoredSelection(token: string): PublicTourPick | null {
    try {
        const raw = window.sessionStorage.getItem(selectionKey(token));
        if (!raw) return null;
        const v = JSON.parse(raw) as PublicTourPick & { savedAt?: number };
        if (!v.savedAt || Date.now() - v.savedAt > SELECTION_TTL_MS) return null;
        if (Date.parse(v.startAt) <= Date.now()) return null;
        return { startAt: v.startAt, endAt: v.endAt, timezone: v.timezone };
    } catch {
        return null;
    }
}

function parseUrlSelection(sp: URLSearchParams | null, timezone: string): PublicTourPick | null {
    const start = sp?.get("start");
    const end = sp?.get("end");
    if (!start || !end) return null;
    const s = Date.parse(start);
    const e = Date.parse(end);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
    return { startAt: new Date(s).toISOString(), endAt: new Date(e).toISOString(), timezone };
}

export default function PublicTourJourneyClient({
    token,
    brand,
    locationLabel,
    locationAddress,
    timezone,
    initialResolve,
}: {
    token: string;
    brand: ParticipantBrand | null;
    locationLabel: string;
    locationAddress: string | null;
    timezone: string;
    initialResolve: Record<string, unknown> | null;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const selection = useMemo(
        () => parseUrlSelection(searchParams as unknown as URLSearchParams, timezone),
        [searchParams, timezone]
    );
    const [remembered, setRemembered] = useState<PublicTourPick | null>(null);
    const [formOpened, setFormOpened] = useState(false);
    const [chrome, setChrome] = useState<"full" | "none">("full");

    useEffect(() => {
        setRemembered(readStoredSelection(token));
        let framed = false;
        try {
            framed = window.self !== window.top;
        } catch {
            framed = true;
        }
        if (framed || new URLSearchParams(window.location.search).get("chrome") === "0") setChrome("none");
    }, [token]);

    useEffect(() => {
        if (selection) setFormOpened(true);
    }, [selection]);

    const goToDetails = useCallback(
        (pick: PublicTourPick) => {
            try {
                window.sessionStorage.setItem(selectionKey(token), JSON.stringify({ ...pick, savedAt: Date.now() }));
            } catch {
                /* storage is a convenience, never required */
            }
            setRemembered(pick);
            const qs = new URLSearchParams(searchParams?.toString() ?? "");
            qs.set("start", pick.startAt);
            qs.set("end", pick.endAt);
            router.push(`${pathname}?${qs.toString()}`, { scroll: true });
        },
        [pathname, router, searchParams, token]
    );

    const backToCalendar = useCallback(() => {
        const qs = new URLSearchParams(searchParams?.toString() ?? "");
        qs.delete("start");
        qs.delete("end");
        const q = qs.toString();
        router.push(q ? `${pathname}?${q}` : pathname, { scroll: true });
    }, [pathname, router, searchParams]);

    const tourRequest: PublicFormTourRequest | null = selection
        ? {
              startAt: selection.startAt,
              endAt: selection.endAt,
              label: `${formatParentDayLabel(tourSlotDayKey(selection.startAt, timezone) ?? "")} · ${formatParentTimeOnly(selection.startAt, timezone)}`,
              locationLabel,
              onChangeTime: backToCalendar,
          }
        : null;

    return (
        <>
            {!selection ? (
                <IntakeFrame brand={brand} chrome={chrome}>
                    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6" data-testid="public-tour-step-1">
                        <IntakeCard>
                            <header className="space-y-1 pb-4">
                                <p className="text-[13px] font-medium uppercase tracking-wide text-alloy-midnight/50">Step 1 of 2</p>
                                <h1 className="text-2xl font-semibold leading-tight text-alloy-midnight">Book a tour</h1>
                                <p className="text-[15px] font-medium text-alloy-midnight/80">{locationLabel}</p>
                                {locationAddress ? <p className="text-[14px] text-alloy-midnight/60">{locationAddress}</p> : null}
                                <p className="pt-1 text-[14px] leading-relaxed text-alloy-midnight/65">
                                    Choose a day and time, then tell us about your family. The school confirms your tour after
                                    reviewing your request.
                                </p>
                            </header>
                            <PublicTourCalendar
                                token={token}
                                timezone={timezone}
                                locationLabel={locationLabel}
                                selected={remembered}
                                onPick={goToDetails}
                            />
                        </IntakeCard>
                    </div>
                </IntakeFrame>
            ) : null}
            {formOpened ? (
                <div className={selection ? undefined : "hidden"} data-testid="public-tour-step-2" aria-hidden={!selection}>
                    <FormEmbedClient token={token} initialResolve={initialResolve} tourRequest={tourRequest} />
                </div>
            ) : null}
        </>
    );
}
