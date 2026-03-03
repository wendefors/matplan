import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchRecipeFull, saveRecipeFull } from "../services/recipeContentService";

type ContentIngredient = {
  name: string;
  amount: string;
  unit: string;
  optional: boolean;
  excludeFromShopping: boolean;
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

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
              excludeFromShopping: ingredient.excludeFromShopping,
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
      {
        name: "",
        amount: "",
        unit: "",
        optional: false,
        excludeFromShopping: false,
        sortOrder: prev.length,
      },
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
          excludeFromShopping: ingredient.excludeFromShopping,
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
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col">
      <header
        className="shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur px-4 pb-3 pt-3"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 shrink-0"
          >
            Tillbaka
          </button>
          <h2 className="text-sm font-bold text-gray-900 truncate text-center">
            Receptinnehåll: {recipeName || "Recept"}
          </h2>
          <div className="w-20 shrink-0" />
        </div>
      </header>

      <main
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {isLoading && (
            <div className="rounded-2xl bg-white border border-gray-200 p-4 text-sm text-gray-500 shadow-sm">
              Laddar receptinnehåll...
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!isLoading && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
                    Ingredienser
                  </h3>
                  <button
                    type="button"
                    onClick={addIngredient}
                    className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                  >
                    Lägg till
                  </button>
                </div>
                <div className="space-y-2">
                  {ingredients.map((ingredient, index) => (
                    <div
                      key={`${index}-${ingredient.sortOrder}`}
                      className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2"
                    >
                      <input
                        value={ingredient.name}
                        onChange={(e) =>
                          setIngredients((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, name: e.target.value } : row
                            )
                          )
                        }
                        placeholder="Ingrediens"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)]">
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
                          className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
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
                          className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-xs text-gray-700 whitespace-nowrap">
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
                        <label className="flex items-center gap-2 text-xs text-gray-700 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={ingredient.excludeFromShopping}
                            onChange={(e) =>
                              setIngredients((prev) =>
                                prev.map((row, i) =>
                                  i === index
                                    ? {
                                        ...row,
                                        excludeFromShopping: e.target.checked,
                                      }
                                    : row
                                )
                              )
                            }
                          />
                          Exkludera inköp
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => moveIngredient(index, -1)}
                          className="rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700"
                        >
                          Upp
                        </button>
                        <button
                          type="button"
                          onClick={() => moveIngredient(index, 1)}
                          className="rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700"
                        >
                          Ner
                        </button>
                        <button
                          type="button"
                          onClick={() => removeIngredient(index)}
                          className="rounded-lg bg-red-50 border border-red-100 text-red-600 px-3 py-1.5 text-xs font-semibold"
                        >
                          Ta bort
                        </button>
                      </div>
                    </div>
                  ))}
                  {ingredients.length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                      Inga ingredienser ännu.
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
                    Steg
                  </h3>
                  <button
                    type="button"
                    onClick={addStep}
                    className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                  >
                    Lägg till
                  </button>
                </div>
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <div
                      key={`${index}-${step.stepOrder}`}
                      className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2"
                    >
                      <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                        Steg {index + 1}
                      </div>
                      <textarea
                        value={step.text}
                        onChange={(e) =>
                          setSteps((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, text: e.target.value } : row
                            )
                          )
                        }
                        placeholder="Beskriv steget"
                        className="w-full min-h-[88px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => moveStep(index, -1)}
                          className="rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700"
                        >
                          Upp
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStep(index, 1)}
                          className="rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700"
                        >
                          Ner
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStep(index)}
                          className="rounded-lg bg-red-50 border border-red-100 text-red-600 px-3 py-1.5 text-xs font-semibold"
                        >
                          Ta bort
                        </button>
                      </div>
                    </div>
                  ))}
                  {steps.length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                      Inga steg ännu.
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      <footer
        className="shrink-0 border-t border-gray-200 bg-white/95 backdrop-blur px-4 pb-3 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto flex w-full max-w-3xl gap-2">
          <button
            type="button"
            onClick={goBack}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700"
          >
            Tillbaka
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="flex-1 rounded-xl bg-emerald-600 text-white py-3 text-sm font-semibold disabled:opacity-60"
          >
            {isSaving ? "Sparar..." : "Spara"}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default RecipeContentEditor;
