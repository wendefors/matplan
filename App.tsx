import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Recipe, WeekPlan } from "./types";
import { getPlans, savePlans } from "./services/storageService";
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
  active_day_indices: number[] | null;
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

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

function toDbRecipePayload(userId: string, r: Recipe) {
  return {
    id: r.id,
    user_id: userId,
    name: r.name,
    source: r.source || null,
    has_recipe_content: r.hasRecipeContent,
    category: r.category || null,
    last_cooked: r.lastCooked, // <-- VIKTIGT: detta ska sparas
  };
}

function fromDbRecipeRow(r: DbRecipe): Recipe {
  return {
    id: r.id,
    name: r.name ?? "",
    source: r.source ?? "",
    hasRecipeContent: !!r.has_recipe_content,
    category: r.category ?? "Annat",
    lastCooked: r.last_cooked,
  };
}

async function fetchRecipesFromSupabase(): Promise<Recipe[]> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("recipes")
    .select("id,user_id,name,source,has_recipe_content,category,last_cooked")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as DbRecipe[]).map(fromDbRecipeRow);
}

/**
 * Sparar (upsert) receptlistan för nuvarande användare.
 * - onConflict: "id" eftersom din tabell visar att id är PK.
 * - user_id skickas alltid med så att RLS/NOT NULL blir nöjda.
 */
async function saveRecipesToSupabase(nextRecipes: Recipe[]): Promise<void> {
  const userId = await requireUserId();

  const payload = nextRecipes.map((r) => toDbRecipePayload(userId, r));

  const { error } = await supabase
    .from("recipes")
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;
}

/**
 * Tar bort ett recept (för nuvarande användare).
 * Detta används om du i UI tar bort en rätt och vill att den även försvinner i Supabase.
 */
async function deleteRecipeFromSupabase(recipeId: number): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("user_id", userId)
    .eq("id", recipeId);

  if (error) throw error;
}

/**
 * Week plans i Supabase (om du har detta igång).
 * Om du fortfarande kör week plans lokalt kan du lämna dessa som “no-op”.
 */
function normalizeWeekPlans(plans: WeekPlan[]): WeekPlan[] {
  return [...plans].sort((a, b) => a.weekIdentifier.localeCompare(b.weekIdentifier));
}

function normalizeActiveDays(active?: number[] | null): number[] {
  if (!active || active.length === 0) return [0, 1, 2, 3, 4, 5, 6];
  return Array.from(new Set(active))
    .filter((n) => n >= 0 && n <= 6)
    .sort((a, b) => a - b);
}

async function fetchWeekPlansFromSupabase(): Promise<WeekPlan[]> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("week_plans")
    .select("id,user_id,week_identifier,days,active_day_indices")
    .eq("user_id", userId)
    .order("week_identifier", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as DbWeekPlan[];

  const mapped: WeekPlan[] = rows.map((r) => ({
    weekIdentifier: r.week_identifier,
    days: Array.isArray(r.days) ? r.days : [],
    activeDayIndices: normalizeActiveDays(r.active_day_indices),
  }));

  return normalizeWeekPlans(mapped);
}

async function saveWeekPlansToSupabase(nextPlans: WeekPlan[]): Promise<void> {
  const userId = await requireUserId();

  const payload = nextPlans.map((p) => ({
    user_id: userId,
    week_identifier: p.weekIdentifier,
    days: p.days ?? [],
    active_day_indices: normalizeActiveDays(p.activeDayIndices),
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

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("getSession failed:", error);
        return;
      }

      if (mounted && data.session) {
        setAuthed(true);

        // Välj EN av dessa två beroende på var du vill ha week plans:
        // A) week plans lokalt (nuvarande upplägg)
        // setPlans(getPlans());

        // B) week plans i Supabase
        try {
          const p = await fetchWeekPlansFromSupabase();
          setPlans(p);
        } catch (e) {
          console.error("Kunde inte hämta week plans från Supabase:", e);
          setPlans(getPlans()); // fallback
        }

        // Recept från Supabase
        try {
          const r = await fetchRecipesFromSupabase();
          setRecipes(r);
        } catch (e) {
          console.error("Kunde inte hämta recept från Supabase:", e);
          setRecipes([]);
        }
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

  if (!authed) {
    return (
      <Login
        onSuccess={async () => {
          setAuthed(true);

          // Välj EN av dessa två beroende på var du vill ha week plans:
          // A) lokalt
          // setPlans(getPlans());

          // B) Supabase
          try {
            const p = await fetchWeekPlansFromSupabase();
            setPlans(p);
          } catch (e) {
            console.error("Kunde inte hämta week plans från Supabase:", e);
            setPlans(getPlans()); // fallback
          }

          // Recept från Supabase
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

  const handleUpdateRecipes = async (nextRecipes: Recipe[]) => {
    // Optimistisk UI
    setRecipes(nextRecipes);

    try {
      // Spara till Supabase (inkl user_id + last_cooked)
      await saveRecipesToSupabase(nextRecipes);
    } catch (e) {
      console.error("SAVE FAILED (recipes):", e);

      // Återställ från servern så UI inte ljuger
      try {
        const r = await fetchRecipesFromSupabase();
        setRecipes(r);
      } catch (e2) {
        console.error("Kunde inte återladda recept från Supabase:", e2);
      }
    }
  };

  const handleDeleteRecipe = async (recipeId: number) => {
    // Optimistisk UI
    const next = recipes.filter((r) => r.id !== recipeId);
    setRecipes(next);

    try {
      await deleteRecipeFromSupabase(recipeId);
    } catch (e) {
      console.error("DELETE FAILED (recipes):", e);

      // Återställ från servern
      try {
        const r = await fetchRecipesFromSupabase();
        setRecipes(r);
      } catch (e2) {
        console.error("Kunde inte återladda recept från Supabase:", e2);
      }
    }
  };

  const handleUpdatePlans = async (nextPlans: WeekPlan[]) => {
    setPlans(nextPlans);

    // Välj EN av dessa två beroende på var du vill ha week plans:
    // A) lokalt (nuvarande upplägg)
    // savePlans(nextPlans);

    // B) Supabase
    try {
      await saveWeekPlansToSupabase(nextPlans);
    } catch (e) {
      console.error("SAVE FAILED (week_plans):", e);

      // Fallback: försök läsa om
      try {
        const p = await fetchWeekPlansFromSupabase();
        setPlans(p);
      } catch (e2) {
        console.error("Kunde inte återladda week plans från Supabase:", e2);
      }
    }
  };

  // Realtime: recept
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

  // Realtime: week_plans (om du kör week plans i Supabase)
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
                  // Om du har en separat delete-callback i RecipeList kan du skicka den här:
                  // onDeleteRecipe={handleDeleteRecipe}
                />
              }
            />
          </Routes>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-100 flex shadow-2xl z-20">
          <NavLink to="/">
            <div className="flex flex-col items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Planering
            </div>
          </NavLink>

          <NavLink to="/recipes">
            <div className="flex flex-col items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              Mina rätter
            </div>
          </NavLink>
        </nav>
      </div>
    </HashRouter>
  );
};

export default App;
