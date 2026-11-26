/**
 * Side-effect import for worker CLIs. Must be the first import so Gateway
 * store binding happens before governed-action / run-status modules capture
 * ALLOY_RUNTIME_ROOT.
 */
import { bindWorkerCliToGatewayRoot } from "./execution-node.mjs";

bindWorkerCliToGatewayRoot();
