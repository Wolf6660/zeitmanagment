import { addDays, eachDayOfInterval, formatISO, isSaturday, isSunday } from "date-fns";

export function dayKey(date: Date): string {
  return formatISO(date, { representation: "date" });
}

export function isWeekend(date: Date): boolean {
  return isSaturday(date) || isSunday(date);
}

export function listDays(start: Date, end: Date): Date[] {
  return eachDayOfInterval({ start, end });
}

export function startOfYear(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

export function endOfYear(year: number): Date {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59));
}

export function plusDays(date: Date, days: number): Date {
  return addDays(date, days);
}
