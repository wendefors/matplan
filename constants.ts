
import { Recipe } from './types';

export const INITIAL_RECIPES: Recipe[] = [
  { "id": 1, "name": "Fläskpannkaka med lingonsylt", "source": "Morberg lagar husmanskost", "hasRecipeContent": true, "category": "Kött", "lastCooked": null },
  { "id": 2, "name": "Makaronipudding", "source": "Morberg lagar husmanskost", "hasRecipeContent": true, "category": "Pasta", "lastCooked": null },
  { "id": 3, "name": "Grönkålspasta", "source": "Portionen under tian", "hasRecipeContent": true, "category": "Pasta", "lastCooked": null },
  { "id": 4, "name": "Zucchini- och svamppasta", "source": "Portionen under tian", "hasRecipeContent": true, "category": "Pasta", "lastCooked": null },
  { "id": 5, "name": "Chili sin carne", "source": "Portionen under tian", "hasRecipeContent": true, "category": "Vegetariskt", "lastCooked": null },
  { "id": 6, "name": "Fälldinska grytan", "source": "Lena", "hasRecipeContent": true, "category": "Kött", "lastCooked": null },
  { "id": 7, "name": "Köttfärssås", "source": "Mossarp", "hasRecipeContent": false, "category": "Pasta", "lastCooked": null },
  { "id": 8, "name": "Stekt falukorv med morotsstuvning", "source": null, "hasRecipeContent": false, "category": "Kött", "lastCooked": null },
  { "id": 9, "name": "Makaroner och köttbullar", "source": null, "hasRecipeContent": false, "category": "Pasta", "lastCooked": null },
  { "id": 10, "name": "Lax med sås i ugn", "source": null, "hasRecipeContent": false, "category": "Fisk", "lastCooked": null },
  { "id": 11, "name": "Tacos", "source": null, "hasRecipeContent": false, "category": "Annat", "lastCooked": null },
  { "id": 12, "name": "Kebab i pitabröd", "source": null, "hasRecipeContent": false, "category": "Annat", "lastCooked": null },
  { "id": 13, "name": "Fiskpinnar och potatismos", "source": null, "hasRecipeContent": false, "category": "Fisk", "lastCooked": null },
  { "id": 14, "name": "Panerad torsk", "source": null, "hasRecipeContent": false, "category": "Fisk", "lastCooked": null },
  { "id": 15, "name": "Korvstroganoff med ris", "source": "ICA.se – recept 533512", "hasRecipeContent": true, "category": "Kött", "lastCooked": null },
  { "id": 16, "name": "Flygande Jacob", "source": "ICA.se – recept 717569", "hasRecipeContent": true, "category": "Kyckling", "lastCooked": null },
  { "id": 17, "name": "Klassisk lasagne", "source": "ICA.se – recept 679675", "hasRecipeContent": true, "category": "Pasta", "lastCooked": null },
  { "id": 18, "name": "Raggmunk med fläsk", "source": "ICA.se – recept 721803", "hasRecipeContent": true, "category": "Kött", "lastCooked": null },
  { "id": 19, "name": "Äkta carbonara utan grädde", "source": "ICA.se – recept 726730", "hasRecipeContent": true, "category": "Pasta", "lastCooked": null },
  { "id": 20, "name": "One-pot pasta", "source": "ICA.se – recept 721661", "hasRecipeContent": true, "category": "Pasta", "lastCooked": null },
  { "id": 21, "name": "Pasticciata – krämig pastasås med salsiccia och mascarpone", "source": "Zeta.nu", "hasRecipeContent": true, "category": "Pasta", "lastCooked": null }
];

export const LOCAL_STORAGE_KEY_RECIPES = "matplaneraren_recipes_v3";
export const LOCAL_STORAGE_KEY_PLANS = "matplaneraren_plans_v2";
export const LOCAL_STORAGE_KEY_ACTIVE_DAYS = "matplaneraren_active_days_v1";
export const LOCAL_STORAGE_KEY_AUTH_EXPIRY = "matplaneraren_auth_expiry_v1";

export const APP_PASSWORD = "Torsgatan5!";
export const AUTH_DURATION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
