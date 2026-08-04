import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { studentAPI } from '../../services/api';
import { HiOutlineCheckCircle, HiOutlineCode } from 'react-icons/hi';

export default function TestComplete() {
  const { attemptId } = useParams();
  const [attempt, setAttempt] = useState(null);

  useEffect(() => {
    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    loadAttempt();
  }, [attemptId]);

  const loadAttempt = async () => {
    try { const res = await studentAPI.getAttempt(attemptId); setAttempt(res.data); }
    catch { console.error('Error loading attempt'); }
  };

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center animate-fade-in">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <HiOutlineCheckCircle className="w-10 h-10 text-emerald-500" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Test Submitted Successfully</h1>
        <p className="text-dark-400 text-sm mb-8">Your answers have been recorded and submitted for evaluation.</p>

        {attempt && (
          <div className="bg-dark-900 border border-dark-700/50 rounded-2xl p-6 mb-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-400">Submission Time</span>
                <span className="text-white font-medium">{attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : '—'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-400">Status</span>
                <span className="text-emerald-500 font-medium capitalize">{attempt.status?.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-400">Submission Type</span>
                <span className="text-white font-medium capitalize">{attempt.submission_reason?.replace('_', ' ') || 'Manual'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-400">Violations</span>
                <span className={`font-medium ${attempt.violation_count > 0 ? 'text-amber-500' : 'text-dark-300'}`}>{attempt.violation_count}</span>
              </div>
              {(attempt.total_score ?? attempt.score) != null && (
                <div className="flex items-center justify-between text-sm mt-4 pt-4 border-t border-dark-700/50">
                  <span className="text-dark-400">Total Score</span>
                  <span className="text-emerald-400 font-bold text-lg">{attempt.total_score ?? attempt.score}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <Link
          to="/student"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <HiOutlineCode className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
