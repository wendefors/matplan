import { supabase } from "../supabaseClient";

export type RecipeSnapshotRecipe = {
  id: number;
  name: string;
  category: string;
  source: string | null;
};

export type RecipeSnapshotIngredient = {
  id?: string | number;
  name: string;
  amount: string;
  unit: string;
  optional: boolean;
  sort_order: number;
};

export type RecipeSnapshotStep = {
  id?: string | number;
  text: string;
  step_order: number;
};

export type RecipeSnapshot = {
  recipe: RecipeSnapshotRecipe;
  ingredients: RecipeSnapshotIngredient[];
  steps: RecipeSnapshotStep[];
};

export type RecipeFullRecipe = {
  id: number;
  name: string;
  category: string;
  source: string | null;
  hasRecipeContent?: boolean;
  lastCooked?: string | null;
};

export type RecipeFullIngredientInput = {
  name: string;
  amount: number | string | null;
  unit: string | null;
  optional: boolean;
};

export type RecipeFullStepInput = {
  text: string;
};

export type SaveRecipeFullInput = {
  recipe: RecipeFullRecipe;
  ingredients: RecipeFullIngredientInput[];
  steps: RecipeFullStepInput[];
};

export type RecipeFullIngredient = {
  id?: string | number;
  recipeId: number;
  userId?: string;
  name: string;
  amount: number | null;
  unit: string | null;
  optional: boolean;
  sortOrder: number;
};

export type RecipeFullStep = {
  id?: string | number;
  recipeId: number;
  userId?: string;
  text: string;
  stepOrder: number;
  stepNo?: number;
};

export type RecipeFull = {
  recipe: RecipeFullRecipe;
  ingredients: RecipeFullIngredient[];
  steps: RecipeFullStep[];
};

type DbIngredientRow = {
  id: string;
  user_id: string;
  recipe_id: number;
  name: string;
  amount: number | null;
  unit: string | null;
  optional: boolean;
  sort_order: number;
};

type DbStepRow = {
  id: string;
  user_id: string;
  recipe_id: number;
  text: string;
  step_order: number;
};

type DbRecipeFullRow = {
  id: number;
  user_id: string;
  name: string;
  category: string | null;
  source: string | null;
  has_recipe_content: boolean;
  last_cooked: string | null;
};

type DbRecipeIngredientRow = {
  id: string;
  recipe_id: number;
  user_id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  optional: boolean;
  sort_order: number;
};

type DbRecipeStepRow = {
  id: string;
  recipe_id: number;
  user_id: string;
  text: string;
  step_order: number;
};

