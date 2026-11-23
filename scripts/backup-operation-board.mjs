import path from "node:path";
import { TABLES, credentials, parseArgs, projectRef, readAll, tableSnapshot, writeSnapshot } from "./operation-board-safety-lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log("Usage: node scripts/backup-operation-board.mjs [--output backups/<name>]\nGET only. Credentials: BANQUET_SUPABASE_URL, BANQUET_SUPABASE_ANON_KEY"); process.exit(0); }
const config = credentials(); const stamp = new Date().toISOString().replace(/[:.]/g, "-"); const output = path.resolve(args.output || `backups/operation-board-${stamp}`);
const snapshots = {};
for (const table of TABLES) snapshots[table] = tableSnapshot(await readAll(config, table));
const manifest = await writeSnapshot(output, snapshots, { projectRef: projectRef(config.url), readOnly: true });
console.log(JSON.stringify({ output, tables: Object.fromEntries(Object.entries(manifest.tables).map(([name, value]) => [name, { rows: value.rows, checksum: value.checksum }])) }, null, 2));
