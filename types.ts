

export type RecipeCategory = 'Pasta' | 'Kött' | 'Fisk' | 'Vegetariskt' | 'Kyckling' | 'Annat';

// Fixed: replaced the bitwise OR operator '|' with a comma ',' to correctly separate array elements
export const RECIPE_CATEGORIES: RecipeCategory[] = ['Pasta', 'Kött', 'Fisk', 'Vegetariskt', 'Kyckling', 'Annat'];

export interface Recipe {
  id: number;
  name: string;
  source: string | null;
  hasRecipeContent: boolean;
  category: RecipeCategory;
  lastCooked?: string | null; // ISO Date string
}

export interface DayPlan {
  dayId: number; // 0-6 (Mon-Sun)
  recipeId: number | null;
}

export interface WeekPlan {
  weekIdentifier: string; // e.g., "2023-W42"
  days: DayPlan[];
}

export const SWEDISH_DAYS = [
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
  "Söndag"
];