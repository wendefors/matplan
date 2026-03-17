export const SWEDISH_DAYS = [
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
  "Söndag",
];

export const RECIPE_CATEGORIES = [
  "Kött",
  "Fisk",
  "Vegetariskt",
  "Kyckling",
  "Pasta",
  "Soppa",
  "Annat",
] as const;

export type RecipeCategory = typeof RECIPE_CATEGORIES[number];

export type MealSlotType = "lunch" | "dinner";

export type MealSlotPlan = {
  // Antingen väljer man ett recept...
  recipeId: number | null;
  // ...eller skriver fritext (då ska recipeId vara null)
  freeText?: string | null;
};

export type DayPlan = {
  dayId: number; // 0..6 (matchar index i SWEDISH_DAYS)
  lunch: MealSlotPlan;
  dinner: MealSlotPlan;
};

export type ActiveDayIndices = {
  lunch: number[];
  dinner: number[];
};

export type WeekPlan = {
  weekIdentifier: string; // t.ex. "2026-W02"
  days: DayPlan[];
  activeDayIndices?: ActiveDayIndices; // vilka dagar är "tända" per måltid
};

export type Recipe = {
  id: number;
  name: string;
  source: string | null;
  hasRecipeContent: boolean;
  category: string;
  lastCooked: string | null;
  baseServings: number;
};
