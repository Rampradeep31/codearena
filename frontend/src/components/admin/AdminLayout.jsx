import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  HiOutlineCode, HiOutlineViewGrid, HiOutlineClipboardList,
  HiOutlineCollection, HiOutlineUsers, HiOutlineChartBar,
  HiOutlineShieldExclamation, HiOutlineCog, HiOutlineLogout,
} from 'react-icons/hi';

const navItems = [
  { to: '/admin', icon: HiOutlineViewGrid, label: 'Dashboard', end: true },
  { to: '/admin/tests', icon: HiOutlineClipboardList, label: 'Tests' },
  { to: '/admin/questions', icon: HiOutlineCollection, label: 'Question Bank' },
  { to: '/admin/students', icon: HiOutlineUsers, label: 'Students' },
  { to: '/admin/violations', icon: HiOutlineShieldExclamation, label: 'Violations' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-dark-900 border-r border-dark-700/50 flex flex-col fixed h-full z-20">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-dark-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-brand-500/10 border border-brand-500/20 rounded-lg flex items-center justify-center">
              <HiOutlineCode className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">CodeArena</h1>
              <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                    : 'text-dark-400 hover:text-white hover:bg-dark-800 border border-transparent'
                }`
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User & Logout */}
        <div className="p-3 border-t border-dark-700/50">
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-dark-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-dark-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
          >
            <HiOutlineLogout className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
