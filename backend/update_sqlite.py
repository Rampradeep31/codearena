import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'codearena.db')
print(f"Updating database at: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Create question_banks table
cursor.execute("""
CREATE TABLE IF NOT EXISTS question_banks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    year TEXT NOT NULL,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT DEFAULT 'Admin'
)
""")

# 2. Add columns to questions table
try:
    cursor.execute("ALTER TABLE questions ADD COLUMN question_bank_id INTEGER REFERENCES question_banks(id) ON DELETE SET NULL")
    print("Added question_bank_id column to questions table.")
except sqlite3.OperationalError:
    print("question_bank_id already exists in questions table.")

# 3. Add columns to tests table
try:
    cursor.execute("ALTER TABLE tests ADD COLUMN year TEXT DEFAULT 'Second Year'")
    print("Added year column to tests table.")
except sqlite3.OperationalError:
    print("year already exists in tests table.")

try:
    cursor.execute("ALTER TABLE tests ADD COLUMN question_bank_id INTEGER REFERENCES question_banks(id) ON DELETE SET NULL")
    print("Added question_bank_id column to tests table.")
except sqlite3.OperationalError:
    print("question_bank_id already exists in tests table.")

try:
    cursor.execute("ALTER TABLE tests ADD COLUMN randomize_questions BOOLEAN DEFAULT 0")
    print("Added randomize_questions column to tests table.")
except sqlite3.OperationalError:
    print("randomize_questions already exists in tests table.")

# 4. Add columns to test_attempts table
try:
    cursor.execute("ALTER TABLE test_attempts ADD COLUMN assigned_questions TEXT DEFAULT '[]'")
    print("Added assigned_questions column to test_attempts table.")
except sqlite3.OperationalError:
    print("assigned_questions already exists in test_attempts table.")

# 5. Insert default Question Bank
cursor.execute("""
INSERT OR REPLACE INTO question_banks (id, title, description, year, status)
VALUES (1, 'August Month Question Bank', 'August Month Question Bank with 20 seeded coding challenges', 'Second Year', 'Active')
""")

# 6. Associate all existing questions with this default bank
cursor.execute("UPDATE questions SET question_bank_id = 1")
print("Associated all questions with default question bank (id=1).")

conn.commit()
conn.close()
print("Local SQLite database update complete!")
