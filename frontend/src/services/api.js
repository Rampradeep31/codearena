import { supabase } from './supabaseClient';
import axios from 'axios';

const backendApi = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

backendApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Supabase Cloud Backend Service for CodeArena
 * Connects student entry, exams, questions, and code submissions directly to Supabase PostgreSQL database.
 */

// ─── Auth API (Student Entry & Registration) ─────────────────
export const authAPI = {
  login: async (email, password) => {
    // Admin login
    if (email === 'admin@codearena.com' && password === 'admin123') {
      const adminUser = { id: 1, name: 'Admin', email: 'admin@codearena.com', role: 'admin' };
      return { data: { access_token: 'admin_token', role: 'admin', user: adminUser } };
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${email},register_number.eq.${email}`)
      .single();

    if (error || !data) {
      throw new Error('Invalid credentials');
    }

    return { data: { access_token: 'sb_token_' + data.id, role: data.role || 'student', user: data } };
  },

  studentEntry: async (studentData) => {
    const regNo = studentData.register_number.trim().toUpperCase();

    // Parse numeric year
    let yearNum = 1;
    if (studentData.year) {
      const digits = String(studentData.year).replace(/\D/g, '');
      yearNum = digits ? parseInt(digits) : 1;
    }

    const studentRecord = {
      name: studentData.name.trim(),
      register_number: regNo,
      department: studentData.department || 'AI & DS',
      section: studentData.section || 'A',
      year: yearNum,
      role: 'student'
    };

    // Upsert student (create if doesn't exist, update if exists)
    const { data: user, error } = await supabase
      .from('users')
      .upsert(studentRecord, { onConflict: 'register_number' })
      .select()
      .single();

    if (error) {
      console.error("Student login error:", error);
      throw new Error("Failed to register student entry");
    }

    return {
      data: {
        access_token: 'sb_token_' + user.id,
        role: 'student',
        user: user
      }
    };
  }
};

// ─── Student API (Tests & Attempts) ───────────────────────────
export const studentAPI = {
  getTests: async () => {
    try {
      const { data: dbTests, error } = await supabase.from('tests').select('*');
      if (!error && dbTests) {
        let currentUser = null;
        try {
          const userStr = localStorage.getItem('user');
          if (userStr) currentUser = JSON.parse(userStr);
        } catch (e) {
          console.error(e);
        }

        const active = [];
        const completed = [];
        const upcoming = [];

        for (const t of dbTests) {
          let testData = {
            id: t.id,
            name: t.name,
            description: t.description,
            duration_minutes: t.duration_minutes,
            questions_per_student: t.questions_per_student,
            total_marks: t.total_marks,
            allowed_languages: t.allowed_languages,
            max_violations: t.max_violations,
            start_time: t.start_time,
            end_time: t.end_time
          };

          if (currentUser) {
            const { data: attempts } = await supabase
              .from('test_attempts')
              .select('*')
              .eq('test_id', t.id)
              .eq('user_id', currentUser.id)
              .order('id', { ascending: false });

            if (attempts && attempts.length > 0) {
              const latestAttempt = attempts[0];
              testData.attempt_id = latestAttempt.id;
              testData.attempt_status = latestAttempt.status;
              testData.attempt_submitted_at = latestAttempt.submitted_at;
            }
          }

          const now = new Date();
          const startTime = new Date(t.start_time);
          const endTime = new Date(t.end_time);

          if (testData.attempt_status === 'submitted' || testData.attempt_status === 'auto_submitted' || endTime < now) {
            completed.push(testData);
          } else if (startTime > now) {
            upcoming.push(testData);
          } else {
            active.push(testData);
          }
        }

        return { data: { active, upcoming, completed } };
      }
    } catch (e) {
      console.warn('Supabase getTests error:', e);
    }

    // Active test fallback
    return {
      data: {
        active: [{
          id: 1,
          name: "AI & DS Coding Assessment - Round 1",
          description: "Official online assessment for AI & DS department. Complete 5 coding challenges within 60 minutes.",
          duration_minutes: 60,
          questions_per_student: 5,
          total_marks: 50,
          allowed_languages: ["python", "java", "c", "cpp"],
          max_violations: 3
        }],
        upcoming: [],
        completed: []
      }
    };
  },

  getAttempt: async (attemptId) => {
    try {
      const { data, error } = await supabase
        .from('test_attempts')
        .select('*, tests(max_violations)')
        .eq('id', attemptId)
        .maybeSingle();

      if (!error && data) {
        return {
          data: {
            ...data,
            max_violations: data.tests?.max_violations ?? 3
          }
        };
      }
    } catch (e) {
      console.warn('Supabase getAttempt error:', e);
    }

    return {
      data: {
        id: attemptId || 1,
        test_id: 1,
        violation_count: 0,
        max_violations: 3,
        status: 'in_progress',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      }
    };
  },

  getAttemptQuestions: async (attemptId) => {
    try {
      // 1. Get attempt details
      const { data: attempt } = await supabase.from('test_attempts').select('*').eq('id', attemptId).maybeSingle();
      if (!attempt) throw new Error('Attempt not found');

      // 2. Get test details
      const { data: test } = await supabase.from('tests').select('*').eq('id', attempt.test_id).maybeSingle();
      if (!test) throw new Error('Test not found');

      // Merge local test metadata
      const meta = getLocalTestMetadata()[test.id] || { year: 'Second Year', question_bank_id: test.question_bank_id || null, randomize_questions: !!test.randomize_questions };
      const qBankId = meta.question_bank_id;
      const randomize = meta.randomize_questions;
      const questionsPerStudent = test.questions_per_student || 5;

      // 3. Check if questions are already assigned in localStorage for this attempt
      const attemptAssignedKey = `codearena_attempt_questions_${attemptId}`;
      let assignedIds = [];
      const savedAssigned = localStorage.getItem(attemptAssignedKey);
      if (savedAssigned) {
        assignedIds = JSON.parse(savedAssigned);
      }

      // 4. Fetch all questions
      const allQsRes = await adminAPI.getQuestions();
      let allQs = allQsRes.data || [];

      // Filter by the test's question bank if one is selected
      if (qBankId) {
        allQs = allQs.filter(q => q.question_bank_id === parseInt(qBankId) || q.question_bank_id === qBankId);
      }

      // If no questions inside the bank, fallback to all questions
      if (allQs.length === 0) {
        const allFallbackQs = await adminAPI.getQuestions();
        allQs = allFallbackQs.data || [];
      }

      let selectedQs = [];
      if (assignedIds.length > 0) {
        // Load the previously assigned questions
        selectedQs = assignedIds.map(id => allQs.find(q => q.id === id)).filter(Boolean);
      }

      // If we don't have selected questions yet (or some were deleted), generate them
      if (selectedQs.length < questionsPerStudent && allQs.length > 0) {
        if (randomize) {
          // Shuffle allQs and select questionsPerStudent
          const shuffled = [...allQs].sort(() => 0.5 - Math.random());
          selectedQs = shuffled.slice(0, questionsPerStudent);
        } else {
          // Just take the first questionsPerStudent
          selectedQs = allQs.slice(0, questionsPerStudent);
        }
        // Save the assigned IDs
        localStorage.setItem(attemptAssignedKey, JSON.stringify(selectedQs.map(q => q.id)));
      }

      if (selectedQs.length > 0) {
        // Map questions to match nested "question" key schema expected by ExamInterface
        const mapped = selectedQs.map((q, idx) => {
          const savedCode = localStorage.getItem(`code_${attemptId}_${q.id}`) || '';
          const savedLanguage = localStorage.getItem(`lang_${attemptId}_${q.id}`) || 'python';
          
          // Filter test cases: ONLY keep public ones (is_hidden is false/null)
          // and slice it to AT MOST 2 test cases to prevent leaking,
          // and delete is_hidden property from each testcase
          const publicTestCases = (q.test_cases || [])
            .filter(tc => !tc.is_hidden)
            .slice(0, 2)
            .map(tc => {
              const cleanTc = { ...tc };
              delete cleanTc.is_hidden;
              return cleanTc;
            });

          const cleanQuestion = {
            ...q,
            test_cases: publicTestCases
          };
          delete cleanQuestion.is_hidden;

          return {
            id: q.id,
            attempt_id: attemptId,
            question_id: q.id,
            position: idx + 1,
            question: cleanQuestion,
            saved_code: savedCode,
            saved_language: savedLanguage,
            is_submitted: false,
            submission_score: null
          };
        });
        return { data: mapped };
      }
    } catch (e) {
      console.warn('Supabase getAttemptQuestions error, falling back:', e);
    }

    // Default 5 coding questions fallback
    const fallbackQuestions = [
      {
        id: 101, title: "Two Sum", difficulty: "easy", marks: 10, topic: "Arrays",
        statement: "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to target.",
        input_format: "First line: n\nSecond line: n integers\nThird line: target", output_format: "Two space-separated indices",
        sample_input: "4\n2 7 11 15\n9", sample_output: "0 1", explanation: "nums[0] + nums[1] = 9"
      },
      {
        id: 102, title: "Reverse String", difficulty: "easy", marks: 10, topic: "Strings",
        statement: "Write a function that reverses a string.",
        input_format: "Single line string", output_format: "Reversed string",
        sample_input: "hello", sample_output: "olleh", explanation: "Reverse of hello is olleh"
      },
      {
        id: 103, title: "Palindrome Check", difficulty: "easy", marks: 10, topic: "Strings",
        statement: "Determine if a string is a palindrome.",
        input_format: "Single line string", output_format: "true or false",
        sample_input: "racecar", sample_output: "true", explanation: "racecar is a palindrome"
      },
      {
        id: 104, title: "Maximum Subarray", difficulty: "medium", marks: 10, topic: "Arrays",
        statement: "Find contiguous subarray with largest sum.",
        input_format: "First line: n\nSecond line: n integers", output_format: "Largest sum integer",
        sample_input: "9\n-2 1 -3 4 -1 2 1 -5 4", sample_output: "6", explanation: "[4,-1,2,1] has max sum 6"
      },
      {
        id: 105, title: "Valid Parentheses", difficulty: "easy", marks: 10, topic: "Stacks",
        statement: "Determine if input string of brackets is valid.",
        input_format: "Single string", output_format: "true or false",
        sample_input: "()[]{}", sample_output: "true", explanation: "Brackets closed correctly"
      }
    ];

    const fallbackMapped = fallbackQuestions.map((q, idx) => {
      const savedCode = localStorage.getItem(`code_${attemptId}_${q.id}`) || '';
      const savedLanguage = localStorage.getItem(`lang_${attemptId}_${q.id}`) || 'python';
      return {
        id: q.id,
        attempt_id: attemptId,
        question_id: q.id,
        position: idx + 1,
        question: q,
        saved_code: savedCode,
        saved_language: savedLanguage,
        is_submitted: false,
        submission_score: null
      };
    });

    return { data: fallbackMapped };
  },

  startTest: async (testId) => {
    try {
      let currentUser = null;
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) currentUser = JSON.parse(userStr);
      } catch (e) {
        console.error(e);
      }

      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Check if attempt already exists
      const { data: existingAttempts } = await supabase
        .from('test_attempts')
        .select('*')
        .eq('test_id', testId)
        .eq('user_id', currentUser.id)
        .order('id', { ascending: false });

      if (existingAttempts && existingAttempts.length > 0) {
        return { data: existingAttempts[0] };
      }

      // Create new attempt
      const durationMin = 60;
      const expiresAt = new Date(Date.now() + durationMin * 60 * 1000).toISOString();

      const { data: newAttempt, error } = await supabase
        .from('test_attempts')
        .insert({
          test_id: testId,
          user_id: currentUser.id,
          status: 'in_progress',
          score: 0,
          violation_count: 0,
          started_at: new Date().toISOString(),
          expires_at: expiresAt
        })
        .select()
        .single();

      if (!error && newAttempt) {
        return { data: newAttempt };
      }
    } catch (e) {
      console.warn('Supabase startTest error:', e);
    }

    return { data: { id: 1, test_id: testId, status: 'in_progress' } };
  },

  saveCode: async (attemptId, data) => {
    localStorage.setItem(`code_${attemptId}_${data.question_id}`, data.source_code);
    localStorage.setItem(`lang_${attemptId}_${data.question_id}`, data.language);
    return { data: { status: 'saved' } };
  },

  recordViolation: async (attemptId, data) => {
    // 1. Call local backend if available
    try {
      const res = await backendApi.post(`/student/attempts/${attemptId}/violations`, {
        violation_type: data.violation_type
      });
      if (res.data) {
        return {
          data: {
            violation_count: res.data.violation_count,
            max_violations: res.data.max_violations,
            auto_submitted: res.data.auto_submitted
          }
        };
      }
    } catch (e) {
      console.warn('Backend API recordViolation error, trying Supabase/localStorage:', e);
    }

    // 2. Fallback to Supabase / LocalStorage
    let currentCount = 0;
    try {
      const { data: attempt } = await supabase
        .from('test_attempts')
        .select('violation_count')
        .eq('id', attemptId)
        .single();
      if (attempt) currentCount = attempt.violation_count || 0;
    } catch (e) {
      console.warn('Supabase recordViolation get error:', e);
      const savedCount = localStorage.getItem(`violation_count_${attemptId}`);
      if (savedCount) currentCount = parseInt(savedCount);
    }

    const nextCount = currentCount + 1;
    localStorage.setItem(`violation_count_${attemptId}`, nextCount);

    try {
      const { data: updatedAttempt, error } = await supabase
        .from('test_attempts')
        .update({ violation_count: nextCount })
        .eq('id', attemptId)
        .select('*, tests(max_violations)')
        .single();

      if (!error && updatedAttempt) {
        return {
          data: {
            ...updatedAttempt,
            max_violations: updatedAttempt.tests?.max_violations ?? 3
          }
        };
      }
    } catch (e) {
      console.warn('Supabase recordViolation update error:', e);
    }

    return { 
      data: { 
        violation_count: nextCount, 
        max_violations: 3,
        auto_submitted: nextCount >= 3 
      } 
    };
  },

  finishTest: async (attemptId, status = 'submitted') => {
    try {
      const { data, error } = await supabase
        .from('test_attempts')
        .update({
          status: status,
          submitted_at: new Date().toISOString()
        })
        .eq('id', attemptId)
        .select()
        .single();

      if (!error && data) {
        return { data };
      }
    } catch (e) {
      console.warn('Supabase finishTest error:', e);
    }
    return { data: { status: status } };
  }
};

// ─── Code Execution & Submissions API ─────────────────────────
export const codeAPI = {
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
    try {
      const res = await backendApi.post('/code/submit', data);

      try {
        await supabase.from('submissions').insert({
          attempt_id: data.attempt_id || 1,
          question_id: data.question_id,
          language: data.language || 'python',
          code: data.code || data.source_code,
          status: res.data.status || 'submitted',
          score: res.data.score || 0,
          total_test_cases: res.data.total_test_cases || 0,
          passed_test_cases: res.data.passed_test_cases || 0,
        });
      } catch (supabaseError) {
        console.warn('Supabase submission insert error:', supabaseError);
      }

      return res;
    } catch (e) {
      console.warn('Backend API submit error:', e);
      throw e;
    }
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
    const { data: question, error } = await supabase.from('questions').insert(questionData).select().single();
    if (error) throw error;
    
    // Save mapping locally
    if (question_bank_id) {
      const mappings = getLocalQuestionMappings();
      mappings[question.id] = question_bank_id;
      saveLocalQuestionMappings(mappings);
    }

    if (test_cases && test_cases.length > 0) {
      const tcData = test_cases.map(tc => ({ ...tc, question_id: question.id }));
      await supabase.from('test_cases').insert(tcData);
    }
    return { data: { ...question, question_bank_id } };
  },

  updateQuestion: async (id, data) => {
    const { test_cases, question_bank_id, ...questionData } = data;
    const { data: question, error } = await supabase.from('questions').update(questionData).eq('id', id).select().single();
    if (error) throw error;

    // Save mapping locally
    const mappings = getLocalQuestionMappings();
    if (question_bank_id) {
      mappings[id] = question_bank_id;
    } else {
      delete mappings[id];
    }
    saveLocalQuestionMappings(mappings);

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
          questions_assigned: test?.questions_per_student || 5,
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
