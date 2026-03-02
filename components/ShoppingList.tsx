import React, { useEffect, useMemo, useState } from "react";
import { Recipe, WeekPlan } from "../types";
import { fetchRecipeFull, type RecipeFull } from "../services/recipeContentService";

type ShoppingListProps = {
  recipes: Recipe[];
  plans: WeekPlan[];
};

type LoadedRecipeEntry = {
  dayId: number;
  recipe: Recipe;
  full: RecipeFull | null;
  error: string | null;
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const LAST_SELECTED_WEEK_KEY = "matplaneraren_selected_week_v1";

function getCurrentIsoWeek(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function isoWeekToMonday(weekIdentifier: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekIdentifier);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoDow = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4IsoDow - 1));

  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

function dateToIsoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function shiftIsoWeek(weekIdentifier: string, deltaWeeks: number): string {
  const monday = isoWeekToMonday(weekIdentifier);
  if (!monday) return weekIdentifier;
  monday.setUTCDate(monday.getUTCDate() + deltaWeeks * 7);
  return dateToIsoWeek(monday);
}

function normalizeKeyPart(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

const ShoppingList: React.FC<ShoppingListProps> = ({ recipes, plans }) => {
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(LAST_SELECTED_WEEK_KEY)
        : null;
    return stored || getCurrentIsoWeek();
  });
  const [loadedEntries, setLoadedEntries] = useState<LoadedRecipeEntry[]>([]);
  const [servingsByDay, setServingsByDay] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LAST_SELECTED_WEEK_KEY, selectedWeek);
  }, [selectedWeek]);

  const currentPlan = useMemo(() => {
    return (
      plans.find((plan) => plan.weekIdentifier === selectedWeek) || {
        weekIdentifier: selectedWeek,
        days: [],
        activeDayIndices: ALL_DAYS,
      }
    );
  }, [plans, selectedWeek]);

  const activeDayIndices = currentPlan.activeDayIndices ?? ALL_DAYS;

  const activeDays = useMemo(
    () =>
      currentPlan.days
        .filter((day) => activeDayIndices.includes(day.dayId))
        .sort((a, b) => a.dayId - b.dayId),
    [currentPlan.days, activeDayIndices]
  );

  const freeTextDays = useMemo(
    () =>
      activeDays
        .filter((day) => day.recipeId == null && day.freeText && day.freeText.trim())
        .map((day) => ({
          dayId: day.dayId,
          text: day.freeText!.trim(),
        })),
    [activeDays]
  );

  const recipeDays = useMemo(
    () =>
      activeDays
        .filter((day) => day.recipeId != null)
        .map((day) => ({
          dayId: day.dayId,
          recipe: recipes.find((recipe) => recipe.id === day.recipeId) ?? null,
        })),
    [activeDays, recipes]
  );

  useEffect(() => {
    let active = true;

    const run = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const results = await Promise.all(
          recipeDays.map(async (entry) => {
            if (!entry.recipe) {
              return {
                dayId: entry.dayId,
                recipe: null,
                full: null,
                error: "Recept saknas i listan.",
              };
            }

            try {
              const full = await fetchRecipeFull(entry.recipe.id);
              return {
                dayId: entry.dayId,
                recipe: entry.recipe,
                full,
                error: null,
              };
            } catch (loadError) {
              console.error("LOAD SHOPPING RECIPE FAILED:", loadError);
              return {
                dayId: entry.dayId,
                recipe: entry.recipe,
                full: null,
                error: "Kunde inte läsa receptinnehåll.",
              };
            }
          })
        );

        if (!active) return;

        const normalizedResults = results.filter(
          (
            result
          ): result is {
            dayId: number;
            recipe: Recipe;
            full: RecipeFull | null;
            error: string | null;
          } => result.recipe !== null
        );

        setLoadedEntries(normalizedResults);

        const nextServings: Record<number, number> = {};
        for (const result of normalizedResults) {
          nextServings[result.dayId] = Math.max(
            1,
            Math.round(result.recipe.baseServings || 4)
          );
        }
        setServingsByDay(nextServings);
      } catch (loadError) {
        if (!active) return;
        console.error("LOAD SHOPPING LIST FAILED:", loadError);
        setError("Kunde inte ladda inköpsunderlaget.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [recipeDays]);

  const summableIngredients = useMemo(() => {
    const summed = new Map<
      string,
      { name: string; unit: string | null; amount: number }
    >();
    const unsummed: { label: string; dayId: number }[] = [];

    for (const entry of loadedEntries) {
      if (!entry.full || entry.full.ingredients.length === 0) continue;

      const baseServings = Math.max(1, Math.round(entry.recipe.baseServings || 4));
      const selectedServings = Math.max(1, Math.round(servingsByDay[entry.dayId] || baseServings));
      const factor = selectedServings / baseServings;

      for (const ingredient of entry.full.ingredients) {
        if (ingredient.amount === null) {
          unsummed.push({
            dayId: entry.dayId,
            label: [ingredient.unit, ingredient.name].filter(Boolean).join(" ").trim(),
          });
          continue;
        }

        const normalizedName = ingredient.name.trim();
        const normalizedUnit = ingredient.unit?.trim() || null;
        const key = `${normalizeKeyPart(normalizedName)}|${normalizeKeyPart(normalizedUnit)}`;
        const scaledAmount = ingredient.amount * factor;
        const existing = summed.get(key);

        if (existing) {
          existing.amount += scaledAmount;
        } else {
          summed.set(key, {
            name: normalizedName,
            unit: normalizedUnit,
            amount: scaledAmount,
          });
        }
      }
    }

    return {
      summed: Array.from(summed.values()).sort((a, b) => a.name.localeCompare(b.name, "sv")),
      unsummed,
    };
  }, [loadedEntries, servingsByDay]);

  const missingRecipeContent = useMemo(
    () =>
      loadedEntries.filter(
        (entry) => entry.error || !entry.full || entry.full.ingredients.length === 0
      ),
    [loadedEntries]
  );

  const formatAmount = (amount: number) => {
    const rounded = Math.round(amount * 100) / 100;
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(2).replace(/\.?0+$/, "");
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-24">
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Välj vecka</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedWeek((prev) => shiftIsoWeek(prev, -1))}
            className="shrink-0 p-3 bg-gray-100 rounded-xl text-gray-700 font-bold"
            title="Föregående vecka"
          >
            ←
          </button>
          <input
            type="week"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-medium"
          />
          <button
            type="button"
            onClick={() => setSelectedWeek((prev) => shiftIsoWeek(prev, 1))}
            className="shrink-0 p-3 bg-gray-100 rounded-xl text-gray-700 font-bold"
            title="Nästa vecka"
          >
            →
          </button>
        </div>
      </section>

      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">
          Veckans valda rätter
        </h2>
        {isLoading && <p className="text-sm text-gray-500">Laddar receptunderlag...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!isLoading && loadedEntries.length === 0 && freeTextDays.length === 0 && (
          <p className="text-sm text-gray-500">Inga valda rätter för veckan.</p>
        )}
        {loadedEntries.map((entry) => (
          <div
            key={`${entry.dayId}-${entry.recipe.id}`}
            className="rounded-2xl border border-gray-100 p-4 bg-gray-50 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Dag {entry.dayId + 1}
                </p>
                <h3 className="font-bold text-gray-900 truncate">{entry.recipe.name}</h3>
              </div>
              <span className="text-[10px] bg-white border border-gray-200 text-gray-500 px-2 py-1 rounded-full font-bold uppercase">
                {entry.recipe.category}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">
                Grund: {entry.recipe.baseServings} portioner
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setServingsByDay((prev) => ({
                      ...prev,
                      [entry.dayId]: Math.max(1, (prev[entry.dayId] || entry.recipe.baseServings) - 1),
                    }))
                  }
                  className="h-8 w-8 rounded-lg bg-white border border-gray-200 font-bold text-gray-700"
                >
                  -
                </button>
                <span className="min-w-12 text-center text-sm font-semibold text-gray-900">
                  {servingsByDay[entry.dayId] || entry.recipe.baseServings}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setServingsByDay((prev) => ({
                      ...prev,
                      [entry.dayId]: (prev[entry.dayId] || entry.recipe.baseServings) + 1,
                    }))
                  }
                  className="h-8 w-8 rounded-lg bg-white border border-gray-200 font-bold text-gray-700"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">
          Summerade ingredienser
        </h2>
        {summableIngredients.summed.length === 0 && summableIngredients.unsummed.length === 0 ? (
          <p className="text-sm text-gray-500">Inga ingredienser kunde räknas fram.</p>
        ) : (
          <>
            {summableIngredients.summed.length > 0 && (
              <div className="space-y-2">
                {summableIngredients.summed.map((ingredient) => (
                  <div
                    key={`${ingredient.name}-${ingredient.unit ?? "no-unit"}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-gray-900 font-medium">{ingredient.name}</span>
                    <span className="text-gray-500 text-sm whitespace-nowrap">
                      {formatAmount(ingredient.amount)} {ingredient.unit ?? ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {summableIngredients.unsummed.length > 0 && (
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Osummerat underlag
                </p>
                {summableIngredients.unsummed.map((ingredient, index) => (
                  <p key={`${ingredient.dayId}-${index}`} className="text-sm text-gray-600">
                    {ingredient.label}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">
          Rätter utan receptinnehåll
        </h2>
        {missingRecipeContent.length === 0 ? (
          <p className="text-sm text-gray-500">Alla valda recept har ingrediensunderlag.</p>
        ) : (
          <div className="space-y-2">
            {missingRecipeContent.map((entry) => (
              <div key={`${entry.dayId}-${entry.recipe.id}`} className="text-sm text-gray-700">
                <span className="font-semibold">{entry.recipe.name}</span>
                {entry.error ? ` - ${entry.error}` : " - saknar ingredienser"}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">
          Fritext / manuellt
        </h2>
        {freeTextDays.length === 0 ? (
          <p className="text-sm text-gray-500">Ingen fritext denna vecka.</p>
        ) : (
          <div className="space-y-2">
            {freeTextDays.map((day) => (
              <p key={day.dayId} className="text-sm text-gray-700">
                {day.text}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ShoppingList;
