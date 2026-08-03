---
owner: platform
status: canonical
last_reviewed: 2026-07-30
supersedes: []
related:
  - DIRECTOR-V2-LEADERSHIP-DOCTRINE.md
  - MISSION-RUNTIMES-ARCHITECTURE-V1.md
---

# Vacilando Director Execution System V2

## Implementation Specification

**Status:** Proposed implementation specification
**Primary user:** Product owner directing complex engineering work from desktop or mobile
**Reference pressure test:** Access, Identity, Roles & Authentication V2
**Implementation target:** Vacilando Director, worker runtime, mission UI, decision delivery, evidence collection, and resource coordination

---

# 1. Product objective

Vacilando must let the product owner provide an already-developed sprint or mission plan and then delegate its execution to Director.

Director must:

1. Understand the supplied plan without redesigning it.
2. convert it into coordinated worker assignments;
3. keep every worker aligned to the same authoritative mission context;
4. schedule work safely across available machines, slots, repositories, branches, ports, and system resources;
5. detect blocked, unhealthy, conflicting, or stalled work;
6. recover from operational problems without requiring routine user intervention;
7. escalate only genuine product, architecture, risk, or scope decisions;
8. present each decision in a concise mobile-friendly form;
9. collect concrete evidence as work is completed;
10. provide a trustworthy timeline and current mission state;
11. certify completion against the user-supplied acceptance criteria.

Vacilando succeeds when the user no longer needs to ask Cursor or Claude what Director is doing.

---

# 2. Core product boundary

## 2.1 The user owns the plan

The user remains responsible for:

* product direction;
* mission goals;
* architecture direction;
* implementation phases;
* scope;
* constraints;
* acceptance criteria;
* success criteria;
* sequencing decisions that are explicitly part of the plan;
* doctrine and source material;
* final approval of material changes.

Director must not independently redesign the mission.

## 2.2 Director owns execution management

Director is responsible for:

* validating that the supplied plan is executable;
* identifying missing operational details;
* decomposing phases into worker assignments;
* sequencing and scheduling work;
* assigning workers and runtime slots;
* maintaining shared mission context;
* monitoring progress and worker health;
* resolving routine engineering problems;
* coordinating branches, ports, migrations, commits, merges, builds, and tests;
* collecting evidence;
* identifying deviations from the approved plan;
* escalating decisions when the plan cannot continue unchanged;
* resuming work after a decision;
* producing completion certification.

## 2.3 Workers own assigned deliverables

Workers are responsible for:

* executing only the assigned work package;
* following the shared worker protocol;
* preserving mission constraints;
* reporting discoveries and blockers;
* producing required evidence;
* never silently changing mission scope or architecture;
* returning control to Director after completion, blockage, or failure.

---

# 3. Non-negotiable rules

1. **Director does not author the product plan.**
2. **Director may operationalize the plan but may not silently alter it.**
3. **All workers receive the same versioned mission brief.**
4. **A worker assignment may narrow the mission but may not reinterpret it.**
5. **No task is complete without evidence.**
6. **No mission is complete until the supplied acceptance criteria are verified.**
7. **Routine engineering issues are handled by Director without escalating to the user.**
8. **Material product, architecture, security, data-loss, scope, or schedule decisions are escalated.**
9. **A decision pauses only the affected dependency chain whenever possible.**
10. **Every meaningful state change appears in the mission timeline.**
11. **User-facing status must describe mission state, not raw agent activity.**
12. **The UI must never require the user to inspect Cursor or Claude to understand current status.**

---

# 4. Mission kickoff

## 4.1 Kickoff experience

The user creates a mission by providing a **Mission Brief**.

The brief may be:

* pasted text;
* a markdown file;
* a sprint specification;
* a set of linked repository documents;
* a prior planning conversation;
* a structured form;
* a combination of these sources.

Director must not require the user to manually re-enter information that already exists in the supplied material.

## 4.2 Mission Brief structure

```ts
type MissionBrief = {
  missionId: string;
  title: string;
  objective: string;
  context?: string;

  plan: MissionPhase[];
  acceptanceCriteria: AcceptanceCriterion[];
  constraints: MissionConstraint[];
  sourceMaterials: MissionSource[];
  knownDecisions?: RecordedDecision[];
  outOfScope?: string[];

  executionPreferences?: {
    preferredSlots?: string[];
    maxConcurrentWorkers?: number;
    mergeTarget?: string;
    requireUserApprovalBeforeMerge?: boolean;
    requireUserApprovalBeforeMigration?: boolean;
    requiredValidationProfiles?: string[];
  };

  createdBy: string;
  createdAt: string;
  version: number;
  contentHash: string;
};
```

