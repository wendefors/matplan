import React, { useState, useMemo, useEffect } from "react";
import { Recipe, WeekPlan, SWEDISH_DAYS, DayPlan } from "../types";
import { generateICS } from "../services/icsService";

interface MealPlannerProps {
  recipes: Recipe[];
  plans: WeekPlan[];
  onUpdatePlans: (plans: WeekPlan[]) => void;

  // Finns kvar (t.ex. om RecipeList uppdaterar)
  onUpdateRecipes: (recipes: Recipe[]) => void;

  // NYTT: uppdatera lastCooked med "rätt" datum per recept
  onMarkCooked: (updates: { id: number; lastCooked: string }[]) => Promise<void>;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function isoWeekDayToISODate(weekIdentifier: string, dayId: number): string {
  // weekIdentifier: "2026-W02"
  const match = /^(\d{4})-W(\d{2})$/.exec(weekIdentifier);
  if (!match) {
    // fallback: idag (ska inte hända om input type="week" används)
    return new Date().toISOString().slice(0, 10);
  }

  const year = Number(match[1]);
  const week = Number(match[2]);

  // ISO week algorithm (UTC-safe)
  // Week 1 = week with Jan 4
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoDow = jan4.getUTCDay() || 7; // 1..7 (Mon..Sun)

  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4IsoDow - 1)); // Monday of week 1

  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + dayId);

  return target.toISOString().slice(0, 10); // YYYY-MM-DD
}

