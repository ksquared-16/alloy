"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
    buildIntakeReviewPresentation,
    formatDobForDisplay,
    type IntakeReviewPresentation,
} from "@/lib/intake/review/buildIntakeReviewPresentation";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

type Props = {
    household: IntakeHouseholdCandidate | null | undefined;
    className?: string;
};

function ContactBadges({
    emails,
    phones,
    invalidPhone,
}: {
    emails: string[];
    phones: string[];
    invalidPhone?: boolean;
}) {
    const items = [
        ...emails.map((v) => ({ kind: "email" as const, value: v, invalid: false })),
        ...phones.map((v) => ({ kind: "phone" as const, value: v, invalid: invalidPhone ?? false })),
    ].filter((item) => item.value);
    if (!items.length) return null;
    return (
        <div className="mt-1 flex flex-wrap gap-1">
            {items.map((item) => (
                <span
                    key={`${item.kind}:${item.value}`}
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                        item.invalid ?
                            "bg-alloy-ember/10 text-alloy-ember"
                        :   "bg-alloy-stone/8 text-alloy-midnight/60"
                    }`}
                >
                    {item.kind === "phone" && item.invalid ? "invalid phone: " : ""}
                    {item.value}
                </span>
            ))}
        </div>
    );
}

function PersonCard({
    name,
    detail,
    badges,
    isPrimary,
    needsReview,
}: {
    name: string;
    detail?: string | null;
    badges?: React.ReactNode;
    isPrimary?: boolean;
    needsReview?: boolean;
}) {
    return (
        <div
            className={`rounded-lg border px-2.5 py-2 ${
                needsReview ? "border-amber-200/80 bg-amber-50/40" : "border-alloy-stone/10 bg-white"
            }`}
            data-intake-person-card={name}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-semibold text-alloy-midnight">{name}</p>
                {isPrimary ?
                    <span className="shrink-0 rounded-full bg-[#00A283]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#007A63]">
                        Primary
                    </span>
                :   null}
            </div>
            {detail ?
                <p className="mt-0.5 text-[11px] text-alloy-midnight/55">{detail}</p>
            :   null}
            {badges}
        </div>
    );
}

function ReviewSection({
    title,
    defaultOpen = true,
    children,
    testId,
}: {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
    testId: string;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div data-testid={testId}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50"
            >
                {open ?
                    <ChevronDown className="h-3.5 w-3.5" />
                :   <ChevronRight className="h-3.5 w-3.5" />}
                {title}
            </button>
            {open ?
                <div className="mt-2 space-y-1.5">{children}</div>
            :   null}
        </div>
    );
}

function HouseholdReviewBody({
    review,
    household,
}: {
    review: IntakeReviewPresentation;
    household: IntakeHouseholdCandidate;
}) {
    const invalidPhone = household.household_contacts.some(
        (c) => c.kind === "phone" && c.validation_state === "invalid",
    );

    return (
        <div className="space-y-4" data-testid="intake-household-review-body">
            {review.parents.length > 0 ?
                <ReviewSection title="Parents / Guardians" testId="intake-household-review-parents">
                    {review.parents.map((parent, index) => (
                        <PersonCard
                            key={parent.candidate_id}
                            name={parent.display_name}
                            isPrimary={parent.is_primary}
                            needsReview={parent.needs_review}
                            badges={
                                index === 0 ?
                                    <ContactBadges
                                        emails={parent.emails}
                                        phones={parent.phones}
                                        invalidPhone={invalidPhone}
                                    />
                                :   null
                            }
                        />
                    ))}
                </ReviewSection>
            :   null}

            {review.children.length > 0 ?
                <ReviewSection title="Children" testId="intake-household-review-children">
                    {review.children.map((child) => {
                        const detailParts = [
                            child.dob ? `DOB ${formatDobForDisplay(child.dob)}` : null,
                            child.age_display ? `Age ${child.age_display}` : null,
                        ].filter(Boolean);
                        return (
                            <PersonCard
                                key={child.candidate_id}
                                name={child.display_name}
                                detail={detailParts.join(" — ") || null}
                                isPrimary={child.is_primary}
                                needsReview={child.needs_review}
                            />
                        );
                    })}
                </ReviewSection>
            :   null}

            {review.address_lines.length > 0 ?
                <ReviewSection title="Address" testId="intake-household-review-address">
                    {review.address_lines.map((line) => (
                        <p key={line} className="text-[12px] text-alloy-midnight/70">
                            {line}
                        </p>
                    ))}
                </ReviewSection>
            :   null}

            {(review.program_interest ||
                review.start_date ||
                review.source ||
                review.notes ||
                review.location_label) ?
                <ReviewSection
                    title="Additional intake details"
                    defaultOpen={false}
                    testId="intake-household-review-details"
                >
                    {review.location_resolved_label || review.location_label ?
                        <p className="text-[12px] text-alloy-midnight/70">
                            <span className="font-medium">Location:</span>{" "}
                            {review.location_resolved_label ?? review.location_label}
                        </p>
                    :   null}
                    {review.program_interest ?
                        <p className="text-[12px] text-alloy-midnight/70">
                            <span className="font-medium">Program:</span> {review.program_interest}
                        </p>
                    :   null}
                    {review.start_date ?
                        <p className="text-[12px] text-alloy-midnight/70">
                            <span className="font-medium">Start date:</span> {review.start_date}
                        </p>
                    :   null}
                    {review.source ?
                        <p className="text-[12px] text-alloy-midnight/70">
                            <span className="font-medium">Source:</span> {review.source}
                        </p>
                    :   null}
                    {review.notes ?
                        <p className="text-[12px] text-alloy-midnight/70">
                            <span className="font-medium">Notes:</span> {review.notes}
                        </p>
                    :   null}
                </ReviewSection>
            :   null}
        </div>
    );
}

/** Compact household graph review for multi-record intake (shared intake engine presentation). */
export function IntakeHouseholdReviewPanel({ household, className = "" }: Props) {
    const review = buildIntakeReviewPresentation(household);
    if (!review || !household) return null;

    return (
        <section
            className={`rounded-xl border border-alloy-stone/10 bg-[#FAFBFC] p-3 ${className}`}
            data-testid="intake-household-review-panel"
        >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/45">
                Household detected
            </p>
            <div className="mt-3">
                <HouseholdReviewBody review={review} household={household} />
            </div>
        </section>
    );
}

export { buildIntakeReviewPresentation };