```ts
type MissionPhase = {
  phaseId: string;
  order: number;
  title: string;
  objective: string;
  requiredOutputs: string[];
  dependencies?: string[];
  acceptanceCriteriaIds?: string[];
  implementationNotes?: string;
  approvalGate?: "none" | "director" | "user";
};
```

## 4.3 Kickoff review

After receiving the brief, Director performs an **execution-readiness review**.

Director may identify:

* missing repository;
* unavailable worker slot;
* unclear branch target;
* contradictory instructions;
* missing acceptance criteria;
* an impossible dependency order;
* an unsafe migration requirement;
* insufficient environment access;
* missing test credentials.

Director must distinguish between:

### Operational gaps

Director resolves these itself where possible.

Examples:

* selecting an available slot;
* assigning a branch name;
* choosing a port;
* generating worker task IDs;
* ordering independent work packages;
* deciding which validation command runs first.

### Mission-level ambiguity

Director asks the user only when proceeding would require changing product intent, architecture, scope, or a material risk assumption.

## 4.4 Kickoff confirmation

Before execution begins, the user sees:

```text
Access & Identity V2

Plan received
14 phases
38 acceptance criteria
7 source documents
4 constraints

Director execution plan
• 6 worker assignments initially planned
• Maximum 2 concurrent implementation workers
• QA begins after implementation dependency group 3
• Merge requires user approval
• Estimated risk: Medium

Plan changes made by Director
None

Ready to begin
```

The user approves **execution of their plan**, not a new plan invented by Director.

---

# 5. Mission authority and alignment

## 5.1 Mission Brief is authoritative

The active Mission Brief is immutable by default.

Director may create a new version only after:

* the user approves a decision that changes it; or
* the user explicitly edits the mission.

Every version must retain:

* prior content;
* change summary;
* author;
* timestamp;
* approval source;
* content hash.

## 5.2 Mission Context Package

Director generates one canonical context package for all workers.

```ts
type MissionContextPackage = {
  missionId: string;
  missionVersion: number;
  missionContentHash: string;

  objective: string;
  activePhase: MissionPhase;
  globalConstraints: MissionConstraint[];
  relevantAcceptanceCriteria: AcceptanceCriterion[];
  requiredDoctrine: MissionSource[];
  recordedDecisions: RecordedDecision[];

  repository: RepositoryContext;
  environment: EnvironmentContext;
  executionProtocolVersion: string;
};
```

Workers must acknowledge:

```ts
type WorkerContextAcknowledgement = {
  workerId: string;
  missionId: string;
  missionVersion: number;
  missionContentHash: string;
  protocolVersion: string;
  acknowledgedAt: string;
};
```

A worker may not start when:

* the mission hash differs;
* the protocol version is unsupported;
* a required source cannot be loaded;
* its assignment references an obsolete mission version.

## 5.3 Worker Assignment Package

Each worker receives a bounded assignment.

```ts
type WorkerAssignment = {
  assignmentId: string;
  missionId: string;
  missionVersion: number;
  phaseId: string;

  title: string;
  objective: string;
  scope: string[];
  prohibitedChanges: string[];
  expectedDeliverables: string[];
  acceptanceCriteriaIds: string[];

  dependencies: string[];
  repository: RepositoryContext;
  branch: string;
  slot: string;
  port?: number;

  requiredValidation: ValidationRequirement[];
  requiredEvidence: EvidenceRequirement[];

  escalationRules: EscalationRule[];
  completionContract: CompletionContract;
};
```

Worker prompts must be generated from this package rather than manually assembled ad hoc.

---

# 6. Director execution lifecycle

A mission follows this lifecycle:

```text
Draft
→ Readiness Review
→ Awaiting Kickoff Approval
→ Executing
→ Decision Required
→ Executing
→ Validation
→ Awaiting Completion Approval
→ Completed
```

Additional states:

* Paused
* Blocked
* Recovering
* Cancelled
* Failed

## 6.1 Phase lifecycle

```text
Pending
→ Ready
→ Assigned
→ Running
→ Verification
→ Complete
```

