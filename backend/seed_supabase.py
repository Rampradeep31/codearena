"""
CodeArena seeder — Supabase is the ONLY database.

Run from backend/ with DATABASE_URL pointing at the Supabase Postgres
(service role). Idempotent: it upserts by natural keys and never drops
tables, so it is safe to re-run.

    DATABASE_URL=postgresql+asyncpg://... python seed_supabase.py
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import AsyncSessionLocal
from app.models.user import User, UserRole, UserStatus
from app.models.question import Question, TestCase
from app.models.test import Test, TestQuestion
from app.models.question_bank import QuestionBank
from app.security.hashing import hash_password

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@codearena.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

BANK_TITLE = "AI & DS Assessment Bank"


# (title, difficulty, marks, topic, statement, sample_input, sample_output, test_cases)
# test_cases: (input, expected, is_hidden)
QUESTIONS = [
    ("Two Sum", "easy", 10, "Arrays",
     "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to target. Return the answer in any order.",
     "4\n2 7 11 15\n9", "0 1",
     [("4\n2 7 11 15\n9", "0 1", False), ("3\n3 2 4\n6", "1 2", False),
      ("2\n3 3\n6", "0 1", True), ("5\n1 5 3 7 2\n8", "1 2", True)]),
    ("Reverse String", "easy", 10, "Strings",
     "Write a function that reverses a string. The input string is given as a single line. Return the reversed string.",
     "hello", "olleh",
     [("hello", "olleh", False), ("world", "dlrow", False),
      ("a", "a", True), ("abcdefghij", "jihgfedcba", True)]),
    ("Palindrome Check", "easy", 10, "Strings",
     "Given a string, determine if it is a palindrome. A palindrome reads the same forwards and backwards. Consider only alphanumeric characters and ignore cases.",
     "racecar", "true",
     [("racecar", "true", False), ("hello", "false", False),
      ("A man a plan a canal Panama", "true", True), ("abba", "true", True)]),
    ("Find Maximum Element", "easy", 10, "Arrays",
     "Given an array of integers, find the maximum element.",
     "5\n3 1 4 1 5", "5",
     [("5\n3 1 4 1 5", "5", False), ("3\n-1 -2 -3", "-1", False),
      ("1\n42", "42", True), ("6\n10 20 30 20 10 5", "30", True)]),
    ("Count Vowels", "easy", 10, "Strings",
     "Given a string, count the number of vowels (a, e, i, o, u) in it. The count is case-insensitive.",
     "Hello World", "3",
     [("Hello World", "3", False), ("aeiou", "5", False),
      ("bcdfg", "0", True), ("AEIOU Programming", "8", True)]),
    ("FizzBuzz", "easy", 10, "Arrays",
     "Given a number n, print numbers from 1 to n. For multiples of 3 print 'Fizz', for multiples of 5 print 'Buzz', for both print 'FizzBuzz'. Print each output on a new line.",
     "5", "1\n2\nFizz\n4\nBuzz",
     [("5", "1\n2\nFizz\n4\nBuzz", False),
      ("15", "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz", True)]),
    ("Sum of Digits", "easy", 10, "Recursion",
     "Given a non-negative integer, find the sum of its digits. Repeat the process until the result is a single digit.",
     "38", "2",
     [("38", "2", False), ("0", "0", False), ("123456789", "9", True)]),
    ("Remove Duplicates from Sorted Array", "easy", 10, "Two Pointers",
     "Given a sorted array of integers, remove the duplicates in-place such that each element appears only once. Print the array after removing duplicates.",
     "7\n1 1 2 2 3 3 4", "1 2 3 4",
     [("7\n1 1 2 2 3 3 4", "1 2 3 4", False), ("5\n1 2 3 4 5", "1 2 3 4 5", True),
      ("3\n1 1 1", "1", True)]),
    ("Longest Substring Without Repeating Characters", "medium", 15, "Sliding Window",
     "Given a string, find the length of the longest substring without repeating characters.",
     "abcabcbb", "3",
     [("abcabcbb", "3", False), ("bbbbb", "1", False),
      ("pwwkew", "3", True), ("abcdefg", "7", True)]),
    ("Valid Parentheses", "medium", 15, "Stack",
     "Given a string containing '(', ')', '{', '}', '[' and ']', determine if the input string is valid.",
     "()[]{}", "true",
     [("()[]{}", "true", False), ("(]", "false", False),
      ("([)]", "false", True), ("{[]}", "true", True)]),
    ("Merge Two Sorted Arrays", "medium", 15, "Sorting",
     "Given two sorted integer arrays, merge them into a single sorted array. Print the merged sorted array.",
     "3\n1 3 5\n3\n2 4 6", "1 2 3 4 5 6",
     [("3\n1 3 5\n3\n2 4 6", "1 2 3 4 5 6", False),
      ("0\n\n3\n1 2 3", "1 2 3", True),
      ("4\n1 1 2 2\n3\n1 3 3", "1 1 1 2 2 3 3", True)]),
    ("Binary Search", "medium", 15, "Searching",
     "Given a sorted array of integers and a target value, implement binary search. Return the index of the target if found, otherwise return -1.",
     "6\n-1 0 3 5 9 12\n9", "4",
     [("6\n-1 0 3 5 9 12\n9", "4", False), ("6\n-1 0 3 5 9 12\n2", "-1", False),
      ("1\n5\n5", "0", True)]),
    ("Group Anagrams", "medium", 15, "Hashing",
     "Given an array of strings, group the anagrams together. Print each group on a separate line, with words space-separated and sorted alphabetically within each group. Groups sorted by their first element.",
     "6\neat\ntea\ntan\nate\nnat\nbat", "ate eat tea\nbat\nnat tan",
     [("6\neat\ntea\ntan\nate\nnat\nbat", "ate eat tea\nbat\nnat tan", False),
      ("1\na", "a", True)]),
    ("Linked List Cycle Detection", "medium", 15, "Linked List",
     "Given a sequence of integers representing node values and an integer pos indicating where the tail connects to (0-indexed, -1 if no cycle), determine if there is a cycle. Print 'true' if there is a cycle, 'false' otherwise.",
     "4\n3 2 0 -4\n1", "true",
     [("4\n3 2 0 -4\n1", "true", False), ("1\n1\n-1", "false", True)]),
    ("Level Order Traversal", "medium", 15, "Trees",
     "Given a binary tree represented as a level-order array (using -1 for null nodes), print its level order traversal. Print each level on a new line.",
     "7\n3 9 20 -1 -1 15 7", "3\n9 20\n15 7",
     [("7\n3 9 20 -1 -1 15 7", "3\n9 20\n15 7", False), ("1\n1", "1", True)]),
    ("Maximum Subarray", "medium", 15, "Dynamic Programming",
     "Given an integer array, find the contiguous subarray (containing at least one number) which has the largest sum.",
     "9\n-2 1 -3 4 -1 2 1 -5 4", "6",
     [("9\n-2 1 -3 4 -1 2 1 -5 4", "6", False), ("1\n1", "1", True),
      ("5\n-1 -2 -3 -4 -5", "-1", True), ("3\n5 4 -1", "9", True)]),
    ("Climbing Stairs", "easy", 10, "Dynamic Programming",
     "You are climbing a staircase. It takes n steps to reach the top. Each time you can climb 1 or 2 steps. In how many distinct ways can you climb to the top?",
     "3", "3",
     [("3", "3", False), ("5", "8", True), ("1", "1", True)]),
    ("Longest Common Subsequence", "hard", 20, "Dynamic Programming",
     "Given two strings text1 and text2, return the length of their longest common subsequence.",
     "abcde\nace", "3",
     [("abcde\nace", "3", False), ("abc\nabc", "3", True),
      ("abc\ndef", "0", True), ("bsbininm\njmjkbkjkv", "1", True)]),
    ("Number of Islands", "hard", 20, "Graphs",
     "Given an m x n 2D grid map of '1's (land) and '0's (water), return the number of islands. An island is surrounded by water and formed by connecting adjacent lands horizontally or vertically.",
     "4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0", "1",
     [("4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0", "1", False),
      ("4 5\n1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1", "3", True),
      ("1 1\n0", "0", True)]),
    ("Implement Queue Using Stacks", "hard", 20, "Queue",
     "Implement a queue using two stacks. Process operations: PUSH x, POP, PEEK, EMPTY. Print output for each POP, PEEK, and EMPTY operation.",
     "6\nPUSH 1\nPUSH 2\nPEEK\nPOP\nEMPTY\nPOP", "1\n1\nfalse\n2",
     [("6\nPUSH 1\nPUSH 2\nPEEK\nPOP\nEMPTY\nPOP", "1\n1\nfalse\n2", False),
      ("3\nPUSH 5\nPOP\nEMPTY", "5\ntrue", True)]),
]


async def _upsert_admin(s: AsyncSession) -> User:
    existing = (
        await s.execute(select(User).where(User.email == ADMIN_EMAIL))
    ).scalar_one_or_none()
    if existing:
        return existing
    admin = User(
        email=ADMIN_EMAIL,
        name="Admin User",
        password_hash=hash_password(ADMIN_PASSWORD),
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
        is_active=True,
    )
    s.add(admin)
    await s.flush()
    return admin


async def _upsert_students(s: AsyncSession) -> None:
    existing = set((await s.execute(select(User.register_number))).scalars().all())
    departments = ["CSE", "ECE", "IT", "EEE", "MECH"]
    for i in range(1, 26):
        reg = f"STU{i:03d}"
        if reg in existing:
            continue
        s.add(User(
            email=f"student{i}@codearena.com",
            register_number=reg,
            name=f"Student {i}",
            password_hash=hash_password(reg.lower()),
            role=UserRole.STUDENT,
            department=departments[(i - 1) % len(departments)],
            year=((i - 1) % 4) + 1,
            section="A" if i <= 13 else "B",
            status=UserStatus.ACTIVE,
            is_active=True,
        ))


async def _upsert_bank_and_questions(s: AsyncSession) -> QuestionBank:
    bank = (
        await s.execute(select(QuestionBank).where(QuestionBank.title == BANK_TITLE))
    ).scalar_one_or_none()
    if bank is None:
        bank = QuestionBank(title=BANK_TITLE, description="AI & DS coding assessment pool", year="Second Year")
        s.add(bank)
        await s.flush()

    for title, difficulty, marks, topic, statement, sample_in, sample_out, test_cases in QUESTIONS:
        q = (
            await s.execute(select(Question).where(Question.title == title))
        ).scalar_one_or_none()
        if q is None:
            q = Question(
                title=title, statement=statement, difficulty=difficulty, marks=marks,
                topic=topic, sample_input=sample_in, sample_output=sample_out,
                explanation="", question_bank_id=bank.id,
            )
            s.add(q)
            await s.flush()
        elif q.question_bank_id is None:
            q.question_bank_id = bank.id

        for inp, expected, hidden in test_cases:
            dup = (
                await s.execute(
                    select(TestCase).where(
                        TestCase.question_id == q.id,
                        TestCase.input == inp,
                        TestCase.expected_output == expected,
                    )
                )
            ).scalar_one_or_none()
            if dup is None:
                s.add(TestCase(question_id=q.id, input=inp, expected_output=expected, is_hidden=hidden))
    return bank


async def _upsert_test(s: AsyncSession, bank: QuestionBank) -> Test:
    qids = list((await s.execute(
        select(Question.id).where(Question.question_bank_id == bank.id)
    )).scalars().all())
    if not qids:
        return None
    test = (
        await s.execute(select(Test).where(Test.name == "Coding Assessment - Round 1"))
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if test is None:
        test = Test(
            name="Coding Assessment - Round 1",
            description="Department coding assessment covering data structures and algorithms.",
            year="Second Year",
            question_bank_id=bank.id,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=23),
            duration_minutes=60,
            total_marks=60,
            questions_per_student=5,
            easy_count=2,
            medium_count=2,
            hard_count=1,
            allowed_languages=["python", "java", "c", "cpp"],
            max_violations=3,
            allow_copy_paste=False,
            scoring_type="partial",
            show_results=False,
        )
        s.add(test)
        await s.flush()
    else:
        test.question_bank_id = bank.id

    linked = set((await s.execute(
        select(TestQuestion.question_id).where(TestQuestion.test_id == test.id)
    )).scalars().all())
    for qid in qids:
        if qid not in linked:
            s.add(TestQuestion(test_id=test.id, question_id=qid))
    return test


async def seed():
    async with AsyncSessionLocal() as s:
        await _upsert_admin(s)
        await _upsert_students(s)
        bank = await _upsert_bank_and_questions(s)
        await _upsert_test(s, bank)
        await s.commit()

    print("[SUCCESS] Supabase seed complete.")
    print(f"  Admin:    {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    print("  Students: STU001-STU025 (password = register number, lowercase)")
    print(f"  Bank:     {BANK_TITLE} ({len(QUESTIONS)} questions)")


if __name__ == "__main__":
    asyncio.run(seed())
