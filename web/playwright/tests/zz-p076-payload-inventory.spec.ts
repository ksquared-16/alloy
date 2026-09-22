import { test } from "@playwright/test";

/**
 * WHERE DO THE ~198KB GO, AND IS ANY TRUTH SERIALIZED TWICE?
 *
 * Measured from the ACTUAL serialized document. An in-memory object graph does not answer what
 * crosses the wire.
 *
 * Duplication must be asserted from DISTINCT KEY IDENTITY, not from substring occurrence. A
 * substring count conflates one fact serialized N times with N sibling fields sharing a prefix
 * (primary_contact / primary_contact_id / primary_contact_name), so it cannot support the claim.
 * Here every occurrence is resolved to its full key token first, then counted.
 */
test("p076 payload inventory", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded" });

    const out = await page.evaluate(async (target) => {
        const res = await fetch(target, { credentials: "include" });
        const raw = await res.text();
        const status = res.status;
        const finalUrl = res.url;
        const head = raw.slice(0, 200);
        const rawBytes = new TextEncoder().encode(raw).length;

        // The flight payload is JSON-escaped inside script string literals. Decode it so key
        // tokens can be read at their real nesting rather than through escape noise.
        let decoded = "";
        const lit = /self\.__next_f\.push\(\[\d+,("(?:[^"\\]|\\.)*")\]\)/g;
        let m: RegExpExecArray | null;
        while ((m = lit.exec(raw)) !== null) {
            try { decoded += JSON.parse(m[1]); } catch { /* skip a chunk we cannot decode */ }
        }
        const decodedBytes = new TextEncoder().encode(decoded).length;

        // Distinct key tokens and their occurrence counts, over the DECODED payload.
        const keyCounts: Record<string, number> = {};
        const keyRe = /"([A-Za-z_][A-Za-z0-9_]{2,60})":/g;
        let k: RegExpExecArray | null;
        while ((k = keyRe.exec(decoded)) !== null) {
            keyCounts[k[1]] = (keyCounts[k[1]] ?? 0) + 1;
        }
        const topKeys = Object.entries(keyCounts).sort((a, b) => b[1] - a[1]).slice(0, 30);

        // How many rows are actually in the payload? Anything counted far above this is a
        // candidate for repetition; anything at or below it is one-per-row and expected.
        const rowIdRe = /"(?:work_unit_id|workUnitId)":/g;
        const rowMarkers = (decoded.match(rowIdRe) ?? []).length;

        // Every distinct key containing the contact prefix, to settle the earlier 23 count.
        const contactKeys = Object.entries(keyCounts).filter(([n]) => n.includes("primary_contact"));
        const seenKeys = Object.entries(keyCounts).filter(([n]) => n.includes("personal_seen"));
        const summaryKeys = Object.entries(keyCounts).filter(([n]) => n.includes("work_summary"));

        // BYTE attribution, not occurrence counts. Counts cannot support a size claim, so the
        // decoded payload is split into flight rows and each row is weighed, then labelled by the
        // distinctive keys it actually contains.
        const rows = decoded.split(/\n(?=[0-9a-f]{1,4}:)/);
        const LABELS: Array<[string, RegExp]> = [
            ["layout_field_placements", /"fieldPlacements"|"fieldRef"|"contextFieldKeys"/],
            ["action_registry", /"outcome_key"|"actionRef"|"effect_label"/],
            ["cohort_rows", /"work_unit_id"|"primary_contact"|"personal_seen"/],
            ["focus_panel_summary", /"focusPanelSummaryDoc"|"headerKpis"/],
            ["work_view_totals", /"workViewTotalsSeed"|"workViewCountTargets"/],
        ];
        const weighed = rows.map((r) => {
            const bytes = new TextEncoder().encode(r).length;
            const labels = LABELS.filter(([, re]) => re.test(r)).map(([n]) => n);
            return { bytes, labels, head: r.slice(0, 60) };
        }).sort((a, b) => b.bytes - a.bytes);
        const byLabel: Record<string, number> = {};
        let unlabelled = 0;
        for (const r of weighed) {
            if (!r.labels.length) { unlabelled += r.bytes; continue; }
            for (const l of r.labels) byLabel[l] = (byLabel[l] ?? 0) + r.bytes;
        }

        // The whole first-order payload rides in ONE flight row, so row granularity cannot
        // attribute it. Walk that row's JSON with a brace/bracket matcher and weigh each key's
        // own value, charging every key only for the bytes it actually spans.
        const biggest = weighed[0]?.head ? rows.find((r) => new TextEncoder().encode(r).length === weighed[0].bytes) ?? "" : "";
        const keyBytes: Record<string, number> = {};
        {
            const kr = /"([A-Za-z_][A-Za-z0-9_]{2,60})":/g;
            let km: RegExpExecArray | null;
            while ((km = kr.exec(biggest)) !== null) {
                let i = km.index + km[0].length;
                while (i < biggest.length && /\s/.test(biggest[i])) i += 1;
                const open = biggest[i];
                let end = i;
                if (open === "{" || open === "[") {
                    const close = open === "{" ? "}" : "]";
                    let depth = 0; let inStr = false; let esc = false;
                    for (let j = i; j < biggest.length; j += 1) {
                        const ch = biggest[j];
                        if (esc) { esc = false; continue; }
                        if (ch === "\\") { esc = true; continue; }
                        if (ch === '"') { inStr = !inStr; continue; }
                        if (inStr) continue;
                        if (ch === open) depth += 1;
                        else if (ch === close) { depth -= 1; if (depth === 0) { end = j + 1; break; } }
                    }
                } else {
                    let j = i; let inStr = false; let esc = false;
                    for (; j < biggest.length; j += 1) {
                        const ch = biggest[j];
                        if (esc) { esc = false; continue; }
                        if (ch === "\\") { esc = true; continue; }
                        if (ch === '"') { inStr = !inStr; continue; }
                        if (!inStr && (ch === "," || ch === "}" || ch === "]")) break;
                    }
                    end = j;
                }
                const span = end - i;
                if (span > 0) keyBytes[km[1]] = (keyBytes[km[1]] ?? 0) + span;
            }
        }
        const topKeyBytes = Object.entries(keyBytes).sort((a, b) => b[1] - a[1]).slice(0, 25);
        const biggestRowBytes = new TextEncoder().encode(biggest).length;

        return {
            biggestRowBytes,
            topKeyBytes,
            topRows: weighed.slice(0, 3),
            bytesByLabel: byLabel,
            unlabelledBytes: unlabelled,
            rowCount: rows.length,
            status,
            finalUrl,
            head,
            rawBytes,
            decodedBytes,
            escapeOverheadBytes: rawBytes - decodedBytes,
            rowMarkers,
            topKeys,
            contactKeys,
            seenKeys,
            summaryKeys,
        };
    }, url);
    console.log(`[payload] ${JSON.stringify(out)}`);
});
