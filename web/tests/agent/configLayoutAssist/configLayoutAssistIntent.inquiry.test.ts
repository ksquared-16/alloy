import { describe, expect, it } from "vitest";

import { buildEntityResolveContext } from "@/lib/agent/configLayoutAssist/configLayoutAssistEntityResolve";
import {
    isConfigLayoutAssistLikeCommand,
    parseConfigLayoutAssistIntent,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistIntent";

const entityResolve = buildEntityResolveContext(
    [{ entity_type: "opportunities", singular: "Inquiry", plural: "Inquiries" }],
    "opportunity"
);

describe("configLayoutAssistIntent inquiry aliases", () => {
    it("recognizes create field for inquiries without explicit 'field' word", () => {
        expect(isConfigLayoutAssistLikeCommand("Create Preferred Start Date for inquiries")).toBe(true);
        const intent = parseConfigLayoutAssistIntent("Create Preferred Start Date for inquiries", { entityResolve });
        expect(intent.kind).toBe("create_field");
        expect(intent.entity_type).toBe("opportunity");
        expect(intent.field_key).toBe("preferred_start_date");
        expect(intent.field_label).toBe("Preferred Start Date");
    });

    it("routes opportunity and inquiry phrasing consistently", () => {
        const inquiry = parseConfigLayoutAssistIntent("Create Preferred Start Date for inquiries", { entityResolve });
        const opportunity = parseConfigLayoutAssistIntent("Create Preferred Start Date for opportunities", {
            entityResolve,
        });
        expect(inquiry.entity_type).toBe(opportunity.entity_type);
        expect(inquiry.field_key).toBe(opportunity.field_key);
    });

    it("parses editable from inquiry", () => {
        const intent = parseConfigLayoutAssistIntent("Make first name editable from the inquiry", { entityResolve });
        expect(intent.kind).toBe("set_field_interaction");
        expect(intent.entity_type).toBe("opportunity");
        expect(intent.field_key).toBe("first_name");
    });
});
