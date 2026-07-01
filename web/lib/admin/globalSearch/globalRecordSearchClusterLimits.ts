import type { GlobalRecordSearchCluster } from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import { GLOBAL_RECORD_SEARCH_CHILDREN_PER_CLUSTER_MAX } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

/** Cap visible children per cluster; surface overflow as "+ X more". */
export function applyGlobalSearchClusterDisplayLimits(
    clusters: GlobalRecordSearchCluster[],
    maxChildrenPerCluster: number = GLOBAL_RECORD_SEARCH_CHILDREN_PER_CLUSTER_MAX
): GlobalRecordSearchCluster[] {
    return clusters.map((cluster) => {
        if (cluster.key === "__ungrouped__" || cluster.children.length <= maxChildrenPerCluster) {
            return { ...cluster, children_overflow: 0 };
        }
        const overflow = cluster.children.length - maxChildrenPerCluster;
        return {
            ...cluster,
            children: cluster.children.slice(0, maxChildrenPerCluster),
            children_overflow: overflow,
        };
    });
}