Exception states:

* Blocked
* Waiting on Dependency
* Decision Required
* Failed
* Superseded

## 6.2 Director responsibilities during execution

Director continuously maintains:

* current mission state;
* current phase;
* completed outputs;
* remaining outputs;
* active workers;
* dependency graph;
* current blockers;
* open decisions;
* evidence coverage;
* validation status;
* branch and merge state;
* infrastructure health;
* confidence in completion.

Director must not rely on a chat transcript as the system of record.

Mission state must be persisted as structured data.

---

# 7. Worker operating protocol

All workers, whether Cursor, Claude, Codex, or another executor, must follow one protocol.

## 7.1 Worker lifecycle

```text
Acquire
→ Acknowledge Context
→ Inspect
→ Plan Assignment
→ Execute
→ Verify
→ Produce Evidence
→ Report
→ Release Resources
```

## 7.2 Required worker check-in

Before making changes, the worker reports:

```ts
type WorkerStartReport = {
  assignmentId: string;
  understoodObjective: string;
  intendedApproach: string[];
  filesOrSystemsExpectedToChange: string[];
  detectedRisks: string[];
  contextAcknowledgement: WorkerContextAcknowledgement;
};
```

Director checks this against the assignment.

If the approach materially diverges, Director stops the worker before code is changed.

## 7.3 Worker completion report

```ts
type WorkerCompletionReport = {
  assignmentId: string;
  status: "complete" | "blocked" | "failed";

  summary: string;
  changesMade: ChangeSummary[];
  acceptanceCriteriaResults: AcceptanceCriterionResult[];
  evidence: EvidenceArtifact[];
  tests: TestExecution[];
  commits: CommitReference[];
  migrations: MigrationReference[];
  residualRisks: RiskFinding[];
  followUpItems: FollowUpItem[];

  confidence: "low" | "medium" | "high";
  recommendation: string;
};
```

## 7.4 No-evidence rule

A worker cannot mark an assignment complete when required evidence is missing.

The runtime should reject completion and return the assignment to `Verification`.

---

# 8. Decision model

## 8.1 What requires user input

Director escalates when the issue would:

* change product behavior;
* change approved architecture;
* add or remove scope;
* conflict with doctrine;
* create material data-loss risk;
* require a destructive or irreversible migration not already approved;
* compromise security;
* invalidate an acceptance criterion;
* materially change user experience;
* require choosing between meaningful product alternatives;
* exceed an approved schedule or resource boundary;
* alter the merge or deployment strategy in a consequential way.

## 8.2 What Director handles without user input

Director should independently resolve:

* ordinary merge conflicts;
* non-destructive migration ordering;
* stale processes;
* port collisions;
* branch naming;
* test reruns;
* lint or formatting issues;
* TypeScript errors caused by the current work;
* worker restart;
* task reassignment;
* context refresh;
* cache cleanup;
* safe process termination;
* retryable infrastructure failures;
* rescheduling work due to CPU or memory pressure;
* evidence recollection;
* implementation corrections required to satisfy an already-approved criterion.

## 8.3 Decision card

Every user decision uses one compact structure.

```ts
type DirectorDecision = {
  decisionId: string;
  missionId: string;
  title: string;

  situation: string;
  whyThisMatters: string;
  currentPlan: string;
  discovery: string;

  options: DecisionOption[];
  recommendation: string;
  recommendationReason: string;

  impact: {
    product?: string;
    architecture?: string;
    schedule?: string;
    data?: string;
    security?: string;
  };

  evidence: EvidenceArtifact[];
  affectedAssignments: string[];

  defaultAction?: string;
  responseDeadline?: string;

  status: "open" | "answered" | "superseded";
};
```

The mobile presentation must answer, in this order:

1. What happened?
2. Why does it matter?
3. What does Director recommend?
4. What are the alternatives?
5. What evidence supports the recommendation?
6. What work is paused?
7. What happens after the user responds?

## 8.4 Decision behavior

When a decision opens:

* affected assignments pause;
* unrelated work continues when safe;
* Director preserves worker state;
* the user receives a push notification;
* the notification deep-links directly to the decision;
* the response is persisted as a mission decision;
* the Mission Brief is versioned when the response changes approved intent;
* affected workers receive the updated context version;
* execution resumes automatically.

---

# 9. Evidence system

## 9.1 Evidence types

