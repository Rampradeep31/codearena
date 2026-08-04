import React from 'react';
import { SUPPORTED_LANGUAGES } from './MonacoConfig';

export default function LanguageSelector({ currentLanguage, onLanguageChange, disabled = false }) {
  return (
    <div className="flex items-center space-x-2">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:inline">
        Language:
      </span>
      <select
        value={currentLanguage}
        onChange={(e) => onLanguageChange(e.target.value)}
        disabled={disabled}
        className="bg-slate-800 text-slate-100 text-xs sm:text-sm font-medium border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-slate-600 transition-colors disabled:opacity-50 cursor-pointer"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.id} value={lang.id}>
            {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
}
