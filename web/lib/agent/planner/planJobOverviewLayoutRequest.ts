/**
 * Deterministic semantic planner for job record overview layout (P0/P1).
 * Pure: no I/O, no LLM.
 */

import type {
    AmbiguityMarker,
    CatalogBandKey,
    DiffSummary,
    JobOverviewPlannerResult,
    JobOverviewResolutionCatalog,
    ParsedJobOverviewIntent,
    ResolvedFieldRef,
    ResolvedTargetOutcome,
    UnresolvedTargetRef,
} from "@/lib/agent/planner/jobOverviewPlannerTypes";
import { JOB_OVERVIEW_PLANNER_VERSION } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import { JOB_OVERVIEW_RESOLUTION_CATALOG } from "@/lib/agent/planner/jobOverviewResolutionCatalog";
import {
    getOverviewLayoutConfigStoredVersion,
    parseOverviewLayoutConfigStrict,
} from "@/lib/rrs/overview/overviewLayoutConfigStrict";
import {
    getDefaultOverviewLayoutConfig,
    parseOverviewLayoutConfig,
    type OverviewLayoutBandV0,
    type OverviewLayoutConfigV0,
} from "@/lib/rrs/overview/overviewLayoutConfigModel";

export function normalizeJobOverviewRequestText(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[’']/g, "'");
}

function longestSynonymHit(
    normalizedText: string,
    synonyms: readonly string[]
): { phrase: string; len: number } | null {
    let bestLen = 0;
    let bestPhrase = "";
    for (const syn of synonyms) {
        const s = syn.toLowerCase();
        if (!s.length) continue;
        let idx = normalizedText.indexOf(s);
        while (idx !== -1) {
            const before = idx === 0 ? " " : normalizedText[idx - 1]!;
            const after =
                idx + s.length >= normalizedText.length ? " " : normalizedText[idx + s.length]!;
            const boundaryOk = !/\w/.test(before) && !/\w/.test(after);
            if (boundaryOk && s.length >= bestLen) {
                bestLen = s.length;
                bestPhrase = syn;
            }
            idx = normalizedText.indexOf(s, idx + 1);
        }
    }
    return bestLen > 0 ? { phrase: bestPhrase, len: bestLen } : null;
}

/** Exported for phrase → field tests; longest synonym wins per field key. */
export function resolveCatalogFieldsInText(
    normalizedText: string,
    catalog: JobOverviewResolutionCatalog
): ResolvedFieldRef[] {
    const hits: ResolvedFieldRef[] = [];
    for (const f of catalog.system_fields) {
        const hit = longestSynonymHit(normalizedText, f.synonyms);
        if (hit) {
            hits.push({
                phrase_matched: hit.phrase,
                field_key: f.key,
                confidence: "high",
            });
        }
    }
    const byKey = new Map<string, ResolvedFieldRef>();
    for (const h of hits) {
        byKey.set(h.field_key, h);
    }
    return [...byKey.values()];
}

/** Phrases that match capability gaps (no config keys to emit). */
export function resolveCatalogCapabilityGapsInText(
    normalizedText: string,
    catalog: JobOverviewResolutionCatalog
): UnresolvedTargetRef[] {
    const out: UnresolvedTargetRef[] = [];
    const seen = new Set<string>();
    for (const g of catalog.capability_gaps) {
        const hit = longestSynonymHit(normalizedText, g.synonyms);
        if (hit && !seen.has(g.id)) {
            seen.add(g.id);
            out.push({
                concept_id: g.id,
                phrase_matched: hit.phrase,
                reason: g.reason,
            });
        }
    }
    return out;
}

/**
 * Rule-based intent flags for the narrow v1 utterance set.
 * Exported for unit tests.
 */
export function detectJobOverviewIntentFlags(normalizedText: string): ParsedJobOverviewIntent {
    const hideVerb = /\b(hide|remove|collapse|turn off|get rid of)\b/.test(normalizedText);
    const showVerb = /\b(show|display|reveal|turn on|include|add|see|want|give)\b/.test(normalizedText);
    const finWord =
        /\b(financial|finance|money|pricing|billing|invoice|payment|cost)\b/.test(normalizedText);

    const hide_financial =
        (hideVerb && finWord) ||
        /\bno\b\s+\b(financial|money|pricing)\b/.test(normalizedText) ||
        /\b(financial|money)\s+\b(off|gone)\b/.test(normalizedText);

    const show_financial =
        /\b(show|display|reveal|include|add)\b[^.]{0,48}\b(financial|finance|money|pricing|billing|invoice|payment|cost)\b/.test(
            normalizedText
        ) ||
        /\b(financial|money)\s+\b(on|back)\b/.test(normalizedText) ||
        /\bturn\b[^.]{0,24}\bfinancial\b[^.]{0,16}\b(on|back)\b/.test(normalizedText);

    const customer_focused =
        /\bcustomer[- ]?focused\b/.test(normalizedText) ||
        /\bcustomer[- ]centric\b/.test(normalizedText) ||
        /\bcustomer\s+centric\b/.test(normalizedText) ||
        /\bmore\s+customer\b/.test(normalizedText) ||
        /\bcustomer\s+first\b/.test(normalizedText) ||
        /\bcustomer[- ]?focus\b/.test(normalizedText) ||
        /\bemphasize\s+(the\s+)?customer\b/.test(normalizedText) ||
        /\b(make|got)\b[^.]{0,24}\b(the\s+)?(job|work|overview)\b[^.]{0,48}\b(customer|customer-focused|customer\s+centric)\b/.test(
            normalizedText
        ) ||
        /\b(job|overview)\b[^.]{0,36}\bmore\s+customer\b/.test(normalizedText);

    const service_details_higher =
        /\b(service|property)\s+details?\b[^.]{0,40}\b(higher|above|up|first|top|sooner)\b/.test(
            normalizedText
        ) ||
        /\b(higher|above|up|first|top)\b[^.]{0,40}\b(service|property)\s+details?\b/.test(
            normalizedText
        ) ||
        /\b(put|move|make)\b[^.]{0,50}\b(service|property)\b[^.]{0,40}\b(higher|above|up|first)\b/.test(
            normalizedText
        );

    const contact_details_higher =
        /\b(contact\s+details|contact\s+info|people)\b[^.]{0,48}\b(higher|above|up|first|top)\b/.test(
            normalizedText
        ) ||
        /\b(higher|above|up|first|top)\b[^.]{0,48}\b(contact\s+details|contact\s+info)\b/.test(
            normalizedText
        ) ||
        /\b(put|move|make)\b[^.]{0,56}\b(contact|people)\b[^.]{0,36}\b(higher|above|up|first)\b/.test(
            normalizedText
        );

    const show_main_contact =
        /\bmain\s+contact\b/.test(normalizedText) ||
        /\bprimary\s+contact\b/.test(normalizedText) ||
        /\bprimary\s+person\b/.test(normalizedText) ||
        /\bcontact\s+details\b/.test(normalizedText) ||
        /\bcontact\s+info\b/.test(normalizedText) ||
        (/\bshow\b/.test(normalizedText) && /\bcontact\b/.test(normalizedText));

    const show_address =
        /\b(address|service address|location)\b/.test(normalizedText) &&
        (showVerb ||
            /\band\b/.test(normalizedText) ||
            /\bnext\s+service\b/.test(normalizedText) ||
            /\btheir\b/.test(normalizedText));

    const show_next_service =
        /\bnext\s+service\b/.test(normalizedText) ||
        /\bnext\s+visit\b/.test(normalizedText) ||
        /\bnext\s+schedule\b/.test(normalizedText) ||
        /\bnext\s+appointment\b/.test(normalizedText) ||
        /\bnext\s+service\s+date\b/.test(normalizedText);

    const mentionsNextServiceContext =
        /\bnext\s+service\b/.test(normalizedText) ||
        /\bnext\s+visit\b/.test(normalizedText) ||
        /\bnext\s+schedule\b/.test(normalizedText) ||
        /\bnext\s+appointment\b/.test(normalizedText) ||
        /\bnext\s+service\s+date\b/.test(normalizedText);

    const show_service_details =
        /\b(service\s+details|service\s+detail)\b/.test(normalizedText) ||
        /\bwhat\s+service\b/.test(normalizedText) ||
        /\bservice\s+they\b/.test(normalizedText) ||
        /\bservice\s+type\b/.test(normalizedText) ||
        /\bservice\s+got\b/.test(normalizedText) ||
        (showVerb &&
            /\bservice\b/.test(normalizedText) &&
            !mentionsNextServiceContext &&
            !/\bfinancial\b/.test(normalizedText));

    const referenced_unreachable_contact_channels =
        /\b(phone|phones|telephone|mobile|cell|email|e-mail|e mail)\b/.test(normalizedText);

    return {
        hide_financial,
        show_financial,
        customer_focused,
        service_details_higher,
        contact_details_higher,
        show_main_contact,
        show_address,
        show_next_service,
        show_service_details,
        referenced_unreachable_contact_channels,
    };
}

function hasAnyIntent(i: ParsedJobOverviewIntent): boolean {
    return (
        i.hide_financial ||
        i.show_financial ||
        i.customer_focused ||
        i.service_details_higher ||
        i.contact_details_higher ||
        i.show_main_contact ||
        i.show_address ||
        i.show_next_service ||
        i.show_service_details ||
        i.referenced_unreachable_contact_channels
    );
}

/** For Agent Lab routing: true if rule-based planner would accept the utterance (before strict validation). */
export function jobOverviewRequestHasSupportedIntent(rawRequestText: string): boolean {
    return hasAnyIntent(detectJobOverviewIntentFlags(normalizeJobOverviewRequestText(rawRequestText)));
}

function dedupeBands(bands: OverviewLayoutBandV0[]): OverviewLayoutBandV0[] {
    const seen = new Set<string>();
    const out: OverviewLayoutBandV0[] = [];
    for (const b of bands) {
        if (seen.has(b.band_key)) continue;
        seen.add(b.band_key);
        out.push(structuredClone(b));
    }
    return out;
}

function getBand(
    layout: OverviewLayoutConfigV0,
    key: OverviewLayoutBandV0["band_key"]
): OverviewLayoutBandV0 | undefined {
    return layout.bands.find((b) => b.band_key === key);
}

function ensureBand(
    layout: OverviewLayoutConfigV0,
    key: OverviewLayoutBandV0["band_key"],
    template: OverviewLayoutBandV0
): OverviewLayoutBandV0 {
    let b = getBand(layout, key);
    if (!b) {
        b = structuredClone(template);
        layout.bands.push(b);
    }
    return b;
}

function addSystemItemIfMissing(band: OverviewLayoutBandV0, key: string): boolean {
    if (band.items.some((it) => it.key === key)) return false;
    band.items.push({ kind: "system_field", key });
    return true;
}

function addHeaderIfMissing(layout: OverviewLayoutConfigV0, key: string): boolean {
    if (layout.header_keys.includes(key)) return false;
    layout.header_keys.push(key);
    return true;
}

function reorderBandAfterSummary(layout: OverviewLayoutConfigV0, bandKey: CatalogBandKey): void {
    const idx = layout.bands.findIndex((b) => b.band_key === bandKey);
    if (idx < 0) return;
    const [b] = layout.bands.splice(idx, 1);
    const sumIdx = layout.bands.findIndex((x) => x.band_key === "summary");
    const insertAt = sumIdx >= 0 ? sumIdx + 1 : 0;
    layout.bands.splice(insertAt, 0, b);
}

function defaultFinancialBand(): OverviewLayoutBandV0 {
    const d = getDefaultOverviewLayoutConfig();
    const f = d.bands.find((b) => b.band_key === "financial");
    return f ? structuredClone(f) : { band_key: "financial", enabled: true, items: [] };
}

function defaultServicePropertyBand(
    catalog: JobOverviewResolutionCatalog
): OverviewLayoutBandV0 {
    return {
        band_key: "service_property",
        enabled: true,
        items: catalog.service_property_default_items.map((it) => ({
            kind: "system_field",
            key: it.key,
        })),
    };
}

function layoutBodyFingerprint(layout: OverviewLayoutConfigV0): string {
    return JSON.stringify({
        hk: layout.header_keys,
        rg: layout.relationship_group_keys ?? null,
        bands: layout.bands.map((b) => ({
            k: b.band_key,
            e: b.enabled,
            items: b.items.map((i) => i.key),
        })),
    });
}

function catalogFieldEntry(
    catalog: JobOverviewResolutionCatalog,
    fieldKey: string
): JobOverviewResolutionCatalog["system_fields"][number] | undefined {
    return catalog.system_fields.find((f) => f.key === fieldKey);
}

/**
 * Header ribbon: identity/status (title, customer, primary) for customer-focused template only.
 * Schedule, location, and service line stay in summary band unless catalog explicitly allows header.
 */
function shouldPromoteFieldToHeader(
    fieldKey: string,
    entry: NonNullable<ReturnType<typeof catalogFieldEntry>>,
    promotePrimaryToHeader: boolean
): boolean {
    if (fieldKey === "_primary_person_name") return promotePrimaryToHeader;
    return entry.allow_header;
}

function applyCatalogSystemField(
    layout: OverviewLayoutConfigV0,
    catalog: JobOverviewResolutionCatalog,
    defaultLayout: OverviewLayoutConfigV0,
    fieldKey: string,
    phraseMatched: string,
    confidence: "high" | "medium",
    outcomes: ResolvedTargetOutcome[],
    rationale: string[],
    bandsTouched: Set<CatalogBandKey>,
    promotePrimaryToHeader: boolean
): void {
    const entry = catalogFieldEntry(catalog, fieldKey);
    if (!entry) return;
    const tmpl =
        defaultLayout.bands.find((b) => b.band_key === entry.preferred_band) ??
        ({ band_key: entry.preferred_band, enabled: true, items: [] } as OverviewLayoutBandV0);
    const band = ensureBand(layout, entry.preferred_band, tmpl);
    const addedItem = addSystemItemIfMissing(band, fieldKey);
    if (addedItem) {
        outcomes.push({
            kind: "system_field",
            field_key: fieldKey,
            phrase_matched: phraseMatched,
            outcome: "added",
            confidence,
        });
        rationale.push(`Added ${fieldKey} to ${entry.preferred_band} (matched “${phraseMatched}”).`);
    } else {
        outcomes.push({
            kind: "system_field",
            field_key: fieldKey,
            phrase_matched: phraseMatched,
            outcome: "already_present",
            confidence,
        });
    }
    bandsTouched.add(entry.preferred_band);
    if (shouldPromoteFieldToHeader(fieldKey, entry, promotePrimaryToHeader)) {
        const addedHeader = addHeaderIfMissing(layout, fieldKey);
        if (addedHeader) {
            rationale.push(`Added ${fieldKey} to header (identity strip).`);
        }
    }
}

/**
 * Prefer people band for contact narrative; avoid the same identity field in header + people
 * when the request is contact-focused but not the full customer header template.
 */
function applyEditorialContactHeaderPolicy(
    layout: OverviewLayoutConfigV0,
    parsed: ParsedJobOverviewIntent,
    rationale: string[]
): void {
    if (parsed.customer_focused) return;
    const people = getBand(layout, "people");
    if (!people?.enabled || !people.items.some((it) => it.key === "_primary_person_name")) return;
    if (!(parsed.show_main_contact || parsed.contact_details_higher)) return;
    const had = layout.header_keys.includes("_primary_person_name");
    layout.header_keys = layout.header_keys.filter((k) => k !== "_primary_person_name");
    if (had) {
        rationale.push(
            "Removed _primary_person_name from the header ribbon — contact stays in the people band so it is not duplicated above and in the band."
        );
    }
}

type Snapshot = {
    header_keys: string[];
    band_order: string[];
    financial_enabled: boolean | null;
    relationship_group_keys: string[] | undefined;
    bands_items: Record<string, string[]>;
};

function takeSnapshot(layout: OverviewLayoutConfigV0): Snapshot {
    const fin = getBand(layout, "financial");
    const bands_items: Record<string, string[]> = {};
    for (const b of layout.bands) {
        bands_items[b.band_key] = b.items.map((i) => i.key);
    }
    return {
        header_keys: [...layout.header_keys],
        band_order: layout.bands.map((b) => b.band_key),
        financial_enabled: fin ? fin.enabled : null,
        relationship_group_keys: layout.relationship_group_keys
            ? [...layout.relationship_group_keys]
            : undefined,
        bands_items,
    };
}

function bandsContentChangedKeys(before: Snapshot, after: Snapshot): string[] {
    const keys = new Set([...Object.keys(before.bands_items), ...Object.keys(after.bands_items)]);
    const changed: string[] = [];
    for (const k of keys) {
        const a = (before.bands_items[k] ?? []).join("\0");
        const b = (after.bands_items[k] ?? []).join("\0");
        if (a !== b) changed.push(k);
    }
    return changed;
}

function diffSnapshots(before: Snapshot, after: Snapshot): DiffSummary {
    const d: DiffSummary = {};
    if (JSON.stringify(before.header_keys) !== JSON.stringify(after.header_keys)) {
        d.header_keys = { before: before.header_keys, after: after.header_keys };
    }
    if (JSON.stringify(before.band_order) !== JSON.stringify(after.band_order)) {
        d.band_order = { before: before.band_order, after: after.band_order };
    }
    if (
        before.financial_enabled !== after.financial_enabled ||
        (before.financial_enabled === null) !== (after.financial_enabled === null)
    ) {
        d.financial_band_enabled = {
            before: before.financial_enabled,
            after: after.financial_enabled,
        };
    }
    if (
        JSON.stringify(before.relationship_group_keys ?? null) !==
        JSON.stringify(after.relationship_group_keys ?? null)
    ) {
        d.relationship_group_keys = {
            before: before.relationship_group_keys,
            after: after.relationship_group_keys,
        };
    }
    const bic = bandsContentChangedKeys(before, after);
    if (bic.length) d.bands_content_changed = bic;
    return d;
}

function mergeUnresolved(fromText: UnresolvedTargetRef[], extraRationale: string[]): UnresolvedTargetRef[] {
    const byId = new Map<string, UnresolvedTargetRef>();
    for (const u of fromText) {
        byId.set(u.concept_id, u);
        extraRationale.push(`Unresolved: “${u.phrase_matched}” (${u.concept_id}) — ${u.reason}`);
    }
    return [...byId.values()];
}

type FieldWant = { phrase: string; confidence: "high" | "medium" };

function mergeFieldWant(m: Map<string, FieldWant>, key: string, w: FieldWant): void {
    const cur = m.get(key);
    if (!cur || w.phrase.length >= cur.phrase.length) m.set(key, w);
}

export function planJobOverviewLayoutRequest(
    requestText: string,
    currentOverviewConfig: unknown,
    catalog: JobOverviewResolutionCatalog = JOB_OVERVIEW_RESOLUTION_CATALOG
): JobOverviewPlannerResult {
    const user_request_text = requestText.trim();
    const norm = normalizeJobOverviewRequestText(user_request_text);
    const parsed_intent = detectJobOverviewIntentFlags(norm);

    const ambiguity: AmbiguityMarker[] = [];
    if (parsed_intent.hide_financial && parsed_intent.show_financial) {
        ambiguity.push({
            code: "financial_hide_show_conflict",
            detail: "Request both hides and shows the financial band; clarify which applies.",
        });
    }

    if (ambiguity.length > 0) {
        return {
            ok: false,
            user_request_text,
            error: "Ambiguous request; cannot produce a single proposal.",
            ambiguity,
            rationale: ["Conflicting directives for the financial band."],
        };
    }

    if (!hasAnyIntent(parsed_intent)) {
        return {
            ok: false,
            user_request_text,
            error: "No supported job overview intent matched this request.",
        };
    }

    const expected_config_version = getOverviewLayoutConfigStoredVersion(currentOverviewConfig);
    const base = parseOverviewLayoutConfig(currentOverviewConfig);
    base.bands = dedupeBands(base.bands);
    const layout = structuredClone(base);
    const fingerprintBefore = layoutBodyFingerprint(layout);
    const beforeSnap = takeSnapshot(layout);

    const defaultLayout = getDefaultOverviewLayoutConfig();
    const rationale: string[] = [];
    const bandsTouched = new Set<CatalogBandKey>();
    let relationship_groups_touched = false;
    const resolvedOutcomes: ResolvedTargetOutcome[] = [];

    const catalogHits = resolveCatalogFieldsInText(norm, catalog);
    const gapRefs = resolveCatalogCapabilityGapsInText(norm, catalog);
    const resolutionFields: ResolvedFieldRef[] = [...catalogHits];

    if (parsed_intent.hide_financial) {
        const fin = ensureBand(layout, "financial", defaultFinancialBand());
        fin.enabled = false;
        bandsTouched.add("financial");
        rationale.push("Disabled the financial band (reversible via enabled flag).");
    }

    if (parsed_intent.show_financial) {
        const fin = ensureBand(layout, "financial", defaultFinancialBand());
        if (fin.items.length === 0) {
            const tmpl = defaultFinancialBand();
            fin.items = structuredClone(tmpl.items);
        }
        fin.enabled = true;
        bandsTouched.add("financial");
        rationale.push("Enabled the financial band and ensured default money fields when empty.");
    }

    if (parsed_intent.service_details_higher) {
        const sp = ensureBand(layout, "service_property", defaultServicePropertyBand(catalog));
        sp.enabled = true;
        if (sp.items.length === 0) {
            sp.items = defaultServicePropertyBand(catalog).items.map((x) => ({ ...x }));
        }
        reorderBandAfterSummary(layout, "service_property");
        bandsTouched.add("service_property");
        rationale.push(
            "Moved service_property up after summary; service line (service_key) stays in summary unless you ask for it separately — avoids duplicating the same idea in header and band."
        );
    }

    if (parsed_intent.contact_details_higher) {
        const people = ensureBand(
            layout,
            "people",
            defaultLayout.bands.find((b) => b.band_key === "people")!
        );
        people.enabled = true;
        reorderBandAfterSummary(layout, "people");
        bandsTouched.add("people");
        rationale.push("Moved people (contact) band up after summary per request.");
    }

    const summaryBand = ensureBand(
        layout,
        "summary",
        defaultLayout.bands.find((b) => b.band_key === "summary")!
    );

    if (parsed_intent.show_main_contact) {
        const people = ensureBand(
            layout,
            "people",
            defaultLayout.bands.find((b) => b.band_key === "people")!
        );
        people.enabled = true;
    }

    if (parsed_intent.show_service_details) {
        const sp = ensureBand(layout, "service_property", defaultServicePropertyBand(catalog));
        sp.enabled = true;
        if (sp.items.length === 0) {
            sp.items = defaultServicePropertyBand(catalog).items.map((x) => ({ ...x }));
        }
        bandsTouched.add("service_property");
        rationale.push(
            "Enabled service_property for on-site attributes (home type, size, beds/baths); the booked service line uses service_key in summary, not duplicated in header."
        );
    }

    const fieldWants = new Map<string, FieldWant>();
    if (parsed_intent.show_address) {
        mergeFieldWant(fieldWants, "_location_label", { phrase: "address", confidence: "high" });
    }
    if (parsed_intent.show_next_service) {
        mergeFieldWant(fieldWants, "_next_schedule", { phrase: "next service", confidence: "high" });
    }
    if (parsed_intent.show_main_contact) {
        mergeFieldWant(fieldWants, "_primary_person_name", { phrase: "main contact", confidence: "high" });
    }
    if (parsed_intent.contact_details_higher) {
        mergeFieldWant(fieldWants, "_primary_person_name", { phrase: "contact details higher", confidence: "high" });
    }
    if (parsed_intent.show_service_details) {
        mergeFieldWant(fieldWants, "service_key", { phrase: "service details", confidence: "high" });
    }
    for (const hit of catalogHits) {
        mergeFieldWant(fieldWants, hit.field_key, {
            phrase: hit.phrase_matched,
            confidence: hit.confidence,
        });
    }

    const fieldApplyOrder = [
        "_location_label",
        "_next_schedule",
        "scheduled_at",
        "service_key",
        "title",
        "_customer_name",
        "_primary_person_name",
        "display_total_cents",
    ];
    for (const fk of fieldApplyOrder) {
        const w = fieldWants.get(fk);
        if (!w) continue;
        applyCatalogSystemField(
            layout,
            catalog,
            defaultLayout,
            fk,
            w.phrase,
            w.confidence,
            resolvedOutcomes,
            rationale,
            bandsTouched,
            false
        );
    }
    for (const [fk, w] of fieldWants) {
        if (fieldApplyOrder.includes(fk)) continue;
        applyCatalogSystemField(
            layout,
            catalog,
            defaultLayout,
            fk,
            w.phrase,
            w.confidence,
            resolvedOutcomes,
            rationale,
            bandsTouched,
            false
        );
    }

    if (parsed_intent.customer_focused) {
        layout.relationship_group_keys = [...catalog.relationship_group_keys];
        relationship_groups_touched = true;

        const people = ensureBand(
            layout,
            "people",
            defaultLayout.bands.find((b) => b.band_key === "people")!
        );
        const rel = ensureBand(
            layout,
            "relationships",
            defaultLayout.bands.find((b) => b.band_key === "relationships") ?? {
                band_key: "relationships",
                enabled: true,
                items: [],
            }
        );
        people.enabled = true;
        rel.enabled = true;
        addSystemItemIfMissing(people, "_primary_person_name");
        addSystemItemIfMissing(summaryBand, "_customer_name");

        const nextHeader: string[] = [];
        const rest = [...layout.header_keys];
        const take = (k: string) => {
            const i = rest.indexOf(k);
            if (i >= 0) {
                rest.splice(i, 1);
                nextHeader.push(k);
            }
        };
        take("title");
        take("_customer_name");
        take("_primary_person_name");
        for (const k of [...rest]) {
            if (!nextHeader.includes(k)) nextHeader.push(k);
        }
        layout.header_keys = nextHeader;

        bandsTouched.add("people");
        bandsTouched.add("relationships");
        bandsTouched.add("summary");
        rationale.push(
            "Customer-focused template: enabled people + relationships, both relationship groups, prioritized customer/person header keys."
        );
        resolutionFields.push({
            phrase_matched: "customer-focused",
            field_key: "_customer_name",
            confidence: "medium",
        });
    }

    applyEditorialContactHeaderPolicy(layout, parsed_intent, rationale);

    const dedupeOutcomes = (() => {
        const m = new Map<string, ResolvedTargetOutcome>();
        for (const o of resolvedOutcomes) {
            const prev = m.get(o.field_key);
            if (!prev || o.outcome === "added") m.set(o.field_key, o);
        }
        return [...m.values()];
    })();

    const alreadyIds = dedupeOutcomes
        .filter((o) => o.outcome === "already_present")
        .map((o) => o.field_key);
    if (alreadyIds.length > 0) {
        rationale.push(
            `Already satisfied (layout already exposed these): ${alreadyIds.join(", ")} — no duplicate items added.`
        );
    }

    const unresolved = mergeUnresolved(gapRefs, rationale);

    const dedupResolution = (() => {
        const m = new Map<string, ResolvedFieldRef>();
        for (const r of resolutionFields) {
            const prev = m.get(r.field_key);
            if (!prev || r.confidence === "high") m.set(r.field_key, r);
        }
        return [...m.values()];
    })();

    const nextVersion = Math.max(1, expected_config_version + 1);
    const configRecord: Record<string, unknown> = {
        version: nextVersion,
        header_keys: layout.header_keys,
        bands: layout.bands.map((band) => ({
            band_key: band.band_key,
            enabled: band.enabled,
            items: band.items.map((it) => ({ kind: it.kind, key: it.key })),
        })),
    };
    if (layout.relationship_group_keys?.length) {
        configRecord.relationship_group_keys = layout.relationship_group_keys;
    }

    const strict = parseOverviewLayoutConfigStrict(configRecord);
    if (!strict.ok) {
        return {
            ok: false,
            user_request_text,
            error: `Strict validation failed: ${strict.error}`,
            rationale,
        };
    }

    const afterSemantic = parseOverviewLayoutConfig(strict.value);
    afterSemantic.bands = dedupeBands(afterSemantic.bands);
    const afterSnap = takeSnapshot(afterSemantic);
    const diff_summary = diffSnapshots(beforeSnap, afterSnap);
    const fingerprintAfter = layoutBodyFingerprint(afterSemantic);
    const effective_layout_change = fingerprintBefore !== fingerprintAfter;

    if (!effective_layout_change && unresolved.length > 0) {
        rationale.push(
            "No layout keys changed; request referenced fields that are not available as canonical overview items (see unresolved_targets)."
        );
    }
    if (!effective_layout_change && unresolved.length === 0 && dedupeOutcomes.every((o) => o.outcome === "already_present")) {
        rationale.push("Layout already matched the request; version will still increment on apply if you submit.");
    }

    return {
        ok: true,
        planner_version: JOB_OVERVIEW_PLANNER_VERSION,
        user_request_text,
        target: {
            target_kind: "record_overview_layout",
            entity_type: "job",
            surface: "overview",
        },
        parsed_intent,
        resolution: {
            fields: dedupResolution,
            resolved_outcomes: dedupeOutcomes,
            unresolved_targets: unresolved,
            relationship_groups_touched,
            bands_touched: [...bandsTouched],
        },
        rationale,
        ambiguity,
        diff_summary,
        effective_layout_change,
        config: strict.value,
        expected_config_version,
    };
}
