//! z-ai-spend-auditor v0.1.5 — AI API spend auditor for T3N tenants.
//!
//! Four node-callable operations on the `contracts` interface:
//!
//! - `record-usage`:  append one usage event to the private per-tenant
//!   ledger and update the month's aggregates.
//! - `month-report`:  totals for a month, optionally filtered by provider,
//!   with budget status.
//! - `set-budget`:    set/clear the monthly budget (micro-USD).
//! - `list-alerts`:   alert entries (budget crossings + anomalies).
//!
//! # Design rules honored
//!
//! - tenant-base world only: kv-store + logging + tenant-context. No `http`,
//!   no `http-with-placeholders` — nothing to leak, nothing to grant.
//! - Ledger is append-only: keys embed the tx seq from tenant-context, so a
//!   re-run of the same tx can never overwrite an earlier entry.
//! - Every mutation folds the entry into the tx claims digest
//!   (`kv-store.set-claims-digest`), so the host's Merkle receipt proves what
//!   was written — offline-verifiable audit trail.
//! - Aggregates are updated in the same transaction as the append: report
//!   reads are one `scan` over a single month map.
//!
//! # Map layout (all maps live under z:<tid>:…, created by the tenant SDK)
//!
//! - `z:<tid>:usage-<YYYY-MM>`  entry key = zero-padded seq → usage event JSON
//! - `z:<tid>:agg-<YYYY-MM>`    single entry `totals` → aggregate JSON
//! - `z:<tid>:alert-<YYYY-MM>`  entry key = zero-padded seq → alert JSON
//! - `z:<tid>:budget`           entry key = month → budget micros (decimal string)
#![warn(clippy::style, missing_debug_implementations)]
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

extern crate alloc;

pub const CONTRACT_VERSION: &str = "0.1.5";

wit_bindgen::generate!({
    world: "ai-spend-auditor",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

mod ledger;
mod types;

struct Component;

#[cfg(target_arch = "wasm32")]
impl exports::z::ai_spend_auditor::contracts::Guest for Component {
    fn record_usage(
        req: exports::z::ai_spend_auditor::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("record-usage: missing input")?;
        ledger::record_usage(&input)
    }

    fn month_report(
        req: exports::z::ai_spend_auditor::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("month-report: missing input")?;
        ledger::month_report(&input)
    }

    fn set_budget(
        req: exports::z::ai_spend_auditor::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("set-budget: missing input")?;
        ledger::set_budget(&input)
    }

    fn list_alerts(
        req: exports::z::ai_spend_auditor::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("list-alerts: missing input")?;
        ledger::list_alerts(&input)
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);
