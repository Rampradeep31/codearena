import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineCode, HiOutlineShieldCheck } from 'react-icons/hi';

export default function ExamInstructions() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => { loadTest(); }, [testId]);

  const loadTest = async () => {
    setLoadError('');
    try {
      const res = await studentAPI.getTests();
      const allBuckets = res.data || { upcoming: [], active: [], completed: [] };
      const all = [
        ...(allBuckets.active || []),
        ...(allBuckets.upcoming || []),
        ...(allBuckets.completed || []),
      ];
      const found = all.find(t => t.id === parseInt(testId));
      if (!found) {
        setLoadError('Test not found. Please check with your instructor.');
        return;
      }

      // If this test already has a completed attempt, redirect to results.
      const completedStatuses = ['submitted', 'auto_submitted', 'expired', 'completed'];
      if (found.attempt_id && completedStatuses.includes(found.attempt_status)) {
        navigate(`/student/exam/${found.attempt_id}/complete`, { replace: true });
        return;
      }

      // If there is an in_progress attempt, go directly to the exam.
      if (found.attempt_id && found.attempt_status === 'in_progress') {
        navigate(`/student/exam/${found.attempt_id}`, { replace: true });
        return;
      }

      setTest(found);
    } catch {
      setLoadError('Failed to load test details. Check your connection and try again.');
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await studentAPI.startTest(parseInt(testId));
      toast.success('Test started!');
      navigate(`/student/exam/${res.data.id}`, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start the test. Please try again.');
    } finally { setStarting(false); }
  };

  if (loadError) return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700/50 rounded-2xl p-8 max-w-md w-full text-center animate-fade-in">
        <h1 className="text-xl font-bold text-white mb-3">Cannot Load Test</h1>
        <p className="text-sm text-dark-400 mb-6">{loadError}</p>
        <button onClick={loadTest} className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl text-sm transition-colors">
          Try Again
        </button>
      </div>
    </div>
  );

  if (!test) return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center justify-center">
              <HiOutlineCode className="w-6 h-6 text-brand-400" />
            </div>
            <span className="text-xl font-bold text-white">CodeArena</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-4">{test.name}</h1>
          <p className="text-dark-400 text-sm mt-1">{test.description || ''}</p>
        </div>

        {/* Test Info */}
        <div className="bg-dark-900 border border-dark-700/50 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">Test Information</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Duration', value: `${test.duration_minutes} minutes` },
              { label: 'Questions', value: test.questions_per_student },
              { label: 'Total Marks', value: test.total_marks },
              { label: 'Languages', value: test.allowed_languages?.map(l => l === 'cpp' ? 'C++' : l.charAt(0).toUpperCase() + l.slice(1)).join(', ') },
            ].map(({ label, value }) => (
              <div key={label} className="bg-dark-800 rounded-lg px-4 py-3">
                <p className="text-xs text-dark-400 mb-0.5">{label}</p>
                <p className="text-sm font-medium text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-dark-900 border border-dark-700/50 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlineShieldCheck className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-semibold text-white">Examination Rules</h2>
          </div>
          <ul className="space-y-2.5 text-sm text-dark-300">
            {[
              'Do not switch browser tabs during the examination.',
              'Do not minimize the examination window.',
              'Do not exit fullscreen mode.',
              'Do not refresh the page unnecessarily.',
              'Do not use copy/paste where prohibited.',
              'Do not open another browser window.',
              'All suspicious browser activity will be recorded.',
              `Maximum ${test.max_violations || 3} violations allowed before auto-submission.`,
              'The timer is server-controlled and cannot be reset.',
              'Your code is auto-saved every 10-15 seconds.',
            ].map((rule, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 text-xs">●</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Agreement & Start */}
        <div className="bg-dark-900 border border-dark-700/50 rounded-2xl p-6">
          <label className="flex items-start gap-3 cursor-pointer mb-5">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 rounded border-dark-600 bg-dark-800 text-brand-500 focus:ring-brand-500" />
            <span className="text-sm text-dark-300">I have read and agree to follow the examination rules. I understand that violations may result in automatic submission.</span>
          </label>

          <button
            onClick={handleStart}
            disabled={!agreed || starting}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {starting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Starting Exam...
              </>
            ) : (
              'START EXAM'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
