/**
 * Read-only operational outcome presentation (IC-1).
 * Parses form + public link metadata for admin display — no runtime side effects.
 */

import { distributionIsPreviewLink, distributionLinkLabel, type DistributionLinkRow } from "@/lib/forms/distributionPresentation";
import {
    OUTCOME_LABEL_UNRESOLVED,
    resolveOutcomeDepartmentLabel,
    resolveOutcomeLocationLabel,
    resolveOutcomeStatusLabel,
    resolveOutcomeVerticalLabel,
    resolveOutcomeWorkUnitLabel,
    type OutcomeRoutingLabelCatalog,
} from "@/lib/forms/outcomeConfigLabelCatalog";
import { parseIntakeAutoCreateFlags } from "@/lib/forms/intake/parseIntakeAutoCreateFlags";
import { parseIntakeLinkDefaults, resolveIntakeOpportunitySource } from "@/lib/forms/intake/parseIntakeLinkDefaults";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";

export type { OutcomeRoutingLabelCatalog } from "@/lib/forms/outcomeConfigLabelCatalog";

export type OutcomeConfigItemStatus = "configured" | "not_configured" | "varies";

export type OutcomeConfigItem = {
    label: string;
    value: string;
    status: OutcomeConfigItemStatus;
};

export type OutcomeStoryBullet = {
    text: string;
    tone: "positive" | "neutral" | "attention";
};

export type OutcomeVarianceCallout = {
    title: string;
    body: string;
    selectedLinkLabel: string;
    activeLinkCount: number;
};

export type OutcomeConfigSectionView = {
    id: "intake" | "routing" | "automation" | "review";
    title: string;
    items: OutcomeConfigItem[];
};

export type OutcomeConfigLinkSummary = {
    id: string;
    label: string;
    isActive: boolean;
};

export type FormOutcomeConfigViewModel = {
    sections: OutcomeConfigSectionView[];
    /** Operator story bullets for the effective layer (IC-5.6). */
    whenSubmittedStory: OutcomeStoryBullet[];
    /** Prominent multi-link callout when configs differ (IC-5.6). */
    varianceCallout: OutcomeVarianceCallout | null;
    /** How config was resolved for the summary line */
    resolutionNote: string;
    /** Extra detail when active links differ */
    varianceNote: string | null;
    representativeLink: OutcomeConfigLinkSummary | null;
    linkSummaries: OutcomeConfigLinkSummary[];
    multipleActiveConfigs: boolean;
    differingActiveLinkLabels: string[];
    activeOperationalLinkCount: number;
    /** Collapsed debug: raw keys per layer */
    debugLayers: { formDefaults: Record<string, unknown>; effectiveLink: Record<string, unknown> | null };
};

const NOT_CONFIGURED = "Not configured yet";

type ReviewMode = "always" | "confidence" | "never";

type ParsedOutcomeLayer = {
    leadCaptureEnabled: boolean;
    existingRecordLaunch: boolean;
    autoCreateOpportunity: boolean;
    autoCreatePerson: boolean;
    autoCreateCustomer: boolean;
    autoCreateCustomerMember: boolean;
    duplicateAttachWhenMatched: boolean;
    reviewMode: ReviewMode | null;
    reviewRequired: boolean | null;
    autoOperationalize: boolean | null;
    verticalId: string | null;
    locationId: string | null;
    workUnitId: string | null;
    departmentId: string | null;
    statusKey: string | null;
    opportunitySource: "embed" | "public_form" | null;
    workflowEvent: string | null;
    createTask: boolean | null;
    sendPacketDefinitionId: string | null;
};

function metaObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

function readBoolOrNull(m: Record<string, unknown>, key: string): boolean | null {
    const v = m[key];
    return typeof v === "boolean" ? v : null;
}