```ts
type EvidenceArtifact =
  | ScreenshotEvidence
  | VideoEvidence
  | TestEvidence
  | BuildEvidence
  | TypecheckEvidence
  | BrowserEvidence
  | DatabaseEvidence
  | MigrationEvidence
  | DiffEvidence
  | LogEvidence
  | PerformanceEvidence
  | SecurityEvidence
  | CommitEvidence;
```

Each artifact includes:

```ts
type EvidenceBase = {
  evidenceId: string;
  assignmentId: string;
  missionId: string;

  type: string;
  title: string;
  description: string;

  createdAt: string;
  createdBy: string;

  fileUri?: string;
  externalUri?: string;
  command?: string;
  exitCode?: number;

  repositorySha?: string;
  branch?: string;
  environment?: string;

  acceptanceCriteriaIds: string[];
  verifiedBy?: string;
};
```

## 9.2 Required evidence profiles

Director should support reusable evidence profiles.

### Code-only change

* diff summary;
* relevant tests;
* TypeScript check where applicable;
* build where applicable;
* commit reference.

### UI change

* all code-only evidence;
* desktop screenshots;
* mobile or narrow-width screenshots when relevant;
* authenticated browser validation;
* interaction-path evidence;
* before/after comparison where useful.

### Migration change

* migration file;
* fresh replay result;
* existing-environment application result where safe;
* rollback or forward-recovery statement;
* schema verification;
* data preservation checks;
* application compatibility tests.

### Security change

* authorization tests;
* direct URL/API access tests;
* cross-org and cross-scope checks;
* privilege-escalation checks;
* RLS/API agreement evidence;
* audit-event evidence.

### Performance-sensitive change

* baseline;
* post-change measurement;
* CPU/memory observation;
* relevant runtime timings;
* regression threshold result.

## 9.3 Acceptance-criteria coverage

The UI must show evidence coverage against each acceptance criterion:

```text
AC-17: A suspended user cannot authenticate

Status: Passed

Evidence
✓ Unit test
✓ API integration test
✓ Browser login screenshot
✓ Audit log verification
```

A mission cannot be certified complete while a required criterion has:

* no result;
* failed result;
* incomplete evidence;
* an unresolved exception.

---

# 10. Director validation and certification

Director does not accept a worker’s claim of completion automatically.

For each assignment, Director must:

1. verify that required deliverables exist;
2. verify that required commands ran;
3. inspect exit status;
4. verify evidence is attached;
5. map evidence to acceptance criteria;
6. identify contradictions;
7. ensure the worker stayed within scope;
8. ensure no prohibited changes occurred;
9. verify branch and commit state;
10. confirm dependencies remain valid.

## 10.1 Mission completion package

At the end, Director produces:

```ts
type MissionCompletionPackage = {
  missionId: string;
  missionVersion: number;

  resultSummary: string;
  phases: PhaseCompletionSummary[];
  acceptanceCriteria: AcceptanceCriterionResult[];

  commits: CommitReference[];
  pullRequests?: PullRequestReference[];
  migrations: MigrationReference[];

  evidenceGallery: EvidenceArtifact[];
  validationRuns: ValidationRun[];

  unresolvedRisks: RiskFinding[];
  deferredItems: FollowUpItem[];

  branchStatus: string;
  mergeStatus: string;
  deploymentStatus?: string;

  directorRecommendation:
    | "ready_to_merge"
    | "ready_to_deploy"
    | "needs_user_review"
    | "not_ready";

  confidence: "low" | "medium" | "high";
};
```

## 10.2 Completion presentation

The user should see:

```text
Access & Identity V2

Implementation complete
QA complete
Ready to merge

Acceptance criteria
38 / 38 passed

Validation
✓ TypeScript
✓ Production build
✓ Database replay
✓ API authorization suite
✓ Browser scenarios
✓ Visual validation

Evidence
12 screenshots
4 browser recordings
63 automated tests
3 migration checks
8 commits

Residual risk
One non-blocking follow-up

Director recommendation
Merge to staging
```

Screenshots and other visual evidence must be viewable directly from this surface.

---

# 11. Worker health and runtime management

Director must actively manage execution health.

## 11.1 Worker health states

```text
Starting
Healthy
Idle
Waiting
Blocked
Stalled
Resource Constrained
Unresponsive
Recovering
Failed
Stopped
Complete
```

## 11.2 Worker telemetry

