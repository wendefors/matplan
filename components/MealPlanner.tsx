import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ActiveDayIndices,
  DayPlan,
  MealSlotPlan,
  MealSlotType,
  Recipe,
  SWEDISH_DAYS,
  WeekPlan,
} from "../types";
import { generateICS } from "../services/icsService";

interface MealPlannerProps {
  recipes: Recipe[];
  plans: WeekPlan[];
  onUpdatePlans: (plans: WeekPlan[]) => void;
  onUpdateRecipes: (recipes: Recipe[]) => void;
  onMarkCooked: (updates: { id: number; lastCooked: string }[]) => Promise<void>;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const ALL_ACTIVE_DAYS: ActiveDayIndices = {
  lunch: [...ALL_DAYS],
  dinner: [...ALL_DAYS],
};
const LAST_SELECTED_WEEK_KEY = "matplaneraren_selected_week_v1";
const CALENDAR_ICS_URL =
  "webcal://p124-caldav.icloud.com/published/2/MjY4MDY0MTMzMjY4MDY0MZHfXvtitZZC9fN4qXJIo6P0X92JjkUY6Qwrt1VJqJnaKV6g_XnQxVr6yxa9SmulWnDQR_ZiAew1g2unqdQe5d8";
const FALLBACK_SUPABASE_PROJECT_REF = "rmnqaqqtdysjpstktvvr";

const SLOT_LABELS: Record<MealSlotType, string> = {
  lunch: "Lunch",
  dinner: "Kvällsmat",
};

type DayEventModalTarget = number | null;
type RecipeModalTarget = { dayId: number; slot: MealSlotType } | null;

type CalendarEventPeriod = {
  start: Date;
  end: Date;
  summary: string;
  description: string;
};

type RawCalendarEvent = {
  start: Date;
  end: Date;
  summary: string;
  description: string;
  rrule: string | null;
  exdates: Date[];
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

function isoWeekDayToISODate(weekIdentifier: string, dayId: number): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekIdentifier);
  if (!match) {
    return new Date().toISOString().slice(0, 10);
  }

  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoDow = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4IsoDow - 1));
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + dayId);
  return target.toISOString().slice(0, 10);
}

function getDefaultSlotPlan(): MealSlotPlan {
  return { recipeId: null, freeText: null };
}

function getDefaultDayPlan(dayId: number): DayPlan {
  return {
    dayId,
    lunch: getDefaultSlotPlan(),
    dinner: getDefaultSlotPlan(),
  };
}

function normalizeCalendarUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.toLowerCase().startsWith("webcal://")) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }
  return trimmed;
}

function resolveCalendarProxyEndpoint(): string {
  const explicitProxy = (import.meta as any)?.env?.VITE_ICS_PROXY_URL?.trim?.();
  if (explicitProxy) return explicitProxy;

  const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL?.trim?.();
  if (supabaseUrl) {
    try {
      const host = new URL(supabaseUrl).hostname;
      const projectRef = host.replace(/\.supabase\.co$/i, "");
      if (projectRef && projectRef !== host) {
        return `https://${projectRef}.functions.supabase.co/icloud-ics-proxy`;
      }
    } catch {
      // fallback nedan.
    }
  }

  return "/api/ics";
}

const CALENDAR_PROXY_ENDPOINT = resolveCalendarProxyEndpoint();

function buildCalendarProxyEndpointCandidates(): string[] {
  const candidates: string[] = [];
  const explicitProxy = (import.meta as any)?.env?.VITE_ICS_PROXY_URL?.trim?.();
  const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL?.trim?.();

  if (explicitProxy) candidates.push(explicitProxy);

  if (supabaseUrl) {
    try {
      const host = new URL(supabaseUrl).hostname;
      const projectRef = host.replace(/\.supabase\.co$/i, "");
      if (projectRef && projectRef !== host) {
        candidates.push(`https://${projectRef}.functions.supabase.co/icloud-ics-proxy`);
      }
    } catch {
      // Ignorera parse-fel.
    }
  }

  candidates.push(
    `https://${FALLBACK_SUPABASE_PROJECT_REF}.functions.supabase.co/icloud-ics-proxy`
  );
  candidates.push(CALENDAR_PROXY_ENDPOINT);
  candidates.push("/api/ics");

  return Array.from(new Set(candidates.filter(Boolean)));
}

const CALENDAR_PROXY_ENDPOINT_CANDIDATES = buildCalendarProxyEndpointCandidates();

