import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { studentAPI, getErrorMessage } from '../../services/api';
import { HiOutlineCode, HiOutlineLogout, HiOutlineClock, HiOutlinePlay, HiOutlineRefresh } from 'react-icons/hi';

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState({ upcoming: [], active: [], completed: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => { loadTests(); }, []);

  const loadTests = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await studentAPI.getTests();
      const data = res.data && (res.data.active?.length || res.data.upcoming?.length || res.data.completed?.length)
        ? res.data
        : { upcoming: [], active: [], completed: [] };
      setTests(data);
    } catch (err) {
      // Backend failure must never look like "no tests assigned".
      setLoadError(getErrorMessage(err, 'Failed to load your tests. Please try again.'));
      setTests({ upcoming: [], active: [], completed: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const TestCard = ({ test, type }) => {
    const isActive = type === 'active';
    const isCompleted = type === 'completed';

    // Classification is server-authoritative. The backend already sorted tests
    // into the correct bucket. The frontend only needs to decide the CTA.
    // A test is "resumable" when it has an in_progress attempt.
    // A test is "startable" when no attempt exists yet and the window is open.
    const hasAttempt = !!test.attempt_id;
    const attemptStatus = test.attempt_status;
    const isInProgress = attemptStatus === 'in_progress';
    const isSubmittedState =
      attemptStatus === 'submitted' ||
      attemptStatus === 'auto_submitted' ||
      attemptStatus === 'expired' ||
      attemptStatus === 'completed';

    return (
      <div className="surface-card interactive-card rounded-2xl p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-base font-medium text-white mb-1">{test.name}</h3>
            <p className="text-xs text-dark-400 line-clamp-2">{test.description || 'No description'}</p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ml-3 ${
            isActive ? 'bg-emerald-500/10 text-emerald-500' :
            isCompleted ? 'bg-dark-600/30 text-dark-400' :
            'bg-amber-500/10 text-amber-500'
          }`}>{type}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4 rounded-xl bg-dark-900/45 p-3">
          <div className="flex items-center gap-1.5 text-xs text-dark-400">
            <HiOutlineClock className="w-3.5 h-3.5" /> {test.duration_minutes} min
          </div>
          <div className="text-xs text-dark-400">{test.questions_per_student} Questions</div>
          <div className="text-xs text-dark-400">{test.total_marks} Marks</div>
          <div className="text-xs text-dark-400">{new Date(test.start_time).toLocaleDateString()}</div>
        </div>

        {/* CTA — only shown for active, non-submitted tests */}
        {isActive && !isSubmittedState && (
          <Link
            to={hasAttempt && isInProgress
              ? `/student/exam/${test.attempt_id}`
              : `/student/tests/${test.id}/instructions`}
            className="flex items-center justify-center gap-2 w-full py-2.5 btn-primary text-white rounded-xl text-sm font-semibold transition-all"
          >
            <HiOutlinePlay className="w-4 h-4" />
            {hasAttempt && isInProgress ? 'Continue Test' : 'Start Test'}
          </Link>
        )}
        {isSubmittedState && (
          <div className="text-center py-2 text-xs text-dark-400 bg-dark-900/50 rounded-lg">
            {isCompleted ? 'Completed' : 'Submitted'}{test.attempt_submitted_at ? ` · ${new Date(test.attempt_submitted_at).toLocaleString()}` : ''}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen aurora-bg grid-overlay">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-dark-700/50 bg-dark-950/75 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/20">
              <HiOutlineCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black text-white">CodeArena</h1>
              <p className="text-[10px] text-dark-500 uppercase tracking-wider">Student Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs text-dark-400">{user?.register_number} · {user?.department}</p>
            </div>
            <button onClick={handleLogout} className="p-2 rounded-xl border border-dark-700/50 bg-dark-900/60 text-dark-400 hover:text-red-400 hover:border-red-500/30 transition-colors">
              <HiOutlineLogout className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fade-in">
        {loadError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-400">Could not load your dashboard</p>
              <p className="text-xs text-red-400/80 mt-1">{loadError}</p>
            </div>
            <button
              onClick={loadTests}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl text-sm font-semibold transition-colors"
            >
              <HiOutlineRefresh className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        <section className="glass-card rounded-3xl p-6 sm:p-8 overflow-hidden relative">
          <div className="absolute right-0 top-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-300 mb-3">Assessment Hub</p>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h2>
              <p className="text-sm text-dark-300 mt-3 max-w-2xl">Review available tests, continue active attempts, and stay aligned with your exam schedule.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 min-w-full md:min-w-[320px]">
              {[
                ['Active', tests.active.length, 'text-emerald-400'],
                ['Upcoming', tests.upcoming.length, 'text-amber-400'],
                ['Done', tests.completed.length, 'text-brand-400'],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-2xl border border-dark-700/50 bg-dark-950/45 p-3 text-center">
                  <p className={`text-2xl font-black ${color}`}>{value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-dark-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Active Tests */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Active Tests
          </h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2].map(i => <div key={i} className="surface-card rounded-2xl p-5 animate-pulse"><div className="h-5 bg-dark-700 rounded w-40 mb-3" /><div className="h-3 bg-dark-700 rounded w-24" /></div>)}
            </div>
          ) : tests.active.length === 0 && loadError ? (
            <div className="surface-card rounded-2xl p-8 text-center text-dark-500 text-sm">
              Could not load your active tests. Use Retry above.
            </div>
          ) : tests.active.length === 0 ? (
            <div className="surface-card rounded-2xl p-8 text-center text-dark-500 text-sm">No active tests</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tests.active.map(t => <TestCard key={t.id} test={t} type="active" />)}
            </div>
          )}
        </section>

        {/* Upcoming */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Upcoming Tests</h2>
          {tests.upcoming.length === 0 ? (
            <div className="surface-card rounded-2xl p-6 text-center text-dark-500 text-sm">No upcoming tests</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tests.upcoming.map(t => <TestCard key={t.id} test={t} type="upcoming" />)}
            </div>
          )}
        </section>

        {/* Completed */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Completed Tests</h2>
          {tests.completed.length === 0 ? (
            <div className="surface-card rounded-2xl p-6 text-center text-dark-500 text-sm">No completed tests</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tests.completed.map(t => <TestCard key={t.id} test={t} type="completed" />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
