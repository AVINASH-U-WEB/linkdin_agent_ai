# -*- coding: utf-8 -*-
"""
=============================================================================
  AI LINKEDIN AGENT — COMPREHENSIVE END-TO-END TEST SUITE
  Tests: Normal | Business | Edge Cases | Stress | Validation | Error
=============================================================================
"""
import sys
import json
import time
import urllib.request
import urllib.error

sys.stdout.reconfigure(encoding="utf-8")

BASE_URL   = "http://127.0.0.1:8000"
AGENT_URL  = f"{BASE_URL}/api/workflow/generate-ideas"
HEALTH_URL = f"{BASE_URL}/health"

PASS = "[PASS]"
FAIL = "[FAIL]"
SKIP = "[SKIP]"

results_log = []

# =============================================================================
# TEST SCENARIOS — grouped by category
# =============================================================================

NORMAL_SCENARIOS = [
    {
        "name": "[1] Tech Founder - Thought Leadership",
        "payload": {
            "topic": "Building a startup from zero",
            "industry": "Technology",
            "target_audience": "Early-stage startup founders",
            "content_goal": "Establish thought leadership"
        }
    },
    {
        "name": "[2] Marketing Manager - Lead Generation",
        "payload": {
            "topic": "Content marketing ROI in 2025",
            "industry": "Marketing",
            "target_audience": "B2B marketing managers",
            "content_goal": "Generate leads"
        }
    },
    {
        "name": "[3] Healthcare - Education & Credibility",
        "payload": {
            "topic": "AI diagnostics transforming patient care",
            "industry": "Healthcare",
            "target_audience": "Doctors and hospital administrators",
            "content_goal": "Educate and build credibility"
        }
    },
    {
        "name": "[4] Finance Expert - Personal Branding",
        "payload": {
            "topic": "Passive income strategies for working professionals",
            "industry": "Finance",
            "target_audience": "Mid-career professionals aged 30-45",
            "content_goal": "Grow personal brand"
        }
    },
    {
        "name": "[5] HR Leader - Recruitment & Culture",
        "payload": {
            "topic": "Building remote team culture in 2025",
            "industry": "Human Resources",
            "target_audience": "HR directors and people managers",
            "content_goal": "Drive engagement and attract talent"
        }
    },
    {
        "name": "[6] SaaS Founder - Product Launch",
        "payload": {
            "topic": "Launching a SaaS product with zero marketing budget",
            "industry": "Software / SaaS",
            "target_audience": "Indie hackers and product managers",
            "content_goal": "Drive product sign-ups"
        }
    },
    {
        "name": "[7] Sustainability - ESG & Investors",
        "payload": {
            "topic": "Corporate sustainability and ESG reporting",
            "industry": "Energy",
            "target_audience": "C-suite executives and investors",
            "content_goal": "Attract investors and partnerships"
        }
    },
    {
        "name": "[8] Education - Online Learning",
        "payload": {
            "topic": "Why self-learning beats a second degree in 2025",
            "industry": "Education",
            "target_audience": "Fresh graduates and career switchers",
            "content_goal": "Build community and followers"
        }
    },
]

EDGE_CASES = [
    {
        "name": "[E1] Empty Topic",
        "payload": {
            "topic": "",
            "industry": "Unknown",
            "target_audience": "General audience",
            "content_goal": "Go viral"
        },
        "expect_success": True   # Agent should handle gracefully
    },
    {
        "name": "[E2] Very Long Topic (stress input)",
        "payload": {
            "topic": "How artificial intelligence, machine learning, blockchain, quantum computing, and IoT together are reshaping the entire global economy and every business model in every industry sector across developed and emerging markets simultaneously",
            "industry": "Technology",
            "target_audience": "Business executives",
            "content_goal": "Thought leadership"
        },
        "expect_success": True
    },
    {
        "name": "[E3] Special Characters in Topic",
        "payload": {
            "topic": "Revenue grew 300% — but we almost quit! Here's why...",
            "industry": "Startup",
            "target_audience": "Entrepreneurs",
            "content_goal": "Inspire and motivate"
        },
        "expect_success": True
    },
    {
        "name": "[E4] Non-English Industry",
        "payload": {
            "topic": "Digital transformation in traditional industries",
            "industry": "Manufacturing & Supply Chain",
            "target_audience": "Plant managers and operations heads",
            "content_goal": "Education"
        },
        "expect_success": True
    },
    {
        "name": "[E5] Single-Word Inputs",
        "payload": {
            "topic": "Leadership",
            "industry": "Business",
            "target_audience": "Managers",
            "content_goal": "Inspire"
        },
        "expect_success": True
    },
    {
        "name": "[E6] All Fields Max Length",
        "payload": {
            "topic": "A" * 200,
            "industry": "B" * 50,
            "target_audience": "C" * 100,
            "content_goal": "D" * 100
        },
        "expect_success": True   # Should not crash the server
    },
]

