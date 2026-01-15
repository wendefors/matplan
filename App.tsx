import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Recipe, WeekPlan } from "./types";
import MealPlanner from "./components/MealPlanner";
import RecipeList from "./components/RecipeList";
import Login from "./components/Login";
import { supabase } from "./supabaseClient";

type DbRecipe = {
  id: number;
  user_id: string;
  name: string;
  source: string | null;
  has_recipe_content: boolean;
  category: string | null;
  last_cooked: string | null;
};

type DbWeekPlan = {
  id: string;
  user_id: string;
  week_identifier: string;
  days: any; // jsonb
  active_day_indices: any; // jsonb/array
};

const NavLink: React.FC<{ to: string; children: React.ReactNode }> = ({
  to,
  children,
}) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      className={`flex-1 text-center py-4 text-sm font-semibold transition-colors ${
        isActive
          ? "text-emerald-600 border-t-2 border-emerald-600"
          : "text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </Link>
  );
};

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

async function fetchRecipesFromSupabase(): Promise<Recipe[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("recipes")
    .select("id,user_id,name,source,has_recipe_content,category,last_cooked")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as DbRecipe[]).map((r) => ({
    id: r.id,
    name: r.name,
    source: r.source ?? "",
    hasRecipeContent: r.has_recipe_content,
    category: r.category ?? "Övrigt",
    lastCooked: r.last_cooked,
  }));
}

async function saveRecipesToSupabase(recipes: Recipe[]): Promise<void> {
  const userId = await getCurrentUserId();

  const payload = recipes.map((r) => ({
    user_id: userId,
    id: r.id,
    name: r.name,
    source: r.source || null,
    has_recipe_content: r.hasRecipeContent,
    category: r.category || null,
    last_cooked: r.lastCooked,
  }));

  const { error } = await supabase
    .from("recipes")
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;
}

async function deleteRecipeFromSupabase(recipeId: number): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("user_id", userId)
    .eq("id", recipeId);

  if (error) throw error;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function normalizeActiveDays(v: any): number[] {
  if (!Array.isArray(v)) return ALL_DAYS;
  const nums = v
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function toWeekPlans(rows: DbWeekPlan[]): WeekPlan[] {
  return (rows ?? []).map((r) => ({
    weekIdentifier: r.week_identifier,
    days: Array.isArray(r.days) ? r.days : [],
    activeDayIndices: normalizeActiveDays(r.active_day_indices),
  }));
}

async function fetchWeekPlansFromSupabase(): Promise<WeekPlan[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("week_plans")
    .select("id,user_id,week_identifier,days,active_day_indices")
    .eq("user_id", userId)
    .order("week_identifier", { ascending: true });

  if (error) throw error;

  return toWeekPlans((data ?? []) as DbWeekPlan[]);
}

async function saveWeekPlansToSupabase(plans: WeekPlan[]): Promise<void> {
  const userId = await getCurrentUserId();

  const payload = plans.map((p) => ({
    user_id: userId,
    week_identifier: p.weekIdentifier,
    days: p.days ?? [],
    active_day_indices: p.activeDayIndices ?? ALL_DAYS,
  }));

  const { error } = await supabase
    .from("week_plans")
    .upsert(payload, { onConflict: "user_id,week_identifier" });

  if (error) throw error;
}

const App: React.FC = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plans, setPlans] = useState<WeekPlan[]>([]);
  const [authed, setAuthed] = useState(false);

  // Init + session
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        if (data.session) {
          setAuthed(true);

          try {
            const p = await fetchWeekPlansFromSupabase();
            setPlans(p);
          } catch (e) {
            console.error("Kunde inte hämta week plans från Supabase:", e);
            setPlans([]);
          }

          try {
            const r = await fetchRecipesFromSupabase();
            setRecipes(r);
          } catch (e) {
            console.error("Kunde inte hämta recept från Supabase:", e);
            setRecipes([]);
          }
        } else {
          setAuthed(false);
        }
      } catch (e) {
        console.error("Init error:", e);
        setAuthed(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Realtime: recipes
  useEffect(() => {
    if (!authed) return;

    const channel = supabase
      .channel("recipes-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recipes" },
        async () => {
          try {
            const r = await fetchRecipesFromSupabase();
            setRecipes(r);
          } catch (e) {
            console.error("Realtime reload misslyckades (recipes):", e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authed]);

  // Realtime: week_plans
  useEffect(() => {
    if (!authed) return;

    const channel = supabase
      .channel("weekplans-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "week_plans" },
        async () => {
          try {
            const p = await fetchWeekPlansFromSupabase();
            setPlans(p);
          } catch (e) {
            console.error("Realtime reload misslyckades (week_plans):", e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authed]);

  if (!authed) {
    return (
      <Login
        onSuccess={async () => {
          setAuthed(true);

          try {
            const p = await fetchWeekPlansFromSupabase();
            setPlans(p);
          } catch (e) {
            console.error("Kunde inte hämta week plans från Supabase:", e);
            setPlans([]);
          }

          try {
            const r = await fetchRecipesFromSupabase();
            setRecipes(r);
          } catch (e) {
            console.error("Kunde inte hämta recept från Supabase:", e);
            setRecipes([]);
          }
        }}
      />
    );
  }

  const handleUpdateRecipes = async (newRecipes: Recipe[]) => {
    setRecipes(newRecipes);

    try {
      await saveRecipesToSupabase(newRecipes);
    } catch (e) {
      console.error("SAVE RECIPES FAILED:", e);
      alert("Kunde inte spara recept – se Console.");
      try {
        const r = await fetchRecipesFromSupabase();
        setRecipes(r);
      } catch {}
    }
  };

  const handleDeleteRecipe = async (id: number) => {
    // Optimistiskt i UI
    setRecipes((prev) => prev.filter((r) => r.id !== id));

    try {
      await deleteRecipeFromSupabase(id);
    } catch (e) {
      console.error("DELETE RECIPE FAILED:", e);
      alert("Kunde inte ta bort recept – se Console.");
      try {
        const r = await fetchRecipesFromSupabase();
        setRecipes(r);
      } catch {}
    }
  };

  const handleUpdatePlans = async (newPlans: WeekPlan[]) => {
    setPlans(newPlans);

    try {
      await saveWeekPlansToSupabase(newPlans);
    } catch (e) {
      console.error("SAVE WEEK PLANS FAILED:", e);
      alert("Kunde inte spara planering – se Console.");
      try {
        const p = await fetchWeekPlansFromSupabase();
        setPlans(p);
      } catch {}
    }
  };

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col max-w-lg mx-auto bg-white shadow-xl relative pb-20 md:pb-0">
        <header className="px-6 pt-8 pb-4 bg-white sticky top-0 z-10 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Matplaneraren
          </h1>
          <p className="text-sm text-gray-500">Planera smart, ät gott.</p>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6">
          <Routes>
            <Route
              path="/"
              element={
                <MealPlanner
                  recipes={recipes}
                  plans={plans}
                  onUpdatePlans={handleUpdatePlans}
                  onUpdateRecipes={handleUpdateRecipes}
                />
              }
            />
            <Route
              path="/recipes"
              element={
                <RecipeList
                  recipes={recipes}
                  onUpdateRecipes={handleUpdateRecipes}
                  onDeleteRecipe={handleDeleteRecipe}
                />
              }
            />
          </Routes>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-100 flex shadow-2xl z-20">
          <NavLink to="/">Planering</NavLink>
          <NavLink to="/recipes">Mina rätter</NavLink>
        </nav>
      </div>
    </HashRouter>
  );
};

export default App;
