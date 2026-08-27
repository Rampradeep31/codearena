import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const portals = [
  {
    id: 'coding',
    label: 'Coding',
    subtitle: 'Competitive Programming',
    description: 'Solve coding challenges with real-time execution, test cases, and live proctoring.',
    icon: '💻',
    gradient: 'from-blue-600 to-cyan-500',
    glow: 'shadow-blue-500/30',
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/10',
    available: true,
  },
  {
    id: 'aptitude',
    label: 'Aptitude',
    subtitle: 'Quantitative & Logical',
    description: 'Practice quantitative aptitude, logical reasoning, and verbal ability.',
    icon: '🧮',
    gradient: 'from-emerald-600 to-teal-500',
    glow: 'shadow-emerald-500/30',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    available: false,
  },
  {
    id: 'communication',
    label: 'Communication',
    subtitle: 'Language & Speaking',
    description: 'Assess your communication, grammar, and language proficiency skills.',
    icon: '💬',
    gradient: 'from-purple-600 to-pink-500',
    glow: 'shadow-purple-500/30',
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/10',
    available: false,
  },
  {
    id: 'gate',
    label: 'GATE Exam',
    subtitle: 'Graduate Aptitude Test',
    description: 'Full GATE-style exam with MCQ, numerical questions, scientific calculator, and negative marking.',
    icon: '📚',
    gradient: 'from-amber-600 to-orange-500',
    glow: 'shadow-amber-500/30',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    available: true,
  },
];

export default function PortalSelect() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const handleSelect = (portal) => {
    if (!portal.available) {
      toast('🚧 This portal is coming soon!', { icon: '⏳' });
      return;
    }
    if (portal.id === 'coding') {
      navigate(isAdmin ? '/admin' : '/student', { replace: true });
    } else if (portal.id === 'gate') {
      navigate(isAdmin ? '/gate/admin' : '/gate/student', { replace: true });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen aurora-bg grid-overlay flex flex-col">
      {/* Fixed Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-dark-700/40 bg-dark-900/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-sm">CA</span>
          </div>
          <div>
            <h1 className="text-white font-black text-base leading-tight">CodeArena</h1>
            <p className="text-dark-500 text-[10px] uppercase tracking-wider">Assessment Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-dark-800 border border-dark-700/50">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-dark-300 text-xs font-medium">{user?.name || user?.email || 'User'}</span>
            {isAdmin && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">Admin</span>}
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-dark-400 hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-all font-medium border border-transparent hover:border-red-500/20"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-300 text-xs font-semibold mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Select Your Exam Portal
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-3">
            Choose Your <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Assessment</span>
          </h2>
          <p className="text-dark-400 text-base max-w-md mx-auto">
            Select the portal that matches your exam to get started.
          </p>
        </div>

        {/* Portal Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 w-full max-w-5xl">
          {portals.map((portal, idx) => (
            <button
              key={portal.id}
              onClick={() => handleSelect(portal)}
              style={{ animationDelay: `${idx * 80}ms` }}
              className={`group relative flex flex-col items-start p-6 rounded-2xl border backdrop-blur-sm text-left transition-all duration-300 animate-fade-in
                ${portal.available
                  ? `${portal.border} ${portal.bg} hover:scale-105 hover:shadow-2xl ${portal.glow} cursor-pointer`
                  : 'border-dark-700/40 bg-dark-800/30 cursor-default opacity-70'
                }`}
            >
              {/* Coming soon badge */}
              {!portal.available && (
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-dark-700 border border-dark-600 text-dark-400 text-[10px] font-bold uppercase tracking-wider">
                  Soon
                </div>
              )}

              {/* Icon */}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4 
                ${portal.available ? `bg-gradient-to-br ${portal.gradient} shadow-lg ${portal.glow}` : 'bg-dark-700'} 
                transition-transform duration-300 group-hover:scale-110`}>
                {portal.icon}
              </div>

              <h3 className="text-lg font-black text-white mb-0.5">{portal.label}</h3>
              <p className={`text-xs font-semibold mb-3 bg-gradient-to-r ${portal.gradient} bg-clip-text text-transparent`}>
                {portal.subtitle}
              </p>
              <p className="text-dark-400 text-xs leading-relaxed">{portal.description}</p>

              {portal.available && (
                <div className={`mt-5 flex items-center gap-1 text-xs font-bold bg-gradient-to-r ${portal.gradient} bg-clip-text text-transparent`}>
                  Enter Portal
                  <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
