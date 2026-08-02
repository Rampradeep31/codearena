import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const QUESTIONS = [
  {
    title: "Third Distinct Maximum Score",
    statement: "A university is organizing a coding competition, and the final scores of all participants have been recorded. Since a participant can submit multiple times, the same score may appear more than once.\n\nYour task is to identify the third highest distinct score from the list.\n\nA distinct score means duplicate values should be counted only once.\n\nIf there are fewer than three distinct scores, return the highest distinct score instead.\n\nYour solution should work efficiently even for large datasets.\n\n### Constraints\n- 1 <= N <= 100000\n- -1000000000 <= Score <= 1000000000",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains an integer N, representing the number of scores.\nThe second line contains N space-separated integers representing the scores.",
    output_format: "Print a single integer representing the third highest distinct score, if at least three distinct values exist. Otherwise, print the highest distinct score.",
    sample_input: "6\n10 20 20 40 30 40",
    sample_output: "20",
    explanation: "The distinct scores are: 40, 30, 20, 10. The third highest distinct score is 20.",
    test_cases: [
      { input: "6\n10 20 20 40 30 40", expected_output: "20", is_hidden: false },
      { input: "4\n7 7 7 7", expected_output: "7", is_hidden: false },
      { input: "7\n100 90 80 70 60 50 40", expected_output: "80", is_hidden: true },
      { input: "5\n-5 -10 -5 -20 -30", expected_output: "-20", is_hidden: true },
      { input: "1\n500", expected_output: "500", is_hidden: true },
      { input: "6\n15 15 14 14 13 12", expected_output: "13", is_hidden: true },
      { input: "8\n1000000000 999999999 999999999 888888888 777777777 666666666 555555555 444444444", expected_output: "777777777", is_hidden: true },
      { input: "6\n9 9 8 8 7 7", expected_output: "7", is_hidden: true },
      { input: "8\n10 10 10 10 9 9 9 9", expected_output: "10", is_hidden: true },
      { input: "7\n1 2 3 4 5 6 7", expected_output: "5", is_hidden: true },
      { input: "7\n7 6 5 4 3 2 1", expected_output: "5", is_hidden: true },
      { input: "10\n5 2 5 3 2 1 4 4 6 6", expected_output: "4", is_hidden: true }
    ]
  },
  {
    title: "Plus One",
    statement: "You are given a large integer represented as an integer array of digits, where each digit at index i is the i-th digit of the integer (ordered from most significant to least significant). Increment the large integer by one and return the resulting array of digits.\n\n### Constraints\n- 1 <= N <= 100\n- 0 <= digits[i] <= 9\n- The array does not contain any leading 0's, except for the number 0 itself.",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains an integer N representing the size of the digit array.\nThe second line contains N space-separated single-digit integers representing the number.",
    output_format: "Print the resulting space-separated digits on a single line.",
    sample_input: "3\n1 2 3",
    sample_output: "1 2 4",
    explanation: "The array represents the integer 123. Incrementing by one gives 123 + 1 = 124.",
    test_cases: [
      { input: "3\n1 2 3", expected_output: "1 2 4", is_hidden: false },
      { input: "1\n9", expected_output: "1 0", is_hidden: false },
      { input: "4\n9 9 9 9", expected_output: "1 0 0 0 0", is_hidden: true },
      { input: "1\n0", expected_output: "1", is_hidden: true },
      { input: "3\n1 0 0", expected_output: "1 0 1", is_hidden: true },
      { input: "5\n8 9 9 9 9", expected_output: "9 0 0 0 0", is_hidden: true },
      { input: "2\n1 9", expected_output: "2 0", is_hidden: true },
      { input: "6\n1 2 3 4 5 6", expected_output: "1 2 3 4 5 7", is_hidden: true },
      { input: "8\n9 9 9 9 9 9 9 9", expected_output: "1 0 0 0 0 0 0 0 0", is_hidden: true },
      { input: "3\n4 3 2", expected_output: "4 3 3", is_hidden: true },
      { input: "4\n1 9 9 9", expected_output: "2 0 0 0", is_hidden: true },
      { input: "5\n1 2 9 9 9", expected_output: "1 3 0 0 0", is_hidden: true }
    ]
  },
  {
    title: "Maximum Consecutive Ones",
    statement: "Given a binary array of size N containing only 0s and 1s, return the maximum number of consecutive 1s in the array.\n\n### Constraints\n- 1 <= N <= 10^5\n- arr[i] is either 0 or 1.",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains an integer N representing the size of the array.\nThe second line contains N space-separated binary integers (0 or 1).",
    output_format: "Print a single integer representing the maximum consecutive 1s.",
    sample_input: "6\n1 1 0 1 1 1",
    sample_output: "3",
    explanation: "The first two digits and the last three digits are consecutive 1s. The maximum number of consecutive 1s is 3.",
    test_cases: [
      { input: "6\n1 1 0 1 1 1", expected_output: "3", is_hidden: false },
      { input: "5\n1 0 1 0 1", expected_output: "1", is_hidden: false },
      { input: "1\n0", expected_output: "0", is_hidden: true },
      { input: "1\n1", expected_output: "1", is_hidden: true },
      { input: "6\n0 0 0 0 0 0", expected_output: "0", is_hidden: true },
      { input: "6\n1 1 1 1 1 1", expected_output: "6", is_hidden: true },
      { input: "10\n1 1 0 0 1 1 1 0 1 1", expected_output: "3", is_hidden: true },
      { input: "8\n0 1 1 0 0 1 1 1", expected_output: "3", is_hidden: true },
      { input: "7\n1 1 1 0 1 1 1", expected_output: "3", is_hidden: true },
      { input: "9\n1 0 1 1 1 1 0 1 1", expected_output: "4", is_hidden: true },
      { input: "8\n1 1 1 1 0 0 1 1", expected_output: "4", is_hidden: true },
      { input: "10\n0 1 0 1 1 0 1 1 1 0", expected_output: "3", is_hidden: true }
    ]
  },
  {
    title: "Single Number",
    statement: "Given a non-empty array of integers, every element appears exactly twice except for one. Find that single element.\n\n### Constraints\n- 1 <= N <= 3 * 10^4\n- -3 * 10^4 <= arr[i] <= 3 * 10^4\n- Each element in the array appears twice except for one element which appears once.",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains an odd integer N representing the size of the array.\nThe second line contains N space-separated integers.",
    output_format: "Print the single number that appears only once.",
    sample_input: "3\n2 2 1",
    sample_output: "1",
    explanation: "The element 2 appears twice, while 1 appears only once.",
    test_cases: [
      { input: "3\n2 2 1", expected_output: "1", is_hidden: false },
      { input: "5\n4 1 2 1 2", expected_output: "4", is_hidden: false },
      { input: "1\n5", expected_output: "5", is_hidden: true },
      { input: "3\n-1 -1 2", expected_output: "2", is_hidden: true },
      { input: "7\n10 20 10 30 20 40 40", expected_output: "30", is_hidden: true },
      { input: "5\n-5 -5 10 -10 -10", expected_output: "10", is_hidden: true },
      { input: "9\n1 2 3 4 1 2 3 4 9", expected_output: "9", is_hidden: true },
      { input: "7\n100 100 200 200 300 400 400", expected_output: "300", is_hidden: true },
      { input: "5\n999999 999999 888888 888888 777777", expected_output: "777777", is_hidden: true },
      { input: "3\n0 0 -5", expected_output: "-5", is_hidden: true },
      { input: "5\n2 3 5 3 2", expected_output: "5", is_hidden: true },
      { input: "7\n1 1 2 2 3 4 4", expected_output: "3", is_hidden: true }
    ]
  },
  {
    title: "Remove Element",
    statement: "Given an integer array and an integer val, remove all occurrences of val in-place. The relative order of the elements may be changed. Print the remaining elements count k on the first line, and the k remaining elements in sorted order on the second line (print 'empty' if k is 0).\n\n### Constraints\n- 0 <= N <= 100\n- 0 <= arr[i] <= 50\n- 0 <= val <= 100",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains an integer N (size of the array).\nThe second line contains N space-separated integers.\nThe third line contains an integer representing val.",
    output_format: "First line: Number of remaining elements k.\nSecond line: k space-separated remaining elements sorted in non-decreasing order (or 'empty' if k = 0).",
    sample_input: "4\n3 2 2 3\n3",
    sample_output: "2\n2 2",
    explanation: "Your function should remove all occurrences of 3, leaving k = 2 elements which are [2, 2].",
    test_cases: [
      { input: "4\n3 2 2 3\n3", expected_output: "2\n2 2", is_hidden: false },
      { input: "8\n0 1 2 2 3 0 4 2\n2", expected_output: "5\n0 0 1 3 4", is_hidden: false },
      { input: "1\n1\n1", expected_output: "0\nempty", is_hidden: true },
      { input: "1\n2\n1", expected_output: "1\n2", is_hidden: true },
      { input: "5\n1 1 1 1 1\n1", expected_output: "0\nempty", is_hidden: true },
      { input: "6\n1 2 3 4 5 6\n7", expected_output: "6\n1 2 3 4 5 6", is_hidden: true },
      { input: "5\n-1 -2 -3 -2 -1\n-2", expected_output: "3\n-3 -1 -1", is_hidden: true },
      { input: "4\n10 10 10 10\n10", expected_output: "0\nempty", is_hidden: true },
      { input: "3\n9 8 9\n9", expected_output: "1\n8", is_hidden: true },
      { input: "7\n1 2 1 2 1 2 3\n1", expected_output: "4\n2 2 2 3", is_hidden: true },
      { input: "6\n5 5 5 4 4 4\n5", expected_output: "3\n4 4 4", is_hidden: true },
      { input: "8\n9 9 9 9 9 9 9 8\n9", expected_output: "1\n8", is_hidden: true }
    ]
  },
  {
    title: "Move Zeroes",
    statement: "Given an integer array, move all 0's to the end of it while maintaining the relative order of the non-zero elements. You must do this in-place without making a copy of the array.\n\n### Constraints\n- 1 <= N <= 10^4\n- -2^31 <= arr[i] <= 2^31 - 1",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains an integer N (size of the array).\nThe second line contains N space-separated integers.",
    output_format: "Print the modified space-separated array integers on a single line.",
    sample_input: "5\n0 1 0 3 12",
    sample_output: "1 3 12 0 0",
    explanation: "Moving all 0s to the end of [0, 1, 0, 3, 12] results in [1, 3, 12, 0, 0].",
    test_cases: [
      { input: "5\n0 1 0 3 12", expected_output: "1 3 12 0 0", is_hidden: false },
      { input: "1\n0", expected_output: "0", is_hidden: false },
      { input: "1\n1", expected_output: "1", is_hidden: true },
      { input: "3\n0 0 0", expected_output: "0 0 0", is_hidden: true },
      { input: "4\n1 2 3 4", expected_output: "1 2 3 4", is_hidden: true },
      { input: "6\n0 0 1 0 2 3", expected_output: "1 2 3 0 0 0", is_hidden: true },
      { input: "5\n-1 0 -2 0 5", expected_output: "-1 -2 5 0 0", is_hidden: true },
      { input: "7\n0 0 0 0 1 2 3", expected_output: "1 2 3 0 0 0 0", is_hidden: true },
      { input: "8\n1 0 2 0 3 0 4 0", expected_output: "1 2 3 4 0 0 0 0", is_hidden: true },
      { input: "5\n10 20 30 0 0", expected_output: "10 20 30 0 0", is_hidden: true },
      { input: "6\n0 5 0 6 0 7", expected_output: "5 6 7 0 0 0", is_hidden: true },
      { input: "10\n0 0 0 0 0 0 0 0 0 9", expected_output: "9 0 0 0 0 0 0 0 0 0", is_hidden: true }
    ]
  },
  {
    title: "Search Insert Position",
    statement: "Given a sorted array of distinct integers and a target value, return the index if the target is found. If not, return the index where it would be if it were inserted in order.\n\nYou must write an algorithm with O(log n) runtime complexity.\n\n### Constraints\n- 1 <= N <= 10^4\n- -10^4 <= arr[i], target <= 10^4\n- The array is sorted in ascending order and contains distinct values.",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains N (size of the array).\nThe second line contains N space-separated sorted integers.\nThe third line contains the target integer.",
    output_format: "Print a single integer representing the insertion index.",
    sample_input: "4\n1 3 5 6\n5",
    sample_output: "2",
    explanation: "The target 5 is found at index 2.",
    test_cases: [
      { input: "4\n1 3 5 6\n5", expected_output: "2", is_hidden: false },
      { input: "4\n1 3 5 6\n2", expected_output: "1", is_hidden: false },
      { input: "4\n1 3 5 6\n7", expected_output: "4", is_hidden: true },
      { input: "4\n1 3 5 6\n0", expected_output: "0", is_hidden: true },
      { input: "1\n5\n5", expected_output: "0", is_hidden: true },
      { input: "1\n5\n6", expected_output: "1", is_hidden: true },
      { input: "1\n5\n4", expected_output: "0", is_hidden: true },
      { input: "5\n10 20 30 40 50\n25", expected_output: "2", is_hidden: true },
      { input: "5\n10 20 30 40 50\n45", expected_output: "4", is_hidden: true },
      { input: "6\n-10 -5 0 5 10 15\n-20", expected_output: "0", is_hidden: true },
      { input: "6\n-10 -5 0 5 10 15\n20", expected_output: "6", is_hidden: true },
      { input: "6\n-10 -5 0 5 10 15\n8", expected_output: "4", is_hidden: true }
    ]
  },
  {
    title: "Element Appearing More Than 25% in a Sorted Array",
    statement: "Given an integer array sorted in non-decreasing order, there is exactly one integer that occurs more than 25% of the time. Return that integer.\n\n### Constraints\n- 1 <= N <= 10^4\n- 0 <= arr[i] <= 10^5",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains an integer N (size of the array).\nThe second line contains N space-separated non-decreasing integers.",
    output_format: "Print the integer that appears more than 25% of the time.",
    sample_input: "9\n1 2 2 6 6 6 6 7 10",
    sample_output: "6",
    explanation: "The value 6 appears 4 times out of 9 elements (44.4%), which is greater than 25%.",
    test_cases: [
      { input: "9\n1 2 2 6 6 6 6 7 10", expected_output: "6", is_hidden: false },
      { input: "4\n1 1 2 3", expected_output: "1", is_hidden: false },
      { input: "1\n5", expected_output: "5", is_hidden: true },
      { input: "5\n1 2 2 3 4", expected_output: "2", is_hidden: true },
      { input: "8\n1 2 3 4 4 5 6 7", expected_output: "4", is_hidden: true },
      { input: "10\n1 1 1 2 3 4 5 6 7 8", expected_output: "1", is_hidden: true },
      { input: "8\n1 2 2 2 3 4 5 6", expected_output: "2", is_hidden: true },
      { input: "6\n-1 -1 -1 2 3 4", expected_output: "-1", is_hidden: true },
      { input: "7\n1 2 3 3 3 4 5", expected_output: "3", is_hidden: true },
      { input: "10\n1 2 3 4 5 5 5 5 6 7", expected_output: "5", is_hidden: true },
      { input: "5\n100 100 200 300 400", expected_output: "100", is_hidden: true },
      { input: "12\n1 2 3 4 5 6 7 7 7 7 8 9", expected_output: "7", is_hidden: true }
    ]
  },
  {
    title: "Build Array from Permutation",
    statement: "Given a zero-based permutation nums (0-indexed), build an array ans of the same length where ans[i] = nums[nums[i]] for each 0 <= i < nums.length.\n\n### Constraints\n- 1 <= N <= 1000\n- 0 <= nums[i] < N\n- The elements in nums are distinct.",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains N (size of the permutation array).\nThe second line contains N space-separated integers representing the permutation.",
    output_format: "Print the space-separated elements of the constructed array ans.",
    sample_input: "6\n0 2 1 5 3 4",
    sample_output: "0 1 2 4 5 3",
    explanation: "ans = [nums[nums[0]], nums[nums[1]], ...] = [nums[0], nums[2], nums[1], nums[5], nums[3], nums[4]] = [0, 1, 2, 4, 5, 3].",
    test_cases: [
      { input: "6\n0 2 1 5 3 4", expected_output: "0 1 2 4 5 3", is_hidden: false },
      { input: "5\n4 3 2 1 0", expected_output: "0 1 2 3 4", is_hidden: false },
      { input: "1\n0", expected_output: "0", is_hidden: true },
      { input: "2\n1 0", expected_output: "0 1", is_hidden: true },
      { input: "3\n2 0 1", expected_output: "1 2 0", is_hidden: true },
      { input: "4\n0 1 2 3", expected_output: "0 1 2 3", is_hidden: true },
      { input: "4\n3 2 1 0", expected_output: "0 1 2 3", is_hidden: true },
      { input: "5\n1 2 3 4 0", expected_output: "2 3 4 0 1", is_hidden: true },
      { input: "6\n5 4 3 2 1 0", expected_output: "0 1 2 3 4 5", is_hidden: true },
      { input: "8\n7 6 5 4 3 2 1 0", expected_output: "0 1 2 3 4 5 6 7", is_hidden: true },
      { input: "6\n2 4 0 5 1 3", expected_output: "0 1 2 3 4 5", is_hidden: true },
      { input: "7\n1 3 5 0 2 4 6", expected_output: "3 0 4 1 5 2 6", is_hidden: true }
    ]
  },
  {
    title: "Single Element in a Sorted Array",
    statement: "You are given a sorted array consisting of only integers where every element appears exactly twice, except for one element which appears exactly once. Find this single element.\n\nYour solution must run in O(log n) time and O(1) space.\n\n### Constraints\n- 1 <= N <= 10^5\n- 0 <= arr[i] <= 10^5",
    difficulty: "medium",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains an odd integer N (size of the array).\nThe second line contains N space-separated sorted integers.",
    output_format: "Print the single element that appears only once.",
    sample_input: "9\n1 1 2 3 3 4 4 8 8",
    sample_output: "2",
    explanation: "The element 2 appears only once, while all other elements appear twice.",
    test_cases: [
      { input: "9\n1 1 2 3 3 4 4 8 8", expected_output: "2", is_hidden: false },
      { input: "7\n3 3 7 7 10 11 11", expected_output: "10", is_hidden: false },
      { input: "1\n5", expected_output: "5", is_hidden: true },
      { input: "3\n1 1 2", expected_output: "2", is_hidden: true },
      { input: "3\n1 2 2", expected_output: "1", is_hidden: true },
      { input: "5\n1 1 2 2 3", expected_output: "3", is_hidden: true },
      { input: "5\n1 2 2 3 3", expected_output: "1", is_hidden: true },
      { input: "7\n-5 -5 -3 -3 0 1 1", expected_output: "0", is_hidden: true },
      { input: "9\n10 10 20 20 30 30 40 50 50", expected_output: "40", is_hidden: true },
      { input: "11\n1 1 2 2 3 3 4 4 5 5 6", expected_output: "6", is_hidden: true },
      { input: "11\n1 2 2 3 3 4 4 5 5 6 6", expected_output: "1", is_hidden: true },
      { input: "15\n1 1 2 2 3 3 4 4 5 5 6 6 7 7 8", expected_output: "8", is_hidden: true }
    ]
  },
  {
    title: "Shuffle the Array",
    statement: "Given the array nums consisting of 2n elements in the form [x1, x2, ..., xn, y1, y2, ..., yn]. Return the array in the form [x1, y1, x2, y2, ..., xn, yn].\n\n### Constraints\n- 2 <= N <= 500 (representing 2n up to 1000)\n- 1 <= nums[i] <= 10^3",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains an even integer N (equal to 2n).\nThe second line contains N space-separated integers.",
    output_format: "Print the space-separated elements of the shuffled array.",
    sample_input: "6\n2 5 1 3 4 7",
    sample_output: "2 3 5 4 1 7",
    explanation: "x = [2, 5, 1], y = [3, 4, 7]. Shuffling gives [2, 3, 5, 4, 1, 7].",
    test_cases: [
      { input: "6\n2 5 1 3 4 7", expected_output: "2 3 5 4 1 7", is_hidden: false },
      { input: "8\n1 2 3 4 5 6 7 8", expected_output: "1 5 2 6 3 7 4 8", is_hidden: false },
      { input: "2\n1 2", expected_output: "1 2", is_hidden: true },
      { input: "4\n10 20 30 40", expected_output: "10 30 20 40", is_hidden: true },
      { input: "6\n-1 -2 -3 1 2 3", expected_output: "-1 1 -2 2 -3 3", is_hidden: true },
      { input: "8\n0 0 0 0 1 1 1 1", expected_output: "0 1 0 1 0 1 0 1", is_hidden: true },
      { input: "10\n5 4 3 2 1 5 4 3 2 1", expected_output: "5 5 4 4 3 3 2 2 1 1", is_hidden: true },
      { input: "6\n1000 2000 3000 4000 5000 6000", expected_output: "1000 4000 2000 5000 3000 6000", is_hidden: true },
      { input: "4\n9 9 8 8", expected_output: "9 8 9 8", is_hidden: true },
      { input: "8\n1 5 9 13 2 6 10 14", expected_output: "1 2 5 6 9 10 13 14", is_hidden: true },
      { input: "12\n1 2 3 4 5 6 7 8 9 10 11 12", expected_output: "1 7 2 8 3 9 4 10 5 11 6 12", is_hidden: true },
      { input: "6\n100 100 100 200 200 200", expected_output: "100 200 100 200 100 200", is_hidden: true }
    ]
  },
  {
    title: "Sort Array By Parity",
    statement: "Given an integer array, move all the even integers to the beginning of the array followed by all the odd integers. Output the even numbers in sorted order and the odd numbers in sorted order.\n\n### Constraints\n- 1 <= N <= 5000\n- -5000 <= arr[i] <= 5000",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains N (size of the array).\nThe second line contains N space-separated integers.",
    output_format: "Print the space-separated sorted even numbers first, followed by space-separated sorted odd numbers.",
    sample_input: "4\n3 1 2 4",
    sample_output: "2 4 1 3",
    explanation: "Even numbers are [2, 4], sorted: 2 4. Odd numbers are [3, 1], sorted: 1 3. Output is '2 4 1 3'.",
    test_cases: [
      { input: "4\n3 1 2 4", expected_output: "2 4 1 3", is_hidden: false },
      { input: "1\n0", expected_output: "0", is_hidden: false },
      { input: "1\n1", expected_output: "1", is_hidden: true },
      { input: "5\n1 3 5 7 9", expected_output: "1 3 5 7 9", is_hidden: true },
      { input: "5\n2 4 6 8 10", expected_output: "2 4 6 8 10", is_hidden: true },
      { input: "6\n5 2 9 8 1 6", expected_output: "2 6 8 1 5 9", is_hidden: true },
      { input: "6\n-2 -1 0 1 2 3", expected_output: "-2 0 2 -1 1 3", is_hidden: true },
      { input: "4\n10 9 8 7", expected_output: "8 10 7 9", is_hidden: true },
      { input: "8\n0 1 0 1 0 1 0 1", expected_output: "0 0 0 0 1 1 1 1", is_hidden: true },
      { input: "5\n99 98 97 96 95", expected_output: "96 98 95 97 99", is_hidden: true },
      { input: "7\n1 2 4 3 6 5 8", expected_output: "2 4 6 8 1 3 5", is_hidden: true },
      { input: "10\n10 9 20 19 30 29 40 39 50 49", expected_output: "10 20 30 40 50 9 19 29 39 49", is_hidden: true }
    ]
  },
  {
    title: "Two Sum",
    statement: "Given an array of integers and a target integer, return the 0-based indices of the two elements that add up to target. The two returned indices must be printed in ascending order.\n\n### Constraints\n- 2 <= N <= 10^4\n- -10^9 <= arr[i], target <= 10^9\n- There is exactly one unique solution.",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains N (size of the array).\nThe second line contains N space-separated integers.\nThe third line contains the target integer.",
    output_format: "Print the two space-separated indices in ascending order.",
    sample_input: "4\n2 7 11 15\n9",
    sample_output: "0 1",
    explanation: "Because arr[0] + arr[1] = 2 + 7 = 9, we print '0 1'.",
    test_cases: [
      { input: "4\n2 7 11 15\n9", expected_output: "0 1", is_hidden: false },
      { input: "3\n3 2 4\n6", expected_output: "1 2", is_hidden: false },
      { input: "2\n3 3\n6", expected_output: "0 1", is_hidden: true },
      { input: "5\n1 5 3 7 2\n8", expected_output: "1 2", is_hidden: true },
      { input: "6\n-1 -2 -3 -4 -5 5\n-8", expected_output: "2 4", is_hidden: true },
      { input: "4\n10 20 30 40\n50", expected_output: "0 3", is_hidden: true },
      { input: "5\n0 4 3 0 7\n0", expected_output: "0 3", is_hidden: true },
      { input: "7\n5 25 75 100 50 25 10\n50", expected_output: "1 5", is_hidden: true },
      { input: "8\n9 8 7 6 5 4 3 2\n10", expected_output: "1 7", is_hidden: true },
      { input: "3\n100 -50 200\n150", expected_output: "1 2", is_hidden: true },
      { input: "6\n1 2 3 4 5 6\n11", expected_output: "4 5", is_hidden: true },
      { input: "5\n1000000000 2000000000 3000000000 4000000000 5000000000\n5000000000", expected_output: "1 2", is_hidden: true }
    ]
  },
  {
    title: "Palindrome Number",
    statement: "Given an integer x, return true if x is a palindrome, and false otherwise. Do not convert the integer to a string during computation.\n\n### Constraints\n- -2^31 <= x <= 2^31 - 1",
    difficulty: "easy",
    marks: 10,
    topic: "Math",
    input_format: "A single integer x.",
    output_format: "Print 'true' or 'false' (all lowercase).",
    sample_input: "121",
    sample_output: "true",
    explanation: "121 reads as 121 from left to right and from right to left.",
    test_cases: [
      { input: "121", expected_output: "true", is_hidden: false },
      { input: "-121", expected_output: "false", is_hidden: false },
      { input: "10", expected_output: "false", is_hidden: true },
      { input: "0", expected_output: "true", is_hidden: true },
      { input: "7", expected_output: "true", is_hidden: true },
      { input: "11", expected_output: "true", is_hidden: true },
      { input: "1221", expected_output: "true", is_hidden: true },
      { input: "12321", expected_output: "true", is_hidden: true },
      { input: "123454321", expected_output: "true", is_hidden: true },
      { input: "1000000001", expected_output: "true", is_hidden: true },
      { input: "-101", expected_output: "false", is_hidden: true },
      { input: "123", expected_output: "false", is_hidden: true }
    ]
  },
  {
    title: "Roman to Integer",
    statement: "Roman numerals are represented by seven different symbols: I, V, X, L, C, D and M.\n\nConvert a Roman numeral string to its corresponding integer.\n\n### Constraints\n- 1 <= s.length <= 15\n- s contains only the characters ('I', 'V', 'X', 'L', 'C', 'D', 'M').\n- It is guaranteed that s is a valid Roman numeral in the range [1, 3999].",
    difficulty: "easy",
    marks: 10,
    topic: "Strings",
    input_format: "A single string representing a Roman numeral.",
    output_format: "Print a single integer representing the Arabic value.",
    sample_input: "LVIII",
    sample_output: "58",
    explanation: "L = 50, V= 5, III = 3. 50 + 5 + 3 = 58.",
    test_cases: [
      { input: "III", expected_output: "3", is_hidden: false },
      { input: "LVIII", expected_output: "58", is_hidden: false },
      { input: "MCMXCIV", expected_output: "1994", is_hidden: true },
      { input: "I", expected_output: "1", is_hidden: true },
      { input: "IV", expected_output: "4", is_hidden: true },
      { input: "IX", expected_output: "9", is_hidden: true },
      { input: "XL", expected_output: "40", is_hidden: true },
      { input: "XC", expected_output: "90", is_hidden: true },
      { input: "CD", expected_output: "400", is_hidden: true },
      { input: "CM", expected_output: "900", is_hidden: true },
      { input: "MMMCMXCIX", expected_output: "3999", is_hidden: true },
      { input: "CDXLIV", expected_output: "444", is_hidden: true }
    ]
  },
  {
    title: "Remove Duplicates from Sorted Array",
    statement: "Given an integer array sorted in non-decreasing order, remove the duplicates in-place such that each unique element appears only once. The relative order of the elements should be kept the same.\n\nPrint the number of unique elements k on the first line, followed by the k unique elements space-separated on the second line.\n\n### Constraints\n- 1 <= N <= 10^4\n- -100 <= arr[i] <= 100",
    difficulty: "easy",
    marks: 10,
    topic: "Arrays",
    input_format: "The first line contains N (size of the sorted array).\nThe second line contains N space-separated sorted integers.",
    output_format: "First line: Count of unique elements k.\nSecond line: k space-separated unique elements in non-decreasing order.",
    sample_input: "3\n1 1 2",
    sample_output: "2\n1 2",
    explanation: "Unique elements are k = 2: [1, 2].",
    test_cases: [
      { input: "3\n1 1 2", expected_output: "2\n1 2", is_hidden: false },
      { input: "10\n0 0 1 1 1 2 2 3 3 4", expected_output: "5\n0 1 2 3 4", is_hidden: false },
      { input: "1\n5", expected_output: "1\n5", is_hidden: true },
      { input: "5\n1 1 1 1 1", expected_output: "1\n1", is_hidden: true },
      { input: "5\n1 2 3 4 5", expected_output: "5\n1 2 3 4 5", is_hidden: true },
      { input: "6\n-3 -3 -2 -1 -1 0", expected_output: "4\n-3 -2 -1 0", is_hidden: true },
      { input: "8\n10 10 20 20 30 30 40 40", expected_output: "4\n10 20 30 40", is_hidden: true },
      { input: "7\n-5 -5 -5 -5 -5 -5 5", expected_output: "2\n-5 5", is_hidden: true },
      { input: "4\n9999 9999 10000 10000", expected_output: "2\n9999 10000", is_hidden: true },
      { input: "2\n1 2", expected_output: "2\n1 2", is_hidden: true },
      { input: "8\n1 1 2 2 3 3 4 4", expected_output: "4\n1 2 3 4", is_hidden: true },
      { input: "12\n1 1 1 2 2 2 3 3 3 4 4 4", expected_output: "4\n1 2 3 4", is_hidden: true }
    ]
  },
  {
    title: "Sqrt(x)",
    statement: "Given a non-negative integer x, return the square root of x rounded down to the nearest integer. The returned integer should be non-negative. Do not use any built-in exponent power operator or function (e.g. `pow` or `sqrt` in Python/C++).\n\n### Constraints\n- 0 <= x <= 2^31 - 1",
    difficulty: "easy",
    marks: 10,
    topic: "Math",
    input_format: "A single non-negative integer x.",
    output_format: "Print a single integer representing the square root of x rounded down.",
    sample_input: "8",
    sample_output: "2",
    explanation: "The square root of 8 is 2.8284..., and since we round it down to the nearest integer, 2 is returned.",
    test_cases: [
      { input: "4", expected_output: "2", is_hidden: false },
      { input: "8", expected_output: "2", is_hidden: false },
      { input: "0", expected_output: "0", is_hidden: true },
      { input: "1", expected_output: "1", is_hidden: true },
      { input: "2", expected_output: "1", is_hidden: true },
      { input: "3", expected_output: "1", is_hidden: true },
      { input: "9", expected_output: "3", is_hidden: true },
      { input: "15", expected_output: "3", is_hidden: true },
      { input: "16", expected_output: "4", is_hidden: true },
      { input: "100", expected_output: "10", is_hidden: true },
      { input: "2147483647", expected_output: "46340", is_hidden: true },
      { input: "999999", expected_output: "999", is_hidden: true }
    ]
  },
  {
    title: "Power of Three",
    statement: "Given an integer n, return true if it is a power of three. Otherwise, return false. An integer n is a power of three if there exists an integer x such that n == 3^x.\n\n### Constraints\n- -2^31 <= n <= 2^31 - 1",
    difficulty: "easy",
    marks: 10,
    topic: "Math",
    input_format: "A single integer n.",
    output_format: "Print 'true' or 'false' (all lowercase).",
    sample_input: "27",
    sample_output: "true",
    explanation: "27 = 3^3, so it returns true.",
    test_cases: [
      { input: "27", expected_output: "true", is_hidden: false },
      { input: "0", expected_output: "false", is_hidden: false },
      { input: "9", expected_output: "true", is_hidden: true },
      { input: "45", expected_output: "false", is_hidden: true },
      { input: "1", expected_output: "true", is_hidden: true },
      { input: "3", expected_output: "true", is_hidden: true },
      { input: "243", expected_output: "true", is_hidden: true },
      { input: "-3", expected_output: "false", is_hidden: true },
      { input: "1162261467", expected_output: "true", is_hidden: true },
      { input: "1162261468", expected_output: "false", is_hidden: true },
      { input: "2", expected_output: "false", is_hidden: true },
      { input: "-27", expected_output: "false", is_hidden: true }
    ]
  },
  {
    title: "Reverse String",
    statement: "Write a program that reverses a string. The input is a single string.\n\n### Constraints\n- 1 <= s.length <= 10^5\n- s consists of printable ASCII characters.",
    difficulty: "easy",
    marks: 10,
    topic: "Strings",
    input_format: "A single string s.",
    output_format: "Print the reversed string on a single line.",
    sample_input: "hello",
    sample_output: "olleh",
    explanation: "The reverse of 'hello' is 'olleh'.",
    test_cases: [
      { input: "hello", expected_output: "olleh", is_hidden: false },
      { input: "Hannah", expected_output: "hannaH", is_hidden: false },
      { input: "a", expected_output: "a", is_hidden: true },
      { input: "ab", expected_output: "ba", is_hidden: true },
      { input: "racecar", expected_output: "racecar", is_hidden: true },
      { input: "Python", expected_output: "nohtyP", is_hidden: true },
      { input: "12345", expected_output: "54321", is_hidden: true },
      { input: "A man a plan a canal Panama", expected_output: "amanaP lanac a nalp a nam A", is_hidden: true },
      { input: "!@#$%", expected_output: "%$#@!", is_hidden: true },
      { input: "spaces words", expected_output: "sdrow secaps", is_hidden: true },
      { input: "longerstringtoexceed", expected_output: "deecxetognirtsregnol", is_hidden: true },
      { input: "capitalLETTERS", expected_output: "SRETTELtatipac", is_hidden: true }
    ]
  },
  {
    title: "Convert Temperature",
    statement: "You are given a non-negative floating point number representing a temperature in Celsius. Convert Celsius into Kelvin and Fahrenheit, and print them rounded to exactly 2 decimal places.\n\nFormulas:\n- Kelvin = Celsius + 273.15\n- Fahrenheit = Celsius * 1.80 + 32.00\n\n### Constraints\n- 0.00 <= Celsius <= 1000.00",
    difficulty: "easy",
    marks: 10,
    topic: "Math",
    input_format: "A float representing temperature in Celsius.",
    output_format: "First line: Temperature in Kelvin.\nSecond line: Temperature in Fahrenheit.",
    sample_input: "36.50",
    sample_output: "309.65\n97.70",
    explanation: "36.50 + 273.15 = 309.65 K. 36.50 * 1.8 + 32 = 97.70 F.",
    test_cases: [
      { input: "36.50", expected_output: "309.65\n97.70", is_hidden: false },
      { input: "122.00", expected_output: "395.15\n251.60", is_hidden: false },
      { input: "0.00", expected_output: "273.15\n32.00", is_hidden: true },
      { input: "100.00", expected_output: "373.15\n212.00", is_hidden: true },
      { input: "37.00", expected_output: "310.15\n98.60", is_hidden: true },
      { input: "150.12", expected_output: "423.27\n302.22", is_hidden: true },
      { input: "25.55", expected_output: "298.70\n77.99", is_hidden: true },
      { input: "0.05", expected_output: "273.20\n32.09", is_hidden: true },
      { input: "1000.00", expected_output: "1273.15\n1832.00", is_hidden: true },
      { input: "1.11", expected_output: "274.26\n34.00", is_hidden: true },
      { input: "20.20", expected_output: "293.35\n68.36", is_hidden: true },
      { input: "300.50", expected_output: "573.65\n572.90", is_hidden: true }
    ]
  }
];

