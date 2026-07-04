import urllib.request
import urllib.error
import json
from datetime import datetime

# You can override this if you want to publish a specific date
# For example: publish_date = "2026-06-20"
publish_date = "2026-06-20"

BASE_URL = "http://127.0.0.1:8000"
PUBLISH_URL = f"{BASE_URL}/api/posts/publish/{publish_date}"

print(f"======================================================================")
print(f"  LinkedIn Auto-Publisher")
print(f"  Attempting to publish post for date: {publish_date}")
print(f"======================================================================\n")

def main():
    # 1. Check if server is healthy
    try:
        req = urllib.request.Request(f"{BASE_URL}/health")
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                print(f"  [FAIL] Backend server not responding correctly.")
                return
    except urllib.error.URLError:
        print(f"  [FAIL] Backend server not running at {BASE_URL}!")
        print(f"         Please start the server first.")
        return

    # 2. Trigger Publish Endpoint
    print(f"  [1/2] Connecting to Publisher API...")
    req = urllib.request.Request(PUBLISH_URL, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(f"  [PASS] {data.get('message', 'Successfully published!')}")
            
            # Print LinkedIn API response details
            linkedin_resp = data.get("linkedin_response", {})
            post_id = linkedin_resp.get("id", "Unknown ID")
            print(f"\n  [SUCCESS] Your post is live on LinkedIn! (Post ID: {post_id})")
            
    except urllib.error.HTTPError as e:
        error_data = e.read().decode()
        try:
            err_json = json.loads(error_data)
            detail = err_json.get('detail', error_data)
        except json.JSONDecodeError:
            detail = error_data
            
        print(f"  [FAIL] Could not publish post.")
        print(f"         Reason: {detail}")
        
        if e.code == 400 and "LINKEDIN_ACCESS_TOKEN" in detail:
            print(f"\n  [ACTION REQUIRED] You need to add your LinkedIn Access Token to the .env file!")
        elif e.code == 404:
            print(f"\n  [INFO] No post was found in the weekly_calendar directory for {publish_date}.")
            print(f"         If you want to test publishing, change 'publish_date' in this script to a date that exists.")

if __name__ == "__main__":
    main()
