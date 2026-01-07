
import { Recipe, DayPlan } from '../types';

/**
 * Calculates the correct date for a specific day of an ISO week.
 * Uses UTC to avoid timezone shifts during calculation.
 */
function getDateOfWeekDay(weekStr: string, dayIndex: number): Date {
  const [year, weekNum] = weekStr.split('-W').map(Number);
  
  // ISO 8601 week 1 is the week with the first Thursday of the year (Jan 4 is always in it)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  
  // Find the Monday of that week
  const day = jan4.getUTCDay() || 7; // Sunday=7, Monday=1
  const mondayOfFirstWeek = new Date(jan4);
  mondayOfFirstWeek.setUTCDate(jan4.getUTCDate() - day + 1);
  
  // Add weeks and days
  const targetDate = new Date(mondayOfFirstWeek);
  targetDate.setUTCDate(mondayOfFirstWeek.getUTCDate() + (weekNum - 1) * 7 + dayIndex);
  
  return targetDate;
}

function formatTimeForICS(date: Date, hours: number, minutes: number): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(hours).padStart(2, '0');
  const min = String(minutes).padStart(2, '0');
  // Return local format (no Z) so the phone handles the timezone conversion
  return `${y}${m}${d}T${h}${min}00`;
}

export const generateICS = (weekIdentifier: string, plans: DayPlan[], recipes: Recipe[]) => {
  const events: string[] = [];

  plans.forEach((plan) => {
    if (plan.recipeId === null) return;
    const recipe = recipes.find(r => r.id === plan.recipeId);
    if (!recipe) return;

    const baseDate = getDateOfWeekDay(weekIdentifier, plan.dayId);
    const startStr = formatTimeForICS(baseDate, 17, 30);
    const endStr = formatTimeForICS(baseDate, 18, 30);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const uid = `plan-${weekIdentifier}-${plan.dayId}-${plan.recipeId}-${Date.now()}@matplaneraren`;

    const event = [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:Middag: ${recipe.name}`,
      `DESCRIPTION:Kategori: ${recipe.category}\\nKälla: ${recipe.source || 'Okänd'}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Dags att laga mat!',
      'TRIGGER:-PT15M',
      'END:VALARM',
      'END:VEVENT'
    ].join('\r\n');

    events.push(event);
  });

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Matplaneraren//NONSGML v1.4//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `matplanering-${weekIdentifier}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
