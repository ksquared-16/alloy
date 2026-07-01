import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LayoutRuntimeTasksWidget from "@/components/layout/LayoutRuntimeTasksWidget";

describe("LayoutRuntimeTasksWidget", () => {
    it("renders operational task chips with formatted due date", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimeTasksWidget
                title="Tasks"
                record={{
                    _overview_data: {
                        _inquiry_summary_tasks: {
                            state: "loaded",
                            open_count: 1,
                            open_tasks: [
                                {
                                    id: "t-1",
                                    title: "Follow up",
                                    due_at: "2026-05-17T16:00:00+00:00",
                                    status: "open",
                                    source: "manual",
                                },
                            ],
                        },
                    },
                }}
            />,
        );
        expect(html).toContain("data-layout-runtime-tasks-widget");
        expect(html).toContain("data-inquiry-summary-task-preview-row");
        expect(html).toContain("Follow up");
        expect(html).not.toContain("2026-05-17T16:00:00+00:00");
    });
});
