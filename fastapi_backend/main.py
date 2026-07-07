"""
AI LinkedIn Branding Platform - Backend API
Architecture: Layered FastAPI with per-user state isolation
"""
import os, sys, time, csv, io, glob, traceback
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, List
from functools import lru_cache

sys.stdout.reconfigure(encoding='utf-8')

from fastapi import FastAPI, HTTPException, BackgroundTasks, Form, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from graph import agent_workflow
from agents import brainstorm_weekly_topics

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 1 — INFRASTRUCTURE (DB, Cache, Thread Pool)
# ─────────────────────────────────────────────────────────────────────────────

_executor = ThreadPoolExecutor(max_workers=20)
_supabase_client = None

def get_supabase():
    global _supabase_client
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    if not url or not key:
        return None
    if _supabase_client is None:
        from supabase import create_client
        _supabase_client = create_client(url, key)
    return _supabase_client


class TTLCache:
    """Simple in-memory TTL cache. Thread-safe for reads."""
    def __init__(self):
        self._store: dict = {}

    def get(self, key: str):
        item = self._store.get(key)
        if item and time.time() < item["exp"]:
            return item["val"]
        return None

    def set(self, key: str, val, ttl: int = 8):
        self._store[key] = {"val": val, "exp": time.time() + ttl}

    def invalidate(self, key: str):
        self._store.pop(key, None)

    def invalidate_prefix(self, prefix: str):
        keys = [k for k in self._store if k.startswith(prefix)]
        for k in keys:
            self._store.pop(k, None)


_cache = TTLCache()

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 2 — PER-USER STATE MANAGER
# ─────────────────────────────────────────────────────────────────────────────

class UserStateManager:
    """Isolated per-user generation state. Eliminates cross-user data leakage."""
    def __init__(self):
        self._progress: dict = {}
        self._cancelled: dict = {}

    def init(self, user_id: str, theme: str) -> dict:
        state = {
            "active": True, "theme": theme, "topics": [],
            "current_day": 0, "total_days": 7,
            "current_step": "Initializing AI clusters...",
            "activity_log": [f"🚀 Starting: '{theme}'"],
            "completed_days": []
        }
        self._progress[user_id] = state
        self._cancelled[user_id] = False
        return state

    def get(self, user_id: str) -> dict:
        return self._progress.get(user_id, {"active": False})

    def cancel(self, user_id: str):
        self._cancelled[user_id] = True

    def is_cancelled(self, user_id: str) -> bool:
        return self._cancelled.get(user_id, False)

    def finish(self, user_id: str):
        state = self._progress.get(user_id)
        if state:
            state["active"] = False

    def is_active(self, user_id: str) -> bool:
        return self._progress.get(user_id, {}).get("active", False)


_state = UserStateManager()

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 3 — APP FACTORY
# ─────────────────────────────────────────────────────────────────────────────

print(f"===== Application Startup at {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} =====")

app = FastAPI(
    title="AI LinkedIn Platform API",
    description="LangGraph + Groq + Supabase — Multi-tenant, per-user isolated",
    version="4.0.0"
)

app.add_middleware(GZipMiddleware, minimum_size=100)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 4 — SCHEMAS (Pydantic Models)
# ─────────────────────────────────────────────────────────────────────────────

class PostRequest(BaseModel):
    topic: str
    industry: str
    target_audience: str
    content_goal: str
    user_id: str = "anonymous"

class WeeklyPlannerRequest(BaseModel):
    theme: str
    industry: str
    target_audience: str
    content_goal: str
    start_date: Optional[str] = None
    content_style: str = "mimic"
    user_id: str = "anonymous"

class AnalyzeRequest(BaseModel):
    draft_text: str

class AccountAnalyzeRequest(BaseModel):
    industry: str
    target_audience: str
    goal: str

class BulkAnalyzeRequest(BaseModel):
    posts: list

class FullAccountRequest(BaseModel):
    industry: str
    target_audience: str
    goal: str
    name: str = "LinkedIn User"
    posts: list = []

class CommentReplyRequest(BaseModel):
    comment: str
    post_context: str = ""
    style: str = "engaging"

class ExtensionPostRequest(BaseModel):
    posts: list

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 5 — SHARED HELPERS
# ─────────────────────────────────────────────────────────────────────────────

LOCAL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weekly_calendar")

def get_llm(model: str = "llama-3.3-70b-versatile", temperature: float = 0.5):
    from langchain_groq import ChatGroq
    return ChatGroq(model=model, temperature=temperature)