```ts
type WorkerTelemetry = {
  workerId: string;
  assignmentId?: string;

  status: WorkerHealthState;
  lastHeartbeatAt: string;
  lastProgressAt: string;

  processId?: number;
  slot?: string;
  machine?: string;
  branch?: string;
  port?: number;

  cpuPercent?: number;
  memoryMb?: number;
  contextUsagePercent?: number;

  activeCommand?: string;
  activeTool?: string;
  elapsedWithoutOutputSeconds?: number;

  openChildProcesses?: number;
  detectedIssues: HealthIssue[];
};
```

## 11.3 Health detection

Director must detect:

* missing heartbeat;
* no meaningful progress;
* runaway CPU;
* excessive memory use;
* too many TypeScript processes;
* duplicate build processes;
* port conflicts;
* orphaned dev servers;
* blocked terminal prompts;
* stale lock files;
* hung browser sessions;
* worker context exhaustion;
* uncommitted changes on a worker being reassigned;
* branch divergence;
* migration number collisions;
* repeated failing commands;
* stale cached build results;
* conflicting simultaneous edits.

## 11.4 Recovery actions

Director may:

* pause a worker;
* terminate an orphaned process;
* restart a worker with preserved assignment context;
* checkpoint uncommitted work;
* create a recovery branch;
* reassign the assignment;
* reduce concurrency;
* move validation to another slot;
* serialize TypeScript or build work;
* clear safe caches;
* allocate a different port;
* request a worker self-diagnosis;
* mark a dependency blocked;
* escalate only when automatic recovery is unsafe.

Every recovery action must appear in the timeline.

---

# 12. Scheduling and resource coordination

## 12.1 Resource model

```ts
type ExecutionResource = {
  resourceId: string;
  type:
    | "worker_slot"
    | "repository"
    | "branch"
    | "port"
    | "database"
    | "browser"
    | "cpu_heavy_job"
    | "build_lock"
    | "migration_sequence";

  capacity: number;
  currentClaims: ResourceClaim[];
};
```

## 12.2 Scheduling rules

Director must:

* respect dependency order;
* avoid two workers editing the same high-conflict area concurrently;
* avoid simultaneous full TypeScript/build jobs when resource limits would be exceeded;
* reserve ports before starting servers;
* reserve migration namespaces or timestamps;
* avoid multiple migrations touching the same tables without explicit coordination;
* serialize merge-sensitive work;
* permit independent investigation and UI work concurrently;
* prioritize blockers on the mission’s critical path;
* preserve available capacity for recovery and QA;
* stop scheduling new work when machine health is degraded.

## 12.3 Work graph

Assignments form a directed acyclic graph where possible.

```ts
type WorkGraphNode = {
  assignmentId: string;
  dependencies: string[];
  dependents: string[];
  resourceRequirements: ResourceRequirement[];
  estimatedConflictDomains: string[];
  priority: "critical" | "high" | "normal" | "low";
};
```

Director should expose the graph through operator language, not a technical DAG by default.

Example:

```text
Current sequence

Role data model
    ↓
Access resolver
    ↓
API enforcement
    ↓
Role editor
    ↓
End-to-end QA

In parallel
Authentication UI
Audit log
```

---

# 13. Timeline as the mission system of record

Every consequential event becomes a timeline entry.

```ts
type MissionTimelineEvent = {
  eventId: string;
  missionId: string;
  occurredAt: string;

  type:
    | "mission_created"
    | "mission_started"
    | "phase_started"
    | "assignment_started"
    | "discovery"
    | "progress"
    | "blocker"
    | "decision_requested"
    | "decision_answered"
    | "worker_health"
    | "recovery"
    | "commit"
    | "validation"
    | "evidence_added"
    | "phase_completed"
    | "mission_completed";

  headline: string;
  summary: string;
  actor: string;

  phaseId?: string;
  assignmentId?: string;
  decisionId?: string;
  evidenceIds?: string[];

  visibility: "summary" | "detail" | "diagnostic";
};
```

The default timeline shows `summary` events.

Technical logs remain available under detail or diagnostic expansion but do not dominate the experience.

---

# 14. Simplified UI

The current Vacilando interface should be reduced rather than expanded.

The primary product surfaces are:

1. Missions
2. Mission Detail
3. Worker Detail

Decisions, evidence, and validation are contextual objects inside Mission Detail rather than separate complex applications.

---

# 15. Missions screen

