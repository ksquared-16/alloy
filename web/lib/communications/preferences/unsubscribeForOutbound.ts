/**
 * Which unsubscribe category (if any) an outbound email should carry.
 *
 * Transactional and emergency mail never get a link: the evaluator exempts them
 * from opt-out, so an unsubscribe control would either lie or do nothing.
 * Marketing and operational email may be unsubscribed by the recipient.
 */

import type { MessageCategory } from "@/lib/communications/eligibility/types";
import {
    isRecipientUnsubscribable,
    type UnsubscribableCategory,
} from "@/lib/communications/preferences/unsubscribeToken";
import { buildUnsubscribeUrl } from "@/lib/communications/preferences/buildUnsubscribeUrl";

export function unsubscribableCategoryForOutboundEmail(
    messageCategory: MessageCategory | string | null | undefined
): UnsubscribableCategory | null {
    const c = String(messageCategory ?? "").trim();
    if (c === "marketing") return "email_marketing";
    if (c === "operational") return "email_operational";
    return null;
}

export function resolveOutboundUnsubscribeUrl(input: {
    messageCategory: MessageCategory | string | null | undefined;
    personId: string | null | undefined;
    orgId: string;
    origin?: string | null;
    env?: NodeJS.ProcessEnv;
}): { category: UnsubscribableCategory; url: string } | null {
    const category = unsubscribableCategoryForOutboundEmail(input.messageCategory);
    if (!category || !isRecipientUnsubscribable(category)) return null;
    const personId = String(input.personId ?? "").trim();
    if (!personId) return null;
    const url = buildUnsubscribeUrl({
        personId,
        orgId: input.orgId,
        category,
        origin: input.origin,
        env: input.env,
    });
    if (!url) return null;
    return { category, url };
}

/** Plain-text footer appended when the body does not already mention unsubscribe. */
export function appendUnsubscribeFooterPlain(body: string, url: string): string {
    if (/unsubscribe/i.test(body) && body.includes(url)) return body;
    const trimmed = body.replace(/\s+$/, "");
    return `${trimmed}\n\n—\nTo stop receiving these emails: ${url}\n`;
}

/** HTML footer; skips when the href is already present. */
export function appendUnsubscribeFooterHtml(html: string, url: string): string {
    if (html.includes(url)) return html;
    const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const footer =
        `<p style="margin-top:1.5rem;font-size:12px;color:#555">` +
        `To stop receiving these emails, <a href="${escaped}">unsubscribe</a>.</p>`;
    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${footer}</body>`);
    }
    return `${html}${footer}`;
}
