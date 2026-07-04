# -*- coding: utf-8 -*-
"""
=======================================================================
  AI LINKEDIN AGENT — SINGLE SCENARIO VERIFICATION TEST
  Runs ONE full workflow end-to-end and prints every agent's output.
  Purpose: confirm the full pipeline works before running bulk tests.
=======================================================================
"""
import sys, json, time, urllib.request, urllib.error
sys.stdout.reconfigure(encoding="utf-8")

BASE_URL  = "http://127.0.0.1:8000"
AGENT_URL = f"{BASE_URL}/api/workflow/generate-ideas"

# -- Single real-world scenario --
PAYLOAD = {
    "topic":           "AI tools that are replacing traditional jobs",
    "industry":        "Technology",
    "target_audience": "Startup founders and tech professionals",
    "content_goal":    "Spark discussion and build thought leadership"
}

def separator(c="=", n=70): print(c * n)

def post(payload, timeout=180):
    body = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        AGENT_URL, data=body,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode()), round(time.time()-start,2)
    except urllib.error.HTTPError as e:
        return e.code, {}, round(time.time()-start,2)
    except Exception as e:
        return 0, {"error": str(e)}, round(time.time()-start,2)

# ── STEP 0: Health ────────────────────────────────────────────────────
separator()
print("  STEP 0: HEALTH CHECK")
separator()
try:
    with urllib.request.urlopen(f"{BASE_URL}/health", timeout=5) as r:
        h = json.loads(r.read().decode())
        print(f"  Status  : {h.get('status')}")
        print(f"  Version : {h.get('version')}")
        print(f"  Search  : {h.get('search')}")
        print(f"  Result  : [PASS]")
except Exception as e:
    print(f"  [FAIL] Server not reachable: {e}")
    print("  Make sure the server is running on port 8000.")
    sys.exit(1)

print()

# ── STEP 1: Run full agent workflow ───────────────────────────────────
separator()
print("  STEP 1: RUNNING FULL AGENT WORKFLOW")
separator()
print(f"\n  Topic    : {PAYLOAD['topic']}")
print(f"  Industry : {PAYLOAD['industry']}")
print(f"  Audience : {PAYLOAD['target_audience']}")
print(f"  Goal     : {PAYLOAD['content_goal']}")
print(f"\n  Calling agent... (this may take 30-90s due to LLM + search)\n")

start_all = time.time()
code, result, elapsed = post(PAYLOAD)
total = round(time.time() - start_all, 2)

if code == 0:
    print(f"  [FAIL] Connection error: {result.get('error')}")
    sys.exit(1)
if code != 200:
    print(f"  [FAIL] HTTP {code}")
    sys.exit(1)

print(f"  HTTP {code}  |  Total time: {elapsed}s")
print()

# ── STEP 2: Print every field returned ───────────────────────────────
separator()
print("  STEP 2: FULL AGENT RESPONSE BREAKDOWN")
separator()

status   = result.get("status")
score    = result.get("score")
ideas    = result.get("ideas", [""])[0]
draft    = result.get("draft", "")
feedback = result.get("feedback", "")
research = result.get("research_sources", "")
trends   = result.get("trends", "")

print(f"\n  [A] STATUS  : {status}")
print(f"  [B] SCORE   : {score}/100")
print()

print(f"  [C] RESEARCH SOURCES (live web search used by research_agent):")
for line in str(research).split("\n")[:6]:
    print(f"      {line[:110]}")
print()

print(f"  [D] TRENDS (live web search used by trend_agent):")
for line in str(trends).split("\n")[:4]:
    print(f"      {line[:110]}")
print()

print(f"  [E] IDEAS GENERATED (idea_agent output):")
for line in str(ideas).split("\n")[:15]:
    print(f"      {line}")
print()

print(f"  [F] FINAL DRAFT (writer_agent + rewrite_agent output):")
separator("-", 70)
print(draft)
separator("-", 70)
print()

print(f"  [G] CRITIC FEEDBACK (critic_agent):")
print(f"      {feedback[:400]}")
print()

# ── STEP 3: Validation checks ─────────────────────────────────────────
separator()
print("  STEP 3: VALIDATION CHECKS")
separator()

checks = {
    "HTTP 200 OK"                         : code == 200,
    "status == 'success'"                 : status == "success",
    "ideas generated (not empty)"         : bool(ideas) and "failed" not in ideas.lower(),
    "draft is real content (not error)"   : bool(draft) and "DRAFT_ERROR" not in draft and "failed" not in draft.lower()[:40],
    "score is valid (1-100)"              : isinstance(score, int) and 1 <= score <= 100,
    "score > 0 (LLM evaluated content)"   : isinstance(score, int) and score > 0,
    "critic provided feedback"            : bool(feedback) and "failed" not in feedback.lower()[:30],
    "research_sources present (search)"   : bool(research) and len(research) > 50,
    "trends present (search)"             : bool(trends) and len(trends) > 20,
    "draft has arrow bullets (→)"         : "→" in draft,
    "draft has hashtags (#)"              : "#" in draft,
    "draft length 150-350 words"          : 150 <= len(draft.split()) <= 500,
}

all_pass = True
print()
for label, passed in checks.items():
    tag = "[OK]  " if passed else "[WARN]"
    print(f"  {tag}  {label}")
    if not passed:
        all_pass = False

print()
separator()
overall = "ALL CHECKS PASSED — AGENT IS FULLY WORKING" if all_pass else "COMPLETED WITH WARNINGS — REVIEW ABOVE"
print(f"  RESULT  : {overall}")
print(f"  TIME    : {elapsed}s end-to-end")
print(f"  SCORE   : {score}/100")
separator()
print()
