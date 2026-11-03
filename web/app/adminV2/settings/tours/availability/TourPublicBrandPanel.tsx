"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    BRAND_TEXT_CONTRAST_MIN,
    brandButtonColors,
    brandCtaButtonColors,
    contrastRatio,
    normalizeBrandColor,
    normalizeTourCtaLabel,
    PUBLIC_BRAND_PLATFORM_ACCENT,
    PUBLIC_TOUR_CTA_DEFAULT,
    PUBLIC_TOUR_CTA_MAX,
    resolveEffectivePublicBrand,
    resolveTourPublicBrand,
    type EffectivePublicBrand,
    type PublicBrandSource,
    type PublicBrandValues,
} from "@/lib/branding/publicBrand";

type PublishedForm = {
    linkId: string;
    formId: string;
    formTitle: string;
    formLayer: PublicBrandValues | null;
};

type BrandResponse = {
    organization: PublicBrandValues;
    location: PublicBrandValues | null;
    /** The form this location's published tour calendar opens into. */
    published_form: PublishedForm | null;
    /** What the tour shows (`resolveTourPublicBrand`). */
    effective: EffectivePublicBrand;
    /** What the published form shows on its OWN link (form → location → organization). */
    published_form_brand?: EffectivePublicBrand | null;
    tour_uses_form_brand?: boolean;
    can_edit_organization: boolean;
    can_edit_location: boolean;
};

const SOURCE_LABEL: Record<PublicBrandSource, string> = {
    form: "set on the published form",
    location: "set for this location",
    organization: "school default",
    platform: "Alloy default",
};

const EMPTY: PublicBrandValues = {
    display_name: null,
    accent_color: null,
    logo_url: null,
    tour_cta_label: null,
    tour_cta_text_color: null,
    tour_brand_source: null,
};

