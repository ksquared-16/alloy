/**
 * Lightweight composer markup for the family Activity embed toolbar.
 * Bold / italic / underline use the existing wrap markers; email converts to
 * safe HTML at send time; SMS strips to plain text. Not a second editor.
 */

import { containsUnsafeMarkup, toPlainText } from "@/lib/communications/render/renderOutboundMessage";

const BOLD = /\*\*([^*]+)\*\*/g;
const UNDERLINE = /__([^_]+)__/g;
const ITALIC = /(?<![\w*])_([^_]+)_(?![\w*])/g;

/** Convert composer markers (or safe HTML) to email HTML. Rejects unsafe markup. */
export function composerMarkupToEmailHtml(raw: string): { ok: true; html: string } | { ok: false; reason: string } {
    const trimmed = raw.trim();
    if (/<(strong|em|u|br|p|div|span)\b/i.test(trimmed)) {
        if (containsUnsafeMarkup(trimmed)) {
            return { ok: false, reason: "unsafe_markup" };
        }
        return { ok: true, html: trimmed };
    }
    const escaped = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const withBreaks = escaped.replace(/\r\n|\r|\n/g, "<br>");
    const html = withBreaks
        .replace(BOLD, "<strong>$1</strong>")
        .replace(UNDERLINE, "<u>$1</u>")
        .replace(ITALIC, "<em>$1</em>");
    if (containsUnsafeMarkup(html)) {
        return { ok: false, reason: "unsafe_markup" };
    }
    return { ok: true, html };
}

/** Strip composer markers (and any accidental HTML) for SMS. */
export function composerMarkupToPlainText(raw: string): string {
    const withoutMarkers = raw
        .replace(BOLD, "$1")
        .replace(UNDERLINE, "$1")
        .replace(ITALIC, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    return toPlainText(withoutMarkers);
}

/**
 * Render composer/stored body for bubbles: email may be HTML or markers;
 * SMS/plain always text.
 */
export function formatComposerBodyForDisplay(
    body: string,
    channel: string | null | undefined,
): { kind: "html"; html: string } | { kind: "text"; text: string } {
    const ch = (channel ?? "").toLowerCase();
    if (ch === "sms") {
        return { kind: "text", text: composerMarkupToPlainText(body) };
    }
    const trimmed = body.trim();
    if (/<(strong|em|u|br|p|a)\b/i.test(trimmed)) {
        if (containsUnsafeMarkup(trimmed)) {
            return { kind: "text", text: toPlainText(trimmed) };
        }
        return { kind: "html", html: trimmed };
    }
    const converted = composerMarkupToEmailHtml(body);
    if (!converted.ok) {
        return { kind: "text", text: composerMarkupToPlainText(body) };
    }
    return { kind: "html", html: converted.html };
}
