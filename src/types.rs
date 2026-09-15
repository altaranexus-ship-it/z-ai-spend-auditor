//! Shared request/response shapes (serde, no_std-compatible).

use alloc::string::String;
use serde::{Deserialize, Serialize};

// ---------- requests ----------

#[derive(Debug, Deserialize)]
pub struct RecordUsageReq {
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub tokens_in: u64,
    #[serde(default)]
    pub tokens_out: u64,
    pub cost_micros: u64,
    #[serde(default)]
    pub ref_: Option<String>,
    /// Optional ISO month override (YYYY-MM). Defaults to the cluster clock
    /// month. Kept explicit so backfills are auditable rather than implicit.
    #[serde(default)]
    pub month: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MonthReportReq {
    /// Target month in YYYY-MM form.
    pub month: String,
    #[serde(default)]
    pub provider: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetBudgetReq {
    pub month: String,
    /// Micro-USD. 0 clears the budget for the month.
    pub budget_micros: u64,
}

#[derive(Debug, Deserialize)]
pub struct ListAlertsReq {
    pub month: String,
}

// ---------- stored shapes ----------

#[derive(Debug, Serialize, Deserialize)]
pub struct UsageEvent {
    pub seq: u64,
    pub ts: u64,
    pub provider: String,
    pub model: String,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub cost_micros: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ref_: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct ProviderTotals {
    pub provider: String,
    pub calls: u64,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub cost_micros: u64,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct MonthAgg {
    pub month: String,
    pub total_cost_micros: u64,
    pub total_calls: u64,
    pub total_tokens_in: u64,
    pub total_tokens_out: u64,
    pub per_provider: Vec<ProviderTotals>,
    /// Cost of the single most expensive event in the month (anomaly ref).
    pub max_event_cost_micros: u64,
}

// ---------- responses ----------

#[derive(Debug, Serialize)]
pub struct RecordUsageResp {
    pub entry_id: String,
    pub seq: u64,
    pub month: String,
    pub receipt_sha256: String,
    pub month_total_cost_micros: u64,
    pub budget_micros: Option<u64>,
    pub over_budget: bool,
}

#[derive(Debug, Serialize)]
pub struct MonthReportResp {
    pub month: String,
    pub per_provider: Vec<ProviderTotals>,
    pub total_cost_micros: u64,
    pub total_calls: u64,
    pub budget_micros: Option<u64>,
    pub over_budget: bool,
    /// Percent of budget used, basis points (10000 = 100%). None when no budget.
    pub pct_of_budget_bps: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct SetBudgetResp {
    pub month: String,
    pub budget_micros: u64,
    pub set: bool,
    pub receipt_sha256: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Alert {
    pub seq: u64,
    pub ts: u64,
    /// "over-budget" | "budget-crossing" | "spend-spike"
    pub kind: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
pub struct ListAlertsResp {
    pub month: String,
    pub alerts: Vec<Alert>,
}
