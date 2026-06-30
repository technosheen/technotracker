export interface Interval {
  start: string;
  end: string;
}


export function toMillis(value: string): number {
  return new Date(value).getTime();
}

export function durationMinutes(interval: Interval): number {
  return Math.round((toMillis(interval.end) - toMillis(interval.start)) / 60_000);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return toMillis(a.start) < toMillis(b.end) && toMillis(b.start) < toMillis(a.end);
}

export function assertNoOverlaps(intervals: Interval[]): void {
  const sorted = [...intervals].sort((a, b) => toMillis(a.start) - toMillis(b.start));
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous && current && overlaps(previous, current)) {
      throw new Error(`Overlapping intervals: ${previous.start} and ${current.start}`);
    }
  }
}

export function zonedBoundary(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new Error(`Invalid date boundary: ${date} ${time}`);
  }

  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desiredUtc;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)])
    );
    const representedUtc = Date.UTC(
      parts.year!,
      parts.month! - 1,
      parts.day!,
      parts.hour!,
      parts.minute!
    );
    candidate += desiredUtc - representedUtc;
  }

  return new Date(candidate).toISOString();
}

export function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}
