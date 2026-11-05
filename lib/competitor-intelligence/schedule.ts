const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, value);
  }
  return value;
}

function partsAt(date: Date, timeZone: string) {
  const parts = formatter(timeZone).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(targetAsUtc);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = partsAt(candidate, timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    candidate = new Date(candidate.getTime() + (targetAsUtc - observedAsUtc));
  }

  return candidate;
}

export function isValidTimeZone(value: string): boolean {
  try {
    formatter(value).format(new Date());
    return true;
  } catch {
    formatterCache.delete(value);
    return false;
  }
}

export function normalizeLocalTime(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function nextDailyRun(
  timeZone: string,
  localTime: string,
  after = new Date(),
): Date {
  if (!isValidTimeZone(timeZone)) {
    throw new Error("Invalid time zone.");
  }
  const normalizedTime = normalizeLocalTime(localTime);
  if (!normalizedTime) {
    throw new Error("Invalid local time.");
  }
  const [hour, minute] = normalizedTime.split(":").map(Number);
  const local = partsAt(after, timeZone);

  for (let offset = 0; offset <= 2; offset += 1) {
    const date = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    const candidate = zonedLocalToUtc(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      hour,
      minute,
      timeZone,
    );
    if (candidate.getTime() > after.getTime() + 1_000) return candidate;
  }

  throw new Error("Could not calculate the next scheduled research run.");
}

export const RETENTION_RUN_HOUR_UTC = 8;

/**
 * Retention runs on the first scheduler tick at or after 08:00 UTC each day, so
 * a missed 08:00 tick no longer skips the day. `lastRunDay` is the UTC date
 * (YYYY-MM-DD) of the last run this process made; the cleanup is idempotent,
 * so a fresh process running it again is harmless.
 */
export function retentionDue(now: Date, lastRunDay: string | null): boolean {
  return (
    now.getUTCHours() >= RETENTION_RUN_HOUR_UTC &&
    now.toISOString().slice(0, 10) !== lastRunDay
  );
}
