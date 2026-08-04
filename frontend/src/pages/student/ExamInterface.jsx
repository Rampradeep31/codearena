import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CodeEditor from '../../components/editor/Editor';
import OutputPanel from '../../components/editor/OutputPanel';
import { useAuth } from '../../context/AuthContext';
import { studentAPI, codeAPI, getErrorMessage } from '../../services/api';
import toast from 'react-hot-toast';
import WebcamProctor from '../../components/WebcamProctor';
import LeetCodeTestPanel from '../../components/execution/LeetCodeTestPanel';
import { executionClient, getVerdict } from '../../services/executionClient';
import {
  HiOutlineCode, HiOutlinePlay, HiOutlineUpload, HiOutlineClock,
  HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlineShieldExclamation,
  HiOutlineExclamation, HiOutlineCheck, HiOutlineX, HiOutlineTerminal,
  HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineExclamationCircle,
} from 'react-icons/hi';

const LANG_MAP = {
  python: { label: 'Python', monaco: 'python', template: '# Write your solution here\n' },
  java: { label: 'Java', monaco: 'java', template: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write your solution here\n    }\n}\n' },
  c: { label: 'C', monaco: 'c', template: '#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n' },
  cpp: { label: 'C++', monaco: 'cpp', template: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n' },
};

// ─── Issue 11: staged execution UX ───────────────────────────────
const JUDGE_STAGES = [
  'Connecting to Judge...',
  'Preparing Container...',
  'Compiling...',
  'Running...',
  'Evaluating Test Cases...',
];

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
  const [activeCaseIdx, setActiveCaseIdx] = useState(0);
  const [customInput, setCustomInput] = useState('');
  const [resultTab, setResultTab] = useState('result');
  const [running, setRunning] = useState(false);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [submittingTest, setSubmittingTest] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [warningMsg, setWarningMsg] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [judgeStage, setJudgeStage] = useState(-1);

  // Refs
  const autoSaveTimer = useRef(null);
  const lastSavedCode = useRef('');
  const violationDebounce = useRef(0);
  const violationCounts = useRef({ face_turned: 0, multiple_faces: 0 });
  const judgeStageTimer = useRef(null);

  // Advance the "Connecting -> Container -> Compiling -> Running -> Evaluating"
  // progress indicator while a run/submit request is in flight.
  const startJudgeStages = () => {
    setJudgeStage(0);
    if (judgeStageTimer.current) clearInterval(judgeStageTimer.current);
    judgeStageTimer.current = setInterval(() => {
      setJudgeStage((prev) => (prev >= JUDGE_STAGES.length - 1 ? prev : prev + 1));
    }, 900);
  };

  const stopJudgeStages = () => {
    if (judgeStageTimer.current) clearInterval(judgeStageTimer.current);
    judgeStageTimer.current = null;
    setJudgeStage(-1);
  };

  // Clean up the stage timer on unmount
  useEffect(() => () => stopJudgeStages(), []);

  // ─── Load Data ─────────────────────────────────
  useEffect(() => {
    loadAttempt();
    requestFullscreen();
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [attemptId]);

  const loadAttempt = async () => {
    try {
      const attemptRes = await studentAPI.getAttempt(attemptId);
      const att = attemptRes?.data;
      if (!att) {
        setLoadError('Attempt not found or you do not have access to it.');
        setLoading(false);
        return;
      }

      setAttempt(att);
      setViolationCount(att.violation_count || 0);

      if (att.status === 'submitted' || att.status === 'auto_submitted') {
        navigate(`/student/exam/${attemptId}/complete`, { replace: true });
        return;
      }

      const questionsRes = await studentAPI.getAttemptQuestions(attemptId);
      const qs = questionsRes?.data;
      if (!qs || !Array.isArray(qs) || qs.length === 0) {
        setLoadError('No questions were assigned for this attempt. Please contact your instructor.');
        setLoading(false);
        return;
      }
      setQuestions(qs);

      const saved = qs[0];
      const initialLang = saved.saved_language || 'python';
      const initialCode = saved.saved_code || (LANG_MAP[initialLang] ? LANG_MAP[initialLang].template : '# Write your solution here\n');
      setLanguage(initialLang);
      setCode(initialCode);
      lastSavedCode.current = saved.saved_code || '';

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
      console.warn("loadAttempt error:", err);
      setLoadError(err.response?.data?.detail || 'Failed to load the examination. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Timer ─────────────────────────────────────
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (loading || !attempt || autoSubmittedRef.current) return;
    // Auto-submit is only legal while the attempt is genuinely in progress.
    if (String(attempt.status || '').toLowerCase() !== 'in_progress') return;

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
    const qObj = questions[currentIdx];
    const qId = qObj.question_id || qObj.id;
    try {
      await studentAPI.saveCode(attemptId, {
        question_id: qId,
        language,
        source_code: code,
      });
      lastSavedCode.current = code;
    } catch { /* silent fail for auto-save */ }
  };

  const mountTime = useRef(Date.now());
  const hasEnteredFullscreen = useRef(false);
  const violationCountRef = useRef(0);

  // Keep Ref in sync with violationCount state
  useEffect(() => {
    if (attempt && typeof attempt.violation_count === 'number') {
      const cnt = attempt.violation_count;
      setViolationCount(cnt);
      violationCountRef.current = cnt;
    }
  }, [attempt]);

  // ─── Violation Monitoring ─────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (Date.now() - mountTime.current < 2000) return;
      if (document.hidden) {
        recordViolation('tab_switch');
      }
    };

    const handleFullscreenChange = () => {
      const currentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(currentlyFullscreen);
      
      if (currentlyFullscreen) {
        hasEnteredFullscreen.current = true;
      } else if (hasEnteredFullscreen.current && Date.now() - mountTime.current > 2000) {
        recordViolation('fullscreen_exit');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [attemptId]);

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
    // 800ms debounce to prevent duplicate triggers from simultaneous blur + visibility events
    if (now - violationDebounce.current < 800) return;
    violationDebounce.current = now;

    if (type === 'face_turned') {
      violationCounts.current.face_turned += 1;
    } else if (type === 'multiple_faces') {
      violationCounts.current.multiple_faces += 1;
    }

    const prevCount = violationCountRef.current;

    try {
      const res = await studentAPI.recordViolation(attemptId, { violation_type: type });
      const data = res.data || {};
      
      let newCount = prevCount + 1;
      if (typeof data.violation_count === 'number' && data.violation_count > 0) {
        newCount = Math.max(data.violation_count, prevCount + 1);
      }

      violationCountRef.current = newCount;
      setViolationCount(newCount);

      const maxViolations = data.max_violations || attempt?.max_violations || 3;

      toast.error(`Violation recorded (${newCount}/${maxViolations}): Left exam screen`, {
        id: 'violation-toast'
      });

      // Violations are recorded as warnings only. They must NEVER complete the
      // exam: COMPLETED happens solely via the submit button or the attempt
      // timer expiring.
      setWarningMsg(`Warning ${newCount} of ${maxViolations}: You left the examination screen. This activity has been recorded.`);
    } catch (err) {
      console.error("Violation recording failed:", err);
      const newCount = prevCount + 1;
      violationCountRef.current = newCount;
      setViolationCount(newCount);
      const maxViolations = attempt?.max_violations || 3;
      setWarningMsg(`Warning ${newCount} of ${maxViolations}: You left the examination screen.`);
    }
  };

  const handleFaceTurn = () => {
    setWarningMsg('Proctoring Notice: Please keep your face centered in the camera view.');
  };

  const handleMultipleFaces = () => {
    setWarningMsg('Proctoring Notice: Multiple faces detected in camera view. Please ensure you are taking the test alone.');
  };

  const requestFullscreen = async () => {
    try {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
      // isFullscreen is only updated via the fullscreenchange handler so that
      // a failed request cannot unlock the exam.
    } catch (err) {
      console.warn("Fullscreen request failed:", err);
      toast.error('Fullscreen was blocked. Your browser must allow fullscreen to continue the exam.');
    }
  };

  // ─── Navigation ───────────────────────────────
  const switchQuestion = (idx) => {
    if (idx === currentIdx) return;
    saveCode();
    
    setQuestions(prev => {
      const newQs = [...prev];
      if (newQs[currentIdx]) {
        newQs[currentIdx] = { ...newQs[currentIdx], saved_code: code, saved_language: language };
      }
      
      const q = newQs[idx];
      if (q) {
        setLanguage(q.saved_language || 'python');
        setCode(q.saved_code || (LANG_MAP[q.saved_language] ? LANG_MAP[q.saved_language].template : '# Write your solution here\n'));
        lastSavedCode.current = q.saved_code || '';
      }
      return newQs;
    });

    setCurrentIdx(idx);
    setRunResult(null);
  };

  // ─── Run Code ─────────────────────────────────
  const handleRun = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error("Session expired. Please log in again.");
      navigate('/login');
      return;
    }

    const qObj = questions[currentIdx];
    if (!qObj) return;
    const qId = qObj.question_id || qObj.id;

    setRunning(true);
    setRunResult(null);
    saveCode();
    startJudgeStages();
    try {
      if (activeCaseIdx === 'custom') {
        const result = await executionClient.runCase({
          attempt_id: parseInt(attemptId),
          question_id: qId,
          language,
          source_code: code,
          input: customInput,
          expected_output: null,
        });
        setRunResult({ ...result, language });
      } else {
        const result = await executionClient.runAllSamples({
          attempt_id: parseInt(attemptId),
          question_id: qId,
          language,
          source_code: code,
        });
        setRunResult({ ...result, language });
        const firstFail = result?.results?.findIndex(r => !r.passed);
        setActiveCaseIdx(firstFail !== undefined && firstFail !== -1 ? firstFail : 0);
      }
    } catch (err) {
      // Issue 8: expired/invalid JWT must surface as an authentication error
      // and redirect to login — never as a fake compilation failure.
      if (err?.status === 401 || err?.status === 403) {
        toast.error(getErrorMessage(err, 'Session expired. Please log in again.'));
        setTimeout(() => navigate('/login', { replace: true }), 1200);
      } else {
        // Issue 3: show the real backend error (compiler messages, runtime
        // tracebacks, timeouts...) instead of a generic popup.
        const realMessage = getErrorMessage(err, 'Code execution failed on the judge backend.');
        setRunResult({
          status: err?.status === 504 ? 'internal_error' : 'internal_error',
          status_description: 'Execution Failed',
          compilation_status: 'error',
          compilation_error: realMessage,
          error: realMessage,
          results: [],
          passed: 0,
          total: 0,
          language,
        });
      }
    } finally {
      stopJudgeStages();
      setRunning(false);
    }
  };

  // ─── Submit Code ──────────────────────────────
  const handleSubmit = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error("Session expired. Please log in again.");
      navigate('/login');
      return;
    }

    const qObj = questions[currentIdx];
    if (!qObj) return;
    const qId = qObj.question_id || qObj.id;

    setSubmittingCode(true);
    saveCode();
    startJudgeStages();
    try {
      const result = await executionClient.submitCode({
        attempt_id: parseInt(attemptId),
        question_id: qId,
        language,
        source_code: code,
      });
      
      // Show submit results in the modal (hidden test case inputs are already redacted by the backend)
      setRunResult({ ...result, language });
      const firstFail = result?.results?.findIndex(r => !r.passed);
      setActiveCaseIdx(firstFail !== undefined && firstFail !== -1 ? firstFail : 0);

      // Update UI to indicate successful submission
      setQuestions(prev => {
        const newQs = [...prev];
        if (newQs[currentIdx]) {
          newQs[currentIdx] = { ...newQs[currentIdx], is_submitted: true };
        }
        return newQs;
      });
      
      const verdict = getVerdict(result) || 'Submitted';
      toast.success(`Code submitted — Score: ${result.score ?? 0}/${result.total_marks ?? 0} — ${verdict}`);
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        toast.error(getErrorMessage(err, 'Session expired. Please log in again.'));
        setTimeout(() => navigate('/login', { replace: true }), 1200);
      } else {
        toast.error(getErrorMessage(err, 'Submission error'));
      }
    } finally {
      stopJudgeStages();
      setSubmittingCode(false);
    }
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
    try { await studentAPI.finishTest(attemptId, 'auto_submitted'); }
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
      <div className="bg-dark-900 border border-dark-700/50 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
          <HiOutlineExclamation className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="text-lg font-bold text-white mb-2">Exam Unavailable</h1>
        <p className="text-sm text-dark-400 mb-6 leading-relaxed">{loadError}</p>
        <button
          type="button"
          onClick={() => navigate('/student')}
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  const currentQ = questions[currentIdx];
  const qData = currentQ?.question || currentQ;

  return (
    <div className="h-screen bg-dark-950 flex flex-col no-select">
      {!isFullscreen && (
        <div className="fixed inset-0 bg-dark-950/95 flex items-center justify-center p-4 z-[9999] animate-fade-in no-select backdrop-blur-md">
          <div className="bg-dark-900 border border-dark-700/50 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <HiOutlineShieldExclamation className="w-9 h-9 text-red-500 animate-pulse" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Fullscreen Mode Required</h1>
            <p className="text-sm text-dark-400 mb-6 leading-relaxed">
              This examination is proctored. To start or continue writing, please click below to enter Fullscreen mode.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={requestFullscreen}
                className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-brand-500/20 cursor-pointer"
              >
                Enter Fullscreen & Start Exam
              </button>
            </div>
          </div>
        </div>
      )}
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
          <span className="text-sm text-dark-300">{user?.name || 'Student'}</span>
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
            {qData && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-dark-400">Q{currentIdx + 1}.</span>
                  <h2 className="text-lg font-semibold text-white">{qData.title}</h2>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    qData.difficulty === 'easy' ? 'bg-emerald-500/10 text-emerald-500' :
                    qData.difficulty === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-red-500/10 text-red-500'
                  }`}>{qData.difficulty}</span>
                  <span className="text-xs text-dark-400 ml-auto">{qData.marks || 10} marks</span>
                </div>

                <div className="prose prose-invert prose-sm max-w-none">
                  <div className="text-sm text-dark-200 whitespace-pre-wrap mb-4">{qData.statement}</div>

                  {qData.input_format && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1">Input Format</h4>
                      <p className="text-sm text-dark-400 whitespace-pre-wrap">{qData.input_format}</p>
                    </div>
                  )}
                  {qData.output_format && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1">Output Format</h4>
                      <p className="text-sm text-dark-400 whitespace-pre-wrap">{qData.output_format}</p>
                    </div>
                  )}
                  {qData.constraints && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1">Constraints</h4>
                      <p className="text-sm text-dark-400 font-mono whitespace-pre-wrap">{qData.constraints}</p>
                    </div>
                  )}

                  {/* Sample Test Cases */}
                  {qData.test_cases && qData.test_cases.length > 0 ? (
                    qData.test_cases.map((tc, i) => (
                      <div key={tc.id || i} className="mb-3">
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
                    ))
                  ) : (qData.sample_input || qData.sample_output) ? (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1">Sample 1</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-dark-500 mb-0.5">Input</p>
                          <pre className="bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-xs text-dark-200 font-mono overflow-x-auto">{qData.sample_input || '—'}</pre>
                        </div>
                        <div>
                          <p className="text-[10px] text-dark-500 mb-0.5">Output</p>
                          <pre className="bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-xs text-dark-200 font-mono overflow-x-auto">{qData.sample_output || '—'}</pre>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {qData.explanation && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1">Explanation</h4>
                      <p className="text-sm text-dark-400 whitespace-pre-wrap">{qData.explanation}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Monaco Code Editor */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950 p-2">
          <CodeEditor
            key={`${attemptId}-${questions[currentIdx]?.question_id || questions[currentIdx]?.id || currentIdx + 1}`}
            initialCode={code}
            initialLanguage={language}
            attemptId={attemptId}
            questionId={questions[currentIdx]?.question_id || questions[currentIdx]?.id || currentIdx + 1}
            onCodeChange={(newCode, newLang) => {
              setCode(newCode);
              setLanguage(newLang);
            }}
            onLanguageChange={(newLang, newCode) => {
              setLanguage(newLang);
              setCode(newCode);
            }}
            onRun={handleRun}
            onSubmit={handleSubmit}
            running={running}
            submitting={submittingCode}
            readOnly={attempt?.status === 'submitted' || attempt?.status === 'auto_submitted' || timeLeft <= 0}
            compilationError={runResult?.compilation_error || runResult?.error}
          />
        </div>
      </div>

      {/* Floating Pop-Up Modal for Testcase & Test Result Execution Output */}
      {runResult && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-[9999] animate-fade-in backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scale-up">
            {/* Modal Header: Tabs & Close */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700/50 bg-dark-950/80">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setResultTab('result')}
                  className={`flex items-center gap-1.5 py-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    resultTab === 'result' ? 'border-brand-500 text-white' : 'border-transparent text-dark-400 hover:text-dark-200'
                  }`}
                >
                  <HiOutlineTerminal className="w-4 h-4 text-brand-400" />
                  Test Result
                </button>
                <button
                  onClick={() => setResultTab('testcase')}
                  className={`flex items-center gap-1.5 py-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    resultTab === 'testcase' ? 'border-brand-500 text-white' : 'border-transparent text-dark-400 hover:text-dark-200'
                  }`}
                >
                  <HiOutlineCode className="w-4 h-4 text-dark-300" />
                  Testcase
                </button>
              </div>
              <button
                onClick={() => setRunResult(null)}
                className="w-7 h-7 rounded-lg bg-dark-800 hover:bg-dark-700 flex items-center justify-center text-dark-400 hover:text-white transition-colors cursor-pointer"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Testcase & Result View */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              {resultTab === 'testcase' ? (
                /* Testcase View */
                <div className="space-y-3">
                  {(() => {
                    const testCases = (qData?.test_cases && qData.test_cases.length > 0)
                      ? qData.test_cases
                      : (qData?.sample_input || qData?.sample_output)
                      ? [{ id: 'sample1', input: qData.sample_input || '', expected_output: qData.sample_output || '' }]
                      : (runResult?.results && runResult.results.length > 0)
                      ? runResult.results.map((r, i) => ({ id: i, input: r.input || '(Standard Input)', expected_output: r.expected_output || '—' }))
                      : [];

                    if (testCases.length === 0) {
                      return (
                        <div className="text-center py-6 text-dark-400">
                          No sample testcases available for preview.
                        </div>
                      );
                    }

                    const activeTc = testCases[activeCaseIdx] || testCases[0];

                    return (
                      <>
                        <div className="flex items-center gap-2">
                          {testCases.map((tc, idx) => (
                            <button
                              key={tc.id || idx}
                              onClick={() => setActiveCaseIdx(idx)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                activeCaseIdx === idx
                                  ? 'bg-brand-500/20 text-brand-400 font-semibold border border-brand-500/40 shadow'
                                  : 'bg-dark-800 text-dark-400 hover:text-dark-200 hover:bg-dark-700'
                              }`}
                            >
                              Case {idx + 1}
                            </button>
                          ))}
                        </div>
                        {activeTc && (
                          <div className="space-y-3 mt-3">
                            <div>
                              <p className="text-[11px] font-semibold text-dark-400 mb-1">Input</p>
                              <pre className="bg-dark-800 border border-dark-700/50 rounded-xl px-3.5 py-2.5 text-xs text-dark-100 font-mono overflow-x-auto">
                                {activeTc.input || '—'}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold text-dark-400 mb-1">Expected Output</p>
                              <pre className="bg-dark-800 border border-dark-700/50 rounded-xl px-3.5 py-2.5 text-xs text-emerald-400 font-mono overflow-x-auto">
                                {activeTc.expected_output || '—'}
                              </pre>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                /* Test Result View (LeetCode Style Pop-up) */
                <div className="space-y-4">
                  {(() => {
                    const verdict = getVerdict(runResult) || '';
                    const V = String(verdict).toLowerCase();
                    const isOk = verdict === 'Accepted';
                    const verdictColor = isOk
                      ? 'text-emerald-500'
                      : V.includes('limit') ? 'text-amber-500'
                      : 'text-red-500';
                    const verdictIcon = isOk
                      ? <HiOutlineCheckCircle className="w-5 h-5" />
                      : <HiOutlineXCircle className="w-5 h-5" />;
                    const detailError = runResult.compilation_error || runResult.error || (runResult.results?.[0]?.error) || null;
                    const shownCase = runResult.results?.[activeCaseIdx] || runResult.results?.[0];
                    return (
                      <>
                        {/* Verdict Header & Runtime/Memory */}
                        <div className="flex items-center justify-between pb-1 border-b border-dark-800">
                          <h3 className={`text-xl font-extrabold tracking-tight flex items-center gap-2 ${verdictColor}`}>
                            {verdictIcon}
                            {verdict || 'Result'}
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-dark-400 font-mono font-medium">
                            {shownCase?.execution_time !== undefined && (
                              <span>Runtime: {Math.round((shownCase.execution_time || 0) * 1000)} ms</span>
                            )}
                            {shownCase?.memory_used !== undefined && (
                              <span>Memory: {shownCase.memory_used || 0} KB</span>
                            )}
                          </div>
                        </div>

                        {/* Real error details — compiler output, runtime tracebacks, etc. */}
                        {detailError && (
                          <pre className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-56">
                            {detailError}
                          </pre>
                        )}
                      </>
                    );
                  })()}

                      {/* Case Pill Buttons */}
                      <div className="flex items-center gap-2">
                        {(runResult.results?.length > 0 ? runResult.results : qData?.test_cases || [])?.map((res, idx) => {
                          const isPassed = res.passed !== undefined ? res.passed : false;
                          return (
                            <button
                              key={idx}
                              onClick={() => setActiveCaseIdx(idx)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                activeCaseIdx === idx
                                  ? isPassed
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-semibold ring-1 ring-emerald-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/40 font-semibold ring-1 ring-red-500/30'
                                  : isPassed
                                  ? 'bg-emerald-500/10 text-emerald-500/80 hover:bg-emerald-500/20'
                                  : 'bg-red-500/10 text-red-500/80 hover:bg-red-500/20'
                              }`}
                            >
                              {isPassed ? (
                                <HiOutlineCheck className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <HiOutlineX className="w-3.5 h-3.5 text-red-500" />
                              )}
                              Case {idx + 1}
                            </button>
                          );
                        })}
                      </div>

                      {/* Selected Case Inputs / Outputs */}
                      {runResult.results?.[activeCaseIdx] ? (
                        <div className="space-y-3">
                          <div>
                            <p className="text-[11px] font-semibold text-dark-400 mb-1">Input</p>
                            <pre className="bg-dark-800 border border-dark-700/50 rounded-xl px-3.5 py-2.5 text-xs text-dark-100 font-mono overflow-x-auto">
                              {runResult.results[activeCaseIdx].input !== undefined && runResult.results[activeCaseIdx].input !== null && runResult.results[activeCaseIdx].input !== "" ? runResult.results[activeCaseIdx].input : (qData?.test_cases?.[activeCaseIdx]?.input ? qData.test_cases[activeCaseIdx].input : '(Empty)')}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-dark-400 mb-1">Output</p>
                            <pre className="bg-dark-800 border border-dark-700/50 rounded-xl px-3.5 py-2.5 text-xs text-dark-100 font-mono overflow-x-auto">
                              {runResult.results[activeCaseIdx].actual_output || runResult.results[activeCaseIdx].stdout || ''}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-dark-400 mb-1">Expected</p>
                            <pre className="bg-dark-800 border border-dark-700/50 rounded-xl px-3.5 py-2.5 text-xs text-emerald-400 font-mono overflow-x-auto">
                              {runResult.results[activeCaseIdx].expected_output || qData?.test_cases?.[activeCaseIdx]?.expected_output || ''}
                            </pre>
                          </div>
                        </div>
                      ) : qData?.test_cases?.[activeCaseIdx] && (
                        <div className="space-y-3">
                          <div>
                            <p className="text-[11px] font-semibold text-dark-400 mb-1">Input</p>
                            <pre className="bg-dark-800 border border-dark-700/50 rounded-xl px-3.5 py-2.5 text-xs text-dark-100 font-mono overflow-x-auto">
                              {qData.test_cases[activeCaseIdx].input}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-dark-400 mb-1">Expected</p>
                            <pre className="bg-dark-800 border border-dark-700/50 rounded-xl px-3.5 py-2.5 text-xs text-emerald-400 font-mono overflow-x-auto">
                              {qData.test_cases[activeCaseIdx].expected_output}
                            </pre>
                          </div>
                        </div>
                      )}
                </div>
              )}
            </div>

            {/* Modal Footer: Action Buttons */}
            <div className="px-5 py-3 border-t border-dark-700/50 bg-dark-950/80 flex items-center justify-end gap-3">
              <button
                onClick={() => setRunResult(null)}
                className="px-4 py-2 bg-dark-800 hover:bg-dark-700 text-dark-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Judge Progress Overlay — Issue 11 staged execution UX */}
      {judgeStage >= 0 && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-scale-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <h3 className="text-sm font-bold text-white">Judge is processing your code</h3>
            </div>
            <div className="space-y-2.5">
              {JUDGE_STAGES.map((stage, idx) => (
                <div key={stage} className={`flex items-center gap-2.5 text-xs transition-colors ${idx <= judgeStage ? 'text-brand-400' : 'text-dark-500'}`}>
                  {idx < judgeStage ? (
                    <HiOutlineCheck className="w-3.5 h-3.5 text-emerald-500" />
                  ) : idx === judgeStage ? (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full bg-dark-700" />
                  )}
                  {stage}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom: Question Navigation */}
      <div className="bg-dark-900 border-t border-dark-700/50 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => switchQuestion(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}
            className="p-1.5 text-dark-400 hover:text-white disabled:opacity-30 transition-colors">
            <HiOutlineChevronLeft className="w-4 h-4" />
          </button>
          {questions.map((q, i) => (
            <button key={q.id || i} onClick={() => switchQuestion(i)}
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
