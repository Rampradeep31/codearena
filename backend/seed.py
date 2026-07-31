"""
Seed script: Creates demo data for CodeArena development.
Run: python seed.py
"""
import asyncio
from datetime import datetime, timedelta, timezone
from app.database.connection import AsyncSessionLocal, create_tables, drop_tables
from app.models.user import User, UserRole, UserStatus
from app.models.question import Question, TestCase
from app.models.test import Test, TestQuestion
from app.security.hashing import hash_password


QUESTIONS_DATA = [
    {
        "title": "Two Sum",
        "statement": "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nReturn the answer in any order.",
        "difficulty": "easy", "marks": 10, "topic": "Arrays",
        "input_format": "First line: n (size of array)\nSecond line: n space-separated integers\nThird line: target integer",
        "output_format": "Two space-separated indices (0-indexed)",
        "constraints": "2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9",
        "sample_input": "4\n2 7 11 15\n9", "sample_output": "0 1",
        "explanation": "nums[0] + nums[1] = 2 + 7 = 9, so we return [0, 1].",
        "test_cases": [
            {"input": "4\n2 7 11 15\n9", "expected_output": "0 1", "is_hidden": False},
            {"input": "3\n3 2 4\n6", "expected_output": "1 2", "is_hidden": False},
            {"input": "2\n3 3\n6", "expected_output": "0 1", "is_hidden": True},
            {"input": "5\n1 5 3 7 2\n8", "expected_output": "1 2", "is_hidden": True},  
        ],
    },
    {
        "title": "Reverse String",
        "statement": "Write a function that reverses a string. The input string is given as a single line.\n\nReturn the reversed string.",
        "difficulty": "easy", "marks": 10, "topic": "Strings",
        "input_format": "A single string", "output_format": "The reversed string",
        "constraints": "1 <= s.length <= 10^5\ns consists of printable ASCII characters.",
        "sample_input": "hello", "sample_output": "olleh",
        "explanation": "The reverse of 'hello' is 'olleh'.",
        "test_cases": [
            {"input": "hello", "expected_output": "olleh", "is_hidden": False},
            {"input": "world", "expected_output": "dlrow", "is_hidden": False},
            {"input": "a", "expected_output": "a", "is_hidden": True},
            {"input": "abcdefghij", "expected_output": "jihgfedcba", "is_hidden": True},
        ],
    },
    {
        "title": "Palindrome Check",
        "statement": "Given a string, determine if it is a palindrome.\n\nA palindrome is a string that reads the same forwards and backwards.\n\nConsider only alphanumeric characters and ignore cases.",
        "difficulty": "easy", "marks": 10, "topic": "Strings",
        "input_format": "A single string", "output_format": "true or false",
        "constraints": "1 <= s.length <= 2 * 10^5\ns consists of printable ASCII characters.",
        "sample_input": "racecar", "sample_output": "true",
        "explanation": "'racecar' reads the same forwards and backwards.",
        "test_cases": [
            {"input": "racecar", "expected_output": "true", "is_hidden": False},
            {"input": "hello", "expected_output": "false", "is_hidden": False},
            {"input": "A man a plan a canal Panama", "expected_output": "true", "is_hidden": True},
            {"input": "abba", "expected_output": "true", "is_hidden": True},
        ],
    },
    {
        "title": "Find Maximum Element",
        "statement": "Given an array of integers, find the maximum element.\n\nReturn the maximum value.",
        "difficulty": "easy", "marks": 10, "topic": "Arrays",
        "input_format": "First line: n (size of array)\nSecond line: n space-separated integers",
        "output_format": "A single integer (the maximum element)",
        "constraints": "1 <= n <= 10^5\n-10^9 <= arr[i] <= 10^9",
        "sample_input": "5\n3 1 4 1 5", "sample_output": "5",
        "explanation": "The maximum element in the array [3, 1, 4, 1, 5] is 5.",
        "test_cases": [
            {"input": "5\n3 1 4 1 5", "expected_output": "5", "is_hidden": False},
            {"input": "3\n-1 -2 -3", "expected_output": "-1", "is_hidden": False},
            {"input": "1\n42", "expected_output": "42", "is_hidden": True},
            {"input": "6\n10 20 30 20 10 5", "expected_output": "30", "is_hidden": True},
        ],
    },
    {
        "title": "Count Vowels",
        "statement": "Given a string, count the number of vowels (a, e, i, o, u) in it.\n\nThe count should be case-insensitive.",
        "difficulty": "easy", "marks": 10, "topic": "Strings",
        "input_format": "A single string", "output_format": "A single integer",
        "constraints": "1 <= s.length <= 10^5",
        "sample_input": "Hello World", "sample_output": "3",
        "explanation": "The vowels in 'Hello World' are e, o, o = 3 vowels.",
        "test_cases": [
            {"input": "Hello World", "expected_output": "3", "is_hidden": False},
            {"input": "aeiou", "expected_output": "5", "is_hidden": False},
            {"input": "bcdfg", "expected_output": "0", "is_hidden": True},
            {"input": "AEIOU Programming", "expected_output": "8", "is_hidden": True},
        ],
    },
    {
        "title": "FizzBuzz",
        "statement": "Given a number n, print numbers from 1 to n.\n\nFor multiples of 3, print 'Fizz' instead.\nFor multiples of 5, print 'Buzz' instead.\nFor multiples of both 3 and 5, print 'FizzBuzz'.\n\nPrint each output on a new line.",
        "difficulty": "easy", "marks": 10, "topic": "Arrays",
        "input_format": "A single integer n", "output_format": "n lines of output",
        "constraints": "1 <= n <= 10^4",
        "sample_input": "5", "sample_output": "1\n2\nFizz\n4\nBuzz",
        "explanation": "1->1, 2->2, 3->Fizz, 4->4, 5->Buzz",
        "test_cases": [
            {"input": "5", "expected_output": "1\n2\nFizz\n4\nBuzz", "is_hidden": False},
            {"input": "15", "expected_output": "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz", "is_hidden": True},
        ],
    },
    {
        "title": "Sum of Digits",
        "statement": "Given a non-negative integer, find the sum of its digits.\n\nRepeat the process until the result is a single digit.",
        "difficulty": "easy", "marks": 10, "topic": "Recursion",
        "input_format": "A single non-negative integer", "output_format": "A single digit",
        "constraints": "0 <= num <= 2^31 - 1",
        "sample_input": "38", "sample_output": "2",
        "explanation": "3 + 8 = 11, 1 + 1 = 2. Since 2 is a single digit, return 2.",
        "test_cases": [
            {"input": "38", "expected_output": "2", "is_hidden": False},
            {"input": "0", "expected_output": "0", "is_hidden": False},
            {"input": "123456789", "expected_output": "9", "is_hidden": True},
        ],
    },
    {
        "title": "Remove Duplicates from Sorted Array",
        "statement": "Given a sorted array of integers, remove the duplicates in-place such that each element appears only once.\n\nPrint the array after removing duplicates.",
        "difficulty": "easy", "marks": 10, "topic": "Two Pointers",
        "input_format": "First line: n\nSecond line: n sorted space-separated integers",
        "output_format": "Space-separated unique elements",
        "constraints": "1 <= n <= 3 * 10^4\n-100 <= nums[i] <= 100",
        "sample_input": "7\n1 1 2 2 3 3 4", "sample_output": "1 2 3 4",
        "explanation": "After removing duplicates: [1, 2, 3, 4].",
        "test_cases": [
            {"input": "7\n1 1 2 2 3 3 4", "expected_output": "1 2 3 4", "is_hidden": False},
            {"input": "5\n1 2 3 4 5", "expected_output": "1 2 3 4 5", "is_hidden": True},
            {"input": "3\n1 1 1", "expected_output": "1", "is_hidden": True},
        ],
    },
    {
        "title": "Longest Substring Without Repeating Characters",
        "statement": "Given a string, find the length of the longest substring without repeating characters.",
        "difficulty": "medium", "marks": 15, "topic": "Sliding Window",
        "input_format": "A single string", "output_format": "A single integer",
        "constraints": "0 <= s.length <= 5 * 10^4\ns consists of English letters, digits, symbols and spaces.",
        "sample_input": "abcabcbb", "sample_output": "3",
        "explanation": "The answer is 'abc', with the length of 3.",
        "test_cases": [
            {"input": "abcabcbb", "expected_output": "3", "is_hidden": False},
            {"input": "bbbbb", "expected_output": "1", "is_hidden": False},
            {"input": "pwwkew", "expected_output": "3", "is_hidden": True},
            {"input": "abcdefg", "expected_output": "7", "is_hidden": True},
        ],
    },
    {
        "title": "Valid Parentheses",
        "statement": "Given a string containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket.",
        "difficulty": "medium", "marks": 15, "topic": "Stack",
        "input_format": "A single string of brackets", "output_format": "true or false",
        "constraints": "1 <= s.length <= 10^4",
        "sample_input": "()[]{}", "sample_output": "true",
        "explanation": "All brackets are properly matched and ordered.",
        "test_cases": [
            {"input": "()[]{}", "expected_output": "true", "is_hidden": False},
            {"input": "(]", "expected_output": "false", "is_hidden": False},
            {"input": "([)]", "expected_output": "false", "is_hidden": True},
            {"input": "{[]}", "expected_output": "true", "is_hidden": True},
        ],
    },
    {
        "title": "Merge Two Sorted Arrays",
        "statement": "Given two sorted integer arrays, merge them into a single sorted array.\n\nPrint the merged sorted array.",
        "difficulty": "medium", "marks": 15, "topic": "Sorting",
        "input_format": "First line: n (size of first array)\nSecond line: n sorted integers\nThird line: m (size of second array)\nFourth line: m sorted integers",
        "output_format": "Space-separated merged sorted array",
        "constraints": "0 <= n, m <= 10^4",
        "sample_input": "3\n1 3 5\n3\n2 4 6", "sample_output": "1 2 3 4 5 6",
        "explanation": "Merging [1,3,5] and [2,4,6] gives [1,2,3,4,5,6].",
        "test_cases": [
            {"input": "3\n1 3 5\n3\n2 4 6", "expected_output": "1 2 3 4 5 6", "is_hidden": False},
            {"input": "0\n\n3\n1 2 3", "expected_output": "1 2 3", "is_hidden": True},
            {"input": "4\n1 1 2 2\n3\n1 3 3", "expected_output": "1 1 1 2 2 3 3", "is_hidden": True},
        ],
    },
    {
        "title": "Binary Search",
        "statement": "Given a sorted array of integers and a target value, implement binary search.\n\nReturn the index of the target if found, otherwise return -1.",
        "difficulty": "medium", "marks": 15, "topic": "Searching",
        "input_format": "First line: n\nSecond line: n sorted integers\nThird line: target",
        "output_format": "Index of target or -1",
        "constraints": "1 <= n <= 10^4\n-10^9 <= nums[i] <= 10^9",
        "sample_input": "6\n-1 0 3 5 9 12\n9", "sample_output": "4",
        "explanation": "9 exists at index 4.",
        "test_cases": [
            {"input": "6\n-1 0 3 5 9 12\n9", "expected_output": "4", "is_hidden": False},
            {"input": "6\n-1 0 3 5 9 12\n2", "expected_output": "-1", "is_hidden": False},
            {"input": "1\n5\n5", "expected_output": "0", "is_hidden": True},
        ],
    },
    {
        "title": "Group Anagrams",
        "statement": "Given an array of strings, group the anagrams together. You can return the answer in any order.\n\nAn Anagram is a word formed by rearranging the letters of a different word, using all original letters exactly once.\n\nPrint each group on a separate line, with words space-separated and sorted alphabetically within each group. Groups should be sorted by their first element.",
        "difficulty": "medium", "marks": 15, "topic": "Hashing",
        "input_format": "First line: n\nNext n lines: one string per line",
        "output_format": "Groups of anagrams, one group per line",
        "constraints": "1 <= n <= 10^4\n0 <= strs[i].length <= 100\nstrs[i] consists of lowercase English letters.",
        "sample_input": "6\neat\ntea\ntan\nate\nnat\nbat", "sample_output": "ate eat tea\nbat\nnat tan",
        "explanation": "Groups: ['ate','eat','tea'], ['bat'], ['nat','tan']",
        "test_cases": [
            {"input": "6\neat\ntea\ntan\nate\nnat\nbat", "expected_output": "ate eat tea\nbat\nnat tan", "is_hidden": False},
            {"input": "1\na", "expected_output": "a", "is_hidden": True},
        ],
    },
    {
        "title": "Linked List Cycle Detection",
        "statement": "Given a sequence of integers representing node values and an integer pos indicating where the tail connects to (0-indexed, -1 if no cycle), determine if there is a cycle.\n\nPrint 'true' if there is a cycle, 'false' otherwise.\n\nNote: Implement using Floyd's cycle detection algorithm concept.",
        "difficulty": "medium", "marks": 15, "topic": "Linked List",
        "input_format": "First line: n (number of nodes)\nSecond line: n space-separated values\nThird line: pos (-1 if no cycle)",
        "output_format": "true or false",
        "constraints": "0 <= n <= 10^4\n-10^5 <= Node.val <= 10^5\n-1 <= pos < n",
        "sample_input": "4\n3 2 0 -4\n1", "sample_output": "true",
        "explanation": "Tail connects to index 1, creating a cycle.",
        "test_cases": [
            {"input": "4\n3 2 0 -4\n1", "expected_output": "true", "is_hidden": False},
            {"input": "1\n1\n-1", "expected_output": "false", "is_hidden": True},
        ],
    },
    {
        "title": "Level Order Traversal",
        "statement": "Given a binary tree represented as a level-order array (using -1 for null nodes), print its level order traversal.\n\nPrint each level on a new line with space-separated values.",
        "difficulty": "medium", "marks": 15, "topic": "Trees",
        "input_format": "First line: n (number of elements including nulls)\nSecond line: n space-separated integers (-1 for null)",
        "output_format": "Each level on a new line",
        "constraints": "0 <= n <= 2000",
        "sample_input": "7\n3 9 20 -1 -1 15 7", "sample_output": "3\n9 20\n15 7",
        "explanation": "Level 0: [3], Level 1: [9, 20], Level 2: [15, 7]",
        "test_cases": [
            {"input": "7\n3 9 20 -1 -1 15 7", "expected_output": "3\n9 20\n15 7", "is_hidden": False},
            {"input": "1\n1", "expected_output": "1", "is_hidden": True},
        ],
    },
    {
        "title": "Maximum Subarray (Kadane's Algorithm)",
        "statement": "Given an integer array, find the contiguous subarray (containing at least one number) which has the largest sum.\n\nReturn that sum.",
        "difficulty": "medium", "marks": 15, "topic": "Dynamic Programming",
        "input_format": "First line: n\nSecond line: n space-separated integers",
        "output_format": "A single integer",
        "constraints": "1 <= n <= 10^5\n-10^4 <= nums[i] <= 10^4",
        "sample_input": "9\n-2 1 -3 4 -1 2 1 -5 4", "sample_output": "6",
        "explanation": "The subarray [4, -1, 2, 1] has the largest sum = 6.",
        "test_cases": [
            {"input": "9\n-2 1 -3 4 -1 2 1 -5 4", "expected_output": "6", "is_hidden": False},
            {"input": "1\n1", "expected_output": "1", "is_hidden": True},
            {"input": "5\n-1 -2 -3 -4 -5", "expected_output": "-1", "is_hidden": True},
            {"input": "3\n5 4 -1", "expected_output": "9", "is_hidden": True},
        ],
    },
    {
        "title": "Climbing Stairs",
        "statement": "You are climbing a staircase. It takes n steps to reach the top.\n\nEach time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?",
        "difficulty": "easy", "marks": 10, "topic": "Dynamic Programming",
        "input_format": "A single integer n", "output_format": "A single integer",
        "constraints": "1 <= n <= 45",
        "sample_input": "3", "sample_output": "3",
        "explanation": "Three ways: 1+1+1, 1+2, 2+1.",
        "test_cases": [
            {"input": "3", "expected_output": "3", "is_hidden": False},
            {"input": "5", "expected_output": "8", "is_hidden": True},
            {"input": "1", "expected_output": "1", "is_hidden": True},
        ],
    },
    {
        "title": "Longest Common Subsequence",
        "statement": "Given two strings text1 and text2, return the length of their longest common subsequence.\n\nA subsequence of a string is a new string generated from the original string with some characters (can be none) deleted without changing the relative order of the remaining characters.",
        "difficulty": "hard", "marks": 20, "topic": "Dynamic Programming",
        "input_format": "First line: text1\nSecond line: text2",
        "output_format": "A single integer",
        "constraints": "1 <= text1.length, text2.length <= 1000",
        "sample_input": "abcde\nace", "sample_output": "3",
        "explanation": "The longest common subsequence is 'ace' with length 3.",
        "test_cases": [
            {"input": "abcde\nace", "expected_output": "3", "is_hidden": False},
            {"input": "abc\nabc", "expected_output": "3", "is_hidden": True},
            {"input": "abc\ndef", "expected_output": "0", "is_hidden": True},
            {"input": "bsbininm\njmjkbkjkv", "expected_output": "1", "is_hidden": True},
        ],
    },
    {
        "title": "Number of Islands (BFS/DFS)",
        "statement": "Given an m x n 2D grid map of '1's (land) and '0's (water), return the number of islands.\n\nAn island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically.",
        "difficulty": "hard", "marks": 20, "topic": "Graphs",
        "input_format": "First line: m n\nNext m lines: n space-separated characters (0 or 1)",
        "output_format": "A single integer",
        "constraints": "m == grid.length\nn == grid[i].length\n1 <= m, n <= 300\ngrid[i][j] is '0' or '1'.",
        "sample_input": "4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0", "sample_output": "1",
        "explanation": "All 1s are connected, forming one island.",
        "test_cases": [
            {"input": "4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0", "expected_output": "1", "is_hidden": False},
            {"input": "4 5\n1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1", "expected_output": "3", "is_hidden": True},
            {"input": "1 1\n0", "expected_output": "0", "is_hidden": True},
        ],
    },
    {
        "title": "Implement Queue Using Stacks",
        "statement": "Implement a queue using two stacks. Process a series of operations:\n- PUSH x: Enqueue x\n- POP: Dequeue and print the front element\n- PEEK: Print the front element without removing\n- EMPTY: Print true/false if queue is empty",
        "difficulty": "hard", "marks": 20, "topic": "Queue",
        "input_format": "First line: n (number of operations)\nNext n lines: one operation per line",
        "output_format": "Output for each POP, PEEK, and EMPTY operation on separate lines",
        "constraints": "1 <= n <= 100\n1 <= x <= 9",
        "sample_input": "6\nPUSH 1\nPUSH 2\nPEEK\nPOP\nEMPTY\nPOP", "sample_output": "1\n1\nfalse\n2",
        "explanation": "After PUSH 1, PUSH 2: queue is [1,2]. PEEK returns 1. POP returns 1. Queue is [2], not empty. POP returns 2.",
        "test_cases": [
            {"input": "6\nPUSH 1\nPUSH 2\nPEEK\nPOP\nEMPTY\nPOP", "expected_output": "1\n1\nfalse\n2", "is_hidden": False},
            {"input": "3\nPUSH 5\nPOP\nEMPTY", "expected_output": "5\ntrue", "is_hidden": True},
        ],
    },
]


