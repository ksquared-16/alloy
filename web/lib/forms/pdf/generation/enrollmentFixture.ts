/**
 * Phase 7 Slice 0 — a realistic enrollment AcroForm PDF fixture.
 *
 * A genuine PDF with genuine AcroForm text fields, used to prove the fidelity engine end-to-end.
 * The engine loads arbitrary PDFs; Slice 1 feeds real operator-uploaded documents through the same path.
 * Field names + the signature-line coordinate are exported so tests place values/marks precisely.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const ENROLLMENT_FIELD_NAMES = {
    childName: "child_full_name",
    childDob: "child_dob",
    guardianName: "guardian_full_name",
    allergies: "allergies",
    /**
     * The SAME date of birth, asked for by the document in two more places — the medical-release
     * and pickup-authorization sections. Real enrollment paperwork repeats identity facts like
     * this, and the ask-once promise is only provable against a document that does: one confirmed
     * DOB must land in all three, and a correction must move all three.
     */
    childDobMedical: "child_dob_medical",
    childDobPickup: "child_dob_pickup",
} as const;

/** Where a signature mark should land (PDF points, origin bottom-left) — beside the signature label. */
export const ENROLLMENT_SIGNATURE_RECT = { page: 0, x: 210, y: 150, width: 200, height: 28 } as const;

export async function buildEnrollmentAcroFormFixture(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    /**
     * Fixed document dates, so the builder is byte-DETERMINISTIC. The fidelity mapping pins the
     * source by sha256; a creation timestamp of "now" would make every build a different document
     * and the pin unverifiable.
     */
    const epoch = new Date("2026-01-01T00:00:00.000Z");
    doc.setCreationDate(epoch);
    doc.setModificationDate(epoch);
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const form = doc.getForm();
    const ink = rgb(0.08, 0.09, 0.16);

    page.drawText("Firefly Early Learning", { x: 54, y: 740, size: 20, font: bold, color: ink });
    page.drawText("Enrollment Application", { x: 54, y: 716, size: 13, font, color: rgb(0.3, 0.32, 0.4) });

    const rows: Array<{ label: string; name: string; y: number }> = [
        { label: "Child full name", name: ENROLLMENT_FIELD_NAMES.childName, y: 640 },
        { label: "Child date of birth", name: ENROLLMENT_FIELD_NAMES.childDob, y: 592 },
        { label: "Parent / guardian name", name: ENROLLMENT_FIELD_NAMES.guardianName, y: 544 },
        { label: "Known allergies", name: ENROLLMENT_FIELD_NAMES.allergies, y: 496 },
    ];
    for (const row of rows) {
        page.drawText(row.label, { x: 54, y: row.y + 18, size: 10, font, color: rgb(0.3, 0.32, 0.4) });
        const tf = form.createTextField(row.name);
        tf.setText("");
        tf.addToPage(page, { x: 54, y: row.y - 6, width: 480, height: 22, borderWidth: 1, borderColor: rgb(0.7, 0.72, 0.78) });
    }

    // Two more sections that repeat the child's date of birth — the multi-occurrence surface the
    // ask-once certification fills through one confirmed fact.
    page.drawText("Medical release", { x: 54, y: 452, size: 11, font: bold, color: ink });
    const repeatRows: Array<{ label: string; name: string; y: number }> = [
        { label: "Child date of birth (medical release)", name: ENROLLMENT_FIELD_NAMES.childDobMedical, y: 414 },
        { label: "Child date of birth (pickup authorization)", name: ENROLLMENT_FIELD_NAMES.childDobPickup, y: 366 },
    ];
    for (const row of repeatRows) {
        page.drawText(row.label, { x: 54, y: row.y + 18, size: 10, font, color: rgb(0.3, 0.32, 0.4) });
        const tf = form.createTextField(row.name);
        tf.setText("");
        tf.addToPage(page, { x: 54, y: row.y - 6, width: 300, height: 22, borderWidth: 1, borderColor: rgb(0.7, 0.72, 0.78) });
    }

    // Static consent line + signature label (the signature mark lands to the right of the label).
    page.drawText(
        "I certify the information above is accurate and I consent to enrollment.",
        { x: 54, y: 210, size: 9, font, color: rgb(0.4, 0.42, 0.5) }
    );
    page.drawText("Parent / guardian signature:", { x: 54, y: 160, size: 10, font, color: ink });
    page.drawLine({ start: { x: 210, y: 150 }, end: { x: 410, y: 150 }, thickness: 1, color: rgb(0.6, 0.62, 0.68) });

    return doc.save({ useObjectStreams: false });
}
