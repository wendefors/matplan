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
  source: string;
  has_recipe_content: boolean;
  category: string;
  last_cooked: string | null;
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

async function fetchRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id,user_id,name,source,has_recipe_content,category,last_cooked"
    )
    .order("name");

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

async function saveRecipes(recipes: Recipe[]) {
  const userId = await getCurrentUserId();

  const payload = recipes.map((r) => ({
    user_id: userId,
    id: r.id,
    name: r.name,
    source: r.source,
    has_recipe_content: r.hasRecipeContent,
    category: r.category,
    last_cooked: r.lastCooked,
  }));

  const { error } = await supabase
    .from("recipes")
    .upsert(payload, {
      onConflict: "user_id,id",
    });

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
        setPlans(getPlans());

        const r = await fetchRecipes();
        setRecipes(r);
      } catch (e) {
        console.error("Init error:", e);
        setAuthed(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAuthed(!!session);
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /* -------- REALTIME SYNC -------- */
  useEffect(() => {
    if (!authed) return;

    const channel = supabase
      .channel("recipes-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recipes" },
        async () => {
          try {
            const r = await fetchRecipes();
            setRecipes(r);
          } catch (e) {
            console.error("Realtime reload failed:", e);
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
          setPlans(getPlans());

          try {
            const r = await fetchRecipes();
            setRecipes(r);
          } catch (e) {
            console.error("Load after login failed:", e);
            setRecipes([]);
          }
        }}
      />
    );
  }

  /* -------- UPDATE HANDLERS -------- */

  const handleUpdateRecipes = async (newRecipes: Recipe[]) => {
    setRecipes(newRecipes); // optimistisk UI

    try {
      await saveRecipes(newRecipes);
    } catch (e) {
      console.error("SAVE FAILED:", e);
      alert("Kunde inte spara recept – se Console.");
      try {
        const r = await fetchRecipes();
        setRecipes(r);
      } catch {}
    }
  };

  const handleUpdatePlans = (newPlans: WeekPlan[]) => {
    setPlans(newPlans);
    savePlans(newPlans);
  };

  /* -------- UI -------- */

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
