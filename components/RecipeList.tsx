
import React, { useState } from 'react';
import { Recipe, RecipeCategory, RECIPE_CATEGORIES } from '../types';

interface RecipeListProps {
  recipes: Recipe[];
  onUpdateRecipes: (recipes: Recipe[]) => void;
}

const RecipeList: React.FC<RecipeListProps> = ({ recipes, onUpdateRecipes }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<RecipeCategory | 'Alla'>('Alla');

  const [newName, setNewName] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newCategory, setNewCategory] = useState<RecipeCategory>('Annat');
  const [currentLastCooked, setCurrentLastCooked] = useState<string | null | undefined>(null);

  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (r.source && r.source.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = categoryFilter === 'Alla' || r.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const newRecipe: Recipe = {
      id: Date.now(),
      name: newName,
      source: newSource || null,
      category: newCategory,
      hasRecipeContent: false,
      lastCooked: null
    };
    onUpdateRecipes([...recipes, newRecipe]);
    resetForm();
    setIsAdding(false);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || editingId === null) return;
    onUpdateRecipes(recipes.map(r => r.id === editingId ? { 
      ...r, 
      name: newName, 
      source: newSource || null,
      category: newCategory,
      lastCooked: currentLastCooked
    } : r));
    resetForm();
    setEditingId(null);
  };

  const handleResetLastCooked = () => {
    setCurrentLastCooked(null);
  };

  const handleDelete = (id: number) => {
    if (confirm('Är du säker på att du vill ta bort rätten?')) {
      onUpdateRecipes(recipes.filter(r => r.id !== id));
    }
  };

  const startEdit = (recipe: Recipe) => {
    setEditingId(recipe.id);
    setNewName(recipe.name);
    setNewSource(recipe.source || '');
    setNewCategory(recipe.category);
    setCurrentLastCooked(recipe.lastCooked);
    setIsAdding(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setNewName('');
    setNewSource('');
    setNewCategory('Annat');
    setCurrentLastCooked(null);
  };

  const cancel = () => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Aldrig';
    return new Date(isoString).toLocaleDateString('sv-SE');
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-24">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input 
            type="text"
            placeholder="Sök rätter..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-10 bg-gray-100 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 font-medium"
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button 
          onClick={() => { setIsAdding(true); setEditingId(null); resetForm(); }}
          className="bg-emerald-600 text-white p-3 rounded-2xl shadow-lg active:scale-95 transition-transform"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 no-scrollbar">
        {['Alla', ...RECIPE_CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat as any)}
            className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              categoryFilter === cat 
              ? 'bg-gray-900 text-white shadow-md' 
              : 'bg-white border border-gray-100 text-gray-500'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {(isAdding || editingId !== null) && (
        <form onSubmit={editingId ? handleUpdate : handleAdd} className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-emerald-900">{editingId ? 'Ändra rätt' : 'Lägg till ny rätt'}</h3>
            {editingId && currentLastCooked && (
              <button 
                type="button"
                onClick={handleResetLastCooked}
                className="text-[10px] bg-white border border-emerald-200 text-emerald-600 px-2 py-1 rounded-lg font-bold uppercase hover:bg-emerald-100 transition-colors"
              >
                Nollställ senast lagad
              </button>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">Namn</label>
            <input 
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full p-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              placeholder="T.eg. Lasagne"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">Kategori</label>
            <select 
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as RecipeCategory)}
              className="w-full p-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            >
              {RECIPE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">Källa (valfritt)</label>
            <input 
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              className="w-full p-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              placeholder="T.ex. ICA.se"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold">
              Spara
            </button>
            <button type="button" onClick={cancel} className="px-6 py-3 text-emerald-600 font-bold">
              Avbryt
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest pl-1">Dina sparade rätter ({filteredRecipes.length})</h2>
        {filteredRecipes.length > 0 ? (
          filteredRecipes.map(recipe => (
            <div key={recipe.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between shadow-sm">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-0.5">
                  <h4 className="font-bold text-gray-900 truncate">{recipe.name}</h4>
                  <span className="text-[9px] bg-gray-50 text-gray-400 border border-gray-100 px-1 rounded uppercase font-bold">{recipe.category}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-gray-400">
                  <span className="truncate italic pr-2">{recipe.source || 'Ingen källa'}</span>
                  <span className="whitespace-nowrap">Senast: {formatDate(recipe.lastCooked)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => startEdit(recipe)}
                  className="p-2 text-gray-400 hover:text-emerald-500 bg-gray-50 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button 
                  onClick={() => handleDelete(recipe.id)}
                  className="p-2 text-gray-400 hover:text-red-500 bg-gray-50 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
             <p>Inga rätter matchar din sökning.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeList;