function readTrimmedString(m: Record<string, unknown>, key: string): string | null {
    const v = m[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readReviewMode(m: Record<string, unknown>): ReviewMode | null {
    const v = readTrimmedString(m, "review_mode");
    if (v === "always" || v === "confidence" || v === "never") return v;
    return null;
}

function parseOutcomeLayer(metadata: Record<string, unknown> | null | undefined): ParsedOutcomeLayer {
    const m = metaObject(metadata);
    const intake = metaObject(m.intake_outcome);
    const merged = { ...m, ...intake };

    const flags = parseIntakeAutoCreateFlags(merged);
    const routing = parseIntakeLinkDefaults(merged);
    const contextMode = readTrimmedString(merged, "form_context_mode");
    const leadCapture = linkRequiresLeadCapture(merged);
    const autoCreateOpportunity = flags.auto_create_opportunity;

    return {
        leadCaptureEnabled: leadCapture,
        existingRecordLaunch: contextMode === "existing_record",
        autoCreateOpportunity,
        autoCreatePerson: flags.auto_create_person,
        autoCreateCustomer: flags.auto_create_customer,
        autoCreateCustomerMember: flags.auto_create_customer_member,
        duplicateAttachWhenMatched: autoCreateOpportunity,
        reviewMode: readReviewMode(merged),
        reviewRequired: readBoolOrNull(merged, "review_required"),
        autoOperationalize: readBoolOrNull(merged, "auto_operationalize"),
        verticalId: routing.default_vertical_id,
        locationId: routing.default_location_id,
        workUnitId: routing.default_work_unit_id,
        departmentId: routing.default_department_id,
        statusKey: routing.default_opportunity_status_key,
        opportunitySource: leadCapture || autoCreateOpportunity ? resolveIntakeOpportunitySource(merged) : null,
        workflowEvent:
            readTrimmedString(merged, "workflow_event") ??
            readTrimmedString(merged, "workflow_trigger") ??
            readTrimmedString(merged, "emit_workflow_event"),
        createTask: readBoolOrNull(merged, "create_task"),
        sendPacketDefinitionId:
            readTrimmedString(merged, "send_packet_definition_id") ?? readTrimmedString(merged, "packet_definition_id"),
    };
}

function humanizeStatusKeyFallback(key: string | null): string {
    if (!key) return NOT_CONFIGURED;
    const normalized = key.replace(/_/g, " ").trim();
    if (normalized.toLowerCase() === "new") return "New lead";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/** Resolve operator-facing opportunity entity noun from configured status labels. */
export function resolveOpportunityEntityLabel(
    statusKey: string | null,
    catalog: OutcomeRoutingLabelCatalog | null | undefined
): "Lead" | "Inquiry" {
    const resolved = humanizeStatusKey(statusKey, catalog);
    if (resolved === NOT_CONFIGURED) return "Lead";
    if (resolved.toLowerCase().includes("lead")) return "Lead";
    if (resolved.toLowerCase().includes("inquiry")) return "Inquiry";
    return "Lead";
}

function formatRoutingDestination(
    layer: ParsedOutcomeLayer,
    catalog: OutcomeRoutingLabelCatalog | null | undefined
): string | null {
    const workUnit = routingEntityLabel(layer.workUnitId, resolveOutcomeWorkUnitLabel, catalog);
    const status = humanizeStatusKey(layer.statusKey, catalog);
    if (workUnit === NOT_CONFIGURED && status === NOT_CONFIGURED) return null;
    if (workUnit !== NOT_CONFIGURED && status !== NOT_CONFIGURED) return `${workUnit} / ${status}`;
    return workUnit !== NOT_CONFIGURED ? workUnit : status;
}

/** Build operator story bullets for a single link layer (IC-5.6). */
export function buildOutcomeWhenSubmittedStory(
    layer: ParsedOutcomeLayer,
    labelCatalog: OutcomeRoutingLabelCatalog | null | undefined
): OutcomeStoryBullet[] {
    const entity = resolveOpportunityEntityLabel(layer.statusKey, labelCatalog);
    const bullets: OutcomeStoryBullet[] = [];

    if (!layer.leadCaptureEnabled && !layer.existingRecordLaunch) {
        bullets.push({ text: "Submission saved — intake not configured on this link", tone: "neutral" });
        return bullets;
    }

    if (layer.existingRecordLaunch) {
        bullets.push({ text: "Updates an existing family or enrollment record", tone: "neutral" });
        return bullets;
    }

    if (layer.autoCreateOpportunity) {
        bullets.push({
            text: `Create a new ${entity} if no matching family exists`,
            tone: "positive",
        });
    }

    if (layer.duplicateAttachWhenMatched) {
        bullets.push({
            text: "Attach to an existing family when matched",
            tone: "positive",
        });
    }

    const destination = formatRoutingDestination(layer, labelCatalog);
    if (destination) {
        bullets.push({ text: `Route to ${destination}`, tone: "positive" });
    }

    if (layer.autoCreateCustomerMember) {
        bullets.push({
            text: "Require review when a child or family member is newly created",
            tone: "attention",
        });
    } else if (layer.reviewMode === "always" || layer.reviewRequired === true) {
        bullets.push({ text: "Require operator review on every submit", tone: "attention" });
    } else if (layer.reviewMode === "confidence") {
        bullets.push({ text: "Require review only when matching is unclear", tone: "neutral" });
    } else if (layer.autoOperationalize === true) {
        bullets.push({ text: "High-confidence intake may skip manual review", tone: "positive" });
    }

    if (bullets.length === 0) {
        bullets.push({ text: "Capture form answers — configure intake on this link for CRM routing", tone: "neutral" });
    }

    return bullets;
}

function buildVarianceCallout(params: {
    multipleActiveConfigs: boolean;
    activeCount: number;
    selectedLinkLabel: string;
}): OutcomeVarianceCallout | null {
    if (!params.multipleActiveConfigs || params.activeCount < 2) return null;
    return {
        title: "Different links can route this form differently",
        body: `This summary applies only to “${params.selectedLinkLabel}”. ${params.activeCount} active distribution links may use different locations, programs, or outcomes.`,
        selectedLinkLabel: params.selectedLinkLabel,
        activeLinkCount: params.activeCount,
    };
}

/** Story + sections for one distribution link (selected link in editor). */
export function buildFormOutcomeConfigForLink(params: {
    formMetadata: Record<string, unknown> | null | undefined;
    link: DistributionLinkRow;
    formKey: string;
    documentGenerationConfigured: boolean;
    labelCatalog?: OutcomeRoutingLabelCatalog | null;
    activeOperationalLinkCount: number;
    multipleActiveConfigs: boolean;
}): Pick<FormOutcomeConfigViewModel, "sections" | "whenSubmittedStory" | "varianceCallout"> {
    const formMeta = metaObject(params.formMetadata);
    const formLayer = parseOutcomeLayer(metaObject(formMeta.intake_outcome));
    const linkLayer = parseOutcomeLayer(metaObject(params.link.metadata));
    const effectiveLayer = mergeLayers(formLayer, linkLayer);
    const linkLabel = distributionLinkLabel(params.link, params.formKey);

    return {
        sections: buildSections(effectiveLayer, params.documentGenerationConfigured, params.labelCatalog),
        whenSubmittedStory: buildOutcomeWhenSubmittedStory(effectiveLayer, params.labelCatalog),
        varianceCallout: buildVarianceCallout({
            multipleActiveConfigs: params.multipleActiveConfigs,
            activeCount: params.activeOperationalLinkCount,
            selectedLinkLabel: linkLabel,
        }),
    };
}

function humanizeStatusKey(key: string | null, catalog: OutcomeRoutingLabelCatalog | null | undefined): string {
    if (!key) return NOT_CONFIGURED;
    const resolved = resolveOutcomeStatusLabel(key, catalog);
    if (resolved) return resolved;
    return humanizeStatusKeyFallback(key);
}

function humanizeOpportunitySource(source: "embed" | "public_form" | null): string {
    if (!source) return NOT_CONFIGURED;
    if (source === "embed") return "Website embed";
    return "Public form link";
}

function routingEntityLabel(
    id: string | null,
    resolve: (id: string | null, catalog: OutcomeRoutingLabelCatalog | null | undefined) => string | null,
    catalog: OutcomeRoutingLabelCatalog | null | undefined
): string {
    if (!id) return NOT_CONFIGURED;
    const resolved = resolve(id, catalog);
    if (resolved) return resolved;
    return OUTCOME_LABEL_UNRESOLVED;
}

function reviewPolicyLabel(layer: ParsedOutcomeLayer): { value: string; status: OutcomeConfigItemStatus } {
    if (layer.reviewMode === "always") {
        return { value: "Always requires operator review", status: "configured" };
    }
    if (layer.reviewMode === "never") {
        return { value: "Does not require review by default", status: "configured" };
    }
    if (layer.reviewMode === "confidence") {
        return { value: "Requires review only when matching is unclear", status: "configured" };
    }
    if (layer.reviewRequired === true) {
        return { value: "Review required on every submit", status: "configured" };
    }
    if (layer.reviewRequired === false) {
        return { value: "Review not required by policy", status: "configured" };
    }
    return { value: NOT_CONFIGURED, status: "not_configured" };
}

function autoOperationalizeLabel(layer: ParsedOutcomeLayer): { value: string; status: OutcomeConfigItemStatus } {
    if (layer.autoOperationalize === true) {
        return { value: "High-confidence intake may auto-operationalize", status: "configured" };
    }
    if (layer.autoOperationalize === false) {
        return { value: "Auto-operationalize disabled", status: "configured" };
    }
    return { value: NOT_CONFIGURED, status: "not_configured" };
}

function item(
    label: string,
    value: string,
    status: OutcomeConfigItemStatus = value === NOT_CONFIGURED ? "not_configured" : "configured"
): OutcomeConfigItem {
    return { label, value, status };
}

function buildSections(
    layer: ParsedOutcomeLayer,
    documentGenerationConfigured: boolean,
    labelCatalog: OutcomeRoutingLabelCatalog | null | undefined
): OutcomeConfigSectionView[] {
    const review = reviewPolicyLabel(layer);
    const autoOp = autoOperationalizeLabel(layer);

    const entity = resolveOpportunityEntityLabel(layer.statusKey, labelCatalog);

    const intakeItems: OutcomeConfigItem[] = [
        item(
            "Lead capture",
            layer.leadCaptureEnabled ? "Enabled on distribution link" : NOT_CONFIGURED,
            layer.leadCaptureEnabled ? "configured" : "not_configured"
        ),
        item(
            `Creates new ${entity.toLowerCase()}`,
            layer.autoCreateOpportunity ?
                `Creates a new enrollment ${entity.toLowerCase()} when no match exists`
            :   NOT_CONFIGURED,
            layer.autoCreateOpportunity ? "configured" : "not_configured"
        ),
        item(
            "Attaches to existing record",
            layer.existingRecordLaunch ?
                `Launches against a known person, family, or ${entity.toLowerCase()}`
            : layer.duplicateAttachWhenMatched ?
                "Attaches to existing family when matched"
            :   NOT_CONFIGURED,
            layer.existingRecordLaunch || layer.duplicateAttachWhenMatched ? "configured" : "not_configured"
        ),
        item(
            "Duplicate handling",
            layer.duplicateAttachWhenMatched ?
                "Attaches to existing family when matched instead of creating duplicates"
            :   NOT_CONFIGURED,
            layer.duplicateAttachWhenMatched ? "configured" : "not_configured"
        ),
        item("Review policy", review.value, review.status),
        item("Auto-operationalize", autoOp.value, autoOp.status),
    ];

    const routingItems: OutcomeConfigItem[] = [
        item("Location", routingEntityLabel(layer.locationId, resolveOutcomeLocationLabel, labelCatalog)),
        item("Work unit", routingEntityLabel(layer.workUnitId, resolveOutcomeWorkUnitLabel, labelCatalog)),
        item(`${entity} status`, humanizeStatusKey(layer.statusKey, labelCatalog)),
        item("Source", humanizeOpportunitySource(layer.opportunitySource)),
        item("Department", routingEntityLabel(layer.departmentId, resolveOutcomeDepartmentLabel, labelCatalog)),
        item("Vertical", routingEntityLabel(layer.verticalId, resolveOutcomeVerticalLabel, labelCatalog)),
    ];

    const workflowValue =
        layer.workflowEvent ?
            `Workflow: ${layer.workflowEvent}`
        : layer.leadCaptureEnabled ?
            "Form submitted signal (default)"
        :   NOT_CONFIGURED;

    const automationItems: OutcomeConfigItem[] = [
        item(
            "Workflow trigger",
            workflowValue,
            layer.workflowEvent || layer.leadCaptureEnabled ? "configured" : "not_configured"
        ),
        item(
            "Task creation",
            layer.createTask === true ?
                "May create a task on submit"
            : layer.createTask === false ?
                "Does not create tasks automatically"
            :   NOT_CONFIGURED,
            layer.createTask != null ? "configured" : "not_configured"
        ),
        item(
            "Send packet",
            layer.sendPacketDefinitionId ? "Packet launch configured on link" : NOT_CONFIGURED,
            layer.sendPacketDefinitionId ? "configured" : "not_configured"
        ),
        item(
            "Document generation",
            documentGenerationConfigured ?
                "PDF output available after review"
            :   NOT_CONFIGURED,
            documentGenerationConfigured ? "configured" : "not_configured"
        ),
    ];

    const reviewItems: OutcomeConfigItem[] = [
        item("Review mode", review.value, review.status),
        item("Auto-operationalize", autoOp.value, autoOp.status),
        item(
            "Confidence-based review",
            layer.reviewMode === "confidence" ? "Enabled" : NOT_CONFIGURED,
            layer.reviewMode === "confidence" ? "configured" : "not_configured"
        ),
    ];

    return [
        { id: "intake", title: "Intake behavior", items: intakeItems },
        { id: "routing", title: "Routing", items: routingItems },
        { id: "automation", title: "Automation", items: automationItems },
        { id: "review", title: "Review policy", items: reviewItems },
    ];
}

function mergeLayers(formLayer: ParsedOutcomeLayer, linkLayer: ParsedOutcomeLayer): ParsedOutcomeLayer {
    const pick = <T>(linkVal: T, formVal: T, useLink: boolean): T => (useLink ? linkVal : formVal);

    const hasLinkIntake = linkLayer.leadCaptureEnabled || linkLayer.existingRecordLaunch;

    return {
        leadCaptureEnabled: pick(linkLayer.leadCaptureEnabled, formLayer.leadCaptureEnabled, hasLinkIntake),
        existingRecordLaunch: pick(linkLayer.existingRecordLaunch, formLayer.existingRecordLaunch, hasLinkIntake),
        autoCreateOpportunity: pick(linkLayer.autoCreateOpportunity, formLayer.autoCreateOpportunity, hasLinkIntake),
        autoCreatePerson: pick(linkLayer.autoCreatePerson, formLayer.autoCreatePerson, hasLinkIntake),
        autoCreateCustomer: pick(linkLayer.autoCreateCustomer, formLayer.autoCreateCustomer, hasLinkIntake),
        autoCreateCustomerMember: pick(
            linkLayer.autoCreateCustomerMember,
            formLayer.autoCreateCustomerMember,
            hasLinkIntake
        ),
        duplicateAttachWhenMatched: pick(
            linkLayer.duplicateAttachWhenMatched,
            formLayer.duplicateAttachWhenMatched,
            hasLinkIntake
        ),
        reviewMode: linkLayer.reviewMode ?? formLayer.reviewMode,
        reviewRequired: linkLayer.reviewRequired ?? formLayer.reviewRequired,
        autoOperationalize: linkLayer.autoOperationalize ?? formLayer.autoOperationalize,
        verticalId: linkLayer.verticalId ?? formLayer.verticalId,
        locationId: linkLayer.locationId ?? formLayer.locationId,
        workUnitId: linkLayer.workUnitId ?? formLayer.workUnitId,
        departmentId: linkLayer.departmentId ?? formLayer.departmentId,
        statusKey: linkLayer.statusKey ?? formLayer.statusKey,
        opportunitySource: linkLayer.opportunitySource ?? formLayer.opportunitySource,
        workflowEvent: linkLayer.workflowEvent ?? formLayer.workflowEvent,
        createTask: linkLayer.createTask ?? formLayer.createTask,
        sendPacketDefinitionId: linkLayer.sendPacketDefinitionId ?? formLayer.sendPacketDefinitionId,
    };
}

function layerSignature(layer: ParsedOutcomeLayer): string {
    return JSON.stringify(layer);
}

function selectRepresentativeLink(links: DistributionLinkRow[]): DistributionLinkRow | null {
    const operational = links.filter((l) => !distributionIsPreviewLink(l));
    const active = operational.filter((l) => l.is_active);
    const pool = active.length > 0 ? active : operational;
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

function toLinkSummary(link: DistributionLinkRow, formKey: string): OutcomeConfigLinkSummary {
    return {
        id: link.id,
        label: distributionLinkLabel(link, formKey),
        isActive: link.is_active,
    };
}

function buildVarianceNote(params: {
    multipleActiveConfigs: boolean;
    representativeLabel: string;
    differingLabels: string[];
    activeCount: number;
}): string | null {
    if (!params.multipleActiveConfigs || params.activeCount < 2) return null;
    const others =
        params.differingLabels.length > 0 ?
            params.differingLabels.slice(0, 4).join("”, “")
        :   `${params.activeCount - 1} other active link${params.activeCount - 1 === 1 ? "" : "s"}`;
    const truncated = params.differingLabels.length > 4 ? "…" : "";
    return `Each distribution link can route differently. Summary shows “${params.representativeLabel}” (most recent active). Other active links include “${others}”${truncated}.`;
}

/** Build read-only operational outcome view for form detail (IC-1 / IC-1b). */
export function buildFormOutcomeConfigViewModel(params: {
    formMetadata: Record<string, unknown> | null | undefined;
    links: DistributionLinkRow[];
    formKey: string;
    documentGenerationConfigured: boolean;
    labelCatalog?: OutcomeRoutingLabelCatalog | null;
}): FormOutcomeConfigViewModel {
    const formMeta = metaObject(params.formMetadata);
    const formDefaultsRaw = metaObject(formMeta.intake_outcome);
    const formLayer = parseOutcomeLayer(formDefaultsRaw);

    const operationalLinks = params.links.filter((l) => !distributionIsPreviewLink(l));
    const representative = selectRepresentativeLink(params.links);
    const linkSummaries = operationalLinks.map((l) => toLinkSummary(l, params.formKey));

    let effectiveLayer = formLayer;
    let effectiveLinkMeta: Record<string, unknown> | null = null;
    let resolutionNote = "Showing form default intent — add a distribution link to set routing at share time.";
    let multipleActiveConfigs = false;
    let differingActiveLinkLabels: string[] = [];
    const activeOperational = operationalLinks.filter((l) => l.is_active);

    if (representative) {
        const linkLayer = parseOutcomeLayer(representative.metadata);
        effectiveLinkMeta = metaObject(representative.metadata);
        effectiveLayer = mergeLayers(formLayer, linkLayer);

        if (activeOperational.length > 1) {
            const bySignature = new Map<string, string[]>();
            for (const link of activeOperational) {
                const sig = layerSignature(parseOutcomeLayer(link.metadata));
                const label = distributionLinkLabel(link, params.formKey);
                const bucket = bySignature.get(sig) ?? [];
                bucket.push(label);
                bySignature.set(sig, bucket);
            }
            multipleActiveConfigs = bySignature.size > 1;
            if (multipleActiveConfigs) {
                differingActiveLinkLabels = activeOperational
                    .filter((l) => l.id !== representative.id)
                    .map((l) => distributionLinkLabel(l, params.formKey));
            }
        }

        const repLabel = distributionLinkLabel(representative, params.formKey);
        resolutionNote =
            multipleActiveConfigs ?
                `Summarizing distribution link “${repLabel}” — ${activeOperational.length} active links with different outcome settings.`
            :   `From distribution link “${repLabel}”${representative.is_active ? "" : " (inactive)"}. Form defaults apply where the link is silent.`;
    } else if (operationalLinks.length > 0 && !representative) {
        resolutionNote = "No operational distribution links yet.";
    }

    const varianceNote =
        representative ?
            buildVarianceNote({
                multipleActiveConfigs,
                representativeLabel: distributionLinkLabel(representative, params.formKey),
                differingLabels: differingActiveLinkLabels,
                activeCount: activeOperational.length,
            })
        :   null;

    const repLabel = representative ? distributionLinkLabel(representative, params.formKey) : "this link";

    return {
        sections: buildSections(effectiveLayer, params.documentGenerationConfigured, params.labelCatalog),
        whenSubmittedStory: buildOutcomeWhenSubmittedStory(effectiveLayer, params.labelCatalog),
        varianceCallout: buildVarianceCallout({
            multipleActiveConfigs,
            activeCount: activeOperational.length,
            selectedLinkLabel: repLabel,
        }),
        resolutionNote,
        varianceNote,
        representativeLink: representative ? toLinkSummary(representative, params.formKey) : null,
        linkSummaries,
        multipleActiveConfigs,
        differingActiveLinkLabels,
        activeOperationalLinkCount: activeOperational.length,
        debugLayers: {
            formDefaults: formDefaultsRaw,
            effectiveLink: effectiveLinkMeta,
        },
    };
}
