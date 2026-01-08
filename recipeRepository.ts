import { supabase } from "./supabaseClient";
import type { Recipe } from "./types";

type DbRecipe = {
  id: number;
  name: string;
  source: string;
  has_recipe_content: boolean;
  category: string;
  last_cooked: string | null;
};

export async function fetchRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select("id,name,source,has_recipe_content,category,last_cooked")
    .order("name", { ascending: true });

  if (error) throw error;

  return (data as DbRecipe[]).map((r) => ({
    id: r.id,
    name: r.name,
    source: r.source,
    hasRecipeContent: r.has_recipe_content,
    category: r.category,
    lastCooked: r.last_cooked,
  }));
}

export async function setLastCooked(recipeId: number, isoDate: string) {
  const { error } = await supabase
    .from("recipes")
    .update({ last_cooked: isoDate })
    .eq("id", recipeId);

  if (error) throw error;
}
