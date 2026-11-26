#!/usr/bin/env npx tsx
/**
 * Print the step-16 removal SQL (briefing §7; lib/tenancy/configTransfer/rollbackSql.ts). Connects to nothing.
 * The operator pipes it to psql as `postgres` on the new project, with the org's id and name as variables:
 *
 *   npm run -s tenant:rollback-sql | psql "$PRODUCTION_DB_URL" -X -v org_id=<ORG_ID> -v org_name='<org name>' -f -
 */

import { renderRollbackSql } from "@/lib/tenancy/configTransfer/rollbackSql";

process.stdout.write(renderRollbackSql());