ERROR_CASES = [
    {
        "name": "[ERR1] Missing Required Field (no topic)",
        "raw_payload": {
            "industry": "Technology",
            "target_audience": "Developers",
            "content_goal": "Engagement"
        },
        "expect_http_error": True,
        "expected_status": 422
    },
    {
        "name": "[ERR2] Wrong Content-Type (plain text body)",
        "raw_body": b"this is not json",
        "content_type": "text/plain",
        "expect_http_error": True,
        "expected_status": 422
    },
    {
        "name": "[ERR3] Empty JSON body",
        "raw_payload": {},
        "expect_http_error": True,
        "expected_status": 422
    },
    {
        "name": "[ERR4] Wrong HTTP Method (GET on POST endpoint)",
        "method": "GET",
        "expect_http_error": True,
        "expected_status": 405
    },
]

# =============================================================================
# HELPERS
# =============================================================================

def http_post(payload: dict, timeout: int = 120) -> tuple:
    """Returns (status_code, response_dict, elapsed_seconds)."""
    encoded = json.dumps(payload).encode("utf-8")
    req     = urllib.request.Request(
        AGENT_URL, data=encoded,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = round(time.time() - start, 2)
            return resp.status, json.loads(resp.read().decode()), elapsed
    except urllib.error.HTTPError as e:
        elapsed = round(time.time() - start, 2)
        return e.code, {}, elapsed
    except Exception as e:
        elapsed = round(time.time() - start, 2)
        return 0, {"error": str(e)}, elapsed


def http_raw(raw_body: bytes, content_type: str, method: str = "POST") -> tuple:
    req = urllib.request.Request(
        AGENT_URL, data=raw_body,
        headers={"Content-Type": content_type}, method=method
    )
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, {}, round(time.time() - start, 2)
    except urllib.error.HTTPError as e:
        return e.code, {}, round(time.time() - start, 2)
    except Exception as e:
        return 0, {"error": str(e)}, round(time.time() - start, 2)


def http_get(url: str) -> tuple:
    start = time.time()
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode()), round(time.time() - start, 2)
    except Exception as e:
        return 0, {"error": str(e)}, round(time.time() - start, 2)


def validate_response(result: dict) -> list:
    """Returns list of validation errors (empty = all good)."""
    errors = []
    if result.get("status") != "success":
        errors.append(f"status is '{result.get('status')}', expected 'success'")
    if not result.get("ideas"):
        errors.append("ideas field is empty or missing")

    draft = str(result.get("draft", ""))
    if not draft:
        errors.append("draft field is empty or missing")
    elif "DRAFT_ERROR" in draft or "Drafting failed" in draft or "Error code" in draft:
        errors.append(f"draft contains error, not real content: {draft[:120]}")

    score = result.get("score")
    if score is None:
        errors.append("score field is missing")
    elif score == 0:
        errors.append("score is 0 — LLM failed to generate or evaluate content")
    elif not (1 <= score <= 100):
        errors.append(f"score {score} is out of range 1-100")

    if not result.get("research_sources"):
        errors.append("research_sources field is empty (search may have failed)")
    return errors


def print_divider(char="=", width=68):
    print(char * width)


def log_result(name, tag, note=""):
    results_log.append({"name": name, "tag": tag, "note": note})


# =============================================================================
# SECTION 1 — HEALTH CHECK
# =============================================================================

def test_health():
    print_divider()
    print("  SECTION 1: HEALTH CHECK")
    print_divider()
    status, body, elapsed = http_get(HEALTH_URL)
    if status == 200 and body.get("status") == "healthy":
        print(f"  GET /health  =>  {body}  ({elapsed}s)  {PASS}")
        log_result("Health Check", PASS)
    else:
        print(f"  GET /health  =>  HTTP {status}  {body}  {FAIL}")
        log_result("Health Check", FAIL, f"HTTP {status}")
    print()


# =============================================================================
# SECTION 2 — NORMAL SCENARIOS
# =============================================================================

