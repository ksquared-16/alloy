# Processing V1 — Implementation Handoff

**Audience:** Engineers continuing Processing / Digital Mailroom work  
**Shell status:** Frozen (2026-07-08)

---

## Entry points

| Route / trigger | Component |
|-----------------|-----------|
| AdminV2 top nav “Processing — intake” | `ProcessingModal` |
| Modal shell | `DigitalMailroomShell` |
| Work → Overview | `ProcessingOverviewLanding` |
| Work → Work | `PosProcessingWorkspace` |
| Studio → Forms | `ProcessingFormsAssetLibrary` / `ProcessingFormsStudio` |
| Form Builder (Studio) | `ProcessingFormBuilder` |

Test hooks: `[data-adminv2-processing-modal="true"]`, `[data-testid="processing-overview-landing"]`, `[data-processing-folder-tree="true"]`.

---

## Work review path (document imports)

```
PosProcessingWorkspace
├── ProcessingParentPanel "Queue"
│   └── ProcessingQueueList (showFolders, panelMode)
└── PosTemplateSetupColumn (document cases)
    ├── ProcessingWorkflowStepper
    ├── ProcessingParentPanel "Source document"
    │   └── PosPdfFieldMap / PDF object
    ├── ProcessingParentPanel "Review questions"
    │   └── ProcessingQuestionReviewList
    └── Footer actions (re-detect, continue, generate)
```

Non-document cases still use `PosCaseWorkColumn` + `PosCaseDecisionColumn` (classification path).

---

## Shared presentation primitives

| Primitive | File |
|-----------|------|
| Parent panel chrome | `web/app/adminV2/pos/ProcessingParentPanel.tsx` |
| Folder icons | `web/lib/pos/processingFolderIcons.tsx` |
| Modal header | `web/app/adminV2/components/OperationalModalHeader.tsx` |
| KPI tile (reuse) | `SurfaceHeaderKpiCard` exported from `WorkspaceHeader.tsx` |
| Workspace tokens | `web/components/workspace/workspaceTokens.ts` (`WS_KPI_CARD_CHROME`) |

---

## Engine (do not change without explicit sprint)

| Concern | Location |
|---------|----------|
| Question resolution | `web/lib/pos/processingCase/formDraft/questionResolutionModel.ts` |
| Form draft detect/save/create | `/api/admin/processing/cases/[caseId]/form-draft*` |
| Queue read model | `/api/admin/processing/queue` |
| Folder config | `web/lib/pos/processingFolderConfig.ts` |

---

## Color tokens (Processing shell)

Use only:

- `alloy-midnight` (Midnight Forge)
- `alloy-bend-pine` (Bend Pine)
- `alloy-stone` (Stone)
- `white` / `bg-white`

Do not introduce amber, emerald, raw `stone-*`, or parallel green tokens (`alloy-juniper`) in new Processing UI.

---

## Tests to run when touching Processing UI

```bash
cd web && npm run test -- \
  tests/pos/questionResolutionModel.test.ts \
  tests/pos/formComposerV1.test.ts

cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

Optional visual regression:

```bash
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test playwright/tests/digital-mailroom-identity-screenshots.spec.ts
```

---

## Next recommended work (inside frozen shell)

1. **Packets tab** — wire existing packet compose UI into Studio placeholder
2. **Fields / Branding tabs** — config surfaces only; no shell changes
3. **OCR path** — new engine branch; same Work review panels
4. **BOS actions** — use existing Actions rail; no modal chrome changes
