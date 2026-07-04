# -*- coding: utf-8 -*-
"""
=============================================================================
  AI LINKEDIN AGENT — WEEKLY CONTENT PLANNER VERIFICATION
  Tests: Batch generation, background worker execution, local / database calendar scheduling.
=============================================================================
"""
import sys
import os
import json
import time
import shutil
import urllib.request
import urllib.error

sys.stdout.reconfigure(encoding="utf-8")

BASE_URL     = "http://127.0.0.1:8000"
GENERATE_URL = f"{BASE_URL}/api/workflow/generate-weekly"
CALENDAR_URL = f"{BASE_URL}/api/posts/calendar"
HEALTH_URL   = f"{BASE_URL}/health"

def clear_local_calendar():
    # Call the server to reset its own calendar directory
    # (client and server may have different working directories)
    try:
        req = urllib.request.Request(
            f"{BASE_URL}/api/posts/calendar/reset",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            print(f"  [Cleanup] {result.get('message', 'Calendar cleared.')}")
    except Exception as e:
        print(f"  [Cleanup] Reset skipped (starting fresh): {str(e)[:60]}")

def http_get(url):
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode())
    except Exception as e:
        return 0, {"error": str(e)}

def http_post(url, payload):
    encoded = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=encoded,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}

def main():
    print("======================================================================")
    # 0. Health check
    status, health = http_get(HEALTH_URL)
    if status != 200 or health.get("status") != "healthy":
        print(f"  [FAIL] Backend server not running at {BASE_URL}!")
        sys.exit(1)
    
    print("  [PASS] Backend Server is Healthy.")
    
    # 1. Clean up old runs
    clear_local_calendar()
    
    # 2. Trigger weekly batch creation
    payload = {
        "theme": "AI agent and AI automation in business",
        "industry": "Business Automation",
        "target_audience": "Founders and Business Owners",
        "content_goal": "Educate and drive engagement"
    }
    
    print("\n  [1/3] Triggering Weekly Content Planner...")
    print(f"        Theme: {payload['theme']}")
    
    status, resp = http_post(GENERATE_URL, payload)
    if status != 200:
        print(f"  [FAIL] Failed to trigger planner! HTTP {status} — {resp}")
        sys.exit(1)
        
    print(f"  [PASS] API response: {resp.get('message')}")
    
    # 3. Poll calendar endpoint
    print("\n  [2/3] Polling Content Calendar (waiting for background generation to complete)...")
    print("        This will take ~60-90s because 7 posts are being generated.")
    
    start_time = time.time()
    max_duration = 1200  # 20 minutes max to account for the massive 6-agent workflow
    completed = False
    
    while time.time() - start_time < max_duration:
        time.sleep(10)
        c_status, c_resp = http_get(CALENDAR_URL)
        if c_status != 200:
            print(f"        Error fetching calendar: HTTP {c_status}")
            continue
            
        calendar = c_resp.get("calendar", [])
        source = c_resp.get("source", "none")
        print(f"        [{int(time.time() - start_time)}s] Generated: {len(calendar)}/7 posts  (Source: {source})")
        
        if len(calendar) >= 7:
            completed = True
            break
            
    if not completed:
        print(f"\n  [FAIL] Weekly generation timed out or failed to generate 7 posts!")
        sys.exit(1)
        
    print("\n  [PASS] All 7 daily posts generated successfully!")
    
    # 4. Display calendar
    print("\n  [3/3] Displaying Generated Weekly Content Calendar:")
    print("======================================================================\n")
    
    # Fetch final calendar
    _, c_resp = http_get(CALENDAR_URL)
    calendar = c_resp.get("calendar", [])
    
    for item in calendar:
        print(f"📅 DATE : {item.get('scheduled_date')}")
        print(f"📌 TOPIC: {item.get('topic')}")
        print(f"⭐ SCORE: {item.get('score')}/100")
        print("-" * 70)
        draft = item.get("draft", "")
        # Preview first 150 chars
        print(f"{draft[:200].strip()}...")
        print("=" * 70 + "\n")
        
    print("======================================================================")
    print("  WEEKLY PLANNER VERIFICATION COMPLETED SUCCESSFULLY!")
    print("======================================================================")

if __name__ == "__main__":
    main()
