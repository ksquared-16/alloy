"use client";

import type {
    IntakeMarketingConsentChoice,
    ResolvedMarketingConsentLanguage,
} from "@/lib/communications/preferences/intakeMarketingConsentRecord";

/**
 * Optional marketing consent (S7 × C1). One unchecked box per offered channel, each with its own
 * wording — Communications' default, or the form author's Marketing consent question. Nothing here is
 * required, and nothing here is sent until submit. The same control renders in the public form, the
 * tour calendar's step two and Forms Studio Preview, so what the author previews is what families see.
 */
export function MarketingConsentControl({
    language,
    value,
    onChange,
    disabled,
    className = "mt-6",
}: {
    language: ResolvedMarketingConsentLanguage;
    value: IntakeMarketingConsentChoice;
    onChange: (next: IntakeMarketingConsentChoice) => void;
    disabled: boolean;
    className?: string;
}) {
    const channels = (["email", "sms"] as const).filter((c) => language.channels[c]);
    return (
        <fieldset
            className={`${className} rounded-xl border border-alloy-midnight/10 px-4 py-3`}
            data-testid="public-marketing-consent"
            data-consent-language-version={language.version}
            data-consent-field-id={language.formFieldId ?? undefined}
        >
            <legend className="px-1 text-[13px] font-medium text-alloy-midnight/60">{language.heading}</legend>
            {channels.map((channel) => (
                <label key={channel} className="flex items-start gap-3 py-1.5 text-[14px] text-alloy-midnight/80">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-participant-accent"
                        checked={value[channel] === true}
                        disabled={disabled}
                        onChange={(e) => onChange({ ...value, [channel]: e.target.checked })}
                        data-testid={`public-marketing-consent-${channel}`}
                    />
                    <span>{language[channel]}</span>
                </label>
            ))}
            <p className="pt-1 text-[13px] text-alloy-midnight/60">{language.note}</p>
        </fieldset>
    );
}
