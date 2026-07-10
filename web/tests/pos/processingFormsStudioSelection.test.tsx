/** @vitest-environment jsdom */

/**
 * Processing Forms Studio — parent-controlled form selection contract.
 *
 * Regression: local selectedFormId inside ProcessingFormsStudio was lost when
 * hideChrome remounted the studio subtree. Selection must survive remount via props.
 */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const builderSpy = vi.fn();
const librarySpy = vi.fn();

vi.mock("@/app/adminV2/pos/ProcessingFormBuilder", () => ({
    default: (props: { formId: string; onBack: () => void }) => {
        builderSpy(props);
        return (
            <div data-testid="processing-form-builder" data-form-id={props.formId}>
                <button type="button" data-testid="builder-back" onClick={props.onBack}>
                    Back
                </button>
            </div>
        );
    },
}));

vi.mock("@/app/adminV2/pos/ProcessingFormsAssetLibrary", () => ({
    default: (props: { onSelectForm: (id: string) => void }) => {
        librarySpy(props);
        return (
            <div data-testid="processing-forms-library">
                <button type="button" data-testid="library-select-form" onClick={() => props.onSelectForm("form-123")}>
                    Open form
                </button>
            </div>
        );
    },
}));

vi.mock("@/app/adminV2/pos/ProcessingCreateFormDialog", () => ({
    default: () => null,
}));

vi.mock("@/app/adminV2/pos/ProcessingStudioShell", () => ({
    default: ({ children }: { children: ReactNode }) => <div data-testid="processing-studio-shell">{children}</div>,
    ProcessingStudioPlaceholder: () => null,
}));

const loadForms = vi.fn(async () => undefined);
const createBlankForm = vi.fn(async () => "form-123" as string | null);

vi.mock("@/app/adminV2/pos/useProcessingFormApi", () => ({
    useProcessingFormApi: () => ({
        forms: [{ id: "form-123", key: "form-123", name: "Test Form" }],
        listErr: null,
        listLoaded: true,
        loadForms,
        createBlankForm,
        archiveForm: vi.fn(),
        deleteForm: vi.fn(),
    }),
}));

import ProcessingFormsStudio from "@/app/adminV2/pos/ProcessingFormsStudio";

let container: HTMLElement | null = null;
let root: Root | null = null;

function render(node: ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(node);
    });
}

function remount(node: ReactNode) {
    act(() => {
        root!.unmount();
    });
    root = createRoot(container!);
    act(() => {
        root!.render(node);
    });
}

afterEach(() => {
    if (root) {
        act(() => {
            root!.unmount();
        });
    }
    root = null;
    if (container) container.remove();
    container = null;
    builderSpy.mockClear();
    librarySpy.mockClear();
    loadForms.mockClear();
    createBlankForm.mockClear();
});

describe("ProcessingFormsStudio selection contract", () => {
    it("opens builder from controlled selectedFormId and survives remount", () => {
        const onSelectedFormIdChange = vi.fn();
        render(
            <ProcessingFormsStudio selectedFormId={null} onSelectedFormIdChange={onSelectedFormIdChange} />
        );

        expect(container!.querySelector('[data-testid="processing-forms-library"]')).not.toBeNull();
        expect(container!.querySelector('[data-testid="processing-form-builder"]')).toBeNull();

        act(() => {
            container!.querySelector<HTMLButtonElement>('[data-testid="library-select-form"]')!.click();
        });
        expect(onSelectedFormIdChange).toHaveBeenCalledWith("form-123");

        render(
            <ProcessingFormsStudio selectedFormId="form-123" onSelectedFormIdChange={onSelectedFormIdChange} />
        );
        expect(container!.querySelector('[data-testid="processing-form-builder"]')?.getAttribute("data-form-id")).toBe(
            "form-123"
        );

        remount(
            <ProcessingFormsStudio selectedFormId="form-123" onSelectedFormIdChange={onSelectedFormIdChange} />
        );
        expect(container!.querySelector('[data-testid="processing-form-builder"]')?.getAttribute("data-form-id")).toBe(
            "form-123"
        );
        expect(container!.querySelector('[data-testid="processing-forms-library"]')).toBeNull();
    });

    it("returns to library when back clears parent selection", () => {
        const onSelectedFormIdChange = vi.fn();
        render(
            <ProcessingFormsStudio selectedFormId="form-123" onSelectedFormIdChange={onSelectedFormIdChange} />
        );

        act(() => {
            container!.querySelector<HTMLButtonElement>('[data-testid="builder-back"]')!.click();
        });

        expect(onSelectedFormIdChange).toHaveBeenCalledWith(null);
        expect(loadForms).toHaveBeenCalled();
    });
});
