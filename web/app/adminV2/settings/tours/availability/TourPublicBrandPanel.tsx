"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    brandButtonColors,
    contrastRatio,
    normalizeBrandColor,
    normalizeTourCtaLabel,
    PUBLIC_BRAND_PLATFORM_ACCENT,
    PUBLIC_TOUR_CTA_DEFAULT,
    PUBLIC_TOUR_CTA_MAX,
    resolveEffectivePublicBrand,
    type EffectivePublicBrand,
    type PublicBrandSource,
    type PublicBrandValues,
} from "@/lib/branding/publicBrand";

type BrandResponse = {
    organization: PublicBrandValues;
    location: PublicBrandValues | null;
    effective: EffectivePublicBrand;
    can_edit_organization: boolean;
    can_edit_location: boolean;
};

const SOURCE_LABEL: Record<PublicBrandSource, string> = {
    form: "set on the form",
    location: "set for this location",
    organization: "inherited from the organization",
    platform: "Alloy default",
};

const EMPTY: PublicBrandValues = { display_name: null, accent_color: null, logo_url: null, tour_cta_label: null };

const TREATMENT_NOTE: Record<ReturnType<typeof brandButtonColors>["treatment"], string> = {
    brand_light_text: "Buttons use your colour with white text.",
    deepened_brand_light_text: "White text on your exact colour would be hard to read, so buttons use a slightly deeper shade of it.",
    brand_dark_text: "Your colour is light, so button text uses a deep shade of the same colour.",
};

/**
 * Booking experience (S4-B, P1-B): how the school appears to families on its tour booking page. At
 * organization scope this edits the organization default; at a location it edits that location's
 * override, field by field — an empty field inherits, and every effective value says where it comes
 * from. The preview is the booking page's own first step in miniature, painted with the same button
 * pair the public page uses (`brandButtonColors`).
 */
