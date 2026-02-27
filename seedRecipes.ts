import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { INITIAL_RECIPES } from "./constants";

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // eller SUPABASE_SERVICE_ROLE_KEY
const householdUserId = process.env.HOUSEHOLD_USER_ID; // UUID från Supabase Auth → Users

if (!url || !serviceKey || !householdUserId) {
  throw new Error(
    "Missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or HOUSEHOLD_USER_ID in .env.local"
  );
}

const supabase = createClient(url, serviceKey);

async function seed() {
  for (const r of INITIAL_RECIPES) {
    const { error } = await supabase.from("recipes").upsert(
      {
        user_id: householdUserId,
        id: r.id,
        name: r.name,
        source: r.source,
        has_recipe_content: r.hasRecipeContent,
        category: r.category,
        last_cooked: r.lastCooked,
        base_servings: r.baseServings ?? 4,
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("Error on recipe", r.id, error.message);
    }
  }

  console.log("Seed klar");
}

seed();
