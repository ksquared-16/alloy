"use client";

import { useCallback, useEffect, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { brandButtonColors, type EffectivePublicBrand } from "@/lib/branding/publicBrand";
import {
    buildTourCalendarIframeSnippet,
    buildTourCtaButtonSnippet,
    type TourCalendarShareLink,
} from "@/lib/tours/publicCalendar/tourCalendarShare";

type LinksResponse = { links: TourCalendarShareLink[]; can_publish: boolean };

/**
 * Preview & Share (P1-A): publish a location's tour calendar on one of its intake links, then take
 * the hosted address, an iframe or a website button to the school's site.
 *
 * Publishing is the existing link PATCH (`tour_calendar`) — the server still requires a
 * location-specific lead-capture intake link and `tours.configure`; nothing here widens that.
 */
export default function TourShareSection({
    scopeLocationId,
    scopeLabel,
    hasSchedules,
}: {
    scopeLocationId: string | null;
    scopeLabel: string;
    hasSchedules: boolean;
}) {
    const [data, setData] = useState<LinksResponse | null>(null);
    const [brand, setBrand] = useState<EffectivePublicBrand | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busyLink, setBusyLink] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!scopeLocationId) return;
        setErr(null);
        try {
            const qs = `?location_id=${encodeURIComponent(scopeLocationId)}`;
            const [linksRes, brandRes] = await Promise.all([
                fetch(`/api/admin/tours/calendar-links${qs}`, { credentials: "include" }),
                fetch(`/api/admin/public-brand${qs}`, { credentials: "include" }),
            ]);
            const links = (await linksRes.json()) as LinksResponse & { error?: string };
            if (!linksRes.ok) throw new Error(links.error ?? linksRes.statusText);
            setData(links);
            if (brandRes.ok) setBrand(((await brandRes.json()) as { effective: EffectivePublicBrand }).effective);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        }
    }, [scopeLocationId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!scopeLocationId) {
        return (
            <section className="rounded-lg border border-alloy-stone/15 bg-white p-3 text-sm" data-testid="tours-share-section">
                <p className="text-alloy-midnight/80">
                    Each location has its own public tour calendar. Choose a location above, or open{" "}
                    <strong>Organization › Locations</strong>, pick the location, then <strong>Tours › Preview &amp; Share</strong>.
                </p>
            </section>
        );
    }

    const setPublished = async (link: TourCalendarShareLink, enabled: boolean) => {
        setBusyLink(link.linkId);
        setErr(null);
        try {
            const res = await fetch(
                `/api/admin/forms/${encodeURIComponent(link.formId)}/public-links/${encodeURIComponent(link.linkId)}`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tour_calendar: enabled }),
                }
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            await load();
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setBusyLink(null);
        }
    };

    const copy = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
        } catch {
            setErr("Copy failed — select the text and copy it instead.");
        }
    };

    const published = data?.links.filter((l) => l.calendarPublished && l.usable) ?? [];
    const candidates = data?.links.filter((l) => !(l.calendarPublished && l.usable)) ?? [];
    const pair = brandButtonColors(brand?.accentColor ?? "#00A283");
    const cta = brand?.tourCtaLabel ?? "Schedule a Tour";

    return (
        <section className="space-y-4" data-testid="tours-share-section" aria-label="Preview and share">
            {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
            {!hasSchedules ?
                <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    {scopeLabel} has no active tour schedule, so its calendar shows as unavailable to families until one is added under Availability.
                </p>
            :   null}
            {data == null && !err ?
                <div className="h-16 animate-pulse rounded-lg bg-alloy-midnight/[0.04]" aria-busy="true" />
            :   null}

            {published.map((link) => (
                <article key={link.linkId} className="space-y-3 rounded-lg border border-alloy-stone/15 bg-white p-3" data-testid="tours-share-published">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <p className="text-sm font-semibold text-alloy-midnight">
                                Tour calendar is live
                                <span className="ml-2 rounded bg-alloy-pine/15 px-1.5 text-[11px] font-semibold text-alloy-pine">Published</span>
                            </p>
                            <p className="config-typo-sublabel">
                                Step 2 is the form “{link.formTitle}”{link.linkLabel ? ` (${link.linkLabel})` : ""}.
                                {link.allowedEmbedOrigins.length ?
                                    ` May be framed only on: ${link.allowedEmbedOrigins.join(", ")}.`
                                :   " Any website may frame it."}
                            </p>
                        </div>
                        {data?.can_publish ?
                            <ConfigurationSecondaryButton className="px-2 py-1" disabled={busyLink != null} onClick={() => void setPublished(link, false)} data-testid="tours-share-withdraw">
                                {busyLink === link.linkId ? "Withdrawing…" : "Withdraw calendar"}
                            </ConfigurationSecondaryButton>
                        :   null}
                    </div>

                    {link.calendarUrl ?
                        <>
                            <ShareRow
                                label="Hosted booking page"
                                hint="Send this to families or link to it from anywhere."
                                value={link.calendarUrl}
                                testId="tours-share-url"
                                copied={copied === `${link.linkId}:url`}
                                onCopy={() => void copy(`${link.linkId}:url`, link.calendarUrl!)}
                                open={link.calendarUrl}
                            />
                            <ShareRow
                                label="Embed on your website (iframe)"
                                hint="The calendar and the inquiry form both stay inside this frame on your page."
                                value={buildTourCalendarIframeSnippet({ url: link.calendarUrl, title: `${cta} — ${scopeLabel}` })}
                                testId="tours-share-iframe"
                                copied={copied === `${link.linkId}:iframe`}
                                onCopy={() =>
                                    void copy(`${link.linkId}:iframe`, buildTourCalendarIframeSnippet({ url: link.calendarUrl!, title: `${cta} — ${scopeLabel}` }))
                                }
                                multiline
                            />
                            <div className="space-y-1.5">
                                <ShareRow
                                    label="Button for your website"
                                    hint="Opens the hosted booking page in a new tab. Uses your button text and brand colours."
                                    value={buildTourCtaButtonSnippet({ url: link.calendarUrl, label: cta, fill: pair.fill, ink: pair.ink })}
                                    testId="tours-share-button"
                                    copied={copied === `${link.linkId}:button`}
                                    onCopy={() =>
                                        void copy(
                                            `${link.linkId}:button`,
                                            buildTourCtaButtonSnippet({ url: link.calendarUrl!, label: cta, fill: pair.fill, ink: pair.ink })
                                        )
                                    }
                                    multiline
                                />
                                <a
                                    href={link.calendarUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block rounded-[10px] px-6 py-3 text-base font-semibold no-underline"
                                    style={{ background: pair.fill, color: pair.ink }}
                                    data-testid="tours-share-button-preview"
                                >
                                    {cta}
                                </a>
                            </div>
                        </>
                    :   <p className="text-xs text-alloy-midnight/70">
                            {link.calendarPath ?
                                "This environment has no public web address configured, so a full link can't be shown. Ask an administrator to set the public app URL."
                            :   "This link was created before its share address was recorded. Create a new location link in Forms Studio to get a shareable address."}
                        </p>
                    }
                </article>
            ))}

            {data && published.length === 0 ?
                <div className="rounded-lg border border-dashed border-alloy-forge/20 p-3 text-sm" data-testid="tours-share-unpublished">
                    <p className="font-medium text-alloy-midnight/85">{scopeLabel}&apos;s tour calendar is not published.</p>
                    <p className="config-typo-sublabel mt-1">
                        The calendar is step 1; step 2 is an inquiry form. Publish it on one of {scopeLabel}&apos;s inquiry form links below.
                    </p>
                </div>
            :   null}

            {data && candidates.length > 0 ?
                <ul className="space-y-2" data-testid="tours-share-candidates">
                    {candidates.map((link) => {
                        const blocker =
                            !link.usable ? (link.unusableReason === "expired" ? "This link has expired." : "This link is turned off.")
                            : !link.leadCapture ? "This form is not an inquiry (lead-capture) form, so it can't follow a tour booking."
                            : null;
                        return (
                            <li key={link.linkId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-alloy-stone/15 bg-white px-3 py-2 text-sm">
                                <div className="min-w-0">
                                    <p className="font-medium text-alloy-midnight">
                                        {link.formTitle}
                                        {link.linkLabel ? <span className="text-alloy-midnight/55"> · {link.linkLabel}</span> : null}
                                    </p>
                                    {blocker ? <p className="text-[11px] text-alloy-midnight/55">{blocker}</p> : null}
                                </div>
                                {data.can_publish && !blocker ?
                                    <ConfigurationPrimaryButton disabled={busyLink != null} onClick={() => void setPublished(link, true)} data-testid="tours-share-publish">
                                        {busyLink === link.linkId ? "Publishing…" : "Publish tour calendar here"}
                                    </ConfigurationPrimaryButton>
                                :   null}
                            </li>
                        );
                    })}
                </ul>
            :   null}

            {data && data.links.length === 0 ?
                <p className="text-xs text-alloy-midnight/70" data-testid="tours-share-no-links">
                    {scopeLabel} has no location-specific inquiry form link yet. In Forms Studio, open your inquiry form, choose{" "}
                    <strong>Distribution › Share by location</strong>, create the link for {scopeLabel}, then come back here to publish the calendar on it.
                </p>
            :   null}
            {data && !data.can_publish ?
                <p className="text-[11px] text-alloy-midnight/50">Publishing a tour calendar also needs form authoring access.</p>
            :   null}
        </section>
    );
}

function ShareRow({
    label,
    hint,
    value,
    testId,
    copied,
    onCopy,
    open,
    multiline = false,
}: {
    label: string;
    hint: string;
    value: string;
    testId: string;
    copied: boolean;
    onCopy: () => void;
    open?: string;
    multiline?: boolean;
}) {
    return (
        <div className="space-y-1" data-testid={testId}>
            <p className="text-xs font-semibold text-alloy-midnight/80">{label}</p>
            <p className="text-[11px] text-alloy-midnight/55">{hint}</p>
            <div className="flex flex-wrap items-start gap-2">
                {multiline ?
                    <textarea readOnly value={value} rows={3} className="config-runtime-input min-w-0 flex-1 font-mono text-[11px]" data-testid={`${testId}-value`} />
                :   <input readOnly value={value} className="config-runtime-input min-w-0 flex-1 font-mono text-[11px]" data-testid={`${testId}-value`} />}
                <ConfigurationSecondaryButton className="px-2 py-1" onClick={onCopy} data-testid={`${testId}-copy`}>
                    {copied ? "Copied" : "Copy"}
                </ConfigurationSecondaryButton>
                {open ?
                    <a href={open} target="_blank" rel="noopener noreferrer" className="self-center text-xs font-semibold text-alloy-bend-pine underline" data-testid={`${testId}-open`}>
                        Open
                    </a>
                :   null}
            </div>
        </div>
    );
}
