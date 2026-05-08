import { describe, expect, it } from "vitest";
import {
    parseFormLaunchContextFromPayloadMeta,
    stampFormContextFromLinkMetadata,
} from "@/lib/forms/formContextMode";

describe("formContextMode", () => {
    it("stampFormContextFromLinkMetadata copies validated launch fields", () => {
        const pid = "33333333-3333-4333-8333-333333333333";
        const stamped = stampFormContextFromLinkMetadata({
            form_context_mode: "existing_record",
            source_entity_type: "customer_member",
            source_entity_id: pid,
            prefill_enabled: true,
            allow_auto_create: false,
            junk: "ignored-unless-whitelisted",
        });
        expect(stamped.form_context_mode).toBe("existing_record");
        expect(stamped.source_entity_type).toBe("customer_member");
        expect(stamped.source_entity_id).toBe(pid);
        expect(stamped.prefill_enabled).toBe(true);
        expect(stamped.allow_auto_create).toBe(false);
        expect(stamped.junk).toBeUndefined();
    });

    it("stampFormContextFromLinkMetadata rejects unknown modes and bad UUIDs", () => {
        expect(Object.keys(stampFormContextFromLinkMetadata({ form_context_mode: "experimental" })).length).toBe(0);
        expect(
            stampFormContextFromLinkMetadata({ source_entity_id: "not-a-uuid", source_entity_type: "x" })
                .source_entity_id
        ).toBeUndefined();
    });

    it("parseFormLaunchContextFromPayloadMeta reads submission meta", () => {
        const parsed = parseFormLaunchContextFromPayloadMeta({
            form_context_mode: "document_update",
            source_entity_type: "opportunity",
            source_entity_id: "44444444-4444-4444-8444-444444444444",
        });
        expect(parsed.form_context_mode).toBe("document_update");
        expect(parsed.source_entity_type).toBe("opportunity");
    });

    it("stampFormContextFromLinkMetadata copies packet_definition_id for packet mode", () => {
        const pid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
        const stamped = stampFormContextFromLinkMetadata({
            form_context_mode: "packet",
            packet_definition_id: pid,
        });
        expect(stamped.form_context_mode).toBe("packet");
        expect(stamped.packet_definition_id).toBe(pid);
    });
});
