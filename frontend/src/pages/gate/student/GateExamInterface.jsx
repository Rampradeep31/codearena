import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gateStudentAPI } from '../../../services/gateApi';
import toast from 'react-hot-toast';
import {
  HiOutlineClock, HiOutlineCalculator, HiOutlineChevronLeft,
  HiOutlineChevronRight, HiOutlineFlag, HiOutlineCheckCircle,
  HiOutlineX, HiOutlineBookmark,
} from 'react-icons/hi';

/* ─── Scientific Calculator Component ─────────────────────────────────────── */
function ScientificCalculator({ onClose }) {
  const [display, setDisplay] = useState('0');
  const [memory, setMemory] = useState(0);
  const [isNewInput, setIsNewInput] = useState(true);
  const [history, setHistory] = useState('');
  const [isDeg, setIsDeg] = useState(true);

  const toRad = (x) => isDeg ? (x * Math.PI) / 180 : x;
  const fromRad = (x) => isDeg ? (x * 180) / Math.PI : x;

  const appendVal = (val) => {
    setDisplay(prev => {
      if (isNewInput) { setIsNewInput(false); return String(val); }
      if (prev === '0' && val !== '.') return String(val);
      if (val === '.' && prev.includes('.')) return prev;
      return prev + val;
    });
  };

  const calculate = useCallback((expr) => {
    try {
      // Safe eval replacement
      const sanitized = expr
        .replace(/×/g, '*').replace(/÷/g, '/').replace(/π/g, String(Math.PI))
        .replace(/e(?![0-9])/g, String(Math.E));
      // eslint-disable-next-line no-new-func
      return new Function(`"use strict"; return (${sanitized})`)();
    } catch { return 'Error'; }
  }, []);

  const handleEquals = () => {
    try {
      const result = calculate(display);
      setHistory(`${display} =`);
      setDisplay(isNaN(result) || !isFinite(result) ? 'Error' : String(parseFloat(result.toPrecision(12))));
      setIsNewInput(true);
    } catch { setDisplay('Error'); setIsNewInput(true); }
  };

  const handleUnary = (op) => {
    const x = parseFloat(display);
    let result;
    switch (op) {
      case 'sin': result = Math.sin(toRad(x)); break;
      case 'cos': result = Math.cos(toRad(x)); break;
      case 'tan': result = Math.tan(toRad(x)); break;
      case 'asin': result = fromRad(Math.asin(x)); break;
      case 'acos': result = fromRad(Math.acos(x)); break;
      case 'atan': result = fromRad(Math.atan(x)); break;
      case 'log': result = Math.log10(x); break;
      case 'ln': result = Math.log(x); break;
      case 'sqrt': result = Math.sqrt(x); break;
      case 'cbrt': result = Math.cbrt(x); break;
      case 'x2': result = x * x; break;
      case 'x3': result = x * x * x; break;
      case 'inv': result = 1 / x; break;
      case 'fact': {
        if (x < 0 || !Number.isInteger(x)) { setDisplay('Error'); return; }
        let f = 1; for (let i = 2; i <= x; i++) f *= i;
        result = f; break;
      }
      case 'abs': result = Math.abs(x); break;
      case '+/-': result = -x; break;
      case '%': result = x / 100; break;
      default: return;
    }
    setHistory(`${op}(${display}) =`);
    setDisplay(isNaN(result) || !isFinite(result) ? 'Error' : String(parseFloat(result.toPrecision(12))));
    setIsNewInput(true);
  };

  const handleOp = (op) => {
    setDisplay(prev => prev + op);
    setIsNewInput(false);
  };

  const buttons = [
    // Row 1
    [
      { label: isDeg ? 'DEG' : 'RAD', action: () => setIsDeg(d => !d), cls: 'text-amber-400 bg-amber-500/10' },
      { label: 'x²', action: () => handleUnary('x2') },
      { label: 'x³', action: () => handleUnary('x3') },
      { label: 'xⁿ', action: () => handleOp('^') },
      { label: '√', action: () => handleUnary('sqrt') },
    ],
    // Row 2
    [
      { label: 'sin', action: () => handleUnary('sin') },
      { label: 'cos', action: () => handleUnary('cos') },
      { label: 'tan', action: () => handleUnary('tan') },
      { label: 'π', action: () => { setDisplay(String(Math.PI)); setIsNewInput(true); } },
      { label: 'e', action: () => { setDisplay(String(Math.E)); setIsNewInput(true); } },
    ],
    // Row 3
    [
      { label: 'sin⁻¹', action: () => handleUnary('asin') },
      { label: 'cos⁻¹', action: () => handleUnary('acos') },
      { label: 'tan⁻¹', action: () => handleUnary('atan') },
      { label: 'log', action: () => handleUnary('log') },
      { label: 'ln', action: () => handleUnary('ln') },
    ],
    // Row 4
    [
      { label: '∛', action: () => handleUnary('cbrt') },
      { label: '|x|', action: () => handleUnary('abs') },
      { label: '1/x', action: () => handleUnary('inv') },
      { label: 'n!', action: () => handleUnary('fact') },
      { label: '%', action: () => handleUnary('%') },
    ],
    // Row 5
    [
      { label: 'MC', action: () => setMemory(0), cls: 'text-purple-300' },
      { label: 'MR', action: () => { setDisplay(String(memory)); setIsNewInput(true); }, cls: 'text-purple-300' },
      { label: 'M+', action: () => setMemory(m => m + parseFloat(display)), cls: 'text-purple-300' },
      { label: 'M-', action: () => setMemory(m => m - parseFloat(display)), cls: 'text-purple-300' },
      { label: 'MS', action: () => setMemory(parseFloat(display)), cls: 'text-purple-300' },
    ],
    // Row 6 — standard
    [
      { label: 'AC', action: () => { setDisplay('0'); setHistory(''); setIsNewInput(true); }, cls: 'text-red-400 bg-red-500/10' },
      { label: '(', action: () => appendVal('(') },
      { label: ')', action: () => appendVal(')') },
      { label: '÷', action: () => handleOp('/'), cls: 'text-amber-400' },
    ],
    [
      { label: '7', action: () => appendVal('7') },
      { label: '8', action: () => appendVal('8') },
      { label: '9', action: () => appendVal('9') },
      { label: '×', action: () => handleOp('*'), cls: 'text-amber-400' },
    ],
    [
      { label: '4', action: () => appendVal('4') },
      { label: '5', action: () => appendVal('5') },
      { label: '6', action: () => appendVal('6') },
      { label: '−', action: () => handleOp('-'), cls: 'text-amber-400' },
    ],
    [
      { label: '1', action: () => appendVal('1') },
      { label: '2', action: () => appendVal('2') },
      { label: '3', action: () => appendVal('3') },
      { label: '+', action: () => handleOp('+'), cls: 'text-amber-400' },
    ],
    [
      { label: '+/-', action: () => handleUnary('+/-') },
      { label: '0', action: () => appendVal('0') },
      { label: '.', action: () => appendVal('.') },
      { label: '⌫', action: () => setDisplay(p => p.length > 1 ? p.slice(0, -1) : '0'), cls: 'text-red-400' },
    ],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-4 bg-black/30 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-dark-900 border border-amber-500/30 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-amber-500/10 w-full sm:w-80">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700/50">
          <div className="flex items-center gap-2">
            <HiOutlineCalculator className="w-4 h-4 text-amber-400" />
            <span className="text-white text-sm font-bold">Scientific Calculator</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"><HiOutlineX className="w-4 h-4" /></button>
        </div>
        {/* Display */}
        <div className="px-4 py-3 bg-dark-950/50">
          <p className="text-dark-500 text-xs text-right h-4 truncate">{history}</p>
          <p className="text-white text-2xl font-mono text-right truncate mt-1">{display}</p>
          {memory !== 0 && <p className="text-purple-400 text-xs text-right">M: {memory}</p>}
        </div>
        {/* Buttons */}
        <div className="p-2 space-y-1">
          {buttons.map((row, ri) => (
            <div key={ri} className={`grid gap-1 ${row.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
              {row.map((btn, bi) => (
                <button
                  key={bi}
                  onClick={btn.action}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${btn.cls || 'text-dark-200 bg-dark-800 hover:bg-dark-700'}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          ))}
          {/* Equals */}
          <button onClick={handleEquals} className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-base hover:opacity-90 active:scale-95 transition-all mt-1">
            =
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Timer Hook ─────────────────────────────────────────────────────────── */
function useTimer(durationMinutes, startTime) {
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes * 60);

  useEffect(() => {
    if (!startTime) return;
    const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
    const remaining = Math.max(0, durationMinutes * 60 - elapsed);
    setSecondsLeft(remaining);
    const interval = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(interval);
  }, [durationMinutes, startTime]);

  const hours = Math.floor(secondsLeft / 3600);
  const mins = Math.floor((secondsLeft % 3600) / 60);
  const secs = secondsLeft % 60;
  const isWarning = secondsLeft < 300;
  const isExpired = secondsLeft === 0;

  return {
    display: `${hours > 0 ? String(hours).padStart(2, '0') + ':' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    isWarning,
    isExpired,
    secondsLeft,
  };
}

/* ─── Main Exam Interface ────────────────────────────────────────────────── */
export default function GateExamInterface() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // { questionId: { given_answer, is_marked_for_review } }
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCalc, setShowCalc] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await gateStudentAPI.getResult(attemptId).catch(() => null);
        if (res?.data?.status === 'SUBMITTED') {
          navigate(`/gate/student/result/${attemptId}`, { replace: true });
          return;
        }
        // Load attempt info from my-attempts
        const attemptsRes = await gateStudentAPI.myAttempts();
        const a = attemptsRes.data.find(x => String(x.id) === String(attemptId));
        if (!a) { toast.error('Attempt not found'); navigate('/gate/student'); return; }
        setAttempt(a);

        const qRes = await gateStudentAPI.getTestQuestions(a.gate_test_id);
        setQuestions(qRes.data);

        // Pre-populate with server-side saved answers
        const existingAnswers = {};
        if (res?.data?.answers) {
          res.data.answers.forEach(ans => {
            existingAnswers[ans.question_id] = { given_answer: ans.given_answer, is_marked_for_review: ans.is_marked_for_review };
          });
        }
        setAnswers(existingAnswers);
      } catch (e) { toast.error('Failed to load exam'); navigate('/gate/student'); }
      finally { setLoading(false); }
    };
    load();
  }, [attemptId]);

  const { display: timerDisplay, isWarning, isExpired } = useTimer(
    attempt ? attempt.duration_minutes || 180 : 180,
    attempt?.start_time
  );

  // Auto submit when time expires
  useEffect(() => {
    if (isExpired && attempt && !submitting) {
      toast.error('Time is up! Submitting automatically...');
      handleSubmit(true);
    }
  }, [isExpired]);

  const saveAnswer = useCallback(async (questionId, givenAnswer, markedForReview = null) => {
    if (savingRef.current) return;
    const payload = { question_id: questionId, given_answer: givenAnswer || null };
    if (markedForReview !== null) payload.is_marked_for_review = markedForReview;
    try { await gateStudentAPI.saveAnswer(attemptId, payload); } catch {}
  }, [attemptId]);

  const handleMcqSelect = (optionLetter) => {
    const q = questions[currentIdx];
    const current = answers[q.id] || {};
    const newAns = current.given_answer === optionLetter ? null : optionLetter;
    const updated = { ...current, given_answer: newAns };
    setAnswers(prev => ({ ...prev, [q.id]: updated }));
    saveAnswer(q.id, newAns, updated.is_marked_for_review);
  };

  const handleFitbChange = (val) => {
    const q = questions[currentIdx];
    const current = answers[q.id] || {};
    const updated = { ...current, given_answer: val };
    setAnswers(prev => ({ ...prev, [q.id]: updated }));
  };

  const handleFitbBlur = () => {
    const q = questions[currentIdx];
    const ans = answers[q.id];
    saveAnswer(q.id, ans?.given_answer, ans?.is_marked_for_review);
  };

  const handleMarkForReview = () => {
    const q = questions[currentIdx];
    const current = answers[q.id] || {};
    const flagged = !current.is_marked_for_review;
    const updated = { ...current, is_marked_for_review: flagged };
    setAnswers(prev => ({ ...prev, [q.id]: updated }));
    saveAnswer(q.id, updated.given_answer, flagged);
    toast(flagged ? '🔖 Marked for review' : 'Review flag removed', { duration: 1500 });
  };

  const handleSubmit = async (auto = false) => {
    if (!auto && !showSubmitConfirm) { setShowSubmitConfirm(true); return; }
    setSubmitting(true);
    try {
      const res = await gateStudentAPI.submitAttempt(attemptId);
      toast.success('Test submitted!');
      navigate(`/gate/student/result/${attemptId}`, { replace: true });
    } catch (e) { toast.error(e.message || 'Submit failed'); setSubmitting(false); }
  };

  const getQuestionStatus = (idx) => {
    const q = questions[idx];
    const ans = answers[q?.id];
    if (!ans) return 'unattempted';
    if (ans.is_marked_for_review && !ans.given_answer) return 'review';
    if (ans.is_marked_for_review && ans.given_answer) return 'answered-review';
    if (ans.given_answer) return 'answered';
    return 'unattempted';
  };

  const statusColors = {
    unattempted: 'bg-dark-700 text-dark-300 border-dark-600',
    answered: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    review: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    'answered-review': 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  };

  if (loading) {
    return (
      <div className="min-h-screen aurora-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-dark-400 text-sm">Loading exam...</p>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const currentAns = answers[currentQ?.id] || {};
  const answeredCount = questions.filter((_, i) => answers[questions[i]?.id]?.given_answer).length;
  const reviewCount = questions.filter((_, i) => answers[questions[i]?.id]?.is_marked_for_review).length;

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col select-none">
      {showCalc && <ScientificCalculator onClose={() => setShowCalc(false)} />}

      {/* Submit Confirm */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 border-2 border-amber-500/30 flex items-center justify-center mx-auto mb-4">
              <HiOutlineFlag className="w-7 h-7 text-amber-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-1">Submit Test?</h3>
            <p className="text-dark-400 text-sm mb-1">{answeredCount} of {questions.length} answered</p>
            {reviewCount > 0 && <p className="text-amber-400 text-xs mb-4">{reviewCount} marked for review</p>}
            <p className="text-dark-500 text-xs mb-5">You cannot change answers after submission.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSubmitConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-dark-600 text-dark-300 hover:text-white hover:bg-dark-800 transition-all font-semibold text-sm">Back</button>
              <button onClick={() => handleSubmit(true)} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all">
                {submitting ? 'Submitting...' : 'Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-dark-900/90 backdrop-blur border-b border-dark-700/50 px-4 py-2.5 flex items-center gap-4 sticky top-0 z-30">
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{attempt?.test_title || 'GATE Exam'}</p>
          <p className="text-dark-400 text-xs">Q {currentIdx + 1} / {questions.length}</p>
        </div>

        {/* Timer */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-bold text-sm border ${isWarning ? 'text-red-400 bg-red-500/10 border-red-500/30 animate-pulse' : 'text-white bg-dark-800 border-dark-700/50'}`}>
          <HiOutlineClock className="w-4 h-4 flex-shrink-0" />
          {timerDisplay}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCalc(true)} className="p-2 rounded-xl text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all" title="Scientific Calculator">
            <HiOutlineCalculator className="w-5 h-5" />
          </button>
          <button onClick={() => setShowPalette(p => !p)} className="p-2 rounded-xl text-dark-300 bg-dark-800 hover:bg-dark-700 border border-dark-700/50 transition-all sm:hidden">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <button onClick={() => handleSubmit(false)} disabled={submitting} className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all">
            <HiOutlineCheckCircle className="w-4 h-4" /> Submit
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: Question Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {currentQ && (
            <div className="p-4 sm:p-6 max-w-3xl mx-auto w-full">
              {/* Question header */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className={`text-xs px-2.5 py-1 rounded-full border font-bold ${currentQ.question_type === 'MCQ' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' : 'text-purple-400 bg-purple-500/10 border-purple-500/20'}`}>
                  {currentQ.question_type}
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold">{currentQ.subject}</span>
                <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${currentQ.marks === 2 ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`}>
                  {currentQ.marks} Mark{currentQ.marks !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-dark-400">-{currentQ.negative_marks} negative</span>
                <button
                  onClick={handleMarkForReview}
                  className={`ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all font-semibold ${currentAns.is_marked_for_review ? 'text-amber-300 bg-amber-500/15 border-amber-500/30' : 'text-dark-400 border-dark-700/50 hover:text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/20'}`}
                >
                  <HiOutlineBookmark className="w-3.5 h-3.5" />
                  {currentAns.is_marked_for_review ? 'Marked' : 'Mark for Review'}
                </button>
              </div>

              {/* Question text */}
              <div className="bg-dark-900/60 border border-dark-700/50 rounded-2xl p-5 mb-5">
                <p className="text-white text-base leading-relaxed whitespace-pre-wrap">{currentQ.statement}</p>
              </div>

              {/* MCQ Options */}
              {currentQ.question_type === 'MCQ' && (
                <div className="space-y-3">
                  {['A', 'B', 'C', 'D'].map(opt => {
                    const text = currentQ[`option_${opt.toLowerCase()}`];
                    if (!text) return null;
                    const isSelected = currentAns.given_answer === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => handleMcqSelect(opt)}
                        className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all group ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/40 text-white shadow-lg shadow-amber-500/10'
                            : 'border-dark-700/50 bg-dark-800/30 text-dark-200 hover:bg-dark-800/70 hover:border-dark-600'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black border ${
                          isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-dark-600 text-dark-400 group-hover:border-dark-500'
                        }`}>{opt}</span>
                        <span className="text-sm leading-relaxed pt-0.5">{text}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* FITB Input */}
              {currentQ.question_type === 'FITB' && (
                <div>
                  <label className="text-dark-400 text-xs font-semibold block mb-2">Your Answer (numerical)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={currentAns.given_answer || ''}
                      onChange={e => handleFitbChange(e.target.value)}
                      onBlur={handleFitbBlur}
                      placeholder="Enter your answer..."
                      className="flex-1 bg-dark-800 border border-dark-600 focus:border-amber-500 rounded-xl px-4 py-3 text-white text-base font-mono focus:outline-none transition-colors"
                    />
                    <button
                      onClick={() => { handleFitbChange(''); handleFitbBlur(); }}
                      className="p-3 rounded-xl text-dark-400 hover:text-white border border-dark-700/50 hover:bg-dark-800 transition-all"
                      title="Clear"
                    >
                      <HiOutlineX className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-dark-500 text-xs mt-2">Use the scientific calculator (⊕) to compute your answer</p>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex items-center gap-3 mt-8">
                <button
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dark-700/50 text-dark-300 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm font-semibold"
                >
                  <HiOutlineChevronLeft className="w-4 h-4" /> Previous
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => setCurrentIdx(i => Math.min(questions.length - 1, i + 1))}
                  disabled={currentIdx === questions.length - 1}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dark-800 border border-dark-700/50 text-white hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm font-semibold"
                >
                  Save & Next <HiOutlineChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Mobile submit */}
              <div className="sm:hidden mt-4">
                <button onClick={() => handleSubmit(false)} className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold">Submit Test</button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Question Palette (desktop always visible, mobile toggle) */}
        <div className={`${showPalette ? 'fixed inset-0 z-40 bg-black/60' : 'hidden'} sm:relative sm:flex sm:z-auto sm:bg-transparent`} onClick={e => { if (e.target === e.currentTarget) setShowPalette(false); }}>
          <div className="w-72 bg-dark-900 border-l border-dark-700/50 flex flex-col ml-auto h-full sm:h-auto overflow-y-auto">
            <div className="p-4 border-b border-dark-700/50">
              <h3 className="text-white font-bold text-sm mb-3">Question Palette</h3>
              {/* Legend */}
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[
                  { label: 'Unattempted', cls: 'bg-dark-700' },
                  { label: 'Answered', cls: 'bg-emerald-500/20 border-emerald-500/40' },
                  { label: 'Marked for Review', cls: 'bg-amber-500/20 border-amber-500/40' },
                  { label: 'Ans + Review', cls: 'bg-purple-500/20 border-purple-500/40' },
                ].map(({ label, cls }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-4 h-4 rounded ${cls} border border-transparent flex-shrink-0`} />
                    <span className="text-dark-400">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 flex-1">
              <div className="grid grid-cols-5 gap-1.5">
                {questions.map((q, idx) => {
                  const status = getQuestionStatus(idx);
                  return (
                    <button
                      key={q.id}
                      onClick={() => { setCurrentIdx(idx); setShowPalette(false); }}
                      className={`w-full aspect-square rounded-xl text-xs font-bold border transition-all hover:scale-105 ${statusColors[status]} ${idx === currentIdx ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-dark-900' : ''}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-dark-700/50 space-y-2 text-xs text-dark-400">
              <div className="flex justify-between"><span>Answered</span><span className="text-white font-bold">{answeredCount}</span></div>
              <div className="flex justify-between"><span>Unanswered</span><span className="text-red-400 font-bold">{questions.length - answeredCount}</span></div>
              <div className="flex justify-between"><span>For Review</span><span className="text-amber-400 font-bold">{reviewCount}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
