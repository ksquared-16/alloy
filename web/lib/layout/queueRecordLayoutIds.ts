let fieldIdCounter = 0;
let columnIdCounter = 0;
let blockIdCounter = 0;

export function nextQueueRecordFieldId(prefix = "field"): string {
    fieldIdCounter += 1;
    return `${prefix}-${fieldIdCounter}`;
}

export function nextQueueRecordColumnId(prefix = "col"): string {
    columnIdCounter += 1;
    return `${prefix}-${columnIdCounter}`;
}

export function nextQueueRecordBlockId(prefix = "block"): string {
    blockIdCounter += 1;
    return `${prefix}-${blockIdCounter}`;
}
