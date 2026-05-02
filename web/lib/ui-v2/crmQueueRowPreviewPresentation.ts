/**
 * Shared CRM compact queue row presentation: structured contact + date/tour captions.
 * Driven by queue `row_preview.fields` (want()) and `row_preview.field_labels`.
 */

import type { CrmCompactRowSemanticSlots } from "@/lib/ui-v2/workspace-types";
import { formatDateUsShortHyphenUtc, formatPhoneUS, formatQueuePreviewTourTimingUtc } from "@/lib/adminFormatters";
import type { QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";
import { mergeQueueRowPreviewFieldLabels } from "@/lib/ui-v2/queueUiConfig";

export function stripTourContextValuePrefix(raw: string | null | undefined): string {
    const t = (raw ?? "").trim();
    if (!t) return "";
    return t.replace(/^Tour:\s*/i, "").trim() || t;
}

function deriveStructuredContactFromQueueRow(
    row: Record<string, unknown>,
    want: (f: QueueUiRowPreviewField) => boolean
): Pick<CrmCompactRowSemanticSlots, "contactDisplayName" | "contactPhoneDisplay" | "contactEmail" | "contactSnippet"> {
    const contactLine =
        typeof row._primary_contact_line === "string" ? row._primary_contact_line.trim() : "";
    const emailRaw = typeof row._primary_email === "string" ? row._primary_email.trim() : "";
    const phoneRaw = typeof row._primary_phone === "string" ? row._primary_phone.trim() : "";

    const wantPrimary = want("primary_contact");
    const wantPhone = want("phone");
    const wantEmail = want("email");

    const em = wantEmail ? emailRaw : "";
    const phoneFmt = wantPhone && phoneRaw ? formatPhoneUS(phoneRaw) : "";
    const phoneOk = phoneFmt && phoneFmt !== "—" ? phoneFmt : "";
    const phoneDigits = phoneRaw.replace(/\D/g, "");

    const isPhoneToken = (p: string) => {
        const d = p.replace(/\D/g, "");
        if (d.length < 10) return false;
        return d === phoneDigits || (phoneDigits.length >= 10 && d === phoneDigits.slice(-10));
    };
    const isEmailToken = (p: string) =>
        p.includes("@") || (em.length > 0 && p.toLowerCase() === em.toLowerCase());

    let contactDisplayName: string | null = null;
    if (wantPrimary && contactLine) {
        const parts = contactLine.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
        const nameParts: string[] = [];
        for (const p of parts) {
            if (wantEmail && isEmailToken(p)) continue;
            if (wantPhone && isPhoneToken(p)) continue;
            if (p.includes("@")) continue;
            if (/^[\d\s\-+().]+$/.test(p) && p.replace(/\D/g, "").length >= 10) continue;
            nameParts.push(p);
        }
        contactDisplayName = nameParts.join(" ").trim() || null;
        if (!contactDisplayName && parts.length === 1) {
            const only = parts[0]!;
            if (!isEmailToken(only) && !isPhoneToken(only)) contactDisplayName = only;
        }
    }

    const contactEmail = em || null;
    const contactPhoneDisplay = phoneOk || null;

    const structuredAny = Boolean(
        (contactDisplayName && contactDisplayName.trim()) || contactPhoneDisplay || contactEmail
    );

    const snippetParts = [
        wantPrimary && contactDisplayName ? contactDisplayName : "",
        wantPhone && phoneOk ? phoneOk : "",
        wantEmail && em ? em : "",
    ].filter(Boolean);

    const contactSnippet = structuredAny
        ? null
        : snippetParts.length > 0
          ? snippetParts.join(" · ")
          : wantPrimary && contactLine
            ? contactLine
            : null;

    return {
        contactDisplayName: contactDisplayName?.trim() || null,
        contactPhoneDisplay,
        contactEmail,
        contactSnippet,
    };
}

export function buildCrmQueueRowPreviewPresentation(
    row: Record<string, unknown>,
    want: (f: QueueUiRowPreviewField) => boolean,
    rowPreviewFieldLabels?: Record<string, string> | null
): Pick<
    CrmCompactRowSemanticSlots,
    | "contactDisplayName"
    | "contactPhoneDisplay"
    | "contactEmail"
    | "contactSnippet"
    | "desiredStartDateDisplay"
    | "timingDesiredStartAndTourLine"
    | "ageBandContext"
    | "tourContext"
    | "ageContext"
    | "rowPreviewLabelPrimaryContact"
    | "rowPreviewLabelDesiredStartDate"
    | "rowPreviewLabelTourDate"
    | "rowPreviewLabelAgeBand"
> {
    const labels = mergeQueueRowPreviewFieldLabels(rowPreviewFieldLabels);
    const contact = deriveStructuredContactFromQueueRow(row, want);

    const desiredRaw =
        typeof row._desired_start_date === "string" ? row._desired_start_date.trim() : "";
    const desiredFormatted =
        want("desired_start_date") && desiredRaw ? formatDateUsShortHyphenUtc(desiredRaw) : null;
    const desiredBad = desiredFormatted === "—" || !desiredFormatted?.trim();
    const desiredStartDateDisplay = desiredBad ? null : desiredFormatted;

    const ageBandRaw = typeof row._age_band === "string" ? row._age_band.trim() : "";
    const ageBandContext = ageBandRaw || null;

    const tourPrimary = typeof row._tour_context === "string" ? row._tour_context.trim() : "";
    const tourAlt = typeof row._tour_timing === "string" ? row._tour_timing.trim() : "";
    const tourRaw = tourPrimary || tourAlt;
    const tourStripped = tourRaw ? stripTourContextValuePrefix(tourRaw) : "";
    const tourFormatted =
        want("tour_date") && tourStripped ? formatQueuePreviewTourTimingUtc(tourStripped) : "";
    const tourDisplay = tourFormatted.trim() || null;

    const wantDesired = want("desired_start_date");
    const wantTour = want("tour_date");
    const hasDesired = Boolean(wantDesired && desiredStartDateDisplay);
    const hasTour = Boolean(wantTour && tourDisplay);

    let timingDesiredStartAndTourLine: string | null = null;
    let desiredOut: string | null = wantDesired ? desiredStartDateDisplay : null;
    let tourOut: string | null = wantTour ? tourDisplay : null;

    if (hasDesired && hasTour && labels.desired_start_date && labels.tour_date) {
        timingDesiredStartAndTourLine = `${labels.desired_start_date}: ${desiredOut}    •    ${labels.tour_date}: ${tourOut}`;
        desiredOut = null;
        tourOut = null;
    }

    return {
        ...contact,
        desiredStartDateDisplay: desiredOut,
        timingDesiredStartAndTourLine,
        ageBandContext,
        tourContext: tourOut,
        ageContext: null,
        rowPreviewLabelPrimaryContact: labels.primary_contact ?? null,
        rowPreviewLabelDesiredStartDate: labels.desired_start_date ?? null,
        rowPreviewLabelTourDate: labels.tour_date ?? null,
        rowPreviewLabelAgeBand: labels.age_band ?? null,
    };
}
