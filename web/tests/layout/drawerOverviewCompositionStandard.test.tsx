import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerOverviewPanelShell from "@/components/layout/DrawerOverviewPanelShell";
import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import DrawerHouseholdPersonLinkAvatar from "@/components/layout/DrawerHouseholdPersonLinkAvatar";
import DrawerHouseholdProfileSection from "@/components/layout/DrawerHouseholdProfileSection";
import DrawerHouseholdContactCardList from "@/components/layout/DrawerHouseholdContactCardList";
import PersonConnectedChildrenCardList from "@/components/layout/person/PersonConnectedChildrenCardList";
import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import {
    DRAWER_OVERVIEW_CANVAS_CLASS,
    DRAWER_OVERVIEW_CONTAINER_CLASS,
    DRAWER_OVERVIEW_DASHBOARD_MIN_WIDTH_PX,
    DRAWER_OVERVIEW_PANEL_SURFACE,
    DRAWER_OVERVIEW_SHELL_GRID,
    DRAWER_OVERVIEW_SHELL_GRID_CLASS,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS } from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import {
    LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
    LAYOUT_RUNTIME_DRAWER_OUTER_SHADOW,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { resolveLeadDrawerHouseholdProfile } from "@/lib/layout/runtime/resolveDrawerHouseholdProfile";
import { layoutSectionIncludesWidget } from "@/lib/layout/runtime/layoutSectionIncludesWidget";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import {
    drawerOverviewSectionIsCenterpiece,
    resolveDrawerOverviewSectionEyebrow,
} from "@/lib/layout/runtime/drawerOverviewSectionPresentation";
import { buildLeadEnrollmentCardMetaPresentation } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";

describe("drawerOverviewCompositionStandard", () => {
    it("uses white drawer overview canvas", () => {
        expect(LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS).toContain("bg-white");
        expect(DRAWER_OVERVIEW_CANVAS_CLASS).toContain("bg-white");
    });

    it("uses container-query overview shell classes instead of viewport lg grid", () => {
        expect(DRAWER_OVERVIEW_CANVAS_CLASS).toContain(DRAWER_OVERVIEW_CONTAINER_CLASS);
        expect(DRAWER_OVERVIEW_SHELL_GRID_CLASS).toBe("adminv2-drawer-overview-shell-grid");
        expect(DRAWER_OVERVIEW_CANVAS_CLASS).not.toContain("lg:grid-cols-12");
        expect(DRAWER_OVERVIEW_DASHBOARD_MIN_WIDTH_PX).toBe(1040);
    });

    it("defines balanced 4/5/3 shell grid spans", () => {
        expect(DRAWER_OVERVIEW_SHELL_GRID.leftColumn + DRAWER_OVERVIEW_SHELL_GRID.mainColumn + DRAWER_OVERVIEW_SHELL_GRID.rightRail).toBe(
            DRAWER_OVERVIEW_SHELL_GRID.columns,
        );
        expect(DRAWER_OVERVIEW_SHELL_GRID.leftColumn).toBe(4);
        expect(DRAWER_OVERVIEW_SHELL_GRID.mainColumn).toBe(5);
        expect(DRAWER_OVERVIEW_SHELL_GRID.rightRail).toBe(3);
    });

    it("panel surface includes pine left accent", () => {
        expect(DRAWER_OVERVIEW_PANEL_SURFACE).toContain("border-l-alloy-juniper");
    });

    it("uses neutral outer drawer shell tokens", () => {
        expect(LAYOUT_RUNTIME_DRAWER_OUTER_BORDER).toContain("39, 63, 82");
        expect(LAYOUT_RUNTIME_DRAWER_OUTER_BORDER).toContain("0.28");
        expect(LAYOUT_RUNTIME_DRAWER_OUTER_SHADOW).toContain("rgba");
    });
});

describe("drawerOverviewSectionPresentation", () => {
    it("resolves shared eyebrows across drawer types", () => {
        expect(resolveDrawerOverviewSectionEyebrow("household_contact")).toBe("Household");
        expect(resolveDrawerOverviewSectionEyebrow("family_relationships")).toBe("Family");
        expect(resolveDrawerOverviewSectionEyebrow("recent_activity")).toBe("Activity");
    });

    it("marks enrollment sections as centerpiece panels", () => {
        expect(drawerOverviewSectionIsCenterpiece("children_enrollment")).toBe(true);
        expect(drawerOverviewSectionIsCenterpiece("program_enrollment")).toBe(true);
        expect(drawerOverviewSectionIsCenterpiece("household_contact")).toBe(false);
    });
});

describe("DrawerOverviewPanelShell", () => {
    it("renders premium section chrome markers", () => {
        const html = renderToStaticMarkup(
            <DrawerOverviewPanelShell
                sectionKey="household_contact"
                eyebrow="Household"
                title="Household & Primary Contact"
            >
                <p>Body</p>
            </DrawerOverviewPanelShell>,
        );
        expect(html).toContain('data-drawer-overview-panel="true"');
        expect(html).toContain('data-drawer-overview-panel-section="household_contact"');
        expect(html).toContain("Household &amp; Primary Contact");
    });
});

describe("DrawerOverviewEmptyState", () => {
    it("renders premium empty marker without disabling section chrome", () => {
        const html = renderToStaticMarkup(
            <DrawerOverviewEmptyState message="No activity yet" hint="The first note will appear here." />,
        );
        expect(html).toContain('data-drawer-overview-empty-state="true"');
        expect(html).not.toContain("opacity-");
    });
});

describe("resolveLayoutRuntimeSectionVisibility premium empty sections", () => {
    it("keeps activity visible in composition shell when empty", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const activity = doc.sections.find((s) => s.key === "activity");
        expect(activity).toBeTruthy();
        expect(
            shouldRenderLayoutRuntimeSection(activity!, buildProofOpportunityRecord({ follow_up_notes: "" }), {
                compositionShell: true,
            }),
        ).toBe(true);
    });
});

