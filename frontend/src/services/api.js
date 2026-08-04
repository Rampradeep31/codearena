import { supabase } from './supabaseClient';
import axios from 'axios';

const backendApi = axios.create({
  baseURL: import.meta.env.PROD ? 'https://codearena-api-e6ih.onrender.com' : '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Add auth token to requests
backendApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || localStorage.getItem('codearena_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// LocalStorage helpers for metadata
const getStudentLocalTestMetadata = () => {
  try {
    return JSON.parse(localStorage.getItem('test_metadata') || '{}');
  } catch (e) { return {}; }
};

/**
 * Supabase Cloud Backend Service for CodeArena
 * Connects student entry, exams, questions, and code submissions directly to Supabase PostgreSQL database.
 */

// ─── Auth API (Student Entry & Registration) ─────────────────
export const authAPI = {
  login: async (email, password) => {
    // Admin login shortcut
    if (email === 'admin@codearena.com' && password === 'admin123') {
      const adminUser = { id: 1, name: 'Admin', email: 'admin@codearena.com', role: 'admin' };
      return { data: { access_token: 'admin_token', role: 'admin', user: adminUser } };
    }

    // Try backend API first
    try {
      const res = await backendApi.post('/auth/login', { email, password });
      if (res.data && res.data.user) return res;
    } catch (e) {
      console.warn('Backend API login error:', e);
    }

    // Try Supabase
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`email.eq.${email},register_number.eq.${email}`)
        .single();

      if (!error && data) {
        return { data: { access_token: 'sb_token_' + data.id, role: data.role || 'student', user: data } };
      }
    } catch (e) {
      console.warn('Supabase login error:', e);
    }

    // Fallback admin login
    if (email.toLowerCase().includes('admin')) {
      const adminUser = { id: 1, name: 'Admin', email: email, role: 'admin' };
      return { data: { access_token: 'admin_token', role: 'admin', user: adminUser } };
    }

    throw new Error('Invalid credentials');
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

    // 1. Try Backend API first if available
    try {
      const res = await backendApi.post('/auth/student-entry', studentData);
      if (res.data && res.data.user) {
        return res;
      }
    } catch (e) {
      console.warn('Backend API studentEntry error, trying Supabase/local:', e);
    }

    // 2. Try Supabase upsert
    try {
      const { data: user, error } = await supabase
        .from('users')
        .upsert(studentRecord, { onConflict: 'register_number' })
        .select()
        .single();

      if (!error && user) {
        return {
          data: {
            access_token: 'sb_token_' + user.id,
            role: 'student',
            user: user
          }
        };
      }
      if (error) {
        console.warn("Supabase studentEntry error:", error);
      }
    } catch (e) {
      console.warn("Supabase studentEntry exception:", e);
    }

    // 3. Resilient Fallback to Local Student Entry (works when Supabase RLS/table permissions fail)
    const fallbackId = Math.abs(regNo.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) || Date.now();
    const fallbackUser = {
      id: fallbackId,
      ...studentRecord
    };

    return {
      data: {
        access_token: 'local_token_' + fallbackUser.register_number,
        role: 'student',
        user: fallbackUser
      }
    };
  }
};

// ─── Student API (Tests & Attempts) ───────────────────────────
export const studentAPI = {
  getTests: async () => {
    let currentUser = null;
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) currentUser = JSON.parse(userStr);
    } catch (e) {
      console.error(e);
    }

    // Clean legacy non-scoped keys to prevent global completion leaks
    localStorage.removeItem('codearena_attempt_status_test_1');
    localStorage.removeItem('codearena_attempt_submitted_at_test_1');
    localStorage.removeItem('codearena_attempt_id_test_1');

    const userKey = currentUser ? (currentUser.register_number || currentUser.id) : null;

    const getLocalStatus = (testId) => {
      if (!userKey) return { status: null, submittedAt: null, attemptId: null };
      const status = localStorage.getItem(`codearena_attempt_status_u${userKey}_t${testId}`);
      const submittedAt = localStorage.getItem(`codearena_attempt_submitted_at_u${userKey}_t${testId}`);
      const attemptId = localStorage.getItem(`codearena_attempt_id_u${userKey}_t${testId}`);
      return { status, submittedAt, attemptId };
    };

    try {
      const { data: dbTests, error } = await supabase.from('tests').select('*');
      if (!error && dbTests && dbTests.length > 0) {
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

          // 1. User-Scoped Local Storage Check
          const localInfo = getLocalStatus(t.id);
          if (localInfo.status) {
            testData.attempt_status = localInfo.status;
            testData.attempt_submitted_at = localInfo.submittedAt;
            if (localInfo.attemptId) testData.attempt_id = localInfo.attemptId;
          }

          // 2. Supabase User-Scoped Attempt Check
          if (currentUser) {
            try {
              const { data: attempts } = await supabase
                .from('test_attempts')
                .select('*')
                .eq('test_id', t.id)
                .order('id', { ascending: false });

              if (attempts && attempts.length > 0) {
                // STRICTLY match only this current logged-in user
                const userAttempt = attempts.find(a => 
                  (currentUser.id && String(a.user_id) === String(currentUser.id)) ||
                  (currentUser.register_number && a.register_number === currentUser.register_number)
                );
                
                if (userAttempt) {
                  testData.attempt_id = userAttempt.id;
                  if (userAttempt.status === 'submitted' || userAttempt.status === 'auto_submitted') {
                    testData.attempt_status = userAttempt.status;
                    testData.attempt_submitted_at = userAttempt.submitted_at || localInfo.submittedAt;
                  } else if (!testData.attempt_status) {
                    testData.attempt_status = userAttempt.status;
                    testData.attempt_submitted_at = userAttempt.submitted_at;
                  }
                }
              }
            } catch (attErr) {
              console.warn("Supabase attempts fetch warning:", attErr);
            }
          }

          const now = new Date();
          const startTime = new Date(t.start_time || Date.now());
          const endTime = new Date(t.end_time || (Date.now() + 7 * 24 * 3600 * 1000));

          const isSubmitted = testData.attempt_status === 'submitted' || testData.attempt_status === 'auto_submitted';

          if (isSubmitted || endTime < now) {
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

    // Default Fallback with User-Scoped Local Storage Status Check
    const localInfo = getLocalStatus(1);
    const isSubmitted = localInfo.status === 'submitted' || localInfo.status === 'auto_submitted';

    const fallbackTest = {
      id: 1,
      name: "AI & DS Coding Assessment - Round 1",
      description: "Official online assessment for AI & DS department. Complete 1 coding challenge within 60 minutes.",
      duration_minutes: 60,
      questions_per_student: 1,
      total_marks: 50,
      allowed_languages: ["python", "java", "c", "cpp"],
      max_violations: 3,
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      attempt_status: localInfo.status,
      attempt_submitted_at: localInfo.submittedAt,
      attempt_id: localInfo.attemptId || (isSubmitted ? 1 : null)
    };

    return {
      data: {
        active: isSubmitted ? [] : [fallbackTest],
        upcoming: [],
        completed: isSubmitted ? [fallbackTest] : []
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
      const meta = getStudentLocalTestMetadata()[test.id] || { year: 'Second Year', question_bank_id: test.question_bank_id || null, randomize_questions: !!test.randomize_questions };
      const qBankId = meta.question_bank_id;
      const randomize = meta.randomize_questions;
      const questionsPerStudent = test.questions_per_student || 1;

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
          let publicTestCases = (q.test_cases || [])
            .filter(tc => !tc.is_hidden)
            .slice(0, 2)
            .map(tc => {
              const cleanTc = { ...tc };
              delete cleanTc.is_hidden;
              return cleanTc;
            });

          if (publicTestCases.length === 0 && (q.sample_input || q.sample_output)) {
            publicTestCases = [{
              id: `sample_${q.id}`,
              input: q.sample_input || '',
              expected_output: q.sample_output || ''
            }];
          }

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

    const countToUse = typeof questionsPerStudent === 'number' && questionsPerStudent > 0 ? questionsPerStudent : 1;
    const slicedFallback = fallbackQuestions.slice(0, countToUse);

    const fallbackMapped = slicedFallback.map((q, idx) => {
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

      // Check if active in_progress attempt already exists
      const { data: existingAttempts } = await supabase
        .from('test_attempts')
        .select('*')
        .eq('test_id', testId)
        .eq('user_id', currentUser.id)
        .order('id', { ascending: false });

      if (existingAttempts && existingAttempts.length > 0) {
        const activeAttempt = existingAttempts.find(a => a.status === 'in_progress');
        if (activeAttempt) {
          return { data: activeAttempt };
        }
      }

      // Create new in_progress attempt
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

    return { data: { id: Date.now(), test_id: testId, status: 'in_progress', expires_at: new Date(Date.now() + 3600000).toISOString() } };
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

    // 2. Fallback to Supabase / LocalStorage tracking
    let currentUser = null;
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) currentUser = JSON.parse(userStr);
    } catch (e) {
      console.error(e);
    }

    const userKey = currentUser ? (currentUser.register_number || currentUser.id) : 'anon';
    const localKey = `codearena_violation_count_u${userKey}_att_${attemptId}`;

    let currentCount = 0;
    const savedLocal = localStorage.getItem(localKey);
    if (savedLocal) {
      currentCount = parseInt(savedLocal, 10) || 0;
    }

    try {
      const { data: attempt, error } = await supabase
        .from('test_attempts')
        .select('violation_count')
        .eq('id', attemptId)
        .single();

      if (!error && attempt && typeof attempt.violation_count === 'number') {
        currentCount = Math.max(currentCount, attempt.violation_count);
      }
    } catch (e) {
      console.warn('Supabase recordViolation get error:', e);
    }

    const nextCount = currentCount + 1;
    localStorage.setItem(localKey, String(nextCount));

    try {
      const { data: updatedAttempt, error } = await supabase
        .from('test_attempts')
        .update({ violation_count: nextCount })
        .eq('id', attemptId)
        .select('*, tests(max_violations)')
        .single();

      if (!error && updatedAttempt) {
        const maxV = updatedAttempt.tests?.max_violations ?? 3;
        return {
          data: {
            ...updatedAttempt,
            violation_count: nextCount,
            max_violations: maxV,
            auto_submitted: nextCount >= maxV
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
    const submittedAt = new Date().toISOString();

    let currentUser = null;
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) currentUser = JSON.parse(userStr);
    } catch (e) {
      console.error(e);
    }

    const userKey = currentUser ? (currentUser.register_number || currentUser.id) : null;
    
    // Always persist submission status to localStorage immediately scoped to attemptId and user
    localStorage.setItem(`codearena_attempt_status_${attemptId}`, status);
    localStorage.setItem(`codearena_attempt_submitted_at_${attemptId}`, submittedAt);

    if (userKey) {
      localStorage.setItem(`codearena_attempt_status_u${userKey}_t1`, status);
      localStorage.setItem(`codearena_attempt_submitted_at_u${userKey}_t1`, submittedAt);
      localStorage.setItem(`codearena_attempt_id_u${userKey}_t1`, String(attemptId));
    }

    // Clean legacy non-scoped keys so they don't affect other student accounts
    localStorage.removeItem('codearena_attempt_status_test_1');
    localStorage.removeItem('codearena_attempt_submitted_at_test_1');
    localStorage.removeItem('codearena_attempt_id_test_1');

    try {
      const { data, error } = await supabase
        .from('test_attempts')
        .update({
          status: status,
          submitted_at: submittedAt
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
    return { data: { status: status, submitted_at: submittedAt } };
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
    try {
      const res = await backendApi.post('/code/submit', data);

      try {
        const attemptId = data.attempt_id || 1;
        await supabase.from('submissions').insert({
          attempt_id: attemptId,
          question_id: data.question_id,
          language: data.language || 'python',
          code: data.code || data.source_code,
          status: res.data.status || 'submitted',
          score: res.data.score || 0,
          total_test_cases: res.data.total_test_cases || 0,
          passed_test_cases: res.data.passed_test_cases || 0,
        });

        // Recalculate the overall attempt score (sum of max score per question)
        const { data: allSubs } = await supabase
          .from('submissions')
          .select('question_id, score')
          .eq('attempt_id', attemptId);
          
        if (allSubs) {
          const maxScores = {};
          allSubs.forEach(s => {
            if (!maxScores[s.question_id] || s.score > maxScores[s.question_id]) {
              maxScores[s.question_id] = s.score;
            }
          });
          const totalScore = Object.values(maxScores).reduce((sum, s) => sum + (s || 0), 0);
          
          await supabase
            .from('test_attempts')
            .update({ score: totalScore })
            .eq('id', attemptId);
        }
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

const ensureTestCases = (q) => {
  if (q && q.test_cases && Array.isArray(q.test_cases) && q.test_cases.length > 0) {
    return q.test_cases;
  }
  const tcs = [];
  if (q && (q.sample_input !== undefined && q.sample_input !== null && q.sample_output !== undefined && q.sample_output !== null)) {
    tcs.push({
      id: `tc_${q.id}_1`,
      input: String(q.sample_input),
      expected_output: String(q.sample_output),
      is_hidden: false
    });
  }
  return tcs;
};

const DEFAULT_ALL_QUESTIONS = [
  { id: 101, title: 'Two Sum', statement: 'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to target.', difficulty: 'easy', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers\nThird line: target', output_format: 'Two space-separated indices', sample_input: '4\n2 7 11 15\n9', sample_output: '0 1', explanation: 'nums[0] + nums[1] = 9', question_bank_id: 1, test_cases: [{ id: 1011, input: '4\n2 7 11 15\n9', expected_output: '0 1', is_hidden: false }, { id: 1012, input: '3\n3 2 4\n6', expected_output: '1 2', is_hidden: true }] },
  { id: 102, title: 'Reverse String', statement: 'Write a function that reverses a string.', difficulty: 'easy', marks: 50, topic: 'Strings', input_format: 'Single line string', output_format: 'Reversed string', sample_input: 'hello', sample_output: 'olleh', explanation: 'Reverse of hello is olleh', question_bank_id: 1, test_cases: [{ id: 1021, input: 'hello', expected_output: 'olleh', is_hidden: false }, { id: 1022, input: 'CodeArena', expected_output: 'anerAedoC', is_hidden: true }] },
  { id: 103, title: 'Palindrome Check', statement: 'Determine if a string is a palindrome.', difficulty: 'easy', marks: 50, topic: 'Strings', input_format: 'Single line string', output_format: 'true or false', sample_input: 'racecar', sample_output: 'true', explanation: 'racecar is a palindrome', question_bank_id: 1, test_cases: [{ id: 1031, input: 'racecar', expected_output: 'true', is_hidden: false }, { id: 1032, input: 'hello', expected_output: 'false', is_hidden: true }] },
  { id: 104, title: 'Maximum Subarray', statement: 'Find contiguous subarray with largest sum.', difficulty: 'medium', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers', output_format: 'Largest sum integer', sample_input: '9\n-2 1 -3 4 -1 2 1 -5 4', sample_output: '6', explanation: '[4,-1,2,1] has max sum 6', question_bank_id: 1, test_cases: [{ id: 1041, input: '9\n-2 1 -3 4 -1 2 1 -5 4', expected_output: '6', is_hidden: false }, { id: 1042, input: '1\n1', expected_output: '1', is_hidden: true }] },
  { id: 105, title: 'Valid Parentheses', statement: 'Determine if input string of brackets is valid.', difficulty: 'easy', marks: 50, topic: 'Stacks', input_format: 'Single string', output_format: 'true or false', sample_input: '()[]{}', sample_output: 'true', explanation: 'Brackets closed correctly', question_bank_id: 1, test_cases: [{ id: 1051, input: '()[]{}', expected_output: 'true', is_hidden: false }, { id: 1052, input: '(]', expected_output: 'false', is_hidden: true }] },
  { id: 106, title: 'Convert Temperature', statement: 'Convert Celsius to Kelvin and Fahrenheit.', difficulty: 'easy', marks: 50, topic: 'Math', input_format: 'Single float celsius', output_format: 'Two lines: Kelvin\nFahrenheit', sample_input: '36.50', sample_output: '309.65\n97.70', explanation: 'Celsius converted to Kelvin and Fahrenheit', question_bank_id: 1, test_cases: [{ id: 1061, input: '36.50', expected_output: '309.65\n97.70', is_hidden: false }, { id: 1062, input: '122.11', expected_output: '395.26\n251.80', is_hidden: true }] },
  { id: 107, title: 'Power of Three', statement: 'Given an integer n, return true if it is a power of three.', difficulty: 'easy', marks: 50, topic: 'Math', input_format: 'Single integer n', output_format: 'true or false', sample_input: '27', sample_output: 'true', explanation: '27 is 3^3', question_bank_id: 1, test_cases: [{ id: 1071, input: '27', expected_output: 'true', is_hidden: false }, { id: 1072, input: '0', expected_output: 'false', is_hidden: true }] },
  { id: 108, title: 'Sqrt(x)', statement: 'Compute and return the square root of x rounded down.', difficulty: 'easy', marks: 50, topic: 'Math', input_format: 'Single integer x', output_format: 'Square root integer', sample_input: '8', sample_output: '2', explanation: 'sqrt(8) = 2.828 -> 2', question_bank_id: 1, test_cases: [{ id: 1081, input: '8', expected_output: '2', is_hidden: false }, { id: 1082, input: '4', expected_output: '2', is_hidden: true }] },
  { id: 109, title: 'Remove Duplicates from Sorted Array', statement: 'Remove duplicates in-place from sorted array.', difficulty: 'easy', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers', output_format: 'Space separated unique elements', sample_input: '3\n1 1 2', sample_output: '1 2', explanation: 'Unique elements are 1 and 2', question_bank_id: 1, test_cases: [{ id: 1091, input: '3\n1 1 2', expected_output: '1 2', is_hidden: false }, { id: 1092, input: '10\n0 0 1 1 1 2 2 3 3 4', expected_output: '0 1 2 3 4', is_hidden: true }] },
  { id: 110, title: 'Roman to Integer', statement: 'Convert Roman numeral string to integer.', difficulty: 'easy', marks: 50, topic: 'Strings', input_format: 'Single Roman string', output_format: 'Integer', sample_input: 'III', sample_output: '3', explanation: 'III = 3', question_bank_id: 1, test_cases: [{ id: 1101, input: 'III', expected_output: '3', is_hidden: false }, { id: 1102, input: 'LVIII', expected_output: '58', is_hidden: true }] },
  { id: 111, title: 'Palindrome Number', statement: 'Determine whether an integer is a palindrome.', difficulty: 'easy', marks: 50, topic: 'Math', input_format: 'Single integer', output_format: 'true or false', sample_input: '121', sample_output: 'true', explanation: '121 reads same backward', question_bank_id: 1, test_cases: [{ id: 1111, input: '121', expected_output: 'true', is_hidden: false }, { id: 1112, input: '-121', expected_output: 'false', is_hidden: true }] },
  { id: 112, title: 'Sort Array By Parity', statement: 'Move all even integers to beginning of array followed by odd.', difficulty: 'easy', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers', output_format: 'Space separated sorted elements', sample_input: '4\n3 1 2 4', sample_output: '2 4 3 1', explanation: 'Even numbers first', question_bank_id: 1, test_cases: [{ id: 1121, input: '4\n3 1 2 4', expected_output: '2 4 3 1', is_hidden: false }, { id: 1122, input: '1\n0', expected_output: '0', is_hidden: true }] },
  { id: 113, title: 'Shuffle the Array', statement: 'Given array nums consisting of 2n elements, return array in form [x1,y1,x2,y2...].', difficulty: 'easy', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: 2n integers', output_format: 'Shuffled elements', sample_input: '3\n2 5 1 3 4 7', sample_output: '2 3 5 4 1 7', explanation: 'Pairs (x_i, y_i) interleaved', question_bank_id: 1, test_cases: [{ id: 1131, input: '3\n2 5 1 3 4 7', expected_output: '2 3 5 4 1 7', is_hidden: false }, { id: 1132, input: '4\n1 2 3 4 4 3 2 1', expected_output: '1 4 2 3 3 2 4 1', is_hidden: true }] },
  { id: 114, title: 'Single Element in a Sorted Array', statement: 'Every element appears twice except for one. Find single element.', difficulty: 'medium', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers', output_format: 'Single element integer', sample_input: '9\n1 1 2 3 3 4 4 8 8', sample_output: '2', explanation: '2 appears once', question_bank_id: 1, test_cases: [{ id: 1141, input: '9\n1 1 2 3 3 4 4 8 8', expected_output: '2', is_hidden: false }, { id: 1142, input: '7\n3 3 7 7 10 11 11', expected_output: '10', is_hidden: true }] },
  { id: 115, title: 'Build Array from Permutation', statement: 'Build array ans where ans[i] = nums[nums[i]].', difficulty: 'easy', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers', output_format: 'Permuted elements', sample_input: '6\n0 2 1 5 3 4', sample_output: '0 1 2 4 5 3', explanation: 'ans[0] = nums[nums[0]] = nums[0] = 0', question_bank_id: 1, test_cases: [{ id: 1151, input: '6\n0 2 1 5 3 4', expected_output: '0 1 2 4 5 3', is_hidden: false }, { id: 1152, input: '5\n5 0 1 2 3 4', expected_output: '4 5 0 1 2 3', is_hidden: true }] },
  { id: 116, title: 'Element Appearing More Than 25% in a Sorted Array', statement: 'Find integer that occurs more than 25% of the time.', difficulty: 'easy', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers', output_format: 'Integer', sample_input: '9\n1 2 2 6 6 6 6 7 10', sample_output: '6', explanation: '6 appears 4/9 times (>25%)', question_bank_id: 1, test_cases: [{ id: 1161, input: '9\n1 2 2 6 6 6 6 7 10', expected_output: '6', is_hidden: false }, { id: 1162, input: '4\n1 1 2 2', expected_output: '1', is_hidden: true }] },
  { id: 117, title: 'Search Insert Position', statement: 'Return index if target is found or where it would be inserted.', difficulty: 'easy', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers\nThird line: target', output_format: 'Index integer', sample_input: '4\n1 3 5 6\n5', sample_output: '2', explanation: '5 is at index 2', question_bank_id: 1, test_cases: [{ id: 1171, input: '4\n1 3 5 6\n5', expected_output: '2', is_hidden: false }, { id: 1172, input: '4\n1 3 5 6\n2', expected_output: '1', is_hidden: true }] },
  { id: 118, title: 'Move Zeroes', statement: 'Move all 0s to end while maintaining relative order of non-zero elements.', difficulty: 'easy', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers', output_format: 'Space separated elements', sample_input: '5\n0 1 0 3 12', sample_output: '1 3 12 0 0', explanation: 'Zeroes moved to end', question_bank_id: 1, test_cases: [{ id: 1181, input: '5\n0 1 0 3 12', expected_output: '1 3 12 0 0', is_hidden: false }, { id: 1182, input: '1\n0', expected_output: '0', is_hidden: true }] },
  { id: 119, title: 'Remove Element', statement: 'Remove all instances of val in-place and return remaining.', difficulty: 'easy', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers\nThird line: val', output_format: 'Remaining elements', sample_input: '4\n3 2 2 3\n3', sample_output: '2 2', explanation: '3s removed', question_bank_id: 1, test_cases: [{ id: 1191, input: '4\n3 2 2 3\n3', expected_output: '2 2', is_hidden: false }, { id: 1192, input: '8\n0 1 2 2 3 0 4 2\n2', expected_output: '0 1 3 0 4', is_hidden: true }] },
  { id: 120, title: 'Single Number', statement: 'Find single non-repeating element in array where others appear twice.', difficulty: 'easy', marks: 50, topic: 'Arrays', input_format: 'First line: n\nSecond line: n integers', output_format: 'Single integer', sample_input: '3\n2 2 1', sample_output: '1', explanation: '1 appears once', question_bank_id: 1, test_cases: [{ id: 1201, input: '3\n2 2 1', expected_output: '1', is_hidden: false }, { id: 1202, input: '5\n4 1 2 1 2', expected_output: '4', is_hidden: true }] },
];

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
        if (qbId === undefined || qbId === null || !qbId) {
          qbId = localMappings[q.id] || 1;
        }
        return { ...q, question_bank_id: parseInt(qbId) };
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

  // ─── Question Banks CRUD ─────────────────────────────────────
  getQuestionBanks: async (params) => {
    try {
      let query = supabase.from('question_banks').select('*');
      if (params?.year) query = query.eq('year', params.year);
      if (params?.status) query = query.eq('status', params.status);
      const { data } = await query.order('created_at', { ascending: false });

      let banks = data || [];
      if (banks.length === 0) {
        banks = [{
          id: 1,
          title: 'August Month Question Bank',
          description: 'August Month Question Bank with 20 seeded coding challenges',
          year: 'Second Year',
          status: 'Active',
          created_at: new Date().toISOString()
        }];
      }
      return { data: banks };
    } catch (e) {
      console.warn('getQuestionBanks error:', e);
      return {
        data: [{
          id: 1,
          title: 'August Month Question Bank',
          description: 'August Month Question Bank with 20 seeded coding challenges',
          year: 'Second Year',
          status: 'Active',
          created_at: new Date().toISOString()
        }]
      };
    }
  },

  getQuestionBank: async (id) => {
    try {
      const { data, error } = await supabase.from('question_banks').select('*').eq('id', id).single();
      if (!error && data) return { data };
    } catch (e) {
      console.warn('getQuestionBank error:', e);
    }
    return {
      data: {
        id: parseInt(id) || 1,
        title: 'August Month Question Bank',
        description: 'August Month Question Bank with 20 seeded coding challenges',
        year: 'Second Year',
        status: 'Active',
        created_at: new Date().toISOString()
      }
    };
  },

  createQuestionBank: async (data) => {
    const { data: bank, error } = await supabase.from('question_banks').insert(data).select().single();
    if (error) throw error;
    return { data: bank };
  },

  updateQuestionBank: async (id, data) => {
    const { data: bank, error } = await supabase.from('question_banks').update(data).eq('id', id).select().single();
    if (error) throw error;
    return { data: bank };
  },

  deleteQuestionBank: async (id) => {
    return supabase.from('question_banks').delete().eq('id', id);
  },

  // ─── Questions CRUD ─────────────────────────────────────────
  getQuestions: async (params) => {
    try {
      let data = null;
      try {
        const res = await supabase.from('questions').select('*, test_cases(*)');
        if (!res.error && res.data && res.data.length > 0) {
          data = res.data;
        }
      } catch (e) {
        console.warn("Supabase embedded select failed:", e);
      }

      if (!data || data.length === 0) {
        try {
          const simpleRes = await supabase.from('questions').select('*');
          if (!simpleRes.error && simpleRes.data && simpleRes.data.length > 0) {
            data = simpleRes.data;
          }
        } catch (e) {
          console.warn("Supabase simple select failed:", e);
        }
      }

      if (!data || data.length === 0) {
        data = DEFAULT_ALL_QUESTIONS;
      }

      if (params?.search) {
        const s = params.search.toLowerCase();
        data = data.filter(q => (q.title && q.title.toLowerCase().includes(s)) || (q.topic && q.topic.toLowerCase().includes(s)));
      }
      if (params?.difficulty) {
        data = data.filter(q => q.difficulty === params.difficulty);
      }
      
      // Map question_bank_id (default to Question Bank 1 if not explicitly set) and ensure test_cases are attached
      const localMappings = getLocalQuestionMappings();
      const mapped = data.map(q => {
        let qbId = q.question_bank_id;
        if (qbId === undefined || qbId === null || !qbId) {
          qbId = localMappings[q.id] || 1;
        }
        return {
          ...q,
          question_bank_id: parseInt(qbId),
          test_cases: ensureTestCases(q)
        };
      });

      if (params?.question_bank_id) {
        const targetBankId = parseInt(params.question_bank_id);
        const filtered = mapped.filter(q => q.question_bank_id === targetBankId || targetBankId === 1);
        return { data: filtered };
      }
      return { data: mapped };
    } catch (e) {
      console.error('getQuestions error, returning DEFAULT_ALL_QUESTIONS:', e);
      return { data: DEFAULT_ALL_QUESTIONS.map(q => ({ ...q, test_cases: ensureTestCases(q) })) };
    }
  },

  getQuestion: async (id) => {
    try {
      const { data, error } = await supabase.from('questions').select('*, test_cases(*)').eq('id', id).single();
      if (!error && data) {
        let qbId = data.question_bank_id;
        if (qbId === undefined || qbId === null || !qbId) {
          qbId = getLocalQuestionMappings()[data.id] || 1;
        }
        return { data: { ...data, question_bank_id: parseInt(qbId), test_cases: ensureTestCases(data) } };
      }
    } catch (e) {
      console.warn('getQuestion Supabase error, falling back:', e);
    }
    const numericId = parseInt(id);
    const fallbackQ = DEFAULT_ALL_QUESTIONS.find(q => q.id === numericId || q.id === id);
    if (fallbackQ) {
      return { data: { ...fallbackQ, test_cases: ensureTestCases(fallbackQ) } };
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