async function seed() {
  console.log('Seeding Supabase Database...');

  // 1. Delete all previous questions (Cascades to test_cases)
  console.log('Clearing existing questions and test cases...');
  const { error: deleteError } = await supabase
    .from('questions')
    .delete()
    .neq('id', 0); // Delete all
  
  if (deleteError) {
    console.error('Error clearing old questions:', deleteError.message);
    process.exit(1);
  }

  // 2. Loop and insert new questions and their test cases
  for (let idx = 0; idx < QUESTIONS.length; idx++) {
    const q = QUESTIONS[idx];
    console.log(`Inserting question ${idx + 1}/20: ${q.title}...`);
    
    // Insert question
    const { data: newQ, error: qError } = await supabase
      .from('questions')
      .insert({
        title: q.title,
        statement: q.statement,
        difficulty: q.difficulty,
        marks: q.marks,
        topic: q.topic,
        input_format: q.input_format,
        output_format: q.output_format,
        sample_input: q.sample_input,
        sample_output: q.sample_output,
        explanation: q.explanation
      })
      .select()
      .single();

    if (qError) {
      console.error(`Error inserting question ${q.title}:`, qError.message);
      continue;
    }

    // Insert test cases
    const tcData = q.test_cases.map(tc => ({
      question_id: newQ.id,
      input: tc.input,
      expected_output: tc.expected_output,
      is_hidden: tc.is_hidden
    }));

    const { error: tcError } = await supabase
      .from('test_cases')
      .insert(tcData);

    if (tcError) {
      console.error(`Error inserting test cases for ${q.title}:`, tcError.message);
    }
  }

  console.log('Supabase seeding complete!');
  process.exit(0);
}

seed();
