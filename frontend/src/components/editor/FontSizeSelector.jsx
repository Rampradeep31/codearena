import React from 'react';
import { FONT_SIZES } from './MonacoConfig';

export default function FontSizeSelector({ fontSize, onFontSizeChange }) {
  return (
    <div className="flex items-center space-x-1.5">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:inline">
        Font:
      </span>
      <select
        value={fontSize}
        onChange={(e) => onFontSizeChange(Number(e.target.value))}
        className="bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-slate-600 transition-colors cursor-pointer"
      >
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}px
          </option>
        ))}
      </select>
    </div>
  );
}