Each mission row/card shows only:

* title;
* status;
* current phase;
* progress based on accepted deliverables;
* Director state;
* active workers;
* whether a decision is required;
* latest meaningful update;
* last updated time.

Example:

```text
Access & Identity V2

Executing · Phase 6 of 14
42% complete

Director
Coordinating migration reconciliation

Workers
2 running · 1 validating · 1 waiting

Decision required
No

Updated 4 minutes ago
```

Do not show:

* raw token counts;
* verbose model output;
* empty metrics;
* decorative charts;
* implementation details without operational meaning;
* ambiguous percentages based on chat activity.

---

# 16. Mission Detail screen

Mission Detail contains four primary regions.

## 16.1 Mission header

Shows:

* mission title;
* current state;
* approved-plan version;
* current phase;
* completion coverage;
* open decision state;
* Director’s current summary;
* primary action.

## 16.2 Director summary

Must answer:

```text
Where are we?
What changed?
Are we blocked?
Do you need something from me?
What happens next?
```

Example:

```text
Phase 6 of 14 is running.

Since your last visit:
• Role schema implementation completed.
• API enforcement began.
• A migration collision was detected and resolved.
• 11 new authorization tests pass.

Blocked:
No.

Needs your input:
No.

Next:
Complete API enforcement, then begin authenticated browser QA.
```

## 16.3 Timeline

Chronological, filterable by:

* All;
* Decisions;
* Progress;
* Evidence;
* Worker health.

## 16.4 Workers panel

Compact worker list:

```text
Director             Coordinating
Cursor · Slot 2      Running
Claude · Slot 3      Validating
Cursor · Slot 4      Waiting on dependency
QA Worker            Pending
```

Clicking opens Worker Detail.

---

# 17. Decision presentation

An open decision appears prominently above ordinary timeline events.

The mobile view must fit the core decision without horizontal scrolling or dense tables.

Primary actions:

* Approve recommendation;
* Choose alternative;
* Ask Director a question;
* Reject and provide direction.

A response may be entered conversationally, but Director must convert it into a structured decision record and show the interpreted result before resuming when ambiguity exists.

---

# 18. Worker Detail screen

Worker Detail shows:

* worker/model;
* assigned deliverable;
* status;
* current activity;
* assignment scope;
* branch;
* slot;
* port;
* last heartbeat;
* last meaningful progress;
* dependency;
* health;
* commits;
* tests;
* evidence;
* concise worker reports;
* Director interventions.

Raw terminal output is available behind a diagnostic disclosure.

The default view must not be a terminal emulator.

---

# 19. Notification behavior

Push notifications are sent only for:

* user decision required;
* mission failed and Director cannot recover;
* mission ready for completion approval;
* mission ready to merge or deploy;
* a user-requested milestone;
* a material risk crossing a configured threshold.

Do not notify for routine worker completion, retries, commits, or minor health events.

## 19.1 Decision notification

```text
Vacilando

Decision required
Access & Identity V2

A migration conflicts with the approved role model.
Director recommends reconciling the migration without redesign.

Tap to review.
```

## 19.2 Completion notification

```text
Vacilando

QA complete
Access & Identity V2

38 of 38 acceptance criteria passed.
Screenshots and validation evidence are ready.
```

---

# 20. Access & Identity V2 pressure-test flow

The system must support this exact scenario.

## 20.1 User prepares the plan

The user provides:

* complete Access & Identity V2 sprint;
* phases;
* architecture direction;
* product requirements;
* constraints;
* doctrine;
* implementation sequence;
* acceptance criteria;
* QA requirements.

## 20.2 Director operationalizes

Director:

1. verifies the plan package;
2. creates bounded worker assignments;
3. identifies resource needs;
4. sequences conflicting work;
5. assigns slots and branches;
6. shows the execution interpretation;
7. receives kickoff approval.

Director does not redesign Access & Identity V2.

## 20.3 Workers execute

All workers receive:

* the same mission version;
* the same approved decisions;
* relevant doctrine;
* bounded scope;
* required tests;
* evidence requirements;
* escalation rules.

## 20.4 A migration issue occurs

A worker determines that the approved implementation requires a migration that conflicts with another pending migration.

Director first determines:

* whether reconciliation is mechanical;
* whether data is at risk;
* whether architecture changes;
* whether the approved plan remains valid.

### Mechanical conflict

