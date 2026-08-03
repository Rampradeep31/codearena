import { supabase } from './supabaseClient';
import axios from 'axios';

const backendApi = axios.create({
  baseURL: import.meta.env.PROD ? 'https://codearena-api-e6ih.onrender.com' : '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Add auth token to requests
backendApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Supabase Cloud Backend Service for CodeArena
 * Connects student entry, exams, questions, and code submissions directly to Supabase PostgreSQL database.
 */

// ─── Auth API (Student Entry & Registration) ─────────────────
export const authAPI = {
  login: async (email, password) => {
    // Real authentication against the FastAPI backend. There is no
    // hardcoded admin bypass anymore; all accounts authenticate the same way.
    const res = await backendApi.post('/auth/login', { email, password });
    return res;
  },

  studentEntry: async (studentData) => {
    // Student direct entry: the backend creates the account (with a random,
    // never-displayed password) or updates it, and returns a real JWT.
    const res = await backendApi.post('/auth/student-entry', studentData);
    return res;
  }
};

// ─── Student API (Tests & Attempts) ───────────────────────────
// All student flows go through the FastAPI backend. The backend owns attempt
// lifecycle, question assignment, violation limits and grading; nothing is
// fabricated client-side anymore.
export const studentAPI = {
  getTests: async () => {
    const res = await backendApi.get('/student/tests');
    return res;
  },

  getAttempt: async (attemptId) => {
    const res = await backendApi.get(`/student/attempts/${attemptId}`);
    return res;
  },

  getAttemptQuestions: async (attemptId) => {
    // The backend only ever returns public test cases for assigned questions,
    // and the assignment is generated server-side per attempt.
    const res = await backendApi.get(`/student/attempts/${attemptId}/questions`);
    return res;
  },

  startTest: async (testId) => {
    // Backend creates the attempt with a server-side random question set.
    // It is idempotent: a second call returns the existing attempt.
    const res = await backendApi.post(`/student/tests/${testId}/start`);
    return res;
  },

  saveCode: async (attemptId, data) => {
    const res = await backendApi.put(`/student/attempts/${attemptId}/code`, data);
    return res;
  },

  recordViolation: async (attemptId, data) => {
    const res = await backendApi.post(`/student/attempts/${attemptId}/violations`, {
      violation_type: data.violation_type
    });
    return res;
  },

  finishTest: async (attemptId, status = 'submitted') => {
    const res = await backendApi.post(`/student/attempts/${attemptId}/finish`);
    return res;
  }
};

export const codeAPI = {
  runCase: async (data) => {
    const res = await backendApi.post('/code/run-case', data);
    return res;
  },
  run: async (data) => {
    try {
      const res = await backendApi.post('/code/run', data);
      return res;
    } catch (e) {
      console.warn('Backend API run error:', e);
      return {
        data: {
          compilation_status: 'error',
          compilation_error: e.response?.data?.detail || 'Code execution service is unavailable. Please try again after the backend judge is running.',
          passed: 0,
          total: 0,
          results: []
        }
      };
    }
  },

  submit: async (data) => {
    // The backend persists the submission and recomputes the attempt score.
    const res = await backendApi.post('/code/submit', data);
    return res;
  }
};

// ─── LocalStorage Sync & Fallback Helpers ───────────────────
const SEEDED_TITLES = [
  "Plus One", "Maximum Consecutive Ones", "Single Number", "Remove Element", "Move Zeroes", 
  "Search Insert Position", "Element Appearing More Than 25%", "Build Array From Permutation", 
  "Single Element In Sorted Array", "Shuffle The Array", "Sort Array By Parity", 
  "Third Distinct Maximum Number", "Third Distinct Maximum Score", "Two Sum", "Palindrome Number", 
  "Roman To Integer", "Remove Duplicates From Sorted Array", "Sqrt(x)", "Power Of Three", 
  "Reverse String", "Convert Temperature", "Element Appearing More Than 25% in a Sorted Array", 
  "Build Array from Permutation", "Single Element in a Sorted Array", "Shuffle the Array",
  "Roman to Integer", "Remove Duplicates from Sorted Array", "Power of Three"
];

const getLocalBanks = () => {
  const data = localStorage.getItem('codearena_question_banks');
  if (!data) {
    const defaultBank = [{
      id: 1,
      title: 'August Month Question Bank',
      description: 'August Month Question Bank with 20 seeded coding challenges',
      year: 'Second Year',
      status: 'Active',
      created_at: new Date('2026-08-01T12:00:00Z').toISOString(),
      created_by: 'Admin'
    }];
    localStorage.setItem('codearena_question_banks', JSON.stringify(defaultBank));
    return defaultBank;
  }
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

const saveLocalBanks = (banks) => {
  localStorage.setItem('codearena_question_banks', JSON.stringify(banks));
};

const getLocalTestMetadata = () => {
  const data = localStorage.getItem('codearena_tests_metadata');
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
};

const saveLocalTestMetadata = (meta) => {
  localStorage.setItem('codearena_tests_metadata', JSON.stringify(meta));
};

const getLocalQuestionMappings = () => {
  const data = localStorage.getItem('codearena_question_mappings');
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
};

const saveLocalQuestionMappings = (mappings) => {
  localStorage.setItem('codearena_question_mappings', JSON.stringify(mappings));
};

export const adminAPI = {
  // ─── Question Banks CRUD ────────────────────────────────────
  getQuestionBanks: async (params) => {
    try {
      const { data, error } = await supabase.from('question_banks').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        let list = data;
        if (params?.year) list = list.filter(b => b.year === params.year);
        if (params?.status) list = list.filter(b => b.status === params.status);
        if (params?.search) list = list.filter(b => b.title.toLowerCase().includes(params.search.toLowerCase()));
        return { data: list };
      }
    } catch (e) {
      console.warn('Supabase question_banks error, falling back to local:', e);
    }
    
    let list = getLocalBanks();
    if (params?.year) list = list.filter(b => b.year === params.year);
    if (params?.status) list = list.filter(b => b.status === params.status);
    if (params?.search) list = list.filter(b => b.title.toLowerCase().includes(params.search.toLowerCase()));
    return { data: list };
  },

  getQuestionBank: async (id) => {
    try {
      const { data, error } = await supabase.from('question_banks').select('*').eq('id', id).single();
      if (!error && data) return { data };
    } catch (e) {
      console.warn('Supabase getQuestionBank error, falling back:', e);
    }
    const banks = getLocalBanks();
    const bank = banks.find(b => b.id === parseInt(id) || b.id === id);
    return { data: bank || null };
  },

  createQuestionBank: async (bankData) => {
    try {
      const { data, error } = await supabase.from('question_banks').insert(bankData).select().single();
      if (!error && data) return { data };
    } catch (e) {
      console.warn('Supabase createQuestionBank error, falling back:', e);
    }
    const banks = getLocalBanks();
    const newBank = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      created_by: 'Admin',
      ...bankData
    };
    banks.push(newBank);
    saveLocalBanks(banks);
    return { data: newBank };
  },

  updateQuestionBank: async (id, bankData) => {
    try {
      const { data, error } = await supabase.from('question_banks').update(bankData).eq('id', id).select().single();
      if (!error && data) return { data };
    } catch (e) {
      console.warn('Supabase updateQuestionBank error, falling back:', e);
    }
    const banks = getLocalBanks();
    const idx = banks.findIndex(b => b.id === parseInt(id) || b.id === id);
    if (idx !== -1) {
      banks[idx] = { ...banks[idx], ...bankData };
      saveLocalBanks(banks);
      return { data: banks[idx] };
    }
    throw new Error('Question bank not found');
  },

  deleteQuestionBank: async (id) => {
    try {
      const { error } = await supabase.from('question_banks').delete().eq('id', id);
      if (!error) return { success: true };
    } catch (e) {
      console.warn('Supabase deleteQuestionBank error, falling back:', e);
    }
    let banks = getLocalBanks();
    banks = banks.filter(b => b.id !== parseInt(id) && b.id !== id);
    saveLocalBanks(banks);
    return { success: true };
  },

  // ─── Dashboard & Analytics ──────────────────────────────────
  getDashboard: async () => {
    try {
      // 1. Fetch raw data from Supabase
      const [studentsRes, testsRes, questionsRes, attemptsRes, submissionsRes] = await Promise.all([
        supabase.from('users').select('*').eq('role', 'student'),
        supabase.from('tests').select('*'),
        supabase.from('questions').select('*'),
        supabase.from('test_attempts').select('*'),
        supabase.from('submissions').select('*')
      ]);

      const students = studentsRes.data || [];
      const rawTests = testsRes.data || [];
      const rawQuestions = questionsRes.data || [];
      const attempts = attemptsRes.data || [];
      const submissions = submissionsRes.data || [];

      // 2. Fetch/Merge Question Banks
      const banksRes = await adminAPI.getQuestionBanks();
      const banks = banksRes.data || [];

      // 3. Merge Local metadata/mappings
      const meta = getLocalTestMetadata();
      const testList = rawTests.map(t => {
        const m = meta[t.id] || { year: 'Second Year', question_bank_id: t.question_bank_id || null, randomize_questions: !!t.randomize_questions };
        return {
          ...t,
          year: m.year,
          question_bank_id: m.question_bank_id,
          randomize_questions: m.randomize_questions
        };
      });

      const localMappings = getLocalQuestionMappings();
      const questions = rawQuestions.map(q => {
        let qbId = q.question_bank_id;
        if (qbId === undefined || qbId === null) {
          if (SEEDED_TITLES.some(title => q.title.toLowerCase().includes(title.toLowerCase()))) {
            qbId = 1;
          } else {
            qbId = localMappings[q.id] || null;
          }
        }
        return { ...q, question_bank_id: qbId };
      });

      // 4. Calculate overall statistics
      const totalStudents = students.length;
      const secondYearStudents = students.filter(s => s.year === 2).length;
      const thirdYearStudents = students.filter(s => s.year === 3).length;
      
      const totalTests = testList.length;
      const now = new Date();
      const activeTests = testList.filter(t => new Date(t.start_time) <= now && new Date(t.end_time) >= now).length;
      const completedTests = testList.filter(t => new Date(t.end_time) < now).length;
      
      const totalBanks = banks.length;
      const totalQuestions = questions.length;

      // Completed / Submitted attempts
      const completedAttempts = attempts.filter(a => a.status === 'submitted' || a.status === 'auto_submitted');
      
      let averageScore = 0;
      let passPercentage = 0;
      if (completedAttempts.length > 0) {
        const totalScore = completedAttempts.reduce((sum, a) => sum + (a.score || 0), 0);
        averageScore = Math.round((totalScore / completedAttempts.length) * 10) / 10;
        
        // Find pass count (score >= 50% of the respective test's total marks, or 25 marks if test not found)
        const passCount = completedAttempts.filter(a => {
          const test = testList.find(t => t.id === a.test_id);
          const passMark = test ? test.total_marks * 0.5 : 25;
          return (a.score || 0) >= passMark;
        }).length;
        passPercentage = Math.round((passCount / completedAttempts.length) * 100);
      }

      // Return fully aggregated data for easy consumption
      return {
        data: {
          // Overall Card Stats
          total_students: totalStudents,
          second_year_students: secondYearStudents,
          third_year_students: thirdYearStudents,
          total_tests: totalTests,
          active_tests: activeTests,
          completed_tests: completedTests,
          total_banks: totalBanks,
          total_questions: totalQuestions,
          average_score: averageScore,
          pass_percentage: passPercentage,
          completed_attempts_count: completedAttempts.length,
          
          // Lists for calculations in dashboard
          students,
          tests: testList,
          questions,
          attempts,
          submissions,
          banks
        }
      };
    } catch (e) {
      console.warn('Dashboard aggregation error:', e);
      return {
        data: {
          total_students: 0,
          second_year_students: 0,
          third_year_students: 0,
          total_tests: 0,
          active_tests: 0,
          completed_tests: 0,
          total_banks: 1,
          total_questions: 0,
          average_score: 0,
          pass_percentage: 0,
          students: [],
          tests: [],
          questions: [],
          attempts: [],
          submissions: [],
          banks: getLocalBanks()
        }
      };
    }
  },

  getStudents: async (params) => {
    try {
      let query = supabase.from('users').select('*').eq('role', 'student');
      if (params?.search) {
        query = query.or(`name.ilike.%${params.search}%,register_number.ilike.%${params.search}%,email.ilike.%${params.search}%`);
      }
      const { data } = await query.order('name');
      return { data: data || [] };
    } catch (e) {
      console.warn('getStudents error:', e);
      return { data: [] };
    }
  },

  createStudent: async (data) => {
    const { password, email, ...dbData } = data;
    return supabase.from('users').insert({ ...dbData, role: 'student' }).select().single();
  },

  updateStudent: async (id, data) => {
    const { password, email, ...dbData } = data;
    return supabase.from('users').update(dbData).eq('id', id).select().single();
  },

  deleteStudent: async (id) => {
    return supabase.from('users').delete().eq('id', id);
  },

  importStudents: async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target.result;
          const xlsxModule = await import('xlsx');
          const XLSX = xlsxModule.default || xlsxModule;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet);

          if (rows.length === 0) return resolve({ data: { created: 0, errors: ['Empty Excel file'] } });

          const students = [];
          const errors = [];

          rows.forEach((row, idx) => {
            // Clean up keys from Excel (e.g., "Register Number" -> "register_number")
            const cleanRow = {};
            for (let key in row) {
              const cleanKey = key.trim().toLowerCase().replace(/ /g, '_');
              cleanRow[cleanKey] = row[key];
            }

            if (!cleanRow.name || !cleanRow.register_number) {
              errors.push(`Row ${idx + 2}: name and register_number are required`);
              return;
            }

            const regNo = String(cleanRow.register_number).trim().toUpperCase();
            students.push({
              name: String(cleanRow.name).trim(),
              register_number: regNo,
              department: cleanRow.department ? String(cleanRow.department).trim() : 'AI & DS',
              year: cleanRow.year ? parseInt(cleanRow.year) || 2 : 2,
              section: cleanRow.section ? String(cleanRow.section).trim() : 'A',
              role: 'student'
            });
          });
          
          let created = 0;
          for (const student of students) {
            const { error } = await supabase
              .from('users')
              .upsert(student, { onConflict: 'register_number' });
            if (error) {
              errors.push(`Reg ${student.register_number}: ${error.message}`);
            } else {
              created++;
            }
          }
          resolve({ data: { created, errors } });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsBinaryString(file);
    });
  },

  // ─── Tests CRUD ─────────────────────────────────────────────
  getTests: async () => {
    try {
      const { data } = await supabase.from('tests').select('*').order('created_at', { ascending: false });
      const { data: testQs } = await supabase.from('test_questions').select('*');
      
      const meta = getLocalTestMetadata();
      const mapped = (data || []).map(t => {
        const m = meta[t.id] || { year: t.year || 'Second Year', question_bank_id: t.question_bank_id || null, randomize_questions: !!t.randomize_questions };
        const qids = testQs?.filter(tq => tq.test_id === t.id).map(tq => tq.question_id) || [];
        return {
          ...t,
          year: m.year,
          question_bank_id: m.question_bank_id,
          randomize_questions: m.randomize_questions,
          question_ids: qids,
          question_count: qids.length
        };
      });
      return { data: mapped };
    } catch (e) {
      console.warn('getTests error:', e);
      return { data: [] };
    }
  },

  createTest: async (data) => {
    const { question_ids, year, question_bank_id, randomize_questions, ...testData } = data;
    // Attempt Supabase insert
    const { data: test, error } = await supabase.from('tests').insert(testData).select().single();
    if (error) throw error;

    // Save extra fields locally
    const meta = getLocalTestMetadata();
    meta[test.id] = { year: year || 'Second Year', question_bank_id: question_bank_id || null, randomize_questions: !!randomize_questions };
    saveLocalTestMetadata(meta);

    // Save mappings
    if (question_ids && question_ids.length > 0) {
      const tqData = question_ids.map(qid => ({ test_id: test.id, question_id: qid }));
      await supabase.from('test_questions').insert(tqData);
    }
    return { data: { ...test, year, question_bank_id, randomize_questions, question_ids } };
  },

  updateTest: async (id, data) => {
    const { question_ids, year, question_bank_id, randomize_questions, ...testData } = data;
    const { data: test, error } = await supabase.from('tests').update(testData).eq('id', id).select().single();
    if (error) throw error;

    // Save extra fields locally
    const meta = getLocalTestMetadata();
    meta[id] = { year: year || 'Second Year', question_bank_id: question_bank_id || null, randomize_questions: !!randomize_questions };
    saveLocalTestMetadata(meta);

    // Recreate question mappings (delete and insert)
    await supabase.from('test_questions').delete().eq('test_id', id);
    if (question_ids && question_ids.length > 0) {
      const tqData = question_ids.map(qid => ({ test_id: id, question_id: qid }));
      await supabase.from('test_questions').insert(tqData);
    }
    return { data: { ...test, year, question_bank_id, randomize_questions, question_ids } };
  },

  deleteTest: async (id) => {
    // Delete local metadata
    const meta = getLocalTestMetadata();
    delete meta[id];
    saveLocalTestMetadata(meta);

    // Delete relation test questions
    await supabase.from('test_questions').delete().eq('test_id', id);

    return supabase.from('tests').delete().eq('id', id);
  },

  // ─── Questions CRUD ─────────────────────────────────────────
  getQuestions: async (params) => {
    try {
      let query = supabase.from('questions').select('*, test_cases(*)');
      if (params?.search) {
        query = query.or(`title.ilike.%${params.search}%,topic.ilike.%${params.search}%`);
      }
      if (params?.difficulty) {
        query = query.eq('difficulty', params.difficulty);
      }
      const { data } = await query.order('created_at', { ascending: false });
      
      // Map question_bank_id
      const localMappings = getLocalQuestionMappings();
      const mapped = (data || []).map(q => {
        let qbId = q.question_bank_id;
        if (qbId === undefined || qbId === null) {
          if (SEEDED_TITLES.some(title => q.title.toLowerCase().includes(title.toLowerCase()))) {
            qbId = 1;
          } else {
            qbId = localMappings[q.id] || null;
          }
        }
        return { ...q, question_bank_id: qbId };
      });

      if (params?.question_bank_id) {
        return { data: mapped.filter(q => q.question_bank_id === parseInt(params.question_bank_id) || q.question_bank_id === params.question_bank_id) };
      }
      return { data: mapped };
    } catch (e) {
      console.warn('getQuestions error:', e);
      return { data: [] };
    }
  },

  getQuestion: async (id) => {
    const { data, error } = await supabase.from('questions').select('*, test_cases(*)').eq('id', id).single();
    if (error) throw error;
    if (data) {
      let qbId = data.question_bank_id;
      if (qbId === undefined || qbId === null) {
        if (SEEDED_TITLES.some(title => data.title.toLowerCase().includes(title.toLowerCase()))) {
          qbId = 1;
        } else {
          qbId = getLocalQuestionMappings()[data.id] || null;
        }
      }
      return { data: { ...data, question_bank_id: qbId } };
    }
    return { data: null };
  },

  createQuestion: async (data) => {
    const { test_cases, question_bank_id, ...questionData } = data;
    delete questionData.id;
    delete questionData.created_at;

    const { data: question, error } = await supabase.from('questions').insert(questionData).select().single();
    if (error) {
      console.error('Supabase createQuestion error:', error);
      throw error;
    }
    
    // Save mapping locally
    if (question_bank_id) {
      const mappings = getLocalQuestionMappings();
      mappings[question.id] = parseInt(question_bank_id);
      saveLocalQuestionMappings(mappings);
    }

    if (test_cases && test_cases.length > 0) {
      const tcData = test_cases.map(({ id: _, ...tc }) => ({
        question_id: question.id,
        input: tc.input || '',
        expected_output: tc.expected_output || '',
        is_hidden: !!tc.is_hidden
      }));
      await supabase.from('test_cases').insert(tcData);
    }
    return { data: { ...question, question_bank_id } };
  },

  updateQuestion: async (id, data) => {
    const { test_cases, question_bank_id, ...questionData } = data;
    const numericId = parseInt(id);

    delete questionData.id;
    delete questionData.created_at;

    const { data: question, error } = await supabase
      .from('questions')
      .update(questionData)
      .eq('id', numericId)
      .select()
      .single();

    if (error) {
      console.error('Supabase updateQuestion error:', error);
      throw error;
    }

    // Save mapping locally
    const mappings = getLocalQuestionMappings();
    if (question_bank_id) {
      mappings[numericId] = parseInt(question_bank_id);
    } else {
      delete mappings[numericId];
    }
    saveLocalQuestionMappings(mappings);

    // Sync test cases in Supabase (replace with updated set)
    if (test_cases && Array.isArray(test_cases)) {
      try {
        await supabase.from('test_cases').delete().eq('question_id', numericId);
        if (test_cases.length > 0) {
          const tcData = test_cases.map(({ id: _, ...tc }) => ({
            question_id: numericId,
            input: tc.input || '',
            expected_output: tc.expected_output || '',
            is_hidden: !!tc.is_hidden
          }));
          await supabase.from('test_cases').insert(tcData);
        }
      } catch (tcError) {
        console.warn('Error updating test_cases for question:', tcError);
      }
    }

    return { data: { ...question, question_bank_id } };
  },

  deleteQuestion: async (id) => {
    // Delete local mapping
    const mappings = getLocalQuestionMappings();
    delete mappings[id];
    saveLocalQuestionMappings(mappings);

    return supabase.from('questions').delete().eq('id', id);
  },

  addTestCase: async (questionId, data) => {
    return supabase.from('test_cases').insert({ ...data, question_id: questionId }).select().single();
  },

  deleteTestCase: async (id) => {
    return supabase.from('test_cases').delete().eq('id', id);
  },

  // ─── Proctoring & Monitoring ──────────────────────────────
  monitorTest: async (testId) => {
    try {
      const { data: students } = await supabase.from('users').select('*').eq('role', 'student');
      const { data: attempts } = await supabase.from('test_attempts').select('*').eq('test_id', testId);
      
      const attemptIds = attempts?.map(a => a.id) || [];
      const { data: submissions } = attemptIds.length > 0 
        ? await supabase.from('submissions').select('*').in('attempt_id', attemptIds)
        : { data: [] };

      // Get test details to see target year
      const testsRes = await adminAPI.getTests();
      const test = testsRes.data.find(t => t.id === parseInt(testId) || t.id === testId);
      const targetYearNum = test?.year === 'Third Year' ? 3 : 2;

      // Filter students of target year
      const yearStudents = (students || []).filter(s => s.year === targetYearNum);

      const mapped = yearStudents.map(student => {
        const attempt = attempts?.find(a => a.user_id === student.id);
        if (!attempt) {
          return {
            student_id: student.id,
            student_name: student.name,
            register_number: student.register_number || '',
            section: student.section || 'A',
            status: 'not_started',
            questions_attempted: 0,
            questions_submitted: 0,
            violation_count: 0,
            remaining_seconds: 0
          };
        }

        const attemptSubs = submissions?.filter(s => s.attempt_id === attempt.id) || [];
        const now = new Date();
        const expiresAt = new Date(attempt.expires_at);
        const remainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));

        let status = attempt.status || 'writing';
        if (status === 'in_progress') {
          if (remainingSeconds <= 0) {
            status = 'auto_submitted';
          } else {
            status = 'writing';
          }
        }

        return {
          student_id: student.id,
          student_name: student.name,
          register_number: student.register_number || '',
          section: student.section || 'A',
          status: status,
          questions_attempted: attemptSubs.length,
          questions_submitted: attemptSubs.length,
          violation_count: attempt.violation_count || 0,
          remaining_seconds: remainingSeconds
        };
      });

      return { data: mapped };
    } catch (e) {
      console.warn('monitorTest error:', e);
      return { data: [] };
    }
  },

  getTestResults: async (testId) => {
    try {
      const { data: attempts } = await supabase.from('test_attempts').select('*, users(*)').eq('test_id', testId);
      const attemptIds = attempts?.map(a => a.id) || [];
      const { data: submissions } = attemptIds.length > 0 
        ? await supabase.from('submissions').select('*').in('attempt_id', attemptIds)
        : { data: [] };

      const testsRes = await adminAPI.getTests();
      const test = testsRes.data.find(t => t.id === parseInt(testId) || t.id === testId);

      const mapped = (attempts || []).map(attempt => {
        const student = attempt.users;
        const attemptSubs = submissions?.filter(s => s.attempt_id === attempt.id) || [];
        
        const totalPossible = test?.total_marks || 50;
        const score = attempt.score || 0;
        const percentage = totalPossible > 0 ? (score / totalPossible) * 100 : 0;

        return {
          student_name: student?.name || 'Unknown',
          register_number: student?.register_number || '',
          department: student?.department || 'AI & DS',
          section: student?.section || 'A',
          year: student?.year === 3 ? 'Third Year' : 'Second Year',
          questions_assigned: test?.questions_per_student || 1,
          questions_attempted: attemptSubs.length,
          questions_solved: attemptSubs.length,
          score: score,
          total_possible: totalPossible,
          percentage: Math.round(percentage * 100) / 100,
          violation_count: attempt.violation_count || 0,
          submission_type: attempt.status,
          submitted_at: attempt.submitted_at || attempt.expires_at
        };
      });

      return { data: mapped };
    } catch (e) {
      console.warn('getTestResults error:', e);
      return { data: [] };
    }
  },

  getViolations: async (params) => {
    try {
      let query = supabase.from('test_attempts').select('*, users(*)').gt('violation_count', 0);
      if (params?.test_id) {
        query = query.eq('test_id', params.test_id);
      }
      const { data: attempts } = await query;
      
      const mapped = [];
      (attempts || []).forEach(attempt => {
        const count = attempt.violation_count || 0;
        const student = attempt.users;
        for (let i = 0; i < count; i++) {
          mapped.push({
            id: `${attempt.id}_v_${i}`,
            attempt_id: attempt.id,
            student_name: student?.name || 'Unknown',
            register_number: student?.register_number || '',
            section: student?.section || 'A',
            year: student?.year === 3 ? 'Third Year' : 'Second Year',
            violation_type: i === 0 ? 'tab_hidden' : i === 1 ? 'window_blur' : 'fullscreen_exit',
            created_at: attempt.submitted_at || attempt.started_at || new Date().toISOString()
          });
        }
      });
      return { data: mapped };
    } catch (e) {
      console.warn('getViolations error:', e);
      return { data: [] };
    }
  }
};
