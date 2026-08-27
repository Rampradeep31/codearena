import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gateStudentAPI } from '../../../services/gateApi';
import toast from 'react-hot-toast';
import { HiOutlineCheckCircle, HiOutlineX, HiOutlineArrowLeft, HiOutlineAcademicCap } from 'react-icons/hi';

export default function GateResult() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [res, qRes] = await Promise.all([
          gateStudentAPI.getResult(attemptId),
          gateStudentAPI.getResultQuestions(attemptId).catch(() => ({ data: [] })),
        ]);
        setResult(res.data);
        if (qRes.data && qRes.data.length > 0) {
          setQuestions(qRes.data);
        } else {
          // Fallback to test questions if result questions fail
          const attemptsRes = await gateStudentAPI.myAttempts();
          const a = attemptsRes.data.find(x => String(x.id) === String(attemptId));
          if (a) {
            const fallbackQ = await gateStudentAPI.getTestQuestions(a.gate_test_id);
            setQuestions(fallbackQ.data);
          }
        }
      } catch { toast.error('Failed to load result'); navigate('/gate/student'); }
      finally { setLoading(false); }
    };
    load();
  }, [attemptId]);

  if (loading) {
    return (
      <div className="min-h-screen aurora-bg flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const answered = result?.answers?.filter(a => a.given_answer)?.length || 0;
  const correct = result?.answers?.filter(a => a.is_correct === true)?.length || 0;
  const wrong = result?.answers?.filter(a => a.is_correct === false)?.length || 0;
  const unattempted = (questions.length || 0) - answered;
  const totalMarks = questions.reduce((s, q) => s + (q.marks || 1), 0);
  const percentage = totalMarks > 0 ? ((result?.score || 0) / totalMarks * 100).toFixed(1) : 0;

  const getAnswerForQ = (qId) => result?.answers?.find(a => String(a.question_id) === String(qId));

  return (
    <div className="min-h-screen aurora-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-dark-900/80 backdrop-blur-xl border-b border-amber-500/20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/gate/student')} className="p-2 rounded-xl text-dark-400 hover:text-white hover:bg-dark-800 transition-all">
            <HiOutlineArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
            <HiOutlineAcademicCap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-white font-black text-sm">{result?.test_title || 'GATE Exam'}</h1>
            <p className="text-amber-500/70 text-[10px] uppercase">Result & Solutions</p>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Score Card */}
        <div className="bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30 rounded-3xl p-8 text-center">
          <div className="w-24 h-24 rounded-full border-4 border-amber-500 flex items-center justify-center mx-auto mb-4 bg-amber-500/10">
            <span className="text-3xl font-black text-white">{percentage}%</span>
          </div>
          <p className="text-4xl font-black text-white mb-1">{result?.score?.toFixed(2) ?? 0} <span className="text-dark-400 text-xl font-semibold">/ {totalMarks}</span></p>
          <p className="text-amber-300 font-semibold">{result?.test_title}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Correct', value: correct, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Wrong', value: wrong, cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
            { label: 'Unattempted', value: unattempted, cls: 'text-dark-300 bg-dark-800/50 border-dark-700/50' },
            { label: 'Total', value: questions.length, cls: 'text-white bg-dark-900/60 border-dark-700/50' },
          ].map(({ label, value, cls }) => (
            <div key={label} className={`${cls} border rounded-2xl p-4 text-center`}>
              <p className="text-2xl font-black">{value}</p>
              <p className="text-xs text-dark-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Question-wise review */}
        <div>
          <h3 className="text-lg font-bold text-white mb-4">Detailed Question Review & Solutions</h3>
          <div className="space-y-4">
            {questions.map((q, idx) => {
              const ans = getAnswerForQ(q.id);
              const isCorrect = ans?.is_correct === true;
              const isWrong = ans?.is_correct === false;
              const isUnattempted = !ans?.given_answer;

              return (
                <div key={q.id} className={`rounded-2xl border p-5 ${isCorrect ? 'border-emerald-500/30 bg-emerald-500/5' : isWrong ? 'border-red-500/30 bg-red-500/5' : 'border-dark-700/50 bg-dark-900/40'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black ${isCorrect ? 'bg-emerald-500 text-white' : isWrong ? 'bg-red-500 text-white' : 'bg-dark-700 text-dark-400'}`}>
                      {isCorrect ? '✓' : isWrong ? '✗' : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${q.question_type === 'MCQ' ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20' : 'text-purple-400 bg-purple-500/10 border border-purple-500/20'}`}>{q.question_type}</span>
                        <span className="text-xs text-amber-300 font-semibold px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full">{q.subject}</span>
                        <span className="text-xs font-bold text-amber-400 ml-auto">{ans?.marks_obtained?.toFixed(2) ?? 0} / {q.marks} Marks</span>
                      </div>
                      <p className="text-white text-sm leading-relaxed mb-3 font-medium">{q.statement}</p>

                      {/* Options for MCQ */}
                      {q.question_type === 'MCQ' && (
                        <div className="grid sm:grid-cols-2 gap-2 mb-3">
                          {['A', 'B', 'C', 'D'].map(opt => {
                            const optText = q[`option_${opt.toLowerCase()}`];
                            if (!optText) return null;
                            const isSelected = ans?.given_answer === opt;
                            const isCorrectOpt = q.correct_answer === opt;

                            let optCls = 'border-dark-700/50 text-dark-400 bg-dark-800/20';
                            if (isCorrectOpt) optCls = 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-bold';
                            else if (isSelected && !isCorrectOpt) optCls = 'border-red-500/40 bg-red-500/15 text-red-300 font-semibold';

                            return (
                              <div key={opt} className={`px-3 py-2 rounded-xl text-xs border flex items-center gap-2 ${optCls}`}>
                                <span className="font-bold">{opt}.</span>
                                <span>{optText}</span>
                                {isCorrectOpt && <span className="ml-auto text-[10px] uppercase font-bold text-emerald-400">(Correct)</span>}
                                {isSelected && !isCorrectOpt && <span className="ml-auto text-[10px] uppercase font-bold text-red-400">(Your Choice)</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-4 text-xs mt-2 pt-2 border-t border-dark-800/60">
                        {isUnattempted ? (
                          <span className="text-dark-500 italic">Not attempted</span>
                        ) : (
                          <span className={isCorrect ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                            Your answer: {ans?.given_answer}
                          </span>
                        )}
                        {q.correct_answer && (
                          <span className="text-emerald-400 font-bold">
                            Correct answer: {q.correct_answer}
                          </span>
                        )}
                      </div>

                      {/* Explanation */}
                      {q.explanation && (
                        <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                          <p className="text-amber-300 font-bold mb-1">Explanation / Solution:</p>
                          <p className="text-dark-200 leading-relaxed whitespace-pre-wrap">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-center">
          <button onClick={() => navigate('/gate/student')} className="px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold hover:opacity-90 transition-all shadow-lg shadow-amber-500/20">
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
