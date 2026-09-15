/**
 * The Developer Platform human QA walkthrough, as data.
 *
 * Separated from the component because the catalog is the artifact: it is what
 * gets reviewed, argued with and added to, and a reviewer should be able to read
 * the whole test plan without reading a single line of React.
 *
 * ONE STEP IS AUTHORED, AND SAYS SO. Sections A-M are dictated. DP-QA-76 arrived
 * truncated mid-sentence — "does this feel like one coherent" — so its closing
 * clause is completed here from its own heading, and it carries `authored: true`
 * so an operator can see the seam. Everything else is as instructed.
 */

export type StepResult = "PASS" | "FAIL" | "BLOCKED" | "NEEDS_REVIEW";
export type Severity = "P0" | "P1" | "P2" | "P3";

export type QaStep = {
    id: string;
    area: string;
    objective: string;
    startingState: string;
    action: string;
    expected: string[];
    why: string;
    /** The judgement the operator is actually being asked for, in their own terms. */
    humanQuestion?: string;
    /** A step whose failure blocks external readiness outright. */
    hardGate?: boolean;
    /** Written by this lane rather than dictated by the instruction. */
    authored?: boolean;
};

export type QaSection = { id: string; title: string; intent: string; steps: QaStep[] };

export const SEVERITIES: { value: Severity; label: string }[] = [
    { value: "P0", label: "P0 — security or data integrity" },
    { value: "P1", label: "P1 — prevents the intended workflow" },
    { value: "P2", label: "P2 — incorrect or confusing behaviour" },
    { value: "P3", label: "P3 — polish or documentation" },
];

