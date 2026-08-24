import psycopg2
import json
import datetime

DATABASE_URL = "postgresql://postgres.fvowlpdmgehizyuvoxgw:quantix%402026@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require"

# List of 28 modified LeetCode problems
PROBLEMS = [
    {
        "title": "Nearest Exit from Entrance in Maze",
        "leetcode": 1926,
        "difficulty": "medium",
        "topic": "Graph / BFS",
        "marks": 10,
        "statement": "You are given an m x n matrix maze (0-indexed) with empty cells (represented as '.') and walls (represented as '+'). You are also given the entrance of the maze, where entrance = [start_row, start_col] denotes the empty cell that you start from.\n\nIn one step, you can move up, down, left, or right to another empty cell. You cannot step into a cell with a wall, and you cannot step outside the maze. Your goal is to find the nearest exit from the entrance. An exit is defined as an empty cell that is at the border of the maze and is not the entrance itself.\n\nReturn the number of steps in the shortest path from the entrance to the nearest exit, or -1 if no such path exists.",
        "input_format": "First line contains two integers m and n.\nNext m lines each contain a string of length n representing the maze row.\nLast line contains two integers: start_row start_col.",
        "output_format": "Print the minimum number of steps to reach an exit, or -1 if no exit is reachable.",
        "constraints": "1 <= m, n <= 100\nmaze[i][j] is either '.' or '+'\nentrance is at an empty cell.",
        "sample_input": "3 4\n+.++\n...+\n+++.\n1 2",
        "sample_output": "1",
        "explanation": "Moving down from (1, 2) reaches (2, 2) which is not border, but from (1,2) moving up is (0,1)? (1,2) -> (1,1) -> (0,1) exit. Or moving right to (1,3) is wall, up is border '+', down is '+' at (2,2)? Wait, maze at (1,2) can step to (2,3) if empty. In sample: step from (1,2) to (0,1) is 2 steps.",
        "test_cases": [
            {"input": "3 4\n+.++\n...+\n+++.\n1 2", "expected_output": "1", "is_hidden": False},
            {"input": "3 3\n+++\n...\n+++\n1 0", "expected_output": "2", "is_hidden": False},
            {"input": "1 2\n.default_api.\n0 0", "expected_output": "-1", "is_hidden": True},
            {"input": "3 3\n++.\n.++\n++.\n0 2", "expected_output": "-1", "is_hidden": True}
        ]
    },
    {
        "title": "Count Square Sum Triples",
        "leetcode": 1925,
        "difficulty": "easy",
        "topic": "Math",
        "marks": 10,
        "statement": "A square triple (a,b,c) is a triple of positive integers such that a^2 + b^2 = c^2.\n\nGiven an integer n, return the number of square triples such that 1 <= a, b, c <= n.",
        "input_format": "A single integer n.",
        "output_format": "Print the count of valid square triples (a, b, c).",
        "constraints": "1 <= n <= 250",
        "sample_input": "5",
        "sample_output": "2",
        "explanation": "The square triples are (3,4,5) and (4,3,5) since 3^2 + 4^2 = 5^2.",
        "test_cases": [
            {"input": "5", "expected_output": "2", "is_hidden": False},
            {"input": "10", "expected_output": "4", "is_hidden": False},
            {"input": "1", "expected_output": "0", "is_hidden": True},
            {"input": "25", "expected_output": "16", "is_hidden": True}
        ]
    },
    {
        "title": "Find Unique Binary String",
        "leetcode": 1980,
        "difficulty": "medium",
        "topic": "String / Cantor",
        "marks": 10,
        "statement": "Given an array of strings nums containing n unique binary strings each of length n, return a binary string of length n that does not appear in nums. If there are multiple answers, you may return any of them.",
        "input_format": "First line contains an integer n.\nSecond line contains n space-separated binary strings each of length n.",
        "output_format": "Print a binary string of length n not present in the input array.",
        "constraints": "n == nums.length\n1 <= n <= 16\nnums[i].length == n\nnums[i] consists of only '0' or '1'.",
        "sample_input": "3\n011 001 000",
        "sample_output": "110",
        "explanation": "\"110\" does not appear in nums.",
        "test_cases": [
            {"input": "2\n01 10", "expected_output": "11", "is_hidden": False},
            {"input": "3\n000 001 010", "expected_output": "111", "is_hidden": False},
            {"input": "1\n0", "expected_output": "1", "is_hidden": True},
            {"input": "1\n1", "expected_output": "0", "is_hidden": True}
        ]
    },
    {
        "title": "Plus One",
        "leetcode": 66,
        "difficulty": "easy",
        "topic": "Arrays / Math",
        "marks": 10,
        "statement": "You are given a large integer represented as an integer array digits, where each digits[i] is the ith digit of the integer. The digits are ordered from most significant to least significant in left-to-right order. The large integer does not contain any leading 0's.\n\nIncrement the large integer by one and return the resulting array of digits.",
        "input_format": "First line contains integer n (number of digits).\nSecond line contains n space-separated integers representing the digits.",
        "output_format": "Print the resulting digits separated by space.",
        "constraints": "1 <= digits.length <= 100\n0 <= digits[i] <= 9",
        "sample_input": "3\n1 2 3",
        "sample_output": "1 2 4",
        "explanation": "123 + 1 = 124.",
        "test_cases": [
            {"input": "3\n1 2 3", "expected_output": "1 2 4", "is_hidden": False},
            {"input": "4\n4 3 2 1", "expected_output": "4 3 2 2", "is_hidden": False},
            {"input": "1\n9", "expected_output": "1 0", "is_hidden": True},
            {"input": "3\n9 9 9", "expected_output": "1 0 0 0", "is_hidden": True}
        ]
    },
    {
        "title": "Max Consecutive Ones",
        "leetcode": 485,
        "difficulty": "easy",
        "topic": "Arrays",
        "marks": 10,
        "statement": "Given a binary array nums, return the maximum number of consecutive 1's in the array.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated binary integers (0 or 1).",
        "output_format": "Print the maximum count of consecutive 1s.",
        "constraints": "1 <= nums.length <= 10^5\nnums[i] is either 0 or 1.",
        "sample_input": "6\n1 1 0 1 1 1",
        "sample_output": "3",
        "explanation": "The first two digits or the last three digits are consecutive 1s. The maximum number of consecutive 1s is 3.",
        "test_cases": [
            {"input": "6\n1 1 0 1 1 1", "expected_output": "3", "is_hidden": False},
            {"input": "6\n1 0 1 1 0 1", "expected_output": "2", "is_hidden": False},
            {"input": "5\n0 0 0 0 0", "expected_output": "0", "is_hidden": True},
            {"input": "4\n1 1 1 1", "expected_output": "4", "is_hidden": True}
        ]
    },
    {
        "title": "Single Number",
        "leetcode": 136,
        "difficulty": "easy",
        "topic": "Bit Manipulation",
        "marks": 10,
        "statement": "Given a non-empty array of integers nums, every element appears twice except for one. Find that single one.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.",
        "output_format": "Print the single number that appears only once.",
        "constraints": "1 <= nums.length <= 3 * 10^4\n-3 * 10^4 <= nums[i] <= 3 * 10^4",
        "sample_input": "3\n2 2 1",
        "sample_output": "1",
        "explanation": "2 appears twice, 1 appears once.",
        "test_cases": [
            {"input": "3\n2 2 1", "expected_output": "1", "is_hidden": False},
            {"input": "5\n4 1 2 1 2", "expected_output": "4", "is_hidden": False},
            {"input": "1\n1", "expected_output": "1", "is_hidden": True},
            {"input": "7\n-1 -1 -2 -2 5 3 3", "expected_output": "5", "is_hidden": True}
        ]
    },
    {
        "title": "Remove Element",
        "leetcode": 27,
        "difficulty": "easy",
        "topic": "Arrays",
        "marks": 10,
        "statement": "Given an integer array nums and an integer val, remove all occurrences of val in nums in-place. Return the number of elements in nums which are not equal to val, followed by the remaining elements.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.\nThird line contains integer val.",
        "output_format": "First line: count k of elements not equal to val.\nSecond line: the k elements separated by spaces (order preserved).",
        "constraints": "0 <= nums.length <= 100\n0 <= nums[i] <= 50\n0 <= val <= 100",
        "sample_input": "4\n3 2 2 3\n3",
        "sample_output": "2\n2 2",
        "explanation": "3 is removed, leaving two 2s.",
        "test_cases": [
            {"input": "4\n3 2 2 3\n3", "expected_output": "2\n2 2", "is_hidden": False},
            {"input": "8\n0 1 2 2 3 0 4 2\n2", "expected_output": "5\n0 1 3 0 4", "is_hidden": False},
            {"input": "1\n1\n1", "expected_output": "0\n", "is_hidden": True}
        ]
    },
    {
        "title": "Palindrome Number",
        "leetcode": 9,
        "difficulty": "easy",
        "topic": "Math",
        "marks": 10,
        "statement": "Given an integer x, return true if x is a palindrome, and false otherwise.",
        "input_format": "A single integer x.",
        "output_format": "Print true if x is a palindrome, false otherwise.",
        "constraints": "-2^31 <= x <= 2^31 - 1",
        "sample_input": "121",
        "sample_output": "true",
        "explanation": "121 reads as 121 from left to right and from right to left.",
        "test_cases": [
            {"input": "121", "expected_output": "true", "is_hidden": False},
            {"input": "-121", "expected_output": "false", "is_hidden": False},
            {"input": "10", "expected_output": "false", "is_hidden": True},
            {"input": "0", "expected_output": "true", "is_hidden": True}
        ]
    },
    {
        "title": "Search Insert Position",
        "leetcode": 35,
        "difficulty": "easy",
        "topic": "Binary Search",
        "marks": 10,
        "statement": "Given a sorted array of distinct integers and a target value, return the index if the target is found. If not, return the index where it would be if it were inserted in order.\n\nYou must write an algorithm with O(log n) runtime complexity.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated sorted integers.\nThird line contains integer target.",
        "output_format": "Print the 0-based insert index.",
        "constraints": "1 <= nums.length <= 10^4\n-10^4 <= nums[i] <= 10^4\nnums contains distinct values sorted in ascending order.",
        "sample_input": "4\n1 3 5 6\n5",
        "sample_output": "2",
        "explanation": "5 is at index 2.",
        "test_cases": [
            {"input": "4\n1 3 5 6\n5", "expected_output": "2", "is_hidden": False},
            {"input": "4\n1 3 5 6\n2", "expected_output": "1", "is_hidden": False},
            {"input": "4\n1 3 5 6\n7", "expected_output": "4", "is_hidden": True},
            {"input": "4\n1 3 5 6\n0", "expected_output": "0", "is_hidden": True}
        ]
    },
    {
        "title": "Element Appearing More Than 25% In Sorted Array",
        "leetcode": 1287,
        "difficulty": "easy",
        "topic": "Arrays / Binary Search",
        "marks": 10,
        "statement": "Given an integer array sorted in non-decreasing order, there is exactly one integer in the array that occurs more than 25% of the time, find that integer.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers in non-decreasing order.",
        "output_format": "Print the integer that appears > 25% of the time.",
        "constraints": "1 <= arr.length <= 10^4\n0 <= arr[i] <= 10^5",
        "sample_input": "9\n1 2 2 6 6 6 6 7 10",
        "sample_output": "6",
        "explanation": "The value 6 appears 4 times in array of size 9 (4/9 > 25%).",
        "test_cases": [
            {"input": "9\n1 2 2 6 6 6 6 7 10", "expected_output": "6", "is_hidden": False},
            {"input": "1\n1", "expected_output": "1", "is_hidden": False},
            {"input": "4\n1 1 2 2", "expected_output": "1", "is_hidden": True},
            {"input": "5\n1 2 3 3 3", "expected_output": "3", "is_hidden": True}
        ]
    },
    {
        "title": "Build Array from Permutation",
        "leetcode": 1920,
        "difficulty": "easy",
        "topic": "Arrays",
        "marks": 10,
        "statement": "Given a zero-based permutation nums (0-indexed), build an array ans of the same length where ans[i] = nums[nums[i]] for each 0 <= i < nums.length and return it.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers (a permutation of 0 to n-1).",
        "output_format": "Print the resulting array elements separated by space.",
        "constraints": "1 <= nums.length <= 1000\n0 <= nums[i] < nums.length",
        "sample_input": "6\n0 2 1 5 3 4",
        "sample_output": "0 1 2 4 5 3",
        "explanation": "ans = [nums[0], nums[2], nums[1], nums[5], nums[3], nums[4]] = [0, 1, 2, 4, 5, 3].",
        "test_cases": [
            {"input": "6\n0 2 1 5 3 4", "expected_output": "0 1 2 4 5 3", "is_hidden": False},
            {"input": "6\n5 0 1 2 3 4", "expected_output": "4 5 0 1 2 3", "is_hidden": False},
            {"input": "1\n0", "expected_output": "0", "is_hidden": True}
        ]
    },
    {
        "title": "Single Element in a Sorted Array",
        "leetcode": 540,
        "difficulty": "medium",
        "topic": "Binary Search",
        "marks": 10,
        "statement": "You are given a sorted array consisting of only integers where every element appears exactly twice, except for one element which appears exactly once. Return the single element that appears only once.\n\nYour solution must run in O(log n) time and O(1) space.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated sorted integers.",
        "output_format": "Print the single unique element.",
        "constraints": "1 <= nums.length <= 10^5\n0 <= nums[i] <= 10^5",
        "sample_input": "9\n1 1 2 3 3 4 4 8 8",
        "sample_output": "2",
        "explanation": "2 appears only once.",
        "test_cases": [
            {"input": "9\n1 1 2 3 3 4 4 8 8", "expected_output": "2", "is_hidden": False},
            {"input": "7\n3 3 7 7 10 11 11", "expected_output": "10", "is_hidden": False},
            {"input": "1\n1", "expected_output": "1", "is_hidden": True}
        ]
    },
    {
        "title": "Intersection of Two Arrays II",
        "leetcode": 350,
        "difficulty": "easy",
        "topic": "Arrays / Hash Table",
        "marks": 10,
        "statement": "Given two integer arrays nums1 and nums2, return an array of their intersection. Each element in the result must appear as many times as it shows in both arrays, sorted in ascending order.",
        "input_format": "First line contains integer n (size of nums1).\nSecond line contains n space-separated integers.\nThird line contains integer m (size of nums2).\nFourth line contains m space-separated integers.",
        "output_format": "Print the intersection elements sorted in ascending order separated by space.",
        "constraints": "1 <= nums1.length, nums2.length <= 1000\n0 <= nums1[i], nums2[i] <= 1000",
        "sample_input": "4\n1 2 2 1\n2\n2 2",
        "sample_output": "2 2",
        "explanation": "Both arrays share two 2s.",
        "test_cases": [
            {"input": "4\n1 2 2 1\n2\n2 2", "expected_output": "2 2", "is_hidden": False},
            {"input": "3\n4 9 5\n5\n9 4 9 8 4", "expected_output": "4 9", "is_hidden": False},
            {"input": "2\n1 2\n2\n3 4", "expected_output": "", "is_hidden": True}
        ]
    },
    {
        "title": "Number Complement",
        "leetcode": 470,
        "difficulty": "easy",
        "topic": "Bit Manipulation",
        "marks": 10,
        "statement": "The complement of an integer is the integer you get when you flip all the 0's to 1's and all the 1's to 0's in its binary representation.\n\nGiven an integer num, return its complement.",
        "input_format": "A single integer num.",
        "output_format": "Print the complement integer.",
        "constraints": "1 <= num < 2^31",
        "sample_input": "5",
        "sample_output": "2",
        "explanation": "The binary representation of 5 is 101 (no leading zero bits), and its complement is 010 which is 2.",
        "test_cases": [
            {"input": "5", "expected_output": "2", "is_hidden": False},
            {"input": "1", "expected_output": "0", "is_hidden": False},
            {"input": "7", "expected_output": "0", "is_hidden": True},
            {"input": "10", "expected_output": "5", "is_hidden": True}
        ]
    },
    {
        "title": "Move Zeroes",
        "leetcode": 283,
        "difficulty": "easy",
        "topic": "Two Pointers",
        "marks": 10,
        "statement": "Given an integer array nums, move all 0's to the end of it while maintaining the relative order of the non-zero elements.\n\nNote that you must do this in-place without making a copy of the array.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.",
        "output_format": "Print the modified array with zeroes moved to the end.",
        "constraints": "1 <= nums.length <= 10^4\n-2^31 <= nums[i] <= 2^31 - 1",
        "sample_input": "5\n0 1 0 3 12",
        "sample_output": "1 3 12 0 0",
        "explanation": "Non-zero elements [1, 3, 12] maintain their relative order, while zeroes are shifted to end.",
        "test_cases": [
            {"input": "5\n0 1 0 3 12", "expected_output": "1 3 12 0 0", "is_hidden": False},
            {"input": "1\n0", "expected_output": "0", "is_hidden": False},
            {"input": "3\n0 0 1", "expected_output": "1 0 0", "is_hidden": True},
            {"input": "4\n4 2 4 0", "expected_output": "4 2 4 0", "is_hidden": True}
        ]
    },
    {
        "title": "Squares of a Sorted Array",
        "leetcode": 977,
        "difficulty": "easy",
        "topic": "Two Pointers / Sorting",
        "marks": 10,
        "statement": "Given an integer array nums sorted in non-decreasing order, return an array of the squares of each number sorted in non-decreasing order.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated sorted integers.",
        "output_format": "Print the squared values in non-decreasing order separated by space.",
        "constraints": "1 <= nums.length <= 10^4\n-10^4 <= nums[i] <= 10^4",
        "sample_input": "5\n-4 -1 0 3 10",
        "sample_output": "0 1 9 16 100",
        "explanation": "After squaring, the array becomes [16, 1, 0, 9, 100]. After sorting, it becomes [0, 1, 9, 16, 100].",
        "test_cases": [
            {"input": "5\n-4 -1 0 3 10", "expected_output": "0 1 9 16 100", "is_hidden": False},
            {"input": "5\n-7 -3 2 3 11", "expected_output": "4 9 9 49 121", "is_hidden": False},
            {"input": "1\n-5", "expected_output": "25", "is_hidden": True}
        ]
    },
    {
        "title": "Sort Array By Parity",
        "leetcode": 905,
        "difficulty": "easy",
        "topic": "Arrays / Two Pointers",
        "marks": 10,
        "statement": "Given an integer array nums, move all the even integers at the beginning of the array followed by all the odd integers.\n\nOutput the even numbers first (in ascending order), followed by odd numbers (in ascending order).",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.",
        "output_format": "Print all even numbers followed by odd numbers.",
        "constraints": "1 <= nums.length <= 5000\n0 <= nums[i] <= 5000",
        "sample_input": "4\n3 1 2 4",
        "sample_output": "2 4 1 3",
        "explanation": "Even numbers [2, 4] come first, then odd numbers [1, 3].",
        "test_cases": [
            {"input": "4\n3 1 2 4", "expected_output": "2 4 1 3", "is_hidden": False},
            {"input": "1\n0", "expected_output": "0", "is_hidden": False},
            {"input": "5\n7 5 3 1 9", "expected_output": "1 3 5 7 9", "is_hidden": True},
            {"input": "4\n8 2 6 4", "expected_output": "2 4 6 8", "is_hidden": True}
        ]
    },
    {
        "title": "Sum of All Odd Length Subarrays",
        "leetcode": 1588,
        "difficulty": "easy",
        "topic": "Prefix Sum / Math",
        "marks": 10,
        "statement": "Given an array of positive integers arr, return the sum of all possible odd-length subarrays of arr.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.",
        "output_format": "Print the total sum of all odd-length subarrays.",
        "constraints": "1 <= arr.length <= 1000\n1 <= arr[i] <= 1000",
        "sample_input": "5\n1 4 2 5 3",
        "sample_output": "58",
        "explanation": "Odd length subarrays: length 1: [1]=1, [4]=4, [2]=2, [5]=5, [3]=3; length 3: [1,4,2]=7, [4,2,5]=11, [2,5,3]=10; length 5: [1,4,2,5,3]=15. Total = 58.",
        "test_cases": [
            {"input": "5\n1 4 2 5 3", "expected_output": "58", "is_hidden": False},
            {"input": "2\n1 2", "expected_output": "3", "is_hidden": False},
            {"input": "3\n10 11 12", "expected_output": "66", "is_hidden": True}
        ]
    },
    {
        "title": "Largest Number At Least Twice of Others",
        "leetcode": 747,
        "difficulty": "easy",
        "topic": "Arrays",
        "marks": 10,
        "statement": "You are given an integer array nums where the largest integer is unique. Determine whether the largest element in the array is at least twice as much as every other number in the array. If it is, return the index of the largest element, or return -1 otherwise.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.",
        "output_format": "Print the 0-based index of the largest element if condition holds, else -1.",
        "constraints": "2 <= nums.length <= 50\n0 <= nums[i] <= 100",
        "sample_input": "4\n3 6 1 0",
        "sample_output": "1",
        "explanation": "6 is the largest integer. For every other number in the array x, 6 is at least twice as big as x. The index of value 6 is 1.",
        "test_cases": [
            {"input": "4\n3 6 1 0", "expected_output": "1", "is_hidden": False},
            {"input": "4\n1 2 3 4", "expected_output": "-1", "is_hidden": False},
            {"input": "2\n0 1", "expected_output": "1", "is_hidden": True},
            {"input": "3\n0 0 2", "expected_output": "2", "is_hidden": True}
        ]
    },
    {
        "title": "Height Checker",
        "leetcode": 1051,
        "difficulty": "easy",
        "topic": "Sorting / Arrays",
        "marks": 10,
        "statement": "A school is trying to take an annual photo of all the students. The students are asked to stand in a single file line in non-decreasing order by height. Let this ordering be represented by the integer array expected where expected[i] is the expected height of the ith student in line.\n\nYou are given an integer array heights representing the current order that the students are standing in. Return the number of indices where heights[i] != expected[i].",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.",
        "output_format": "Print the count of indices where heights differ from sorted order.",
        "constraints": "1 <= heights.length <= 100\n1 <= heights[i] <= 100",
        "sample_input": "6\n1 1 4 2 1 3",
        "sample_output": "3",
        "explanation": "heights: [1,1,4,2,1,3], expected: [1,1,1,2,3,4]. Indices 2, 4, and 5 do not match.",
        "test_cases": [
            {"input": "6\n1 1 4 2 1 3", "expected_output": "3", "is_hidden": False},
            {"input": "5\n5 1 2 3 4", "expected_output": "5", "is_hidden": False},
            {"input": "5\n1 2 3 4 5", "expected_output": "0", "is_hidden": True}
        ]
    },
    {
        "title": "Third Maximum Number",
        "leetcode": 414,
        "difficulty": "easy",
        "topic": "Arrays / Sorting",
        "marks": 10,
        "statement": "Given an integer array nums, return the third distinct maximum number in this array. If the third maximum does not exist, return the maximum number.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.",
        "output_format": "Print the third distinct maximum or the maximum number.",
        "constraints": "1 <= nums.length <= 10^4\n-2^31 <= nums[i] <= 2^31 - 1",
        "sample_input": "3\n3 2 1",
        "sample_output": "1",
        "explanation": "The first distinct maximum is 3, the second is 2, and the third is 1.",
        "test_cases": [
            {"input": "3\n3 2 1", "expected_output": "1", "is_hidden": False},
            {"input": "2\n1 2", "expected_output": "2", "is_hidden": False},
            {"input": "4\n2 2 3 1", "expected_output": "1", "is_hidden": True},
            {"input": "5\n1 2 2 5 3", "expected_output": "2", "is_hidden": True}
        ]
    },
    {
        "title": "Relative Sort Array",
        "leetcode": 1122,
        "difficulty": "easy",
        "topic": "Hashing / Sorting",
        "marks": 10,
        "statement": "Given two arrays arr1 and arr2, the elements of arr2 are distinct, and all elements in arr2 are also in arr1.\n\nSort the elements of arr1 such that the relative ordering of items in arr1 are the same as in arr2. Elements that do not appear in arr2 should be placed at the end of arr1 in ascending order.",
        "input_format": "First line contains integer n (size of arr1).\nSecond line contains n space-separated integers.\nThird line contains integer m (size of arr2).\nFourth line contains m space-separated integers.",
        "output_format": "Print the sorted array elements separated by space.",
        "constraints": "1 <= arr1.length, arr2.length <= 1000\n0 <= arr1[i], arr2[i] <= 1000",
        "sample_input": "11\n2 3 1 3 2 4 6 7 9 2 19\n6\n2 1 4 3 9 6",
        "sample_output": "2 2 2 1 4 3 3 9 6 7 19",
        "explanation": "Elements in arr2 sorted according to arr2 order, remaining elements [7, 19] appended in ascending order.",
        "test_cases": [
            {"input": "11\n2 3 1 3 2 4 6 7 9 2 19\n6\n2 1 4 3 9 6", "expected_output": "2 2 2 1 4 3 3 9 6 7 19", "is_hidden": False},
            {"input": "6\n28 6 22 8 44 17\n4\n22 28 8 6", "expected_output": "22 28 8 6 17 44", "is_hidden": False},
            {"input": "3\n3 2 1\n3\n1 2 3", "expected_output": "1 2 3", "is_hidden": True}
        ]
    },
    {
        "title": "Sort Array By Parity II",
        "leetcode": 922,
        "difficulty": "easy",
        "topic": "Two Pointers / Arrays",
        "marks": 10,
        "statement": "Given an array of integers nums of even length, half of the integers in nums are even, and half of the integers are odd.\n\nSort the array so that whenever nums[i] is odd, i is odd, and whenever nums[i] is even, i is even.",
        "input_format": "First line contains integer n (even number).\nSecond line contains n space-separated integers.",
        "output_format": "Print the rearranged array where even indices have even numbers and odd indices have odd numbers.",
        "constraints": "2 <= nums.length <= 2 * 10^4\nnums.length is even.\nHalf of the integers in nums are even.\n0 <= nums[i] <= 1000",
        "sample_input": "4\n4 2 5 7",
        "sample_output": "4 5 2 7",
        "explanation": "[4,5,2,7], [4,7,2,5], [2,5,4,7], [2,7,4,5] are all acceptable outputs.",
        "test_cases": [
            {"input": "4\n4 2 5 7", "expected_output": "4 5 2 7", "is_hidden": False},
            {"input": "2\n2 3", "expected_output": "2 3", "is_hidden": False},
            {"input": "6\n1 2 3 4 5 6", "expected_output": "2 1 4 3 6 5", "is_hidden": True}
        ]
    },
    {
        "title": "How Many Numbers Are Smaller Than the Current Number",
        "leetcode": 1365,
        "difficulty": "easy",
        "topic": "Arrays / Counting",
        "marks": 10,
        "statement": "Given the array nums, for each nums[i] find out how many numbers in the array are smaller than it. That is, for each nums[i] you have to count the number of valid j's such that j != i and nums[j] < nums[i].",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.",
        "output_format": "Print the counts separated by space.",
        "constraints": "2 <= nums.length <= 500\n0 <= nums[i] <= 100",
        "sample_input": "5\n8 1 2 2 3",
        "sample_output": "4 0 1 1 3",
        "explanation": "For nums[0]=8 there exist four smaller numbers (1, 2, 2, 3).\nFor nums[1]=1 does not exist any smaller number.\nFor nums[2]=2 there exists one smaller number (1).\nFor nums[3]=2 there exists one smaller number (1).\nFor nums[4]=3 there exist three smaller numbers (1, 2, 2).",
        "test_cases": [
            {"input": "5\n8 1 2 2 3", "expected_output": "4 0 1 1 3", "is_hidden": False},
            {"input": "4\n6 5 4 8", "expected_output": "2 1 0 3", "is_hidden": False},
            {"input": "4\n7 7 7 7", "expected_output": "0 0 0 0", "is_hidden": True}
        ]
    },
    {
        "title": "Sort the People",
        "leetcode": 2418,
        "difficulty": "easy",
        "topic": "Sorting / Hash Map",
        "marks": 10,
        "statement": "You are given an array of strings names, and an array heights that consists of distinct positive integers. Both arrays are of length n.\n\nFor each index i, names[i] and heights[i] denote the name and height of the ith person.\n\nReturn names sorted in descending order by the people's heights.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated strings (names).\nThird line contains n space-separated integers (heights).",
        "output_format": "Print the names sorted in descending order of heights separated by space.",
        "constraints": "n == names.length == heights.length\n1 <= n <= 10^3\n1 <= heights[i] <= 10^5\nAll values of heights are distinct.",
        "sample_input": "3\nMary John Emma\n180 165 170",
        "sample_output": "Mary Emma John",
        "explanation": "Mary is tallest (180), followed by Emma (170) and John (165).",
        "test_cases": [
            {"input": "3\nMary John Emma\n180 165 170", "expected_output": "Mary Emma John", "is_hidden": False},
            {"input": "3\nAlice Bob Bob\n155 185 150", "expected_output": "Bob Alice Bob", "is_hidden": False},
            {"input": "1\nAlex\n175", "expected_output": "Alex", "is_hidden": True}
        ]
    },
    {
        "title": "Create Target Array in the Given Order",
        "leetcode": 1389,
        "difficulty": "easy",
        "topic": "Arrays / Simulation",
        "marks": 10,
        "statement": "Given two arrays of integers nums and index. Your task is to create target array under the following rules:\n- Initially target array is empty.\n- From left to right read nums[i] and index[i], insert at index index[i] the value nums[i] in target array.\n- Repeat the previous step until there are no elements to read in nums and index.\nReturn the target array.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers (nums).\nThird line contains n space-separated integers (index).",
        "output_format": "Print the target array elements separated by space.",
        "constraints": "1 <= nums.length, index.length <= 100\nnums.length == index.length\n0 <= nums[i] <= 100\n0 <= index[i] <= i",
        "sample_input": "5\n0 1 2 3 4\n0 1 2 2 1",
        "sample_output": "0 4 1 3 2",
        "explanation": "nums       index     target\n0            0        [0]\n1            1        [0,1]\n2            2        [0,1,2]\n3            2        [0,1,3,2]\n4            1        [0,4,1,3,2]",
        "test_cases": [
            {"input": "5\n0 1 2 3 4\n0 1 2 2 1", "expected_output": "0 4 1 3 2", "is_hidden": False},
            {"input": "5\n1 2 3 4 0\n0 1 2 3 0", "expected_output": "0 1 2 3 4", "is_hidden": False},
            {"input": "1\n1\n0", "expected_output": "1", "is_hidden": True}
        ]
    },
    {
        "title": "Merge Sorted Array",
        "leetcode": 88,
        "difficulty": "easy",
        "topic": "Two Pointers / Sorting",
        "marks": 10,
        "statement": "You are given two integer arrays nums1 and nums2, sorted in non-decreasing order, and two integers m and n, representing the number of elements in nums1 and nums2 respectively.\n\nMerge nums1 and nums2 into a single array sorted in non-decreasing order.",
        "input_format": "First line contains two integers m and n.\nSecond line contains m space-separated integers (nums1 elements).\nThird line contains n space-separated integers (nums2 elements).",
        "output_format": "Print the merged sorted array elements separated by space.",
        "constraints": "0 <= m, n <= 200\n1 <= m + n <= 200\n-10^9 <= nums1[i], nums2[j] <= 10^9",
        "sample_input": "3 3\n1 2 3\n2 5 6",
        "sample_output": "1 2 2 3 5 6",
        "explanation": "Merged result is [1,2,2,3,5,6].",
        "test_cases": [
            {"input": "3 3\n1 2 3\n2 5 6", "expected_output": "1 2 2 3 5 6", "is_hidden": False},
            {"input": "1 0\n1\n", "expected_output": "1", "is_hidden": False},
            {"input": "0 1\n\n1", "expected_output": "1", "is_hidden": True},
            {"input": "3 2\n4 5 6\n1 2", "expected_output": "1 2 4 5 6", "is_hidden": True}
        ]
    },
    {
        "title": "Minimum Absolute Difference",
        "leetcode": 1200,
        "difficulty": "easy",
        "topic": "Sorting / Arrays",
        "marks": 10,
        "statement": "Given an array of distinct integers arr, find all pairs of elements with the minimum absolute difference of any two elements.\n\nReturn a list of pairs in ascending order(with respect to pairs), each pair [a, b] follows:\n- a, b are from arr\n- a < b\n- b - a equals to the minimum absolute difference of any two elements in arr",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.",
        "output_format": "Print each pair on a new line with elements separated by space.",
        "constraints": "2 <= arr.length <= 10^5\n-10^6 <= arr[i] <= 10^6",
        "sample_input": "4\n4 2 1 3",
        "sample_output": "1 2\n2 3\n3 4",
        "explanation": "The minimum absolute difference is 1. List of pairs with difference equal to 1 are: [1,2], [2,3], [3,4].",
        "test_cases": [
            {"input": "4\n4 2 1 3", "expected_output": "1 2\n2 3\n3 4", "is_hidden": False},
            {"input": "4\n1 3 6 10 15", "expected_output": "1 3", "is_hidden": False},
            {"input": "4\n3 8 -10 23 19 -4 -14 27", "expected_output": "-14 -10\n19 23\n23 27", "is_hidden": True}
        ]
    },
    {
        "title": "Rank Transform of an Array",
        "leetcode": 1331,
        "difficulty": "easy",
        "topic": "Hash Table / Sorting",
        "marks": 10,
        "statement": "Given an array of integers arr, replace each element with its rank.\n\nThe rank represents how large the element is. The rank has the following rules:\n- Rank is an integer starting from 1.\n- The larger the element, the larger the rank. If two elements are equal, their rank must be the same.\n- Rank should be as small as possible.",
        "input_format": "First line contains integer n.\nSecond line contains n space-separated integers.",
        "output_format": "Print the ranked integers separated by space.",
        "constraints": "0 <= arr.length <= 10^5\n-10^9 <= arr[i] <= 10^9",
        "sample_input": "4\n40 10 20 30",
        "sample_output": "4 1 2 3",
        "explanation": "40 is the largest element. 10 is the smallest. 20 is the second smallest. 30 is the third smallest.",
        "test_cases": [
            {"input": "4\n40 10 20 30", "expected_output": "4 1 2 3", "is_hidden": False},
            {"input": "3\n100 100 100", "expected_output": "1 1 1", "is_hidden": False},
            {"input": "7\n37 12 28 9 100 56 80 5 12", "expected_output": "5 3 4 2 8 6 7 1 3", "is_hidden": True}
        ]
    }
]

