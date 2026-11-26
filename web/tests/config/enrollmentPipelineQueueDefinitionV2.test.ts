import { describe, expect, it } from "vitest";

import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import {
    ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE,
    ENROLLMENT_PIPELINE_V2_QUEUE_ALIASES,
    ENROLLMENT_PIPELINE_V2_VISIBLE_THROUGHPUT_LABELS,
    ENROLLMENT_PIPELINE_V2_VISIBLE_THROUGHPUT_SECTION_KEYS,
    enrollmentPipelineVisibleThroughputLabels,
    RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
} from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { resolveQueueKeyFromDefinition } from "@/lib/config/queueDefinitionV2Runtime";