export default function TourPublicBrandPanel({ scopeLocationId, scopeLabel }: { scopeLocationId: string | null; scopeLabel: string }) {
    const [data, setData] = useState<BrandResponse | null>(null);
    const [draft, setDraft] = useState<PublicBrandValues>(EMPTY);
    const [err, setErr] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setErr(null);
        const qs = scopeLocationId ? `?location_id=${encodeURIComponent(scopeLocationId)}` : "";
        try {
            const res = await fetch(`/api/admin/public-brand${qs}`, { credentials: "include" });
            const j = (await res.json()) as BrandResponse & { error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            setData(j);
            setDraft({ ...EMPTY, ...(scopeLocationId ? (j.location ?? EMPTY) : j.organization) });
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        }
    }, [scopeLocationId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!data) {
        return err ? <p className="text-xs text-red-700">{err}</p> : <div className="h-24 animate-pulse rounded-lg bg-alloy-midnight/[0.04]" aria-busy="true" />;
    }

    const editable = scopeLocationId ? data.can_edit_location : data.can_edit_organization;
    const preview = resolveEffectivePublicBrand(
        scopeLocationId ? { location: cleaned(draft), organization: data.organization } : { organization: cleaned(draft) }
    );
    const pair = brandButtonColors(preview.accentColor);
    const inherited = scopeLocationId ? data.organization : null;
    const anySet = Boolean(draft.display_name || draft.accent_color || draft.logo_url || draft.tour_cta_label);

    const save = async () => {
        setBusy(true);
        setErr(null);
        setSaved(false);
        try {
            const url = scopeLocationId
                ? `/api/admin/public-brand/locations/${encodeURIComponent(scopeLocationId)}`
                : "/api/admin/public-brand/organization";
            const res = await fetch(url, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ brand: draft }),
            });
            const j = (await res.json().catch(() => ({}))) as { brand?: PublicBrandValues; error?: string };
            if (!res.ok || !j.brand) throw new Error(j.error ?? "Brand was not saved");
            await load();
            setSaved(true);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const field = (key: keyof PublicBrandValues, label: string, placeholder: string, extra?: { maxLength?: number; hint?: ReactNode }) => (
        <label className="block text-xs">
            {label}
            <input
                className="config-runtime-input mt-1"
                value={draft[key] ?? ""}
                placeholder={inherited?.[key] ? `Inherited: ${inherited[key]}` : placeholder}
                maxLength={extra?.maxLength}
                disabled={!editable}
                onChange={(e) => {
                    setSaved(false);
                    setDraft((d) => ({ ...d, [key]: e.target.value || null }));
                }}
                data-testid={`tours-brand-${key}`}
            />
            <span className="mt-0.5 block text-[11px] text-alloy-midnight/50">Shown to families: {sourceOf(preview, key)}</span>
            {extra?.hint ? <span className="mt-0.5 block text-[11px] text-alloy-midnight/50">{extra.hint}</span> : null}
        </label>
    );

    return (
        <section className="space-y-4" aria-label="Booking experience" data-testid="tours-public-brand">
            <p className="config-typo-sublabel">
                {scopeLocationId
                    ? `How ${scopeLabel} appears on its tour booking page. Leave a field empty to use the organization's.`
                    : "The default for every location's tour booking page (and forms that don't set their own brand)."}
            </p>
            {err ? <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{err}</p> : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
                <div className="space-y-4">
                    <fieldset className="space-y-2 rounded-lg border border-alloy-stone/15 bg-white p-3">
                        <legend className="px-1 text-xs font-semibold text-alloy-midnight/80">School identity</legend>
                        {field("display_name", "Display name", "e.g. Sunrise Early Learning")}
                        {field("logo_url", "Logo (https address of an image)", "https://…/logo.png")}
                    </fieldset>
                    <fieldset className="space-y-2 rounded-lg border border-alloy-stone/15 bg-white p-3">
                        <legend className="px-1 text-xs font-semibold text-alloy-midnight/80">Brand colour</legend>
                        <div className="flex items-end gap-2">
                            <div className="min-w-0 flex-1">{field("accent_color", "Colour (hex)", "#00A283")}</div>
                            <input
                                type="color"
                                aria-label="Pick brand colour"
                                className="mb-5 h-9 w-11 cursor-pointer rounded border border-alloy-stone/30 bg-white p-0.5"
                                value={(normalizeBrandColor(draft.accent_color ?? "") ?? preview.accentColor).toLowerCase()}
                                disabled={!editable}
                                onChange={(e) => {
                                    setSaved(false);
                                    setDraft((d) => ({ ...d, accent_color: e.target.value.toUpperCase() }));
                                }}
                                data-testid="tours-brand-color-picker"
                            />
                        </div>
                        <p className="text-[11px] text-alloy-midnight/60" data-testid="tours-brand-contrast-note">
                            {TREATMENT_NOTE[pair.treatment]} Button text contrast {contrastRatio(pair.fill, pair.ink).toFixed(1)}:1 (needs 4.5:1).
                        </p>
                    </fieldset>
                    <fieldset className="space-y-2 rounded-lg border border-alloy-stone/15 bg-white p-3">
                        <legend className="px-1 text-xs font-semibold text-alloy-midnight/80">Booking button</legend>
                        {field("tour_cta_label", "Button text", PUBLIC_TOUR_CTA_DEFAULT, {
                            maxLength: PUBLIC_TOUR_CTA_MAX,
                            hint: "Used on your website button and as the booking page's heading.",
                        })}
                    </fieldset>
                </div>

                <BookingPagePreview brand={preview} pair={pair} scopeLabel={scopeLabel} />
            </div>

            {editable ? (
                <div className="flex flex-wrap gap-2">
                    <ConfigurationPrimaryButton disabled={busy} onClick={() => void save()} data-testid="tours-brand-save">
                        {busy ? "Saving…" : "Save booking experience"}
                    </ConfigurationPrimaryButton>
                    {scopeLocationId && anySet ? (
                        <ConfigurationSecondaryButton disabled={busy} onClick={() => setDraft(EMPTY)}>
                            Use the organization&apos;s settings
                        </ConfigurationSecondaryButton>
                    ) : null}
                    {saved ? <span className="self-center text-xs text-alloy-midnight/60">Saved</span> : null}
                </div>
            ) : (
                <p className="text-[11px] text-alloy-midnight/50">
                    {scopeLocationId ? "You need tour configuration access to change this." : "Organization settings access is needed to change the organization brand."}
                </p>
            )}
        </section>
    );
}

