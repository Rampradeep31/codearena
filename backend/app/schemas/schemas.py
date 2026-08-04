from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional, List
from datetime import datetime


# ─── Auth ──────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str


class StudentEntryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    register_number: str = Field(..., min_length=1, max_length=50)
    department: Optional[str] = "AI & DS"
    section: Optional[str] = "A"
    year: Optional[str] = "1st Year"


# ─── User / Student ───────────────────────────────────
class UserOut(BaseModel):
    id: int
    email: str
    register_number: Optional[str] = None
    name: str
    role: str
    department: Optional[str] = None
    year: Optional[int] = None
    section: Optional[str] = None
    status: str

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user: UserOut


class StudentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    register_number: str = Field(..., min_length=1, max_length=50)
    email: str = Field(..., max_length=255)
    department: Optional[str] = None
    year: Optional[int] = Field(None, ge=1, le=5)
    section: Optional[str] = None
    # Optional: a random password is generated server-side when omitted.
    password: Optional[str] = Field(None, min_length=4, max_length=128)


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    year: Optional[int] = None
    section: Optional[str] = None
    status: Optional[str] = None
    password: Optional[str] = None


# ─── Question Bank ────────────────────────────────────
class QuestionBankCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    year: str = "Second Year"
    status: str = "Active"


class QuestionBankUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    year: Optional[str] = None
    status: Optional[str] = None


class QuestionBankOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    year: str
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Question ─────────────────────────────────────────
class TestCaseCreate(BaseModel):
    input: str
    expected_output: str
    is_hidden: bool = False


class TestCaseOut(BaseModel):
    id: int
    input: str
    expected_output: str
    is_hidden: bool

    class Config:
        from_attributes = True


class TestCasePublicOut(BaseModel):
    """Test case output for students - never includes hidden test case data."""
    id: int
    input: str
    expected_output: str

    class Config:
        from_attributes = True


class QuestionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    statement: str
    difficulty: str  # easy, medium, hard
    marks: int = Field(10, ge=1)
    topic: Optional[str] = "General"
    input_format: Optional[str] = None
    output_format: Optional[str] = None
    constraints: Optional[str] = None
    sample_input: Optional[str] = None
    sample_output: Optional[str] = None
    explanation: Optional[str] = None
    question_bank_id: Optional[int] = None
    test_cases: List[TestCaseCreate] = []

    @model_validator(mode="after")
    def validate_difficulty(self):
        if self.difficulty not in ("easy", "medium", "hard"):
            raise ValueError("difficulty must be one of: easy, medium, hard")
        return self


class QuestionUpdate(BaseModel):
    title: Optional[str] = None
    statement: Optional[str] = None
    difficulty: Optional[str] = None
    marks: Optional[int] = None
    topic: Optional[str] = None
    input_format: Optional[str] = None
    output_format: Optional[str] = None
    constraints: Optional[str] = None
    sample_input: Optional[str] = None
    sample_output: Optional[str] = None
    explanation: Optional[str] = None
    question_bank_id: Optional[int] = None
    # When provided, the question's test cases are fully replaced with this set.
    test_cases: Optional[List[TestCaseCreate]] = None


class QuestionOut(BaseModel):
    id: int
    title: str
    statement: str
    difficulty: str
    marks: int
    topic: str
    input_format: Optional[str] = None
    output_format: Optional[str] = None
    constraints: Optional[str] = None
    sample_input: Optional[str] = None
    sample_output: Optional[str] = None
    explanation: Optional[str] = None
    question_bank_id: Optional[int] = None
    test_cases: List[TestCaseOut] = []
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class QuestionStudentOut(BaseModel):
    """Question output for students - only includes public test cases."""
    id: int
    title: str
    statement: str
    difficulty: str
    marks: int
    topic: str
    input_format: Optional[str] = None
    output_format: Optional[str] = None
    constraints: Optional[str] = None
    sample_input: Optional[str] = None
    sample_output: Optional[str] = None
    explanation: Optional[str] = None
    test_cases: List[TestCasePublicOut] = []

    class Config:
        from_attributes = True


