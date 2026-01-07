
import React, { useState, useMemo, useEffect } from 'react';
import { Recipe, WeekPlan, SWEDISH_DAYS, DayPlan } from '../types';
import { generateICS } from '../services/icsService';
import { getActiveDayIndices, saveActiveDayIndices } from '../services/storageService';

interface MealPlannerProps {
  recipes: Recipe[];
  plans: WeekPlan[];
  onUpdatePlans: (plans: WeekPlan[]) => void;
  onUpdateRecipes: (recipes: Recipe[]) => void;
}

const MealPlanner: React.FC<MealPlannerProps> = ({ recipes, plans, onUpdatePlans, onUpdateRecipes }) => {
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  });

  const [activeDayIndices, setActiveDayIndices] = useState<number[]>(getActiveDayIndices());
  const [showRecipeModal, setShowRecipeModal] = useState<number | null>(null);

  useEffect(() => {
    saveActiveDayIndices(activeDayIndices);
  }, [activeDayIndices]);

  const currentPlan = useMemo(() => {
    return plans.find(p => p.weekIdentifier === selectedWeek) || { weekIdentifier: selectedWeek, days: [] };
  }, [plans, selectedWeek]);

  const toggleDay = (idx: number) => {
    setActiveDayIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx].sort()
    );
  };

  const updateDayRecipe = (dayId: number, recipeId: number | null) => {
    const existingPlanIdx = plans.findIndex(p => p.weekIdentifier === selectedWeek);
    let newPlans = [...plans];

    if (existingPlanIdx > -1) {
      const dayIdx = newPlans[existingPlanIdx].days.findIndex(d => d.dayId === dayId);
      if (dayIdx > -1) {
        newPlans[existingPlanIdx].days[dayIdx].recipeId = recipeId;
      } else {
        newPlans[existingPlanIdx].days.push({ dayId, recipeId });
      }
    } else {
      newPlans.push({
        weekIdentifier: selectedWeek,
        days: [{ dayId, recipeId }]
      });
    }
    onUpdatePlans(newPlans);
    setShowRecipeModal(null);
  };

  /**
   * Smart weighted random picker
   */
  const pickSmartRecipe = (excludeIds: Set<number>, excludeCategories: Set<string>) => {
    if (recipes.length === 0) return null;

    // Calculate scores for all candidates
    const candidates = recipes.map(r => {
      let score = 100;

      // Penalty for already used ID in this specific week generation
      if (excludeIds.has(r.id)) score -= 95;

      // Heavy penalty for already used Category this week
      if (excludeCategories.has(r.category)) score -= 80;

      // Freshness bonus: Recept som inte lagats på länge (eller aldrig) premieras
      if (!r.lastCooked) {
        score += 20; // Never cooked is good!
      } else {
        const lastCookedDate = new Date(r.lastCooked);
        const diffDays = Math.floor((Date.now() - lastCookedDate.getTime()) / (1000 * 60 * 60 * 24));
        // Bonus points for every day since last cook, max 30 points
        score += Math.min(diffDays, 30);
      }

      return { recipe: r, score: Math.max(score, 1) };
    });

    // Sort by score and pick from top 3 to keep it interesting but "smart"
    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, Math.max(1, Math.floor(candidates.length * 0.2)));
    return topCandidates[Math.floor(Math.random() * topCandidates.length)].recipe;
  };

  const randomizeAll = () => {
    if (recipes.length === 0) return;
    
    const usedIds = new Set<number>();
    const usedCategories = new Set<string>();
    
    const newDayPlans: DayPlan[] = activeDayIndices.map(dayId => {
      const selected = pickSmartRecipe(usedIds, usedCategories);
      if (selected) {
        usedIds.add(selected.id);
        usedCategories.add(selected.category);
        return { dayId, recipeId: selected.id };
      }
      return { dayId, recipeId: null };
    });

    const otherPlans = plans.filter(p => p.weekIdentifier !== selectedWeek);
    onUpdatePlans([...otherPlans, { weekIdentifier: selectedWeek, days: newDayPlans }]);
  };

  const randomizeDay = (dayId: number) => {
    const selected = pickSmartRecipe(new Set(), new Set());
    if (selected) updateDayRecipe(dayId, selected.id);
  };

  const handleExport = () => {
    const activePlans = currentPlan.days.filter(d => activeDayIndices.includes(d.dayId) && d.recipeId !== null);
    if (activePlans.length === 0) return;

    // 1. Generate the file
    generateICS(selectedWeek, activePlans, recipes);

    // 2. Automatically update "Last Cooked" for these recipes
    const todayISO = new Date().toISOString();
    const recipeIdsInExport = new Set(activePlans.map(p => p.recipeId));
    
    const updatedRecipes = recipes.map(r => 
      recipeIdsInExport.has(r.id) ? { ...r, lastCooked: todayISO } : r
    );
    
    onUpdateRecipes(updatedRecipes);
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Aldrig';
    return new Date(isoString).toLocaleDateString('sv-SE');
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
        <label className="block text-sm font-semibold text-gray-700 mb-3">Vilka dagar planerar vi för?</label>
        <div className="flex flex-wrap gap-2">
          {SWEDISH_DAYS.map((day, idx) => (
            <button
              key={day}
              onClick={() => toggleDay(idx)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeDayIndices.includes(idx) 
                ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500' 
                : 'bg-gray-100 text-gray-500 border border-transparent'
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
        <button 
          onClick={handleExport}
          className="flex-none bg-gray-900 text-white p-4 rounded-2xl shadow-lg shadow-gray-200 active:scale-95 transition-transform"
          title="Exportera till kalender"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
        </button>
      </div>

      {/* Planning List */}
      <div className="space-y-4">
        {activeDayIndices.length > 0 ? activeDayIndices.map(dayIdx => {
          const plan = currentPlan.days.find(d => d.dayId === dayIdx);
          const recipe = recipes.find(r => r.id === plan?.recipeId);

          return (
            <div key={dayIdx} className="group bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-bold text-emerald-600 uppercase tracking-wider">{SWEDISH_DAYS[dayIdx]}</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => randomizeDay(dayIdx)}
                    className="p-1.5 text-gray-400 hover:text-emerald-500 bg-gray-50 rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => setShowRecipeModal(dayIdx)}
                    className="p-1.5 text-gray-400 hover:text-emerald-500 bg-gray-50 rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {recipe ? (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight mb-1">{recipe.name}</h3>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                      {recipe.category}
                    </span>
                    <span className="text-[10px] text-gray-400">Lagad: {formatDate(recipe.lastCooked)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-300 italic">Ingen rätt vald...</p>
              )}
            </div>
          );
        }) : (
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
              <h3 className="text-xl font-bold">Välj en rätt</h3>
              <button onClick={() => setShowRecipeModal(null)} className="text-gray-400 hover:text-gray-600">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              <button 
                onClick={() => updateDayRecipe(showRecipeModal, null)}
                className="w-full text-left p-4 rounded-2xl hover:bg-gray-50 transition-colors border-2 border-transparent hover:border-gray-200 text-red-500 font-semibold"
              >
                Rensa vald rätt
              </button>
              {recipes.map(r => (
                <button 
                  key={r.id}
                  onClick={() => updateDayRecipe(showRecipeModal, r.id)}
                  className="w-full text-left p-4 rounded-2xl hover:bg-emerald-50 transition-colors border-2 border-transparent hover:border-emerald-200"
                >
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-gray-900">{r.name}</div>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase">{r.category}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{r.source || 'Okänd källa'}</span>
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
