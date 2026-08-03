import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useAuth } from '../../context/AuthContext';
import { studentAPI, codeAPI } from '../../services/api';
import toast from 'react-hot-toast';
import WebcamProctor from '../../components/WebcamProctor';
import LeetCodeTestPanel from '../../components/execution/LeetCodeTestPanel';
import { executionClient } from '../../services/executionClient';
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

const DEFAULT_QUESTIONS = [
  {
    id: 101,
    question_id: 101,
    position: 1,
    saved_code: '',
    saved_language: 'python',
    is_submitted: false,
    submission_score: null,
    question: {
      id: 101,
      title: "Two Sum",
      difficulty: "easy",
      marks: 50,
      topic: "Arrays",
      statement: "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to target.",
      input_format: "First line: n\nSecond line: n integers\nThird line: target",
      output_format: "Two space-separated indices",
      sample_input: "4\n2 7 11 15\n9",
      sample_output: "0 1",
      explanation: "nums[0] + nums[1] = 9",
      test_cases: [
        { id: 1, input: "4\n2 7 11 15\n9", expected_output: "0 1" }
      ]
    }
  },
  {
    id: 102,
    question_id: 102,
    position: 2,
    saved_code: '',
    saved_language: 'python',
    is_submitted: false,
    submission_score: null,
    question: {
      id: 102,
      title: "Reverse String",
      difficulty: "easy",
      marks: 10,
      topic: "Strings",
      statement: "Write a function that reverses a string.",
      input_format: "Single line string",
      output_format: "Reversed string",
      sample_input: "hello",
      sample_output: "olleh",
      explanation: "Reverse of hello is olleh",
      test_cases: [
        { id: 2, input: "hello", expected_output: "olleh" }
      ]
    }
  },
  {
    id: 103,
    question_id: 103,
    position: 3,
    saved_code: '',
    saved_language: 'python',
    is_submitted: false,
    submission_score: null,
    question: {
      id: 103,
      title: "Palindrome Check",
      difficulty: "easy",
      marks: 10,
      topic: "Strings",
      statement: "Determine if a string is a palindrome.",
      input_format: "Single line string",
      output_format: "true or false",
      sample_input: "racecar",
      sample_output: "true",
      explanation: "racecar is a palindrome",
      test_cases: [
        { id: 3, input: "racecar", expected_output: "true" }
      ]
    }
  },
  {
    id: 104,
    question_id: 104,
    position: 4,
    saved_code: '',
    saved_language: 'python',
    is_submitted: false,
    submission_score: null,
    question: {
      id: 104,
      title: "Maximum Subarray",
      difficulty: "medium",
      marks: 10,
      topic: "Arrays",
      statement: "Find contiguous subarray with largest sum.",
      input_format: "First line: n\nSecond line: n integers",
      output_format: "Largest sum integer",
      sample_input: "9\n-2 1 -3 4 -1 2 1 -5 4",
      sample_output: "6",
      explanation: "[4,-1,2,1] has max sum 6",
      test_cases: [
        { id: 4, input: "9\n-2 1 -3 4 -1 2 1 -5 4", expected_output: "6" }
      ]
    }
  },
  {
    id: 105,
    question_id: 105,
    position: 5,
    saved_code: '',
    saved_language: 'python',
    is_submitted: false,
    submission_score: null,
    question: {
      id: 105,
      title: "Valid Parentheses",
      difficulty: "easy",
      marks: 10,
      topic: "Stacks",
      statement: "Determine if input string of brackets is valid.",
      input_format: "Single string",
      output_format: "true or false",
      sample_input: "()[]{}",
      sample_output: "true",
      explanation: "Brackets closed correctly",
      test_cases: [
        { id: 5, input: "()[]{}", expected_output: "true" }
      ]
    }
  }
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

  // Refs
  const autoSaveTimer = useRef(null);
  const lastSavedCode = useRef('');
  const violationDebounce = useRef(0);
  const violationCounts = useRef({ face_turned: 0, multiple_faces: 0 });

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
      
      const att = attemptRes?.data || {
        id: attemptId || Date.now(),
        violation_count: 0,
        status: 'in_progress',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      };
      
      setAttempt(att);
      setViolationCount(att.violation_count || 0);

      if (att.status === 'submitted' || att.status === 'auto_submitted') {
        navigate(`/student/exam/${attemptId}/complete`, { replace: true });
        return;
      }

      let qs = questionsRes?.data;
      if (!qs || !Array.isArray(qs) || qs.length === 0) {
        qs = DEFAULT_QUESTIONS;
      }
      setQuestions(qs);

      if (qs.length > 0) {
        const saved = qs[0];
        const initialLang = saved.saved_language || 'python';
        const initialCode = saved.saved_code || (LANG_MAP[initialLang] ? LANG_MAP[initialLang].template : '# Write your solution here\n');
        setLanguage(initialLang);
        setCode(initialCode);
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
      console.warn("loadAttempt error, applying fallback:", err);
      setAttempt({ id: attemptId || Date.now(), violation_count: 0, status: 'in_progress', expires_at: new Date(Date.now() + 3600000).toISOString() });
      setQuestions(DEFAULT_QUESTIONS);
      setLanguage('python');
      setCode(LANG_MAP['python'].template);
      setTimeLeft(3600);
    } finally {
      setLoading(false);
    }
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
      const currentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(currentlyFullscreen);
      
      if (currentlyFullscreen) {
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
    if (now - violationDebounce.current < 2000) return;
    violationDebounce.current = now;

    if (type === 'face_turned') {
      violationCounts.current.face_turned += 1;
    } else if (type === 'multiple_faces') {
      violationCounts.current.multiple_faces += 1;
    }

    try {
      const res = await studentAPI.recordViolation(attemptId, { violation_type: type });
      const data = res.data || {};
      const newCount = typeof data.violation_count === 'number' ? data.violation_count : violationCount + 1;
      setViolationCount(newCount);

      if (data.auto_submitted || newCount >= (data.max_violations || attempt?.max_violations || 3)) {
        setWarningMsg('Maximum violations reached. Your test has been auto-submitted.');
        try {
          await studentAPI.finishTest(attemptId, 'auto_submitted');
        } catch (e) {
          console.error("Auto-submission failed:", e);
        }
        setTimeout(() => navigate(`/student/exam/${attemptId}/complete`, { replace: true }), 2000);
      } else if (newCount === 1) {
        setWarningMsg('Warning 1: You left the examination screen. This activity has been recorded.');
      } else if (newCount === 2) {
        setWarningMsg('Warning 2: Another violation may result in automatic submission.');
      }
    } catch (err) {
      console.error("Violation recording failed:", err);
    }
  };

  const handleFaceTurn = () => {
    // Only warn inside the webcam proctoring widget
  };

  const handleMultipleFaces = () => {
    // Only warn inside the webcam proctoring widget
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
    } catch (err) {
      console.warn("Fullscreen request failed:", err);
    } finally {
      setIsFullscreen(true);
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
    const qObj = questions[currentIdx];
    if (!qObj) return;
    const qId = qObj.question_id || qObj.id;

    setRunning(true);
    setRunResult(null);
    saveCode();
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
      toast.error(err.response?.data?.detail || 'Execution error');
    } finally { setRunning(false); }
  };

  // ─── Submit Code ──────────────────────────────
  const handleSubmit = async () => {
    const qObj = questions[currentIdx];
    if (!qObj) return;
    const qId = qObj.question_id || qObj.id;

    setSubmittingCode(true);
    saveCode();
    try {
      const result = await executionClient.submitCode({
        attempt_id: parseInt(attemptId),
        question_id: qId,
        language,
        source_code: code,
      });
      
      // Update UI to indicate successful submission without revealing test case details
      setQuestions(prev => {
        const newQs = [...prev];
        if (newQs[currentIdx]) {
          newQs[currentIdx] = { ...newQs[currentIdx], is_submitted: true };
        }
        return newQs;
      });
      
      toast.success('Code submitted successfully!');
      
      // Optionally move to next unsubmitted question
      const nextIdx = questions.findIndex((q, idx) => idx > currentIdx && !q.is_submitted);
      if (nextIdx !== -1) {
        switchQuestion(nextIdx);
      }
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
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="w-full py-2 bg-dark-800 hover:bg-dark-700 text-dark-300 rounded-xl text-xs font-medium transition-colors"
              >
                Continue to Exam Interface
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

        {/* Right: Code Editor */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Language Selector & Actions */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-dark-700/50 bg-dark-900/50">
            <select value={language} onChange={(e) => {
              const nextLang = e.target.value;
              setLanguage(nextLang);
              setCode(LANG_MAP[nextLang]?.template || '');
            }}
              className="px-2 py-1 bg-dark-800 border border-dark-600/50 rounded text-xs text-white focus:outline-none focus:border-brand-500">
              {Object.entries(LANG_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            <div className="flex items-center gap-2">
              <button onClick={handleRun} disabled={running || !code.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 disabled:opacity-40 text-white rounded text-xs font-medium transition-colors cursor-pointer">
                {running ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiOutlinePlay className="w-3.5 h-3.5" />}
                {running ? 'Running...' : 'Run Code'}
              </button>
              <button onClick={handleSubmit} disabled={submittingCode || !code.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white rounded text-xs font-medium transition-colors cursor-pointer">
                {submittingCode ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiOutlineUpload className="w-3.5 h-3.5" />}
                {submittingCode ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 min-h-0 bg-[#1e1e1e]">
            <Editor
              height="100%"
              language={LANG_MAP[language]?.monaco || 'python'}
              value={code}
              onChange={(val) => setCode(val || '')}
              theme="vs-dark"
              loading={<div className="flex items-center justify-center h-full text-dark-400 text-sm">Loading Code Editor...</div>}
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
                  <div className="flex items-center gap-2">
                    {qData?.test_cases?.map((tc, idx) => (
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
                  {qData?.test_cases?.[activeCaseIdx] && (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold text-dark-400 mb-1">Input</p>
                        <pre className="bg-dark-800 border border-dark-700/50 rounded-xl px-3.5 py-2.5 text-xs text-dark-100 font-mono overflow-x-auto">
                          {qData.test_cases[activeCaseIdx].input}
                        </pre>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-dark-400 mb-1">Expected Output</p>
                        <pre className="bg-dark-800 border border-dark-700/50 rounded-xl px-3.5 py-2.5 text-xs text-emerald-400 font-mono overflow-x-auto">
                          {qData.test_cases[activeCaseIdx].expected_output}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Test Result View (LeetCode Style Pop-up) */
                <div className="space-y-4">
                  {runResult.compilation_status === 'error' || runResult.compilation_error ? (
                    <div>
                      <h3 className="text-base font-bold text-red-500 flex items-center gap-2 mb-2">
                        <HiOutlineXCircle className="w-5 h-5" /> Compilation Error
                      </h3>
                      <pre className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-48">
                        {runResult.compilation_error || runResult.error || 'Compilation Error'}
                      </pre>
                    </div>
                  ) : (
                    <>
                      {/* Verdict Header & Runtime */}
                      <div className="flex items-center justify-between pb-1 border-b border-dark-800">
                        <h3
                          className={`text-xl font-extrabold tracking-tight ${
                            runResult.passed === runResult.total && runResult.total > 0
                              ? 'text-emerald-500'
                              : 'text-red-500'
                          }`}
                        >
                          {runResult.passed === runResult.total && runResult.total > 0
                            ? 'Accepted'
                            : 'Wrong Answer'}
                        </h3>
                        {runResult.results?.[activeCaseIdx]?.execution_time !== undefined && (
                          <span className="text-xs text-dark-400 font-mono font-medium">
                            Runtime: {Math.round((runResult.results[activeCaseIdx].execution_time || 0) * 1000)} ms
                          </span>
                        )}
                      </div>

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
                              {runResult.results[activeCaseIdx].input || qData?.test_cases?.[activeCaseIdx]?.input || 'None'}
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
                    </>
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
