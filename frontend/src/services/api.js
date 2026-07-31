import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Request interceptor: attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
};

// ─── Admin ────────────────────────────────────────
export const adminAPI = {
  // Dashboard
  getDashboard: () => api.get('/admin/dashboard'),

  // Students
  getStudents: (params) => api.get('/admin/students', { params }),
  createStudent: (data) => api.post('/admin/students', data),
  updateStudent: (id, data) => api.put(`/admin/students/${id}`, data),
  deleteStudent: (id) => api.delete(`/admin/students/${id}`),
  importStudents: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/admin/students/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Questions
  getQuestions: (params) => api.get('/admin/questions', { params }),
  getQuestion: (id) => api.get(`/admin/questions/${id}`),
  createQuestion: (data) => api.post('/admin/questions', data),
  updateQuestion: (id, data) => api.put(`/admin/questions/${id}`, data),
  deleteQuestion: (id) => api.delete(`/admin/questions/${id}`),
  addTestCase: (qid, data) => api.post(`/admin/questions/${qid}/test-cases`, data),
  deleteTestCase: (id) => api.delete(`/admin/test-cases/${id}`),

  // Tests
  getTests: () => api.get('/admin/tests'),
  createTest: (data) => api.post('/admin/tests', data),
  updateTest: (id, data) => api.put(`/admin/tests/${id}`, data),
  deleteTest: (id) => api.delete(`/admin/tests/${id}`),

  // Monitoring
  monitorTest: (id) => api.get(`/admin/tests/${id}/monitor`),
  getTestResults: (id) => api.get(`/admin/tests/${id}/results`),
  getTestViolations: (id) => api.get(`/admin/tests/${id}/violations`),
  getViolations: (params) => api.get('/admin/violations', { params }),
};

// ─── Student ──────────────────────────────────────
export const studentAPI = {
  getProfile: () => api.get('/student/profile'),
  getTests: () => api.get('/student/tests'),
  startTest: (testId) => api.post(`/student/tests/${testId}/start`),
  getAttempt: (attemptId) => api.get(`/student/attempts/${attemptId}`),
  getAttemptQuestions: (attemptId) => api.get(`/student/attempts/${attemptId}/questions`),
  saveCode: (attemptId, data) => api.put(`/student/attempts/${attemptId}/code`, data),
  recordViolation: (attemptId, data) => api.post(`/student/attempts/${attemptId}/violations`, data),
  finishTest: (attemptId) => api.post(`/student/attempts/${attemptId}/finish`),
};

// ─── Code Execution ──────────────────────────────
export const codeAPI = {
  run: (data) => api.post('/code/run', data),
  submit: (data) => api.post('/code/submit', data),
};

export default api;
