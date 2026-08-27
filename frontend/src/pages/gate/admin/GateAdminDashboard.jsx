import { useState, useEffect } from 'react';
import { gateAdminAPI } from '../../../services/gateApi';
import toast from 'react-hot-toast';
import { HiOutlineCollection, HiOutlineClipboardList, HiOutlineUsers, HiOutlineChartBar } from 'react-icons/hi';

export default function GateAdminDashboard() {
  const [tests, setTests] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      gateAdminAPI.listTests().then(r => setTests(r.data)),
      gateAdminAPI.listQuestions({}).then(r => setQuestions(r.data)),
    ]).catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'Questions', value: questions.length, icon: HiOutlineCollection, color: 'from-blue-500 to-cyan-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { label: 'Tests Created', value: tests.length, icon: HiOutlineClipboardList, color: 'from-amber-500 to-orange-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { label: 'Active Tests', value: tests.filter(t => t.is_active).length, icon: HiOutlineUsers, color: 'from-emerald-500 to-teal-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { label: 'MCQ Questions', value: questions.filter(q => q.question_type === 'MCQ').length, icon: HiOutlineChartBar, color: 'from-purple-500 to-pink-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  ];

  const subjectCounts = questions.reduce((acc, q) => {
    acc[q.subject] = (acc[q.subject] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">GATE Dashboard</h1>
        <p className="text-dark-400 text-sm mt-1">Overview of your GATE exam portal</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={`${bg} ${border} border rounded-2xl p-5 flex items-center gap-4`}>
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg flex-shrink-0`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-black text-white">{loading ? '—' : value}</p>
              <p className="text-dark-400 text-xs font-medium">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Subject breakdown */}
        <div className="bg-dark-900/60 backdrop-blur border border-dark-700/50 rounded-2xl p-5">
          <h3 className="text-base font-bold text-white mb-4">Questions by Subject</h3>
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-dark-800 rounded-lg animate-pulse" />)}</div>
          ) : Object.entries(subjectCounts).length === 0 ? (
            <p className="text-dark-500 text-sm text-center py-8">No questions yet. Add questions in the Question Bank.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(subjectCounts).sort((a, b) => b[1] - a[1]).map(([subject, count]) => (
                <div key={subject} className="flex items-center gap-3">
                  <span className="text-dark-300 text-sm w-40 truncate">{subject}</span>
                  <div className="flex-1 bg-dark-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-400"
                      style={{ width: `${Math.round((count / questions.length) * 100)}%` }}
                    />
                  </div>
                  <span className="text-white text-sm font-bold w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Tests */}
        <div className="bg-dark-900/60 backdrop-blur border border-dark-700/50 rounded-2xl p-5">
          <h3 className="text-base font-bold text-white mb-4">Recent Tests</h3>
          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-dark-800 rounded-xl animate-pulse" />)}</div>
          ) : tests.length === 0 ? (
            <p className="text-dark-500 text-sm text-center py-8">No tests created yet.</p>
          ) : (
            <div className="space-y-2">
              {tests.slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-dark-800/50 rounded-xl border border-dark-700/30">
                  <div>
                    <p className="text-white text-sm font-semibold">{t.title}</p>
                    <p className="text-dark-400 text-xs">{t.duration_minutes} min · {t.question_count} questions</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${t.is_active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-dark-700 text-dark-400 border border-dark-600'}`}>
                    {t.is_active ? 'Active' : 'Draft'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
