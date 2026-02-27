import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type RecipeSource = {
  recipeId: number;
  url: string;
};

type ParsedIngredient = {
  amount: number | null;
  unit: string | null;
  name: string;
  optional: boolean;
  sortOrder: number;
};

type ParsedStep = {
  stepOrder: number;
  text: string;
};

const USER_ID = "ea906947-eaa4-495e-a455-7cd081b3a8c8";
const OUTPUT_FILE = resolve(process.cwd(), "supabase_import_recipes.sql");

const SOURCES: RecipeSource[] = [
  { recipeId: 15, url: "https://www.ica.se/recept/korvstroganoff-med-ris-533512/" },
  { recipeId: 16, url: "https://www.ica.se/recept/flygande-jacob-717569/" },
  { recipeId: 17, url: "https://www.ica.se/recept/klassisk-lasagne-679675/" },
  { recipeId: 18, url: "https://www.ica.se/recept/raggmunk-med-flask-721803/" },
  { recipeId: 19, url: "https://www.ica.se/recept/akta-carbonara-utan-gradde-726730/" },
  { recipeId: 20, url: "https://www.ica.se/recept/one-pot-pasta-721661/" },
  {
    recipeId: 21,
    url: "https://www.zeta.nu/recept/pasticciata-kramig-pastasas-med-salsiccia-och-mascarpone/",
  },
  { recipeId: 22, url: "https://www.ica.se/recept/busenkel-broccolisoppa-712859/" },
  { recipeId: 24, url: "https://www.ica.se/recept/?recipeid=713665" },
  { recipeId: 25, url: "https://www.ica.se/recept/gulaschsoppa-med-kottfars-712852/" },
  {
    recipeId: 27,
    url: "https://www.ica.se/recept/palak-paneer-med-tomat-och-halloumi-722056/",
  },
];

const UNIT_CANDIDATES = [
  "paket",
  "förp",
  "burk",
  "msk",
  "tsk",
  "krm",
  "kg",
  "dl",
  "cl",
  "st",
  "g",
  "l",
];

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlStringOrNull(value: string | null): string {
  return value === null ? "NULL" : `'${escapeSql(value)}'`;
}

function toSqlNumericOrNull(value: number | null): string {
  return value === null ? "NULL" : String(value);
}

function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function parseJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON-LD blocks and continue.
    }
  }

  return blocks;
}

function recipeTypeMatch(value: unknown): boolean {
  if (typeof value === "string") return value.toLowerCase() === "recipe";
  if (Array.isArray(value)) return value.some((entry) => recipeTypeMatch(entry));
  return false;
}

function findRecipeObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeObject(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (recipeTypeMatch(obj["@type"])) return obj;

    if (obj["@graph"]) {
      const fromGraph = findRecipeObject(obj["@graph"]);
      if (fromGraph) return fromGraph;
    }
  }

  return null;
}

function extractRecipeFromJsonLd(blocks: unknown[]): Record<string, unknown> | null {
  for (const block of blocks) {
    const found = findRecipeObject(block);
    if (found) return found;
  }
  return null;
}

function parseLeadingAmount(text: string): { amount: number; consumed: number } | null {
  const source = text.trim();
  if (!source) return null;

  // Mixed fraction: "1 1/2"
  let match = /^(\d+)\s+(\d+)\/(\d+)\b/.exec(source);
  if (match) {
    const whole = Number(match[1]);
    const numerator = Number(match[2]);
    const denominator = Number(match[3]);
    if (denominator !== 0) {
      return {
        amount: whole + numerator / denominator,
        consumed: match[0].length,
      };
    }
  }

  // Fraction: "1/2"
  match = /^(\d+)\/(\d+)\b/.exec(source);
  if (match) {
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (denominator !== 0) {
      return {
        amount: numerator / denominator,
        consumed: match[0].length,
      };
    }
  }

  // Range: "2-3" / "2 - 3" (pick first number)
  match = /^(\d+(?:[.,]\d+)?)\s*[-–]\s*\d+(?:[.,]\d+)?\b/.exec(source);
  if (match) {
    return {
      amount: Number(match[1].replace(",", ".")),
      consumed: match[0].length,
    };
  }

  // Decimal/integer: "1" / "1.5" / "1,5"
  match = /^(\d+(?:[.,]\d+)?)\b/.exec(source);
  if (match) {
    return {
      amount: Number(match[1].replace(",", ".")),
      consumed: match[0].length,
    };
  }

  return null;
}

function parseLeadingUnit(text: string): { unit: string; consumed: number } | null {
  const source = text.trim();
  if (!source) return null;

  const escaped = UNIT_CANDIDATES.map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const unitRegex = new RegExp(`^(${escaped.join("|")})\\.?\\b`, "i");
  const match = unitRegex.exec(source);
  if (!match) return null;

  return {
    unit: match[1].toLowerCase(),
    consumed: match[0].length,
  };
}

