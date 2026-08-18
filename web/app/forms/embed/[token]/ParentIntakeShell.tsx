"use client";

/**
 * Parent intake shell — premium presentational chrome for the public packet/form
 * experience (the `IntakeEmbedShell` the embed doctrine anticipates).
 *
 * This file owns LAYOUT + BRANDING ONLY. It never touches submission, prefill,
 * validation, or draft PATCH — `FormEngineRenderer` keeps field semantics, and
 * `FormEmbedClient` keeps every hook/handler. These are pure, on-brand building
 * blocks (Alloy juniper + midnight on white) so the parent journey feels like the
 * rest of Alloy: guided, fast, premium, human — never a raw form.
 */

import type { CSSProperties } from "react";
import { participantBrandStyle, type ParticipantBrand } from "@/lib/public/forms/participantBrandTheme";
import type { ReactNode } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";

const BRAND = "Alloy";

/** Small juniper brand mark — inline SVG so the embed shell loads no admin modules. */
function BrandMark({ className }: { className?: string }) {
    return (
        <span
            className={clsx(
                "inline-flex h-7 w-7 items-center justify-center rounded-[9px] bg-alloy-juniper shadow-[0_2px_6px_rgba(0,162,131,0.35)]",
                className
            )}
            aria-hidden
        >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path
                    d="M8 1.5l5.5 3.2v6.6L8 14.5 2.5 11.3V4.7L8 1.5z"
                    stroke="white"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                    opacity="0.95"
                />
                <circle cx="8" cy="8" r="1.9" fill="white" />
            </svg>
        </span>
    );
}

/**
 * Full-page frame: soft brand background, slim top bar, centered column.
 * Used by every parent-facing state (loading, form, completion).
 */
export function IntakeFrame({
    brand,
    children,
    packetName,
    previewBanner,
    contentClassName,
}: {
    /**
     * The tenant's authored brand.
     *
     * The frame wraps EVERY participant phase — the conversation and the artifact review are both
     * inside it — so theming here is what makes them one experience rather than two that happen to
     * agree. Null falls back to the platform mark, which is what an unbranded tenant should see.
     */
    brand?: ParticipantBrand | null;
    children: ReactNode;
    packetName?: string | null;
    previewBanner?: ReactNode;
    contentClassName?: string;
}) {
    return (
        <div
            className="min-h-screen bg-gradient-to-b from-white via-white to-alloy-stone/50"
            style={brand ? (participantBrandStyle(brand) as CSSProperties) : undefined}
            data-participant-brand={brand ? "tenant" : "platform"}
        >
            {previewBanner}
            <header className="sticky top-0 z-10 border-b border-alloy-midnight/[0.07] bg-white/85 backdrop-blur-sm">
                <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-4 py-3 sm:px-6">
                    {brand?.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={brand.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                    ) : (
                        <BrandMark />
                    )}
                    <div className="min-w-0 leading-tight">
                        <div className="text-[13px] font-semibold tracking-tight text-alloy-midnight">
                            {brand?.brandName ?? BRAND}
                        </div>
                        {packetName ? (
                            <div className="truncate text-[11px] text-alloy-midnight/45">{packetName}</div>
                        ) : null}
                    </div>
                </div>
            </header>
            <main className={clsx("mx-auto w-full max-w-2xl px-4 pb-20 pt-6 sm:px-6 sm:pt-8", contentClassName)}>
                {children}
            </main>
        </div>
    );
}

/** The premium content card the active step renders inside. */
export function IntakeCard({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <section
            className={clsx(
                "rounded-2xl border border-alloy-midnight/[0.08] bg-white p-5 shadow-[0_2px_22px_rgba(24,39,58,0.06)] sm:p-7",
                className
            )}
        >
            {children}
        </section>
    );
}