export const SECTIONS: QaSection[] = [
    {
        id: "A",
        title: "Organization → Integrations discovery",
        intent: "Can an administrator find this without being told where it lives?",
        steps: [
            {
                id: "DP-QA-01",
                area: "Navigation",
                objective: "Integrations is discoverable by an ordinary operator.",
                startingState: "Signed in, on the Organization configuration home.",
                action: "Navigate to Integrations the way an administrator would — by looking, not by typing a URL.",
                expected: [
                    "Integrations is reachable without knowing an internal path.",
                    "It sits in the Organization/configuration hierarchy where a reader would look for it.",
                    "The label reads Integrations.",
                    "Navigation is not dominated by Developer Platform jargon.",
                    "No /adminV2 or other implementation terminology appears in product copy.",
                ],
                why: "An integration surface nobody can find is an integration surface nobody uses, and the operator noun is the product — the route is not.",
                humanQuestion: "If I were an administrator trying to connect another system, would I naturally come here?",
            },
            {
                id: "DP-QA-02",
                area: "Integrations landing",
                objective: "The landing page explains itself without technical priming.",
                startingState: "On Organization → Integrations.",
                action: "Read the page as a first-time visitor. Do not click anything for thirty seconds.",
                expected: [
                    "It says what an integration is.",
                    "It shows what is currently connected.",
                    "Current state or health is visible.",
                    "How to add another integration is obvious.",
                ],
                why: "This is the first impression an administrator forms of the whole Developer Platform.",
                humanQuestion: "Does this feel like a finished Alloy configuration product, or like an internal admin tool someone left switched on?",
            },
            {
                id: "DP-QA-03",
                area: "Installation list",
                objective: "A row is legible without opening it.",
                startingState: "Integrations list, with the QA fixture installations present.",
                action: "Read one installation row without clicking through.",
                expected: [
                    "The integration's identity is clear.",
                    "Its status is clear.",
                    "Access scope is conveyed at a useful level.",
                    "Health is visible.",
                    "No database identifier is required to understand the row.",
                ],
                why: "An operator triaging a partner problem starts on this list; if the row is opaque the list is decoration.",
            },
        ],
    },
    {
        id: "B",
        title: "Add Integration",
        intent: "Does connecting a system feel designed, or like raw record creation?",
        steps: [
            {
                id: "DP-QA-04",
                area: "Add Integration",
                objective: "The flow is guided and explains itself.",
                startingState: "Integrations list.",
                action: "Click Add Integration.",
                expected: [
                    "A deliberate, staged flow opens.",
                    "It explains what is being set up.",
                    "It does not look like a database form.",
                ],
                why: "Granting machine authority into a tenant is a consequential act and should feel like one.",
            },
            {
                id: "DP-QA-05",
                area: "Application selection",
                objective: "Applications are presented as products, not keys.",
                startingState: "Step 1 of the wizard.",
                action: "Read the list of approved applications. The QA fixture registers three, all named 'QA Integration — …'.",
                expected: [
                    "Names are human-readable.",
                    "Descriptions appear where available.",
                    "No raw slug or key is the primary label.",
                    "Selection is obvious.",
                    "Nothing unapproved or disabled appears.",
                ],
                why: "This chooser is where a partner's product identity is first shown to a customer.",
                humanQuestion: "Would Classroom Coach look like a real integration choice here, once registered?",
            },
            {
                id: "DP-QA-06",
                area: "Capabilities",
                objective: "Capabilities are comprehensible, and none of them overstate what Alloy offers.",
                startingState: "Capability step of the wizard.",
                action: "Read every capability offered. Look specifically for anything attendance-related.",
                expected: [
                    "Each capability is understandable without internal knowledge.",
                    "The list is not a wall of raw permission keys.",
                    "Nothing implies a public Attendance API exists.",
                ],
                why: "attendance.write exists as scope vocabulary and there is no public Attendance endpoint. A capability list that implies otherwise would make Alloy promise something it cannot serve.",
                hardGate: true,
            },
            {
                id: "DP-QA-07",
                area: "Resource boundary",
                objective: "Org-wide and selected-location access are visibly different decisions.",
                startingState: "Access step of the wizard.",
                action: "Configure organization-wide access, then go back and configure selected-location access.",
                expected: [
                    "The difference between the two is obvious.",
                    "Locations are named understandably.",
                    "Hierarchy is clear enough to select confidently.",
                    "Selection works and reflects what was chosen.",
                ],
                why: "This control decides how much of a customer's estate a third party can read.",
                humanQuestion: "Could I accidentally give this integration access to more centres than I intended? If yes, this is a FAIL.",
                hardGate: true,
            },
            {
                id: "DP-QA-08",
                area: "Creation",
                objective: "Creation succeeds visibly and survives a reload.",
                startingState: "Review step of the wizard.",
                action: "Complete the wizard. Then reload the page.",
                expected: [
                    "The installation is created.",
                    "Success is unmistakable.",
                    "No raw technical payload is shown.",
                    "You land somewhere useful.",
                    "After reload the installation is still there and the page is coherent.",
                ],
                why: "A creation an operator cannot confirm is a creation they will repeat.",
            },
        ],
    },
    {
        id: "C",
        title: "Installation detail",
        intent: "Does the detail surface answer an operator's real questions?",
        steps: [
            {
                id: "DP-QA-09",
                area: "Installation detail",
                objective: "The surface answers the seven questions an operator actually has.",
                startingState: "Integrations list.",
                action: "Open the installation you just created.",
                expected: [
                    "What integration is this?",
                    "Is it active?",
                    "What can it do?",
                    "Which locations can it reach?",
                    "Does it have a usable credential?",
                    "Is it healthy?",
                    "What happened recently?",
                ],
                why: "Each answer should be available before opening any technical detail.",
            },
            {
                id: "DP-QA-10",
                area: "Capabilities editing",
                objective: "Changing capabilities is deliberate and persists.",
                startingState: "Installation detail.",
                action: "Change the granted capabilities, save, then reload.",
                expected: [
                    "Current grants are obvious before you change anything.",
                    "The change is deliberate rather than incidental.",
                    "Save feedback is clear.",
                    "Reload shows the saved state.",
                    "Copy distinguishes capability from location access.",
                ],
                why: "Capability and boundary are independent; product copy that blurs them teaches an operator the wrong model.",
            },
            {
                id: "DP-QA-11",
                area: "Location access editing",
                objective: "Changing the boundary communicates the resulting authority.",
                startingState: "Installation detail.",
                action: "Switch between org-wide and selected locations, saving each time.",
                expected: [
                    "The resulting authority is understandable.",
                    "Selected locations persist across reload.",
                    "An empty restricted selection is never presented as unrestricted.",
                    "Descendant behaviour is communicated where it applies.",
                ],
                why: "An empty restricted list means no access. If the product lets that read as 'everything', the failure is silent and total.",
                hardGate: true,
            },
        ],
    },
    {
        id: "D",
        title: "Credential lifecycle",
        intent: "The one-time secret is the platform's sharpest edge. Handle it badly and nothing else matters.",
        steps: [
            {
                id: "DP-QA-12",
                area: "Issue credential",
                objective: "Issuance explains the one-time nature before it happens.",
                startingState: "Installation detail, no active credential.",
                action: "Issue a credential. Read everything before dismissing anything.",
                expected: [
                    "The product says the secret is shown once.",
                    "The client identifier is distinguishable from the secret.",
                    "It is clear what must be copied.",
                    "It is clear the secret cannot be recovered later.",
                    "No secret was visible before you chose to issue one.",
                ],
                why: "A developer who does not know the secret is unrecoverable will not store it, and will be locked out an hour later.",
            },
            {
                id: "DP-QA-13",
                area: "One-time reveal",
                objective: "The secret is shown once and never again.",
                startingState: "Immediately after issuing a credential.",
                action: "Reveal and copy the secret into your own secure scratch space. Then reload the page.",
                expected: [
                    "The secret is visible exactly once.",
                    "A copy affordance works.",
                    "The warning is clear.",
                    "After reload the secret is NOT shown again.",
                ],
                why: "This is the difference between a credential store and a credential leak.",
                humanQuestion: "Do not paste the secret into the notes field on this page. Notes are stored in your browser.",
                hardGate: true,
            },
            {
                id: "DP-QA-14",
                area: "Credential metadata",
                objective: "Useful non-secret metadata survives; the secret does not.",
                startingState: "After the reload in DP-QA-13.",
                action: "Inspect the credential entry.",
                expected: [
                    "Status is shown.",
                    "An identifier or label is shown.",
                    "Issued time appears where implemented.",
                    "Last used appears where implemented.",
                    "Expiry appears where implemented.",
                    "No secret material anywhere.",
                ],
                why: "An operator has to be able to tell two credentials apart during a rotation without seeing either secret.",
            },
            {
                id: "DP-QA-15",
                area: "Rotation",
                objective: "Rotation is safe to perform without causing an outage.",
                startingState: "Installation with an active credential.",
                action: "Rotate the credential. Read the consequences as presented.",
                expected: [
                    "Consequences are explained before you commit.",
                    "The overlap window is understandable.",
                    "The new secret gets its own one-time reveal.",
                    "The prior credential's state is represented correctly.",
                ],
                why: "Rotation exists so that partners can rotate without downtime. If the overlap is not explained, nobody will use it.",
                humanQuestion: "Could a developer rotate this without accidentally causing an unexplained outage?",
            },
            {
                id: "DP-QA-16",
                area: "Revocation",
                objective: "Revocation reads as consequential and is reflected honestly.",
                startingState: "Installation with at least one credential.",
                action: "Revoke a credential.",
                expected: [
                    "The security significance is clear.",
                    "Confirmation is proportionate.",
                    "The revoked state is visible afterwards.",
                    "Nothing implies a revoked credential still works.",
                    "Rotate and Revoke are no longer offered for that credential.",
                ],
                why: "A dead control that still looks live spends a round trip to say no — the defect Gate 2 found and repaired.",
            },
        ],
    },
    {
        id: "E",
        title: "Installation lifecycle",
        intent: "Suspension is the operator's emergency brake.",
        steps: [
            {
                id: "DP-QA-17",
                area: "Suspend",
                objective: "Suspension is unmistakable and its consequences are stated.",
                startingState: "Active installation.",
                action: "Suspend the installation.",
                expected: [
                    "Status clearly reads suspended.",
                    "The consequence — API access stops — is explained.",
                    "Credentials and configuration remain inspectable.",
                ],
                why: "An operator reaching for this is usually reacting to an incident and needs certainty, not ambiguity.",
            },
            {
                id: "DP-QA-18",
                area: "Reactivate",
                objective: "Reactivation restores the prior state without reconfiguration.",
                startingState: "Suspended installation.",
                action: "Reactivate it.",
                expected: [
                    "State returns coherently.",
                    "No capability or boundary has to be re-entered.",
                    "Health updates appropriately.",
                ],
                why: "If suspending costs a reconfiguration, operators will avoid the control that exists to protect them.",
            },
        ],
    },
    {
        id: "F",
        title: "Health and API Activity",
        intent: "Can an operator diagnose a partner's complaint from this product alone?",
        steps: [
            {
                id: "DP-QA-19",
                area: "Health",
                objective: "Health means something specific.",
                startingState: "Installation detail.",
                action: "Read the health state and try to determine what produces it.",
                expected: [
                    "The state is explained, not merely coloured.",
                    "You can tell what would change it.",
                ],
                why: "A health badge nobody can interpret is worse than none, because it invites false confidence.",
                humanQuestion: "If this says Healthy, do I know what that actually means?",
            },
            {
                id: "DP-QA-20",
                area: "API Activity",
                objective: "Recent external activity is legible and safe.",
                startingState: "Installation detail, after the Section H calls have run.",
                action: "Open API Activity and read the most recent entries.",
                expected: [
                    "Timestamp is present.",
                    "Operation or path is present.",
                    "Result is present.",
                    "A request or correlation identifier appears where appropriate.",
                    "No secrets anywhere.",
                    "No stack traces or internal debug noise.",
                ],
                why: "This is the operator's half of a support conversation with a partner engineer.",
                humanQuestion: "If Classroom Coach says 'your API rejected this request', could I start diagnosing it here?",
            },
        ],
    },
    {
        id: "G",
        title: "Developer documentation",
        intent: "Read as a Classroom Coach engineer who has never seen Alloy. Internal knowledge is cheating.",
        steps: [
            {
                id: "DP-QA-21",
                area: "Discoverability",
                objective: "Documentation is reachable from the product.",
                startingState: "Integrations or installation detail.",
                action: "Find Developer Documentation / API Reference without using the repository.",
                expected: [
                    "It is reachable from the product.",
                    "The handoff from operator setup to developer implementation makes sense.",
                ],
                why: "The administrator who installs the integration is rarely the person who writes the code.",
            },
            {
                id: "DP-QA-22",
                area: "Introduction",
                objective: "The introduction alone answers the seven model questions.",
                startingState: "Developer documentation, introduction only.",
                action: "Read only the introduction, then answer the seven questions in your notes.",
                expected: [
                    "What is an Application?",
                    "What is an Installation?",
                    "What is a Credential?",
                    "What determines which organization I access?",
                    "Can I choose an arbitrary org id?",
                    "What does a scope do?",
                    "What does a location boundary do?",
                ],
                why: "If a partner engineer cannot answer these after the introduction, every later mistake traces back here.",
            },
            {
                id: "DP-QA-23",
                area: "Capability truth",
                objective: "The documented surface matches exactly what exists.",
                startingState: "Developer documentation / API reference.",
                action: "Find the list of current public operations.",
                expected: [
                    "POST /api/v1/oauth/token",
                    "GET /api/v1/context",
                    "GET /api/v1/locations",
                    "No public Attendance mutation.",
                    "No child, staff, household or webhook API presented as available.",
                ],
                why: "A documented endpoint that does not exist is the single most expensive error an API programme can ship.",
                hardGate: true,
            },
            {
                id: "DP-QA-24",
                area: "Scope truth",
                objective: "Scope vocabulary is not mistaken for available operations.",
                startingState: "Scope documentation.",
                action: "Read the scope list, paying attention to attendance.write.",
                expected: [
                    "The documentation distinguishes 'a scope exists' from 'an endpoint exists'.",
                    "No reasonable developer would conclude a public Attendance mutation is callable.",
                ],
                why: "The scope is real and the endpoint is not. Only the documentation can keep those apart.",
                hardGate: true,
            },
            {
                id: "DP-QA-25",
                area: "Authentication instructions",
                objective: "Authentication is implementable from the documentation alone.",
                startingState: "Authentication documentation.",
                action: "Read it and write down, without the repository, what you would implement.",
                expected: [
                    "Where the client id comes from.",
                    "Where the secret comes from and that it is shown once.",
                    "The token endpoint.",
                    "The request format.",
                    "The response format.",
                    "How to present the bearer token.",
                    "What happens at expiry.",
                ],
                why: "This is the first code a partner writes, and the first place they will get stuck.",
            },
        ],
    },
    {
        id: "H",
        title: "Live developer quickstart",
        intent: "Leave the product and use the real HTTP boundary, exactly as documented.",
        steps: [
            {
                id: "DP-QA-26",
                area: "Token exchange",
                objective: "A valid credential exchanges for a token, as documented.",
                startingState: "You hold the client id and secret you copied in DP-QA-13.",
                action: "Run the token exchange command from the Commands panel on this page.",
                expected: [
                    "200 with access_token, token_type Bearer, expires_in and scope.",
                    "The token is opaque — an alloy_at_ prefix, not a decodable JWT.",
                    "expires_in matches the documentation.",
                    "Cache-Control is no-store.",
                ],
                why: "Everything downstream depends on this one call behaving as written.",
            },
            {
                id: "DP-QA-27",
                area: "Context",
                objective: "Context describes the caller and cannot be redirected to another tenant.",
                startingState: "You hold a bearer token.",
                action: "Call GET /api/v1/context. Then call it again with ?org_id=<some other uuid> appended.",
                expected: [
                    "The response matches the documentation and OpenAPI.",
                    "You can tell which installation and organization it represents.",
                    "Scopes and resource boundary are reported.",
                    "The org_id parameter changes nothing.",
                ],
                why: "Tenant authority comes from the installation. If a query parameter could move it, the whole model is void.",
                hardGate: true,
            },
            {
                id: "DP-QA-28",
                area: "Locations",
                objective: "The Location response matches the published contract exactly.",
                startingState: "Bearer token from the org-wide fixture installation.",
                action: "Call GET /api/v1/locations and read one record field by field.",
                expected: [
                    "Fields are exactly: id, type, unit_role, name, parent_id, site_id, active, updated_at.",
                    "No timezone field.",
                    "Only site and unit records — no address or premises rows.",
                ],
                why: "Timezone is deliberately internal. A field appearing here that the specification does not name is an undocumented promise.",
                hardGate: true,
            },
            {
                id: "DP-QA-29",
                area: "Boundary",
                objective: "A restricted installation sees only its own campus.",
                startingState: "Use the qa-dp-restricted fixture credential.",
                action: "Call GET /api/v1/locations with the restricted installation's token.",
                expected: [
                    "Only the authorized site and its descendants appear.",
                    "The sibling campus does not appear.",
                ],
                why: "This is the promise Alloy makes to a customer about what a third party can read.",
                hardGate: true,
            },
            {
                id: "DP-QA-30",
                area: "Restricted-empty",
                objective: "An empty boundary means no access, never everything.",
                startingState: "Edit the restricted installation to selected-locations with nothing selected, or use a fixture shaped that way.",
                action: "Call GET /api/v1/locations.",
                expected: [
                    "No locations are returned.",
                    "The response never silently widens to org-wide.",
                ],
                why: "A half-provisioned installation must fail closed. This is the failure mode that would be least visible and most damaging.",
                hardGate: true,
            },
            {
                id: "DP-QA-31",
                area: "Incremental sync",
                objective: "A partner could implement reliable sync from the documentation alone.",
                startingState: "Bearer token, documentation open.",
                action: "Perform a full read, record the highest updated_at, then call again with updated_since set to it.",
                expected: [
                    "The initial collection works.",
                    "The incremental call works and returns only later changes.",
                    "The documented deterministic semantics hold.",
                    "The documentation states that deletion is not detected this way.",
                ],
                why: "Incremental sync is the first real integration a partner builds, and the deletion caveat is the thing that bites silently.",
                humanQuestion: "Could an external integration implement a reliable Location sync from these instructions alone?",
            },
            {
                id: "DP-QA-32",
                area: "Pagination",
                objective: "Paging is deterministic under a stable fixture.",
                startingState: "Bearer token, org-wide installation.",
                action: "Call with limit=2, follow next_cursor to the end, and compare against a single limit=200 call.",
                expected: [
                    "next_cursor advances.",
                    "No duplicate records.",
                    "No skipped records.",
                    "The paged sequence matches the single-call sequence.",
                ],
                why: "A partner's sync loop is built on exactly this behaviour.",
                humanQuestion: "If the fixture does not hold enough locations to page, mark BLOCKED and repair the fixture rather than recording a pass.",
            },
        ],
    },
    {
        id: "I",
        title: "Error and security behaviour",
        intent: "Refusals are a contract too, and they are what a partner sees on their worst day.",
        steps: [
            {
                id: "DP-QA-33",
                area: "Invalid credential",
                objective: "A bad secret is refused safely.",
                startingState: "Any fixture client id.",
                action: "Attempt token exchange with a deliberately wrong secret.",
                expected: [
                    "401 with the documented error envelope.",
                    "code invalid_credential.",
                    "A request_id is present.",
                    "No stack trace, no SQL, no hint about which part was wrong.",
                ],
                why: "An error that distinguishes 'unknown client' from 'wrong secret' is an oracle for guessing.",
                hardGate: true,
            },
            {
                id: "DP-QA-34",
                area: "Revoked credential",
                objective: "A revoked credential stops working immediately.",
                startingState: "The credential you revoked in DP-QA-16.",
                action: "Attempt token exchange with it.",
                expected: ["Refused, per the documented contract."],
                why: "Revocation that waits for token expiry is not revocation.",
                hardGate: true,
            },
            {
                id: "DP-QA-35",
                area: "Suspended installation",
                objective: "Suspension stops API access.",
                startingState: "An installation with a working credential.",
                action: "Suspend it, attempt token exchange and an API call, then reactivate it.",
                expected: [
                    "Access is refused while suspended.",
                    "The refusal matches the documented contract.",
                    "Reactivating restores access.",
                ],
                why: "This is the operator's emergency brake; it has to actually stop the vehicle.",
                hardGate: true,
            },
            {
                id: "DP-QA-36",
                area: "Missing capability",
                objective: "A missing scope is refused clearly and is not an empty list.",
                startingState: "Use the qa-dp-noscope fixture credential.",
                action: "Call GET /api/v1/locations.",
                expected: [
                    "403 with type forbidden_scope.",
                    "The message makes sense to a developer.",
                    "No internal permission keys are exposed.",
                    "It is NOT an empty 200.",
                ],
                why: "'You may not ask' and 'there is nothing here' are different answers, and a partner debugging the wrong one wastes days.",
                hardGate: true,
            },
            {
                id: "DP-QA-37",
                area: "Boundary violation",
                objective: "Caller input cannot widen authority.",
                startingState: "The restricted fixture credential.",
                action: "Call Locations with location_id set to the unauthorized sibling campus.",
                expected: [
                    "An empty result, not the unauthorized record.",
                    "No parameter combination returns something outside the boundary.",
                ],
                why: "A filter that can reach past the boundary is a boundary that does not exist.",
                hardGate: true,
            },
            {
                id: "DP-QA-38",
                area: "Rate limiting",
                objective: "Rate limiting behaves as documented.",
                startingState: "Any valid credential.",
                action: "Inspect the RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset headers on a normal response. Do not generate damaging volume.",
                expected: [
                    "Headers are present on ordinary responses.",
                    "Values are consistent with the documented policy.",
                    "The documentation describes what happens at 429, including Retry-After.",
                ],
                why: "Partners plan their polling against these numbers, and observing headers is enough — exhausting the budget is not.",
            },
        ],
    },
    {
        id: "J",
        title: "OpenAPI and reference parity",
        intent: "The reference is an executable promise. Compare it against what actually happened.",
        steps: [
            {
                id: "DP-QA-39",
                area: "Reference completeness",
                objective: "The reference contains exactly the public API.",
                startingState: "Governed API reference open.",
                action: "Enumerate every path it documents.",
                expected: [
                    "Exactly three paths.",
                    "No internal AdminV2 routes.",
                    "No speculative or future endpoints presented as available.",
                ],
                why: "Coverage in both directions is the whole point of a governed contract.",
                hardGate: true,
            },
            {
                id: "DP-QA-40",
                area: "Token parity",
                objective: "The token endpoint reference matches what you observed.",
                startingState: "Your DP-QA-26 and DP-QA-33 responses.",
                action: "Compare method, request shape, response shape and error statuses against the reference.",
                expected: ["No contradiction in any of the four."],
                why: "A partner will code against the reference, not against your observation.",
            },
            {
                id: "DP-QA-41",
                area: "Context parity",
                objective: "The context reference matches what you observed.",
                startingState: "Your DP-QA-27 response.",
                action: "Compare field by field.",
                expected: ["No contradiction."],
                why: "Same reason, one endpoint along.",
            },
            {
                id: "DP-QA-42",
                area: "Location parity",
                objective: "The Location reference matches what you observed.",
                startingState: "Your DP-QA-28 response.",
                action: "Compare field names, types, hierarchy fields, collection metadata, pagination and incremental semantics — and confirm timezone is absent in both.",
                expected: ["No contradiction, and no timezone in either."],
                why: "Location is the only domain resource Alloy currently publishes; its contract carries the credibility of the rest.",
                hardGate: true,
            },
        ],
    },
    {
        id: "K",
        title: "External presentation quality",
        intent: "Stop thinking like an Alloy builder. Would you be comfortable sending this exact experience to a professional external engineering team, and letting it represent Alloy without additional explanation?",
        steps: [
            {
                id: "DP-QA-43",
                area: "First impression",
                objective: "The documentation reads as a developer product within a minute.",
                startingState: "Developer Platform documentation, opened from its normal product entry point. Do not look at the repository first.",
                action: "Scan the page for 30-60 seconds, then answer from what you actually absorbed.",
                expected: [
                    "What the Alloy Developer Platform is.",
                    "What you can currently do with it.",
                    "How authentication works at a high level.",
                    "Where to begin.",
                    "Where the API reference lives.",
                    "That the implemented public API is deliberately bounded."
                ],
                why: "FAIL or NEEDS REVIEW if the opening is overly conceptual, internal terminology dominates, implementation leads before developer tasks, current capability is hard to determine, roadmap looks available, or the next step is unclear.",
                humanQuestion: "If Classroom Coach opened this with no meeting or walkthrough from us, would they understand what Alloy is offering them?"
            },
            {
                id: "DP-QA-44",
                area: "Visual professionalism",
                objective: "The surface looks intentional and finished.",
                startingState: "The entire external documentation surface.",
                action: "Review typography, spacing, hierarchy, code blocks, tables, navigation, callouts, examples, empty states, long-page readability, colour, density and behaviour at a normal laptop width.",
                expected: [
                    "It does not look like raw Markdown dumped into a browser.",
                    "It does not look like an internal admin page.",
                    "It is not bare generated OpenAPI with no developer experience around it.",
                    "It does not read as an engineering wiki or a certification artifact.",
                    "It is consistent with Alloy's visual language."
                ],
                why: "Flag every visual issue you would be embarrassed to explain away on a partner call."
            },
            {
                id: "DP-QA-45",
                area: "Terminology",
                objective: "External vocabulary is ratified and internal vocabulary does not leak.",
                startingState: "Documentation, read specifically for word choice.",
                action: "Check the external concepts, then hunt for leakage.",
                expected: [
                    "Uses: Developer Application, Installation, Credential, Application Principal where necessary, scope/capability, resource boundary, API Activity, Location, API request, access token.",
                    "No AdminV2, Supabase, table names, internal permission architecture, command keys, migration names, runtime registry names, certification terminology, internal route names, staging language, or thread/sprint terminology — unless it has a legitimate developer-facing reason."
                ],
                why: "Leaked internal vocabulary tells a partner they are reading something that was never meant for them."
            },
            {
                id: "DP-QA-46",
                area: "Capability honesty",
                objective: "Every capability claim is true today, or is clearly marked as not yet available.",
                startingState: "The whole specification.",
                action: "For every capability statement ask: can I actually do this today through the documented external product? Inspect authentication, context, Locations, pagination, incremental sync, credential lifecycle, scopes, boundaries and API Activity. Then inspect Attendance, children, staff, relationships, enrollment, placement, schedules, webhooks, correlation APIs and mutation APIs.",
                expected: [
                    "Everything described as currently available actually is.",
                    "Everything else is clearly internal foundation, planned, future, not yet available, or provider dependent.",
                    "Zero architecture presented as product."
                ],
                why: "Architecture presented as product is the single most damaging error this documentation could contain.",
                hardGate: true
            },
            {
                id: "DP-QA-47",
                area: "Surface clarity",
                objective: "A developer can determine the exact current public surface without reading OpenAPI internals.",
                startingState: "Documentation, without reference to these QA instructions.",
                action: "Find the list of currently available public operations.",
                expected: [
                    "POST /api/v1/oauth/token",
                    "GET /api/v1/context",
                    "GET /api/v1/locations",
                    "No ambiguity between current endpoint, future endpoint, internal capability, scope vocabulary and example architecture."
                ],
                why: "Could an external developer mistakenly believe another endpoint exists? If yes, FAIL.",
                hardGate: true
            },
            {
                id: "DP-QA-48",
                area: "Getting started",
                objective: "Ten practical questions are answerable from the docs alone.",
                startingState: "You have just received credentials from an Alloy customer.",
                action: "Answer all ten in your notes using only the external documentation.",
                expected: [
                    "Where do I exchange my credentials?",
                    "What do I send?",
                    "What do I receive?",
                    "How do I authenticate subsequent requests?",
                    "How do I verify which Installation I am connected to?",
                    "How do I retrieve Locations?",
                    "How do I continue through multiple pages?",
                    "How do I perform incremental synchronization?",
                    "What happens if my credential is revoked?",
                    "Who do I contact, and with what information, if something fails?"
                ],
                why: "Anything requiring tribal knowledge is a QA defect."
            },
            {
                id: "DP-QA-49",
                area: "Copy/paste quality",
                objective: "Every example runs as written.",
                startingState: "All developer-facing code examples.",
                action: "Inspect each example, then execute representative ones against the certification fixture.",
                expected: [
                    "Syntactically valid and internally consistent.",
                    "Copyable and correctly formatted.",
                    "No smart-quote corruption.",
                    "No real credentials or customer identifiers.",
                    "Consistent placeholder conventions.",
                    "Correct paths, headers, and fields that actually exist."
                ],
                why: "An example that looks correct but does not execute is a FAIL."
            },
            {
                id: "DP-QA-50",
                area: "Authentication explanation",
                objective: "The credential lifecycle cannot be misread into insecure handling.",
                startingState: "The authentication section only.",
                action: "Read it and check the chain is unmistakable: client id + secret → token exchange → short-lived opaque bearer token → authenticated /api/v1 requests.",
                expected: [
                    "The secret is long-lived relative to the access token.",
                    "It must be stored securely.",
                    "It is not sent on every resource request.",
                    "Access tokens expire.",
                    "Revoked credentials stop working.",
                    "Suspension prevents access.",
                    "Rotation is not 'edit the secret'."
                ],
                why: "Flag anything that could reasonably lead a developer into insecure credential handling."
            },
            {
                id: "DP-QA-51",
                area: "Tenant boundary explanation",
                objective: "Authority is obviously server-derived.",
                startingState: "The authority/scoping section, read as an external developer.",
                action: "Read it and decide whether both statements are unmistakable.",
                expected: [
                    "The Installation determines the Alloy organization.",
                    "The caller cannot reach another organization by supplying another organization identifier.",
                    "Capability and resource access are separate.",
                    "An Installation may be org-wide or location-restricted.",
                    "Restriction is enforced by Alloy.",
                    "A request cannot expand its own boundary."
                ],
                why: "This must be understandable without knowing Alloy's internal RBAC implementation."
            },
            {
                id: "DP-QA-52",
                area: "Security confidence",
                objective: "The documentation earns trust without oversharing.",
                startingState: "The specification, read as a security-conscious partner engineer.",
                action: "Assess confidence on tenant isolation, credential handling, token behaviour, location scoping, revocation, suspension, rate limiting, auditability, request correlation and least privilege.",
                expected: [
                    "Relevant guarantees are explained.",
                    "No unresolved security findings are exposed.",
                    "No internal vulnerability identifiers.",
                    "No internal topology.",
                    "No secret-storage internals beyond useful guarantees.",
                    "No service-role behaviour or irrelevant database policy detail.",
                    "The PARTNER_READY classification does not make the document look unfinished."
                ],
                why: "A partner-facing document that lists internal security findings hands a reader a map they should never have.",
                hardGate: true
            },
            {
                id: "DP-QA-53",
                area: "Reference usability",
                objective: "The reference answers a shape question in seconds.",
                startingState: "The governed API reference, judged independently of the prose.",
                action: "For each of the three operations, find purpose, method, path, authentication, request, response, status codes, errors and required scope.",
                expected: [
                    "All nine are quickly findable for each operation.",
                    "The reference complements the narrative rather than replacing it."
                ],
                why: "If I already understand the platform and just need the exact request shape, can I find it in seconds?"
            },
            {
                id: "DP-QA-54",
                area: "Docs ↔ reference coherence",
                objective: "Prose, OpenAPI and product agree.",
                startingState: "Both documents open, plus what you saw in the product.",
                action: "Move between them comparing terminology, field names, endpoint names, authentication instructions and capability statements.",
                expected: [
                    "No contradiction between prose and OpenAPI.",
                    "No contradiction between either and the product UI."
                ],
                why: "For an external developer, contradiction destroys confidence faster than missing functionality. Flag even minor ones."
            },
            {
                id: "DP-QA-55",
                area: "Location comprehension",
                objective: "The Location model is usable without reverse-engineering Alloy.",
                startingState: "Location documentation, without internal knowledge.",
                action: "Read it and decide whether you could map an external system's centres and classrooms onto it.",
                expected: [
                    "What a Location represents.",
                    "Which types may appear.",
                    "How hierarchy works.",
                    "How selected-location access affects results.",
                    "How descendant access behaves.",
                    "How to synchronize incrementally.",
                    "You are NOT told a timezone field exists."
                ],
                why: "Could Classroom Coach map its centres and classrooms against this resource without first reverse-engineering Alloy's database?",
                hardGate: true
            },
            {
                id: "DP-QA-56",
                area: "Incremental sync experience",
                objective: "A restarting integration knows how to resume.",
                startingState: "Incremental sync instructions, approached as someone building a real integration.",
                action: "Read for bootstrap, checkpoint/cursor behaviour, subsequent-change requests, ordering guarantees, what not to assume, how pagination interacts with sync, and what to persist locally.",
                expected: [
                    "All seven are addressed."
                ],
                why: "If my integration restarts tomorrow, do I know how to resume without a full sync and without missing data? If unclear, FAIL or NEEDS REVIEW."
            },
            {
                id: "DP-QA-57",
                area: "Error usefulness",
                objective: "Errors are actionable and safe.",
                startingState: "Documented errors, plus safe errors triggered against the fixture.",
                action: "Trigger and inspect: invalid credential, revoked credential, suspended Installation, missing scope, boundary refusal, and a malformed request where safe.",
                expected: [
                    "Stable, safe, actionable and understandable.",
                    "No stack traces, SQL, internal exception names or route ownership.",
                    "No implementation-only permission keys unless deliberately public."
                ],
                why: "Would I know what to fix after receiving this response?"
            },
            {
                id: "DP-QA-58",
                area: "Rate-limit experience",
                objective: "Limits are explained without inviting hammering.",
                startingState: "Rate-limit documentation.",
                action: "Read it as someone planning a polling loop.",
                expected: [
                    "That rate limiting exists.",
                    "What a 429 means.",
                    "How to respond.",
                    "Whether retry information is provided.",
                    "What not to assume.",
                    "No encouragement toward aggressive retry loops.",
                    "If exact numbers are not stable contract, their omission feels deliberate rather than incomplete."
                ],
                why: "Partners plan their traffic against this section; vagueness here produces incidents later."
            },
            {
                id: "DP-QA-59",
                area: "Troubleshooting",
                objective: "Support can start an investigation without an engineer.",
                startingState: "A partner reports: 'Our Location sync failed around 10:42 this morning.'",
                action: "Using only documented and product-visible tooling, work out what you would ask for and what an operator could inspect.",
                expected: [
                    "The workflow uses request/correlation id, timestamp, operation, response status, Installation and API Activity.",
                    "The docs explicitly warn against sending the client secret or bearer token."
                ],
                why: "Could support investigate this without immediately asking an engineer to query the database?"
            },
            {
                id: "DP-QA-60",
                area: "Product ↔ documentation terminology",
                objective: "Operator and developer surfaces describe one platform.",
                startingState: "Organization → Integrations and the developer documentation, side by side.",
                action: "Compare Application, Installation, Credential, capabilities/scopes, location access/resource boundary, health and API Activity.",
                expected: [
                    "The same concepts appear in both.",
                    "Different levels of technical detail are fine; different concepts are not."
                ],
                why: "Flag terminology that makes the two surfaces feel like separate systems."
            },
        ],
    },
    {
        id: "L",
        title: "Classroom Coach partner presentation",
        intent: "This does not test an integration. It tests whether Alloy can engage Classroom Coach professionally without fabricating their side of the contract.",
        steps: [
            {
                id: "DP-QA-61",
                area: "Readiness packet opening",
                objective: "The packet reads as prepared, not apologetic.",
                startingState: "The partner-ready Classroom Coach artifact.",
                action: "Read the first section only.",
                expected: [
                    "Alloy's Developer Platform exists.",
                    "Alloy has a real external API.",
                    "Alloy is prepared for integration discovery.",
                    "The Classroom Coach-specific contract is not yet finalized.",
                    "Provider technical information is required before implementation."
                ],
                why: "The tone should be that of a platform ready to integrate, not a vendor hedging."
            },
            {
                id: "DP-QA-62",
                area: "Fact versus proposal",
                objective: "Unverified provider capability is never stated as fact.",
                startingState: "The readiness packet, read end to end.",
                action: "Classify every material statement as verified Alloy fact, proposed direction, or provider-dependent question — and check the document already makes that distinction for you.",
                expected: [
                    "No sentence makes an unverified Classroom Coach capability sound established.",
                    "Nothing claims or implies provider API availability, webhooks, an Attendance API, a tenant model, a classroom model, a staff or child API, SSO, or a messaging API."
                ],
                why: "Hard FAIL on any implied provider capability. Absence of evidence is not evidence.",
                hardGate: true
            },
            {
                id: "DP-QA-63",
                area: "Alloy capability presentation",
                objective: "Alloy's own readiness is stated accurately and confidently.",
                startingState: "The readiness packet.",
                action: "Check what it claims about Alloy, and what it admits.",
                expected: [
                    "Application/Installation trust model, credential/token authentication, tenant-bound authorization, location boundaries, current /api/v1, Location sync, correlation architecture and API conventions are communicated confidently.",
                    "No public Attendance mutation today, no adapter today, and pending provider mapping are stated accurately."
                ],
                why: "Does this make Alloy look like a platform ready to integrate, rather than one asking Classroom Coach to design our architecture for us?"
            },
            {
                id: "DP-QA-64",
                area: "Proposed domains",
                objective: "Domains are offered for evaluation, not promised.",
                startingState: "The proposed integration domains section.",
                action: "Inspect locations, classrooms, staff, children, guardians, placement/schedules, Attendance, communications and SSO/deep linking.",
                expected: [
                    "Presented as areas to evaluate together.",
                    "Alloy's existing authority may be explained where it is real.",
                    "Unknown Classroom Coach behaviour stays explicitly open."
                ],
                why: "A domain list that reads as a commitment becomes a promise nobody made."
            },
            {
                id: "DP-QA-65",
                area: "System-of-record discipline",
                objective: "Ownership is decided by evidence, not by default.",
                startingState: "The provisional system-of-record matrix.",
                action: "Check how ownership is represented for each shared domain.",
                expected: [
                    "Alloy's known authority is explicit.",
                    "Unknown Classroom Coach authority remains unknown.",
                    "No lazy 'bidirectional' classification standing in for ownership."
                ],
                why: "If Classroom Coach answers tomorrow, is this matrix structured so we can make exact authority decisions without redesigning the integration architecture?"
            },
            {
                id: "DP-QA-66",
                area: "Discovery request quality",
                objective: "The questionnaire is answerable and well organized.",
                startingState: "The Classroom Coach technical discovery request.",
                action: "Evaluate organization, readability, duplication, specificity, technical depth, answerability, and whether it asks for evidence or examples where useful.",
                expected: [
                    "Covers the provider information needed to move into a real integration contract.",
                    "Does not ask Classroom Coach to explain Alloy concepts they cannot know.",
                    "Critical questions are not buried in generic discovery language."
                ],
                why: "A questionnaire that is tiring to answer gets answered badly, or not at all."
            },
            {
                id: "DP-QA-67",
                area: "Provider engineering usability",
                objective: "A Classroom Coach engineer can act on it immediately.",
                startingState: "The discovery request, read as its recipient.",
                action: "Answer all ten questions as that engineer.",
                expected: [
                    "Do I understand why Alloy needs this?",
                    "Can I route sections to the right internal engineers?",
                    "Are API/auth questions concrete?",
                    "Are data-model questions concrete?",
                    "Are Attendance questions concrete?",
                    "Are webhook/sync questions concrete?",
                    "Are rate-limit questions concrete?",
                    "Are SSO questions concrete?",
                    "Do I know what artifacts Alloy wants?",
                    "Do I know what happens after I answer?"
                ],
                why: "All ten should be YES."
            },
            {
                id: "DP-QA-68",
                area: "Partner packet visual quality",
                objective: "It can be sent without a cover note apologizing for it.",
                startingState: "The Classroom Coach packet as an external artifact.",
                action: "Review branding, title, version/date, status, section hierarchy, tables, diagrams, technical formatting, and the absence of internal QA or sprint language.",
                expected: [
                    "Visually and structurally professional enough to send as-is."
                ],
                why: "Would I attach this to an email to their CTO or engineering lead today? If no, record why."
            },
            {
                id: "DP-QA-69",
                area: "Partner packet sanitization",
                objective: "No internal material leaks to the partner.",
                startingState: "The packet, inspected adversarially.",
                action: "Search for every category of leakage before anyone outside Alloy reads it.",
                expected: [
                    "No real credentials.",
                    "No internal security identifiers.",
                    "No private organization UUIDs.",
                    "No certification fixture identifiers.",
                    "No internal hostnames.",
                    "No migration names.",
                    "No PR numbers.",
                    "No staging SHAs.",
                    "No internal-only endpoints.",
                    "No personal or customer information.",
                    "No runtime/implementation notes."
                ],
                why: "Hard FAIL for sensitive leakage. This is the step that decides whether the document can leave the building.",
                hardGate: true
            },
            {
                id: "DP-QA-70",
                area: "Next-step clarity",
                objective: "The continuation is concrete and correctly sequenced.",
                startingState: "The final section of the packet.",
                action: "Read it and check the sequence is unmistakable.",
                expected: [
                    "Classroom Coach provides authoritative technical information.",
                    "Alloy records provider evidence.",
                    "The provider evidence gate is satisfied.",
                    "The adapter and integration contract work begins.",
                    "Nothing suggests implementation has already started."
                ],
                why: "A partner should finish the document knowing exactly what Alloy is asking them to do next."
            },
        ],
    },
    {
        id: "M",
        title: "Final external acceptance",
        intent: "Answer from what you actually experienced during QA, not from implementation knowledge.",
        steps: [
            {
                id: "DP-QA-71",
                area: "Final acceptance",
                objective: "A competent external developer could implement the supported integration unaided.",
                startingState: "Everything above complete.",
                action: "Answer: could they authenticate and implement the currently supported Location integration without undocumented information?",
                expected: [
                    "PASS requires the live quickstart and parity steps to have passed."
                ],
                why: "This is the whole purpose of the specification.",
                hardGate: true
            },
            {
                id: "DP-QA-72",
                area: "Product ↔ spec",
                objective: "The product exposes what the specification describes.",
                startingState: "Organization → Integrations and the specification.",
                action: "Compare concepts, capabilities, lifecycle and access model.",
                expected: [
                    "No material mismatch."
                ],
                why: "Any material mismatch is a FAIL.",
                hardGate: true
            },
            {
                id: "DP-QA-73",
                area: "Runtime ↔ spec",
                objective: "The runtime behaves as documented.",
                startingState: "Your Section H and Section I observations.",
                action: "Compare actual HTTP responses and refusal behaviour against the documentation and OpenAPI.",
                expected: [
                    "No material mismatch."
                ],
                why: "Any material mismatch is a FAIL.",
                hardGate: true
            },
            {
                id: "DP-QA-74",
                area: "Capability unmistakability",
                objective: "Future capability cannot be mistaken for current capability.",
                startingState: "Everything you read.",
                action: "Answer: could an external developer mistake an internally implemented or ratified future capability for a currently available public API?",
                expected: [
                    "The answer is NO."
                ],
                why: "If YES, FAIL.",
                hardGate: true
            },
            {
                id: "DP-QA-75",
                area: "Partner packet send decision",
                objective: "The discovery package is ready to send.",
                startingState: "The Classroom Coach packet and discovery request.",
                action: "Answer: would I send this exact packet to Classroom Coach engineering today?",
                expected: [
                    "Technical accuracy.",
                    "Professionalism.",
                    "Clarity.",
                    "Provider assumptions.",
                    "Discovery completeness.",
                    "Visual quality."
                ],
                why: "A PASS does not mean the integration exists. It means the discovery package is ready."
            },
            {
                id: "DP-QA-76",
                area: "Platform coherence",
                objective: "One platform, not several systems that happen to connect.",
                startingState: "Everything: operator configuration, applications, installations, credentials, capabilities, boundaries, API Activity, documentation, OpenAPI, live API and partner material.",
                action: "Trace the model — Application → Installation → Credential → Authority → API → canonical Alloy truth — through every surface.",
                expected: [
                    "Integrations does not have one permission system while the API has another.",
                    "The docs describe no concept absent from the product.",
                    "The API does not behave differently from the docs.",
                    "OpenAPI does not describe a separate contract.",
                    "Classroom Coach needs no bespoke trust architecture.",
                    "External integrations do not sit outside normal Alloy domain authority."
                ],
                why: "If I had to explain the entire integration model in five minutes, does the product reinforce the explanation everywhere I look? If not, record exactly where the mental model breaks."
            },
            {
                id: "DP-QA-77",
                area: "External credibility",
                objective: "Another software company could responsibly build against this.",
                startingState: "The whole experience.",
                action: "Assess stability, terminology, professionalism, visible security posture, documentation, error behaviour, API consistency, troubleshooting, scope clarity and honesty about limits.",
                expected: [
                    "A small, precise, trustworthy API passes.",
                    "Breadth is not the standard; intentionality and dependability are."
                ],
                why: "Alloy does not need a large API surface to pass this step."
            },
            {
                id: "DP-QA-78",
                area: "Documentation trust",
                objective: "The docs stand alone.",
                startingState: "The documentation, imagining Alloy engineering has left the conversation.",
                action: "Decide whether you would implement against it unaided.",
                expected: [
                    "No undocumented assumptions needed for authentication, tenant selection, authorization, boundaries, request and response formats, pagination, incremental sync, errors, rate limiting or troubleshooting."
                ],
                why: "If tribal knowledge is still required, record exactly what is missing."
            },
            {
                id: "DP-QA-79",
                area: "Product trust",
                objective: "An administrator would feel in control granting this access.",
                startingState: "Organization → Integrations, as the administrator.",
                action: "Decide whether you would comfortably grant an external company access here.",
                expected: [
                    "What access is granted is clear.",
                    "Which Locations are exposed is clear.",
                    "Credential security, rotation, revocation and suspension are clear.",
                    "Health and activity visibility are adequate."
                ],
                why: "If the product makes authority feel ambiguous or overly technical, record it."
            },
            {
                id: "DP-QA-80",
                area: "Boundary trust",
                objective: "Authority comes from the Installation, never from the caller.",
                startingState: "Everything tested in Sections H and I.",
                action: "Decide whether you are convinced the external experience is bounded by what Alloy configured.",
                expected: [
                    "Tenant authority is server-derived.",
                    "Location authority is server-enforced.",
                    "Restricted-empty fails closed.",
                    "Missing capability fails closed.",
                    "Revoked credentials fail.",
                    "Suspended Installations fail."
                ],
                why: "This is the human acceptance summary of the technical authority model. Any uncertainty is a FAIL.",
                hardGate: true
            },
            {
                id: "DP-QA-81",
                area: "Classroom Coach readiness",
                objective: "Alloy can hold a serious technical conversation without pretending.",
                startingState: "The partner materials as a whole.",
                action: "Decide whether Alloy is ready for that conversation.",
                expected: [
                    "Alloy can explain its own platform precisely.",
                    "Alloy can demonstrate its current API.",
                    "Alloy can show how integrations are installed and governed.",
                    "Alloy can provide technical documentation.",
                    "Alloy can identify what it needs from Classroom Coach.",
                    "Unknown provider capabilities remain explicitly unknown.",
                    "There is a clear continuation once answers arrive."
                ],
                why: "A PASS does not mean the integration is implemented."
            },
            {
                id: "DP-QA-82",
                area: "External-send decision",
                objective: "Record the final decision.",
                startingState: "All steps answered.",
                action: "Choose an acceptance outcome in the Operator acceptance panel at the foot of this page, and list every follow-up or blocking defect in its notes.",
                expected: [
                    "ACCEPTED — PARTNER READY: comfortable sending both artifacts to an external technical partner today.",
                    "ACCEPTED WITH FOLLOW-UPS: the contract is correct and usable, but listed presentation or documentation issues must be corrected first.",
                    "REJECTED — REPAIR REQUIRED: one or more defects materially undermine the experience."
                ],
                why: "PUBLIC_READY is not the standard here. This decides whether the certified platform and partner materials are genuinely PARTNER_READY.",
                hardGate: true
            },
        ],
    },
];

export const ALL_STEPS: QaStep[] = SECTIONS.flatMap((s) => s.steps);