function buildCalendarProxyRequestUrlForEndpoint(
  endpoint: string,
  normalizedCalendarUrl: string
): string {
  if (endpoint === "/api/ics") {
    return `/api/ics?url=${encodeURIComponent(normalizedCalendarUrl)}`;
  }
  return `${endpoint}?t=${Date.now()}`;
}

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

function normalizeSummaryForMatch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseIcsDateList(rawValue: string): Date[] {
  return rawValue
    .split(",")
    .map((part) => parseIcsDateValue(part))
    .filter((date): date is Date => date !== null);
}

function parseRRule(rawRule: string): Record<string, string> {
  const out: Record<string, string> = {};
  rawRule.split(";").forEach((part) => {
    const [key, ...rest] = part.split("=");
    if (!key) return;
    out[key.trim().toUpperCase()] = rest.join("=").trim();
  });
  return out;
}

function getWeekRange(weekIdentifier: string): { start: Date; end: Date } {
  const mondayIso = isoWeekDayToISODate(weekIdentifier, 0);
  const start = new Date(`${mondayIso}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function expandRecurringEventForWeek(
  rawEvent: RawCalendarEvent,
  weekIdentifier: string
): CalendarEventPeriod[] {
  const range = getWeekRange(weekIdentifier);
  const rangeStart = new Date(range.start.getTime() - 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(range.end.getTime() + 24 * 60 * 60 * 1000);
  const durationMs = Math.max(1, rawEvent.end.getTime() - rawEvent.start.getTime());
  const exdateSet = new Set(rawEvent.exdates.map((date) => date.getTime()));

  const makeEvent = (start: Date): CalendarEventPeriod | null => {
    if (exdateSet.has(start.getTime())) return null;
    const end = new Date(start.getTime() + durationMs);
    if (end <= rangeStart || start >= rangeEnd) return null;
    return {
      start,
      end,
      summary: rawEvent.summary,
      description: rawEvent.description,
    };
  };

  if (!rawEvent.rrule) {
    const single = makeEvent(rawEvent.start);
    return single ? [single] : [];
  }

  const rule = parseRRule(rawEvent.rrule);
  const freq = (rule.FREQ || "").toUpperCase();
  const interval = Math.max(1, Number(rule.INTERVAL || "1"));
  const count = Number(rule.COUNT || "0");
  const until = rule.UNTIL ? parseIcsDateValue(rule.UNTIL) : null;
  const byDayTokens = (rule.BYDAY || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const byMonthDays = (rule.BYMONTHDAY || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n !== 0);

  const dayTokenToJsDay: Record<string, number> = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
  };

  const results: CalendarEventPeriod[] = [];
  let emittedCount = 0;
  const maxIterations = 5000;

  const tryAdd = (start: Date): boolean => {
    if (start < rawEvent.start) return false;
    if (until && start > until) return true;
    emittedCount += 1;
    const event = makeEvent(start);
    if (event) results.push(event);
    if (count > 0 && emittedCount >= count) return true;
    return false;
  };

  if (freq === "DAILY") {
    const cursor = new Date(rawEvent.start);
    let loops = 0;
    while (loops < maxIterations && cursor < rangeEnd) {
      loops += 1;
      if (tryAdd(new Date(cursor))) break;
      cursor.setDate(cursor.getDate() + interval);
    }
    return results.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  if (freq === "WEEKLY") {
    const baseWeekStart = new Date(rawEvent.start);
    baseWeekStart.setDate(rawEvent.start.getDate() - ((rawEvent.start.getDay() + 6) % 7));
    const weekCursor = new Date(baseWeekStart);

    const byDays =
      byDayTokens.length > 0
        ? byDayTokens
            .map((token) => dayTokenToJsDay[token])
            .filter((d) => d !== undefined)
        : [rawEvent.start.getDay()];

    let loops = 0;
    while (loops < maxIterations && weekCursor < rangeEnd) {
      loops += 1;
      const weekEvents = byDays
        .map((jsDay) => {
          const candidate = new Date(weekCursor);
          candidate.setDate(weekCursor.getDate() + ((jsDay + 6) % 7));
          candidate.setHours(
            rawEvent.start.getHours(),
            rawEvent.start.getMinutes(),
            rawEvent.start.getSeconds(),
            rawEvent.start.getMilliseconds()
          );
          return candidate;
        })
        .sort((a, b) => a.getTime() - b.getTime());

      for (const start of weekEvents) {
        if (tryAdd(start)) {
          return results.sort((a, b) => a.start.getTime() - b.start.getTime());
        }
      }

      weekCursor.setDate(weekCursor.getDate() + interval * 7);
    }

    return results.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  if (freq === "MONTHLY") {
    const cursor = new Date(rawEvent.start);
    let loops = 0;

    while (loops < maxIterations && cursor < rangeEnd) {
      loops += 1;
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const monthDays = byMonthDays.length > 0 ? byMonthDays : [rawEvent.start.getDate()];

      const monthEvents = monthDays
        .map((dayOfMonth) => {
          const candidate = new Date(year, month, dayOfMonth);
          if (candidate.getMonth() !== month) return null;
          candidate.setHours(
            rawEvent.start.getHours(),
            rawEvent.start.getMinutes(),
            rawEvent.start.getSeconds(),
            rawEvent.start.getMilliseconds()
          );
          return candidate;
        })
        .filter((candidate): candidate is Date => candidate !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      for (const start of monthEvents) {
        if (tryAdd(start)) {
          return results.sort((a, b) => a.start.getTime() - b.start.getTime());
        }
      }

      cursor.setMonth(cursor.getMonth() + interval);
      cursor.setDate(1);
    }

    return results.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  const fallbackSingle = makeEvent(rawEvent.start);
  return fallbackSingle ? [fallbackSingle] : [];
}

function extractIcsEventPeriods(
  icsText: string,
  weekIdentifier: string
): CalendarEventPeriod[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const rawEvents: RawCalendarEvent[] = [];

  let inEvent = false;
  let dtStartRaw: string | null = null;
  let dtEndRaw: string | null = null;
  let summaryRaw: string | null = null;
  let descriptionRaw: string | null = null;
  let rruleRaw: string | null = null;
  const exdateRawList: string[] = [];
  let statusCancelled = false;

  const pushEvent = () => {
    if (!dtStartRaw || statusCancelled) return;
    if (/^\d{8}$/.test(dtStartRaw)) return;

    const start = parseIcsDateValue(dtStartRaw);
    if (!start) return;

    let end = dtEndRaw ? parseIcsDateValue(dtEndRaw) : null;
    if (!end || end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    const summary = summaryRaw ? decodeIcsText(summaryRaw).trim() : "";
    const description = descriptionRaw ? decodeIcsText(descriptionRaw).trim() : "";
    const exdates = exdateRawList.flatMap((value) => parseIcsDateList(value));

    rawEvents.push({
      start,
      end,
      summary: summary || "Aktivitet",
      description,
      rrule: rruleRaw,
      exdates,
    });
  };

  lines.forEach((line) => {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      dtStartRaw = null;
      dtEndRaw = null;
      summaryRaw = null;
      descriptionRaw = null;
      rruleRaw = null;
      exdateRawList.length = 0;
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
      dtStartRaw = line.split(":").slice(1).join(":") || null;
      return;
    }
    if (line.startsWith("DTEND")) {
      dtEndRaw = line.split(":").slice(1).join(":") || null;
      return;
    }
    if (line.startsWith("SUMMARY")) {
      summaryRaw = line.split(":").slice(1).join(":") || null;
      return;
    }
    if (line.startsWith("DESCRIPTION")) {
      descriptionRaw = line.split(":").slice(1).join(":") || null;
      return;
    }
    if (line.startsWith("RRULE")) {
      rruleRaw = line.split(":").slice(1).join(":") || null;
      return;
    }
    if (line.startsWith("EXDATE")) {
      const value = line.split(":").slice(1).join(":");
      if (value) exdateRawList.push(value);
    }
  });

  return rawEvents
    .flatMap((rawEvent) => expandRecurringEventForWeek(rawEvent, weekIdentifier))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

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

function computeBusyDaytimeDays(
  weekIdentifier: string,
  events: CalendarEventPeriod[]
): Set<number> {
  const busy = new Set<number>();
  for (let dayId = 0; dayId <= 6; dayId += 1) {
    const dateISO = isoWeekDayToISODate(weekIdentifier, dayId);
    const dayStart = new Date(`${dateISO}T11:00:00`);
    const dayEnd = new Date(`${dateISO}T14:30:00`);
    const hasOverlap = events.some((event) => event.end > dayStart && event.start < dayEnd);
    if (hasOverlap) busy.add(dayId);
  }
  return busy;
}

function buildWeekDaytimeEvents(
  weekIdentifier: string,
  events: CalendarEventPeriod[]
): Map<number, CalendarEventPeriod[]> {
  const byDay = new Map<number, CalendarEventPeriod[]>();
  for (let dayId = 0; dayId <= 6; dayId += 1) {
    const dateISO = isoWeekDayToISODate(weekIdentifier, dayId);
    const dayStart = new Date(`${dateISO}T11:00:00`);
    const dayEnd = new Date(`${dateISO}T14:30:00`);

    const overlaps = events
      .filter((event) => event.end > dayStart && event.start < dayEnd)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (overlaps.length > 0) byDay.set(dayId, overlaps);
  }
  return byDay;
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

  const weighted = candidates.map((recipe) => {
    let score = 100 + getRecencyBonus(recipe.lastCooked);
    if (excludeCategories.has(recipe.category)) score -= 40;
    return { recipe, score: Math.max(1, score) };
  });

  const totalWeight = weighted.reduce((sum, c) => sum + c.score, 0);
  let randomWeight = Math.random() * totalWeight;

  for (const candidate of weighted) {
    randomWeight -= candidate.score;
    if (randomWeight <= 0) return candidate.recipe;
  }

  return weighted[weighted.length - 1].recipe;
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

  const [activeDayIndices, setActiveDayIndices] =
    useState<ActiveDayIndices>(ALL_ACTIVE_DAYS);
  const [showRecipeModal, setShowRecipeModal] = useState<RecipeModalTarget>(null);
  const [showDayEventsModal, setShowDayEventsModal] = useState<DayEventModalTarget>(null);
  const [freeTextDraft, setFreeTextDraft] = useState("");
  const [modalSearchTerm, setModalSearchTerm] = useState("");
  const [modalCategoryFilter, setModalCategoryFilter] = useState<string>("Alla");
  const [busyDaytimeDays, setBusyDaytimeDays] = useState<Set<number>>(new Set());
  const [busyEveningDays, setBusyEveningDays] = useState<Set<number>>(new Set());
  const [daytimeEventsByDay, setDaytimeEventsByDay] = useState<
    Map<number, CalendarEventPeriod[]>
  >(new Map());
  const [eveningEventsByDay, setEveningEventsByDay] = useState<
    Map<number, CalendarEventPeriod[]>
  >(new Map());

  const currentPlan = useMemo(() => {
    return (
      plans.find((p) => p.weekIdentifier === selectedWeek) || {
        weekIdentifier: selectedWeek,
        days: [],
        activeDayIndices: ALL_ACTIVE_DAYS,
      }
    );
  }, [plans, selectedWeek]);

  const excludedCalendarSummaries = useMemo(() => {
    const summarySet = new Set<string>();

    recipes.forEach((recipe) => {
      const normalized = normalizeSummaryForMatch(recipe.name);
      if (normalized) summarySet.add(normalized);
    });

    currentPlan.days.forEach((day) => {
      (["lunch", "dinner"] as MealSlotType[]).forEach((slot) => {
        const freeText = (day[slot].freeText ?? "").trim();
        if (!freeText) return;
        summarySet.add(normalizeSummaryForMatch(freeText));
      });
    });

    summarySet.add(normalizeSummaryForMatch("Måltid"));
    return summarySet;
  }, [recipes, currentPlan.days]);

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

  const dayIndicesToRender = useMemo(() => {
    return ALL_DAYS.filter(
      (dayId) =>
        activeDayIndices.lunch.includes(dayId) ||
        activeDayIndices.dinner.includes(dayId)
    );
  }, [activeDayIndices]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LAST_SELECTED_WEEK_KEY, selectedWeek);
  }, [selectedWeek]);

  useEffect(() => {
    setActiveDayIndices(currentPlan.activeDayIndices ?? ALL_ACTIVE_DAYS);
  }, [currentPlan.activeDayIndices, selectedWeek]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showDayEventsModal !== null) {
        setShowDayEventsModal(null);
        return;
      }
      if (showRecipeModal) {
        setShowRecipeModal(null);
        setFreeTextDraft("");
        setModalSearchTerm("");
        setModalCategoryFilter("Alla");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showDayEventsModal, showRecipeModal]);

  const persistActiveDaysForWeek = (next: ActiveDayIndices) => {
    const normalized: ActiveDayIndices = {
      lunch: Array.from(new Set(next.lunch))
        .filter((d) => d >= 0 && d <= 6)
        .sort((a, b) => a - b),
      dinner: Array.from(new Set(next.dinner))
        .filter((d) => d >= 0 && d <= 6)
        .sort((a, b) => a - b),
    };

    const otherPlans = plans.filter((p) => p.weekIdentifier !== selectedWeek);
    const existing = plans.find((p) => p.weekIdentifier === selectedWeek);
    const merged: WeekPlan = {
      weekIdentifier: selectedWeek,
      days: existing?.days ?? [],
      activeDayIndices: normalized,
    };
    onUpdatePlans([...otherPlans, merged]);
  };

  const toggleDay = (slot: MealSlotType, idx: number) => {
    setActiveDayIndices((prev) => {
      const current = prev[slot];
      const nextSlot = current.includes(idx)
        ? current.filter((d) => d !== idx)
        : [...current, idx].sort((a, b) => a - b);

      const next = {
        ...prev,
        [slot]: nextSlot,
      };
      persistActiveDaysForWeek(next);
      return next;
    });
  };

  const getDayPlan = (dayId: number): DayPlan => {
    return currentPlan.days.find((d) => d.dayId === dayId) ?? getDefaultDayPlan(dayId);
  };

  const updateDayPlan = (dayId: number, nextDay: DayPlan) => {
    const existingPlanIdx = plans.findIndex((p) => p.weekIdentifier === selectedWeek);
    const newPlans = [...plans];

    if (existingPlanIdx > -1) {
      const dayIdx = newPlans[existingPlanIdx].days.findIndex((d) => d.dayId === dayId);
      if (dayIdx > -1) {
        newPlans[existingPlanIdx].days[dayIdx] = nextDay;
      } else {
        newPlans[existingPlanIdx].days.push(nextDay);
      }
      newPlans[existingPlanIdx].days.sort((a, b) => a.dayId - b.dayId);
      newPlans[existingPlanIdx].activeDayIndices = activeDayIndices;
    } else {
      newPlans.push({
        weekIdentifier: selectedWeek,
        days: [nextDay],
        activeDayIndices,
      });
    }

    onUpdatePlans(newPlans);
  };

  const updateSlotPlan = (
    dayId: number,
    slot: MealSlotType,
    patch: Partial<MealSlotPlan>
  ) => {
    const current = getDayPlan(dayId);
    const next: DayPlan = {
      ...current,
      [slot]: {
        ...current[slot],
        ...patch,
      },
    };
    updateDayPlan(dayId, next);
  };

  const updateDayRecipe = (dayId: number, slot: MealSlotType, recipeId: number | null) => {
    updateSlotPlan(dayId, slot, { recipeId, freeText: null });
    setShowRecipeModal(null);
    setFreeTextDraft("");
    setModalSearchTerm("");
    setModalCategoryFilter("Alla");
  };

  const updateDayFreeText = (dayId: number, slot: MealSlotType, text: string) => {
    const cleaned = text.trim();
    updateSlotPlan(dayId, slot, {
      recipeId: null,
      freeText: cleaned.length ? cleaned : null,
    });
    setShowRecipeModal(null);
    setFreeTextDraft("");
    setModalSearchTerm("");
    setModalCategoryFilter("Alla");
  };

  const buildWeekExcludes = (exclude?: { dayId: number; slot: MealSlotType }) => {
    const usedIds = new Set<number>();
    const usedCategories = new Set<string>();

    currentPlan.days.forEach((day) => {
      (["lunch", "dinner"] as MealSlotType[]).forEach((slot) => {
        if (exclude && exclude.dayId === day.dayId && exclude.slot === slot) return;
        const recipeId = day[slot].recipeId;
        if (recipeId == null) return;

        usedIds.add(recipeId);
        const recipe = recipes.find((x) => x.id === recipeId);
        if (recipe) usedCategories.add(recipe.category);
      });
    });

    return { usedIds, usedCategories };
  };

  const pickSmartRecipe = (excludeIds: Set<number>, excludeCategories: Set<string>) => {
    if (recipes.length === 0) return null;
    const unusedRecipes = recipes.filter((recipe) => !excludeIds.has(recipe.id));
    if (unusedRecipes.length === 0) {
      return pickWeightedRecipe(recipes, excludeCategories);
    }

    const unusedAndNewCategory = unusedRecipes.filter(
      (recipe) => !excludeCategories.has(recipe.category)
    );

    if (unusedAndNewCategory.length > 0) {
      return pickWeightedRecipe(unusedAndNewCategory, excludeCategories);
    }
    return pickWeightedRecipe(unusedRecipes, excludeCategories);
  };

  const randomizeAll = () => {
    const { usedIds, usedCategories } = buildWeekExcludes();
    const updates = new Map<number, DayPlan>(
      currentPlan.days.map((d) => [d.dayId, { ...d, lunch: { ...d.lunch }, dinner: { ...d.dinner } }])
    );

    ALL_DAYS.forEach((dayId) => {
      (["lunch", "dinner"] as MealSlotType[]).forEach((slot) => {
        if (!activeDayIndices[slot].includes(dayId)) return;
        const selected = pickSmartRecipe(usedIds, usedCategories);
        const base = updates.get(dayId) ?? getDefaultDayPlan(dayId);

        if (selected) {
          base[slot] = { recipeId: selected.id, freeText: null };
          usedIds.add(selected.id);
          usedCategories.add(selected.category);
        }
        updates.set(dayId, base);
      });
    });

    const mergedDays = Array.from(updates.values()).sort((a, b) => a.dayId - b.dayId);
    const otherPlans = plans.filter((p) => p.weekIdentifier !== selectedWeek);
    onUpdatePlans([
      ...otherPlans,
      { weekIdentifier: selectedWeek, days: mergedDays, activeDayIndices },
    ]);
  };

  const randomizeSlot = (dayId: number, slot: MealSlotType) => {
    const { usedIds, usedCategories } = buildWeekExcludes({ dayId, slot });
    const selected = pickSmartRecipe(usedIds, usedCategories);
    if (!selected) return;
    updateSlotPlan(dayId, slot, { recipeId: selected.id, freeText: null });
  };

  const handleExportAll = () => {
    generateICS(selectedWeek, currentPlan.days, recipes, {
      activeDayIndices,
    });
  };

  const handleExportDay = (dayId: number) => {
    const day = getDayPlan(dayId);
    const slots = (["lunch", "dinner"] as MealSlotType[]).filter((slot) =>
      activeDayIndices[slot].includes(dayId)
    );
    if (slots.length === 0) return;

    const dayShort = SWEDISH_DAYS[dayId].substring(0, 3);
    generateICS(selectedWeek, [day], recipes, {
      fileName: `matplan-${selectedWeek}-${dayShort}`,
      slots,
      activeDayIndices: {
        lunch: activeDayIndices.lunch.includes(dayId) ? [dayId] : [],
        dinner: activeDayIndices.dinner.includes(dayId) ? [dayId] : [],
      },
    });
  };

  const handleSaveCookedAll = async () => {
    const byRecipeId = new Map<number, string>();

    currentPlan.days.forEach((day) => {
      (["lunch", "dinner"] as MealSlotType[]).forEach((slot) => {
        if (!activeDayIndices[slot].includes(day.dayId)) return;
        const recipeId = day[slot].recipeId;
        if (recipeId == null) return;

        const cookDate = isoWeekDayToISODate(selectedWeek, day.dayId);
        const existing = byRecipeId.get(recipeId);
        if (!existing || cookDate > existing) {
          byRecipeId.set(recipeId, cookDate);
        }
      });
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

    for (const endpoint of CALENDAR_PROXY_ENDPOINT_CANDIDATES) {
      try {
        const requestUrl = buildCalendarProxyRequestUrlForEndpoint(endpoint, normalizedUrl);
        const response = await fetch(requestUrl, { cache: "no-store" });
        const responseText = await response.text();

        if (!response.ok) {
          continue;
        }

        const events = extractIcsEventPeriods(responseText, selectedWeek);
        const filteredEvents = events.filter((event) => {
          const normalizedSummary = normalizeSummaryForMatch(event.summary);
          const hasExportTag = /X-MATPLAN-EXPORT:1/i.test(event.description);
          if (hasExportTag) return false;
          if (!normalizedSummary) return true;
          return !excludedCalendarSummaries.has(normalizedSummary);
        });

        setBusyDaytimeDays(computeBusyDaytimeDays(selectedWeek, filteredEvents));
        setBusyEveningDays(computeBusyEveningDays(selectedWeek, filteredEvents));
        setDaytimeEventsByDay(buildWeekDaytimeEvents(selectedWeek, filteredEvents));
        setEveningEventsByDay(buildWeekEveningEvents(selectedWeek, filteredEvents));
        return;
      } catch {
        // Prova nästa endpoint-kandidat.
      }
    }

    setBusyDaytimeDays(new Set());
    setBusyEveningDays(new Set());
    setDaytimeEventsByDay(new Map());
    setEveningEventsByDay(new Map());
  };

  useEffect(() => {
    void syncCalendarBusyDays();
  }, [selectedWeek, excludedCalendarSummaries]);

  const renderMealSection = (dayId: number, slot: MealSlotType) => {
    if (!activeDayIndices[slot].includes(dayId)) return null;

    const dayPlan = getDayPlan(dayId);
    const slotPlan = dayPlan[slot];
    const recipe =
      slotPlan.recipeId != null
        ? recipes.find((r) => r.id === slotPlan.recipeId) ?? null
        : null;
    const freeText = (slotPlan.freeText ?? "").trim();
    const hasSomething = !!recipe || freeText.length > 0;

    return (
      <div key={`${dayId}-${slot}`} className="rounded-xl border border-gray-100 bg-gray-50 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {SLOT_LABELS[slot]}
            </p>
            {recipe ? (
              <>
                <h3 className="text-sm md:text-base font-bold text-gray-900 leading-tight">
                  {recipe.name}
                </h3>
                <div className="flex flex-wrap gap-2 items-center mt-1">
                  <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                    {recipe.category}
                  </span>
                  <span className="text-[9px] text-gray-400">
                    Lagad: {formatDate(recipe.lastCooked)}
                  </span>
                </div>
              </>
            ) : freeText ? (
              <>
                <h3 className="text-sm md:text-base font-bold text-gray-900 leading-tight">
                  {freeText}
                </h3>
                <span className="inline-block mt-1 text-[9px] bg-white border border-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                  Fritext
                </span>
              </>
            ) : (
              <p className="text-xs text-gray-400 italic mt-0.5">Ingen rätt vald...</p>
            )}
          </div>

          <div className="flex gap-1.5 shrink-0 pl-1">
            <button
              onClick={() => randomizeSlot(dayId, slot)}
              className="p-1.5 text-gray-400 hover:text-emerald-500 bg-white rounded-lg border border-gray-200 transition-colors"
              title={`Slumpa ${SLOT_LABELS[slot].toLowerCase()}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
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
                setShowRecipeModal({ dayId, slot });
                setFreeTextDraft((slotPlan.freeText ?? "").trim());
              }}
              className="p-1.5 text-gray-400 hover:text-emerald-500 bg-white rounded-lg border border-gray-200 transition-colors"
              title={`Välj rätt för ${SLOT_LABELS[slot].toLowerCase()}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
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
              onClick={() =>
                recipe
                  ? navigate(`/recipes/${recipe.id}/view`, {
                      state: { from: `${location.pathname}${location.search}` },
                    })
                  : null
              }
              disabled={!recipe}
              className="p-1.5 text-gray-400 hover:text-emerald-500 bg-white rounded-lg border border-gray-200 transition-colors disabled:opacity-40"
              title="Visa recept"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
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
            <button
              onClick={() => updateDayRecipe(dayId, slot, null)}
              disabled={!hasSomething}
              className="p-1.5 text-gray-400 hover:text-red-500 bg-white rounded-lg border border-gray-200 transition-colors disabled:opacity-40"
              title="Rensa vald rätt"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn">
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

      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <label className="block text-sm font-semibold text-gray-700">
          Vilka dagar planerar vi för?
        </label>

        {(["lunch", "dinner"] as MealSlotType[]).map((slot) => (
          <div key={slot} className="space-y-2">
            <span className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide">
              {SLOT_LABELS[slot]}
            </span>
            <div className="grid grid-cols-7 gap-1.5">
              {SWEDISH_DAYS.map((day, idx) => {
                const isActive = activeDayIndices[slot].includes(idx);
                const hasDaytime = slot === "lunch" && busyDaytimeDays.has(idx);
                const hasEvening = slot === "dinner" && busyEveningDays.has(idx);
                return (
                  <button
                    key={`${slot}-${day}`}
                    onClick={() => toggleDay(slot, idx)}
                    className={`relative min-w-0 px-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${
                      isActive
                        ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-500"
                        : "bg-gray-100 text-gray-500 border border-transparent"
                    }`}
                    title={day}
                  >
                    <span>{day.substring(0, 3)}</span>
                    {hasDaytime && (
                      <span
                        className="absolute top-1 right-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-500"
                        title="Aktivitet mellan 11:00-14:30"
                      />
                    )}
                    {hasEvening && (
                      <span
                        className="absolute top-1 right-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                        title="Aktivitet mellan 16:00-21:00"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <div className="flex gap-3">
        <button
          onClick={randomizeAll}
          className="flex-1 bg-emerald-600 text-white py-3 px-4 rounded-2xl font-bold shadow-lg shadow-emerald-200 active:scale-95 transition-transform"
        >
          Slumpa fram allt
        </button>
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
        <button
          onClick={handleSaveCookedAll}
          className="flex-none bg-emerald-50 text-emerald-700 p-4 rounded-2xl shadow-sm border border-emerald-100 active:scale-95 transition-transform"
          title="Spara samtliga planerade rätter som lagade"
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

      <div className="space-y-4">
        {dayIndicesToRender.length > 0 ? (
          dayIndicesToRender.map((dayId) => {
            const hasDaytimeActivity = busyDaytimeDays.has(dayId);
            const hasEveningActivity = busyEveningDays.has(dayId);
            return (
              <div
                key={dayId}
                className="group bg-white p-3 rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-colors space-y-2"
                onClick={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("button")) return;
                  if (!hasDaytimeActivity && !hasEveningActivity) return;
                  setShowDayEventsModal(dayId);
                }}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                      {SWEDISH_DAYS[dayId]}
                    </span>
                    {hasDaytimeActivity && (
                      <span className="text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full font-semibold">
                        Dagsaktivitet
                      </span>
                    )}
                    {hasEveningActivity && (
                      <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                        Kvällsaktivitet
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleExportDay(dayId)}
                    className="p-1.5 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-lg transition-colors"
                    title="Ladda ner denna dag"
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
                </div>

                {renderMealSection(dayId, "lunch")}
                {renderMealSection(dayId, "dinner")}
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 text-gray-400">
            Inga dagar valda för planering.
          </div>
        )}
      </div>

      {showRecipeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg md:text-xl font-bold">
                {SWEDISH_DAYS[showRecipeModal.dayId]} - {SLOT_LABELS[showRecipeModal.slot]}
              </h3>
              <button
                onClick={() => {
                  setShowRecipeModal(null);
                  setFreeTextDraft("");
                  setModalSearchTerm("");
                  setModalCategoryFilter("Alla");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="space-y-2">
                <input
                  type="text"
                  value={modalSearchTerm}
                  onChange={(e) => setModalSearchTerm(e.target.value)}
                  placeholder="Sök rätt..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:border-emerald-500 focus:outline-none"
                />
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
                    onClick={() =>
                      updateDayFreeText(
                        showRecipeModal.dayId,
                        showRecipeModal.slot,
                        freeTextDraft
                      )
                    }
                    className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl text-xs md:text-sm font-bold"
                  >
                    Spara fritext
                  </button>
                  <button
                    onClick={() =>
                      updateDayFreeText(showRecipeModal.dayId, showRecipeModal.slot, "")
                    }
                    className="flex-none px-4 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl text-xs md:text-sm font-bold"
                    title="Rensa fritext"
                  >
                    Rensa
                  </button>
                </div>
              </div>

              <button
                onClick={() =>
                  updateDayRecipe(showRecipeModal.dayId, showRecipeModal.slot, null)
                }
                className="w-full text-left p-4 rounded-2xl hover:bg-gray-50 transition-colors border-2 border-transparent hover:border-gray-200 text-red-500 font-semibold"
              >
                Rensa vald rätt
              </button>

              {filteredModalRecipes.map((r) => (
                <button
                  key={r.id}
                  onClick={() =>
                    updateDayRecipe(showRecipeModal.dayId, showRecipeModal.slot, r.id)
                  }
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
            </div>
          </div>
        </div>
      )}

      {showDayEventsModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold">
                Aktiviteter: {SWEDISH_DAYS[showDayEventsModal]}
              </h3>
              <button
                onClick={() => setShowDayEventsModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {(daytimeEventsByDay.get(showDayEventsModal) ?? []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-sky-700">
                    Dagsaktivitet (11:00-14:30)
                  </p>
                  {(daytimeEventsByDay.get(showDayEventsModal) ?? []).map((event, index) => (
                    <div
                      key={`day-${event.start.toISOString()}-${event.end.toISOString()}-${index}`}
                      className="rounded-xl border border-sky-100 bg-sky-50/40 p-3"
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
              )}

              {(eveningEventsByDay.get(showDayEventsModal) ?? []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">
                    Kvällsaktivitet (16:00-21:00)
                  </p>
                  {(eveningEventsByDay.get(showDayEventsModal) ?? []).map((event, index) => (
                    <div
                      key={`evening-${event.start.toISOString()}-${event.end.toISOString()}-${index}`}
                      className="rounded-xl border border-amber-100 bg-amber-50/40 p-3"
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealPlanner;
