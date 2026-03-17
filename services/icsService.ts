import { ActiveDayIndices, DayPlan, MealSlotType, Recipe } from "../types";

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

const SLOT_META: Record<
  MealSlotType,
  { label: string; startHour: number; startMinute: number; durationHours: number }
> = {
  lunch: { label: "Lunch", startHour: 12, startMinute: 30, durationHours: 1 },
  dinner: { label: "Kvällsmat", startHour: 17, startMinute: 30, durationHours: 1 },
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type GenerateIcsOptions = {
  // Om du vill ha ett specifikt filnamn (utan .ics)
  fileName?: string;
  // Begränsa till specifika måltidstyper vid export av enstaka dag/slot.
  slots?: MealSlotType[];
  // Styr vilka dagar som är aktiva per slot.
  activeDayIndices?: ActiveDayIndices;
};

function resolveActiveDays(
  activeDayIndices: ActiveDayIndices | undefined,
  slot: MealSlotType
): number[] {
  const days = activeDayIndices?.[slot];
  if (!Array.isArray(days)) return ALL_DAYS;
  return days;
}

export const generateICS = (
  weekString: string,
  plans: DayPlan[],
  recipes: Recipe[],
  options?: GenerateIcsOptions
) => {
  const weekDates = getWeekDates(weekString);
  const selectedSlots = options?.slots?.length ? options.slots : (["lunch", "dinner"] as MealSlotType[]);

  const events: string[] = [];

  plans.forEach((plan) => {
    const date = weekDates[plan.dayId];
    if (!date) return;

    selectedSlots.forEach((slot) => {
      const activeDays = resolveActiveDays(options?.activeDayIndices, slot);
      if (!activeDays.includes(plan.dayId)) return;

      const slotPlan = plan[slot];
      const hasRecipe = slotPlan.recipeId !== null;
      const hasText = !!(slotPlan.freeText && slotPlan.freeText.trim().length > 0);
      if (!hasRecipe && !hasText) return;

      const recipe =
        slotPlan.recipeId !== null
          ? recipes.find((r) => r.id === slotPlan.recipeId)
          : null;
      const title =
        recipe?.name?.trim() || (slotPlan.freeText ? slotPlan.freeText.trim() : "") || SLOT_META[slot].label;

      // Lägg in en tydlig intern markering så vi kan ignorera egna exporter i kalenderläsning.
      const descriptionParts = [
        recipe?.source ? `Källa: ${recipe.source}` : "",
        `X-MATPLAN-EXPORT:1`,
        `X-MATPLAN-SLOT:${slot}`,
      ].filter(Boolean);
      const description = descriptionParts.join("\n");

      const start = new Date(date);
      start.setHours(SLOT_META[slot].startHour, SLOT_META[slot].startMinute, 0, 0);
      const end = new Date(start);
      end.setHours(start.getHours() + SLOT_META[slot].durationHours);

      const uid = `${weekString}-${plan.dayId}-${slot}-${slotPlan.recipeId ?? "text"}@matplan`;

      events.push(
        [
          "BEGIN:VEVENT",
          `UID:${escapeICS(uid)}`,
          `DTSTAMP:${formatDateForICS(new Date())}`,
          `DTSTART:${formatDateForICS(start)}`,
          `DTEND:${formatDateForICS(end)}`,
          `SUMMARY:${escapeICS(title)}`,
          `DESCRIPTION:${escapeICS(description)}`,
          "END:VEVENT",
        ].join("\n")
      );
    });
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
