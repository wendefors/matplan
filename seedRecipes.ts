import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { INITIAL_RECIPES } from "./constants";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function seed() {
  for (const r of INITIAL_RECIPES) {
    const { error } = await supabase.from("recipes").insert({
      id: r.id,
      name: r.name,
      source: r.source,
      has_recipe_content: r.hasRecipeContent,
      category: r.category,
      last_cooked: r.lastCooked
    });

    if (error) {
      console.error("Error on recipe", r.id, error.message);
    }
  }

  console.log("Seed klar");
}

seed();
