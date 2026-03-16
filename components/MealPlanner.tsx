import React, { useState, useMemo, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
const LAST_SELECTED_WEEK_KEY = "matplaneraren_selected_week_v1";
const CALENDAR_ICS_URL =
  "webcal://p124-caldav.icloud.com/published/2/MjY4MDY0MTMzMjY4MDY0MZHfXvtitZZC9fN4qXJIo6P0X92JjkUY6Qwrt1VJqJnaKV6g_XnQxVr6yxa9SmulWnDQR_ZiAew1g2unqdQe5d8";
const CALENDAR_PROXY_ENDPOINT =
  (import.meta as any)?.env?.VITE_ICS_PROXY_URL?.trim?.() || "/api/ics";

type CalendarEventPeriod = {
  start: Date;
  end: Date;
  summary: string;
};

function getCurrentIsoWeek(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function isoWeekToMonday(weekIdentifier: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekIdentifier);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoDow = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4IsoDow - 1));

  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

function dateToIsoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function shiftIsoWeek(weekIdentifier: string, deltaWeeks: number): string {
  const monday = isoWeekToMonday(weekIdentifier);
  if (!monday) return weekIdentifier;
  monday.setUTCDate(monday.getUTCDate() + deltaWeeks * 7);
  return dateToIsoWeek(monday);
}

function getRecencyBonus(lastCooked: string | null): number {
  if (!lastCooked) return 20;

  const lastCookedDate = new Date(lastCooked);
  if (Number.isNaN(lastCookedDate.getTime())) return 0;

  const diffDays = Math.floor(
    (Date.now() - lastCookedDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (!Number.isFinite(diffDays)) return 0;
  return Math.max(0, Math.min(diffDays, 30));
}

function pickWeightedRecipe(
  candidates: Recipe[],
  excludeCategories: Set<string>
): Recipe | null {
  if (candidates.length === 0) return null;

  const weightedCandidates = candidates.map((recipe) => {
    let score = 100 + getRecencyBonus(recipe.lastCooked);

    if (excludeCategories.has(recipe.category)) {
      score -= 40;
    }

    return {
      recipe,
      score: Math.max(1, score),
    };
  });

  const totalWeight = weightedCandidates.reduce(
    (sum, candidate) => sum + candidate.score,
    0
  );

  let randomWeight = Math.random() * totalWeight;

  for (const candidate of weightedCandidates) {
    randomWeight -= candidate.score;
    if (randomWeight <= 0) {
      return candidate.recipe;
    }
  }

  return weightedCandidates[weightedCandidates.length - 1].recipe;
}

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

// iCloud delar ofta URL som webcal:// - konvertera till https:// för fetch.
function normalizeCalendarUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.toLowerCase().startsWith("webcal://")) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }
  return trimmed;
}

// Väljer proxy-url:
// - localhost/dev: /api/ics?url=... (Vite middleware)
// - publicerad miljö: VITE_ICS_PROXY_URL (Supabase Edge Function)
function buildCalendarProxyRequestUrl(normalizedCalendarUrl: string): string {
  if (CALENDAR_PROXY_ENDPOINT === "/api/ics") {
    return `/api/ics?url=${encodeURIComponent(normalizedCalendarUrl)}`;
  }
  return CALENDAR_PROXY_ENDPOINT;
}

// Enkel parser för vanliga iCalendar-datumformat.
function parseIcsDateValue(rawValue: string): Date | null {
  const value = rawValue.trim();

  if (/^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6));
    const d = Number(value.slice(6, 8));
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6));
    const d = Number(value.slice(6, 8));
    const hh = Number(value.slice(9, 11));
    const mm = Number(value.slice(11, 13));
    const ss = Number(value.slice(13, 15));
    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6));
    const d = Number(value.slice(6, 8));
    const hh = Number(value.slice(9, 11));
    const mm = Number(value.slice(11, 13));
    const ss = Number(value.slice(13, 15));
    return new Date(y, m - 1, d, hh, mm, ss, 0);
  }

  return null;
}