const MealPlanner: React.FC<MealPlannerProps> = ({
  recipes,
  plans,
  onUpdatePlans,
  onUpdateRecipes,
  onMarkCooked,
}) => {
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  });

  const [activeDayIndices, setActiveDayIndices] = useState<number[]>(ALL_DAYS);
  const [showRecipeModal, setShowRecipeModal] = useState<number | null>(null);

  // Fritext-draft i modalen
  const [freeTextDraft, setFreeTextDraft] = useState("");

  const currentPlan = useMemo(() => {
    return (
      plans.find((p) => p.weekIdentifier === selectedWeek) || {
        weekIdentifier: selectedWeek,
        days: [],
        activeDayIndices: ALL_DAYS,
      }
    );
  }, [plans, selectedWeek]);

  // När du byter vecka: läs veckans sparade "tända/släckta" (eller default ALLA)
  useEffect(() => {
    const fromPlan =
      currentPlan.activeDayIndices && currentPlan.activeDayIndices.length > 0
        ? [...currentPlan.activeDayIndices].sort((a, b) => a - b)
        : ALL_DAYS;

    setActiveDayIndices(fromPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek]);

  // Hjälpare: spara aktuell veckas activeDayIndices in i plans
  const persistActiveDaysForWeek = (newActive: number[]) => {
    const normalized = Array.from(new Set(newActive))
      .filter((n) => n >= 0 && n <= 6)
      .sort((a, b) => a - b);

    const otherPlans = plans.filter((p) => p.weekIdentifier !== selectedWeek);
    const existing = plans.find((p) => p.weekIdentifier === selectedWeek);

    const merged: WeekPlan = {
      weekIdentifier: selectedWeek,
      days: existing?.days ?? [],
      activeDayIndices: normalized,
    };

    onUpdatePlans([...otherPlans, merged]);
  };

  const toggleDay = (idx: number) => {
    setActiveDayIndices((prev) => {
      const next = prev.includes(idx)
        ? prev.filter((i) => i !== idx)
        : [...prev, idx].sort((a, b) => a - b);

      persistActiveDaysForWeek(next);
      return next;
    });
  };

  const updateDayPlan = (dayId: number, patch: Partial<DayPlan>) => {
    const existingPlanIdx = plans.findIndex((p) => p.weekIdentifier === selectedWeek);
    const newPlans = [...plans];

    if (existingPlanIdx > -1) {
      const dayIdx = newPlans[existingPlanIdx].days.findIndex((d) => d.dayId === dayId);

      if (dayIdx > -1) {
        newPlans[existingPlanIdx].days[dayIdx] = {
          ...newPlans[existingPlanIdx].days[dayIdx],
          ...patch,
          dayId,
        };
      } else {
        newPlans[existingPlanIdx].days.push({
          dayId,
          recipeId: null,
          freeText: null,
          ...patch,
        });
      }

      // Bevara aktiva dagar för veckan
      newPlans[existingPlanIdx].activeDayIndices = activeDayIndices;
    } else {
      newPlans.push({
        weekIdentifier: selectedWeek,
        days: [
          {
            dayId,
            recipeId: null,
            freeText: null,
            ...patch,
          },
        ],
        activeDayIndices: activeDayIndices,
      });
    }

    onUpdatePlans(newPlans);
  };

  const updateDayRecipe = (dayId: number, recipeId: number | null) => {
    // Välj recept → nolla fritext
    updateDayPlan(dayId, { recipeId, freeText: null });
    setShowRecipeModal(null);
    setFreeTextDraft("");
  };

  const updateDayFreeText = (dayId: number, text: string) => {
    const cleaned = text.trim();
    // Skriv fritext → nolla recipeId
    updateDayPlan(dayId, { recipeId: null, freeText: cleaned.length ? cleaned : null });
    setShowRecipeModal(null);
    setFreeTextDraft("");
  };

  /**
   * Smart weighted random picker
   */
  const pickSmartRecipe = (excludeIds: Set<number>, excludeCategories: Set<string>) => {
    if (recipes.length === 0) return null;

    const candidates = recipes.map((r) => {
      let score = 100;

      if (excludeIds.has(r.id)) score -= 95;
      if (excludeCategories.has(r.category)) score -= 80;

      if (!r.lastCooked) {
        score += 20;
      } else {
        const lastCookedDate = new Date(r.lastCooked);
        const diffDays = Math.floor(
          (Date.now() - lastCookedDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        score += Math.min(diffDays, 30);
      }

      return { recipe: r, score: Math.max(score, 1) };
    });

    candidates.sort((a, b) => b.score - a.score);

    // Ta top 20% (minst 1) så det känns "smart" men inte förutsägbart
    const topCandidates = candidates.slice(0, Math.max(1, Math.floor(candidates.length * 0.2)));
    return topCandidates[Math.floor(Math.random() * topCandidates.length)].recipe;
  };

  /**
   * Bygg veckans "upptagna" recept (för att undvika dubletter i samma vecka)
   * excludeDayId: om angivet, exkluderas inte receptet som redan ligger på just den dagen
   */
  const buildWeekExcludes = (excludeDayId?: number) => {
    const usedIds = new Set<number>();
    const usedCategories = new Set<string>();

    currentPlan.days.forEach((d) => {
      if (excludeDayId !== undefined && d.dayId === excludeDayId) return;
      if (d.recipeId == null) return;

      usedIds.add(d.recipeId);

      const r = recipes.find((x) => x.id === d.recipeId);
      if (r) usedCategories.add(r.category);
    });

    return { usedIds, usedCategories };
  };

  const randomizeAll = () => {
    if (recipes.length === 0) return;

    const { usedIds, usedCategories } = buildWeekExcludes();

    const newDayPlans: DayPlan[] = activeDayIndices.map((dayId) => {
      const selected = pickSmartRecipe(usedIds, usedCategories);
      if (selected) {
        usedIds.add(selected.id);
        usedCategories.add(selected.category);

        // Ersätt ev fritext, som du ville
        return { dayId, recipeId: selected.id, freeText: null };
      }
      return { dayId, recipeId: null, freeText: null };
    });

    // Behåll övriga dagar som inte är aktiva (om de finns i planen)
    const existingOtherDays = currentPlan.days.filter((d) => !activeDayIndices.includes(d.dayId));

    const mergedDays = [...existingOtherDays, ...newDayPlans].sort((a, b) => a.dayId - b.dayId);

    const otherPlans = plans.filter((p) => p.weekIdentifier !== selectedWeek);

    onUpdatePlans([
      ...otherPlans,
      { weekIdentifier: selectedWeek, days: mergedDays, activeDayIndices },
    ]);
  };

  const randomizeDay = (dayId: number) => {
    const { usedIds, usedCategories } = buildWeekExcludes(dayId);

    const selected = pickSmartRecipe(usedIds, usedCategories);
    if (selected) {
      // Ersätt även fritext om den fanns
      updateDayPlan(dayId, { recipeId: selected.id, freeText: null });
    }
  };

  const getDayPlan = (dayIdx: number) => currentPlan.days.find((d) => d.dayId === dayIdx);

  const handleExportAll = () => {
    const activePlans = currentPlan.days.filter((d) => {
      if (!activeDayIndices.includes(d.dayId)) return false;

      const hasRecipe = d.recipeId !== null;
      const hasText = !!(d.freeText && d.freeText.trim().length > 0);

      return hasRecipe || hasText;
    });

    if (activePlans.length === 0) return;

    // Exportera kalenderfilen (alla valda dagar) – INGEN DB-uppdatering här
    generateICS(selectedWeek, activePlans, recipes);
  };

  const handleExportDay = (dayId: number) => {
    const plan = currentPlan.days.find((d) => d.dayId === dayId);
    if (!plan) return;

    const hasRecipe = plan.recipeId !== null;
    const hasText = !!(plan.freeText && plan.freeText.trim().length > 0);
    if (!hasRecipe && !hasText) return;

    // Exportera kalenderfilen (en dag / en event)
    const dayShort = SWEDISH_DAYS[dayId].substring(0, 3);
    generateICS(selectedWeek, [plan], recipes, { fileName: `matplan-${selectedWeek}-${dayShort}` });
  };

  const handleSaveCookedAll = async () => {
    // Bygg id -> lastCooked (senaste dagen i veckan vinner om samma recept upprepas)
    const byRecipeId = new Map<number, string>();

    currentPlan.days.forEach((d) => {
      if (!activeDayIndices.includes(d.dayId)) return;
      if (d.recipeId == null) return;

      const cookDate = isoWeekDayToISODate(selectedWeek, d.dayId);
      const existing = byRecipeId.get(d.recipeId);

      // ISO YYYY-MM-DD kan jämföras som sträng
      if (!existing || cookDate > existing) {
        byRecipeId.set(d.recipeId, cookDate);
      }
    });

    const updates = Array.from(byRecipeId.entries()).map(([id, lastCooked]) => ({
      id,
      lastCooked,
    }));

    if (updates.length === 0) return;

    await onMarkCooked(updates);
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "Aldrig";
    return new Date(isoString).toLocaleDateString("sv-SE");
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Week Selector */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Välj vecka</label>
        <input
          type="week"
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-medium"
        />
      </section>

      {/* Day Checklist */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Vilka dagar planerar vi för?
        </label>
        <div className="flex flex-wrap gap-2">
          {SWEDISH_DAYS.map((day, idx) => (
            <button
              key={day}
              onClick={() => toggleDay(idx)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeDayIndices.includes(idx)
                  ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500"
                  : "bg-gray-100 text-gray-500 border border-transparent"
              }`}
            >
              {day.substring(0, 3)}
            </button>
          ))}
        </div>
      </section>

      {/* Main Controls */}
      <div className="flex gap-3">
        <button
          onClick={randomizeAll}
          className="flex-1 bg-emerald-600 text-white py-3 px-4 rounded-2xl font-bold shadow-lg shadow-emerald-200 active:scale-95 transition-transform"
        >
          Slumpa fram allt
        </button>

        {/* Export all */}
        <button
          onClick={handleExportAll}
          className="flex-none bg-gray-900 text-white p-4 rounded-2xl shadow-lg shadow-gray-200 active:scale-95 transition-transform"
          title="Exportera alla valda dagar"
        >
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
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
        </button>

        {/* Save cooked */}
        <button
          onClick={handleSaveCookedAll}
          className="flex-none bg-emerald-50 text-emerald-700 p-4 rounded-2xl shadow-sm border border-emerald-100 active:scale-95 transition-transform"
          title="Spara samtliga planerade rätter som lagade (med datum från veckan)"
        >
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
              d="M5 13l4 4L19 7"
            />
          </svg>
        </button>
      </div>

      {/* Planning List */}
      <div className="space-y-4">
        {activeDayIndices.length > 0 ? (
          activeDayIndices.map((dayIdx) => {
            const plan = currentPlan.days.find((d) => d.dayId === dayIdx);
            const recipe =
              plan?.recipeId != null ? recipes.find((r) => r.id === plan.recipeId) : null;
            const freeText = (plan?.freeText ?? "").trim();
            const hasSomething = !!recipe || freeText.length > 0;

            return (
              <div
                key={dayIdx}
                className="group bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-colors"
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-sm font-bold text-emerald-600 uppercase tracking-wider">
                    {SWEDISH_DAYS[dayIdx]}
                  </span>

                  <div className="flex gap-2">
                    {/* Exportera en dag */}
                    <button
                      onClick={() => handleExportDay(dayIdx)}
                      className="p-1.5 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-lg transition-colors disabled:opacity-40 disabled:hover:text-gray-400"
                      title="Ladda ner endast denna dag"
                      disabled={!hasSomething}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 3v10m0 0l-3-3m3 3l3-3M5 21h14"
                        />
                      </svg>
                    </button>

                    <button
                      onClick={() => randomizeDay(dayIdx)}
                      className="p-1.5 text-gray-400 hover:text-emerald-500 bg-gray-50 rounded-lg transition-colors"
                      title="Slumpa om denna dag"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    </button>

                    <button
                      onClick={() => {
                        setShowRecipeModal(dayIdx);
                        const existingFreeText = (getDayPlan(dayIdx)?.freeText ?? "").trim();
                        setFreeTextDraft(existingFreeText);
                      }}
                      className="p-1.5 text-gray-400 hover:text-emerald-500 bg-gray-50 rounded-lg transition-colors"
                      title="Välj rätt eller skriv fritext"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {recipe ? (
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 leading-tight mb-1">
                      {recipe.name}
                    </h3>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                        {recipe.category}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        Lagad: {formatDate(recipe.lastCooked)}
                      </span>
                    </div>
                  </div>
                ) : freeText.length > 0 ? (
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 leading-tight mb-1">
                      {freeText}
                    </h3>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                        Fritext
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-300 italic">Ingen rätt vald...</p>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 text-gray-400">
            Inga dagar valda för planering.
          </div>
        )}
      </div>

      {/* Recipe Selection Modal */}
      {showRecipeModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-bold">Välj en rätt eller skriv fritext</h3>
              <button
                onClick={() => {
                  setShowRecipeModal(null);
                  setFreeTextDraft("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Fritext */}
            <div className="p-4 border-b border-gray-100 space-y-3">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide">
                Fritext
              </label>
              <textarea
                value={freeTextDraft}
                onChange={(e) => setFreeTextDraft(e.target.value)}
                placeholder="Skriv valfri text..."
                className="w-full min-h-[80px] p-3 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-emerald-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => updateDayFreeText(showRecipeModal, freeTextDraft)}
                  className="flex-1 bg-gray-900 text-white py-3 rounded-2xl font-bold active:scale-95 transition-transform"
                >
                  Spara fritext
                </button>
                <button
                  onClick={() => updateDayFreeText(showRecipeModal, "")}
                  className="flex-none px-4 bg-gray-100 text-gray-700 py-3 rounded-2xl font-bold active:scale-95 transition-transform"
                  title="Rensa fritext"
                >
                  Rensa
                </button>
              </div>
            </div>

            {/* Receptlista */}
            <div className="overflow-y-auto p-4 space-y-2">
              <button
                onClick={() => updateDayRecipe(showRecipeModal, null)}
                className="w-full text-left p-4 rounded-2xl hover:bg-gray-50 transition-colors border-2 border-transparent hover:border-gray-200 text-red-500 font-semibold"
              >
                Rensa vald rätt
              </button>

              {recipes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => updateDayRecipe(showRecipeModal, r.id)}
                  className="w-full text-left p-4 rounded-2xl hover:bg-emerald-50 transition-colors border-2 border-transparent hover:border-emerald-200"
                >
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-gray-900">{r.name}</div>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase">
                      {r.category}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{r.source || "Okänd källa"}</span>
                    <span>Lagad: {formatDate(r.lastCooked)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealPlanner;