import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { studentAPI, getErrorMessage } from '../../services/api';
import { 
  HiOutlineCode, 
  HiOutlineLogout, 
  HiOutlineClock, 
  HiOutlinePlay, 
  HiOutlineRefresh, 
  HiOutlineLightningBolt, 
  HiOutlineAcademicCap, 
  HiOutlineChatAlt2,
  HiOutlineCheckCircle,
  HiOutlineChevronRight,
  HiOutlineSparkles,
  HiOutlineBookOpen
} from 'react-icons/hi';

const CATEGORIES = [
  {
    id: 'coding',
    name: 'Coding',
    icon: HiOutlineCode,
    badge: 'Core Assessments',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    color: 'from-emerald-500/20 to-teal-500/5',
    borderColor: 'hover:border-emerald-500/40',
    activeRing: 'ring-emerald-500/30 border-emerald-500/50 bg-emerald-500/10',
    iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    description: 'Programming problems, data structures, algorithms, and development assessments.',
    highlights: ['Multi-language (Python, Java, C, C++)', 'Monaco Code Editor', 'Automated Test Judge'],
  },
  {
    id: 'aptitude',
    name: 'Aptitude',
    icon: HiOutlineLightningBolt,
    badge: 'Reasoning & Logic',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    color: 'from-amber-500/20 to-orange-500/5',
    borderColor: 'hover:border-amber-500/40',
    activeRing: 'ring-amber-500/30 border-amber-500/50 bg-amber-500/10',
    iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    description: 'Quantitative aptitude, logical reasoning, data interpretation, and numerical puzzles.',
    highlights: ['Quantitative Math', 'Logical Deduction', 'Speed Problem Solving'],
  },
  {
    id: 'gate',
    name: 'GATE Exam',
    icon: HiOutlineAcademicCap,
    badge: 'National Competitive',
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    color: 'from-purple-500/20 to-indigo-500/5',
    borderColor: 'hover:border-purple-500/40',
    activeRing: 'ring-purple-500/30 border-purple-500/50 bg-purple-500/10',
    iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    description: 'Comprehensive GATE CS & IT mock series, subject-wise technical MCQs, and MSQs.',
    highlights: ['GATE CS/IT Pattern', 'Engineering Mathematics', 'Sectional Tests'],
  },
  {
    id: 'communication',
    name: 'Communication',
    icon: HiOutlineChatAlt2,
    badge: 'Verbal & Soft Skills',
    badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    color: 'from-cyan-500/20 to-blue-500/5',
    borderColor: 'hover:border-cyan-500/40',
    activeRing: 'ring-cyan-500/30 border-cyan-500/50 bg-cyan-500/10',
    iconBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    description: 'Verbal ability, reading comprehension, professional business communication, and interview readiness.',
    highlights: ['Verbal Ability', 'Grammar & Vocab', 'Comprehension Drills'],
  },
];

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState({ upcoming: [], active: [], completed: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeCategory, setActiveCategory] = useState('coding');

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
      setLoadError(getErrorMessage(err, 'Failed to load your tests. Please try again.'));
      setTests({ upcoming: [], active: [], completed: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  // Filter tests by category
  // Tests with explicit keywords in name/desc go to specific category, otherwise they belong to 'coding'
  const filterByCategory = (testList, categoryId) => {
    return testList.filter(t => {
      const text = `${t.name || ''} ${t.description || ''}`.toLowerCase();
      if (categoryId === 'aptitude') {
        return text.includes('aptitude') || text.includes('reasoning') || text.includes('quantitative');
      }
      if (categoryId === 'gate') {
        return text.includes('gate') || text.includes('engineering mathematics');
      }
      if (categoryId === 'communication') {
        return text.includes('communication') || text.includes('verbal') || text.includes('english');
      }
      // Default: 'coding' receives all standard coding tests and non-matching tests
      return !text.includes('aptitude') && !text.includes('gate') && !text.includes('communication');
    });
  };

  const categoryActiveTests = filterByCategory(tests.active, activeCategory);
  const categoryUpcomingTests = filterByCategory(tests.upcoming, activeCategory);
  const categoryCompletedTests = filterByCategory(tests.completed, activeCategory);

  const TestCard = ({ test, type }) => {
    const isActive = type === 'active';
    const isCompleted = type === 'completed';

    const hasAttempt = !!test.attempt_id;
    const attemptStatus = test.attempt_status;
    const isInProgress = attemptStatus === 'in_progress';
    const isSubmittedState =
      attemptStatus === 'submitted' ||
      attemptStatus === 'auto_submitted' ||
      attemptStatus === 'expired' ||
      attemptStatus === 'completed';

    return (
      <div className="surface-card interactive-card rounded-2xl p-5 border border-dark-700/50 hover:border-brand-500/30 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="text-base font-bold text-white mb-1 truncate">{test.name}</h3>
              <p className="text-xs text-dark-400 line-clamp-2">{test.description || 'No description provided'}</p>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
              isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
              isCompleted ? 'bg-dark-600/30 text-dark-400 border-dark-600/20' :
              'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>{type}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4 rounded-xl bg-dark-900/50 p-3 text-xs text-dark-300">
            <div className="flex items-center gap-1.5 text-dark-400">
              <HiOutlineClock className="w-3.5 h-3.5 text-brand-400" /> {test.duration_minutes} min
            </div>
            <div className="text-dark-300">{test.questions_per_student} Questions</div>
            <div className="text-dark-300">{test.total_marks} Marks</div>
            <div className="text-dark-400">{new Date(test.start_time).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Action Button */}
        {isActive && !isSubmittedState && (
          <Link
            to={hasAttempt && isInProgress
              ? `/student/exam/${test.attempt_id}`
              : `/student/tests/${test.id}/instructions`}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-brand-500/20"
          >
            <HiOutlinePlay className="w-4 h-4" />
            {hasAttempt && isInProgress ? 'Continue Assessment' : 'Start Assessment'}
          </Link>
        )}
        {isSubmittedState && (
          <div className="text-center py-2 text-xs text-dark-400 bg-dark-900/50 rounded-lg">
            {isCompleted ? 'Completed' : 'Submitted'}{test.attempt_submitted_at ? ` · ${new Date(test.attempt_submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen aurora-bg grid-overlay">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-dark-700/50 bg-dark-950/75 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/20">
              <HiOutlineCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black text-white">CodeArena</h1>
              <p className="text-[10px] text-dark-500 uppercase tracking-wider">Assessment & Exam Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold text-white">{user?.name || 'Student'}</p>
              <p className="text-xs text-dark-400">{user?.register_number || ''} · {user?.department || 'AI & DS'}</p>
            </div>
            <button 
              onClick={handleLogout} 
              className="p-2 rounded-xl border border-dark-700/50 bg-dark-900/60 text-dark-400 hover:text-red-400 hover:border-red-500/30 transition-colors cursor-pointer"
              title="Logout"
            >
              <HiOutlineLogout className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fade-in">
        {loadError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-400">Could not load your dashboard</p>
              <p className="text-xs text-red-400/80 mt-1">{loadError}</p>
            </div>
            <button
              onClick={loadTests}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            >
              <HiOutlineRefresh className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {/* Welcome Banner */}
        <section className="glass-card rounded-3xl p-6 sm:p-8 overflow-hidden relative border border-dark-700/60">
          <div className="absolute right-0 top-0 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-brand-500/20 bg-brand-500/10 text-brand-300 text-xs font-semibold mb-3">
                <HiOutlineSparkles className="w-4 h-4 text-brand-400" /> Coding Assessment Portal
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Welcome, {user?.name ? user.name.split(' ')[0] : 'Student'}!
              </h2>
              <p className="text-sm text-dark-300 mt-2 max-w-2xl">
                Launch and complete your assigned coding tests, practice sets, and live proctored assessments.
              </p>
            </div>

            <div className="flex items-center gap-3 bg-dark-950/60 border border-dark-700/50 rounded-2xl p-3.5">
              <div className="text-center px-3 border-r border-dark-700/50">
                <p className="text-xl font-black text-emerald-400">{tests.active.length}</p>
                <p className="text-[10px] uppercase font-bold text-dark-400">Active</p>
              </div>
              <div className="text-center px-3 border-r border-dark-700/50">
                <p className="text-xl font-black text-amber-400">{tests.upcoming.length}</p>
                <p className="text-[10px] uppercase font-bold text-dark-400">Upcoming</p>
              </div>
              <div className="text-center px-3">
                <p className="text-xl font-black text-brand-400">{tests.completed.length}</p>
                <p className="text-[10px] uppercase font-bold text-dark-400">Finished</p>
              </div>
            </div>
          </div>
        </section>



        {/* Category Domain Track View */}
        {activeCategory !== 'coding' && categoryActiveTests.length === 0 && (
          <div className="bg-dark-900/60 border border-dark-700/60 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-dark-800">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {CATEGORIES.find(c => c.id === activeCategory)?.name} Assessment Hub
                </h3>
                <p className="text-xs text-dark-400 mt-1 max-w-xl">
                  {CATEGORIES.find(c => c.id === activeCategory)?.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold rounded-xl">
                  Curriculum Aligned
                </span>
              </div>
            </div>

            {/* Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {CATEGORIES.find(c => c.id === activeCategory)?.highlights.map((item, idx) => (
                <div key={idx} className="p-4 bg-dark-950/60 border border-dark-800 rounded-2xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 font-bold text-xs">
                    0{idx + 1}
                  </div>
                  <span className="text-sm font-medium text-dark-200">{item}</span>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-2xl bg-dark-950/40 border border-dark-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HiOutlineBookOpen className="w-5 h-5 text-dark-400" />
                <p className="text-xs text-dark-300">
                  No active tests scheduled by faculty in this category right now. Your main programming assessments are located under the <strong className="text-brand-400 cursor-pointer" onClick={() => setActiveCategory('coding')}>Coding</strong> category.
                </p>
              </div>
              <button 
                onClick={() => setActiveCategory('coding')}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ml-3"
              >
                Go to Coding Tests
              </button>
            </div>
          </div>
        )}

        {/* Active Tests */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> 
            Active {CATEGORIES.find(c => c.id === activeCategory)?.name} Tests
          </h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2].map(i => <div key={i} className="surface-card rounded-2xl p-5 animate-pulse"><div className="h-5 bg-dark-700 rounded w-40 mb-3" /><div className="h-3 bg-dark-700 rounded w-24" /></div>)}
            </div>
          ) : categoryActiveTests.length === 0 ? (
            <div className="surface-card rounded-2xl p-8 text-center text-dark-500 text-sm border border-dark-800">
              No active {CATEGORIES.find(c => c.id === activeCategory)?.name.toLowerCase()} tests available at this moment.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryActiveTests.map(t => <TestCard key={t.id} test={t} type="active" />)}
            </div>
          )}
        </section>

        {/* Upcoming */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">
            Upcoming {CATEGORIES.find(c => c.id === activeCategory)?.name} Tests
          </h2>
          {categoryUpcomingTests.length === 0 ? (
            <div className="surface-card rounded-2xl p-6 text-center text-dark-500 text-sm border border-dark-800">
              No upcoming {CATEGORIES.find(c => c.id === activeCategory)?.name.toLowerCase()} tests scheduled.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryUpcomingTests.map(t => <TestCard key={t.id} test={t} type="upcoming" />)}
            </div>
          )}
        </section>

        {/* Completed */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4">
            Completed {CATEGORIES.find(c => c.id === activeCategory)?.name} Tests
          </h2>
          {categoryCompletedTests.length === 0 ? (
            <div className="surface-card rounded-2xl p-6 text-center text-dark-500 text-sm border border-dark-800">
              No completed {CATEGORIES.find(c => c.id === activeCategory)?.name.toLowerCase()} tests yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryCompletedTests.map(t => <TestCard key={t.id} test={t} type="completed" />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