function buildSupabaseErrorMessage(action: string, error: { message: string }) {
  return `Failed to ${action}: ${error.message}`;
}

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(buildSupabaseErrorMessage("read current user", error));
  }
  if (!data.user) {
    throw new Error("No authenticated user");
  }
  return data.user.id;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = normalizeText(value);
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAmount(
  value: number | string | null,
  rowIndex: number
): number | null {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ingredient amount at index ${rowIndex}`);
  }
  return parsed;
}

function normalizeRecipeFullInput(input: SaveRecipeFullInput): RecipeFull {
  const recipeName = normalizeText(input.recipe.name);
  const recipeCategory = normalizeText(input.recipe.category);

  if (!recipeName) {
    throw new Error("Recipe name is required");
  }
  if (!recipeCategory) {
    throw new Error("Recipe category is required");
  }

  const normalizedIngredients = input.ingredients
    .map((ingredient, index) => {
      const name = normalizeText(ingredient.name);
      const unit = normalizeNullableText(ingredient.unit);
      const amount = normalizeAmount(ingredient.amount, index);
      const optional = !!ingredient.optional;
      const isEmpty = !name && amount === null && !unit;
      if (isEmpty) return null;

      return {
        recipeId: input.recipe.id,
        name,
        amount,
        unit,
        optional,
        sortOrder: 0,
      } as RecipeFullIngredient;
    })
    .filter((row): row is RecipeFullIngredient => row !== null)
    .map((row, index) => ({
      ...row,
      sortOrder: index,
    }));

  const normalizedSteps = input.steps
    .map((step) => normalizeText(step.text))
    .filter((text) => text.length > 0)
    .map((text, index) => ({
      recipeId: input.recipe.id,
      text,
      stepOrder: index + 1,
    }));

  return {
    recipe: {
      id: input.recipe.id,
      name: recipeName,
      category: recipeCategory,
      source: normalizeNullableText(input.recipe.source),
      hasRecipeContent:
        input.recipe.hasRecipeContent ?? normalizedSteps.length > 0,
      lastCooked: input.recipe.lastCooked ?? null,
    },
    ingredients: normalizedIngredients,
    steps: normalizedSteps,
  };
}

function normalizeIngredients(
  ingredients: RecipeSnapshotIngredient[]
): RecipeSnapshotIngredient[] {
  return [...ingredients]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((ingredient, index) => ({
      ...ingredient,
      sort_order: index + 1,
    }));
}

function normalizeSteps(steps: RecipeSnapshotStep[]): RecipeSnapshotStep[] {
  return [...steps]
    .sort((a, b) => a.step_order - b.step_order)
    .map((step, index) => ({
      ...step,
      step_order: index + 1,
    }));
}

export async function fetchRecipeSnapshot(
  recipe: RecipeSnapshotRecipe
): Promise<RecipeSnapshot> {
  const userId = await getCurrentUserId();

  const { data: ingredientData, error: ingredientError } = await supabase
    .from("recipe_ingredients")
    .select("id,user_id,recipe_id,name,amount,unit,optional,sort_order")
    .eq("recipe_id", recipe.id)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (ingredientError) throw ingredientError;

  const { data: stepData, error: stepError } = await supabase
    .from("recipe_steps")
    .select("id,user_id,recipe_id,text,step_order")
    .eq("recipe_id", recipe.id)
    .eq("user_id", userId)
    .order("step_order", { ascending: true });
  if (stepError) throw stepError;

  return {
    recipe: { ...recipe },
    ingredients: normalizeIngredients(
      ((ingredientData ?? []) as DbIngredientRow[]).map((row) => ({
        id: row.id,
        name: row.name ?? "",
        amount: row.amount === null ? "" : String(row.amount),
        unit: row.unit ?? "",
        optional: !!row.optional,
        sort_order: row.sort_order,
      }))
    ),
    steps: normalizeSteps(
      ((stepData ?? []) as DbStepRow[]).map((row) => ({
        id: row.id,
        text: row.text ?? "",
        step_order: row.step_order,
      }))
    ),
  };
}

export async function saveRecipeSnapshot(
  snapshot: RecipeSnapshot
): Promise<RecipeSnapshot> {
  const userId = await getCurrentUserId();
  const normalizedIngredients = normalizeIngredients(snapshot.ingredients);
  const normalizedSteps = normalizeSteps(snapshot.steps);

  const { error: recipeUpdateError } = await supabase
    .from("recipes")
    .update({
      name: snapshot.recipe.name,
      category: snapshot.recipe.category,
      source: snapshot.recipe.source,
    })
    .eq("id", snapshot.recipe.id)
    .eq("user_id", userId);
  if (recipeUpdateError) throw recipeUpdateError;

  const { error: ingredientDeleteError } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", snapshot.recipe.id)
    .eq("user_id", userId);
  if (ingredientDeleteError) throw ingredientDeleteError;

  if (normalizedIngredients.length > 0) {
    const ingredientRows = normalizedIngredients.map((ingredient) => ({
      recipe_id: snapshot.recipe.id,
      user_id: userId,
      name: ingredient.name,
      amount:
        ingredient.amount.trim() === ""
          ? null
          : Number(ingredient.amount.replace(",", ".")),
      unit: ingredient.unit.trim() === "" ? null : ingredient.unit.trim(),
      optional: ingredient.optional,
      sort_order: ingredient.sort_order,
    }));

    const { error: ingredientInsertError } = await supabase
      .from("recipe_ingredients")
      .insert(ingredientRows);
    if (ingredientInsertError) throw ingredientInsertError;
  }

  const { error: stepDeleteError } = await supabase
    .from("recipe_steps")
    .delete()
    .eq("recipe_id", snapshot.recipe.id)
    .eq("user_id", userId);
  if (stepDeleteError) throw stepDeleteError;

  if (normalizedSteps.length > 0) {
    const stepRows = normalizedSteps.map((step) => ({
      recipe_id: snapshot.recipe.id,
      user_id: userId,
      text: step.text,
      step_order: step.step_order,
    }));

    const { error: stepInsertError } = await supabase
      .from("recipe_steps")
      .insert(stepRows);
    if (stepInsertError) throw stepInsertError;
  }

  return {
    recipe: {
      ...snapshot.recipe,
    },
    ingredients: normalizedIngredients,
    steps: normalizedSteps,
  };
}

export async function saveRecipeFull(
  input: SaveRecipeFullInput
): Promise<RecipeFull> {
  const userId = await getCurrentUserId();
  const normalized = normalizeRecipeFullInput(input);

  const recipePayload = {
    id: normalized.recipe.id,
    user_id: userId,
    name: normalized.recipe.name,
    category: normalized.recipe.category,
    source: normalized.recipe.source,
    has_recipe_content: !!normalized.recipe.hasRecipeContent,
    last_cooked: normalized.recipe.lastCooked ?? null,
  };

  const { error: recipeError } = await supabase
    .from("recipes")
    .upsert(recipePayload, { onConflict: "id" });
  if (recipeError) {
    throw new Error(buildSupabaseErrorMessage("upsert recipe", recipeError));
  }

  const { error: ingredientDeleteError } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", normalized.recipe.id)
    .eq("user_id", userId);
  if (ingredientDeleteError) {
    throw new Error(
      buildSupabaseErrorMessage(
        "delete existing recipe ingredients",
        ingredientDeleteError
      )
    );
  }

  const { error: stepDeleteError } = await supabase
    .from("recipe_steps")
    .delete()
    .eq("recipe_id", normalized.recipe.id)
    .eq("user_id", userId);
  if (stepDeleteError) {
    throw new Error(
      buildSupabaseErrorMessage("delete existing recipe steps", stepDeleteError)
    );
  }

  if (normalized.ingredients.length > 0) {
    const ingredientRows = normalized.ingredients.map((ingredient) => ({
      recipe_id: normalized.recipe.id,
      user_id: userId,
      name: ingredient.name,
      amount: ingredient.amount,
      unit: ingredient.unit,
      optional: ingredient.optional,
      sort_order: ingredient.sortOrder,
    }));

    const { error: ingredientInsertError } = await supabase
      .from("recipe_ingredients")
      .insert(ingredientRows);
    if (ingredientInsertError) {
      throw new Error(
        buildSupabaseErrorMessage(
          "insert recipe ingredients",
          ingredientInsertError
        )
      );
    }
  }

  if (normalized.steps.length > 0) {
    const stepRows = normalized.steps.map((step) => ({
      recipe_id: normalized.recipe.id,
      user_id: userId,
      text: step.text,
      step_order: step.stepOrder,
    }));

    const { error: stepInsertError } = await supabase
      .from("recipe_steps")
      .insert(stepRows);
    if (stepInsertError) {
      throw new Error(
        buildSupabaseErrorMessage("insert recipe steps", stepInsertError)
      );
    }
  }

  return {
    recipe: { ...normalized.recipe },
    ingredients: normalized.ingredients.map((ingredient) => ({
      ...ingredient,
      userId,
    })),
    steps: normalized.steps.map((step) => ({
      ...step,
      userId,
    })),
  };
}

export async function fetchRecipeFull(recipeId: number): Promise<RecipeFull> {
  const userId = await getCurrentUserId();

  const { data: recipeData, error: recipeError } = await supabase
    .from("recipes")
    .select("id,user_id,name,category,source,has_recipe_content,last_cooked")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .single();
  if (recipeError) {
    throw new Error(buildSupabaseErrorMessage("fetch recipe", recipeError));
  }

  const { data: ingredientData, error: ingredientError } = await supabase
    .from("recipe_ingredients")
    .select("id,recipe_id,user_id,name,amount,unit,optional,sort_order")
    .eq("recipe_id", recipeId)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (ingredientError) {
    throw new Error(
      buildSupabaseErrorMessage("fetch recipe ingredients", ingredientError)
    );
  }

  const { data: stepData, error: stepError } = await supabase
    .from("recipe_steps")
    .select("id,recipe_id,user_id,text,step_order")
    .eq("recipe_id", recipeId)
    .eq("user_id", userId)
    .order("step_order", { ascending: true });
  if (stepError) {
    throw new Error(buildSupabaseErrorMessage("fetch recipe steps", stepError));
  }

  const recipeRow = recipeData as DbRecipeFullRow;
  const ingredientRows = (ingredientData ?? []) as DbRecipeIngredientRow[];
  const stepRows = (stepData ?? []) as DbRecipeStepRow[];

  return {
    recipe: {
      id: recipeRow.id,
      name: recipeRow.name,
      category: recipeRow.category ?? "",
      source: recipeRow.source ?? null,
      hasRecipeContent: recipeRow.has_recipe_content,
      lastCooked: recipeRow.last_cooked,
    },
    ingredients: ingredientRows.map((row) => ({
      id: row.id,
      recipeId: row.recipe_id,
      userId: row.user_id,
      name: row.name,
      amount: row.amount,
      unit: row.unit,
      optional: !!row.optional,
      sortOrder: row.sort_order,
    })),
    steps: stepRows.map((row) => ({
      id: row.id,
      recipeId: row.recipe_id,
      userId: row.user_id,
      text: row.text,
      stepOrder: row.step_order,
      stepNo: row.step_order,
    })),
  };
}
