"use client";

import { useCallback, useEffect, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    brandOnAccent,
    contrastRatio,
    normalizeBrandColor,
    PUBLIC_BRAND_PLATFORM_ACCENT,
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

const EMPTY: PublicBrandValues = { display_name: null, accent_color: null, logo_url: null };

/**
 * The school's public brand, beside its tour schedules (S4-B). At organization scope this edits the
 * organization default; at a location it edits that location's override, field by field — an empty
 * field inherits, and every effective value says where it comes from.
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
            setDraft(scopeLocationId ? (j.location ?? EMPTY) : j.organization);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        }
    }, [scopeLocationId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!data) {
        return err ? <p className="text-xs text-red-700">{err}</p> : null;
    }

    const editable = scopeLocationId ? data.can_edit_location : data.can_edit_organization;
    const preview = resolveEffectivePublicBrand(
        scopeLocationId ? { location: cleaned(draft), organization: data.organization } : { organization: cleaned(draft) }
    );
    const onAccent = brandOnAccent(preview.accentColor);
    const inherited = scopeLocationId ? data.organization : null;

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

    const field = (key: keyof PublicBrandValues, label: string, placeholder: string) => (
        <label className="text-xs">
            {label}
            <input
                className="config-runtime-input mt-1"
                value={draft[key] ?? ""}
                placeholder={inherited?.[key] ? `Inherited: ${inherited[key]}` : placeholder}
                disabled={!editable}
                onChange={(e) => {
                    setSaved(false);
                    setDraft((d) => ({ ...d, [key]: e.target.value || null }));
                }}
                data-testid={`tours-brand-${key}`}
            />
            <span className="mt-0.5 block text-[11px] text-alloy-midnight/50">
                Shown to families: {sourceOf(preview, key)}
            </span>
        </label>
    );

    return (
        <section className="space-y-3 rounded-lg border border-alloy-stone/15 bg-white p-3" aria-label="Public brand" data-testid="tours-public-brand">
            <div>
                <h2 className="config-typo-field-label">How {scopeLabel} appears to families</h2>
                <p className="config-typo-sublabel">
                    {scopeLocationId
                        ? "Used on this location's tour booking page and its location links. Leave a field empty to use the organization's."
                        : "The default for every location and form that does not set its own."}
                </p>
            </div>
            {err ? <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{err}</p> : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {field("display_name", "Display name", "e.g. Sunrise Early Learning")}
                {field("accent_color", "Brand colour", "#00A283")}
                {field("logo_url", "Logo (https address)", "https://…/logo.png")}
            </div>
            <div className="flex flex-wrap items-center gap-3" data-testid="tours-brand-preview">
                {preview.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.logoUrl} alt="" className="h-7 w-7 rounded object-contain" />
                ) : null}
                <span className="text-sm font-semibold text-alloy-midnight">{preview.displayName ?? "Alloy"}</span>
                <span
                    className="rounded-lg px-4 py-2 text-sm font-semibold"
                    style={{ backgroundColor: preview.accentColor, color: onAccent }}
                    title={`Text contrast ${contrastRatio(preview.accentColor, onAccent).toFixed(1)}:1`}
                >
                    Book a tour
                </span>
                <span className="text-[11px] text-alloy-midnight/50">
                    Button text is chosen automatically to stay readable (at least 4.5:1).
                </span>
            </div>
            {editable ? (
                <div className="flex gap-2">
                    <ConfigurationPrimaryButton disabled={busy} onClick={() => void save()} data-testid="tours-brand-save">
                        {busy ? "Saving…" : "Save brand"}
                    </ConfigurationPrimaryButton>
                    {scopeLocationId && (draft.display_name || draft.accent_color || draft.logo_url) ? (
                        <ConfigurationSecondaryButton disabled={busy} onClick={() => setDraft(EMPTY)}>
                            Use the organization&apos;s brand
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

/** Draft text → values the preview can trust (an unfinished colour previews as unset). */
function cleaned(v: PublicBrandValues): PublicBrandValues {
    return {
        display_name: v.display_name?.trim() || null,
        accent_color: normalizeBrandColor(v.accent_color ?? ""),
        logo_url: v.logo_url && /^https:\/\//i.test(v.logo_url.trim()) ? v.logo_url.trim() : null,
    };
}

function sourceOf(brand: EffectivePublicBrand, key: keyof PublicBrandValues): string {
    const source = key === "display_name" ? brand.sources.displayName : key === "accent_color" ? brand.sources.accentColor : brand.sources.logoUrl;
    const value = key === "display_name" ? brand.displayName : key === "accent_color" ? brand.accentColor : brand.logoUrl;
    if (source === "platform") return key === "accent_color" ? `${PUBLIC_BRAND_PLATFORM_ACCENT} (Alloy default)` : "none (Alloy default)";
    return `${value} (${SOURCE_LABEL[source]})`;
}
