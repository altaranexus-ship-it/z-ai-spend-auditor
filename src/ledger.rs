//! Ledger operations. Every operation is input-bytes → output-bytes so the
//! same code runs inside WASM and (for the pure helpers) under native tests.
//!
//! Map layout — four fixed maps, created once by the tenant SDK at bootstrap:
//!   z:<tid>:usage    key = "<YYYY-MM>:<20-digit seq>" → usage event JSON
//!   z:<tid>:agg      key = "<YYYY-MM>"                → MonthAgg JSON
//!   z:<tid>:alerts   key = "<YYYY-MM>:<20-digit seq>" → alert JSON
//!   z:<tid>:budget   key = "<YYYY-MM>"                → budget micros (decimal)
//!
//! Fixed maps (instead of one map per month) mean zero setup churn at month
//! rollover, and month-scoped range scans stay lexicographic because every
//! key is month-prefixed.

use crate::host::{
    interfaces::{kv_store, logging},
    tenant::tenant_context,
};
use crate::types::*;
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;
use sha2::{Digest, Sha256};

/// A single event is a "spend-spike" when it exceeds budget/SPIKE_DENOM.
const SPIKE_DENOM: u64 = 4;

/// Cap for one-shot alert scans (keys are month-prefixed; one scan covers a month).
const SCAN_LIMIT: u32 = 500;

// ---------- map naming (single source of truth for the Node agent too) ----------

pub fn map_name(tail: &str) -> String {
    let tid = tenant_context::tenant_did();
    format!("z:{}:{}", hex::encode(&tid), tail)
}

// ---------- pure helpers (native-unit-testable) ----------

/// Civil-from-days (Howard Hinnant): days since 1970-01-01 → "YYYY-MM".
pub fn civil_month(days: i64) -> String {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let _ = d;
    format!("{:04}-{:02}", y, m)
}

/// Cluster timestamp → "YYYY-MM".
pub fn month_of(ts_secs: u64) -> String {
    civil_month((ts_secs / 86_400) as i64)
}

/// Strict "YYYY-MM" validation.
pub fn valid_month(month: &str) -> bool {
    let b = month.as_bytes();
    b.len() == 7
        && b[4] == b'-'
        && b.iter().enumerate().all(|(i, c)| {
            if i == 4 {
                *c == b'-'
            } else {
                c.is_ascii_digit()
            }
        })
}

fn parse_u64(bytes: &[u8]) -> Option<u64> {
    let s = core::str::from_utf8(bytes).ok()?;
    s.trim().parse::<u64>().ok()
}

// ---------- receipt sealing ----------

/// Length-prefixed multi-part SHA-256 — domain-separated, collision-safe.
fn fold_receipt(parts: &[&[u8]]) -> String {
    let mut h = Sha256::new();
    for p in parts {
        h.update((p.len() as u32).to_be_bytes());
        h.update(p);
    }
    hex::encode(h.finalize())
}

/// Fold the digest into the tx claims digest so the host's Merkle receipt
/// proves offline exactly what this transaction appended.
fn seal_receipt(domain: &str, entry_key: &str, body: &[u8]) -> Result<String, String> {
    let digest = fold_receipt(&[domain.as_bytes(), entry_key.as_bytes(), body]);
    // set_claims_digest takes the RAW 32-byte digest, not the hex string
    // (host rejects anything != 32 bytes; live-verified 2026-09-15).
    let raw = hex::decode(&digest).map_err(|e| format!("set-claims-digest: {e}"))?;
    kv_store::set_claims_digest(&raw).map_err(|e| format!("set-claims-digest: {e}"))?;
    logging::info(&format!("receipt sealed: {domain}/{entry_key}"))?;
    Ok(digest)
}

// ---------- stored-state accessors ----------

fn load_agg(month: &str) -> MonthAgg {
    let mut agg = MonthAgg {
        month: month.to_string(),
        ..Default::default()
    };
    if let Ok(Some(bytes)) = kv_store::get(&map_name("agg"), month.as_bytes()) {
        if let Ok(parsed) = serde_json::from_slice::<MonthAgg>(&bytes) {
            agg = parsed;
        }
    }
    agg
}

fn save_agg(month: &str, agg: &MonthAgg) -> Result<(), String> {
    let body = serde_json::to_vec(agg).map_err(|e| e.to_string())?;
    kv_store::put(&map_name("agg"), month.as_bytes(), &body).map_err(|e| format!("agg put: {e}"))
}

fn get_budget(month: &str) -> Option<u64> {
    kv_store::get(&map_name("budget"), month.as_bytes())
        .ok()
        .flatten()
        .as_deref()
        .and_then(parse_u64)
        .filter(|b| *b > 0)
}

