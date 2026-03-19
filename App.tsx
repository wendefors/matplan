import React, { useEffect, useRef, useState } from "react";
import { HashRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Recipe, WeekPlan, DayPlan, ActiveDayIndices, MealSlotPlan } from "./types";
import MealPlanner from "./components/MealPlanner";
import RecipeList from "./components/RecipeList";
import RecipeContentEditor from "./components/RecipeContentEditor";
import RecipeViewer from "./components/RecipeViewer";
import ShoppingList from "./components/ShoppingList";
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
  base_servings: number | null;
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
      className={`flex-1 min-w-0 text-center py-4 px-3 text-sm font-semibold whitespace-nowrap transition-colors ${
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

function normalizeBaseServings(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(1, Math.round(parsed));
}

/* ---- Recipes ---- */

async function fetchRecipesFromSupabase(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id,user_id,name,source,has_recipe_content,category,last_cooked,base_servings"
    )
    .order("name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as DbRecipe[]).map((r) => ({
    id: r.id,
    name: r.name,
    source: r.source ?? "",
    hasRecipeContent: r.has_recipe_content,
    category: r.category ?? "Övrigt",
    lastCooked: r.last_cooked,
    baseServings: normalizeBaseServings(r.base_servings),
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
    base_servings: normalizeBaseServings(r.baseServings),
  }));

  const { error } = await supabase.from("recipes").upsert(payload, {
    onConflict: "id",
  });

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

/**
 * FIX: UPDATE last_cooked per recept (inte upsert)
 * Detta minskar risk för konstiga races + är stabilare mot RLS och iOS.
 */
async function updateLastCookedUpdates(
  updates: { id: number; lastCooked: string }[]
): Promise<void> {
  const userId = await getCurrentUserId();
  if (updates.length === 0) return;

  const parseComparableDate = (value: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.getTime();
  };

  const results = await Promise.all(
    updates.map(async (u) => {
      const { data, error } = await supabase
        .from("recipes")
        .select("last_cooked")
        .eq("user_id", userId)
        .eq("id", u.id)
        .maybeSingle();

      if (error) return { error };

      const currentDate = parseComparableDate(data?.last_cooked ?? null);
      const nextDate = parseComparableDate(u.lastCooked);

      // Skriv aldrig över med ett äldre datum.
      if (currentDate !== null && nextDate !== null && currentDate > nextDate) {
        return { error: null };
      }

      return supabase
        .from("recipes")
        .update({ last_cooked: u.lastCooked })
        .eq("user_id", userId)
        .eq("id", u.id);
    })
  );

  // Om någon failar, kasta fel så vi hamnar i catch i App
  for (const r of results) {
    if (r.error) throw r.error;
  }
}

/* ---- Week plans ---- */

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const NAV_HEIGHT_PX = 80;

function normalizeDayIndexArray(v: any): number[] {
  if (!Array.isArray(v)) return [];
  const nums = v
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

// Bakåtkompatibel normalisering:
// - gammalt format: [0,1,2...] => tolkas som middag/kvällsmat
// - nytt format: { lunch: [...], dinner: [...] }
function normalizeActiveDays(v: any): ActiveDayIndices {
  if (Array.isArray(v)) {
    return {
      lunch: [],
      dinner: normalizeDayIndexArray(v),
    };
  }

  const lunch = normalizeDayIndexArray(v?.lunch);
  const dinner = normalizeDayIndexArray(v?.dinner);

  return {
    lunch,
    dinner: dinner.length > 0 ? dinner : ALL_DAYS,
  };
}

function normalizeMealSlot(raw: any): MealSlotPlan {
  const rawRecipeId = raw?.recipeId;
  const recipeId =
    rawRecipeId === null || rawRecipeId === undefined || rawRecipeId === ""
      ? null
      : Number(rawRecipeId);

  const freeText = typeof raw?.freeText === "string" ? raw.freeText.trim() : null;
  const hasText = !!(freeText && freeText.length > 0);
  const hasRecipe = Number.isFinite(recipeId as number);

  return {
    recipeId: hasText ? null : hasRecipe ? (recipeId as number) : null,
    freeText: hasText ? freeText : null,
  };
}

function normalizeDayPlans(v: any): DayPlan[] {
  if (!Array.isArray(v)) return [];

  const out: DayPlan[] = [];

  for (const raw of v) {
    const dayId = Number(raw?.dayId);
    if (!Number.isFinite(dayId) || dayId < 0 || dayId > 6) continue;

    // Bakåtkompatibilitet:
    // - gammal dagrad med recipeId/freeText mappas till dinner
    // - nytt format läses från lunch/dinner
    const hasLegacyFields =
      Object.prototype.hasOwnProperty.call(raw ?? {}, "recipeId") ||
      Object.prototype.hasOwnProperty.call(raw ?? {}, "freeText");

    const lunch = hasLegacyFields ? normalizeMealSlot(null) : normalizeMealSlot(raw?.lunch);
    const dinner = hasLegacyFields ? normalizeMealSlot(raw) : normalizeMealSlot(raw?.dinner);

    const normalized: DayPlan = {
      dayId,
      lunch,
      dinner,
    };

    out.push(normalized);
  }

  // En post per dayId (om dubletter: sista vinner)
  const byDay = new Map<number, DayPlan>();
  for (const p of out) byDay.set(p.dayId, p);

  return Array.from(byDay.values()).sort((a, b) => a.dayId - b.dayId);
}

function toWeekPlans(rows: DbWeekPlan[]): WeekPlan[] {
  return (rows ?? []).map((r) => ({
    weekIdentifier: r.week_identifier,
    days: normalizeDayPlans(r.days),
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
    days: normalizeDayPlans(p.days),
    active_day_indices: normalizeActiveDays(p.activeDayIndices),
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

  // Guard för att undvika att realtime-reload direkt skriver över våra egna, pågående writes
  const isWritingRecipesRef = useRef(false);

  const withRecipeWriteGuard = async (fn: () => Promise<void>) => {
    isWritingRecipesRef.current = true;
    try {
      await fn();
    } finally {
      // liten delay så realtime-event som triggas av vår write hinner passera
      setTimeout(() => {
        isWritingRecipesRef.current = false;
      }, 350);
    }
  };

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
          // 🔴 Om vi själva precis skrivit: hoppa över reload för att undvika blink/race
          if (isWritingRecipesRef.current) return;

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

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("SIGN OUT FAILED:", error);
    } finally {
      // Säkerställ att UI går till utloggat läge även om nätverket strular.
      setAuthed(false);
      setRecipes([]);
      setPlans([]);
    }
  };

  const handleUpdateRecipes = async (newRecipes: Recipe[]) => {
    // Optimistiskt i UI
    setRecipes(newRecipes);

    try {
      await withRecipeWriteGuard(async () => {
        await saveRecipesToSupabase(newRecipes);
      });
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
      await withRecipeWriteGuard(async () => {
        await deleteRecipeFromSupabase(id);
      });
    } catch (e) {
      console.error("DELETE RECIPE FAILED:", e);
      alert("Kunde inte ta bort recept – se Console.");
      try {
        const r = await fetchRecipesFromSupabase();
        setRecipes(r);
      } catch {}
    }
  };

  const handleRefreshRecipes = async (): Promise<Recipe[]> => {
    const r = await fetchRecipesFromSupabase();
    setRecipes(r);
    return r;
  };

  const handleUpdatePlans = async (newPlans: WeekPlan[]) => {
    const normalized = newPlans.map((p) => ({
      ...p,
      days: normalizeDayPlans(p.days),
      activeDayIndices: normalizeActiveDays(p.activeDayIndices),
    }));

    setPlans(normalized);

    try {
      await saveWeekPlansToSupabase(normalized);
    } catch (e) {
      console.error("SAVE WEEK PLANS FAILED:", e);
      alert("Kunde inte spara planering – se Console.");
      try {
        const p = await fetchWeekPlansFromSupabase();
        setPlans(p);
      } catch {}
    }
  };

  // NYTT: "Spara som lagade" – per recept kan datum skilja
  const handleMarkCooked = async (updates: { id: number; lastCooked: string }[]) => {
    const parseComparableDate = (value: string | null) => {
      if (!value) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.getTime();
    };

    const applicableUpdates = updates.filter((update) => {
      const existing = recipes.find((recipe) => recipe.id === update.id);
      if (!existing?.lastCooked) return true;

      const currentDate = parseComparableDate(existing.lastCooked);
      const nextDate = parseComparableDate(update.lastCooked);
      if (currentDate === null || nextDate === null) return true;
      return currentDate <= nextDate;
    });

    if (applicableUpdates.length === 0) return;

    try {
      await withRecipeWriteGuard(async () => {
        await updateLastCookedUpdates(applicableUpdates);
      });
      const r = await fetchRecipesFromSupabase();
      setRecipes(r);
    } catch (e) {
      console.error("SAVE last_cooked FAILED:", e);
      // Återladda för att undvika att UI visar fel
      try {
        const r = await fetchRecipesFromSupabase();
        setRecipes(r);
      } catch {}
    }
  };

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col max-w-lg mx-auto bg-white shadow-xl relative">
        <header className="px-6 pt-8 pb-4 bg-white sticky top-0 z-10 border-b border-gray-100 [@media(orientation:landscape)]:static [@media(orientation:landscape)]:z-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                Matplaneraren
              </h1>
              <p className="text-sm text-gray-500">Planera smart, ät gott.</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="shrink-0 text-xs font-bold px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 bg-white"
              title="Logga ut"
            >
              Logga ut
            </button>
          </div>
        </header>

        <main
          className="flex-1 overflow-y-auto px-4 pt-6 pb-[var(--nav-height)]"
          style={{ "--nav-height": `${NAV_HEIGHT_PX}px` } as React.CSSProperties}
        >
          <Routes>
            <Route
              path="/"
              element={
                <MealPlanner
                  recipes={recipes}
                  plans={plans}
                  onUpdatePlans={handleUpdatePlans}
                  onUpdateRecipes={handleUpdateRecipes}
                  onMarkCooked={handleMarkCooked}
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
                  onRefreshRecipes={handleRefreshRecipes}
                />
              }
            />
            <Route
              path="/shopping"
              element={<ShoppingList recipes={recipes} plans={plans} />}
            />
            <Route
              path="/recipes/:id/content"
              element={
                <RecipeContentEditor
                  onRefreshRecipes={async () => {
                    await handleRefreshRecipes();
                  }}
                />
              }
            />
            <Route path="/recipes/:id/view" element={<RecipeViewer />} />
          </Routes>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-100 flex shadow-2xl z-20">
          <NavLink to="/">Planering</NavLink>
          <NavLink to="/recipes">Våra rätter</NavLink>
          <NavLink to="/shopping">Inköpslista</NavLink>
        </nav>
      </div>
    </HashRouter>
  );
};

export default App;
