//! Pure timestamp parsing and age derivation. Reads no clock.
//!
//! All temporal reasoning uses caller-injected timestamps. This module never
//! calls `OffsetDateTime::now_utc`, `SystemTime::now`, or any OS time source; it
//! only parses caller-provided strings and computes differences between them.
//!
//! Supported inputs:
//! - RFC3339 timestamps for `observedAt`, `capturedAt`, `comparedAt`,
//!   `sourceUpdatedAt`, and RFC3339 due dates.
//! - `YYYY-MM-DD` calendar dates for date-only `dueDate`.

use time::format_description::well_known::Rfc3339;
use time::{Date, Month, OffsetDateTime, UtcOffset};

use super::error::{ProjectBrainError, OMP_K_PB_FUTURE_TIMESTAMP, OMP_K_PB_INVALID_TIME};

/// A parsed instant expressed as a whole-second Unix timestamp (UTC).
///
/// Only whole seconds are retained; two instants that differ by sub-second
/// precision are treated as equal ages, keeping cross-platform arithmetic exact.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Instant {
    unix_seconds: i64,
}

impl Instant {
    /// The instant's whole-second Unix timestamp.
    pub fn unix_seconds(self) -> i64 {
        self.unix_seconds
    }

    /// The UTC calendar date this instant falls on.
    fn utc_date(self) -> Result<Date, ProjectBrainError> {
        OffsetDateTime::from_unix_timestamp(self.unix_seconds)
            .map(|dt| dt.to_offset(UtcOffset::UTC).date())
            .map_err(|_| {
                ProjectBrainError::new(
                    OMP_K_PB_INVALID_TIME,
                    "timestamp is out of representable range",
                )
            })
    }
}

/// A parsed due date: either a whole-day calendar date or a precise instant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DueDate {
    /// A calendar-day due date (`YYYY-MM-DD`); overdue by whole UTC calendar day.
    CalendarDay(Date),
    /// An RFC3339 due timestamp; overdue when the reference instant passes it.
    Instant(Instant),
}

/// Parse an RFC3339 timestamp into a whole-second UTC instant.
///
/// `field_path` names the field for a deterministic, privacy-safe error.
pub fn parse_rfc3339(input: &str, field_path: &str) -> Result<Instant, ProjectBrainError> {
    let parsed = OffsetDateTime::parse(input, &Rfc3339).map_err(|_| {
        ProjectBrainError::at(
            OMP_K_PB_INVALID_TIME,
            "invalid RFC3339 timestamp",
            field_path,
        )
    })?;
    Ok(Instant {
        unix_seconds: parsed.unix_timestamp(),
    })
}

/// Parse a `dueDate`: `YYYY-MM-DD` calendar date or an RFC3339 timestamp.
///
/// A bare calendar date (exactly ten ASCII characters `YYYY-MM-DD`) is parsed as
/// a whole-day due date; anything else is parsed as an RFC3339 instant.
pub fn parse_due_date(input: &str, field_path: &str) -> Result<DueDate, ProjectBrainError> {
    if is_calendar_day(input) {
        let date = parse_calendar_day(input, field_path)?;
        return Ok(DueDate::CalendarDay(date));
    }
    let instant = parse_rfc3339(input, field_path)?;
    Ok(DueDate::Instant(instant))
}

/// True when `input` is exactly a `YYYY-MM-DD` calendar date with no time part.
fn is_calendar_day(input: &str) -> bool {
    let bytes = input.as_bytes();
    if bytes.len() != 10 {
        return false;
    }
    for (i, b) in bytes.iter().enumerate() {
        let ok = match i {
            4 | 7 => *b == b'-',
            _ => b.is_ascii_digit(),
        };
        if !ok {
            return false;
        }
    }
    true
}

/// Parse a validated `YYYY-MM-DD` string into a calendar `Date` without macros.
fn parse_calendar_day(input: &str, field_path: &str) -> Result<Date, ProjectBrainError> {
    let invalid =
        || ProjectBrainError::at(OMP_K_PB_INVALID_TIME, "invalid calendar date", field_path);
    let year: i32 = input[0..4].parse().map_err(|_| invalid())?;
    let month_num: u8 = input[5..7].parse().map_err(|_| invalid())?;
    let day: u8 = input[8..10].parse().map_err(|_| invalid())?;
    let month = Month::try_from(month_num).map_err(|_| invalid())?;
    Date::from_calendar_date(year, month, day).map_err(|_| invalid())
}

/// Compute the non-negative age in seconds of `event_at` relative to
/// `reference_at`, tolerating a bounded future skew.
///
/// - An event at or before the reference yields its true non-negative age.
/// - An event in the future by up to `max_future_skew_seconds` yields `0`.
/// - An event beyond the allowed skew is rejected as [`OMP_K_PB_FUTURE_TIMESTAMP`].
pub fn age_seconds(
    reference_at: Instant,
    event_at: Instant,
    max_future_skew_seconds: i64,
    field_path: &str,
) -> Result<i64, ProjectBrainError> {
    // `reference - event`: positive in the past, negative in the future.
    let delta = reference_at.unix_seconds - event_at.unix_seconds;
    if delta >= 0 {
        return Ok(delta);
    }
    let future_by = -delta;
    if future_by <= max_future_skew_seconds {
        Ok(0)
    } else {
        Err(ProjectBrainError::at(
            OMP_K_PB_FUTURE_TIMESTAMP,
            "event timestamp is in the future beyond the allowed skew",
            field_path,
        ))
    }
}

/// Whether `due` is overdue relative to the reference instant.
///
/// - A calendar-day due date is overdue only when the reference's UTC calendar
///   date is strictly later than the due date.
/// - An RFC3339 due timestamp is overdue when the reference instant is strictly
///   after it.
pub fn is_overdue(due: DueDate, reference_at: Instant) -> Result<bool, ProjectBrainError> {
    match due {
        DueDate::CalendarDay(due_date) => {
            let reference_date = reference_at.utc_date()?;
            Ok(reference_date > due_date)
        }
        DueDate::Instant(due_instant) => Ok(reference_at.unix_seconds > due_instant.unix_seconds),
    }
}
