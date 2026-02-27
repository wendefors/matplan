import React, { useEffect, useState } from "react";
import { RECIPE_CATEGORIES, Recipe, RecipeCategory } from "../types";

type RecipeMetaEditorProps = {
  recipe: Recipe;
  onClose: () => void;
  onSave: (recipe: Recipe) => Promise<void> | void;
  onEditContent: (recipeId: number) => void;
  onViewRecipe: (recipeId: number) => void;
};

const RecipeMetaEditor: React.FC<RecipeMetaEditorProps> = ({
  recipe,
  onClose,
  onSave,
  onEditContent,
  onViewRecipe,
}) => {
  const [name, setName] = useState(recipe.name);
  const [category, setCategory] = useState(recipe.category);
  const [source, setSource] = useState(recipe.source ?? "");
  const [baseServingsInput, setBaseServingsInput] = useState(
    String(recipe.baseServings ?? 4)
  );
  const [hasRecipeContent, setHasRecipeContent] = useState(recipe.hasRecipeContent);
  const [lastCooked, setLastCooked] = useState<string | null>(recipe.lastCooked);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(recipe.name);
    setCategory(recipe.category);
    setSource(recipe.source ?? "");
    setBaseServingsInput(String(recipe.baseServings ?? 4));
    setHasRecipeContent(recipe.hasRecipeContent);
    setLastCooked(recipe.lastCooked);
    setError(null);
  }, [recipe]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Namn är obligatoriskt.");
      return;
    }
    const parsedBaseServings = Number(baseServingsInput);
    if (!Number.isInteger(parsedBaseServings) || parsedBaseServings < 1) {
      setError("Portioner måste vara ett heltal minst 1.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await Promise.resolve(
        onSave({
          ...recipe,
          name: name.trim(),
          category: category.trim() || "Annat",
          source: source.trim() || null,
          baseServings: parsedBaseServings,
          hasRecipeContent,
          lastCooked,
        })
      );
    } catch (saveError) {
      console.error("SAVE RECIPE META FAILED:", saveError);
      setError("Kunde inte spara metadata.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 space-y-4 animate-fadeIn"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-emerald-900">
          Ändra rätt: {recipe.name}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold text-emerald-700"
        >
          Stäng
        </button>
      </div>

      <div>
        <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">
          Namn
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
          placeholder="T.ex. Lasagne"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">
          Kategori
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as RecipeCategory)}
          className="w-full p-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
        >
          {RECIPE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">
          Källa
        </label>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="w-full p-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
          placeholder="T.ex. ICA.se"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">
          Portioner
        </label>
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={baseServingsInput}
          onChange={(e) => setBaseServingsInput(e.target.value)}
          className="w-full p-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
          placeholder="4"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-emerald-800 font-medium">
        <input
          type="checkbox"
          checked={hasRecipeContent}
          onChange={(e) => setHasRecipeContent(e.target.checked)}
        />
        Har receptinnehåll
      </label>

      {lastCooked && (
        <button
          type="button"
          onClick={() => setLastCooked(null)}
          className="text-xs bg-white border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg font-semibold"
        >
          Nollställ senast lagad
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold disabled:opacity-60"
        >
          {isSaving ? "Sparar..." : "Spara metadata"}
        </button>

        <button
          type="button"
          onClick={() => onEditContent(recipe.id)}
          className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold"
        >
          Redigera receptinnehåll
        </button>

        <button
          type="button"
          onClick={() => onViewRecipe(recipe.id)}
          className="w-full bg-white border border-emerald-200 text-emerald-700 py-3 rounded-xl font-bold"
        >
          Visa recept
        </button>
      </div>
    </form>
  );
};

export default RecipeMetaEditor;
