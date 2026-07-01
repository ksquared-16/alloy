/** Realistic inquiry text — visible in Source Material across all mockup states. */
export const SOURCE_INQUIRY = `Parent: Jordan Lee
Email: jordan@example.com
Phone: (555) 123-4567
Child: Riley Lee
Program: Toddler Room
Source: Website inquiry
Notes: Wants a tour next week, flexible on start date`;

/** Ambiguous paste for Fill Gaps state — missing phone. */
export const SOURCE_INQUIRY_PARTIAL = `Interested in Bend location for toddler care.
Jordan reached out via website form.
Email: jordan@example.com
Child: Riley, age 2`;

export type FindingStatus = "confirmed" | "review" | "uncertain";

export type FindingGroup = {
    id: string;
    status: FindingStatus;
    headline: string;
    bosLine: string;
    details: { label: string; value: string }[];
    included?: boolean;
    expanded?: boolean;
};

export const FINDINGS_FULL: FindingGroup[] = [
    {
        id: "contact",
        status: "confirmed",
        headline: "Found Contact Information",
        bosLine: "Email and phone are clearly labeled in the inquiry.",
        details: [
            { label: "Email", value: "jordan@example.com" },
            { label: "Phone", value: "(555) 123-4567" },
        ],
        included: true,
    },
    {
        id: "parent",
        status: "confirmed",
        headline: "Found Parent Name",
        bosLine: "Parent line maps cleanly to first and last name.",
        details: [
            { label: "First name", value: "Jordan" },
            { label: "Last name", value: "Lee" },
        ],
        included: true,
    },
    {
        id: "child",
        status: "confirmed",
        headline: "Found Child Information",
        bosLine: "One child named with program interest.",
        details: [
            { label: "Child", value: "Riley Lee" },
            { label: "Program", value: "Toddler Room" },
        ],
        included: true,
    },
    {
        id: "source",
        status: "review",
        headline: "Source Needs Review",
        bosLine: "Source is present but phrasing is informal — please confirm.",
        details: [{ label: "Source", value: "Website inquiry" }],
        included: true,
        expanded: true,
    },
    {
        id: "notes",
        status: "confirmed",
        headline: "Found Inquiry Notes",
        bosLine: "Tour timing and flexibility captured from notes line.",
        details: [{ label: "Notes", value: "Wants a tour next week, flexible on start date" }],
        included: true,
    },
];

export const FINDINGS_WITH_UNCERTAIN: FindingGroup[] = [
    {
        id: "contact",
        status: "confirmed",
        headline: "Found Contact Information",
        bosLine: "Email is explicit. No phone in source.",
        details: [{ label: "Email", value: "jordan@example.com" }],
        included: true,
    },
    {
        id: "parent",
        status: "review",
        headline: "Parent Name Needs Review",
        bosLine: "Only a first name is clear — last name is missing.",
        details: [{ label: "First name", value: "Jordan" }],
        included: true,
        expanded: true,
    },
    {
        id: "child",
        status: "confirmed",
        headline: "Found Child Information",
        bosLine: "Child first name and age hint extracted.",
        details: [
            { label: "Child", value: "Riley" },
            { label: "Age hint", value: "2 years" },
        ],
        included: true,
    },
    {
        id: "location",
        status: "review",
        headline: "Location Requires Confirmation",
        bosLine: "“Bend location” may be a site preference, not a program name.",
        details: [{ label: "Location interest", value: "Bend" }],
        included: false,
        expanded: true,
    },
];

export const FINDINGS_COLLAPSED: FindingGroup[] = [
    {
        id: "contact",
        status: "confirmed",
        headline: "Found Contact Information",
        bosLine: "Applied.",
        details: [{ label: "Email", value: "jordan@example.com" }],
        included: true,
    },
    {
        id: "parent",
        status: "review",
        headline: "Parent Name Needs Review",
        bosLine: "Last name still missing.",
        details: [{ label: "First name", value: "Jordan" }],
        included: true,
    },
    {
        id: "child",
        status: "confirmed",
        headline: "Found Child Information",
        bosLine: "Applied.",
        details: [{ label: "Child", value: "Riley" }],
        included: true,
    },
];

export const READY_SUMMARY = [
    { label: "Parent", value: "Jordan Lee" },
    { label: "Contact", value: "jordan@example.com · (555) 123-4567" },
    { label: "Child", value: "Riley Lee · Toddler Room" },
    { label: "Source", value: "Website inquiry" },
];