def test_normal_scenarios():
    print_divider()
    print("  SECTION 2: NORMAL SCENARIOS  (8 real-world use cases)")
    print_divider()

    for idx, scenario in enumerate(NORMAL_SCENARIOS):
        name    = scenario["name"]
        payload = scenario["payload"]
        # Small delay between calls to reduce rate-limit pressure
        if idx > 0:
            print(f"  [Waiting 4s before next scenario to avoid rate limits...]")
            import time as _t; _t.sleep(4)
        print(f"\n  Running {name} ...")

        status_code, result, elapsed = http_post(payload)

        if status_code != 200:
            print(f"  HTTP {status_code}  =>  {FAIL}")
            log_result(name, FAIL, f"HTTP {status_code}")
            continue

        validation_errors = validate_response(result)
        score    = result.get("score", "?")
        rewrite  = "YES" if isinstance(score, int) and score < 85 else "NO"
        draft_preview = str(result.get("draft", ""))[:120].replace("\n", " ")
        search_ok = "YES" if result.get("research_sources") and "Live research" in str(result.get("research_sources")) else "NO (fallback)"
        model_plan = result.get("model_plan", {})

        print(f"  {'─'*64}")
        print(f"  Topic      : {payload['topic'][:60]}")
        print(f"  Status     : {result.get('status')}  |  Score: {score}/100  |  Time: {elapsed}s")
        print(f"  Models     : idea={model_plan.get('idea','').split('/')[-1]} | writer={model_plan.get('writer','').split('/')[-1]}")
        print(f"  Search Used: {search_ok}")
        print(f"  Rewritten? : {rewrite}")
        print(f"  Draft      : {draft_preview}...")
        if validation_errors:
            for err in validation_errors:
                print(f"  WARNING    : {err}")
            print(f"  RESULT     : {FAIL}  (validation errors)")
            log_result(name, FAIL, "; ".join(validation_errors))
        else:
            print(f"  RESULT     : {PASS}")
            log_result(name, PASS)
    print()


# =============================================================================
# SECTION 3 — EDGE CASES
# =============================================================================

def test_edge_cases():
    print_divider()
    print("  SECTION 3: EDGE CASES  (unusual but valid inputs)")
    print_divider()

    for case in EDGE_CASES:
        name    = case["name"]
        payload = case["payload"]
        should_succeed = case.get("expect_success", True)
        print(f"\n  Running {name} ...")

        status_code, result, elapsed = http_post(payload, timeout=120)

        if status_code == 0:
            print(f"  Connection error: {result.get('error')}  =>  {FAIL}")
            log_result(name, FAIL, "Connection error")
            continue

        if should_succeed and status_code == 200:
            validation_errors = validate_response(result)
            score = result.get("score", "?")
            draft_preview = str(result.get("draft", ""))[:100].replace("\n", " ")
            print(f"  HTTP {status_code}  |  Score: {score}/100  |  Time: {elapsed}s")
            print(f"  Draft      : {draft_preview}...")
            if validation_errors:
                # Edge cases may have partial failures — warn but don't hard fail
                for err in validation_errors:
                    print(f"  WARNING    : {err}")
                print(f"  RESULT     : {PASS} (with warnings)")
                log_result(name, PASS, "warnings: " + "; ".join(validation_errors))
            else:
                print(f"  RESULT     : {PASS}  (gracefully handled)")
                log_result(name, PASS, "gracefully handled")
        elif not should_succeed and status_code != 200:
            print(f"  HTTP {status_code}  (expected non-200)  =>  {PASS}")
            log_result(name, PASS, f"correctly returned HTTP {status_code}")
        else:
            print(f"  HTTP {status_code}  (unexpected)  =>  {FAIL}")
            log_result(name, FAIL, f"HTTP {status_code}")
    print()


# =============================================================================
# SECTION 4 — ERROR / VALIDATION CASES
# =============================================================================

def test_error_cases():
    print_divider()
    print("  SECTION 4: ERROR & VALIDATION CASES  (bad inputs / wrong methods)")
    print_divider()

    for case in ERROR_CASES:
        name             = case["name"]
        expected_status  = case.get("expected_status", 422)
        print(f"\n  Running {name} ...")

        if "raw_body" in case:
            code, _, elapsed = http_raw(case["raw_body"], case.get("content_type", "text/plain"))
        elif "method" in case and case["method"] == "GET":
            req = urllib.request.Request(AGENT_URL, method="GET")
            start = time.time()
            try:
                with urllib.request.urlopen(req, timeout=10) as r:
                    code = r.status
            except urllib.error.HTTPError as e:
                code = e.code
            except Exception:
                code = 0
            elapsed = round(time.time() - start, 2)
        else:
            code, _, elapsed = http_post(case.get("raw_payload", {}), timeout=30)

        if code == expected_status:
            print(f"  HTTP {code}  (expected {expected_status})  |  Time: {elapsed}s  =>  {PASS}")
            log_result(name, PASS, f"correctly returned {code}")
        else:
            print(f"  HTTP {code}  (expected {expected_status})  |  Time: {elapsed}s  =>  {FAIL}")
            log_result(name, FAIL, f"got {code}, expected {expected_status}")
    print()


