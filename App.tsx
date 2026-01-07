
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Recipe, WeekPlan } from './types.ts';
import { getRecipes, saveRecipes, getPlans, savePlans, isAuthorized } from './services/storageService.ts';
import MealPlanner from './components/MealPlanner.tsx';
import RecipeList from './components/RecipeList.tsx';
import Login from './components/Login.tsx';

const NavLink: React.FC<{ to: string, children: React.ReactNode }> = ({ to, children }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link 
      to={to} 
      className={`flex-1 text-center py-4 text-sm font-semibold transition-colors ${
        isActive ? 'text-emerald-600 border-t-2 border-emerald-600' : 'text-gray-500 hover:text-gray-800'
      }`}
    >
      {children}
    </Link>
  );
};

const App: React.FC = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plans, setPlans] = useState<WeekPlan[]>([]);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (isAuthorized()) {
      setAuthed(true);
      setRecipes(getRecipes());
      setPlans(getPlans());
    }
  }, []);

  if (!authed) {
    return <Login onSuccess={() => {
      setAuthed(true);
      setRecipes(getRecipes());
      setPlans(getPlans());
    }} />;
  }

  const handleUpdateRecipes = (newRecipes: Recipe[]) => {
    setRecipes(newRecipes);
    saveRecipes(newRecipes);
  };

  const handleUpdatePlans = (newPlans: WeekPlan[]) => {
    setPlans(newPlans);
    savePlans(newPlans);
  };

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col max-w-lg mx-auto bg-white shadow-xl relative pb-20 md:pb-0">
        <header className="px-6 pt-8 pb-4 bg-white sticky top-0 z-10 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Matplaneraren</h1>
          <p className="text-sm text-gray-500">Planera smart, ät gott.</p>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6">
          <Routes>
            <Route path="/" element={
              <MealPlanner 
                recipes={recipes} 
                plans={plans} 
                onUpdatePlans={handleUpdatePlans} 
                onUpdateRecipes={handleUpdateRecipes}
              />
            } />
            <Route path="/recipes" element={
              <RecipeList 
                recipes={recipes} 
                onUpdateRecipes={handleUpdateRecipes} 
              />
            } />
          </Routes>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-100 flex shadow-2xl z-20">
          <NavLink to="/">
            <div className="flex flex-col items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Planering
            </div>
          </NavLink>
          <NavLink to="/recipes">
            <div className="flex flex-col items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Mina rätter
            </div>
          </NavLink>
        </nav>
      </div>
    </HashRouter>
  );
};

export default App;
