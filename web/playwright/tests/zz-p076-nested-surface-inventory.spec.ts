import { test } from "@playwright/test";

/**
 * WHERE DOES nestedSurfaces ACTUALLY LIVE, AND WHAT IS INSIDE IT?
 *
 * A previous report placed nestedSurfaces under focusPanelOperationalProjection. The source says
 * it is published layout CONFIG at focusPanelSummaryDoc.metadata.nestedSurfaces. This probe
 * settles the containment from the payload itself rather than from either claim, then weighs the
 * config field by field so the first-order contract can be adjudicated per field instead of per
 * surface name.
 */
test("p076 nested surface inventory", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded" });

    const out = await page.evaluate(async (target) => {
        const res = await fetch(target, { credentials: "include" });
        const raw = await res.text();
        let decoded = "";
        const lit = /self\.__next_f\.push\(\[\d+,("(?:[^"\\]|\\.)*")\]\)/g;
        let m: RegExpExecArray | null;
        while ((m = lit.exec(raw)) !== null) {
            try { decoded += JSON.parse(m[1]); } catch { /* undecodable chunk */ }
        }

        // Span of a key's own value, by brace matching from the key.
        const spanOf = (hay: string, key: string, from = 0): { start: number; end: number } | null => {
            const at = hay.indexOf(`"${key}":`, from);
            if (at < 0) return null;
            let i = at + key.length + 3;
            while (i < hay.length && /\s/.test(hay[i])) i += 1;
            const open = hay[i];
            if (open !== "{" && open !== "[") return null;
            const close = open === "{" ? "}" : "]";
            let depth = 0, inStr = false, esc = false;
            for (let j = i; j < hay.length; j += 1) {
                const ch = hay[j];
                if (esc) { esc = false; continue; }
                if (ch === "\\") { esc = true; continue; }
                if (ch === '"') { inStr = !inStr; continue; }
                if (inStr) continue;
                if (ch === open) depth += 1;
                else if (ch === close) { depth -= 1; if (depth === 0) return { start: i, end: j + 1 }; }
            }
            return null;
        };
        const bytes = (s: string) => new TextEncoder().encode(s).length;

        const proj = spanOf(decoded, "focusPanelOperationalProjection");
        const doc = spanOf(decoded, "focusPanelSummaryDoc");
        const nested = spanOf(decoded, "nestedSurfaces");

        const inside = (outer: { start: number; end: number } | null, inner: { start: number; end: number } | null) =>
            !!outer && !!inner && inner.start > outer.start && inner.end <= outer.end;

        const containment = {
            nestedInsideOperationalProjection: inside(proj, nested),
            nestedInsideSummaryDoc: inside(doc, nested),
            projBytes: proj ? bytes(decoded.slice(proj.start, proj.end)) : null,
            docBytes: doc ? bytes(decoded.slice(doc.start, doc.end)) : null,
            nestedBytes: nested ? bytes(decoded.slice(nested.start, nested.end)) : null,
        };

        // Per-surface and per-field weighing inside nestedSurfaces.
        const surfaces: Array<{ id: string; bytes: number; keys: Array<[string, number]> }> = [];
        if (nested) {
            const body = decoded.slice(nested.start, nested.end);
            const idRe = /"([a-z0-9_]+_surface)":/g;
            let im: RegExpExecArray | null;
            while ((im = idRe.exec(body)) !== null) {
                const sp = spanOf(body, im[1], im.index);
                if (!sp) continue;
                const sBody = body.slice(sp.start, sp.end);
                const keys: Record<string, number> = {};
                const kr = /"([A-Za-z_][A-Za-z0-9_]{2,60})":/g;
                let km: RegExpExecArray | null;
                while ((km = kr.exec(sBody)) !== null) {
                    const ks = spanOf(sBody, km[1], km.index);
                    if (ks) keys[km[1]] = (keys[km[1]] ?? 0) + bytes(sBody.slice(ks.start, ks.end));
                }
                surfaces.push({
                    id: im[1],
                    bytes: bytes(sBody),
                    keys: Object.entries(keys).sort((a, b) => b[1] - a[1]).slice(0, 12),
                });
            }
        }
        return { containment, surfaces: surfaces.sort((a, b) => b.bytes - a.bytes) };
    }, url);
    console.log(`[nested] ${JSON.stringify(out)}`);
});
