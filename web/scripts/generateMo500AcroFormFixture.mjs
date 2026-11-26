/**
 * Generates an MO500-style fillable PDF for Processing Form Composer E2E validation.
 * Field names mirror the real Missouri MO500 AcroForm proving case documented in POS checkpoint.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, PDFName, PDFBool } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "../tests/fixtures/processing/mo500-3313-school-age-child-health-report.pdf");

const pdfDoc = await PDFDocument.create();
pdfDoc.setTitle("MO500-3313 School Age Child Health Report");
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
const page1 = pdfDoc.addPage([612, 792]);
const page2 = pdfDoc.addPage([612, 792]);
const form = pdfDoc.getForm();

page1.drawText("School Age Child Health Report", { x: 72, y: 750, size: 14, font });
page1.drawText("Child's Name", { x: 72, y: 710, size: 10, font });
page1.drawText("Birthdate", { x: 320, y: 710, size: 10, font });
page1.drawText("Allergies / special requirements", { x: 72, y: 660, size: 10, font });
page1.drawText("Health statement — good", { x: 72, y: 610, size: 10, font });
page1.drawText("Internal routing code (ignore in test)", { x: 72, y: 560, size: 10, font });

const childName = form.createTextField("child_name");
childName.setText("");
childName.addToPage(page1, { x: 150, y: 695, width: 150, height: 18 });

const birthdate = form.createTextField("birthdate");
birthdate.setText("");
birthdate.addToPage(page1, { x: 390, y: 695, width: 120, height: 18 });

const allergies = form.createTextField("allergy_notes");
allergies.setText("");
allergies.addToPage(page1, { x: 250, y: 645, width: 280, height: 18 });

const healthGood = form.createCheckBox("health_good");
healthGood.addToPage(page1, { x: 72, y: 595, width: 14, height: 14 });

const routingCode = form.createTextField("routing_code");
routingCode.setText("");
routingCode.addToPage(page1, { x: 250, y: 545, width: 120, height: 18 });

page2.drawText("Parent/Guardian Signature", { x: 72, y: 700, size: 10, font });
page2.drawText("Date", { x: 320, y: 700, size: 10, font });

const parentSignature = form.createTextField("parent_signature");
parentSignature.setText("");
parentSignature.addToPage(page2, { x: 220, y: 685, width: 200, height: 18 });

const signDate = form.createTextField("signature_date");
signDate.setText("");
signDate.addToPage(page2, { x: 360, y: 685, width: 100, height: 18 });

// Mark as AcroForm
pdfDoc.catalog.set(PDFName.of("AcroForm"), pdfDoc.context.obj({}));

const bytes = await pdfDoc.save();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bytes);
console.log(`Wrote ${outPath} (${bytes.length} bytes)`);
