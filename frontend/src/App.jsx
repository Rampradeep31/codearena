import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import Students from './pages/admin/Students';
import QuestionBank from './pages/admin/QuestionBank';
import QuestionEditor from './pages/admin/QuestionEditor';
import Tests from './pages/admin/Tests';
import TestEditor from './pages/admin/TestEditor';
import LiveMonitor from './pages/admin/LiveMonitor';
import Results from './pages/admin/Results';
import Violations from './pages/admin/Violations';
import StudentDashboard from './pages/student/StudentDashboard';
import ExamInstructions from './pages/student/ExamInstructions';
import ExamInterface from './pages/student/ExamInterface';
import TestComplete from './pages/student/TestComplete';

function ProtectedRoute({ children, role }) {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role && user?.role !== role) return <Navigate to={user?.role === 'admin' ? '/admin' : '/student'} replace />;
  return children;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-dark-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to={user?.role === 'admin' ? '/admin' : '/student'} /> : <Login />} />

      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="questions" element={<QuestionBank />} />
        <Route path="questions/new" element={<QuestionEditor />} />
        <Route path="questions/:id" element={<QuestionEditor />} />
        <Route path="tests" element={<Tests />} />
        <Route path="tests/new" element={<TestEditor />} />
        <Route path="tests/:id/edit" element={<TestEditor />} />
        <Route path="tests/:id/monitor" element={<LiveMonitor />} />
        <Route path="tests/:id/results" element={<Results />} />
        <Route path="violations" element={<Violations />} />
      </Route>

      {/* Student Routes */}
      <Route path="/student" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/tests/:testId/instructions" element={<ProtectedRoute role="student"><ExamInstructions /></ProtectedRoute>} />
      <Route path="/student/exam/:attemptId" element={<ProtectedRoute role="student"><ExamInterface /></ProtectedRoute>} />
      <Route path="/student/exam/:attemptId/complete" element={<ProtectedRoute role="student"><TestComplete /></ProtectedRoute>} />

      {/* Default */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
