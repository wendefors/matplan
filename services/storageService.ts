
import { Recipe, WeekPlan } from '../types';
import { 
  INITIAL_RECIPES, 
  LOCAL_STORAGE_KEY_RECIPES, 
  LOCAL_STORAGE_KEY_PLANS, 
  LOCAL_STORAGE_KEY_ACTIVE_DAYS,
  LOCAL_STORAGE_KEY_AUTH_EXPIRY 
} from '../constants';

export const getRecipes = (): Recipe[] => {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY_RECIPES);
  if (!stored) {
    localStorage.setItem(LOCAL_STORAGE_KEY_RECIPES, JSON.stringify(INITIAL_RECIPES));
    return INITIAL_RECIPES;
  }
  return JSON.parse(stored);
};

export const saveRecipes = (recipes: Recipe[]) => {
  localStorage.setItem(LOCAL_STORAGE_KEY_RECIPES, JSON.stringify(recipes));
};

export const getPlans = (): WeekPlan[] => {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY_PLANS);
  return stored ? JSON.parse(stored) : [];
};

export const savePlans = (plans: WeekPlan[]) => {
  localStorage.setItem(LOCAL_STORAGE_KEY_PLANS, JSON.stringify(plans));
};

export const getActiveDayIndices = (): number[] => {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY_ACTIVE_DAYS);
  return stored ? JSON.parse(stored) : [0, 1, 2, 3, 4, 5, 6];
};

export const saveActiveDayIndices = (indices: number[]) => {
  localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_DAYS, JSON.stringify(indices));
};

export const setAuthExpiry = (expiryTimestamp: number) => {
  localStorage.setItem(LOCAL_STORAGE_KEY_AUTH_EXPIRY, expiryTimestamp.toString());
};

export const isAuthorized = (): boolean => {
  const expiry = localStorage.getItem(LOCAL_STORAGE_KEY_AUTH_EXPIRY);
  if (!expiry) return false;
  return parseInt(expiry, 10) > Date.now();
};
