import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gateStudentAPI } from '../../../services/gateApi';
import { useAuth } from '../../../context/AuthContext';
import toast from 'react-hot-toast';
import { HiOutlineClock, HiOutlineAcademicCap, HiOutlinePlay, HiOutlineArrowLeft, HiOutlineCheckCircle } from 'react-icons/hi';

export default function GateStudentDashboard() {
  const [tests, setTests] = useState([]);
  const [myAttempts, setMyAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      gateStudentAPI.listTests().then(r => setTests(r.data)),
      gateStudentAPI.myAttempts().then(r => setMyAttempts(r.data)),
    ]).catch(() => toast.error('Failed to load tests'))
      .finally(() => setLoading(false));
  }, []);

  const getAttemptForTest = (testId) => myAttempts.find(a => a.gate_test_id === testId);

  const handleStartOrResume = async (test) => {
    const existing = getAttemptForTest(test.id);
    if (existing) {
      if (existing.status === 'SUBMITTED') {
        navigate(`/gate/student/result/${existing.id}`);
      } else {
        navigate(`/gate/student/exam/${existing.id}`);
      }
      return;
    }
    try {
      const res = await gateStudentAPI.startAttempt(test.id);
      navigate(`/gate/student/exam/${res.data.id}`);
    } catch (e) { toast.error(e.message || 'Failed to start test'); }
  };

  return (
    <div className="min-h-screen aurora-bg">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-dark-900/80 backdrop-blur-xl border-b border-amber-500/20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/portal-select')} className="p-2 rounded-xl text-dark-400 hover:text-white hover:bg-dark-800 transition-all">
              <HiOutlineArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
              <HiOutlineAcademicCap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-white font-black text-sm leading-tight">GATE Exam Portal</h1>
              <p className="text-amber-500/70 text-[10px] uppercase tracking-wider">Student Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-dark-300 text-sm hidden sm:block">{user?.name}</span>
            <button onClick={() => { logout(); navigate('/login', { replace: true }); }} className="text-xs text-dark-400 hover:text-red-400 transition-all px-3 py-1.5 rounded-lg hover:bg-red-500/10">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Welcome */}
        <div className="text-center">
          <h2 className="text-3xl font-black text-white">Welcome, {user?.name?.split(' ')[0] || 'Student'}!</h2>
          <p className="text-dark-400 mt-2">Choose a GATE exam to begin your assessment.</p>
        </div>

        {/* Available Tests */}
        <div>
          <h3 className="text-lg font-bold text-white mb-4">Available Tests</h3>
          {loading ? (
            <div className="grid sm:grid-cols-2 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-dark-800/50 rounded-2xl animate-pulse" />)}</div>
          ) : tests.length === 0 ? (
            <div className="text-center py-20 bg-dark-900/40 border border-dark-700/50 rounded-2xl">
              <HiOutlineAcademicCap className="w-12 h-12 mx-auto mb-3 text-dark-600" />
              <p className="text-dark-400">No tests available right now. Check back later.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {tests.map(test => {
                const attempt = getAttemptForTest(test.id);
                const isSubmitted = attempt?.status === 'SUBMITTED';
                const isOngoing = attempt?.status === 'ONGOING';

                return (
                  <div key={test.id} className="bg-dark-900/60 border border-dark-700/50 hover:border-amber-500/30 rounded-2xl p-5 transition-all group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                        <HiOutlineAcademicCap className="w-5 h-5 text-white" />
                      </div>
                      {isSubmitted && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold flex items-center gap-1">
                          <HiOutlineCheckCircle className="w-3.5 h-3.5" /> Submitted
                        </span>
                      )}
                      {isOngoing && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 font-semibold animate-pulse">In Progress</span>
                      )}
                    </div>
                    <h4 className="text-white font-bold text-base mb-1">{test.title}</h4>
                    {test.description && <p className="text-dark-400 text-xs mb-3 line-clamp-2">{test.description}</p>}
                    <div className="flex flex-wrap gap-3 text-xs text-dark-400 mb-4">
                      <span className="flex items-center gap-1"><HiOutlineClock className="w-3.5 h-3.5" />{test.duration_minutes} min</span>
                      <span>{test.question_count} questions</span>
                      <span>{test.total_marks} marks</span>
                    </div>
                    {isSubmitted ? (
                      <button onClick={() => navigate(`/gate/student/result/${attempt.id}`)} className="w-full px-4 py-2 rounded-xl text-sm font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                        View Result
                      </button>
                    ) : (
                      <button onClick={() => handleStartOrResume(test)} className="w-full px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
                        <HiOutlinePlay className="w-4 h-4" />
                        {isOngoing ? 'Resume Exam' : 'Start Exam'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* My attempts */}
        {myAttempts.length > 0 && (
          <div>
            <h3 className="text-lg font-bold text-white mb-4">My Attempts</h3>
            <div className="bg-dark-900/60 border border-dark-700/50 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="text-dark-400 text-xs border-b border-dark-700/50">
                  <th className="text-left px-4 py-2">Test</th>
                  <th className="text-left px-4 py-2">Score</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Action</th>
                </tr></thead>
                <tbody>
                  {myAttempts.map(a => (
                    <tr key={a.id} className="border-b border-dark-800/50">
                      <td className="px-4 py-3 text-white font-medium">{a.test_title}</td>
                      <td className="px-4 py-3 font-bold text-amber-400">{a.score?.toFixed(2) ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a.status === 'SUBMITTED' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{a.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {a.status === 'SUBMITTED' && (
                          <button onClick={() => navigate(`/gate/student/result/${a.id}`)} className="text-xs text-amber-400 hover:underline">View</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
