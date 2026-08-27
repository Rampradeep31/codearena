import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import {
  HiOutlineViewGrid, HiOutlineCollection, HiOutlineClipboardList,
  HiOutlineUsers, HiOutlineChartBar, HiOutlineLogout, HiOutlineSun, HiOutlineMoon,
  HiOutlineAcademicCap, HiOutlineArrowLeft,
} from 'react-icons/hi';

const navItems = [
  { to: '/gate/admin', icon: HiOutlineViewGrid, label: 'Dashboard', end: true },
  { to: '/gate/admin/tests', icon: HiOutlineClipboardList, label: 'Tests' },
  { to: '/gate/admin/questions', icon: HiOutlineCollection, label: 'Question Bank' },
  { to: '/gate/admin/results', icon: HiOutlineChartBar, label: 'Results' },
];

export default function GateAdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('codearena_theme') || 'dark');

  useEffect(() => {
    if (theme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    localStorage.setItem('codearena_theme', theme);
  }, [theme]);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div className="min-h-screen aurora-bg flex flex-col lg:flex-row transition-colors duration-200">
      <aside className="w-full lg:w-64 bg-dark-900/85 backdrop-blur-xl border-b lg:border-b-0 lg:border-r border-amber-500/20 flex lg:flex-col lg:fixed lg:h-full z-20">
        {/* Logo */}
        <div className="px-4 sm:px-5 py-4 lg:py-5 lg:border-b border-amber-500/20 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/25">
              <HiOutlineAcademicCap className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-black text-white leading-tight">GATE Portal</h1>
              <p className="text-[10px] text-amber-500/70 uppercase tracking-wider font-medium">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Back to portal select */}
        <div className="px-3 pt-2 lg:pt-3 flex-shrink-0">
          <button
            onClick={() => navigate('/portal-select')}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-dark-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all border border-transparent hover:border-amber-500/20"
          >
            <HiOutlineArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Switch Portal</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 lg:py-3 px-2 sm:px-3 flex lg:block gap-1 overflow-x-auto lg:overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 lg:gap-3 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25 shadow-sm shadow-amber-500/10'
                    : 'text-dark-400 hover:text-white hover:bg-dark-800/80 border border-transparent'
                }`
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="hidden sm:inline lg:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom bar */}
        <div className="p-2 sm:p-3 lg:border-t border-amber-500/20 flex lg:block items-center gap-2">
          <div className="px-2 py-2 lg:mb-2 flex items-center justify-between gap-2">
            <div className="hidden xl:block min-w-0 pr-2">
              <p className="text-sm font-medium text-white truncate">{user?.name || 'Admin'}</p>
              <p className="text-xs text-dark-500 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => setTheme(p => p === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl border border-dark-700/50 text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"
            >
              {theme === 'dark' ? <HiOutlineSun className="w-4 h-4 text-amber-400" /> : <HiOutlineMoon className="w-4 h-4 text-blue-400" />}
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center lg:justify-start gap-3 lg:w-full px-3 py-2 rounded-xl text-sm font-semibold text-dark-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
          >
            <HiOutlineLogout className="w-5 h-5" />
            <span className="hidden lg:inline">Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 lg:ml-64 min-h-screen">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