/** Segmented progress: phase kicker + "Step n of N" + animated track. */
export function IntakeProgress({
    phaseLabel,
    stepIndex,
    total,
}: {
    phaseLabel?: string;
    stepIndex: number;
    total: number;
}) {
    const safeTotal = Math.max(1, total);
    return (
        <div className="mb-5">
            <div className="mb-2 flex items-center justify-between gap-3">
                {phaseLabel ? (
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        {phaseLabel}
                    </span>
                ) : (
                    <span />
                )}
                <span className="text-[11.5px] font-medium tabular-nums text-alloy-midnight/45">
                    Step {Math.min(stepIndex + 1, safeTotal)} of {safeTotal}
                </span>
            </div>
            <div className="flex gap-1.5" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={safeTotal}>
                {Array.from({ length: safeTotal }).map((_, i) => (
                    <span
                        key={i}
                        className={clsx(
                            "h-1.5 flex-1 rounded-full transition-colors duration-500",
                            i <= stepIndex ? "bg-alloy-juniper" : "bg-alloy-midnight/[0.09]"
                        )}
                    />
                ))}
            </div>
        </div>
    );
}

/** Step heading — large, calm, conversational. */
export function IntakeHeading({ title, subtitle }: { title: string; subtitle?: string | null }) {
    return (
        <div className="mb-5">
            <h1 className="text-[20px] font-semibold leading-snug tracking-tight text-alloy-midnight sm:text-[22px]">
                {title}
            </h1>
            {subtitle ? <p className="mt-1.5 text-[14px] leading-relaxed text-alloy-midnight/60">{subtitle}</p> : null}
        </div>
    );
}

/** "What's ahead" chips — known / to add / to sign. */
export function IntakeChips({ known, missing, uploads }: { known: number; missing: number; uploads: number }) {
    if (known <= 0 && missing <= 0 && uploads <= 0) return null;
    return (
        <div className="mb-5 flex flex-wrap gap-2">
            {known > 0 ? <Chip tone="juniper" label={`${known} already filled in`} /> : null}
            {missing > 0 ? <Chip tone="amber" label={`${missing} to add`} /> : null}
            {uploads > 0 ? <Chip tone="sky" label={`${uploads} to sign or upload`} /> : null}
        </div>
    );
}

function Chip({ tone, label }: { tone: "juniper" | "amber" | "sky"; label: string }) {
    const cls =
        tone === "juniper"
            ? "bg-alloy-juniper/10 text-alloy-juniper"
            : tone === "amber"
              ? "bg-amber-50 text-amber-700"
              : "bg-sky-50 text-sky-700";
    const dot = tone === "juniper" ? "bg-alloy-juniper" : tone === "amber" ? "bg-amber-500" : "bg-sky-500";
    return (
        <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium", cls)}>
            <span className={clsx("h-1.5 w-1.5 rounded-full", dot)} />
            {label}
        </span>
    );
}

/** Cross-form packet checklist — the guiding "where am I" rail. */
export function IntakePacketChecklist({
    steps,
    currentIndex,
}: {
    steps: { sequence_index: number; form_name: string }[];
    currentIndex: number;
}) {
    if (steps.length === 0) return null;
    const ordered = [...steps].sort((a, b) => a.sequence_index - b.sequence_index);
    return (
        <ol className="mb-5 space-y-1.5">
            {ordered.map((s) => {
                const done = s.sequence_index < currentIndex;
                const active = s.sequence_index === currentIndex;
                return (
                    <li
                        key={s.sequence_index}
                        className={clsx(
                            "flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors",
                            active
                                ? "border-alloy-juniper/30 bg-alloy-juniper/[0.06]"
                                : "border-alloy-midnight/[0.06] bg-white"
                        )}
                    >
                        <span
                            className={clsx(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                                done
                                    ? "bg-alloy-juniper text-white"
                                    : active
                                      ? "bg-alloy-juniper/15 text-alloy-juniper ring-1 ring-alloy-juniper/40"
                                      : "bg-alloy-midnight/[0.06] text-alloy-midnight/40"
                            )}
                        >
                            {done ? <Check className="h-3 w-3" strokeWidth={3} /> : s.sequence_index + 1}
                        </span>
                        <span
                            className={clsx(
                                "truncate text-[13px]",
                                active
                                    ? "font-semibold text-alloy-midnight"
                                    : done
                                      ? "text-alloy-midnight/55"
                                      : "text-alloy-midnight/70"
                            )}
                        >
                            {s.form_name}
                        </span>
                        {active ? (
                            <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-alloy-juniper">
                                Now
                            </span>
                        ) : null}
                    </li>
                );
            })}
        </ol>
    );
}