describe("resolveLeadDrawerHouseholdProfile", () => {
    it("projects household name and primary contact channels", () => {
        const profile = resolveLeadDrawerHouseholdProfile(
            buildProofOpportunityRecord({
                last_name: "Patterson",
                "opportunity.location": "North Campus",
                "person.primary_contact_name": "Jimmy Patterson",
                "person.primary_email": "jimmy@patterson.com",
                "person.primary_phone": "7899877897",
            }),
        );
        expect(profile.householdName).toBe("Patterson Household");
        expect(profile.location).toBe("North Campus");
        expect(profile.primaryName).toBe("Jimmy Patterson");
    });

    it("resolves primaryPersonId from opportunity primary person fields", () => {
        const profile = resolveLeadDrawerHouseholdProfile({
            id: "opp-1",
            customer_id: "cust-1",
            primary_person_id: "person-jimmy",
            "person.primary_contact_name": "Jimmy Patterson",
        });
        expect(profile.primaryPersonId).toBe("person-jimmy");
    });
});

describe("layoutSectionIncludesWidget", () => {
    it("detects household_contacts widget placeholder in a section", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const household = doc.sections.find((s) => s.key === "household_contact");
        expect(household).toBeTruthy();
        expect(layoutSectionIncludesWidget(household!, "household_contacts")).toBe(false);

        const withWidget = {
            ...household!,
            rows: [
                ...household!.rows,
                {
                    id: "household-contacts-row",
                    columns: [
                        {
                            id: "household-contacts-col",
                            width: 12,
                            items: [
                                {
                                    id: "household-contacts-widget",
                                    kind: "widget_placeholder" as const,
                                    refKey: "household_contacts",
                                    label: "Household contacts",
                                    widget: { widgetKey: "opportunities.household_contacts", displayMode: "list" },
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        expect(layoutSectionIncludesWidget(withWidget, "household_contacts")).toBe(true);
    });
});

describe("DrawerHouseholdPersonLinkAvatar", () => {
    it("renders a person-link button when person_id is present", () => {
        const html = renderToStaticMarkup(
            <DrawerHouseholdPersonLinkAvatar
                personId="person-1"
                displayName="Jamie Johnson"
                initials="JJ"
                rowRecord={{ id: "person-1", "person.id": "person-1" }}
                onAdornmentAction={() => {}}
                componentName="Test"
            />,
        );
        expect(html).toContain('data-drawer-household-person-link-avatar="true"');
        expect(html).toContain('data-layout-runtime-person-link="true"');
        expect(html).toContain('aria-label="Open Jamie Johnson"');
    });

    it("renders a non-link avatar when person_id is missing", () => {
        const html = renderToStaticMarkup(
            <DrawerHouseholdPersonLinkAvatar
                personId={null}
                displayName="Unknown Contact"
                initials="UC"
                componentName="Test"
            />,
        );
        expect(html).toContain('data-drawer-household-person-link-avatar="static"');
        expect(html).toContain('data-drawer-household-person-link-disabled="true"');
        expect(html).not.toContain('data-layout-runtime-person-link="true"');
    });
});

describe("DrawerHouseholdProfileSection person links", () => {
    it("renders primary contact avatar and name links when person_id is present", () => {
        const html = renderToStaticMarkup(
            <DrawerHouseholdProfileSection
                record={{
                    id: "opp-1",
                    last_name: "Patterson",
                    primary_person_id: "person-jimmy",
                    "person.primary_contact_name": "Jimmy Patterson",
                    "person.primary_email": "jimmy@patterson.com",
                }}
                variant="lead"
                onAdornmentAction={() => {}}
            />,
        );
        expect(html).toContain('data-drawer-household-primary-contact="true"');
        expect(html).toContain('data-drawer-household-person-link-avatar="true"');
        expect(html).toContain('data-layout-runtime-person-link="true"');
    });
});

describe("PersonConnectedChildrenCardList person links", () => {
    it("renders child avatar link affordance on connected child rows", () => {
        const html = renderToStaticMarkup(
            <PersonConnectedChildrenCardList
                item={{ id: "connected-children", kind: "related_list", refKey: "connected_children", columns: [] }}
                columns={[
                    { label: "Child", refKey: "child.name", width: "medium", adornment: { position: "left", icon: "child", action: { type: "open_drawer", entity: "child", idPath: "child.id" } } },
                ]}
                rows={[
                    {
                        id: "child-1",
                        "child.id": "child-1",
                        "child.name": "Harper Hayes",
                    },
                ]}
                anchorRecord={{ id: "person-1" }}
                onAdornmentAction={() => {}}
            />,
        );
        expect(html).toContain('data-drawer-household-child-link-avatar="true"');
        expect(html).toContain('aria-label="Open Harper Hayes"');
    });
});

describe("PersonDrawerIdentityAvatar", () => {
    it("accepts imageUrl for future profile photo readiness", () => {
        const html = renderToStaticMarkup(
            <PersonDrawerIdentityAvatar
                displayName="Jamie Johnson"
                initials="JJ"
                imageUrl="https://example.com/jamie.jpg"
            />,
        );
        expect(html).toContain('data-person-drawer-avatar="photo"');
        expect(html).toContain("https://example.com/jamie.jpg");
    });

    it("uses neutral initials fallback styling when no photo is present", () => {
        const html = renderToStaticMarkup(
            <PersonDrawerIdentityAvatar displayName="Jamie Johnson" initials="JJ" />,
        );
        expect(html).toContain('data-person-drawer-avatar="initials"');
        expect(html).toContain("border-alloy-stone/18");
        expect(html).not.toContain("border-alloy-blue");
    });
});

describe("DrawerHouseholdContactCardList person links", () => {
    it("renders avatar link affordance on each linked contact row", () => {
        const html = renderToStaticMarkup(
            <DrawerHouseholdContactCardList
                contacts={[
                    {
                        person_id: "person-guardian",
                        display_name: "Alex Johnson",
                        initials: "AJ",
                        role_label: "Guardian",
                        role_type: "guardian",
                        is_primary: false,
                        phone: "555-333-4444",
                        email: null,
                    },
                ]}
                anchorRecord={{ id: "opp-1" }}
                onAdornmentAction={() => {}}
            />,
        );
        expect(html).toContain('data-drawer-household-contact-card="true"');
        expect(html).toContain('data-drawer-household-person-link-avatar="true"');
        expect(html).toContain('aria-label="Open Alex Johnson"');
    });
});

describe("drawer outer shell presentation", () => {
    it("does not apply colored right rail on cleaning-v2 drawer header", () => {
        const drawer = readFileSync(
            join(process.cwd(), "components/admin/Drawer.tsx"),
            "utf8",
        );
        expect(drawer).not.toContain("borderRightColor: \"var(--vc-header-rail-accent)\"");
    });
});

describe("buildLeadEnrollmentCardMetaPresentation", () => {
    it("structures birth line and labeled detail segments", () => {
        const presentation = buildLeadEnrollmentCardMetaPresentation(
            {
                "child.dob_age": "Jan 1, 2026 · 5m",
                "child.program": "Infant Full Day",
                "child.start_date": "Aug 8, 2026",
                "child.schedule": "",
                "child.room": "",
                "child.location": "North Campus",
                "child.status": "",
            },
            [
                { label: "DOB / Age", refKey: "child.dob_age", width: "medium" },
                { label: "Program", refKey: "child.program", width: "medium" },
                { label: "Desired start", refKey: "child.start_date", width: "medium" },
                { label: "Schedule", refKey: "child.schedule", width: "medium" },
                { label: "Classroom", refKey: "child.room", width: "medium" },
                { label: "Location", refKey: "child.location", width: "medium" },
                { label: "Status", refKey: "child.status", width: "medium" },
            ],
        );

        expect(presentation.birthLine).toBe("Born Jan 1, 2026 · 5m");
        expect(presentation.startLocationLine).toBe("Start Aug 8, 2026 • North Campus");
        expect(presentation.segments.find((s) => s.refKey === "child.program")?.display).toBe("Infant Full Day");
        expect(presentation.segments.find((s) => s.refKey === "child.schedule")?.isPlaceholder).toBe(true);
        expect(presentation.segments.find((s) => s.refKey === "child.location")).toBeUndefined();
    });
});
