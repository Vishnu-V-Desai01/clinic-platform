/**
 * Default patient password: first 3 characters of the patient's email +
 * last 3 digits of their phone number = 6 characters total.
 *
 * ASSUMPTION (please confirm): "first 3 characters of email" is read
 * literally — for a very short email local-part (e.g. "ab@x.com"), the
 * 3 characters could include the "@" symbol. Flag this if you'd rather
 * the email be sanitized (letters/numbers only) before slicing.
 */
export function generateDefaultPassword(email: string, phone: string): string {
  const emailPart = email.slice(0, 3);
  const digitsOnly = phone.replace(/\D/g, "");
  const phonePart = digitsOnly.slice(-5);
  return `${emailPart}${phonePart}`;
}

/**
 * Computes the UTC instant for a specific wall-clock time (hour:minute) on
 * the calendar day that `instant` falls on, as seen in `timeZone`. Used to
 * schedule appointment reminders for 4:30 AM clinic-local time on the
 * appointment's day.
 *
 * India does not observe daylight saving time, so this "guess then correct"
 * technique is exact for the default Asia/Kolkata timezone. If a future
 * clinic operates somewhere that does observe DST, results could be off by
 * up to an hour during the transition window itself — low-stakes for a
 * reminder feature, but worth knowing.
 */
export function getLocalTimeAsUtc(
  instant: Date,
  timeZone: string,
  hour: number,
  minute: number
): Date {
  const dayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const year = Number(dayParts.find((p) => p.type === "year")?.value);
  const month = Number(dayParts.find((p) => p.type === "month")?.value);
  const day = Number(dayParts.find((p) => p.type === "day")?.value);

  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(guessUtcMs), timeZone);

  return new Date(guessUtcMs - offsetMinutes * 60_000);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return (asUtc - date.getTime()) / 60_000;
}