import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { HiOutlineUsers, HiOutlineClipboardList, HiOutlineCollection, HiOutlineLightningBolt, HiOutlineCheckCircle, HiOutlineDocumentText } from 'react-icons/hi';

const statCards = [
  { key: 'total_students', label: 'Total Students', icon: HiOutlineUsers, color: 'brand' },
  { key: 'total_tests', label: 'Total Tests', icon: HiOutlineClipboardList, color: 'purple' },
  { key: 'active_tests', label: 'Active Tests', icon: HiOutlineLightningBolt, color: 'emerald' },
  { key: 'completed_tests', label: 'Completed Tests', icon: HiOutlineCheckCircle, color: 'amber' },
  { key: 'total_questions', label: 'Total Questions', icon: HiOutlineCollection, color: 'brand' },
  { key: 'total_submissions', label: 'Total Submissions', icon: HiOutlineDocumentText, color: 'purple' },
];

const colorMap = {
  brand: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, testsRes] = await Promise.all([
        adminAPI.getDashboard(),
        adminAPI.getTests(),
      ]);
      setStats(statsRes.data);
      setTests(testsRes.data.slice(0, 5));
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-dark-700 rounded w-24 mb-3" />
              <div className="h-8 bg-dark-700 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-dark-400 text-sm mt-1">Overview of your assessment platform</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 hover:border-dark-600 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-dark-400 text-sm font-medium">{label}</span>
              <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${colorMap[color]}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.[key] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Recent Tests */}
      <div className="bg-dark-800 border border-dark-700/50 rounded-xl">
        <div className="px-5 py-4 border-b border-dark-700/50 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Recent Tests</h2>
          <Link to="/admin/tests" className="text-brand-400 hover:text-brand-300 text-sm font-medium">
            View All →
          </Link>
        </div>
        <div className="divide-y divide-dark-700/50">
          {tests.length === 0 ? (
            <div className="px-5 py-8 text-center text-dark-500 text-sm">No tests created yet</div>
          ) : (
            tests.map((test) => {
              const now = new Date();
              const start = new Date(test.start_time);
              const end = new Date(test.end_time);
              const isActive = now >= start && now <= end;
              const isUpcoming = now < start;

              return (
                <div key={test.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-dark-700/20 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-white">{test.name}</p>
                    <p className="text-xs text-dark-500 mt-0.5">
                      {test.duration_minutes} min · {test.questions_per_student} questions · {test.total_marks} marks
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      isActive ? 'bg-emerald-500/10 text-emerald-500' :
                      isUpcoming ? 'bg-amber-500/10 text-amber-500' :
                      'bg-dark-600/30 text-dark-400'
                    }`}>
                      {isActive ? 'Active' : isUpcoming ? 'Upcoming' : 'Completed'}
                    </span>
                    {isActive && (
                      <Link to={`/admin/tests/${test.id}/monitor`} className="text-xs text-brand-400 hover:text-brand-300 font-medium">
                        Monitor →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