/** Footer action bar — error/message + Back / Continue / Submit. */
export function IntakeFooter({
    errorLines = [],
    message,
    onBack,
    primaryLabel,
    onPrimary,
    primaryDisabled,
    primaryBusy,
}: {
    errorLines?: string[];
    message?: string | null;
    onBack?: () => void;
    primaryLabel: string;
    onPrimary: () => void;
    primaryDisabled?: boolean;
    primaryBusy?: boolean;
}) {
    return (
        <div className="mt-8 space-y-3 border-t border-alloy-midnight/[0.07] pt-6">
            {errorLines.length ? (
                <ul className="list-disc space-y-1 rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-3 pl-7 text-left text-[13px] text-rose-800">
                    {errorLines.map((line, i) => (
                        <li key={i}>{line}</li>
                    ))}
                </ul>
            ) : null}
            {message ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[13px] text-amber-950">
                    {message}
                </p>
            ) : null}
            <div className="flex items-center gap-3">
                {onBack ? (
                    <button
                        type="button"
                        onClick={onBack}
                        className="rounded-xl border border-alloy-midnight/15 px-5 py-3 text-[14px] font-medium text-alloy-midnight/70 transition-colors hover:border-alloy-midnight/25 hover:text-alloy-midnight"
                    >
                        Back
                    </button>
                ) : null}
                <button
                    type="button"
                    disabled={primaryDisabled}
                    aria-busy={primaryBusy}
                    onClick={onPrimary}
                    className="flex-1 rounded-xl bg-alloy-juniper py-3.5 text-[14px] font-semibold text-white shadow-[0_2px_10px_rgba(0,162,131,0.28)] transition-colors hover:bg-[#009276] disabled:cursor-not-allowed disabled:bg-alloy-midnight/25 disabled:shadow-none"
                >
                    {primaryLabel}
                </button>
            </div>
        </div>
    );
}

/** Terminal screens — submitted / packet complete / already done. */
export function IntakeCompletion({
    title,
    body,
    hint,
    tone = "success",
}: {
    title: string;
    body: string;
    hint?: string;
    tone?: "success" | "neutral";
}) {
    return (
        <IntakeCard className="mt-6 text-center sm:p-10">
            <div
                className={clsx(
                    "mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full",
                    tone === "success" ? "bg-alloy-juniper/12 text-alloy-juniper" : "bg-alloy-midnight/[0.06] text-alloy-midnight/60"
                )}
            >
                <Check className="h-8 w-8" strokeWidth={2.5} />
            </div>
            <h1 className="text-[21px] font-semibold tracking-tight text-alloy-midnight">{title}</h1>
            <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-alloy-midnight/65">{body}</p>
            {hint ? <p className="mt-6 text-[12px] text-alloy-midnight/40">{hint}</p> : null}
        </IntakeCard>
    );
}

/** Calm centered loading / error state inside the brand frame. */
export function IntakeNotice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
    return (
        <div
            className={clsx(
                "flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-[14px]",
                tone === "error" ? "text-rose-700" : "text-alloy-midnight/55"
            )}
        >
            {tone === "muted" ? (
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-alloy-juniper/30 border-t-alloy-juniper" aria-hidden />
            ) : null}
            {children}
        </div>
    );
}
