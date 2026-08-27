import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  HiOutlineCode,
  HiOutlineUser,
  HiOutlineIdentification,
  HiOutlineAcademicCap,
  HiOutlineBookOpen,
  HiOutlineUserGroup,
  HiOutlineLockClosed,
  HiOutlineMail
} from 'react-icons/hi';

import { getErrorMessage } from '../services/api';

export default function Login() {
  const [isAdminMode, setIsAdminMode] = useState(false);

  // Student Form State
  const [name, setName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [section, setSection] = useState('A');
  const [year, setYear] = useState('1st Year');

  // Admin Login State
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { loginStudentDirect, login } = useAuth();
  const navigate = useNavigate();

  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !regNo.trim()) {
      setError('Please fill in your Name and Register Number.');
      return;
    }

    setLoading(true);
    try {
      const studentData = {
        name: name.trim(),
        register_number: regNo.trim().toUpperCase(),
        department: 'AI & DS',
        section: section,
        year: year
      };

      const { role } = await loginStudentDirect(studentData);
      toast.success(`Welcome, ${name}!`);
      navigate('/portal-select', { replace: true });
    } catch (err) {
      console.error(err);
      const msg = getErrorMessage(err, 'Error entering assessment. Please check details.');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!adminEmail.trim() || !adminPassword.trim()) {
      setError('Please enter Admin Email and Password');
      return;
    }

    setLoading(true);
    try {
      const { role } = await login(adminEmail, adminPassword);
      toast.success('Admin login successful');
      navigate('/portal-select', { replace: true });
    } catch (err) {
      console.error(err);
      const msg = getErrorMessage(err, 'Admin login failed.');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen aurora-bg grid-overlay flex items-center justify-center p-4 sm:p-6">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-28 -right-24 w-80 h-80 bg-brand-500/20 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float-slow" />
      </div>

      <div className="w-full max-w-5xl relative animate-fade-in my-6 grid lg:grid-cols-[1fr_1.1fr] gap-6 items-center">
        <div className="hidden lg:block">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-500/20 bg-brand-500/10 text-brand-300 text-xs font-semibold mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Secure Assessment Platform
          </div>
          <h2 className="text-5xl font-black tracking-tight text-white leading-tight">
            Code exams with confidence, clarity, and control.
          </h2>
          <p className="mt-5 text-dark-300 text-base leading-7 max-w-lg">
            A focused portal for AI & DS assessments with clean registration, proctored rules, and administrator analytics in one place.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 max-w-lg">
            {[
              ['Live', 'Sessions'],
              ['Smart', 'Proctoring'],
              ['Fast', 'Reports'],
            ].map(([title, label]) => (
              <div key={label} className="glass-card rounded-2xl p-4">
                <p className="text-xl font-bold text-white">{title}</p>
                <p className="text-xs text-dark-400 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/25">
              <HiOutlineCode className="w-7 h-7 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-black text-white tracking-tight">CodeArena</h1>
              <p className="text-xs text-brand-400 font-semibold tracking-wide uppercase">AI & DS Assessment Portal</p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="glass-card rounded-3xl p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-dark-700/60">
            <div>
              <h2 className="text-xl font-bold text-white">
                {isAdminMode ? 'Admin Portal Access' : 'Student Assessment Registration'}
              </h2>
              <p className="text-xs text-dark-400">
                {isAdminMode ? 'Sign in with administrator credentials' : 'Enter your details to join the exam session'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsAdminMode(!isAdminMode);
                setError('');
              }}
              className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-500/20 transition-colors"
            >
              {isAdminMode ? 'Student Form' : 'Admin Login'}
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
              {error}
            </div>
          )}

          {!isAdminMode ? (
            /* Student Details Form */
            <form onSubmit={handleStudentSubmit} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <HiOutlineUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full pl-10 pr-4 py-3 bg-dark-800/80 border border-dark-600/60 rounded-xl text-white placeholder-dark-500 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all"
                  />
                </div>
              </div>

              {/* Register Number */}
              <div>
                <label className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                  Register Number
                </label>
                <div className="relative">
                  <HiOutlineIdentification className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                  <input
                    type="text"
                    required
                    value={regNo}
                    onChange={(e) => setRegNo(e.target.value)}
                    placeholder="e.g. 211421243001 or STU001"
                    className="w-full pl-10 pr-4 py-3 bg-dark-800/80 border border-dark-600/60 rounded-xl text-white placeholder-dark-500 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all"
                  />
                </div>
              </div>

              {/* Department (Fixed to AI & DS) */}
              <div>
                <label className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                  Department
                </label>
                <div className="relative">
                  <HiOutlineAcademicCap className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                  <input
                    type="text"
                    disabled
                    value="AI & DS (Artificial Intelligence & Data Science)"
                    className="w-full pl-10 pr-4 py-3 bg-brand-500/10 border border-brand-500/30 text-brand-300 font-semibold rounded-xl text-sm cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Section & Year */}
              <div className="grid grid-cols-2 gap-4">
                {/* Section (A, B, C, D) */}
                <div>
                  <label className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                    Section
                  </label>
                  <div className="relative">
                    <HiOutlineUserGroup className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                    <select
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-dark-800/80 border border-dark-600/60 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all"
                    >
                      <option value="A">Section A</option>
                      <option value="B">Section B</option>
                      <option value="C">Section C</option>
                      <option value="D">Section D</option>
                    </select>
                  </div>
                </div>

                {/* Year (1st, 2nd, 3rd, 4th) */}
                <div>
                  <label className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                    Year of Study
                  </label>
                  <div className="relative">
                    <HiOutlineBookOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-dark-800/80 border border-dark-600/60 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all"
                    >
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 btn-primary disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Entering Assessment...
                  </>
                ) : (
                  'Start Assessment'
                )}
              </button>
            </form>
          ) : (
            /* Admin Login Form */
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                  Admin Email
                </label>
                <div className="relative">
                  <HiOutlineMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@codearena.com"
                    className="w-full pl-10 pr-4 py-3 bg-dark-800/80 border border-dark-600/60 rounded-xl text-white placeholder-dark-500 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                  Admin Password
                </label>
                <div className="relative">
                  <HiOutlineLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                  <input
                    type="password"
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full pl-10 pr-4 py-3 bg-dark-800/80 border border-dark-600/60 rounded-xl text-white placeholder-dark-500 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 btn-primary text-white font-bold rounded-xl text-sm transition-all"
              >
                {loading ? 'Authenticating...' : 'Sign in as Admin'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-dark-500 text-xs mt-4">
          CodeArena &bull; AI & DS Department &copy; {new Date().getFullYear()}
        </p>
        </div>
      </div>
    </div>
  );
}
