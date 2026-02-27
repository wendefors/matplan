import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchRecipeFull, saveRecipeFull } from "../services/recipeContentService";

type ContentIngredient = {
  name: string;
  amount: string;
  unit: string;
  optional: boolean;
  sortOrder: number;
};

type ContentStep = {
  text: string;
  stepOrder: number;
};

type RecipeContentEditorProps = {
  onRefreshRecipes: () => Promise<void>;
};

const RecipeContentEditor: React.FC<RecipeContentEditorProps> = ({
  onRefreshRecipes,
}) => {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const recipeId = useMemo(() => Number(params.id), [params.id]);

  const [recipeName, setRecipeName] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<ContentIngredient[]>([]);
  const [steps, setSteps] = useState<ContentStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(recipeId)) {
      setError("Ogiltigt recept-id.");
      setIsLoading(false);
      return;
    }

    let active = true;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const full = await fetchRecipeFull(recipeId);
        if (!active) return;
        setRecipeName(full.recipe.name);
        setCategory(full.recipe.category);
        setSource(full.recipe.source);
        setIngredients(
          full.ingredients
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((ingredient) => ({
              name: ingredient.name,
              amount: ingredient.amount === null ? "" : String(ingredient.amount),
              unit: ingredient.unit ?? "",
              optional: ingredient.optional,
              sortOrder: ingredient.sortOrder,
            }))
        );
        setSteps(
          full.steps
            .sort((a, b) => a.stepOrder - b.stepOrder)
            .map((step) => ({
              text: step.text,
              stepOrder: step.stepOrder,
            }))
        );
      } catch (loadError) {
        if (!active) return;
        console.error("LOAD RECIPE CONTENT FAILED:", loadError);
        setError("Kunde inte ladda receptinnehåll.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [recipeId]);

  const goBack = () => navigate("/recipes");

  const addIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { name: "", amount: "", unit: "", optional: false, sortOrder: prev.length },
    ]);
  };

  const removeIngredient = (index: number) => {
    setIngredients((prev) =>
      prev.filter((_, i) => i !== index).map((row, i) => ({ ...row, sortOrder: i }))
    );
  };

  const moveIngredient = (index: number, direction: -1 | 1) => {
    setIngredients((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy.map((row, i) => ({ ...row, sortOrder: i }));
    });
  };

  const addStep = () => {
    setSteps((prev) => [...prev, { text: "", stepOrder: prev.length + 1 }]);
  };

  const removeStep = (index: number) => {
    setSteps((prev) =>
      prev.filter((_, i) => i !== index).map((row, i) => ({ ...row, stepOrder: i + 1 }))
    );
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy.map((row, i) => ({ ...row, stepOrder: i + 1 }));
    });
  };

  const handleSave = async () => {
    if (!Number.isFinite(recipeId)) return;
    setIsSaving(true);
    setError(null);

    try {
      await saveRecipeFull({
        recipe: {
          id: recipeId,
          name: recipeName,
          category,
          source,
        },
        ingredients: ingredients.map((ingredient) => ({
          name: ingredient.name,
          amount:
            ingredient.amount.trim() === ""
              ? null
              : Number(ingredient.amount.replace(",", ".")),
          unit: ingredient.unit.trim() === "" ? null : ingredient.unit,
          optional: ingredient.optional,
        })),
        steps: steps.map((step) => ({ text: step.text })),
      });
      await onRefreshRecipes();
      goBack();
    } catch (saveError) {
      console.error("SAVE RECIPE CONTENT FAILED:", saveError);
      setError("Kunde inte spara receptinnehåll.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            className="text-sm font-semibold text-gray-600"
          >
            Tillbaka
          </button>
          <h2 className="text-base font-bold text-gray-900 truncate">
            Receptinnehåll: {recipeName || "Recept"}
          </h2>
          <div className="w-12" />
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">
        {isLoading && (
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-500">
            Laddar receptinnehåll...
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!isLoading && (
          <>
            <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">
                  Ingredienser
                </h3>
                <button
                  type="button"
                  onClick={addIngredient}
                  className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold"
                >
                  Lägg till
                </button>
              </div>
              <div className="space-y-3">
                {ingredients.map((ingredient, index) => (
                  <div key={`${index}-${ingredient.sortOrder}`} className="rounded-xl border border-gray-100 p-3 space-y-2">
                    <div className="grid gap-2 md:grid-cols-4">
                      <input
                        value={ingredient.name}
                        onChange={(e) =>
                          setIngredients((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, name: e.target.value } : row
                            )
                          )
                        }
                        placeholder="Namn"
                        className="rounded-lg border border-gray-200 p-2"
                      />
                      <input
                        value={ingredient.amount}
                        onChange={(e) =>
                          setIngredients((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, amount: e.target.value } : row
                            )
                          )
                        }
                        placeholder="Mängd"
                        className="rounded-lg border border-gray-200 p-2"
                      />
                      <input
                        value={ingredient.unit}
                        onChange={(e) =>
                          setIngredients((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, unit: e.target.value } : row
                            )
                          )
                        }
                        placeholder="Enhet"
                        className="rounded-lg border border-gray-200 p-2"
                      />
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={ingredient.optional}
                          onChange={(e) =>
                            setIngredients((prev) =>
                              prev.map((row, i) =>
                                i === index
                                  ? { ...row, optional: e.target.checked }
                                  : row
                              )
                            )
                          }
                        />
                        Valfritt
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => moveIngredient(index, -1)}
                        className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold"
                      >
                        Upp
                      </button>
                      <button
                        type="button"
                        onClick={() => moveIngredient(index, 1)}
                        className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold"
                      >
                        Ner
                      </button>
                      <button
                        type="button"
                        onClick={() => removeIngredient(index)}
                        className="rounded-lg bg-red-50 text-red-600 px-3 py-1 text-xs font-semibold"
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">
                  Steps
                </h3>
                <button
                  type="button"
                  onClick={addStep}
                  className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold"
                >
                  Lägg till
                </button>
              </div>
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div key={`${index}-${step.stepOrder}`} className="rounded-xl border border-gray-100 p-3 space-y-2">
                    <textarea
                      value={step.text}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, text: e.target.value } : row
                          )
                        )
                      }
                      placeholder="Stegtext"
                      className="w-full min-h-[90px] rounded-lg border border-gray-200 p-2"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => moveStep(index, -1)}
                        className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold"
                      >
                        Upp
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(index, 1)}
                        className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold"
                      >
                        Ner
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="rounded-lg bg-red-50 text-red-600 px-3 py-1 text-xs font-semibold"
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={goBack}
            className="flex-1 rounded-xl border border-gray-200 py-3 font-semibold text-gray-700"
          >
            Tillbaka
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="flex-1 rounded-xl bg-emerald-600 text-white py-3 font-semibold disabled:opacity-60"
          >
            {isSaving ? "Sparar..." : "Spara"}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default RecipeContentEditor;
