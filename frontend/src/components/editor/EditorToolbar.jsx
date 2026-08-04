import React, { useState } from 'react';
import LanguageSelector from './LanguageSelector';
import FontSizeSelector from './FontSizeSelector';
import {
  HiOutlinePlay, HiOutlineUpload, HiOutlineSun, HiOutlineMoon,
  HiOutlineViewGrid, HiOutlineDocumentText, HiOutlineCode,
  HiOutlineQuestionMarkCircle, HiOutlineSparkles, HiOutlineRefresh,
} from 'react-icons/hi';

export default function EditorToolbar({
  language,
  onLanguageChange,
  fontSize,
  onFontSizeChange,
  theme,
  onThemeToggle,
  minimap,
  onMinimapToggle,
  viewMode,
  onViewModeChange,
  onRun,
  onSubmit,
  onResetTemplate,
  running,
  submitting,
  readOnly,
}) {
  const [showShortcuts, setShowShortcuts] = useState(false);

  return (
    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 select-none">
      {/* Left: Controls */}
      <div className="flex items-center space-x-3">
        <LanguageSelector
          currentLanguage={language}
          onLanguageChange={onLanguageChange}
          disabled={readOnly}
        />
        <FontSizeSelector
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
        />

        {/* Theme & Minimap Toggle */}
        <button
          onClick={onThemeToggle}
          title={`Switch to ${theme === 'vs-dark' ? 'Light' : 'Dark'} Theme`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
        >
          {theme === 'vs-dark' ? <HiOutlineSun className="w-4 h-4" /> : <HiOutlineMoon className="w-4 h-4" />}
        </button>

        <button
          onClick={onMinimapToggle}
          title={`Toggle Minimap (${minimap ? 'ON' : 'OFF'})`}
          className={`p-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            minimap
              ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/40'
              : 'text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-100'
          }`}
        >
          MAP
        </button>

        {/* Reset Template */}
        {!readOnly && (
          <button
            onClick={onResetTemplate}
            title="Reset code to template"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
          >
            <HiOutlineRefresh className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Center: Layout View Switcher */}
      {onViewModeChange && (
        <div className="hidden lg:flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button
            onClick={() => onViewModeChange('split')}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1 transition-colors ${
              viewMode === 'split' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HiOutlineViewGrid className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>
          <button
            onClick={() => onViewModeChange('problem')}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1 transition-colors ${
              viewMode === 'problem' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HiOutlineDocumentText className="w-3.5 h-3.5" />
            <span>Problem</span>
          </button>
          <button
            onClick={() => onViewModeChange('editor')}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1 transition-colors ${
              viewMode === 'editor' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HiOutlineCode className="w-3.5 h-3.5" />
            <span>Editor</span>
          </button>
        </div>
      )}

      {/* Right: Actions (Run & Submit) */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setShowShortcuts(true)}
          title="Keyboard Shortcuts"
          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
        >
          <HiOutlineQuestionMarkCircle className="w-5 h-5" />
        </button>

        <button
          onClick={onRun}
          disabled={running || readOnly}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 hover:border-emerald-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95"
        >
          <HiOutlinePlay className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          <span>{running ? 'Running...' : 'Run Code'}</span>
        </button>

        <button
          onClick={onSubmit}
          disabled={submitting || readOnly}
          className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md hover:shadow-emerald-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
        >
          <HiOutlineUpload className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
          <span>{submitting ? 'Submitting...' : 'Submit'}</span>
        </button>
      </div>

      {/* Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full shadow-2xl text-slate-200">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-base flex items-center space-x-2 text-indigo-400">
                <HiOutlineSparkles className="w-5 h-5" />
                <span>Monaco Editor Shortcuts</span>
              </h3>
              <button
                onClick={() => setShowShortcuts(false)}
                className="text-slate-400 hover:text-slate-100 text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center bg-slate-800/60 p-2 rounded">
                <span className="text-slate-300">Run Code</span>
                <kbd className="bg-slate-950 px-2 py-1 rounded text-emerald-400 font-mono">Ctrl + S / Ctrl + Enter</kbd>
              </div>
              <div className="flex justify-between items-center bg-slate-800/60 p-2 rounded">
                <span className="text-slate-300">Submit Code</span>
                <kbd className="bg-slate-950 px-2 py-1 rounded text-teal-400 font-mono">Shift + Enter</kbd>
              </div>
              <div className="flex justify-between items-center bg-slate-800/60 p-2 rounded">
                <span className="text-slate-300">Comment / Uncomment Line</span>
                <kbd className="bg-slate-950 px-2 py-1 rounded text-indigo-300 font-mono">Ctrl + /</kbd>
              </div>
              <div className="flex justify-between items-center bg-slate-800/60 p-2 rounded">
                <span className="text-slate-300">Find in Editor</span>
                <kbd className="bg-slate-950 px-2 py-1 rounded text-amber-300 font-mono">Ctrl + F</kbd>
              </div>
              <div className="flex justify-between items-center bg-slate-800/60 p-2 rounded">
                <span className="text-slate-300">Replace in Editor</span>
                <kbd className="bg-slate-950 px-2 py-1 rounded text-amber-300 font-mono">Ctrl + H</kbd>
              </div>
            </div>
            <button
              onClick={() => setShowShortcuts(false)}
              className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
