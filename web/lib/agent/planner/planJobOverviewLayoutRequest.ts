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

/** Exported for phrase → field tests; longest synonym wins per field key. */
export function resolveCatalogFieldsInText(
    normalizedText: string,
    catalog: JobOverviewResolutionCatalog): ResolvedFieldRef[] {
    const hits: ResolvedFieldRef[] = [];
    for (const f of catalog.system_fields) {
        let bestLen = 0;
        let bestPhrase = "";
        for (const syn of f.synonyms) {
            const s = syn.toLowerCase();
            if (!s.length) continue;
            let idx = normalizedText.indexOf(s);
            while (idx !== -1) {
                const before = idx === 0 ? " " : normalizedText[idx - 1]!;
                const after =
                    idx + s.length >= normalizedText.length ? " " : normalizedText[idx + s.length]!;
                const boundaryOk =
                    !/\w/.test(before) && !/\w/.test(after);
                if (boundaryOk && s.length >= bestLen) {
                    bestLen = s.length;
                    bestPhrase = syn;
                }
                idx = normalizedText.indexOf(s, idx + 1);
            }
        }
        if (bestLen > 0) {
            hits.push({
                phrase_matched: bestPhrase,
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

/**
 * Rule-based intent flags for the narrow v1 utterance set.
 * Exported for unit tests.
 */
export function detectJobOverviewIntentFlags(normalizedText: string): ParsedJobOverviewIntent {
    const hideVerb = /\b(hide|remove|collapse|turn off|get rid of)\b/.test(normalizedText);
    const showVerb = /\b(show|display|reveal|turn on|include|add|see|want)\b/.test(normalizedText);
    const finWord =
 /\b(financial|finance|money|pricing|billing|invoice|payment|cost)\b/.test(normalizedText);

    const hide_financial =
        (hideVerb && finWord) ||
        /\bno\b\s+\b(financial|money|pricing)\b/.test(normalizedText) ||
        /\b(financial|money)\s+\b(off|gone)\b/.test(normalizedText);

    /**
     * Must tie “show” to money words in the same clause (not “hide financial … show contact”).
     * Independent of `hide_financial`; both true ⇒ ambiguous (handled in planner).
     */
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
        /\bemphasize\s+(the\s+)?customer\b/.test(normalizedText);

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

    const show_main_contact =
        /\bmain\s+contact\b/.test(normalizedText) ||
        /\bprimary\s+person\b/.test(normalizedText) ||
        (/\bshow\b/.test(normalizedText) && /\bcontact\b/.test(normalizedText));

    const show_address =
        /\b(address|service address|location)\b/.test(normalizedText) &&
        (showVerb ||
            /\band\b/.test(normalizedText) ||
            /\bnext\s+service\b/.test(normalizedText));

    const show_next_service =
        /\bnext\s+service\b/.test(normalizedText) ||
        /\bnext\s+visit\b/.test(normalizedText) ||
        /\bnext\s+schedule\b/.test(normalizedText) ||
        /\bnext\s+appointment\b/.test(normalizedText) ||
        /\bnext\s+service\s+date\b/.test(normalizedText);

    return {
        hide_financial,
        show_financial,
        customer_focused,
        service_details_higher,
        show_main_contact,
        show_address,
        show_next_service,
    };
}

function hasAnyIntent(i: ParsedJobOverviewIntent): boolean {
    return (
        i.hide_financial ||
        i.show_financial ||
        i.customer_focused ||
        i.service_details_higher ||
        i.show_main_contact ||
        i.show_address ||
        i.show_next_service
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

function addSystemItemIfMissing(band: OverviewLayoutBandV0, key: string): void {
    if (band.items.some((it) => it.key === key)) return;
    band.items.push({ kind: "system_field", key });
}

function addHeaderIfMissing(layout: OverviewLayoutConfigV0, key: string): void {
    if (layout.header_keys.includes(key)) return;
    layout.header_keys.push(key);
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

type Snapshot = {
    header_keys: string[];
    band_order: string[];
    financial_enabled: boolean | null;
    relationship_group_keys: string[] | undefined;
};

function takeSnapshot(layout: OverviewLayoutConfigV0): Snapshot {
    const fin = getBand(layout, "financial");
    return {
        header_keys: [...layout.header_keys],
        band_order: layout.bands.map((b) => b.band_key),
        financial_enabled: fin ? fin.enabled : null,
        relationship_group_keys: layout.relationship_group_keys
            ? [...layout.relationship_group_keys]
            : undefined,
    };
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
    return d;
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
    const beforeSnap = takeSnapshot(layout);

    const defaultLayout = getDefaultOverviewLayoutConfig();
    const rationale: string[] = [];
    const bandsTouched = new Set<CatalogBandKey>();
    let relationship_groups_touched = false;

    const catalogHits = resolveCatalogFieldsInText(norm, catalog);
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
        rationale.push("Moved service_property immediately after summary per 'higher' directive.");
    }

    const summaryBand = ensureBand(
        layout,
        "summary",
        defaultLayout.bands.find((b) => b.band_key === "summary")!
    );

    if (parsed_intent.show_address) {
        addSystemItemIfMissing(summaryBand, "_location_label");
        bandsTouched.add("summary");
        resolutionFields.push({
            phrase_matched: "address",
            field_key: "_location_label",
            confidence: "high",
        });
        rationale.push("Ensured address/location (_location_label) appears in the summary band.");
    }

    if (parsed_intent.show_next_service) {
        addSystemItemIfMissing(summaryBand, "_next_schedule");
        bandsTouched.add("summary");
        resolutionFields.push({
            phrase_matched: "next service",
            field_key: "_next_schedule",
            confidence: "high",
        });
        rationale.push("Ensured next service (_next_schedule) in the summary band.");
    }

    if (parsed_intent.show_main_contact) {
        const people = ensureBand(
            layout,
            "people",
            defaultLayout.bands.find((b) => b.band_key === "people")!
        );
        people.enabled = true;
        addSystemItemIfMissing(people, "_primary_person_name");
        addHeaderIfMissing(layout, "_primary_person_name");
        bandsTouched.add("people");
        resolutionFields.push({
            phrase_matched: "main contact",
            field_key: "_primary_person_name",
            confidence: "high",
        });
        rationale.push("Surfaced main contact via people band and header (_primary_person_name).");
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
            relationship_groups_touched,
            bands_touched: [...bandsTouched],
        },
        rationale,
        ambiguity,
        diff_summary,
        config: strict.value,
        expected_config_version,
    };
}