function decodeIcsText(rawValue: string): string {
  return rawValue
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Plockar ut grundläggande VEVENT-intervall ur en ICS-text.
function extractIcsEventPeriods(icsText: string): CalendarEventPeriod[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events: CalendarEventPeriod[] = [];

  let inEvent = false;
  let dtStartRaw: string | null = null;
  let dtEndRaw: string | null = null;
  let summaryRaw: string | null = null;
  let statusCancelled = false;

  const pushEvent = () => {
    if (!dtStartRaw || statusCancelled) return;

    // Ignorera heldagsaktiviteter (DATE-format utan tid), enligt önskemål.
    if (/^\d{8}$/.test(dtStartRaw)) return;

    const start = parseIcsDateValue(dtStartRaw);
    if (!start) return;

    // Om DTEND saknas: anta 1 timme för tidsatt event eller nästa dag för heldag.
    let end = dtEndRaw ? parseIcsDateValue(dtEndRaw) : null;
    if (!end) {
      end = /^\d{8}$/.test(dtStartRaw)
        ? new Date(start.getTime() + 24 * 60 * 60 * 1000)
        : new Date(start.getTime() + 60 * 60 * 1000);
    }

    if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    const summary = summaryRaw ? decodeIcsText(summaryRaw).trim() : "";
    events.push({ start, end, summary: summary || "Aktivitet" });
  };

  lines.forEach((line) => {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      dtStartRaw = null;
      dtEndRaw = null;
      summaryRaw = null;
      statusCancelled = false;
      return;
    }

    if (line === "END:VEVENT") {
      if (inEvent) pushEvent();
      inEvent = false;
      return;
    }

    if (!inEvent) return;

    if (line.startsWith("STATUS:")) {
      statusCancelled = line.toUpperCase().includes("CANCELLED");
      return;
    }

    if (line.startsWith("DTSTART")) {
      const value = line.split(":").slice(1).join(":");
      dtStartRaw = value || null;
      return;
    }

    if (line.startsWith("DTEND")) {
      const value = line.split(":").slice(1).join(":");
      dtEndRaw = value || null;
      return;
    }

    if (line.startsWith("SUMMARY")) {
      const value = line.split(":").slice(1).join(":");
      summaryRaw = value || null;
    }
  });

  return events;
}

// Markerar vilka dagar i vald vecka som har aktivitet som överlappar 16:00-21:00.
function computeBusyEveningDays(
  weekIdentifier: string,
  events: CalendarEventPeriod[]
): Set<number> {
  const busy = new Set<number>();

  for (let dayId = 0; dayId <= 6; dayId += 1) {
    const dateISO = isoWeekDayToISODate(weekIdentifier, dayId);
    const eveningStart = new Date(`${dateISO}T16:00:00`);
    const eveningEnd = new Date(`${dateISO}T21:00:00`);

    const hasOverlap = events.some(
      (event) => event.end > eveningStart && event.start < eveningEnd
    );

    if (hasOverlap) busy.add(dayId);
  }

  return busy;
}

function buildWeekEveningEvents(
  weekIdentifier: string,
  events: CalendarEventPeriod[]
): Map<number, CalendarEventPeriod[]> {
  const byDay = new Map<number, CalendarEventPeriod[]>();

  for (let dayId = 0; dayId <= 6; dayId += 1) {
    const dateISO = isoWeekDayToISODate(weekIdentifier, dayId);
    const eveningStart = new Date(`${dateISO}T16:00:00`);
    const eveningEnd = new Date(`${dateISO}T21:00:00`);

    const overlaps = events
      .filter((event) => event.end > eveningStart && event.start < eveningEnd)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (overlaps.length > 0) byDay.set(dayId, overlaps);
  }

  return byDay;
}

