import { useState, useEffect } from 'react';
import { gateAdminAPI } from '../../../services/gateApi';
import toast from 'react-hot-toast';
import { HiOutlineChartBar, HiOutlineUser, HiOutlineClipboardList } from 'react-icons/hi';

export default function GateResults() {
  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  useEffect(() => {
    gateAdminAPI.listTests().then(r => setTests(r.data)).catch(() => toast.error('Failed to load tests')).finally(() => setLoadingTests(false));
  }, []);

  const loadAttempts = async (test) => {
    setSelectedTest(test);
    setLoadingAttempts(true);
    try { const res = await gateAdminAPI.getTestAttempts(test.id); setAttempts(res.data); }
    catch { toast.error('Failed to load results'); }
    finally { setLoadingAttempts(false); }
  };

  const avg = attempts.length ? (attempts.reduce((s, a) => s + (a.score || 0), 0) / attempts.length).toFixed(1) : '—';
  const highest = attempts.length ? Math.max(...attempts.map(a => a.score || 0)).toFixed(1) : '—';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-white">Results</h1>
        <p className="text-dark-400 text-sm mt-0.5">View student performance across GATE tests</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Test selector */}
        <div className="bg-dark-900/60 border border-dark-700/50 rounded-2xl p-4">
          <h3 className="text-white font-bold mb-3 text-sm">Select Test</h3>
          {loadingTests ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-dark-800 rounded-xl animate-pulse" />)}</div>
          ) : tests.length === 0 ? (
            <p className="text-dark-500 text-xs text-center py-6">No tests created yet.</p>
          ) : (
            <div className="space-y-2">
              {tests.map(t => (
                <button
                  key={t.id}
                  onClick={() => loadAttempts(t)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all text-sm font-semibold ${selectedTest?.id === t.id ? 'bg-amber-500/15 border border-amber-500/25 text-amber-300' : 'text-dark-300 hover:bg-dark-800 border border-transparent'}`}
                >
                  <p>{t.title}</p>
                  <p className="text-xs font-normal text-dark-500 mt-0.5">{t.question_count} questions · {t.duration_minutes} min</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedTest ? (
            <div className="bg-dark-900/60 border border-dark-700/50 rounded-2xl p-12 text-center text-dark-500">
              <HiOutlineClipboardList className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Select a test to view results</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Attempts', value: attempts.length },
                  { label: 'Average Score', value: avg },
                  { label: 'Highest Score', value: highest },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-dark-900/60 border border-dark-700/50 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-white">{loadingAttempts ? '—' : value}</p>
                    <p className="text-dark-400 text-xs mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Attempts table */}
              <div className="bg-dark-900/60 border border-dark-700/50 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-dark-700/50">
                  <h3 className="text-white font-bold text-sm">{selectedTest.title} — Submissions</h3>
                </div>
                {loadingAttempts ? (
                  <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-dark-800 rounded-xl animate-pulse" />)}</div>
                ) : attempts.length === 0 ? (
                  <div className="p-12 text-center text-dark-500 text-sm">No submissions yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-dark-400 text-xs border-b border-dark-700/50">
                          <th className="text-left px-4 py-2">Student</th>
                          <th className="text-left px-4 py-2">Score</th>
                          <th className="text-left px-4 py-2">Status</th>
                          <th className="text-left px-4 py-2">Submitted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attempts.map(a => (
                          <tr key={a.id} className="border-b border-dark-800/50 hover:bg-dark-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <HiOutlineUser className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                <div>
                                  <p className="text-white font-medium text-xs leading-tight">{a.student_name || `Student #${a.student_id}`}</p>
                                  <p className="text-dark-400 text-[11px]">{a.student_email || `ID: ${a.student_id}`}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-bold ${(a.score || 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>{a.score?.toFixed(2) ?? '—'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a.status === 'SUBMITTED' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{a.status}</span>
                            </td>
                            <td className="px-4 py-3 text-dark-400 text-xs">{a.end_time ? new Date(a.end_time).toLocaleString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
