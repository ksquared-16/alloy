/**
 * A projection row's identity in a Work View — client-safe (the browser parses it to open the panel).
 *
 * `<grain>:<id>`, because the grain is part of the identity: a child (`customer_members`), a person
 * (`persons`) and a household (`customers`) are different records even in the rare case two ids collide,
 * and the panel must know which durable record to resolve without guessing.
 */

import type { DomainProjectionRow, DomainProjectionSubjectType } from "@/lib/businessProcesses/projections/domainProjectionTypes";

export function domainProjectionRowId(row: Pick<DomainProjectionRow, "subject">): string {
    return `${row.subject.type}:${row.subject.id}`;
}

export function parseDomainProjectionRowId(
    rowId: string | null | undefined,
): { type: DomainProjectionSubjectType; id: string } | null {
    const m = /^(child|person|household):([0-9a-f-]{36})$/i.exec(String(rowId ?? "").trim());
    return m ? { type: m[1]!.toLowerCase() as DomainProjectionSubjectType, id: m[2]!.toLowerCase() } : null;
}
