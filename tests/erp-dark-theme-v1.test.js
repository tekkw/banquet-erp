const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/index.html", "utf8");
const previewHtml = fs.readFileSync("outputs/event-order-preview.html", "utf8");
const app = fs.readFileSync("outputs/src/styles/app.css", "utf8");
const variables = fs.readFileSync("outputs/src/styles/variables.css", "utf8");
const theme = fs.readFileSync("outputs/src/styles/darkTheme.css", "utf8");

assert(html.includes("app.css?v=erp-dark-v2"));
assert(previewHtml.includes("app.css?v=erp-dark-v2"));
assert(app.trim().endsWith('@import "./darkTheme.css";'), "dark theme must load last");

[
  "--app-bg: #06111F",
  "--sidebar-bg: #071A31",
  "--surface-primary: #102A40",
  "--surface-secondary: #0D2235",
  "--border: rgba(150, 180, 205, 0.18)",
  "--text-primary: #F4F7FA",
  "--text-muted: #96A9BA",
  "--accent-gold: #D6B35A",
  "--accent-blue: #4C8DFF",
  "--accent-mint: #49C7A3",
].forEach((token) => assert(variables.includes(token), `missing theme token: ${token}`));

[
  '#calendarPage .calendar-day',
  '#calendarPage .calendar-day.today',
  '#assetsPage .asset-table th',
  '#assetsPage .asset-table td',
  '#layoutsPage .floorplan-v2-panel',
  '#layoutsPage #floorplanV2Preview',
  '#aiPage .ai-page-message.assistant .ai-page-bubble',
  '#aiPage .ai-page-message.user .ai-page-bubble',
].forEach((selector) => assert(theme.includes(selector), `missing dark override: ${selector}`));

assert(theme.includes("var(--calendar-day-bg)"));
assert(theme.includes("var(--border)"));
assert(theme.includes("var(--surface-primary)"));
assert(theme.includes("var(--surface-secondary)"));
console.log("erp-dark-theme-v1 tests passed");