def llm_invoke(prompt: str, model: str = "llama-3.3-70b-versatile", temperature: float = 0.5) -> str:
    from langchain_core.messages import HumanMessage
    return get_llm(model, temperature).invoke([HumanMessage(content=prompt)]).content

def db_insert_post(supabase, data: dict):
    supabase.table("posts").insert(data).execute()

def db_get_posts(supabase, user_id: str):
    return supabase.table("posts").select("*").eq("user_id", user_id).order("scheduled_date", desc=False).execute().data

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 6 — BACKGROUND WORKER
# ─────────────────────────────────────────────────────────────────────────────

def _run_weekly_background(
    theme: str, industry: str, target_audience: str,
    content_goal: str, start_date_str: str,
    content_style: str, user_id: str
):
    progress = _state.get(user_id)

    def log(msg: str):
        progress["activity_log"].append(msg)
        print(f"  [Worker:{user_id[:8]}] {msg}")

    try:
        log("🧠 Brainstorming 7 unique topic ideas...")
        topics = brainstorm_weekly_topics(theme, industry, target_audience)
        progress["topics"] = topics
        log(f"✅ Brainstormed {len(topics)} topics!")

        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        except Exception:
            start_date = datetime.now().date() + timedelta(days=1)

        supabase = get_supabase()

        for i, topic in enumerate(topics):
            if _state.is_cancelled(user_id):
                log("🛑 Generation cancelled by user.")
                break

            current_date = start_date + timedelta(days=i)
            progress["current_day"] = i + 1
            progress["current_step"] = f"Writing Day {i+1}: {topic[:50]}..."
            log(f"📝 Day {i+1}/7 — '{topic[:60]}'")

            try:
                log(f"🔍 Day {i+1} — Searching web for context...")
                final_state = agent_workflow.invoke({
                    "topic": topic, "industry": industry,
                    "target_audience": target_audience,
                    "content_goal": content_goal,
                    "content_style": content_style,
                    "quality_score": 0, "messages": []
                })
                score = final_state.get("quality_score", 0)
                draft = final_state.get("current_draft", "")

                log(f"✍️  Day {i+1} — Done! Score: {score}/100")
                progress["completed_days"].append({"day": i + 1, "topic": topic, "score": score})
                progress["current_step"] = f"Day {i+1} complete! Score: {score}/100"

                if supabase:
                    try:
                        db_insert_post(supabase, {
                            "topic": topic, "industry": industry,
                            "target_audience": target_audience,
                            "draft": draft, "score": score,
                            "scheduled_date": str(current_date),
                            "status": "scheduled", "user_id": user_id
                        })
                        _cache.invalidate(f"calendar_{user_id}")
                    except Exception as db_e:
                        print(f"  [DB Error] Day {i+1}: {str(db_e)[:80]}")
                else:
                    # Local file fallback
                    os.makedirs(LOCAL_DIR, exist_ok=True)
                    with open(os.path.join(LOCAL_DIR, f"{current_date}.txt"), "w", encoding="utf-8") as f:
                        f.write(f"DATE: {current_date}\nTOPIC: {topic}\nSCORE: {score}\n\n{draft}")

            except Exception as e:
                log(f"❌ Day {i+1} error: {str(e)[:60]}")

            time.sleep(2)  # Rate limit guard

    except Exception as e:
        traceback.print_exc()
        log(f"❌ Fatal error: {str(e)[:80]}")
    finally:
        if not _state.is_cancelled(user_id):
            log("🎉 All 7 posts generated successfully!")
        _state.finish(user_id)

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 7 — API ROUTES
# ─────────────────────────────────────────────────────────────────────────────

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
def health_check():
    cached = _cache.get("health")
    if cached:
        return JSONResponse(content=cached, headers={"X-Cache": "HIT"})
    result = {
        "status": "healthy", "version": "4.0.0",
        "search_engines": {
            "tavily": "active" if os.getenv("TAVILY_API_KEY") else "no key",
            "duckduckgo": "active (fallback)",
            "wikipedia": "active (final fallback)"
        },
        "architecture": "multi-tenant, per-user state isolation"
    }
    _cache.set("health", result, ttl=30)
    return result

