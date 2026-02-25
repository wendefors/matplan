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

export type DayPlan = {
  dayId: number; // 0..6 (matchar index i SWEDISH_DAYS)

  // Antingen väljer man ett recept...
  recipeId: number | null;

  // ...eller skriver fritext (då ska recipeId vara null)
  freeText?: string | null;
};

export type WeekPlan = {
  weekIdentifier: string; // t.ex. "2026-W02"
  days: DayPlan[];
  activeDayIndices?: number[]; // vilka dagar är "tända" för just denna vecka
};

export type Recipe = {
  id: number;
  name: string;
  source: string | null;
  hasRecipeContent: boolean;
  category: string;
  lastCooked: string | null;
};