# ─── Test ─────────────────────────────────────────────
class TestCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    year: str = "Second Year"
    question_bank_id: Optional[int] = None
    randomize_questions: bool = False
    start_time: datetime
    end_time: datetime
    duration_minutes: int = Field(..., ge=1)
    total_marks: int = Field(..., ge=1)
    questions_per_student: int = Field(..., ge=1)
    easy_count: int = Field(0, ge=0)
    medium_count: int = Field(0, ge=0)
    hard_count: int = Field(0, ge=0)
    allowed_languages: List[str] = ["python", "java", "c", "cpp"]
    max_violations: int = Field(3, ge=1)
    allow_copy_paste: bool = False
    scoring_type: str = "partial"
    show_results: bool = False
    question_ids: List[int] = []

    @model_validator(mode="after")
    def validate_test(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        window_minutes = (self.end_time - self.start_time).total_seconds() / 60
        if self.duration_minutes > window_minutes:
            raise ValueError("duration_minutes cannot exceed the start/end window")
        if self.easy_count + self.medium_count + self.hard_count > self.questions_per_student:
            raise ValueError("easy_count + medium_count + hard_count cannot exceed questions_per_student")
        if self.scoring_type not in ("partial", "all_or_nothing"):
            raise ValueError("scoring_type must be 'partial' or 'all_or_nothing'")
        return self


class TestUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    year: Optional[str] = None
    question_bank_id: Optional[int] = None
    randomize_questions: Optional[bool] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    total_marks: Optional[int] = None
    questions_per_student: Optional[int] = None
    easy_count: Optional[int] = None
    medium_count: Optional[int] = None
    hard_count: Optional[int] = None
    allowed_languages: Optional[List[str]] = None
    max_violations: Optional[int] = None
    allow_copy_paste: Optional[bool] = None
    scoring_type: Optional[str] = None
    show_results: Optional[bool] = None
    question_ids: Optional[List[int]] = None


class TestOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    year: Optional[str] = None
    question_bank_id: Optional[int] = None
    randomize_questions: Optional[bool] = None
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    total_marks: int
    questions_per_student: int
    easy_count: int
    medium_count: int
    hard_count: int
    allowed_languages: list
    max_violations: int
    allow_copy_paste: bool
    scoring_type: str
    show_results: bool
    question_count: Optional[int] = None
    question_ids: Optional[List[int]] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Attempt ──────────────────────────────────────────
class AttemptOut(BaseModel):
    id: int
    student_id: int
    test_id: int
    started_at: datetime
    expires_at: datetime
    submitted_at: Optional[datetime] = None
    status: str
    violation_count: int
    submission_reason: Optional[str] = None
    total_score: Optional[float] = None
    total_possible: Optional[float] = None
    max_violations: Optional[int] = None

    class Config:
        from_attributes = True


class StudentQuestionOut(BaseModel):
    id: int
    attempt_id: int
    question_id: int
    position: int
    question: Optional[QuestionStudentOut] = None
    saved_code: Optional[str] = None
    saved_language: Optional[str] = None
    is_submitted: bool = False
    submission_score: Optional[float] = None

    class Config:
        from_attributes = True


# ─── Code Execution ──────────────────────────────────
class CodeRunRequest(BaseModel):
    attempt_id: int
    question_id: int
    language: str
    source_code: str


class CodeRunCaseRequest(CodeRunRequest):
    input: str = ""
    expected_output: Optional[str] = None


class CodeSaveRequest(BaseModel):
    question_id: int
    language: str
    source_code: str


class TestCaseResult(BaseModel):
    test_case_id: Optional[int] = None
    passed: bool
    input: Optional[str] = None
    expected_output: Optional[str] = None
    actual_output: Optional[str] = None
    execution_time: Optional[float] = None
    memory_used: Optional[int] = None
    status: str = ""
    error: Optional[str] = None


class CodeRunResponse(BaseModel):
    compilation_status: str  # "success", "error"
    compilation_error: Optional[str] = None
    results: List[TestCaseResult] = []
    passed: int = 0
    total: int = 0


class CodeSubmitResponse(BaseModel):
    score: float
    total_marks: float
    passed_test_cases: int
    total_test_cases: int
    status: str  # "accepted", "partial", "wrong_answer", "compilation_error"
    results: List[TestCaseResult] = []


# ─── Violation ────────────────────────────────────────
class ViolationCreate(BaseModel):
    violation_type: str  # tab_hidden, window_blur, fullscreen_exit, copy_attempt, paste_attempt, face_turned, multiple_faces

    _ALLOWED_TYPES = {
        "tab_hidden", "window_blur", "fullscreen_exit",
        "copy_attempt", "paste_attempt", "face_turned", "multiple_faces",
    }

    @model_validator(mode="after")
    def validate_violation_type(self):
        if self.violation_type not in self._ALLOWED_TYPES:
            raise ValueError(f"violation_type must be one of: {sorted(self._ALLOWED_TYPES)}")
        return self


class ViolationOut(BaseModel):
    id: int
    attempt_id: int
    violation_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class ViolationRecorded(BaseModel):
    """Response returned after recording a violation, with authoritative counts."""
    id: int
    attempt_id: int
    violation_type: str
    created_at: datetime
    violation_count: int
    max_violations: int
    auto_submitted: bool


# ─── Dashboard / Monitoring ──────────────────────────
class DashboardStats(BaseModel):
    total_students: int
    total_tests: int
    active_tests: int
    completed_tests: int
    total_questions: int
    total_submissions: int


class SubmissionOut(BaseModel):
    id: int
    attempt_id: int
    question_id: int
    language: str
    submitted_at: datetime
    score: float
    total_test_cases: int
    passed_test_cases: int

    class Config:
        from_attributes = True


class DashboardData(DashboardStats):
    """Dashboard payload: aggregate stats plus the raw lists the admin UI
    needs to render charts, filters and drill-downs."""

    students: List[UserOut] = []
    tests: List[TestOut] = []
    questions: List[QuestionOut] = []
    attempts: List[AttemptOut] = []
    submissions: List[SubmissionOut] = []
    banks: List[QuestionBankOut] = []


class StudentMonitorRow(BaseModel):
    student_id: int
    student_name: str
    register_number: str
    status: str  # not_started, writing, submitted, auto_submitted, disconnected
    questions_attempted: int
    questions_submitted: int
    violation_count: int
    remaining_seconds: Optional[int] = None
    last_activity: Optional[datetime] = None


class ResultRow(BaseModel):
    rank: int
    student_name: str
    register_number: str
    department: Optional[str] = None
    questions_assigned: int
    questions_attempted: int
    questions_solved: int
    score: float
    total_possible: float
    percentage: float
    violation_count: int
    submission_type: Optional[str] = None
    submitted_at: Optional[datetime] = None