Director resolves it, records the action, reruns migration validation, and continues.

No user decision.

### Material conflict

Director creates a decision card with:

* plain-language explanation;
* recommendation;
* alternatives;
* data and schedule impact;
* migration diff;
* test evidence;
* paused work;
* exact resume behavior.

The user responds from a phone.

Director records the decision, updates mission context, refreshes affected worker assignments, and resumes execution.

## 20.5 QA completes

Director presents:

* acceptance criteria results;
* screenshots;
* browser recordings where required;
* tests and commands;
* TypeScript and build status;
* migration validation;
* security validation;
* commit/branch state;
* residual risk;
* recommendation.

The user does not need to open Cursor or Claude.

---

# 21. Persistence model

Suggested core tables or equivalent durable stores:

```text
vacilando_missions
vacilando_mission_versions
vacilando_phases
vacilando_assignments
vacilando_assignment_dependencies
vacilando_workers
vacilando_worker_sessions
vacilando_worker_heartbeats
vacilando_resource_claims
vacilando_timeline_events
vacilando_decisions
vacilando_decision_options
vacilando_decision_responses
vacilando_acceptance_criteria
vacilando_acceptance_results
vacilando_evidence_artifacts
vacilando_validation_runs
vacilando_recovery_actions
vacilando_commits
vacilando_migrations
```

Do not store authoritative mission state only inside unstructured conversation messages.

Worker transcripts and terminal logs may be stored as diagnostic artifacts linked to structured mission objects.

---

# 22. API and runtime capabilities

Minimum service capabilities:

```text
createMission
versionMission
reviewMissionReadiness
approveMissionExecution
generateAssignments
startAssignment
acknowledgeWorkerContext
heartbeatWorker
reportWorkerProgress
reportWorkerBlocker
submitWorkerCompletion
validateAssignmentCompletion
createDecision
answerDecision
resumeDecisionDependencies
attachEvidence
runValidationProfile
claimResource
releaseResource
detectWorkerHealth
recoverWorker
completePhase
certifyMission
```

All mutations must be audited.

---

# 23. Director summary generation

Director summaries must be generated from structured mission state.

They must not rely solely on asking the active worker for a retrospective summary.

The summary engine should consume:

* phase states;
* assignment states;
* timeline events;
* decisions;
* health events;
* evidence coverage;
* validation results;
* source-control state.

Worker prose can add context but cannot replace system-derived truth.

---

# 24. Implementation sequence

## Phase 1 — Mission authority and structured state

Build:

* Mission Brief;
* mission versioning;
* phase model;
* acceptance criteria;
* assignment model;
* timeline events;
* authoritative mission status;
* mission kickoff review.

Exit criteria:

* Director can ingest an approved sprint;
* Director cannot silently mutate it;
* worker assignments reference an exact mission version;
* mission status survives process restart.

## Phase 2 — Worker protocol and alignment

Build:

* Mission Context Package;
* Worker Assignment Package;
* worker acknowledgement;
* start/progress/blocker/completion reports;
* context hash validation;
* worker completion evidence requirement.

Exit criteria:

* Cursor and Claude receive equivalent authoritative context;
* stale-context workers cannot continue;
* completed assignments have structured outputs.

## Phase 3 — Director execution management

Build:

* dependency graph;
* assignment scheduling;
* phase transitions;
* blocker handling;
* routine recovery;
* assignment validation;
* Director current summary.

Exit criteria:

* Director can manage a multi-worker mission without manual task forwarding;
* routine blockers do not require the user;
* state shown in Vacilando matches actual worker state.

## Phase 4 — Decisions and mobile interruption flow

Build:

* structured decisions;
* affected-work pausing;
* recommendation and options;
* push notification;
* mobile decision view;
* response persistence;
* context re-versioning;
* automatic resumption.

Exit criteria:

* user can understand and answer a decision in several minutes from a phone;
* work resumes using the recorded decision;
* unrelated work continues safely.

## Phase 5 — Evidence and QA certification

Build:

* evidence artifacts;
* validation profiles;
* acceptance-criteria mapping;
* screenshot gallery;
* test/build/typecheck/migration evidence;
* completion package;
* merge/deploy recommendation.

Exit criteria:

* no assignment completes without required evidence;
* no mission completes with uncovered acceptance criteria;
* screenshots and QA results are visible in Vacilando.

## Phase 6 — Worker health and resource scheduling

