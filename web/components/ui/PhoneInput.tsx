"use client";

/**
 * THE PHONE INPUT. It identifies itself as a phone field (`type="tel"`, `autoComplete="tel"`,
 * `inputMode="tel"`), formats as the operator or family types — "(555) 888-9965" — and hands the form
 * canonical E.164 once the number is complete (`phoneValueFromTyped`). Storage and SMS routing keep
 * their existing normalization; this only stops raw digits being what people see and type into.
 */
import { forwardRef, type InputHTMLAttributes } from "react";

import { formatPhoneAsTyped, formatPhoneDisplay, phoneValueFromTyped } from "@/lib/phone/phonePresentation";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
    value: string | null | undefined;
    onChange: (value: string) => void;
};

/** What the box shows for a stored or emitted value. */
export function phoneInputDisplay(value: string | null | undefined): string {
    const text = (value ?? "").trim();
    if (!text) return "";
    const shown = formatPhoneDisplay(text);
    return shown === text ? formatPhoneAsTyped(text) || text : shown;
}

/** The next value after an edit; deleting a formatting character deletes the digit before it. */
export function nextPhoneValue(previousDisplay: string, typed: string): string {
    const digits = (s: string) => s.replace(/\D/g, "");
    let next = typed;
    if (typed.length < previousDisplay.length && digits(typed) === digits(previousDisplay) && !typed.trim().startsWith("+")) {
        next = digits(typed).slice(0, -1);
    }
    return phoneValueFromTyped(next.trim().startsWith("+") ? next : formatPhoneAsTyped(next));
}

const PhoneInput = forwardRef<HTMLInputElement, Props>(function PhoneInput({ value, onChange, ...rest }, ref) {
    const display = phoneInputDisplay(value);
    return (
        <input
            {...rest}
            ref={ref}
            type="tel"
            inputMode="tel"
            autoComplete={rest.autoComplete ?? "tel"}
            value={display}
            onChange={(e) => onChange(nextPhoneValue(display, e.target.value))}
        />
    );
});

export default PhoneInput;
