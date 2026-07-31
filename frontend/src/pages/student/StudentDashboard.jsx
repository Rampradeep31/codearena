import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { studentAPI } from '../../services/api';
import { HiOutlineCode, HiOutlineLogout, HiOutlineClock, HiOutlinePlay } from 'react-icons/hi';

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState({ upcoming: [], active: [], completed: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTests(); }, []);

  const loadTests = async () => {
    try { const res = await studentAPI.getTests(); setTests(res.data); }
    catch { console.error('Error loading tests'); }
    finally { setLoading(false); }
  };

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const TestCard = ({ test, type }) => {
    const isActive = type === 'active';
    const isCompleted = type === 'completed';
    const hasAttempt = !!test.attempt_id;
    const isSubmitted = test.attempt_status === 'submitted' || test.attempt_status === 'auto_submitted';

    return (
      <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 hover:border-dark-600 transition-colors">
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

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="flex items-center gap-1.5 text-xs text-dark-400">
            <HiOutlineClock className="w-3.5 h-3.5" /> {test.duration_minutes} min
          </div>
          <div className="text-xs text-dark-400">{test.questions_per_student} Questions</div>
          <div className="text-xs text-dark-400">{test.total_marks} Marks</div>
          <div className="text-xs text-dark-400">{new Date(test.start_time).toLocaleDateString()}</div>
        </div>

        {isActive && !isSubmitted && (
          <Link
            to={hasAttempt ? `/student/exam/${test.attempt_id}` : `/student/tests/${test.id}/instructions`}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <HiOutlinePlay className="w-4 h-4" />
            {hasAttempt ? 'Continue Test' : 'Start Test'}
          </Link>
        )}
        {isSubmitted && (
          <div className="text-center py-2 text-xs text-dark-400 bg-dark-900/50 rounded-lg">
            Submitted {test.attempt_submitted_at ? new Date(test.attempt_submitted_at).toLocaleString() : ''}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Header */}
      <header className="bg-dark-900 border-b border-dark-700/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-500/10 border border-brand-500/20 rounded-lg flex items-center justify-center">
              <HiOutlineCode className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">CodeArena</h1>
              <p className="text-[10px] text-dark-500 uppercase tracking-wider">Student Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs text-dark-400">{user?.register_number} · {user?.department}</p>
            </div>
            <button onClick={handleLogout} className="p-2 text-dark-400 hover:text-red-400 transition-colors">
              <HiOutlineLogout className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8 animate-fade-in">
        {/* Active Tests */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Active Tests
          </h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2].map(i => <div key={i} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 animate-pulse"><div className="h-5 bg-dark-700 rounded w-40 mb-3" /><div className="h-3 bg-dark-700 rounded w-24" /></div>)}
            </div>
          ) : tests.active.length === 0 ? (
            <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-8 text-center text-dark-500 text-sm">No active tests</div>
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
            <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-6 text-center text-dark-500 text-sm">No upcoming tests</div>
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
            <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-6 text-center text-dark-500 text-sm">No completed tests</div>
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