/** The brand fields this screen edits as text (the tour colour source is a choice, below). */
type BrandKey = Exclude<keyof PublicBrandValues, "tour_brand_source">;

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
 *
 * What families see is resolved exactly as the public page resolves it: the published form's own brand
 * (if it sets one) → this location → the organization → Alloy (P1-close, D1). Where the form wins, the
 * field says so and shows the setting that applies to forms without their own brand.
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
    const publishedForm = scopeLocationId ? data.published_form : null;
    // Exactly what the tour shows (hosted page, its form step, website button): `resolveTourPublicBrand`.
    const preview = resolveTourPublicBrand(
        scopeLocationId
            ? { form: publishedForm?.formLayer ?? null, location: cleaned(draft), organization: data.organization }
            : { organization: cleaned(draft) }
    );
    // The attached form on its OWN link — shown for clarity, never applied to the tour unless chosen.
    const formOwnBrand =
        scopeLocationId && publishedForm?.formLayer
            ? resolveEffectivePublicBrand({ form: publishedForm.formLayer, location: cleaned(draft), organization: data.organization })
            : null;
    const formSetsAccent = formOwnBrand?.sources.accentColor === "form";
    const tourSource = draft.tour_brand_source ?? (scopeLocationId ? data.organization.tour_brand_source : null) ?? "location";
    // What this screen's own settings resolve to — what a form that sets no brand of its own shows.
    const withoutForm = resolveEffectivePublicBrand(
        scopeLocationId ? { location: cleaned(draft), organization: data.organization } : { organization: cleaned(draft) }
    );
    const formWins = BRAND_KEYS.filter((k) => sourceKey(preview, k) === "form");
    const pair = brandButtonColors(preview.accentColor);
    // The website booking button: the same pair, with the school's chosen text colour where it reads.
    const ctaPair = brandCtaButtonColors(preview.accentColor, preview.tourCtaTextColor);
    const inherited = scopeLocationId ? data.organization : null;
    const anySet = Boolean(
        draft.display_name || draft.accent_color || draft.logo_url || draft.tour_cta_label || draft.tour_cta_text_color || draft.tour_brand_source
    );

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

    const field = (key: BrandKey, label: string, placeholder: string, extra?: { maxLength?: number; hint?: ReactNode }) => (
        <label className="block text-xs">
            {label}
            <input
                className="config-runtime-input mt-1"
                value={draft[key] ?? ""}
                placeholder={inherited?.[key] ? `Default: ${inherited[key]}` : placeholder}
                maxLength={extra?.maxLength}
                disabled={!editable}
                onChange={(e) => {
                    setSaved(false);
                    setDraft((d) => ({ ...d, [key]: e.target.value || null }));
                }}
                data-testid={`tours-brand-${key}`}
            />
            {sourceKey(preview, key) === "form" ?
                <span className="mt-0.5 block text-[11px] text-amber-900" data-testid={`tours-brand-${key}-form-wins`}>
                    Families see {sourceOf(preview, key, publishedForm?.formTitle)}, because Tour colours uses the form&apos;s
                    branding. With this location&apos;s branding they would see {sourceOf(withoutForm, key)}.
                </span>
            :   <span className="mt-0.5 block text-[11px] text-alloy-midnight/50" data-testid={`tours-brand-${key}-shown`}>
                    Shown to families: {sourceOf(preview, key)}
                </span>
            }
            {extra?.hint ? <span className="mt-0.5 block text-[11px] text-alloy-midnight/50">{extra.hint}</span> : null}
        </label>
    );

    return (
        <section className="space-y-4" aria-label="Booking experience" data-testid="tours-public-brand">
            <p className="config-typo-sublabel">
                {scopeLocationId
                    ? `How ${scopeLabel} appears on its tour booking page. Leave a field empty to use the default shown.`
                    : "The default for every location's tour booking page (and forms that don't set their own brand)."}
            </p>
            {err ? <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{err}</p> : null}
            {scopeLocationId ?
                <PublishedFormNote form={publishedForm} formWins={formWins} formAccent={formSetsAccent ? formOwnBrand!.accentColor : null} tourSource={tourSource} />
            :   null}

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
                    <fieldset className="space-y-1.5 rounded-lg border border-alloy-stone/15 bg-white p-3" data-testid="tours-brand-source">
                        <legend className="px-1 text-xs font-semibold text-alloy-midnight/80">Tour colours</legend>
                        <label className="flex items-start gap-2 text-xs">
                            <input
                                type="radio"
                                name="tour-brand-source"
                                className="mt-0.5"
                                checked={tourSource === "location"}
                                disabled={!editable}
                                onChange={() => {
                                    setSaved(false);
                                    setDraft((d) => ({ ...d, tour_brand_source: "location" }));
                                }}
                                data-testid="tours-brand-source-location"
                            />
                            <span>
                                {scopeLocationId ? "Use this location's branding" : "Use the school's branding"} (recommended)
                                <span className="block text-[11px] text-alloy-midnight/55">
                                    The calendar, the form step inside the tour and the website button all use the colours on this screen.
                                    An attached form keeps its own colours for its own form link.
                                </span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 text-xs">
                            <input
                                type="radio"
                                name="tour-brand-source"
                                className="mt-0.5"
                                checked={tourSource === "form"}
                                disabled={!editable}
                                onChange={() => {
                                    setSaved(false);
                                    setDraft((d) => ({ ...d, tour_brand_source: "form" }));
                                }}
                                data-testid="tours-brand-source-form"
                            />
                            <span>
                                Use the attached form&apos;s own branding
                                <span className="block text-[11px] text-alloy-midnight/55">
                                    Where the published form sets its own colour, name or logo, the tour shows those instead. Changes to the
                                    form reach the tour only when the form is published again.
                                </span>
                            </span>
                        </label>
                    </fieldset>
                    <fieldset className="space-y-2 rounded-lg border border-alloy-stone/15 bg-white p-3">
                        <legend className="px-1 text-xs font-semibold text-alloy-midnight/80">Booking button</legend>
                        {field("tour_cta_label", "Button text", PUBLIC_TOUR_CTA_DEFAULT, {
                            maxLength: PUBLIC_TOUR_CTA_MAX,
                            hint: "Used on your website button and as the booking page's heading.",
                        })}
                        <div className="flex items-end gap-2">
                            <div className="min-w-0 flex-1">
                                {field("tour_cta_text_color", "Button text colour (hex)", "Automatic", {
                                    hint: "Leave empty to let Alloy pick a readable colour.",
                                })}
                            </div>
                            <input
                                type="color"
                                aria-label="Pick button text colour"
                                className="mb-9 h-9 w-11 cursor-pointer rounded border border-alloy-stone/30 bg-white p-0.5"
                                value={(normalizeBrandColor(draft.tour_cta_text_color ?? "") ?? ctaPair.ink).toLowerCase()}
                                disabled={!editable}
                                onChange={(e) => {
                                    setSaved(false);
                                    setDraft((d) => ({ ...d, tour_cta_text_color: e.target.value.toUpperCase() }));
                                }}
                                data-testid="tours-brand-cta-text-picker"
                            />
                        </div>
                        <p
                            className={`text-[11px] ${ctaPair.treatment === "chosen_text_below_contrast" ? "text-amber-900" : "text-alloy-midnight/60"}`}
                            data-testid="tours-brand-cta-contrast-note"
                        >
                            {ctaPair.treatment === "chosen_text_below_contrast" ?
                                `That text colour is too hard to read on your button (under ${BRAND_TEXT_CONTRAST_MIN}:1), so the button keeps Alloy's readable text colour.`
                            : ctaPair.treatment === "chosen_text" ?
                                `Your text colour is used on the button (${contrastRatio(ctaPair.fill, ctaPair.ink).toFixed(1)}:1).`
                            :   "Text colour is chosen automatically for contrast."}
                        </p>
                    </fieldset>
                </div>

                <BookingPagePreview brand={preview} pair={pair} ctaPair={ctaPair} scopeLabel={scopeLabel} />
            </div>

            {editable ? (
                <div className="flex flex-wrap gap-2">
                    <ConfigurationPrimaryButton disabled={busy} onClick={() => void save()} data-testid="tours-brand-save">
                        {busy ? "Saving…" : "Save booking experience"}
                    </ConfigurationPrimaryButton>
                    {scopeLocationId && anySet ? (
                        <ConfigurationSecondaryButton disabled={busy} onClick={() => setDraft(EMPTY)}>
                            Clear {scopeLabel}&apos;s settings
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
    ctaPair,
    scopeLabel,
}: {
    brand: EffectivePublicBrand;
    pair: ReturnType<typeof brandButtonColors>;
    ctaPair: ReturnType<typeof brandCtaButtonColors>;
    scopeLabel: string;
}) {
    return (
        <div className="space-y-1.5" data-testid="tours-brand-preview">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Preview — booking page as families see it</p>
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
                style={{ background: ctaPair.fill, color: ctaPair.ink }}
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
        tour_cta_text_color: normalizeBrandColor(v.tour_cta_text_color ?? ""),
        tour_brand_source: v.tour_brand_source === "form" || v.tour_brand_source === "location" ? v.tour_brand_source : null,
    };
}

const BRAND_KEYS: BrandKey[] = ["display_name", "logo_url", "accent_color", "tour_cta_label", "tour_cta_text_color"];
const FIELD_NOUN: Record<BrandKey, string> = {
    display_name: "school name",
    logo_url: "logo",
    accent_color: "brand colour",
    tour_cta_label: "button text",
    tour_cta_text_color: "button text colour",
};

function sourceKey(brand: EffectivePublicBrand, key: BrandKey): PublicBrandSource {
    return key === "display_name" ? brand.sources.displayName
        : key === "accent_color" ? brand.sources.accentColor
        : key === "logo_url" ? brand.sources.logoUrl
        : key === "tour_cta_text_color" ? brand.sources.tourCtaTextColor
        : brand.sources.tourCtaLabel;
}

/** Which form the calendar opens into, whose colours the tour uses, and why. */
function PublishedFormNote({
    form,
    formWins,
    formAccent,
    tourSource,
}: {
    form: PublishedForm | null;
    formWins: BrandKey[];
    /** The form's own colour where it sets one (what its own link shows). */
    formAccent: string | null;
    tourSource: "location" | "form";
}) {
    if (!form) {
        return (
            <p className="text-[11px] text-alloy-midnight/60" data-testid="tours-brand-published-form">
                No tour calendar is published here yet.{" "}
                {tourSource === "form" ?
                    "When you attach a form, its own branding replaces these settings on the tour, as chosen under Tour colours."
                :   "Attaching a form later doesn't change these colours; the tour keeps this location's branding."}
            </p>
        );
    }
    return (
        <p
            className={`rounded-lg border px-3 py-2 text-xs ${formWins.length ? "border-amber-200 bg-amber-50 text-amber-950" : "border-alloy-stone/20 bg-white text-alloy-midnight/75"}`}
            data-testid="tours-brand-published-form"
            data-tour-brand-source={tourSource}
        >
            The tour calendar opens into the form “{form.formTitle}”.{" "}
            {formWins.length ?
                <>
                    Under Tour colours you chose the form&apos;s own branding, so families see its{" "}
                    {listInWords(formWins.map((k) => FIELD_NOUN[k]))} instead of the settings below.
                </>
            : formAccent ?
                <>
                    That form has its own colour ({formAccent}), used only when the form is opened on its own link. The tour —
                    calendar, form step and website button — uses the settings below.
                </>
            :   "It sets no branding of its own; the tour uses the settings below."}
        </p>
    );
}

function sourceOf(brand: EffectivePublicBrand, key: BrandKey, formTitle?: string | null): string {
    const source = sourceKey(brand, key);
    const value =
        key === "display_name" ? brand.displayName
        : key === "accent_color" ? brand.accentColor
        : key === "logo_url" ? brand.logoUrl
        : key === "tour_cta_text_color" ? brand.tourCtaTextColor
        : brand.tourCtaLabel;
    if (source === "platform") {
        if (key === "accent_color") return `${PUBLIC_BRAND_PLATFORM_ACCENT} (Alloy default)`;
        if (key === "tour_cta_label") return `“${PUBLIC_TOUR_CTA_DEFAULT}” (Alloy default)`;
        if (key === "tour_cta_text_color") return "automatic (Alloy default)";
        return "none (Alloy default)";
    }
    const label = source === "form" && formTitle ? `set on the published form “${formTitle}”` : SOURCE_LABEL[source];
    return `${value} (${label})`;
}

/** "a", "a and b", "a, b and c". */
function listInWords(items: string[]): string {
    return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