fn provider_totals_mut<'a>(agg: &'a mut MonthAgg, provider: &str) -> &'a mut ProviderTotals {
    if let Some(idx) = agg.per_provider.iter().position(|p| p.provider == provider) {
        &mut agg.per_provider[idx]
    } else {
        agg.per_provider.push(ProviderTotals {
            provider: provider.to_string(),
            ..Default::default()
        });
        let last = agg.per_provider.len() - 1;
        &mut agg.per_provider[last]
    }
}

fn push_alert(month: &str, kind: &str, detail: String) -> Result<(), String> {
    let alert = Alert {
        seq: tenant_context::seq_no(),
        ts: tenant_context::cluster_timestamp_secs(),
        kind: kind.to_string(),
        detail,
    };
    let key = format!("{}:{:020}", month, alert.seq);
    let body = serde_json::to_vec(&alert).map_err(|e| e.to_string())?;
    kv_store::put(&map_name("alerts"), key.as_bytes(), &body)
        .map_err(|e| format!("alert put: {e}"))?;
    logging::info(&format!("alert[{}]: {}", kind, alert.detail))?;
    Ok(())
}

// ---------- operations ----------

pub fn record_usage(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: RecordUsageReq =
        serde_json::from_slice(input).map_err(|e| format!("bad input: {e}"))?;
    if req.provider.trim().is_empty() {
        return Err("provider must not be empty".into());
    }
    if req.model.trim().is_empty() {
        return Err("model must not be empty".into());
    }
    let month = match &req.month {
        Some(m) => m.to_string(),
        None => month_of(tenant_context::cluster_timestamp_secs()),
    };
    if !valid_month(&month) {
        return Err("month must be YYYY-MM".into());
    }

    let seq = tenant_context::seq_no();
    let event = UsageEvent {
        seq,
        ts: tenant_context::cluster_timestamp_secs(),
        provider: req.provider.clone(),
        model: req.model.clone(),
        tokens_in: req.tokens_in,
        tokens_out: req.tokens_out,
        cost_micros: req.cost_micros,
        ref_: req.ref_.clone(),
    };
    let body = serde_json::to_vec(&event).map_err(|e| e.to_string())?;
    let entry_key = format!("{}:{:020}", month, seq);

    // 1) append — keys are unique per tx seq, so a retried tx can never
    //    overwrite an earlier entry (append-only by construction).
    kv_store::put(&map_name("usage"), entry_key.as_bytes(), &body)
        .map_err(|e| format!("usage put: {e}"))?;

    // 2) aggregates, same tx — report reads never replay the event log
    let mut agg = load_agg(&month);
    agg.total_cost_micros += req.cost_micros;
    agg.total_calls += 1;
    agg.total_tokens_in += req.tokens_in;
    agg.total_tokens_out += req.tokens_out;
    if req.cost_micros > agg.max_event_cost_micros {
        agg.max_event_cost_micros = req.cost_micros;
    }
    {
        let pt = provider_totals_mut(&mut agg, &req.provider);
        pt.calls += 1;
        pt.tokens_in += req.tokens_in;
        pt.tokens_out += req.tokens_out;
        pt.cost_micros += req.cost_micros;
    }
    save_agg(&month, &agg)?;

    // 3) budget checks — alerts are recorded as data, never thrown
    let budget = get_budget(&month);
    let mut over_budget = false;
    if let Some(b) = budget {
        if agg.total_cost_micros > b {
            over_budget = true;
            push_alert(
                &month,
                "over-budget",
                format!(
                    "month total {} micros exceeds budget {} micros",
                    agg.total_cost_micros, b
                ),
            )?;
        } else if req.cost_micros > b / SPIKE_DENOM {
            push_alert(
                &month,
                "spend-spike",
                format!(
                    "single event {} micros > budget/{} ({} micros) — provider {} model {}",
                    req.cost_micros,
                    SPIKE_DENOM,
                    b / SPIKE_DENOM,
                    req.provider,
                    req.model
                ),
            )?;
        }
    }

    // 4) seal a verifiable receipt for exactly what was appended
    let receipt = seal_receipt("record-usage", &entry_key, &body)?;

    let resp = RecordUsageResp {
        entry_id: format!("{}#{}", map_name("usage"), entry_key),
        seq,
        month,
        receipt_sha256: receipt,
        month_total_cost_micros: agg.total_cost_micros,
        budget_micros: budget,
        over_budget,
    };
    serde_json::to_vec(&resp).map_err(|e| e.to_string())
}

