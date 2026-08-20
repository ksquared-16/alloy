"use client";

import { useId, useState } from "react";
import {
    PASSWORD_FIELD_STARTS_HIDDEN,
    passwordFieldPresentation,
    togglePasswordReveal,
} from "@/lib/auth/passwordFieldPresentation";

/**
 * W-30 / `IA-R10`, `07/AU-2` — the one password input in the product.
 *
 * `RL-37`'s exit criterion is *"every password field in the product offers show/hide, from one
 * component"*, and the tier A lock is stated as *no bare `type="password"` outside the shared
 * component* — so this file is the only place that string may appear, and it appears here by way of
 * {@link passwordFieldPresentation} rather than literally.
 *
 * The three requirements that are easy to lose in a later edit, and where each is enforced:
 *
 * - **Defaults hidden** — the initial state is the named constant, not a literal `false`.
 * - **A real button, keyboard reachable** — `<button type="button">` with an accessible name and
 *   `aria-pressed`. Not a `<span onClick>`, which is unreachable by keyboard and announces nothing.
 * - **Revealed state is never persisted or logged** — there is no storage or logging call in this
 *   file, and the lock asserts that by reading it.
 */
export default function PasswordField(props: {
    id?: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    autoComplete?: string;
    required?: boolean;
    /** The policy's minimum, so the browser's own hint agrees with the validator. */
    minLength?: number;
    placeholder?: string;
    className?: string;
    labelClassName?: string;
    describedBy?: string;
}) {
    const [revealed, setRevealed] = useState(PASSWORD_FIELD_STARTS_HIDDEN);
    const generatedId = useId();
    const id = props.id ?? generatedId;
    const presentation = passwordFieldPresentation(revealed);

    return (
        <div>
            <label htmlFor={id} className={props.labelClassName ?? "mb-1.5 block text-sm font-medium text-alloy-forge/80"}>
                {props.label}
            </label>
            <div className="relative">
                <input
                    type={presentation.inputType}
                    id={id}
                    value={props.value}
                    onChange={(e) => props.onChange(e.target.value)}
                    required={props.required}
                    minLength={props.minLength}
                    className={props.className}
                    placeholder={props.placeholder}
                    autoComplete={props.autoComplete}
                    aria-describedby={props.describedBy}
                />
                <button
                    type="button"
                    onClick={() => setRevealed(togglePasswordReveal(revealed))}
                    aria-label={presentation.toggleLabel}
                    aria-pressed={presentation.ariaPressed}
                    className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-alloy-forge/60 hover:text-alloy-forge focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-juniper/40"
                >
                    {presentation.toggleText}
                </button>
            </div>
        </div>
    );
}
