/**
 * CRM compact queue row — presentation only. Sources: queue enrichment fields + `row_preview` gates/labels.
 * @see docs/architecture/workspace-work-unit-scope-doctrine.md (work-unit queue record row doctrine)
 */

import type {
    CrmCompactChildLineVm,
    CrmCompactRowSemanticSlots,
    WorkUnitQueueCrmFactGroupVm,
    WorkUnitQueueCrmFactLineVm,
    WorkUnitQueueCrmFactPartVm,
    WorkUnitQueueCrmFactColumnGridVm,
    WorkUnitQueueCrmTimingSegmentVm,
} from "@/lib/ui-v2/workspace-types";
import { formatDateUsShortHyphenUtc, formatPhoneUS, formatQueuePreviewTourTimingUtc } from "@/lib/adminFormatters";
import type { QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";
import { mergeQueueRowPreviewFieldLabels } from "@/lib/ui-v2/queueUiConfig";

/** Legacy middot join for flat strings only (e.g. `crmCompactTimingValueLine`, snippets). Not for flex layout. */
export const CRM_COMPACT_VALUE_DOT_SEP = " · ";

function joinFactPartsForLegacyString(parts: WorkUnitQueueCrmFactPartVm[]): string {
  return parts
    .map((p) => (typeof p === "string" ? p : `${p.label} ${p.value}`.trim()))
    .join(CRM_COMPACT_VALUE_DOT_SEP);
}

export function stripTourContextValuePrefix(raw: string | null | undefined): string {
    const t = (raw ?? "").trim();
    if (!t) return "";
    return t.replace(/^Tour:\s*/i, "").trim() || t;
}

/** Drop redundant `· Ages …` chunks when age is already implied by the program label. */
export function dedupeRedundantProgramAgeInPreview(text: string): string {
    const t = text.trim();
    if (!t) return "";
    const parts = t
        .split(/\s*·\s*/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    if (parts.length < 2) return t;
    const isAgeFragment = (p: string) => /^Ages?\s/i.test(p) || /^age\s*[:/]/i.test(p);
    const kept: string[] = [];
    for (const p of parts) {
        if (!isAgeFragment(p)) {
            kept.push(p);
            continue;
        }
        const ageTail = p
            .replace(/^Ages?\s*/i, "")
            .replace(/\s/g, "")
            .toLowerCase();
        const redundant = kept.some((k) => {
            const kn = k.replace(/\s/g, "").toLowerCase();
            if (!ageTail || ageTail.length < 4) return false;
            return kn.includes(ageTail) || kn.includes(ageTail.replace(/[–—-]/g, ""));
        });
        if (!redundant) kept.push(p);
    }
    return kept.length ? kept.join(" · ") : t;
}

export function refineCrmCompactChildLinesForPreview(
    lines: CrmCompactChildLineVm[],
    familyProgram: string | null | undefined,
    opts: { attachFamilyWhenMissing: boolean }
): CrmCompactChildLineVm[] {
    const fam = (familyProgram ?? "").trim() ? dedupeRedundantProgramAgeInPreview(String(familyProgram)) : "";
    return lines.map((line) => {
        const sec = (line.secondary ?? "").trim() ? dedupeRedundantProgramAgeInPreview(String(line.secondary)) : "";
        let programInline = sec || null;
        if (!programInline && opts.attachFamilyWhenMissing && fam) programInline = fam;
        return { ...line, programInline: programInline || null };
    });
}

/** Parse `_crm_compact_children` / drawer-shaped line objects on queue rows. */
export function parseQueueRowCrmChildrenStructured(raw: unknown): CrmCompactChildLineVm[] {
    if (!Array.isArray(raw)) return [];
    const out: CrmCompactChildLineVm[] = [];
    for (const x of raw) {
        if (x === null || typeof x !== "object") continue;
        const o = x as Record<string, unknown>;
        const primary =
            typeof o.primary === "string"
                ? o.primary.trim()
                : typeof o.line === "string"
                  ? o.line.trim()
                  : "";
        if (!primary) continue;
        const secondary =
            typeof o.secondary === "string"
                ? o.secondary.trim()
                : typeof o.detail === "string"
                  ? o.detail.trim()
                  : null;
        out.push({ primary, secondary: secondary || null });
    }
    return out;
}

/** `_child_display_name` from enrichment, else `metadata.child_name` (queue preview may omit structured children). */
export function extractCrmChildDisplayLineFromQueueRow(row: Record<string, unknown>): string {
    const a = typeof row._child_display_name === "string" ? row._child_display_name.trim() : "";
    if (a) return a;
    const md = row.metadata;
    if (md && typeof md === "object" && md !== null && "child_name" in md) {
        const cn = (md as { child_name?: unknown }).child_name;
        if (typeof cn === "string" && cn.trim()) return cn.trim();
    }
    return "";
}

/**
 * Live work-unit row: prefer parsed structured children; otherwise a single display line so the Child column
 * matches Program when preview join skips OCM.
 */
export function deriveCrmCompactChildrenLinesForWorkUnitRow(params: {
    want: (f: QueueUiRowPreviewField) => boolean;
    crmChildrenParsed: CrmCompactChildLineVm[];
    childDisplayLine: string;
    programFamily: string | null;
}): CrmCompactChildLineVm[] | null {
    if (!params.want("child_name")) return null;
    const fam = params.want("program") ? params.programFamily : null;
    const opts = { attachFamilyWhenMissing: params.want("program") };
    if (params.crmChildrenParsed.length >= 1) {
        return refineCrmCompactChildLinesForPreview(params.crmChildrenParsed, fam, opts);
    }
    const c = params.childDisplayLine.trim();
    if (!c) return null;
    return refineCrmCompactChildLinesForPreview([{ primary: c, secondary: null }], fam, opts);
}

export function devWarnIfCrmCompactChildMissingWithProgramDev(
    row: Record<string, unknown>,
    want: (f: QueueUiRowPreviewField) => boolean,
    childrenLines: CrmCompactChildLineVm[] | null | undefined,
    childNameSingle: string | null | undefined,
    programDeduped: string | null | undefined
): void {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
    if (!want("child_name") || !want("program")) return;
    const prog = (programDeduped ?? "").trim();
    if (!prog) return;
    const hasChild = (childrenLines?.length ?? 0) > 0 || Boolean((childNameSingle ?? "").trim());
    if (hasChild) return;
    const rid = typeof row.id === "string" ? row.id : "?";
    console.warn(
        "[crm-compact][dev] Child column empty while Program has text — check `_child_display_name`, `metadata.child_name`, `_crm_compact_children`.",
        { rowId: rid }
    );
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
          ? snippetParts.join(CRM_COMPACT_VALUE_DOT_SEP)
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

/** Structured contact row (gates); falls back to snippet string when enrichment is flat only. */
export function buildCrmContactFactLine(
    row: Record<string, unknown>,
    want: (f: QueueUiRowPreviewField) => boolean
): WorkUnitQueueCrmFactLineVm | null {
    const c = deriveStructuredContactFromQueueRow(row, want);
    const parts: string[] = [];
    if (want("primary_contact") && c.contactDisplayName?.trim()) parts.push(c.contactDisplayName.trim());
    if (want("phone") && c.contactPhoneDisplay?.trim()) parts.push(c.contactPhoneDisplay.trim());
    if (want("email") && c.contactEmail?.trim()) parts.push(c.contactEmail.trim());
    if (parts.length) return { parts };
    if (c.contactSnippet?.trim()) return c.contactSnippet.trim();
    return null;
}

/** One flat line for non-UI summaries (legacy string fields). */
export function buildCrmContactDotLine(row: Record<string, unknown>, want: (f: QueueUiRowPreviewField) => boolean): string | null {
    const line = buildCrmContactFactLine(row, want);
    if (!line) return null;
    if (typeof line === "string") return line;
    return joinFactPartsForLegacyString(line.parts);
}

function computeCrmTimingSegments(
    row: Record<string, unknown>,
    want: (f: QueueUiRowPreviewField) => boolean,
    labels: Record<string, string>
): WorkUnitQueueCrmTimingSegmentVm[] | null {
    const wantD = want("desired_start_date");
    const wantT = want("tour_date");
    if (!wantD && !wantT) return null;

    const desiredRaw =
        typeof row._desired_start_date === "string" ? row._desired_start_date.trim() : "";
    const desiredFormatted = wantD && desiredRaw ? formatDateUsShortHyphenUtc(desiredRaw) : null;
    const desiredVal =
        wantD && desiredFormatted && desiredFormatted !== "—" && desiredFormatted.trim()
            ? desiredFormatted
            : wantD
              ? "—"
              : "";

    const tourPrimary = typeof row._tour_context === "string" ? row._tour_context.trim() : "";
    const tourAlt = typeof row._tour_timing === "string" ? row._tour_timing.trim() : "";
    const tourRaw = tourPrimary || tourAlt;
    const tourStripped = tourRaw ? stripTourContextValuePrefix(tourRaw) : "";
    const tourFormatted = wantT && tourStripped ? formatQueuePreviewTourTimingUtc(tourStripped) : "";
    const tourVal = wantT ? (tourFormatted.trim() ? tourFormatted : "—") : "";

    const segments: WorkUnitQueueCrmTimingSegmentVm[] = [];
    if (wantD && labels.desired_start_date) {
        segments.push({ label: labels.desired_start_date, value: desiredVal });
    }
    if (wantT && labels.tour_date) {
        segments.push({ label: labels.tour_date, value: tourVal });
    }
    return segments.length ? segments : null;
}

export type BuildCrmCompactWorkUnitFactGroupsParams = {
    row: Record<string, unknown>;
    want: (f: QueueUiRowPreviewField) => boolean;
    rowPreviewFieldLabels?: Record<string, string> | null;
    childrenLines?: CrmCompactChildLineVm[] | null;
    childNameSingle?: string | null;
    programSingle?: string | null;
    roomContext?: string | null;
    ageBandContext?: string | null;
};

function buildContactFactGroupColumnOrLegacy(
    row: Record<string, unknown>,
    want: (f: QueueUiRowPreviewField) => boolean,
    labels: Record<string, string>
): WorkUnitQueueCrmFactGroupVm | null {
    if (!want("primary_contact") && !want("phone") && !want("email")) return null;
    const c = deriveStructuredContactFromQueueRow(row, want);
    const structuredAny = Boolean(
        (c.contactDisplayName?.trim() ?? "") || c.contactPhoneDisplay || c.contactEmail
    );
    if (!structuredAny && c.contactSnippet?.trim()) {
        return {
            kind: "contact",
            label: labels.primary_contact ?? "Contact",
            lines: [c.contactSnippet.trim()],
        };
    }
    const cols: { key: string; header: string; value: string }[] = [];
    if (want("primary_contact")) {
        cols.push({
            key: "primary_contact",
            header: labels.primary_contact ?? "Contact",
            value: (c.contactDisplayName?.trim() ?? "") || "—",
        });
    }
    if (want("phone")) {
        cols.push({
            key: "phone",
            header: labels.phone ?? "Phone",
            value: (c.contactPhoneDisplay?.trim() ?? "") || "—",
        });
    }
    if (want("email")) {
        cols.push({
            key: "email",
            header: labels.email ?? "Email",
            value: (c.contactEmail?.trim() ?? "") || "—",
        });
    }
    if (!cols.length) return null;
    const grid: WorkUnitQueueCrmFactColumnGridVm = {
        headers: cols.map((x) => x.header),
        rows: [cols.map((x) => x.value)],
        columnKeys: cols.map((x) => x.key),
    };
    return {
        kind: "contact",
        label: "",
        columnGrid: grid,
    };
}

/**
 * Work-unit queue record row — middle-zone fact groups (doctrine).
 * Contact / timing / children use field columns; meta stays label + line; legacy flat contact uses one line.
 */
export function buildCrmCompactWorkUnitFactGroups(params: BuildCrmCompactWorkUnitFactGroupsParams): WorkUnitQueueCrmFactGroupVm[] {
    const labels = mergeQueueRowPreviewFieldLabels(params.rowPreviewFieldLabels);
    const { want, row } = params;
    const out: WorkUnitQueueCrmFactGroupVm[] = [];

    const contactGroup = buildContactFactGroupColumnOrLegacy(row, want, labels);
    if (contactGroup) out.push(contactGroup);

    const childLabelChild = labels.child_name ?? "Child";
    const childLabelProgram = labels.program ?? "Program";
    const childLines = params.childrenLines;
    const maxChildRows = 30;

    if (want("child_name") && childLines != null && childLines.length > 0) {
        const list = childLines;
        const visible = list.length > maxChildRows ? list.slice(0, maxChildRows) : list;
        const overflow = list.length - visible.length;
        const headers = want("program") ? [childLabelChild, childLabelProgram] : [childLabelChild];
        const rows: string[][] = visible.map((ch) => {
            if (want("program")) {
                const prog = ch.programInline?.trim() ?? "";
                return [ch.primary, prog || "—"];
            }
            return [ch.primary];
        });
        if (overflow > 0) {
            rows.push([`+${overflow} more`, ...(want("program") ? [""] : [])]);
        }
        const columnKeys = want("program") ? (["child_name", "program"] as const) : (["child_name"] as const);
        out.push({
            kind: "children_programs",
            label: "",
            columnGrid: { headers, rows, columnKeys: [...columnKeys] },
        });
    } else if (want("child_name") || want("program")) {
        const name = want("child_name") ? (params.childNameSingle ?? "").trim() : "";
        const prog = want("program") ? (params.programSingle ?? "").trim() : "";
        if (want("child_name") && want("program")) {
            out.push({
                kind: "children_programs",
                label: "",
                columnGrid: {
                    headers: [childLabelChild, childLabelProgram],
                    rows: [[name || "—", prog || "—"]],
                    columnKeys: ["child_name", "program"],
                },
            });
        } else if (want("child_name")) {
            out.push({
                kind: "children_programs",
                label: "",
                columnGrid: { headers: [childLabelChild], rows: [[name || "—"]], columnKeys: ["child_name"] },
            });
        } else {
            out.push({
                kind: "children_programs",
                label: "",
                columnGrid: { headers: [childLabelProgram], rows: [[prog || "—"]], columnKeys: ["program"] },
            });
        }
    }

    const timingSegments = computeCrmTimingSegments(row, want, labels);
    if (timingSegments?.length) {
        out.push({
            kind: "timing",
            label: "",
            columnGrid: {
                headers: timingSegments.map((s) => s.label),
                rows: [timingSegments.map((s) => s.value)],
                columnKeys: timingSegments.map((_, i) => `timing_${i}`),
            },
        });
    }

    if (params.roomContext?.trim()) {
        out.push({
            kind: "meta",
            label: labels.room ?? "Room",
            lines: [params.roomContext.trim()],
        });
    }
    if (params.ageBandContext?.trim()) {
        out.push({
            kind: "meta",
            label: labels.age_band ?? "Age band",
            lines: [params.ageBandContext.trim()],
        });
    }

    return out;
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
    | "ageBandContext"
    | "tourContext"
    | "crmCompactTimingValueLine"
    | "rowPreviewLabelTimingGroup"
    | "crmChildrenProgramsGroupLabel"
    | "rowPreviewLabelProgramInline"
    | "ageContext"
    | "rowPreviewLabelPrimaryContact"
    | "rowPreviewLabelPhone"
    | "rowPreviewLabelEmail"
    | "rowPreviewLabelDesiredStartDate"
    | "rowPreviewLabelTourDate"
    | "rowPreviewLabelAgeBand"
> {
    const labels = mergeQueueRowPreviewFieldLabels(rowPreviewFieldLabels);
    const contact = deriveStructuredContactFromQueueRow(row, want);

    const wantD = want("desired_start_date");
    const wantT = want("tour_date");

    const desiredRaw =
        typeof row._desired_start_date === "string" ? row._desired_start_date.trim() : "";
    const desiredFormatted = wantD && desiredRaw ? formatDateUsShortHyphenUtc(desiredRaw) : null;
    const desiredVal =
        wantD && desiredFormatted && desiredFormatted !== "—" && desiredFormatted.trim()
            ? desiredFormatted
            : wantD
              ? "—"
              : null;

    const ageBandRaw = typeof row._age_band === "string" ? row._age_band.trim() : "";
    const ageBandContext = ageBandRaw || null;

    const tourPrimary = typeof row._tour_context === "string" ? row._tour_context.trim() : "";
    const tourAlt = typeof row._tour_timing === "string" ? row._tour_timing.trim() : "";
    const tourRaw = tourPrimary || tourAlt;
    const tourStripped = tourRaw ? stripTourContextValuePrefix(tourRaw) : "";
    const tourFormatted = wantT && tourStripped ? formatQueuePreviewTourTimingUtc(tourStripped) : "";
    const tourVal = wantT ? (tourFormatted.trim() ? tourFormatted : "—") : null;

    const timingSegments = computeCrmTimingSegments(row, want, labels);
    const crmCompactTimingValueLine = timingSegments?.length
        ? timingSegments.map((s) => `${s.label}: ${s.value}`.trim()).join(CRM_COMPACT_VALUE_DOT_SEP)
        : null;

    return {
        ...contact,
        desiredStartDateDisplay: wantD ? desiredVal : null,
        ageBandContext,
        tourContext: wantT ? tourVal : null,
        crmCompactTimingValueLine,
        rowPreviewLabelTimingGroup: labels.timing ?? null,
        crmChildrenProgramsGroupLabel: labels.children_programs ?? null,
        rowPreviewLabelProgramInline: labels.program_inline ?? null,
        ageContext: null,
        rowPreviewLabelPrimaryContact: labels.primary_contact ?? null,
        rowPreviewLabelPhone: labels.phone ?? null,
        rowPreviewLabelEmail: labels.email ?? null,
        rowPreviewLabelDesiredStartDate: labels.desired_start_date ?? null,
        rowPreviewLabelTourDate: labels.tour_date ?? null,
        rowPreviewLabelAgeBand: labels.age_band ?? null,
    };
}

export type WorkUnitQueueCrmCompactRowSlice = {
    multiChildren: boolean;
    childrenLinesForVm: CrmCompactChildLineVm[] | null;
    programDeduped: string | null;
    childDisplayLine: string;
    crmPresentation: ReturnType<typeof buildCrmQueueRowPreviewPresentation>;
    crmFactGroups: WorkUnitQueueCrmFactGroupVm[];
};

/**
 * Live adapter for work-unit queue rows (`page.tsx` CRM compact path): structured children, display fallbacks,
 * fact groups, and dev-only consistency warn when Program is non-empty but Child resolves empty.
 */
export function buildWorkUnitQueueCrmCompactRowSlice(
    row: Record<string, unknown>,
    want: (f: QueueUiRowPreviewField) => boolean,
    rowPreviewFieldLabels?: Record<string, string> | null
): WorkUnitQueueCrmCompactRowSlice {
    const crmChildrenParsed = parseQueueRowCrmChildrenStructured(row._crm_compact_children);
    const multiChildren = Boolean(want("child_name") && crmChildrenParsed.length >= 2);
    const programRaw = typeof row._requested_program === "string" ? row._requested_program.trim() : "";
    const programDeduped =
        programRaw && want("program") ? dedupeRedundantProgramAgeInPreview(programRaw) : null;
    const childDisplayLine = extractCrmChildDisplayLineFromQueueRow(row);
    const childrenLinesForVm = deriveCrmCompactChildrenLinesForWorkUnitRow({
        want,
        crmChildrenParsed,
        childDisplayLine,
        programFamily: programDeduped,
    });
    const crmPresentation = buildCrmQueueRowPreviewPresentation(row, want, rowPreviewFieldLabels);
    const childNameSingleForFacts =
        childrenLinesForVm?.length ? null : !multiChildren ? childDisplayLine || null : null;
    const crmFactGroups = buildCrmCompactWorkUnitFactGroups({
        row,
        want,
        rowPreviewFieldLabels,
        childrenLines: childrenLinesForVm?.length ? childrenLinesForVm : null,
        childNameSingle: childNameSingleForFacts,
        programSingle:
            childrenLinesForVm?.length ? null : multiChildren ? null : want("program") ? programDeduped : null,
        roomContext: null,
        ageBandContext: crmPresentation.ageBandContext ?? null,
    });
    devWarnIfCrmCompactChildMissingWithProgramDev(
        row,
        want,
        childrenLinesForVm,
        childNameSingleForFacts,
        programDeduped
    );
    return {
        multiChildren,
        childrenLinesForVm,
        programDeduped,
        childDisplayLine,
        crmPresentation,
        crmFactGroups,
    };
}