pub fn month_report(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: MonthReportReq =
        serde_json::from_slice(input).map_err(|e| format!("bad input: {e}"))?;
    if !valid_month(&req.month) {
        return Err("month must be YYYY-MM".into());
    }
    let agg = load_agg(&req.month);
    let budget = get_budget(&req.month);

    let per_provider: Vec<ProviderTotals> = match &req.provider {
        Some(p) => agg
            .per_provider
            .into_iter()
            .filter(|x| &x.provider == p)
            .collect(),
        None => agg.per_provider,
    };
    let total_cost_micros = match &req.provider {
        Some(p) => per_provider
            .iter()
            .find(|x| &x.provider == p)
            .map(|x| x.cost_micros)
            .unwrap_or(0),
        None => agg.total_cost_micros,
    };
    let total_calls = match &req.provider {
        Some(p) => per_provider
            .iter()
            .find(|x| &x.provider == p)
            .map(|x| x.calls)
            .unwrap_or(0),
        None => agg.total_calls,
    };
    let over_budget = budget.map(|b| total_cost_micros > b).unwrap_or(false);
    let pct = budget.map(|b| {
        if b == 0 {
            0
        } else {
            (total_cost_micros * 10_000) / b
        }
    });

    let resp = MonthReportResp {
        month: req.month,
        per_provider,
        total_cost_micros,
        total_calls,
        budget_micros: budget,
        over_budget,
        pct_of_budget_bps: pct,
    };
    serde_json::to_vec(&resp).map_err(|e| e.to_string())
}

pub fn set_budget(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: SetBudgetReq = serde_json::from_slice(input).map_err(|e| format!("bad input: {e}"))?;
    if !valid_month(&req.month) {
        return Err("month must be YYYY-MM".into());
    }
    if req.budget_micros == 0 {
        kv_store::delete(&map_name("budget"), req.month.as_bytes())
            .map_err(|e| format!("budget delete: {e}"))?;
    } else {
        kv_store::put(
            &map_name("budget"),
            req.month.as_bytes(),
            req.budget_micros.to_string().as_bytes(),
        )
        .map_err(|e| format!("budget put: {e}"))?;
    }
    let receipt = seal_receipt(
        "set-budget",
        &req.month,
        req.budget_micros.to_string().as_bytes(),
    )?;
    let resp = SetBudgetResp {
        month: req.month,
        budget_micros: req.budget_micros,
        set: req.budget_micros > 0,
        receipt_sha256: receipt,
    };
    serde_json::to_vec(&resp).map_err(|e| e.to_string())
}

pub fn list_alerts(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: ListAlertsReq =
        serde_json::from_slice(input).map_err(|e| format!("bad input: {e}"))?;
    if !valid_month(&req.month) {
        return Err("month must be YYYY-MM".into());
    }
    // Month-scoped lexicographic range: "<month>:" up to (exclusive) "<month>;"
    // — every digit (0x30-0x39) sorts below ':' (0x3A) which sorts below ';'.
    let start = format!("{}:", req.month).into_bytes();
    let end = format!("{};", req.month).into_bytes();
    let pairs = kv_store::scan(&map_name("alerts"), &start, &end, SCAN_LIMIT)
        .map_err(|e| format!("alert scan: {e}"))?;
    let mut alerts = Vec::new();
    for (_k, v) in pairs {
        if let Ok(a) = serde_json::from_slice::<Alert>(&v) {
            alerts.push(a);
        }
    }
    let resp = ListAlertsResp {
        month: req.month,
        alerts,
    };
    serde_json::to_vec(&resp).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_month_boundaries() {
        assert_eq!(civil_month(0), "1970-01"); // 1970-01-01
        assert_eq!(civil_month(19_692), "2023-12"); // 2023-12-01
        assert_eq!(civil_month(19_723), "2024-01"); // 2024-01-01
        assert_eq!(civil_month(19_782), "2024-02"); // 2024-02-29 (leap day, same month)
        assert_eq!(civil_month(20_148), "2025-03"); // 2025-03-01
    }

    #[test]
    fn month_validation() {
        assert!(valid_month("2026-09"));
        assert!(valid_month("1999-12"));
        assert!(!valid_month("2026-9"));
        assert!(!valid_month("202609"));
        assert!(!valid_month("2026-09X"));
        assert!(!valid_month("abcd-09"));
        assert!(!valid_month(""));
    }

    #[test]
    fn receipt_folding_is_deterministic_and_domain_separated() {
        let a = fold_receipt(&[b"record-usage", b"key1", b"body"]);
        let b = fold_receipt(&[b"record-usage", b"key1", b"body"]);
        let c = fold_receipt(&[b"record-usage", b"key12", b"body"]); // concat-ambiguity guard
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 64); // sha256 hex length
    }
}
