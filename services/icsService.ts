import { DayPlan, Recipe, SWEDISH_DAYS } from "../types";

const formatDateForICS = (date: Date) => {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
};

const getWeekDates = (weekString: string) => {
  const [year, week] = weekString.split("-W").map(Number);
  const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
  const daysOffset = (week - 1) * 7;

  // ISO week starts on Monday
  const firstMonday = new Date(firstDayOfYear);
  const dayOfWeek = firstDayOfYear.getUTCDay();
  const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  firstMonday.setUTCDate(firstDayOfYear.getUTCDate() + diff);

  const weekStart = new Date(firstMonday);
  weekStart.setUTCDate(firstMonday.getUTCDate() + daysOffset);

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setUTCDate(weekStart.getUTCDate() + i);
    return date;
  });
};

const escapeICS = (text: string) => {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
};

type GenerateIcsOptions = {
  // om du vill ha ett specifikt filnamn (utan .ics)
  fileName?: string;
};

export const generateICS = (
  weekString: string,
  plans: DayPlan[],
  recipes: Recipe[],
  options?: GenerateIcsOptions
) => {
  const weekDates = getWeekDates(weekString);

  const events = plans
    .filter((p) => {
      const hasRecipe = p.recipeId !== null;
      const hasText = !!(p.freeText && p.freeText.trim().length > 0);
      return hasRecipe || hasText;
    })
    .map((plan) => {
      const date = weekDates[plan.dayId];

      const recipe = plan.recipeId !== null ? recipes.find((r) => r.id === plan.recipeId) : null;
      const title =
        recipe?.name?.trim() ||
        (plan.freeText ? plan.freeText.trim() : "") ||
        "Måltid";

      const description = recipe?.source ? `Källa: ${recipe.source}` : "";

      // Starttid: 17:30 lokal tid
const start = new Date(date);
      start.setHours(17, 30, 0, 0);

      // Sluttid: 18:30 lokal tid (1h senare)
      const end = new Date(start);
      end.setHours(start.getHours() + 1);

      const uid = `${weekString}-${plan.dayId}-${plan.recipeId ?? "text"}@matplan`;

      return [
        "BEGIN:VEVENT",
        `UID:${escapeICS(uid)}`,
        `DTSTAMP:${formatDateForICS(new Date())}`,
        `DTSTART:${formatDateForICS(start)}`,
        `DTEND:${formatDateForICS(end)}`,
        `SUMMARY:${escapeICS(title)}`,
        `DESCRIPTION:${escapeICS(description)}`,
        "END:VEVENT",
      ].join("\n");
    });

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Matplaneraren//SE",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ].join("\n");

  const fileNameBase = options?.fileName?.trim()
    ? options.fileName.trim()
    : `matplan-${weekString}`;

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${fileNameBase}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};