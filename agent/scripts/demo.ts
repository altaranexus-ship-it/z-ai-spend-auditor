/**
 * demo.ts — fix imports (session.ts, not the draft paths) and run the audit loop.
 */
import { MONTH_LABEL, call } from "./session.js";

interface ProviderTotals {
  provider: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  cost_micros: number;
}

interface RecordResp {
  entry_id: string;
  seq: number;
  month: string;
  receipt_sha256: string;
  month_total_cost_micros: number;
  budget_micros: number | null;
  over_budget: boolean;
}

interface ReportResp {
  month: string;
  per_provider: ProviderTotals[];
  total_cost_micros: number;
  total_calls: number;
  budget_micros: number | null;
  over_budget: boolean;
  pct_of_budget_bps: number | null;
}

interface AlertRow {
  seq: number;
  ts: number;
  kind: string;
  detail: string;
}

interface AlertsResp {
  month: string;
  alerts: AlertRow[];
}

const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(6)}`;

const events = [
  { provider: "openai", model: "gpt-4.1-mini", tokens_in: 1520, tokens_out: 480, cost_micros: 2_940, ref: "ticket:CLAW-48" },
  { provider: "openai", model: "gpt-4.1", tokens_in: 8_400, tokens_out: 2_150, cost_micros: 41_250, ref: "job:nightly-summary" },
  { provider: "anthropic", model: "claude-sonnet", tokens_in: 11_020, tokens_out: 3_980, cost_micros: 96_300, ref: "job:code-review" },
  { provider: "openai", model: "text-embedding-3-small", tokens_in: 64_000, tokens_out: 0, cost_micros: 12_800, ref: "job:reindex" },
];

// --- 1. record usage ---
for (const ev of events) {
  const resp: RecordResp = await call<RecordResp>("record-usage", ev);
  console.log(
    `recorded ${ev.provider}/${ev.model} cost=${usd(ev.cost_micros)} ` +
      `→ month_total=${usd(resp.month_total_cost_micros)} ` +
      `receipt=${resp.receipt_sha256.slice(0, 12)}…`,
  );
}

// --- 2. month report ---
const report = await call<ReportResp>("month-report", { month: MONTH_LABEL });
console.log(`\n=== MONTH REPORT ${MONTH_LABEL} ===`);
for (const p of report.per_provider) {
  console.log(
    `  ${p.provider.padEnd(10)} calls=${String(p.calls).padStart(3)} ` +
      `tok_in=${String(p.tokens_in).padStart(7)} tok_out=${String(p.tokens_out).padStart(7)} ` +
      `cost=${usd(p.cost_micros)}`,
  );
}
console.log(
  `  TOTAL ${usd(report.total_cost_micros)} calls=${report.total_calls} ` +
    `over_budget=${report.over_budget}` +
    (report.pct_of_budget_bps != null
      ? ` (${(report.pct_of_budget_bps / 100).toFixed(2)}% of budget)`
      : ""),
);

// --- 3. alerts (spend-spike / over-budget fired during recording) ---
const alerts = await call<AlertsResp>("list-alerts", { month: MONTH_LABEL });
console.log(`\n=== ALERTS ${MONTH_LABEL} ===`);
for (const a of alerts.alerts) {
  console.log(`  [${a.kind}] ${a.detail}`);
}
console.log(`\n${alerts.alerts.length} alert(s) recorded. Demo complete.`);
