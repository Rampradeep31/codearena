import React from 'react';
import { HiOutlineCheckCircle, HiOutlineClock, HiOutlineLockClosed } from 'react-icons/hi';

export default function EditorStatusBar({
  language,
  cursorPos = { line: 1, column: 1 },
  saveStatus = 'Saved',
  readOnly = false,
}) {
  return (
    <div className="bg-slate-950 border-t border-slate-800 px-4 py-1.5 flex items-center justify-between text-xs text-slate-400 font-mono select-none">
      {/* Left: Cursor & Language */}
      <div className="flex items-center space-x-4">
        <span className="flex items-center space-x-1">
          <span className="text-slate-500">Ln</span>
          <span className="text-slate-200">{cursorPos.line}</span>
          <span className="text-slate-500">Col</span>
          <span className="text-slate-200">{cursorPos.column}</span>
        </span>
        <span className="uppercase text-[10px] bg-slate-800 px-2 py-0.5 rounded text-indigo-400 font-bold border border-slate-700">
          {language}
        </span>
        <span className="text-slate-500 hidden sm:inline">UTF-8</span>
      </div>

      {/* Right: AutoSave & Lock status */}
      <div className="flex items-center space-x-3">
        {readOnly ? (
          <span className="flex items-center space-x-1 text-rose-400 font-semibold bg-rose-950/40 px-2 py-0.5 rounded border border-rose-900/50">
            <HiOutlineLockClosed className="w-3.5 h-3.5" />
            <span>Read Only</span>
          </span>
        ) : (
          <span className="flex items-center space-x-1 text-slate-400">
            {saveStatus === 'Saving...' ? (
              <>
                <HiOutlineClock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-amber-400">Saving...</span>
              </>
            ) : (
              <>
                <HiOutlineCheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Auto Saved</span>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
