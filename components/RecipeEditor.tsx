import React, { useEffect, useState } from "react";
import type {
  RecipeSnapshot as RecipeEditorSnapshot,
  RecipeSnapshotIngredient as RecipeEditorIngredient,
  RecipeSnapshotRecipe as RecipeEditorRecipe,
  RecipeSnapshotStep as RecipeEditorStep,
} from "../services/recipeContentService";
import { saveRecipeFull } from "../services/recipeContentService";

type RecipeEditorProps = {
  recipe: RecipeEditorRecipe;
  ingredients: RecipeEditorIngredient[];
  steps: RecipeEditorStep[];
  onSave: (snapshot: RecipeEditorSnapshot) => void | Promise<void>;
};

function normalizeIngredients(
  ingredients: RecipeEditorIngredient[]
): RecipeEditorIngredient[] {
  return [...ingredients]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((ingredient, index) => ({ ...ingredient, sort_order: index + 1 }));
}

function normalizeSteps(steps: RecipeEditorStep[]): RecipeEditorStep[] {
  return [...steps]
    .sort((a, b) => a.step_order - b.step_order)
    .map((step, index) => ({ ...step, step_order: index + 1 }));
}

const RecipeEditor: React.FC<RecipeEditorProps> = ({
  recipe,
  ingredients,
  steps,
  onSave,
}) => {
  const [editorState, setEditorState] = useState<RecipeEditorSnapshot>({
    recipe: { ...recipe },
    ingredients: normalizeIngredients(ingredients),
    steps: normalizeSteps(steps),
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setEditorState({
      recipe: { ...recipe },
      ingredients: normalizeIngredients(ingredients),
      steps: normalizeSteps(steps),
    });
  }, [recipe, ingredients, steps]);

  const updateRecipeField = (
    field: keyof Pick<RecipeEditorRecipe, "name" | "category" | "source">,
    value: string
  ) => {
    setEditorState((prev) => ({
      ...prev,
      recipe: {
        ...prev.recipe,
        [field]: field === "source" && value.trim() === "" ? null : value,
      },
    }));
  };

  const updateIngredientField = (
    index: number,
    field: keyof Omit<RecipeEditorIngredient, "sort_order" | "id">,
    value: string | boolean
  ) => {
    setEditorState((prev) => {
      const updated = prev.ingredients.map((ingredient, i) =>
        i === index ? { ...ingredient, [field]: value } : ingredient
      );
      return { ...prev, ingredients: updated };
    });
  };

  const addIngredient = () => {
    setEditorState((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        {
          name: "",
          amount: "",
          unit: "",
          optional: false,
          sort_order: prev.ingredients.length + 1,
        },
      ],
    }));
  };

  const removeIngredient = (index: number) => {
    setEditorState((prev) => {
      const nextIngredients = prev.ingredients.filter((_, i) => i !== index);
      return {
        ...prev,
        ingredients: normalizeIngredients(nextIngredients),
      };
    });
  };

  const moveIngredient = (index: number, direction: -1 | 1) => {
    setEditorState((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.ingredients.length) return prev;
      const nextIngredients = [...prev.ingredients];
      [nextIngredients[index], nextIngredients[nextIndex]] = [
        nextIngredients[nextIndex],
        nextIngredients[index],
      ];
      return {
        ...prev,
        ingredients: normalizeIngredients(nextIngredients),
      };
    });
  };

  const updateStepField = (index: number, value: string) => {
    setEditorState((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) =>
        i === index ? { ...step, text: value } : step
      ),
    }));
  };

  const addStep = () => {
    setEditorState((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          text: "",
          step_order: prev.steps.length + 1,
        },
      ],
    }));
  };

  const removeStep = (index: number) => {
    setEditorState((prev) => {
      const nextSteps = prev.steps.filter((_, i) => i !== index);
      return {
        ...prev,
        steps: normalizeSteps(nextSteps),
      };
    });
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setEditorState((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.steps.length) return prev;
      const nextSteps = [...prev.steps];
      [nextSteps[index], nextSteps[nextIndex]] = [
        nextSteps[nextIndex],
        nextSteps[index],
      ];
      return {
        ...prev,
        steps: normalizeSteps(nextSteps),
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);

    const snapshotToSave: RecipeEditorSnapshot = {
      recipe: { ...editorState.recipe },
      ingredients: normalizeIngredients(editorState.ingredients),
      steps: normalizeSteps(editorState.steps),
    };

    try {
      const saved = await saveRecipeFull({
        recipe: {
          id: snapshotToSave.recipe.id,
          name: snapshotToSave.recipe.name,
          category: snapshotToSave.recipe.category,
          source: snapshotToSave.recipe.source,
        },
        ingredients: snapshotToSave.ingredients.map((ingredient) => ({
          name: ingredient.name,
          amount:
            ingredient.amount.trim() === ""
              ? null
              : Number(ingredient.amount.replace(",", ".")),
          unit: ingredient.unit.trim() === "" ? null : ingredient.unit,
          optional: ingredient.optional,
        })),
        steps: snapshotToSave.steps.map((step) => ({ text: step.text })),
      });

      const updatedSnapshot: RecipeEditorSnapshot = {
        recipe: {
          id: saved.recipe.id,
          name: saved.recipe.name,
          category: saved.recipe.category,
          source: saved.recipe.source,
        },
        ingredients: saved.ingredients.map((ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          amount: ingredient.amount === null ? "" : String(ingredient.amount),
          unit: ingredient.unit ?? "",
          optional: ingredient.optional,
          sort_order: ingredient.sortOrder,
        })),
        steps: saved.steps.map((step) => ({
          id: step.id,
          text: step.text,
          step_order: step.stepNo,
        })),
      };

      setEditorState(updatedSnapshot);
      await Promise.resolve(onSave(updatedSnapshot));
    } catch (error) {
      console.error("SAVE RECIPE FULL FAILED:", error);
      setSaveError("Kunde inte spara receptet.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recipe</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            type="text"
            value={editorState.recipe.name}
            onChange={(e) => updateRecipeField("name", e.target.value)}
            placeholder="Name"
            className="rounded border p-2"
          />
          <input
            type="text"
            value={editorState.recipe.category}
            onChange={(e) => updateRecipeField("category", e.target.value)}
            placeholder="Category"
            className="rounded border p-2"
          />
          <input
            type="text"
            value={editorState.recipe.source ?? ""}
            onChange={(e) => updateRecipeField("source", e.target.value)}
            placeholder="Source"
            className="rounded border p-2"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ingredients</h2>
          <button
            type="button"
            onClick={addIngredient}
            className="rounded border px-3 py-1"
          >
            Add ingredient
          </button>
        </div>
        <div className="space-y-3">
          {editorState.ingredients.map((ingredient, index) => (
            <div key={`${ingredient.id ?? "new"}-${index}`} className="rounded border p-3">
              <div className="grid gap-2 md:grid-cols-5">
                <input
                  type="text"
                  value={ingredient.name}
                  onChange={(e) =>
                    updateIngredientField(index, "name", e.target.value)
                  }
                  placeholder="Name"
                  className="rounded border p-2"
                />
                <input
                  type="text"
                  value={ingredient.amount}
                  onChange={(e) =>
                    updateIngredientField(index, "amount", e.target.value)
                  }
                  placeholder="Amount"
                  className="rounded border p-2"
                />
                <input
                  type="text"
                  value={ingredient.unit}
                  onChange={(e) =>
                    updateIngredientField(index, "unit", e.target.value)
                  }
                  placeholder="Unit"
                  className="rounded border p-2"
                />
                <label className="flex items-center gap-2 rounded border p-2">
                  <input
                    type="checkbox"
                    checked={ingredient.optional}
                    onChange={(e) =>
                      updateIngredientField(index, "optional", e.target.checked)
                    }
                  />
                  Optional
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => moveIngredient(index, -1)}
                    className="rounded border px-2 py-1"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveIngredient(index, 1)}
                    className="rounded border px-2 py-1"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() => removeIngredient(index)}
                    className="rounded border px-2 py-1"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Steps</h2>
          <button
            type="button"
            onClick={addStep}
            className="rounded border px-3 py-1"
          >
            Add step
          </button>
        </div>
        <div className="space-y-3">
          {editorState.steps.map((step, index) => (
            <div key={`${step.id ?? "new"}-${index}`} className="rounded border p-3">
              <div className="flex flex-col gap-2 md:flex-row">
                <textarea
                  value={step.text}
                  onChange={(e) => updateStepField(index, e.target.value)}
                  placeholder="Step text"
                  className="min-h-[80px] flex-1 rounded border p-2"
                />
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => moveStep(index, -1)}
                    className="rounded border px-2 py-1"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(index, 1)}
                    className="rounded border px-2 py-1"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    className="rounded border px-2 py-1"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div>
        {saveError && <p className="mb-2 text-sm text-red-600">{saveError}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded bg-emerald-600 px-4 py-2 text-white"
        >
          {isSaving ? "Saving..." : "Save recipe snapshot"}
        </button>
      </div>
    </div>
  );
};

export default RecipeEditor;
