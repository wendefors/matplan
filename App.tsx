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
  user_id: string;
  week_identifier: string;
  days: any; // jsonb
  active_day_indices: any; // jsonb
  updated_at?: string;
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

/* =========================
   SUPABASE HELPERS
   ========================= */

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Ingen inloggad användare");
  return data.user.id;
}

/* ---- Recipes ---- */

async function fetchRecipesFromSupabase(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select("id,user_id,name,source,has_recipe_content,category,last_cooked")
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

async function deleteRecipeFromSupabase(id: number): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  if (error) throw error;
}

/* ---- Week plans ---- */

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function normalizeActiveDays(v: any): number[] {
  if (!Array.isArray(v)) return ALL_DAYS;
  const nums = v
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
  // unique + sort
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
  const { data, error } = await supabase
    .from("week_plans")
    .select("user_id,week_identifier,days,active_day_indices,updated_at")
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
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("week_plans")
    .upsert(payload, { onConflict: "user_id,week_identifier" });

  if (error) throw error;
}

/* =========================
   APP
   ========================= */

const App: React.FC = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plans, setPlans] = useState<WeekPlan[]>([]);
  const [authed, setAuthed] = useState(false);

  /* -------- AUTH + INITIAL LOAD -------- */
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        if (!data.session) {
          setAuthed(false);
          return;
        }

        setAuthed(true);

        const [r, p] = await Promise.all([
          fetchRecipesFromSupabase(),
          fetchWeekPlansFromSupabase(),
        ]);

        if (!mounted) return;
        setRecipes(r);
        setPlans(p);
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

  /* -------- REALTIME SYNC (recipes) -------- */
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
            console.error("Realtime reload recipes failed:", e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authed]);

  /* -------- REALTIME SYNC (week_plans) -------- */
  useEffect(() => {
    if (!authed) return;

    const channel = supabase
      .channel("week-plans-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "week_plans" },
        async () => {
          try {
            const p = await fetchWeekPlansFromSupabase();
            setPlans(p);
          } catch (e) {
            console.error("Realtime reload week_plans failed:", e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authed]);

  /* -------- LOGIN -------- */
  if (!authed) {
    return (
      <Login
        onSuccess={async () => {
          setAuthed(true);

          try {
            const [r, p] = await Promise.all([
              fetchRecipesFromSupabase(),
              fetchWeekPlansFromSupabase(),
            ]);
            setRecipes(r);
            setPlans(p);
          } catch (e) {
            console.error("Load after login failed:", e);
            setRecipes([]);
            setPlans([]);
          }
        }}
      />
    );
  }

  /* -------- UPDATE HANDLERS -------- */

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