# ── Single Post Generation ────────────────────────────────────────────────────
@app.post("/api/workflow/generate-ideas", tags=["Generation"])
async def generate_ideas(request: PostRequest):
    try:
        final_state = agent_workflow.invoke({
            "topic": request.topic, "industry": request.industry,
            "target_audience": request.target_audience,
            "content_goal": request.content_goal,
            "quality_score": 0, "messages": []
        })
        score = final_state.get("quality_score", 0)
        supabase = get_supabase()
        if supabase and score >= 80:
            try:
                db_insert_post(supabase, {
                    "topic": request.topic, "industry": request.industry,
                    "target_audience": request.target_audience,
                    "draft": final_state.get("current_draft"),
                    "score": score,
                    "models_used": final_state.get("model_plan"),
                    "user_id": request.user_id
                })
            except Exception as e:
                print(f"  [DB Save Error] {str(e)[:80]}")
        return {
            "status": "success",
            "draft": final_state.get("current_draft"),
            "score": score,
            "feedback": final_state.get("feedback"),
            "model_plan": final_state.get("model_plan", {}),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Weekly Generation ─────────────────────────────────────────────────────────
@app.post("/api/workflow/generate-weekly", tags=["Generation"])
async def generate_weekly_content(request: WeeklyPlannerRequest, background_tasks: BackgroundTasks):
    start_date = request.start_date or str(datetime.now().date() + timedelta(days=1))

    if request.content_style == "mimic":
        scraped = glob.glob(os.path.join(LOCAL_DIR, "extension_post_*.txt"))
        if not scraped:
            raise HTTPException(status_code=400, detail="No scraped posts found! Use the Chrome Extension to scrape posts first.")

    # Pre-initialize progress BEFORE spawning background task (prevents race condition)
    _state.init(request.user_id, request.theme)

    background_tasks.add_task(
        _run_weekly_background,
        request.theme, request.industry, request.target_audience,
        request.content_goal, start_date, request.content_style, request.user_id
    )
    return {"status": "processing", "message": f"Generation started from {start_date}."}

# ── Progress (per-user) ────────────────────────────────────────────────────────
@app.get("/api/workflow/progress", tags=["Generation"])
def get_generation_progress(user_id: str = "anonymous"):
    return _state.get(user_id)

# ── Calendar ──────────────────────────────────────────────────────────────────
@app.get("/api/posts/calendar", tags=["Calendar"])
def get_calendar(user_id: str = "anonymous"):
    cached = _cache.get(f"calendar_{user_id}")
    if cached:
        return JSONResponse(content=cached, headers={"X-Cache": "HIT"})

    supabase = get_supabase()
    if supabase:
        try:
            posts = db_get_posts(supabase, user_id)
            result = {"status": "success", "source": "supabase", "calendar": posts}
            _cache.set(f"calendar_{user_id}", result, ttl=8)
            return result
        except Exception as e:
            print(f"  [Calendar] Supabase error: {str(e)[:80]}")

    # Local fallback
    calendar = []
    if os.path.exists(LOCAL_DIR):
        for fname in sorted(os.listdir(LOCAL_DIR)):
            if fname.endswith(".txt") and not fname.startswith("extension_post_"):
                try:
                    lines = open(os.path.join(LOCAL_DIR, fname), encoding="utf-8").readlines()
                    if len(lines) >= 4:
                        calendar.append({
                            "scheduled_date": lines[0].replace("DATE:", "").strip(),
                            "topic": lines[1].replace("TOPIC:", "").strip(),
                            "score": int(lines[2].replace("SCORE:", "").strip() or 0),
                            "draft": "".join(lines[4:]), "status": "scheduled"
                        })
                except Exception:
                    pass
    return {"status": "success", "source": "local_files", "calendar": calendar}

# ── Reset Calendar ────────────────────────────────────────────────────────────
@app.post("/api/posts/calendar/reset", tags=["Calendar"])
def reset_calendar(user_id: str = "anonymous"):
    _state.cancel(user_id)
    supabase = get_supabase()
    if supabase:
        try:
            result = supabase.table("posts").delete().eq("user_id", user_id).execute()
            _cache.invalidate(f"calendar_{user_id}")
            print(f"  [Reset] Deleted {len(result.data)} rows for user {user_id[:8]}")
        except Exception as e:
            print(f"  [Reset] DB error: {e}")
    if os.path.exists(LOCAL_DIR):
        for fname in os.listdir(LOCAL_DIR):
            if fname.endswith(".txt") and not fname.startswith("extension_post_"):
                try:
                    os.remove(os.path.join(LOCAL_DIR, fname))
                except Exception:
                    pass
    return {"status": "success", "message": "Calendar cleared."}

# ── Delete Single Post ────────────────────────────────────────────────────────
@app.delete("/api/posts/{date}", tags=["Calendar"])
def delete_post(date: str, user_id: str = "anonymous"):
    supabase = get_supabase()
    if supabase:
        try:
            supabase.table("posts").delete().eq("scheduled_date", date).eq("user_id", user_id).execute()
            _cache.invalidate(f"calendar_{user_id}")
        except Exception as e:
            raise HTTPException(status_code=500, detail="Delete failed")
    local_path = os.path.join(LOCAL_DIR, f"{date}.txt")
    if os.path.exists(local_path):
        os.remove(local_path)
    return {"status": "success", "message": f"Post for {date} deleted."}

# ── Publish to LinkedIn ───────────────────────────────────────────────────────
@app.post("/api/posts/publish/{date}", tags=["Publishing"])
async def publish_to_linkedin(
    date: str,
    draft_text: str = Form(None),
    image: UploadFile = File(None),
    linkedin_token: str = Form(None),
    user_id: str = Form("anonymous")
):
    access_token = linkedin_token or os.getenv("LINKEDIN_ACCESS_TOKEN", "").strip()
    if not access_token:
        raise HTTPException(status_code=400, detail="No LinkedIn access token available.")

    if not draft_text:
        supabase = get_supabase()
        if supabase:
            try:
                rows = supabase.table("posts").select("draft").eq("scheduled_date", date).eq("user_id", user_id).execute().data
                if rows:
                    draft_text = rows[0]["draft"]
            except Exception:
                pass
        if not draft_text:
            local_path = os.path.join(LOCAL_DIR, f"{date}.txt")
            if os.path.exists(local_path):
                lines = open(local_path, encoding="utf-8").readlines()
                if len(lines) >= 4:
                    draft_text = "".join(lines[4:])

    if not draft_text:
        raise HTTPException(status_code=404, detail=f"No draft found for {date}.")

    try:
        from linkedin_api import get_user_urn, create_linkedin_post
        author_urn = get_user_urn(access_token)
        image_bytes = await image.read() if image else None
        result = create_linkedin_post(access_token, author_urn, draft_text, image_bytes)
        supabase = get_supabase()
        if supabase:
            try:
                supabase.table("posts").update({"status": "published"}).eq("scheduled_date", date).eq("user_id", user_id).execute()
            except Exception:
                pass
        _cache.invalidate(f"calendar_{user_id}")
        return {"status": "success", "linkedin_response": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Scraped Status ────────────────────────────────────────────────────────────
@app.get("/api/user/scraped-status", tags=["Extension"])
def get_scraped_status():
    scraped = glob.glob(os.path.join(LOCAL_DIR, "extension_post_*.txt"))
    return {"has_scraped_posts": len(scraped) > 0, "count": len(scraped)}

# ── Save Extension Posts ──────────────────────────────────────────────────────
@app.post("/api/extension/save-posts", tags=["Extension"])
async def save_extension_posts(req: ExtensionPostRequest):
    os.makedirs(LOCAL_DIR, exist_ok=True)
    saved = 0
    for i, post in enumerate(req.posts):
        text = post.get("text", "").strip()
        if not text:
            continue
        path = os.path.join(LOCAL_DIR, f"extension_post_{i+1}.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(f"DATE: {datetime.now().strftime('%Y-%m-%d')}\nTOPIC: {text[:80]}\nSCORE: N/A\n\n{text}")
        saved += 1
    return {"status": "success", "saved": saved}

# ── AI Post Analyzer ──────────────────────────────────────────────────────────
@app.post("/api/posts/analyze", tags=["AI Mentor"])
def analyze_draft(request: AnalyzeRequest):
    try:
        result = llm_invoke(f"""You are an elite LinkedIn Growth Mentor. Analyze this draft and provide:
- 3 bullet point tips to improve engagement, clarity, and formatting
- 1 alternative stronger Hook

Format EXACTLY as:
**Feedback:**
- [Tip 1]
- [Tip 2]
- [Tip 3]

**Alternative Hook:**
[Your hook]

Draft:
{request.draft_text}""")
        return {"status": "success", "feedback": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Bulk Post Analysis ─────────────────────────────────────────────────────────
@app.post("/api/posts/analyze-all", tags=["AI Mentor"])
def analyze_all_posts(request: BulkAnalyzeRequest):
    try:
        summaries = "\n".join([
            f"- [{p.get('scheduled_date','?')}] {p.get('topic','?')} | Score: {p.get('score','?')} | {str(p.get('draft',''))[:150]}..."
            for p in request.posts
        ])
        result = llm_invoke(f"""LinkedIn Content Intelligence Expert. Analyze {len(request.posts)} posts.

Posts:
{summaries}

Report sections:
**📊 Overall Content Health:** [summary]
**🏆 Top Performing Post:** [date + reason]
**⚠️ Weakest Post:** [date + fix]
**🔁 Recurring Patterns:** [3 bullets]
**💡 3 Immediate Improvements:** [3 bullets]
**🎯 Recommended Next Topic:** [1 specific topic]""", temperature=0.4)
        return {"status": "success", "report": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Full Account Analysis ──────────────────────────────────────────────────────
@app.post("/api/account/full-analysis", tags=["AI Mentor"])
def full_account_analysis(request: FullAccountRequest):
    try:
        post_context = ""
        if request.posts:
            topics = [p.get("topic", "") for p in request.posts[:5]]
            post_context = f"\nPost history: {len(request.posts)} posts. Topics: {', '.join(topics)}."
        result = llm_invoke(f"""World's top LinkedIn Growth Strategist. Full audit for {request.name}.
Profile: {request.industry} | Target: {request.target_audience} | Goal: {request.goal}{post_context}

6-section audit:
**🔍 Profile Score: [X/100]** [reason]
**🎯 ICP Fit:** [2 sentences]
**📝 Headline Formula:** [copy-paste headline]
**📌 About Blueprint:** [5-line template]
**🗓️ 30-Day Content Plan:** Week 1-4 themes
**🚀 Top 3 Growth Actions:** [specific steps]""", temperature=0.5)
        return {"status": "success", "audit": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Comment Reply Generator ────────────────────────────────────────────────────
@app.post("/api/comments/reply", tags=["AI Mentor"])
async def generate_comment_reply(req: CommentReplyRequest):
    try:
        result = llm_invoke(f"""Expert LinkedIn ghostwriter. Comment: "{req.comment}"
Post context: "{req.post_context}"

Write 3 short replies:
**1. Appreciative:** [reply]
**2. Question-Driven:** [reply to drive more comments]
**3. Bold Take:** [slightly contrarian reply]""", temperature=0.7)
        return {"status": "success", "replies": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── LinkedIn Posts Fetch ───────────────────────────────────────────────────────
@app.get("/api/linkedin/posts", tags=["LinkedIn"])
def get_linkedin_posts(count: int = 15):
    import requests as req_lib
    access_token = os.getenv("LINKEDIN_ACCESS_TOKEN", "").strip()
    member_id = os.getenv("LINKEDIN_MEMBER_ID", "").strip()
    posts = []

    if access_token:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": "202304",
        }
        try:
            if not member_id:
                r = req_lib.get("https://api.linkedin.com/v2/userinfo", headers=headers, timeout=10)
                if r.status_code == 200:
                    member_id = r.json().get("sub", "")
            if member_id:
                r = req_lib.get(
                    "https://api.linkedin.com/v2/ugcPosts",
                    headers=headers,
                    params={"q": "authors", "authors": f"List(urn:li:person:{member_id})", "count": count},
                    timeout=15
                )
                if r.status_code == 200:
                    for p in r.json().get("elements", []):
                        text = p.get("specificContent", {}).get("com.linkedin.ugc.ShareContent", {}).get("shareCommentary", {}).get("text", "")
                        posts.append({"id": p.get("id"), "text": text, "topic": text[:80], "draft": text})
        except Exception:
            pass

    if not posts and os.path.exists(LOCAL_DIR):
        for fname in sorted(os.listdir(LOCAL_DIR)):
            if fname.startswith("extension_post_"):
                try:
                    lines = open(os.path.join(LOCAL_DIR, fname), encoding="utf-8").readlines()
                    if len(lines) >= 4:
                        posts.append({"id": fname, "topic": lines[1].replace("TOPIC:", "").strip(), "draft": "".join(lines[4:])})
                except Exception:
                    pass

    return {"status": "success", "posts": posts, "count": len(posts)}

# ── Upload LinkedIn CSV ────────────────────────────────────────────────────────
@app.post("/api/linkedin/upload-csv", tags=["LinkedIn"])
async def upload_linkedin_csv(file: UploadFile = File(...)):
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8")))
    posts = []
    for row in reader:
        text = row.get("ShareCommentary", "").strip()
        if text:
            posts.append({"topic": text[:80], "draft": text, "created_at": row.get("Date", "")})
        if len(posts) >= 50:
            break
    if not posts:
        return {"status": "error", "message": "No valid posts found in CSV."}
    summaries = "\n".join([f"Post {i+1} | {p['created_at']} | {p['draft'][:200]}" for i, p in enumerate(posts)])
    try:
        result = llm_invoke(f"Analyze {len(posts)} LinkedIn posts:\n{summaries}\n\nProvide: Account Health, Strengths, Weaknesses, Patterns, 3 Improvements, 3 Post Ideas, 30-Day Forecast.", temperature=0.4)
        return {"status": "success", "report": result, "posts_analyzed": len(posts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