const MealPlanner: React.FC<MealPlannerProps> = ({
  recipes,
  plans,
  onUpdatePlans,
  onUpdateRecipes,
  onMarkCooked,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(LAST_SELECTED_WEEK_KEY)
        : null;
    return stored || getCurrentIsoWeek();
  });

  const [activeDayIndices, setActiveDayIndices] = useState<number[]>(ALL_DAYS);
  const [showRecipeModal, setShowRecipeModal] = useState<number | null>(null);

  // Fritext-draft i modalen
  const [freeTextDraft, setFreeTextDraft] = useState("");
  const [modalSearchTerm, setModalSearchTerm] = useState("");
  const [modalCategoryFilter, setModalCategoryFilter] = useState<string>("Alla");
  const [busyEveningDays, setBusyEveningDays] = useState<Set<number>>(new Set());
  const [eveningEventsByDay, setEveningEventsByDay] = useState<
    Map<number, CalendarEventPeriod[]>
  >(new Map());
  const [showDayEventsModal, setShowDayEventsModal] = useState<number | null>(null);

  const currentPlan = useMemo(() => {
    return (
      plans.find((p) => p.weekIdentifier === selectedWeek) || {
        weekIdentifier: selectedWeek,
        days: [],
        activeDayIndices: ALL_DAYS,
      }
    );
  }, [plans, selectedWeek]);

  const modalCategories = useMemo(() => {
    return Array.from(new Set(recipes.map((r) => r.category))).sort((a, b) =>
      a.localeCompare(b, "sv")
    );
  }, [recipes]);

  const filteredModalRecipes = useMemo(() => {
    const search = modalSearchTerm.trim().toLowerCase();

    return recipes.filter((recipe) => {
      const matchesCategory =
        modalCategoryFilter === "Alla" || recipe.category === modalCategoryFilter;
      if (!matchesCategory) return false;

      if (!search) return true;
      return (
        recipe.name.toLowerCase().includes(search) ||
        (recipe.source?.toLowerCase().includes(search) ?? false)
      );
    });
  }, [recipes, modalSearchTerm, modalCategoryFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LAST_SELECTED_WEEK_KEY, selectedWeek);
  }, [selectedWeek]);

  // Synka aktiva dagar både när vecka byts och när plans laddas/uppdateras.
  useEffect(() => {
    const fromPlan =
      currentPlan.activeDayIndices && currentPlan.activeDayIndices.length > 0
        ? [...currentPlan.activeDayIndices].sort((a, b) => a - b)
        : ALL_DAYS;

    setActiveDayIndices(fromPlan);
  }, [selectedWeek, currentPlan.activeDayIndices]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showDayEventsModal !== null) {
          setShowDayEventsModal(null);
          return;
        }
        if (showRecipeModal !== null) {
          setShowRecipeModal(null);
          setFreeTextDraft("");
          setModalSearchTerm("");
          setModalCategoryFilter("Alla");
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showRecipeModal, showDayEventsModal]);

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

    // Först: använd aldrig ett recept som redan ligger i veckan om vi har alternativ.
    const unusedRecipes = recipes.filter((recipe) => !excludeIds.has(recipe.id));
    if (unusedRecipes.length === 0) {
      return pickWeightedRecipe(recipes, excludeCategories);
    }

    // Sedan: försök undvika kategori-krockar, men fall tillbaka om det behövs.
    const unusedAndNewCategory = unusedRecipes.filter(
      (recipe) => !excludeCategories.has(recipe.category)
    );

    if (unusedAndNewCategory.length > 0) {
      return pickWeightedRecipe(unusedAndNewCategory, excludeCategories);
    }

    return pickWeightedRecipe(unusedRecipes, excludeCategories);
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

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const syncCalendarBusyDays = async () => {
    const normalizedUrl = normalizeCalendarUrl(CALENDAR_ICS_URL);
    if (!normalizedUrl) return;

    try {
      const requestUrl = buildCalendarProxyRequestUrl(normalizedUrl);
      const response = await fetch(requestUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const icsText = await response.text();
      const events = extractIcsEventPeriods(icsText);
      const busyDays = computeBusyEveningDays(selectedWeek, events);
      const eveningByDay = buildWeekEveningEvents(selectedWeek, events);
      setBusyEveningDays(busyDays);
      setEveningEventsByDay(eveningByDay);
    } catch (error) {
      console.error("CALENDAR SYNC FAILED:", error);
      setBusyEveningDays(new Set());
      setEveningEventsByDay(new Map());
    }
  };

  // Synka när vecka ändras (körs även för initial vecka).
  useEffect(() => {
    void syncCalendarBusyDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Week Selector */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Välj vecka</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedWeek((prev) => shiftIsoWeek(prev, -1))}
            className="shrink-0 p-3 bg-gray-100 rounded-xl text-gray-700 font-bold hover:bg-gray-200 transition-colors"
            aria-label="Föregående vecka"
            title="Föregående vecka"
          >
            ←
          </button>
          <input
            type="week"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-medium"
          />
          <button
            type="button"
            onClick={() => setSelectedWeek((prev) => shiftIsoWeek(prev, 1))}
            className="shrink-0 p-3 bg-gray-100 rounded-xl text-gray-700 font-bold hover:bg-gray-200 transition-colors"
            aria-label="Nästa vecka"
            title="Nästa vecka"
          >
            →
          </button>
        </div>

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
              <span className="inline-flex items-center gap-1">
                {day.substring(0, 3)}
                {busyEveningDays.has(idx) && (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                    title="Aktivitet mellan 16:00-21:00"
                  />
                )}
              </span>
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
            const hasEveningActivity = busyEveningDays.has(dayIdx);

            return (
              <div
                key={dayIdx}
                className="group bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-colors"
                onClick={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("button")) return;
                  if (!hasEveningActivity) return;
                  setShowDayEventsModal(dayIdx);
                }}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                      {SWEDISH_DAYS[dayIdx]}
                    </span>
                    {hasEveningActivity && (
                      <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                        Kvällsaktivitet
                      </span>
                    )}
                  </div>

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

                    <button
                      onClick={() => {
                        if (!recipe) return;
                        navigate(`/recipes/${recipe.id}/view`, {
                          state: { from: `${location.pathname}${location.search}` },
                        });
                      }}
                      className="p-1.5 text-gray-400 hover:text-emerald-500 bg-gray-50 rounded-lg transition-colors disabled:opacity-40"
                      title="Visa recept"
                      disabled={!recipe}
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
                          d="M15 12H9m12 0c0 1.657-3.582 6-9 6s-9-4.343-9-6 3.582-6 9-6 9 4.343 9 6zm-9 3a3 3 0 100-6 3 3 0 000 6z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {recipe ? (
                  <div>
                    <h3 className="text-sm md:text-base font-bold text-gray-900 leading-tight mb-1">
                      {recipe.name}
                    </h3>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                        {recipe.category}
                      </span>
                      <span className="text-[9px] text-gray-400">
                        Lagad: {formatDate(recipe.lastCooked)}
                      </span>
                    </div>
                  </div>
                ) : freeText.length > 0 ? (
                  <div>
                    <h3 className="text-sm md:text-base font-bold text-gray-900 leading-tight mb-1">
                      {freeText}
                    </h3>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
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
              <h3 className="text-lg md:text-xl font-bold">Välj en rätt eller skriv fritext</h3>
              <button
                onClick={() => {
                  setShowRecipeModal(null);
                  setFreeTextDraft("");
                  setModalSearchTerm("");
                  setModalCategoryFilter("Alla");
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

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    placeholder="Sök rätt..."
                    className="w-full p-2.5 pl-9 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 focus:outline-none"
                  />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 absolute left-3 top-3 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
                  {["Alla", ...modalCategories].map((category) => (
                    <button
                      key={category}
                      onClick={() => setModalCategoryFilter(category)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                        modalCategoryFilter === category
                          ? "bg-gray-900 text-white"
                          : "bg-white border border-gray-200 text-gray-600"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide">
                  Fritext
                </label>
                <input
                  type="text"
                  value={freeTextDraft}
                  onChange={(e) => setFreeTextDraft(e.target.value)}
                  placeholder="Skriv valfri text..."
                  className="w-full p-3 bg-white rounded-xl border border-gray-200 focus:border-emerald-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => updateDayFreeText(showRecipeModal, freeTextDraft)}
                    className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl text-xs md:text-sm font-bold active:scale-95 transition-transform"
                  >
                    Spara fritext
                  </button>
                  <button
                    onClick={() => updateDayFreeText(showRecipeModal, "")}
                    className="flex-none px-4 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl text-xs md:text-sm font-bold active:scale-95 transition-transform"
                    title="Rensa fritext"
                  >
                    Rensa
                  </button>
                </div>
              </div>

              <button
                onClick={() => updateDayRecipe(showRecipeModal, null)}
                className="w-full text-left p-4 rounded-2xl hover:bg-gray-50 transition-colors border-2 border-transparent hover:border-gray-200 text-red-500 font-semibold"
              >
                Rensa vald rätt
              </button>

              {filteredModalRecipes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => updateDayRecipe(showRecipeModal, r.id)}
                  className="w-full text-left p-4 rounded-2xl hover:bg-emerald-50 transition-colors border-2 border-transparent hover:border-emerald-200"
                >
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-sm md:text-base text-gray-900">{r.name}</div>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase">
                      {r.category}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] md:text-xs text-gray-400">
                    <span>{r.source || "Okänd källa"}</span>
                    <span>Lagad: {formatDate(r.lastCooked)}</span>
                  </div>
                </button>
              ))}

              {filteredModalRecipes.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
                  Inga rätter matchar sökning/filtrering.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDayEventsModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold">
                Kvällsaktivitet: {SWEDISH_DAYS[showDayEventsModal]}
              </h3>
              <button
                onClick={() => setShowDayEventsModal(null)}
                className="text-gray-400 hover:text-gray-600"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {(eveningEventsByDay.get(showDayEventsModal) ?? []).map((event, index) => (
                <div
                  key={`${event.start.toISOString()}-${event.end.toISOString()}-${index}`}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="text-xs font-semibold text-gray-500">
                    {formatTime(event.start)}-{formatTime(event.end)}
                  </div>
                  <div className="text-sm font-semibold text-gray-900 mt-1">
                    {event.summary}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealPlanner;