async def seed():
    """Seed database with demo data."""
    await drop_tables()
    await create_tables()

    async with AsyncSessionLocal() as session:
        # 1. Create Admin
        admin = User(
            email="admin@codearena.com",
            name="Admin User",
            password_hash=hash_password("admin123"),
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
            is_active=True,
        )
        session.add(admin)

        # 2. Create Students
        departments = ["CSE", "ECE", "IT", "EEE", "MECH"]
        students = []
        for i in range(1, 26):
            dept = departments[(i - 1) % len(departments)]
            year = ((i - 1) % 4) + 1
            section = "A" if i <= 13 else "B"
            reg = f"STU{i:03d}"

            student = User(
                email=f"student{i}@codearena.com",
                register_number=reg,
                name=f"Student {i}",
                password_hash=hash_password(reg.lower()),
                role=UserRole.STUDENT,
                department=dept,
                year=year,
                section=section,
                status=UserStatus.ACTIVE,
                is_active=True,
            )
            session.add(student)
            students.append(student)

        await session.flush()

        # 3. Create Questions
        question_ids = []
        for qdata in QUESTIONS_DATA:
            q = Question(
                title=qdata["title"],
                statement=qdata["statement"],
                difficulty=qdata["difficulty"],
                marks=qdata["marks"],
                topic=qdata["topic"],
                input_format=qdata.get("input_format"),
                output_format=qdata.get("output_format"),
                constraints=qdata.get("constraints"),
                sample_input=qdata.get("sample_input"),
                sample_output=qdata.get("sample_output"),
                explanation=qdata.get("explanation"),
            )
            session.add(q)
            await session.flush()
            await session.refresh(q)
            question_ids.append(q.id)

            for tc in qdata.get("test_cases", []):
                session.add(TestCase(
                    question_id=q.id,
                    input=tc["input"],
                    expected_output=tc["expected_output"],
                    is_hidden=tc["is_hidden"],
                ))

        await session.flush()

        # 4. Create Active Test
        now = datetime.now(timezone.utc)
        test = Test(
            name="Coding Assessment - Round 1",
            description="Department coding assessment covering data structures and algorithms. Good luck!",
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
        session.add(test)
        await session.flush()
        await session.refresh(test)

        # Add all questions to pool
        for qid in question_ids:
            session.add(TestQuestion(test_id=test.id, question_id=qid))

        await session.commit()

    print("[SUCCESS] Seed data created successfully!")
    print()
    print("-" * 40)
    print("  Admin Login:")
    print("    Email:    admin@codearena.com")
    print("    Password: admin123")
    print()
    print("  Student Login (example):")
    print("    Register: STU001")
    print("    Password: stu001")
    print()
    print(f"  Students:  25 created (STU001-STU025)")
    print(f"  Questions: {len(QUESTIONS_DATA)} created")
    print(f"  Test:      'Coding Assessment - Round 1' (active)")
    print("-" * 40)


if __name__ == "__main__":
    asyncio.run(seed())
