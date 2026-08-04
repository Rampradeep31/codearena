import React, { useState, useEffect, useRef, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import EditorToolbar from './EditorToolbar';
import EditorStatusBar from './EditorStatusBar';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_TEMPLATES,
  getMonacoOptions,
} from './MonacoConfig';

export default function CodeEditor({
  initialCode = '',
  initialLanguage = 'python',
  attemptId = 1,
  questionId = 1,
  onCodeChange,
  onLanguageChange,
  onRun,
  onSubmit,
  running = false,
  submitting = false,
  readOnly = false,
  viewMode = 'split',
  onViewModeChange,
  compilationError = null,
}) {
  // ── State ───────────────────────────────────────────────────
  const [language, setLanguage] = useState(initialLanguage || 'python');
  const [fontSize, setFontSize] = useState(() => {
    return Number(localStorage.getItem('codearena_editor_fontsize')) || 14;
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('codearena_editor_theme') || 'vs-dark';
  });
  const [minimap, setMinimap] = useState(() => {
    return localStorage.getItem('codearena_editor_minimap') === 'true';
  });
  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1 });
  const [saveStatus, setSaveStatus] = useState('Saved');

  // Per-language code buffer dictionary (Requirement 4)
  const [codeBuffer, setCodeBuffer] = useState(() => {
    const storageKey = `codearena_buffer_attempt_${attemptId}_q_${questionId}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          return {
            python: parsed.python || LANGUAGE_TEMPLATES.python,
            java: parsed.java || LANGUAGE_TEMPLATES.java,
            c: parsed.c || LANGUAGE_TEMPLATES.c,
            cpp: parsed.cpp || LANGUAGE_TEMPLATES.cpp,
          };
        }
      }
    } catch (e) {
      console.warn('Could not parse saved code buffer:', e);
    }

    return {
      python: initialLanguage === 'python' && initialCode ? initialCode : LANGUAGE_TEMPLATES.python,
      java: initialLanguage === 'java' && initialCode ? initialCode : LANGUAGE_TEMPLATES.java,
      c: initialLanguage === 'c' && initialCode ? initialCode : LANGUAGE_TEMPLATES.c,
      cpp: initialLanguage === 'cpp' && initialCode ? initialCode : LANGUAGE_TEMPLATES.cpp,
    };
  });

  // Current active code string
  const currentCode = codeBuffer[language] || LANGUAGE_TEMPLATES[language] || '';

  // ── Refs ────────────────────────────────────────────────────
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const decorationsRef = useRef([]);

  // Save font size & theme preferences
  useEffect(() => {
    localStorage.setItem('codearena_editor_fontsize', fontSize);
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('codearena_editor_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('codearena_editor_minimap', minimap);
  }, [minimap]);

  // ── Sync LocalStorage Autosave (Requirement 5 & 6) ──────────
  const persistBufferToStorage = useCallback((bufferToSave) => {
    const storageKey = `codearena_buffer_attempt_${attemptId}_q_${questionId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(bufferToSave));
      setSaveStatus('Saved');
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, [attemptId, questionId]);

  // Autosave interval every 2 seconds
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      setSaveStatus('Saving...');
      persistBufferToStorage(codeBuffer);
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [codeBuffer, persistBufferToStorage]);

  // Notify parent on change
  useEffect(() => {
    if (onCodeChange) {
      onCodeChange(currentCode, language);
    }
  }, [currentCode, language, onCodeChange]);

  // ── Monaco Mount Handler ────────────────────────────────────
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({
        line: e.position.lineNumber,
        column: e.position.column,
      });
    });

    // Keyboard Shortcuts (Requirement 9)
    // Ctrl+S / Cmd+S -> Run Code
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onRun && !running && !readOnly) onRun();
    });

    // Ctrl+Enter / Cmd+Enter -> Run Code
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (onRun && !running && !readOnly) onRun();
    });

    // Shift+Enter -> Submit Code
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      if (onSubmit && !submitting && !readOnly) onSubmit();
    });
  };

  // ── Code Change Handler ─────────────────────────────────────
  const handleCodeChange = (newVal) => {
    const val = newVal ?? '';
    setCodeBuffer((prev) => {
      const next = { ...prev, [language]: val };
      persistBufferToStorage(next);
      return next;
    });
  };

  // ── Language Switch Handler (Requirement 4) ─────────────────
  const handleLanguageChange = (newLang) => {
    if (newLang === language) return;
    setLanguage(newLang);
    if (onLanguageChange) {
      onLanguageChange(newLang, codeBuffer[newLang] || LANGUAGE_TEMPLATES[newLang]);
    }
  };

  // ── Reset Code to Default Template ──────────────────────────
  const handleResetTemplate = () => {
    const template = LANGUAGE_TEMPLATES[language] || '';
    setCodeBuffer((prev) => {
      const next = { ...prev, [language]: template };
      persistBufferToStorage(next);
      return next;
    });
  };

  // ── Highlight Error Line Decorations (Requirement 16) ──────
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (compilationError && typeof compilationError === 'string') {
      const lineMatch = compilationError.match(/line\s+(\d+)/i) || compilationError.match(/:(\d+):/);
      if (lineMatch && lineMatch[1]) {
        const lineNo = parseInt(lineMatch[1], 10);
        const newDecorations = [
          {
            range: new monaco.Range(lineNo, 1, lineNo, 1000),
            options: {
              isWholeLine: true,
              className: 'bg-rose-950/60 border-l-4 border-rose-500',
              glyphMarginClassName: 'bg-rose-500',
              hoverMessage: { value: `**Compilation Error**: ${compilationError}` },
            },
          },
        ];
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
        return;
      }
    }

    // Clear decorations if no error
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
  }, [compilationError]);

  const monacoLang = SUPPORTED_LANGUAGES.find((l) => l.id === language)?.monacoLang || 'python';

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Editor Toolbar */}
      <EditorToolbar
        language={language}
        onLanguageChange={handleLanguageChange}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === 'vs-dark' ? 'light' : 'vs-dark'))}
        minimap={minimap}
        onMinimapToggle={() => setMinimap((m) => !m)}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onRun={onRun}
        onSubmit={onSubmit}
        onResetTemplate={handleResetTemplate}
        running={running}
        submitting={submitting}
        readOnly={readOnly}
      />

      {/* Monaco Editor Container */}
      <div className="flex-1 relative w-full min-h-[300px]">
        <MonacoEditor
          height="100%"
          language={monacoLang}
          theme={theme}
          value={currentCode}
          onChange={handleCodeChange}
          onMount={handleEditorDidMount}
          options={getMonacoOptions({ fontSize, readOnly, minimap, theme })}
          loading={
            <div className="flex items-center justify-center h-full bg-slate-950 text-slate-400 text-sm font-mono">
              Loading Monaco Editor...
            </div>
          }
        />
      </div>

      {/* Status Bar */}
      <EditorStatusBar
        language={language}
        cursorPos={cursorPos}
        saveStatus={saveStatus}
        readOnly={readOnly}
      />
    </div>
  );
}
