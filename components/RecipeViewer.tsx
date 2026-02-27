import React, { useEffect, useState } from "react";
import {
  fetchRecipeFull,
  type RecipeFull,
} from "../services/recipeContentService";

interface RecipeViewerProps {
  recipeId: number;
  onClose: () => void;
  onStartCooking: (recipeId: number) => void;
}

const RecipeViewer: React.FC<RecipeViewerProps> = ({
  recipeId,
  onClose,
  onStartCooking,
}) => {
  const [data, setData] = useState<RecipeFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const run = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const full = await fetchRecipeFull(recipeId);
        if (!isActive) return;
        setData(full);
      } catch (err) {
        if (!isActive) return;
        console.error("FETCH RECIPE VIEW FAILED:", err);
        setError("Kunde inte ladda receptet.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    run();

    return () => {
      isActive = false;
    };
  }, [recipeId]);

  return (
    <div
      className="h-[100dvh] overflow-hidden bg-white flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-gray-900 truncate">
            {data?.recipe.name ?? "Recept"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700"
          >
            Stäng
          </button>
        </div>
      </header>

      <main
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-5"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {isLoading && (
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-500">
            Laddar recept...
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!isLoading && !error && data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:h-full md:min-h-0">
            <section
              className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm md:overflow-y-auto md:overscroll-contain md:min-h-0"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                Ingredienser
              </h3>
              {data.ingredients.length > 0 ? (
                <ul className="space-y-2">
                  {data.ingredients.map((ingredient) => (
                    <li
                      key={ingredient.id ?? `${ingredient.sortOrder}-${ingredient.name}`}
                      className="text-sm text-gray-800"
                    >
                      {ingredient.amount !== null ? `${ingredient.amount} ` : ""}
                      {ingredient.unit ? `${ingredient.unit} ` : ""}
                      {ingredient.name}
                      {ingredient.optional ? " (valfritt)" : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Inga ingredienser.</p>
              )}
            </section>

            <section
              className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm md:overflow-y-auto md:overscroll-contain md:min-h-0"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                Steg
              </h3>
              {data.steps.length > 0 ? (
                <ol className="space-y-3 list-decimal list-inside">
                  {data.steps.map((step) => (
                    <li
                      key={step.id ?? `${step.stepOrder ?? step.stepNo}-${step.text}`}
                      className="text-sm text-gray-800"
                    >
                      {step.text}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-gray-500">Inga steg.</p>
              )}
            </section>
          </div>
        )}
      </main>

      <div className="bg-white border-t border-gray-100 p-3 z-20">
        <button
          type="button"
          onClick={() => onStartCooking(recipeId)}
          disabled={isLoading || !!error}
          className="w-full rounded-xl bg-emerald-600 text-white font-semibold py-3 disabled:opacity-50"
        >
          Start cooking
        </button>
      </div>
    </div>
  );
};

export default RecipeViewer;
