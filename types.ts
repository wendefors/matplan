export const SWEDISH_DAYS = [
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
  "Söndag",
];

export type DayPlan = {
  dayId: number; // 0..6 (matchar index i SWEDISH_DAYS)
  recipeId: number | null;
};

export type WeekPlan = {
  weekIdentifier: string; // t.ex. "2026-W02"
  days: DayPlan[];
  activeDayIndices?: number[]; // NYTT: vilka dagar är "tända" för just denna vecka
};

export type Recipe = {
  id: number;
  name: string;
  source: string;
  hasRecipeContent: boolean;
  category: string;
  lastCooked: string | null;
};
