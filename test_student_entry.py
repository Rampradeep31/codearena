import urllib.request
import json

SUPABASE_URL = "https://vubpgeagtfpqdojdiqtc.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YnBnZWFndGZwcWRvamRpcXRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NjY3OTIsImV4cCI6MjEwMTE0Mjc5Mn0.pm5_u6S2SPnrVGGJ2HibOFp-y4a7pVx7ktyr35FdRVM"

def insert_test_student():
    url = f"{SUPABASE_URL}/rest/v1/users"
    payload = json.dumps({
        "name": "Demo Student",
        "register_number": "211421243001",
        "department": "AI & DS",
        "section": "A",
        "year": 1,
        "role": "student"
    }).encode('utf-8')

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode('utf-8'))
            print("Successfully inserted test student into Supabase!")
            print("Inserted Row:", res)
    except Exception as e:
        print("Error inserting into Supabase:", e)

if __name__ == "__main__":
    insert_test_student()
