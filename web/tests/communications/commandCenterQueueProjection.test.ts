import { describe, expect, it } from "vitest";
import {
    deduplicateQueueProjections,
    partitionCommandCenterQueue,
    prepareCommandCenterQueue,
    queueFamilyProjectionKey,
    queueTopicProjectionKey,
} from "@/lib/communications/v2/commandCenterQueueProjection";
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";
import {
    conversationDisplayTitle,
    countDistinctQueueFamilies,
    flattenLoadableConversationIds,
    groupConversationsByQueue,
    isQueueRowLoadable,
    resolveQueueWorkspaceError,
    visibleCommandCenterQueues,
} from "@/lib/communications/v2/commandCenterViewModel";

const KURZMAN_CUSTOMER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_CUSTOMER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function row(partial: Partial<ConversationSummary> & { id: string }): ConversationSummary {
    return {
        channel: "email",
        attention_state: "awaiting_parent_reply",
        ...partial,
    };
}

describe("commandCenterQueueProjection", () => {
    it("groups by customer_id + topic, not display label", () => {
        const topicKey = queueTopicProjectionKey(row({ id: "t1", topic_label: "Tour Scheduling", channel: "email" }));
        expect(topicKey).toBe("tour scheduling::email");
        expect(queueFamilyProjectionKey(row({ id: "t1", customer_id: KURZMAN_CUSTOMER }))).toBe(KURZMAN_CUSTOMER);
    });

    it("keeps one family with two distinct topics as two canonical rows", () => {
        const rows = [
            row({
                id: "thread-tour",
                customer_id: KURZMAN_CUSTOMER,
                family_label: "Kurzman Family",
                topic_label: "Tour Scheduling",
                scope_status: "resolved",
                last_activity_at: "2026-07-09T10:00:00Z",
            }),
            row({
                id: "thread-general",
                customer_id: KURZMAN_CUSTOMER,
                family_label: "Kurzman Family",
                topic_label: "General Questions",
                scope_status: "resolved",
                last_activity_at: "2026-07-08T10:00:00Z",
            }),
        ];
        const { canonical } = partitionCommandCenterQueue(rows);
        expect(canonical).toHaveLength(2);
        expect(countDistinctQueueFamilies(canonical)).toBe(1);
    });

    it("deduplicates same family + same topic, keeping newest activity", () => {
        const rows = [
            row({
                id: "dup-old",
                customer_id: KURZMAN_CUSTOMER,
                family_label: "Kurzman Family",
                topic_label: "Tour Scheduling",
                scope_status: "resolved",
                last_activity_at: "2026-07-01T10:00:00Z",
            }),
            row({
                id: "dup-new",
                customer_id: KURZMAN_CUSTOMER,
                family_label: "Kurzman Family",
                topic_label: "Tour Scheduling",
                scope_status: "resolved",
                last_activity_at: "2026-07-10T10:00:00Z",
                unread_count: 2,
            }),
        ];
        const deduped = deduplicateQueueProjections(rows);
        expect(deduped).toHaveLength(1);
        expect(deduped[0]?.id).toBe("dup-new");
    });

    it("does not merge two customers that share a display label", () => {
        const rows = [
            row({
                id: "kurzman-a",
                customer_id: KURZMAN_CUSTOMER,
                family_label: "Kurzman Family",
                topic_label: "General",
                scope_status: "resolved",
            }),
            row({
                id: "kurzman-b",
                customer_id: OTHER_CUSTOMER,
                family_label: "Kurzman Family",
                topic_label: "General",
                scope_status: "resolved",
            }),
        ];
        const { canonical } = partitionCommandCenterQueue(rows);
        expect(canonical).toHaveLength(2);
        expect(countDistinctQueueFamilies(canonical)).toBe(2);
    });

    it("routes unresolved and ambiguous rows to needs resolution", () => {
        const rows = [
            row({
                id: "good",
                customer_id: KURZMAN_CUSTOMER,
                scope_status: "resolved",
                family_label: "Kurzman Family",
            }),
            row({
                id: "orphan",
                scope_status: "unresolved",
                scope_unresolved_reason: "orphaned_thread_without_entity",
            }),
            row({
                id: "ambiguous",
                scope_status: "ambiguous",
                scope_unresolved_reason: "multiple_customer_candidates",
            }),
        ];
        const prepared = prepareCommandCenterQueue(rows);
        const grouped = groupConversationsByQueue(prepared);
        const sections = visibleCommandCenterQueues(grouped);
        const loadableIds = flattenLoadableConversationIds(sections);
        expect(loadableIds).toEqual(["good"]);
        expect(grouped.needs_resolution?.map((r) => r.id)).toEqual(["orphan", "ambiguous"]);
        expect(sections.some((s) => s.key === "needs_resolution")).toBe(true);
    });

    it("never uses generic Family label for unresolved rows", () => {
        expect(conversationDisplayTitle(row({ id: "x", scope_status: "unresolved" }))).toBe("Unresolved conversation");
        expect(conversationDisplayTitle(row({ id: "x", scope_status: "ambiguous" }))).toBe("Needs identity review");
        expect(conversationDisplayTitle(row({ id: "x", family_label: "Family", scope_status: "resolved", customer_id: KURZMAN_CUSTOMER }))).toBe(
            "Household"
        );
    });

    it("surfaces explicit workspace errors for review rows", () => {
        const unresolved = row({
            id: "orphan",
            scope_status: "unresolved",
            scope_unresolved_reason: "person_without_household",
        });
        expect(resolveQueueWorkspaceError(unresolved, null)?.title).toBe("Not linked to a family yet");
        expect(resolveQueueWorkspaceError(unresolved, null)?.canRetry).toBe(false);

        const loadable = row({
            id: "good",
            customer_id: KURZMAN_CUSTOMER,
            scope_status: "resolved",
        });
        expect(resolveQueueWorkspaceError(loadable, "Failed to load")?.canRetry).toBe(true);
    });

    it("loadable rows require resolved scope and customer_id", () => {
        expect(isQueueRowLoadable(row({ id: "a", customer_id: KURZMAN_CUSTOMER, scope_status: "resolved" }))).toBe(true);
        expect(isQueueRowLoadable(row({ id: "b", customer_id: KURZMAN_CUSTOMER, scope_status: "unresolved" }))).toBe(false);
        expect(isQueueRowLoadable(row({ id: "c", scope_status: "resolved" }))).toBe(false);
    });
});
