/**
 * Run from repo root: `node --experimental-strip-types scripts/dumpMedicationDemoSchemaJson.ts`
 */
import { writeFileSync } from "fs";
import {
    MEDICATION_AUTHORIZATION_DEMO_PDF_MAPPING,
    MEDICATION_AUTHORIZATION_DEMO_SCHEMA,
} from "../web/lib/forms/seeds/medicationAuthorizationDemo.ts";

writeFileSync("/tmp/med_schema_min.json", JSON.stringify(MEDICATION_AUTHORIZATION_DEMO_SCHEMA));
writeFileSync("/tmp/med_pdf_min.json", JSON.stringify(MEDICATION_AUTHORIZATION_DEMO_PDF_MAPPING));
console.log("schema_len", JSON.stringify(MEDICATION_AUTHORIZATION_DEMO_SCHEMA).length);
console.log("pdf_len", JSON.stringify(MEDICATION_AUTHORIZATION_DEMO_PDF_MAPPING).length);
