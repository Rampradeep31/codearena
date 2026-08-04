import sqlite3
con = sqlite3.connect('codearena.db')
cur = con.cursor()
print(cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall())
print('---QUESTIONS---')
for r in cur.execute("SELECT id,title,difficulty,sample_input,sample_output FROM questions LIMIT 5").fetchall():
    print(r)
print('---TESTCASES---')
for r in cur.execute("SELECT question_id, input, expected_output, is_hidden FROM test_cases LIMIT 12").fetchall():
    print(r)