Build:

* heartbeats;
* process telemetry;
* CPU/memory limits;
* port and slot claims;
* build/typecheck locks;
* stale-process detection;
* health classifications;
* automated recovery;
* conflict-domain scheduling.

Exit criteria:

* Director prevents known CPU and TypeScript overload patterns;
* hung workers are detected;
* orphan processes are cleaned safely;
* resource conflicts are visible and auditable.

## Phase 7 — UI simplification

Replace the current information-heavy interface with:

* Missions;
* Mission Detail;
* Worker Detail;
* contextual Decisions;
* contextual Evidence.

Exit criteria:

* every visible element answers an operational question;
* raw logs are secondary;
* mission status can be understood without opening a worker;
* the interface works well on mobile.

## Phase 8 — Access & Identity V2 certification run

Execute the approved Access & Identity V2 mission through the new model.

Success means:

* the user supplies the plan;
* Director manages execution;
* workers remain aligned;
* a real or simulated decision is delivered by mobile;
* execution resumes correctly;
* QA evidence is returned;
* the user never needs to ask Cursor or Claude for mission status.

---

# 25. Acceptance criteria

## Mission kickoff

* The user can supply a complete pre-authored sprint.
* Director preserves the supplied plan as the authoritative mission.
* Director shows how it will operationalize the plan.
* Director cannot begin material execution before kickoff approval.
* Director identifies execution gaps without replacing product intent.

## Alignment

* Every worker receives the same mission version and decisions.
* Worker context includes relevant acceptance criteria and constraints.
* Stale mission context blocks worker execution.
* Worker scope cannot silently expand.
* Director records any approved mission change as a new version.

## Execution

* Director assigns and schedules work.
* Dependencies are enforced.
* Conflicting work is not scheduled concurrently without an explicit strategy.
* Routine engineering issues are resolved without user involvement.
* Current mission state survives worker and Director restarts.

## Decisions

* Only material decisions reach the user.
* Decisions are understandable without reading implementation logs.
* Each decision includes recommendation, alternatives, impact, and evidence.
* Affected work pauses safely.
* Unaffected work continues when safe.
* The user can respond from mobile.
* Director resumes work automatically after the decision.

## Evidence

* Completion requires configured evidence.
* UI work includes screenshots.
* Migration work includes replay and verification evidence.
* Security work includes direct-access and scope-isolation evidence.
* Tests include commands, exit status, environment, and commit SHA.
* Evidence maps to acceptance criteria.

## Worker health

* Director receives worker heartbeats.
* Hung and stalled workers are detected.
* CPU and memory overload conditions are detected.
* TypeScript and build concurrency can be limited.
* Port, branch, and migration conflicts are detected.
* Director can recover or reassign work.
* Recovery actions appear in the timeline.

## UI

* Missions show meaningful state without technical noise.
* Mission Detail answers where the work stands, what changed, whether it is blocked, whether input is needed, and what comes next.
* Timeline is the authoritative human-readable history.
* Worker Detail exposes operational detail without defaulting to raw logs.
* Evidence is viewable directly.
* Mobile decisions are usable within a few minutes.

## Completion

* Director verifies worker output rather than trusting completion claims.
* Every acceptance criterion has a result.
* Failed criteria prevent certification.
* Completion package includes commits, migrations, tests, evidence, risks, and recommendation.
* The user can confidently approve merge or deployment without opening Cursor or Claude.

---

# 26. Explicit non-goals

This implementation must not:

* make Director the product strategist;
* ask Director to invent the Access & Identity V2 product plan;
* replace user-authored architecture with agent-generated architecture;
* expose every worker thought in the primary UI;
* treat message volume as progress;
* calculate progress from tokens or elapsed time;
* notify the user about routine engineering activity;
* require the user to manually supervise terminal processes;
* allow workers to operate from divergent mission interpretations;
* accept screenshots alone as proof of functional correctness;
* accept tests alone as proof of visual correctness;
* introduce autonomous product-scope changes.

---

# 27. Definition of success

Vacilando Director V2 is successful when the following statement is true:

> I can provide Director with a complete plan, approve its execution, leave my computer, and trust Director to coordinate the workers, keep them aligned, manage resources, recover from routine problems, ask me only for real decisions, resume automatically after I respond, and return a clear evidence-backed completion package without requiring me to inspect Cursor or Claude.

That is the product to implement.
