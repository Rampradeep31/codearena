import urllib.request
import json
import os

SUPABASE_URL = "https://vubpgeagtfpqdojdiqtc.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YnBnZWFndGZwcWRvamRpcXRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NjY3OTIsImV4cCI6MjEwMTE0Mjc5Mn0.pm5_u6S2SPnrVGGJ2HibOFp-y4a7pVx7ktyr35FdRVM"

def check_attended_students():
    url = f"{SUPABASE_URL}/rest/v1/users?role=eq.student&select=*"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            print("==========================================================")
            print(f"  TOTAL STUDENTS ATTENDED / REGISTERED: {len(data)}")
            print("==========================================================")
            if not data:
                print("No students have registered/attended yet.")
            else:
                print(f"{'NAME':<20} | {'REG NUMBER':<16} | {'DEPT':<10} | {'SEC':<4} | {'YEAR'}")
                print("-" * 65)
                for s in data:
                    name = s.get('name', 'N/A')
                    reg = s.get('register_number', 'N/A')
                    dept = s.get('department', 'AI & DS')
                    sec = s.get('section', 'A')
                    year = s.get('year', 1)
                    print(f"{name:<20} | {reg:<16} | {dept:<10} | {sec:<4} | {year}")
            print("==========================================================")
    except Exception as e:
        print("Error connecting to Supabase database:", e)

if __name__ == "__main__":
    check_attended_students()
