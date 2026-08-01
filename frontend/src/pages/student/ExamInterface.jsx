import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useAuth } from '../../context/AuthContext';
import { studentAPI, codeAPI } from '../../services/api';
import toast from 'react-hot-toast';
import WebcamProctor from '../../components/WebcamProctor';
import {
  HiOutlineCode, HiOutlinePlay, HiOutlineUpload, HiOutlineClock,
  HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlineShieldExclamation,
  HiOutlineExclamation, HiOutlineCheck, HiOutlineX,
} from 'react-icons/hi';

const LANG_MAP = {
  python: { label: 'Python', monaco: 'python', template: '# Write your solution here\n' },
  java: { label: 'Java', monaco: 'java', template: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write your solution here\n    }\n}\n' },
  c: { label: 'C', monaco: 'c', template: '#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n' },
  cpp: { label: 'C++', monaco: 'cpp', template: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n' },
};

export default function ExamInterface() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [submittingTest, setSubmittingTest] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [warningMsg, setWarningMsg] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Refs
  const autoSaveTimer = useRef(null);
  const lastSavedCode = useRef('');
  const violationDebounce = useRef(0);

  // ─── Load Data ─────────────────────────────────
  useEffect(() => {
    loadAttempt();
    requestFullscreen();
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [attemptId]);

  const loadAttempt = async () => {
    try {
      const [attemptRes, questionsRes] = await Promise.all([
        studentAPI.getAttempt(attemptId),
        studentAPI.getAttemptQuestions(attemptId),
      ]);
      const att = attemptRes.data;
      setAttempt(att);
      setViolationCount(att.violation_count || 0);

      if (att.status === 'submitted' || att.status === 'auto_submitted') {
        navigate(`/student/exam/${attemptId}/complete`, { replace: true });
        return;
      }

      const qs = questionsRes.data;
      if (!qs || qs.length === 0) {
        setLoadError('No questions were assigned for this attempt. Please contact your instructor.');
        setLoading(false);
        return;
      }
      setQuestions(qs);

      if (qs.length > 0) {
        const saved = qs[0];
        setLanguage(saved.saved_language || 'python');
        setCode(saved.saved_code || LANG_MAP[saved.saved_language || 'python']?.template || '');
        lastSavedCode.current = saved.saved_code || '';
      }

      const parseUTC = (str) => {
        if (!str) return Date.now();
        if (typeof str === 'number') return str;
        const s = String(str).trim();
        const hasTZ = s.endsWith('Z') || s.includes('+') || (s.lastIndexOf('-') > 10);
        return new Date(hasTZ ? s : `${s}Z`).getTime();
      };

      const expiresAt = parseUTC(att.expires_at || (Date.now() + 3600000));
      const now = Date.now();
      const diffSec = Math.floor((expiresAt - now) / 1000);
      setTimeLeft(Math.max(0, diffSec));
    } catch (err) {
      setLoadError(err.response?.data?.detail || 'Failed to load the examination. Please check your connection.');
    } finally { setLoading(false); }
  };

  // ─── Timer ─────────────────────────────────────
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (loading || !attempt || autoSubmittedRef.current) return;

    if (timeLeft <= 0) {
      autoSubmittedRef.current = true;
      handleAutoSubmit('time_expired');
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            handleAutoSubmit('time_expired');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, attempt, timeLeft]);

  // ─── Auto Save ────────────────────────────────
  useEffect(() => {
    autoSaveTimer.current = setInterval(() => {
      if (code !== lastSavedCode.current && questions[currentIdx]) {
        saveCode();
      }
    }, 12000);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [code, currentIdx]);

  const saveCode = async () => {
    if (!questions[currentIdx]) return;
    try {
      await studentAPI.saveCode(attemptId, {
        question_id: questions[currentIdx].question_id,
        language,
        source_code: code,
      });
      lastSavedCode.current = code;
    } catch { /* silent fail for auto-save */ }
  };

  const mountTime = useRef(Date.now());
  const hasEnteredFullscreen = useRef(false);

  // ─── Violation Monitoring ─────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (Date.now() - mountTime.current < 5000) return;
      if (document.hidden) recordViolation('tab_hidden');
    };
    const handleBlur = () => {
      if (Date.now() - mountTime.current < 5000) return;
      recordViolation('window_blur');
    };
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        hasEnteredFullscreen.current = true;
      } else if (hasEnteredFullscreen.current && Date.now() - mountTime.current > 5000) {
        recordViolation('fullscreen_exit');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [violationCount]);

  // ─── Online/Offline ───────────────────────────
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); toast.success('Connection restored'); saveCode(); };
    const handleOffline = () => { setIsOnline(false); toast.error('Connection lost. Your code is preserved locally.'); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [code]);

  const recordViolation = async (type) => {
    const now = Date.now();
    if (now - violationDebounce.current < 2000) return; // Dedup 2s
    violationDebounce.current = now;

    try {
      const res = await studentAPI.recordViolation(attemptId, { violation_type: type });
      const data = res.data || {};
      // Server is the source of truth for the count
      const newCount = typeof data.violation_count === 'number' ? data.violation_count : violationCount + 1;
      setViolationCount(newCount);

      if (data.auto_submitted || newCount >= (data.max_violations || attempt?.max_violations || 3)) {
        setWarningMsg('Maximum violations reached. Your test has been auto-submitted.');
        setTimeout(() => navigate(`/student/exam/${attemptId}/complete`, { replace: true }), 2000);
      } else if (newCount === 1) {
        setWarningMsg('Warning 1: You left the examination screen. This activity has been recorded.');
      } else if (newCount === 2) {
        setWarningMsg('Warning 2: Another violation may result in automatic submission.');
      }
    } catch { /* ignore */ }
  };

  const handleFaceTurn = () => {
    setWarningMsg('Warning: Head turned away! Please face forward and look at your screen.');
    toast.error('Camera Warning: Please face forward!', { id: 'cam-warn-turn', duration: 4000 });
  };

  const handleMultipleFaces = () => {
    setWarningMsg('Warning: Multiple persons detected in camera view! Ensure only you are in frame.');
    toast.error('Camera Warning: Multiple persons detected!', { id: 'cam-warn-multi', duration: 4000 });
  };

  const requestFullscreen = () => {
    try { document.documentElement.requestFullscreen?.(); }
    catch { /* ignore */ }
  };

  // ─── Navigation ───────────────────────────────
  const switchQuestion = (idx) => {
    if (idx === currentIdx) return;
    saveCode(); // Save current before switching
    setCurrentIdx(idx);
    const q = questions[idx];
    if (q) {
      setLanguage(q.saved_language || 'python');
      setCode(q.saved_code || LANG_MAP[q.saved_language || 'python']?.template || '');
      lastSavedCode.current = q.saved_code || '';
    }
    setRunResult(null);
  };

  // ─── Run Code ─────────────────────────────────
  const handleRun = async () => {
    if (!questions[currentIdx]) return;
    setRunning(true);
    setRunResult(null);
    saveCode();
    try {
      const res = await codeAPI.run({
        attempt_id: parseInt(attemptId),
        question_id: questions[currentIdx].question_id,
        language,
        source_code: code,
      });
      setRunResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Execution error');
    } finally { setRunning(false); }
  };

  // ─── Submit Code ──────────────────────────────
  const handleSubmit = async () => {
    if (!questions[currentIdx]) return;
    setSubmittingCode(true);
    saveCode();
    try {
      const res = await codeAPI.submit({
        attempt_id: parseInt(attemptId),
        question_id: questions[currentIdx].question_id,
        language,
        source_code: code,
      });
      toast.success(`Score: ${res.data.passed_test_cases}/${res.data.total_test_cases} test cases passed`);
      // Update question state
      const updated = [...questions];
      updated[currentIdx] = { ...updated[currentIdx], is_submitted: true, submission_score: res.data.score };
      setQuestions(updated);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Submission error');
    } finally { setSubmittingCode(false); }
  };

  // ─── Finish Test ──────────────────────────────
  const handleFinish = async () => {
    setSubmittingTest(true);
    saveCode();
    try {
      await studentAPI.finishTest(attemptId);
      navigate(`/student/exam/${attemptId}/complete`, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error finishing test');
    } finally { setSubmittingTest(false); setShowFinishModal(false); }
  };

  const handleAutoSubmit = async (reason) => {
    try { await studentAPI.finishTest(attemptId); }
    catch { /* already submitted */ }
    navigate(`/student/exam/${attemptId}/complete`, { replace: true });
  };

  // ─── Helpers ──────────────────────────────────
  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const currentQ = questions[currentIdx];

  if (loading) return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-dark-400">Loading examination...</p>
      </div>
    </div>
  );

  if (loadError) return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700/50 rounded-2xl p-8 max-w-md w-full text-center animate-fade-in">
        <h1 className="text-xl font-bold text-white mb-3">Assessment Reset Needed</h1>
        <p className="text-sm text-dark-400 mb-6">{loadError}</p>
        <div className="space-y-3">
          <button
            onClick={() => {
              setLoadError('');
              setAttempt({ id: Date.now(), violation_count: 0, max_violations: 3, status: 'in_progress' });
              setQuestions(DEFAULT_QUESTIONS);
              setLanguage('python');
              setCode(LANG_MAP['python'].template);
              setTimeLeft(3600);
              setLoading(false);
            }}
            className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-brand-500/20"
          >
            Start Fresh Assessment
          </button>
          <button
            onClick={() => { setLoading(true); setLoadError(''); loadAttempt(); }}
            className="w-full py-2 bg-dark-800 hover:bg-dark-700 text-dark-300 text-xs rounded-xl transition-colors"
          >
            Try Refreshing Connection
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-dark-950 flex flex-col no-select">
      {/* Warning Banner */}
      {warningMsg && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HiOutlineExclamation className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-amber-400">{warningMsg}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={requestFullscreen} className="text-xs bg-amber-500/20 text-amber-400 px-3 py-1 rounded hover:bg-amber-500/30">Return to Fullscreen</button>
            <button onClick={() => setWarningMsg('')} className="text-amber-500 hover:text-amber-400"><HiOutlineX className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Connection Banner */}
      {!isOnline && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-center text-sm text-red-400">
          Connection lost. Attempting to reconnect... Your code is preserved locally.
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-dark-900 border-b border-dark-700/50 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <HiOutlineCode className="w-5 h-5 text-brand-400" />
            <span className="font-bold text-white text-sm">CodeArena</span>
          </div>
          <span className="text-dark-500">|</span>
          <span className="text-sm text-dark-300">{user?.name}</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Violation Count */}
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded ${violationCount > 0 ? 'bg-amber-500/10 text-amber-500' : 'text-dark-400'}`}>
            <HiOutlineShieldExclamation className="w-3.5 h-3.5" />
            {violationCount} violation{violationCount !== 1 ? 's' : ''}
          </div>

          {/* Timer */}
          <div className={`flex items-center gap-1.5 font-mono text-sm font-bold px-3 py-1 rounded ${timeLeft < 300 ? 'bg-red-500/10 text-red-500 animate-pulse' : timeLeft < 600 ? 'bg-amber-500/10 text-amber-500' : 'text-white'}`}>
            <HiOutlineClock className="w-4 h-4" />
            {formatTime(timeLeft)}
          </div>

          {/* Finish */}
          <button onClick={() => setShowFinishModal(true)} className="px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded text-xs font-medium transition-colors">
            Finish Test
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Problem Statement */}
        <div className="w-[45%] border-r border-dark-700/50 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-5">
            {currentQ?.question && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-dark-400">Q{currentIdx + 1}.</span>
                  <h2 className="text-lg font-semibold text-white">{currentQ.question.title}</h2>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    currentQ.question.difficulty === 'easy' ? 'bg-emerald-500/10 text-emerald-500' :
                    currentQ.question.difficulty === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-red-500/10 text-red-500'
                  }`}>{currentQ.question.difficulty}</span>
                  <span className="text-xs text-dark-400 ml-auto">{currentQ.question.marks} marks</span>
                </div>

                <div className="prose prose-invert prose-sm max-w-none">
                  <div className="text-sm text-dark-200 whitespace-pre-wrap mb-4">{currentQ.question.statement}</div>

                  {currentQ.question.input_format && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1">Input Format</h4>
                      <p className="text-sm text-dark-400 whitespace-pre-wrap">{currentQ.question.input_format}</p>
                    </div>
                  )}
                  {currentQ.question.output_format && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1">Output Format</h4>
                      <p className="text-sm text-dark-400 whitespace-pre-wrap">{currentQ.question.output_format}</p>
                    </div>
                  )}
                  {currentQ.question.constraints && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1">Constraints</h4>
                      <p className="text-sm text-dark-400 font-mono whitespace-pre-wrap">{currentQ.question.constraints}</p>
                    </div>
                  )}

                  {/* Sample Test Cases */}
                  {currentQ.question.test_cases?.map((tc, i) => (
                    <div key={tc.id} className="mb-3">
                      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1">Sample {i + 1}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-dark-500 mb-0.5">Input</p>
                          <pre className="bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-xs text-dark-200 font-mono overflow-x-auto">{tc.input}</pre>
                        </div>
                        <div>
                          <p className="text-[10px] text-dark-500 mb-0.5">Output</p>
                          <pre className="bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-xs text-dark-200 font-mono overflow-x-auto">{tc.expected_output}</pre>
                        </div>
                      </div>
                    </div>
                  ))}

                  {currentQ.question.explanation && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1">Explanation</h4>
                      <p className="text-sm text-dark-400 whitespace-pre-wrap">{currentQ.question.explanation}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Code Editor */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Language Selector & Actions */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-dark-700/50 bg-dark-900/50">
            <select value={language} onChange={(e) => {
              const nextLang = e.target.value;
              setLanguage(nextLang);
              setCode(prev => (!prev || prev === LANG_MAP[language]?.template) ? (LANG_MAP[nextLang]?.template || '') : prev);
            }}
              className="px-2 py-1 bg-dark-800 border border-dark-600/50 rounded text-xs text-white focus:outline-none focus:border-brand-500">
              {Object.entries(LANG_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            <div className="flex items-center gap-2">
              <button onClick={handleRun} disabled={running || !code.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 disabled:opacity-40 text-white rounded text-xs font-medium transition-colors">
                {running ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiOutlinePlay className="w-3.5 h-3.5" />}
                {running ? 'Running...' : 'Run Code'}
              </button>
              <button onClick={handleSubmit} disabled={submittingCode || !code.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white rounded text-xs font-medium transition-colors">
                {submittingCode ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiOutlineUpload className="w-3.5 h-3.5" />}
                {submittingCode ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language={LANG_MAP[language]?.monaco || 'python'}
              value={code}
              onChange={(val) => setCode(val || '')}
              theme="vs-dark"
              options={{
                fontSize: 14,
                fontFamily: "'JetBrains Mono', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                roundedSelection: true,
                padding: { top: 12 },
                automaticLayout: true,
                tabSize: 4,
                wordWrap: 'on',
              }}
            />
          </div>

          {/* Run Results */}
          {runResult && (
            <div className="border-t border-dark-700/50 bg-dark-900/80 max-h-48 overflow-y-auto p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider">
                  {runResult.compilation_status === 'error' ? 'Compilation Error' : `Results: ${runResult.passed}/${runResult.total} Passed`}
                </h4>
                <button onClick={() => setRunResult(null)} className="text-dark-500 hover:text-white"><HiOutlineX className="w-3.5 h-3.5" /></button>
              </div>
              {runResult.compilation_error && (
                <pre className="text-xs text-red-400 font-mono bg-red-500/5 rounded p-2 mb-2 whitespace-pre-wrap">{runResult.compilation_error}</pre>
              )}
              {runResult.results?.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded mb-1 text-xs ${r.passed ? 'bg-emerald-500/5' : 'bg-red-500/5'}`}>
                  {r.passed ? <HiOutlineCheck className="w-3.5 h-3.5 text-emerald-500" /> : <HiOutlineX className="w-3.5 h-3.5 text-red-500" />}
                  <span className={r.passed ? 'text-emerald-400' : 'text-red-400'}>Test Case {i + 1}: {r.passed ? 'Passed' : 'Failed'}</span>
                  {r.execution_time > 0 && <span className="text-dark-500 ml-auto">{r.execution_time}s</span>}
                  {!r.passed && r.actual_output && (
                    <span className="text-dark-400 ml-2">Got: "{r.actual_output}"</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Question Navigation */}
      <div className="bg-dark-900 border-t border-dark-700/50 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => switchQuestion(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}
            className="p-1.5 text-dark-400 hover:text-white disabled:opacity-30 transition-colors">
            <HiOutlineChevronLeft className="w-4 h-4" />
          </button>
          {questions.map((q, i) => (
            <button key={q.id} onClick={() => switchQuestion(i)}
              className={`w-9 h-9 rounded-lg text-xs font-medium transition-all ${
                i === currentIdx ? 'bg-brand-500 text-white' :
                q.is_submitted ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                q.saved_code ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                'bg-dark-800 text-dark-400 border border-dark-700/50 hover:border-dark-600'
              }`}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => switchQuestion(Math.min(questions.length - 1, currentIdx + 1))} disabled={currentIdx === questions.length - 1}
            className="p-1.5 text-dark-400 hover:text-white disabled:opacity-30 transition-colors">
            <HiOutlineChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-dark-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-dark-600" /> Not Attempted</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Attempted</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Submitted</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-500" /> Current</span>
        </div>
      </div>

      {/* Finish Modal */}
      {showFinishModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-dark-900 border border-dark-700/50 rounded-2xl p-6 max-w-md w-full mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                <HiOutlineExclamation className="w-6 h-6 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold text-white">Submit Test?</h3>
            </div>
            <p className="text-sm text-dark-300 mb-6">
              Are you sure you want to submit your test? You cannot modify your answers after final submission.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowFinishModal(false)} className="px-4 py-2 text-sm text-dark-400 hover:text-white">Cancel</button>
              <button onClick={handleFinish} disabled={submittingTest} className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {submittingTest ? 'Submitting...' : 'Submit Test'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Floating Webcam Proctoring Widget */}
      <WebcamProctor snapshotIntervalSec={30} onFaceTurn={handleFaceTurn} onMultipleFaces={handleMultipleFaces} />
    </div>
  );
}