def main():
    print(f"Connecting to database to upload {len(PROBLEMS)} questions...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # 1. Create or Find Question Bank
    bank_title = "LeetCode Standard Algorithms & Problem Solving"
    cur.execute("SELECT id FROM public.question_banks WHERE title = %s", (bank_title,))
    row = cur.fetchone()
    if row:
        bank_id = row[0]
        print(f"Found existing Question Bank ID: {bank_id}")
    else:
        cur.execute(
            """INSERT INTO public.question_banks (title, description, year, status, created_at, updated_at)
               VALUES (%s, %s, %s, %s, NOW(), NOW()) RETURNING id""",
            (bank_title, "Comprehensive curated problem set covering all 28 fundamental algorithmic problems from LeetCode.", "Second Year", "Active")
        )
        bank_id = cur.fetchone()[0]
        print(f"Created Question Bank ID: {bank_id}")

    # 2. Insert Questions and Test Cases
    inserted_question_ids = []
    for p in PROBLEMS:
        cur.execute(
            """INSERT INTO public.questions (
                   title, statement, difficulty, marks, topic, 
                   input_format, output_format, constraints, 
                   sample_input, sample_output, explanation, 
                   question_bank_id, created_at, updated_at
               ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
               RETURNING id""",
            (
                p["title"],
                p["statement"],
                p["difficulty"],
                p["marks"],
                p["topic"],
                p["input_format"],
                p["output_format"],
                p["constraints"],
                p["sample_input"],
                p["sample_output"],
                p["explanation"],
                bank_id
            )
        )
        q_id = cur.fetchone()[0]
        inserted_question_ids.append(q_id)

        # Insert test cases for this question
        for tc in p["test_cases"]:
            cur.execute(
                """INSERT INTO public.test_cases (
                       question_id, input, expected_output, is_hidden, created_at
                   ) VALUES (%s, %s, %s, %s, NOW())""",
                (q_id, tc["input"], tc["expected_output"], tc["is_hidden"])
            )

    conn.commit()
    print(f"Successfully inserted {len(inserted_question_ids)} questions and their test cases into Question Bank ID: {bank_id}!")

    # 3. Create a Scheduled / Active Assessment Test for these questions
    test_name = "LeetCode Coding Challenge (28 Problems)"
    cur.execute("SELECT id FROM public.tests WHERE name = %s", (test_name,))
    existing_test = cur.fetchone()
    
    start_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=1)
    end_time = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=14)

    if existing_test:
        test_id = existing_test[0]
        print(f"Updating existing test ID: {test_id}...")
        cur.execute(
            """UPDATE public.tests SET 
                   question_bank_id = %s,
                   questions_per_student = %s,
                   total_marks = %s,
                   duration_minutes = %s,
                   randomize_questions = %s,
                   start_time = %s,
                   end_time = %s,
                   allowed_languages = %s,
                   max_violations = %s,
                   allow_copy_paste = %s,
                   show_results = %s
               WHERE id = %s""",
            (
                bank_id,
                min(len(inserted_question_ids), 28),
                len(inserted_question_ids) * 10,
                120,
                False,
                start_time,
                end_time,
                json.dumps(["python", "java", "c", "cpp"]),
                3,
                False,
                True,
                test_id
            )
        )
    else:
        print("Creating new test assessment...")
        cur.execute(
            """INSERT INTO public.tests (
                   name, description, year, question_bank_id, randomize_questions,
                   start_time, end_time, duration_minutes, total_marks, questions_per_student,
                   allowed_languages, max_violations, allow_copy_paste, scoring_type, show_results,
                   created_at, updated_at
               ) VALUES (
                   %s, %s, %s, %s, %s,
                   %s, %s, %s, %s, %s,
                   %s, %s, %s, %s, %s,
                   NOW(), NOW()
               ) RETURNING id""",
            (
                test_name,
                "Curated algorithmic assessment comprising 28 core LeetCode problems spanning arrays, binary search, two pointers, math, bit manipulation, and graphs.",
                "Second Year",
                bank_id,
                False,
                start_time,
                end_time,
                120,
                len(inserted_question_ids) * 10,
                min(len(inserted_question_ids), 28),
                json.dumps(["python", "java", "c", "cpp"]),
                3,
                False,
                "partial",
                True
            )
        )
        test_id = cur.fetchone()[0]

    # Map question IDs to test in public.test_questions if table exists
    cur.execute("DELETE FROM public.test_questions WHERE test_id = %s", (test_id,))
    for q_id in inserted_question_ids:
        cur.execute(
            "INSERT INTO public.test_questions (test_id, question_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (test_id, q_id)
        )

    conn.commit()
    cur.close()
    conn.close()

    print(f"\n=======================================================")
    print(f"[SUCCESS] ALL DONE!")
    print(f"Question Bank: '{bank_title}' (ID: {bank_id})")
    print(f"Test Created: '{test_name}' (ID: {test_id})")
    print(f"Total Questions Uploaded: {len(inserted_question_ids)}")
    print(f"=======================================================\n")

if __name__ == "__main__":
    main()