/** The booking page's first step in miniature — the header, heading and buttons families see. */
function BookingPagePreview({
    brand,
    pair,
    scopeLabel,
}: {
    brand: EffectivePublicBrand;
    pair: ReturnType<typeof brandButtonColors>;
    scopeLabel: string;
}) {
    return (
        <div className="space-y-1.5" data-testid="tours-brand-preview">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Preview — booking page</p>
            <div className="overflow-hidden rounded-xl border border-alloy-stone/25 bg-white shadow-sm" aria-hidden>
                <div className="flex items-center gap-2 border-b border-alloy-stone/15 px-4 py-2.5">
                    {brand.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={brand.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                    ) : (
                        <span className="h-6 w-6 rounded" style={{ background: brand.accentColor }} />
                    )}
                    <span className="text-sm font-semibold text-alloy-midnight">{brand.displayName ?? "Alloy"}</span>
                </div>
                <div className="space-y-3 px-4 py-4">
                    <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/50">Step 1 of 2</p>
                        <p className="text-lg font-semibold leading-tight text-alloy-midnight" data-testid="tours-brand-preview-heading">
                            {brand.tourCtaLabel}
                        </p>
                        <p className="text-xs text-alloy-midnight/70">{scopeLabel === "the organization" ? "Your location" : scopeLabel}</p>
                    </div>
                    <div className="flex gap-1.5">
                        {["9:00 AM", "9:30 AM", "10:00 AM"].map((t, i) => (
                            <span
                                key={t}
                                className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                                style={i === 1 ? { background: pair.fill, color: pair.ink, borderColor: pair.fill } : { borderColor: "rgba(24,39,58,0.15)" }}
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                    <span
                        className="inline-block rounded-xl px-6 py-2.5 text-sm font-semibold"
                        style={{ background: pair.fill, color: pair.ink }}
                        data-testid="tours-brand-preview-button"
                    >
                        Continue
                    </span>
                </div>
            </div>
            <p className="text-[11px] text-alloy-midnight/50">Website button:</p>
            <span
                className="inline-block rounded-[10px] px-6 py-3 text-base font-semibold"
                style={{ background: pair.fill, color: pair.ink }}
                data-testid="tours-brand-preview-cta"
            >
                {brand.tourCtaLabel}
            </span>
        </div>
    );
}

/** Draft text → values the preview can trust (an unfinished colour previews as unset). */
function cleaned(v: PublicBrandValues): PublicBrandValues {
    return {
        display_name: v.display_name?.trim() || null,
        accent_color: normalizeBrandColor(v.accent_color ?? ""),
        logo_url: v.logo_url && /^https:\/\//i.test(v.logo_url.trim()) ? v.logo_url.trim() : null,
        tour_cta_label: normalizeTourCtaLabel(v.tour_cta_label ?? ""),
    };
}

function sourceOf(brand: EffectivePublicBrand, key: keyof PublicBrandValues): string {
    const source =
        key === "display_name" ? brand.sources.displayName
        : key === "accent_color" ? brand.sources.accentColor
        : key === "logo_url" ? brand.sources.logoUrl
        : brand.sources.tourCtaLabel;
    const value =
        key === "display_name" ? brand.displayName
        : key === "accent_color" ? brand.accentColor
        : key === "logo_url" ? brand.logoUrl
        : brand.tourCtaLabel;
    if (source === "platform") {
        if (key === "accent_color") return `${PUBLIC_BRAND_PLATFORM_ACCENT} (Alloy default)`;
        if (key === "tour_cta_label") return `“${PUBLIC_TOUR_CTA_DEFAULT}” (Alloy default)`;
        return "none (Alloy default)";
    }
    return `${value} (${SOURCE_LABEL[source]})`;
}
