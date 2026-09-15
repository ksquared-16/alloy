/**
 * Open a governed Document in a new tab, from an admin surface.
 *
 * ## Two ways this silently did nothing
 *
 * FIRST, THE WRONG KEY. `/api/admin/documents/[id]/signed-url` answers `{ ok, signedUrl }`. Two call
 * sites read `body.url ?? body.data?.url`, which is always `undefined`, so the guard below them
 * never fired and **clicking View document did nothing at all** — no tab, no error, nothing to
 * report. It was found by a person clicking it, which is the only way a silent no-op is ever found.
 *
 * SECOND, THE POPUP BLOCKER. `window.open` called AFTER an `await` has lost the user-gesture context
 * a browser requires, so even with the right URL the tab can be refused. The tab is therefore opened
 * synchronously on the click and navigated once the signed URL arrives; a blocked-open is reported
 * rather than assumed to have worked.
 *
 * THIRD, AND THIS IS WHY THE SECOND FIX DID NOT WORK: `noopener` MAKES `window.open` RETURN NULL.
 * That is the specified behaviour, not a browser quirk — severing the opener relationship is exactly
 * what discards the handle. Opening with `"noopener,noreferrer"` therefore produced `tab === null`
 * on EVERY browser and EVERY click, so the code below always took the "your browser blocked it"
 * branch and the tab it had just opened was never navigated anywhere. Measured in Chromium against
 * the production QA build: `window.open("", "_blank", "noopener,noreferrer")` -> null, while
 * `window.open("", "_blank")` -> a handle, with no popup blocking in play. The first fix turned a
 * silent no-op into a misleading error message; the document still never opened.
 *
 * So the handle is kept — it is the only way to navigate the tab — and `opener` is severed straight
 * after the navigation is issued, which is the same protection `noopener` was there to provide.
 *
 * One helper, so both call sites cannot drift apart again — which is exactly how they came to share
 * the same defect.
 */

export type OpenGovernedDocumentResult = { ok: true } | { ok: false; message: string };

export async function openGovernedDocument(documentId: string): Promise<OpenGovernedDocumentResult> {
    const id = (documentId ?? "").trim();
    if (!id) return { ok: false, message: "There is no document on this step yet." };

    // Synchronously, while the click is still the reason anything is happening.
    const tab = typeof window !== "undefined" ? window.open("", "_blank") : null;

    try {
        const res = await fetch(`/api/admin/documents/${encodeURIComponent(id)}/signed-url`, {
            credentials: "same-origin",
        });
        const body = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            signedUrl?: string;
            error?: string;
        };

        if (!res.ok || !body.signedUrl) {
            tab?.close();
            return { ok: false, message: body.error ?? "The document could not be opened." };
        }

        if (tab) {
            tab.location.href = body.signedUrl;
            // Severed only now: the handle had to survive long enough to navigate.
            try { tab.opener = null; } catch { /* cross-origin once navigated; already harmless */ }
            return { ok: true };
        }

        // The browser refused the tab. Say so instead of leaving a dead click.
        return {
            ok: false,
            message: "Your browser blocked the new tab. Allow pop-ups for this site and try again.",
        };
    } catch (e) {
        tab?.close();
        return { ok: false, message: (e as Error).message || "The document could not be opened." };
    }
}