function parseIngredientLine(line: string, sortOrder: number): ParsedIngredient {
  const normalized = compactWhitespace(line.replace(/^[-*•]\s*/, ""));
  if (!normalized) {
    return {
      amount: null,
      unit: null,
      name: "",
      optional: false,
      sortOrder,
    };
  }

  const amountMatch = parseLeadingAmount(normalized);
  if (!amountMatch) {
    return {
      amount: null,
      unit: null,
      name: normalized,
      optional: false,
      sortOrder,
    };
  }

  let rest = normalized.slice(amountMatch.consumed).trim();
  const unitMatch = parseLeadingUnit(rest);
  let unit: string | null = null;

  if (unitMatch) {
    unit = unitMatch.unit;
    rest = rest.slice(unitMatch.consumed).trim();
  }

  const name = compactWhitespace(rest);
  if (!name) {
    return {
      amount: null,
      unit: null,
      name: normalized,
      optional: false,
      sortOrder,
    };
  }

  return {
    amount: amountMatch.amount,
    unit,
    name,
    optional: false,
    sortOrder,
  };
}

function extractInstructionTexts(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    const text = compactWhitespace(value);
    return text ? [text] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractInstructionTexts(entry));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const fromText =
      typeof obj.text === "string" ? [compactWhitespace(obj.text)] : [];
    const fromItemList = extractInstructionTexts(obj.itemListElement);
    const fromSteps = extractInstructionTexts(obj.steps);
    return [...fromText, ...fromItemList, ...fromSteps].filter(Boolean);
  }

  return [];
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? compactWhitespace(entry) : ""))
    .filter(Boolean);
}

function buildRecipeSql(
  recipeId: number,
  ingredients: ParsedIngredient[],
  steps: ParsedStep[]
): string {
  const lines: string[] = [];
  lines.push(`-- recipe_id: ${recipeId}`);

  for (const ingredient of ingredients) {
    lines.push(
      [
        "INSERT INTO public.recipe_ingredients",
        "(id, user_id, recipe_id, name, amount, unit, optional, sort_order, created_at)",
        "VALUES",
        `(`,
        `  gen_random_uuid(),`,
        `  '${USER_ID}',`,
        `  ${recipeId},`,
        `  '${escapeSql(ingredient.name)}',`,
        `  ${toSqlNumericOrNull(ingredient.amount)},`,
        `  ${toSqlStringOrNull(ingredient.unit)},`,
        `  ${ingredient.optional ? "true" : "false"},`,
        `  ${ingredient.sortOrder},`,
        `  now()`,
        `);`,
      ].join("\n")
    );
  }

  for (const step of steps) {
    lines.push(
      [
        "INSERT INTO public.recipe_steps",
        "(id, user_id, recipe_id, step_order, text, created_at)",
        "VALUES",
        `(`,
        `  gen_random_uuid(),`,
        `  '${USER_ID}',`,
        `  ${recipeId},`,
        `  ${step.stepOrder},`,
        `  '${escapeSql(step.text)}',`,
        `  now()`,
        `);`,
      ].join("\n")
    );
  }

  return `${lines.join("\n")}\n`;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "matplan-recipe-import/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function main() {
  const sqlChunks: string[] = [
    "-- Auto-generated by scripts/importRecipes.ts",
    "-- Generated at: " + new Date().toISOString(),
    "",
  ];

  for (const source of SOURCES) {
    let foundRecipe = false;
    let ingredientCount = 0;
    let stepCount = 0;

    try {
      const html = await fetchHtml(source.url);
      const jsonLdBlocks = parseJsonLdBlocks(html);
      const recipeObject = extractRecipeFromJsonLd(jsonLdBlocks);

      if (!recipeObject) {
        console.log(
          `[${source.recipeId}] Recipe JSON-LD hittades inte (ingredienser: 0, steg: 0)`
        );
        continue;
      }

      foundRecipe = true;
      const ingredientRows = getStringArray(recipeObject.recipeIngredient)
        .map((line, index) => parseIngredientLine(line, index + 1))
        .filter((row) => row.name.length > 0);

      const stepTexts = extractInstructionTexts(recipeObject.recipeInstructions);
      const stepRows = stepTexts.map((text, index) => ({
        stepOrder: index + 1,
        text,
      }));

      ingredientCount = ingredientRows.length;
      stepCount = stepRows.length;

      sqlChunks.push(buildRecipeSql(source.recipeId, ingredientRows, stepRows));
    } catch (error) {
      console.log(
        `[${source.recipeId}] Fel vid hämtning/parsing: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      continue;
    }

    console.log(
      `[${source.recipeId}] Recipe JSON-LD: ${foundRecipe ? "ja" : "nej"}, ingredienser: ${ingredientCount}, steg: ${stepCount}`
    );
  }

  await writeFile(OUTPUT_FILE, sqlChunks.join("\n"), "utf8");
  console.log(`SQL-fil skapad: ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error("Importscriptet avslutades med fel:", error);
  process.exitCode = 1;
});
