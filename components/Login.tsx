
import React, { useState } from 'react';
import { APP_PASSWORD, AUTH_DURATION_MS } from '../constants';
import { setAuthExpiry } from '../services/storageService';

interface LoginProps {
  onSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === APP_PASSWORD) {
      setAuthExpiry(Date.now() + AUTH_DURATION_MS);
      onSuccess();
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl border border-gray-100 animate-fadeIn">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Välkommen</h2>
          <p className="text-gray-500 mt-1">Ange lösenord för att fortsätta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="password"
            autoFocus
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            className={`w-full p-4 bg-gray-50 border-2 rounded-2xl focus:outline-none transition-all ${
              error ? 'border-red-300 bg-red-50' : 'border-transparent focus:border-emerald-500'
            }`}
            placeholder="Lösenord..."
          />
          {error && <p className="text-red-500 text-xs font-bold text-center">Fel lösenord, försök igen.</p>}
          <button 
            type="submit"
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-100 active:scale-95 transition-transform"
          >
            Logga in
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
