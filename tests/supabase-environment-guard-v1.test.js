const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("outputs/src/constants.js", "utf8");

function load(runtimeConfig) { const context = { window: { BANQUET_ERP_RUNTIME_CONFIG: runtimeConfig }, URL }; vm.createContext(context); vm.runInContext(source, context); return context.window.BANQUET_ERP_CONSTANTS; }
const productionUrl = "https://pnolttdubxxmxorufpyk.supabase.co";
assert.throws(() => load({ environment: "test", supabaseUrl: productionUrl, supabaseAnonKey: "test" }).assertSafeSupabaseWriteTarget(productionUrl), /차단/);
assert.throws(() => load({ environment: "staging", supabaseUrl: productionUrl, supabaseAnonKey: "test" }).assertSafeSupabaseWriteTarget(productionUrl), /차단/);
assert.doesNotThrow(() => load({ environment: "local", supabaseUrl: "http://127.0.0.1:54321", supabaseAnonKey: "test" }).assertSafeSupabaseWriteTarget("http://127.0.0.1:54321"));
assert.doesNotThrow(() => load({ environment: "staging", supabaseUrl: "https://stagingproject.supabase.co", supabaseAnonKey: "test" }).assertSafeSupabaseWriteTarget("https://stagingproject.supabase.co"));
assert(fs.readFileSync("outputs/src/storage.js", "utf8").includes("assertSafeSupabaseWriteTarget"));
assert(fs.readFileSync("outputs/src/operationBoard.js", "utf8").includes("assertSafeSupabaseWriteTarget"));
assert(fs.readFileSync("outputs/src/operationBoardPage.js", "utf8").includes("assertSafeSupabaseWriteTarget"));
console.log("supabase environment guard V1 tests passed");
