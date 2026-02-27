import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchRecipeFull, type RecipeFull } from "../services/recipeContentService";

function formatScaledAmount(amount: number | null, factor: number): string {
  if (amount === null) return "";
  const scaled = amount * factor;
  const rounded = Math.round(scaled * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

const RecipeViewer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const recipeId = Number(id);

  const [data, setData] = useState<RecipeFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [selectedServings, setSelectedServings] = useState(4);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!Number.isFinite(recipeId)) {
      setError("Ogiltigt recept.");
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
        setData(full);
        setCompletedSteps({});
        setSelectedServings(Math.max(1, Math.round(full.recipe.baseServings ?? 4)));
      } catch (loadError) {
        if (!active) return;
        console.error("FETCH RECIPE VIEW FAILED:", loadError);
        setError("Kunde inte ladda receptet.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [recipeId]);

  const sortedSteps = useMemo(
    () => (data?.steps ?? []).slice().sort((a, b) => a.stepOrder - b.stepOrder),
    [data]
  );

  const currentStepIndex = useMemo(
    () => sortedSteps.findIndex((_, index) => !completedSteps[index]),
    [sortedSteps, completedSteps]
  );

  const baseServings = Math.max(1, Math.round(data?.recipe.baseServings ?? 4));
  const servingFactor = selectedServings / baseServings;

  const goBack = () => {
    const state = location.state as { from?: string } | null;
    if (state?.from) {
      navigate(state.from);
      return;
    }
    navigate(-1);
  };

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 shrink-0"
          >
            Tillbaka
          </button>
          <h1 className="text-xl font-bold text-gray-900 truncate">
            {data?.recipe.name ?? "Laddar recept..."}
          </h1>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {selectedServings} portioner (grund: {baseServings})
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedServings((prev) => Math.max(1, prev - 1))}
              className="h-8 w-8 rounded-lg border border-gray-200 text-lg font-bold text-gray-700"
              aria-label="Minska portioner"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => setSelectedServings((prev) => prev + 1)}
              className="h-8 w-8 rounded-lg border border-gray-200 text-lg font-bold text-gray-700"
              aria-label="Öka portioner"
            >
              +
            </button>
          </div>
        </div>
        <p className="sr-only">Portionsfaktor {servingFactor}</p>
      </header>

      <main className="flex-1 min-h-0 p-4">
        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-2 gap-4 [@media(orientation:landscape)]:grid-cols-2 [@media(orientation:landscape)]:grid-rows-1">
          <section
            className="min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">
              Ingredienser
            </h2>
            {isLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-6 rounded bg-gray-100" />
                <div className="h-6 rounded bg-gray-100" />
                <div className="h-6 rounded bg-gray-100" />
                <div className="h-6 rounded bg-gray-100" />
              </div>
            ) : error ? (
              <p className="text-base text-red-600">{error}</p>
            ) : data && data.ingredients.length > 0 ? (
              <ul className="space-y-3">
                {data.ingredients
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((ingredient) => (
                    <li
                      key={ingredient.id ?? `${ingredient.sortOrder}-${ingredient.name}`}
                      className="text-2xl leading-tight text-gray-800"
                    >
                      {ingredient.amount !== null
                        ? `${formatScaledAmount(ingredient.amount, servingFactor)} `
                        : ""}
                      {ingredient.unit ? `${ingredient.unit} ` : ""}
                      {ingredient.name}
                      {ingredient.optional ? " (valfritt)" : ""}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-lg text-gray-500">Inga ingredienser.</p>
            )}
          </section>

          <section
            className="min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">
              Steg
            </h2>
            {isLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-14 rounded bg-gray-100" />
                <div className="h-14 rounded bg-gray-100" />
                <div className="h-14 rounded bg-gray-100" />
              </div>
            ) : error ? (
              <p className="text-base text-red-600">{error}</p>
            ) : sortedSteps.length > 0 ? (
              <ol className="space-y-3">
                {sortedSteps.map((step, index) => {
                  const isCompleted = !!completedSteps[index];
                  const isCurrent = currentStepIndex === index;
                  return (
                    <li
                      key={step.id ?? `${step.stepOrder}-${step.text}`}
                      className={`rounded-xl border p-3 transition-colors ${
                        isCurrent
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-gray-100 bg-white"
                      }`}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isCompleted}
                          onChange={(event) =>
                            setCompletedSteps((prev) => ({
                              ...prev,
                              [index]: event.target.checked,
                            }))
                          }
                          className="mt-1 h-5 w-5"
                        />
                        <span
                          className={`text-2xl leading-tight ${
                            isCompleted ? "line-through text-gray-400" : "text-gray-800"
                          }`}
                        >
                          {step.text}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-lg text-gray-500">Inga steg.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default RecipeViewer;