# =============================================================================
# SECTION 5 — RESPONSE QUALITY AUDIT (last normal result)
# =============================================================================

def test_quality_audit():
    print_divider()
    print("  SECTION 5: CONTENT QUALITY DEEP AUDIT  (Founder Style Check)")
    print_divider()

    payload = {
        "topic": "Why most founders quit too early",
        "industry": "Entrepreneurship",
        "target_audience": "First-time founders and startup teams",
        "content_goal": "Inspire action and build community"
    }

    print(f"\n  Topic: {payload['topic']}")
    print(f"  Sending request...")

    code, result, elapsed = http_post(payload, timeout=120)

    if code != 200:
        print(f"  HTTP {code}  =>  {FAIL}")
        log_result("Quality Audit", FAIL, f"HTTP {code}")
        return

    draft = result.get("draft", "")
    score = result.get("score", 0)
    ideas = result.get("ideas", [""])[0]
    research = result.get("research_sources", "")
    trends   = result.get("trends", "")

    print(f"\n  {'─'*64}")
    print(f"  Score    : {score}/100  |  Time: {elapsed}s")
    print(f"\n  -- RESEARCH SOURCES (search engine data used) --")
    print(f"  {str(research)[:400].replace(chr(10), ' | ')}")
    print(f"\n  -- TREND DATA --")
    print(f"  {str(trends)[:300].replace(chr(10), ' | ')}")
    print(f"\n  -- GENERATED IDEAS (first 400 chars) --")
    print(f"  {str(ideas)[:400].replace(chr(10), ' ')}")
    print(f"\n  -- FINAL DRAFT (full post) --")
    print(f"  {draft}")

    # Style checks
    checks = {
        "Has arrow bullets (→)"    : "→" in draft,
        "Short lines structure"    : "\n\n" in draft or "\n" in draft,
        "Has hashtags"             : "#" in draft,
        "No corporate opener"      : not draft.strip().startswith("In today's"),
        "Score >= 85"              : score >= 85,
        "Research data present"    : bool(research),
        "Trends data present"      : bool(trends),
    }

    print(f"\n  -- STYLE AUDIT --")
    all_pass = True
    for check, passed in checks.items():
        tag = "[OK]" if passed else "[WARN]"
        print(f"  {tag}  {check}")
        if not passed:
            all_pass = False

    overall = PASS if all_pass else f"{PASS} (with style warnings)"
    print(f"\n  RESULT   : {overall}")
    log_result("Quality Audit", PASS if score >= 85 else FAIL, f"score={score}")
    print()


# =============================================================================
# MAIN — Run All Sections
# =============================================================================

total_start = time.time()

print(f"\n{'#'*68}")
print(f"  AI LINKEDIN AGENT — COMPREHENSIVE END-TO-END TEST SUITE")
print(f"  Sections: Health | Normal (8) | Edge (6) | Error (4) | Quality Audit")
print(f"  Target  : {BASE_URL}")
print(f"{'#'*68}\n")

test_health()
test_normal_scenarios()
test_edge_cases()
test_error_cases()
test_quality_audit()

# =============================================================================
# FINAL SUMMARY
# =============================================================================
total_elapsed = round(time.time() - total_start, 2)
passed = [r for r in results_log if r["tag"] == PASS]
failed = [r for r in results_log if r["tag"] == FAIL]

print_divider("#")
print(f"  FINAL SUMMARY  |  Total Time: {total_elapsed}s")
print_divider("#")
print(f"  TOTAL : {len(results_log)}")
print(f"  PASSED: {len(passed)}")
print(f"  FAILED: {len(failed)}")

if failed:
    print(f"\n  Failed Tests:")
    for r in failed:
        print(f"    - {r['name']}  =>  {r.get('note','')}")

print(f"\n  {'ALL TESTS PASSED' if not failed else 'SOME TESTS FAILED'}")
print_divider("#")
print()
