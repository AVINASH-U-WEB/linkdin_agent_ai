import os
import sys
import time
import asyncio
from functools import wraps
from concurrent.futures import ThreadPoolExecutor
sys.stdout.reconfigure(encoding='utf-8')
from fastapi import FastAPI, HTTPException, BackgroundTasks, Form, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from datetime import datetime, timedelta
from graph import agent_workflow
from agents import brainstorm_weekly_topics

# ── Thread pool for running sync Supabase calls without blocking the event loop
_executor = ThreadPoolExecutor(max_workers=20)

# ── Shared Supabase singleton (avoid creating a new client on every request)
_supabase_client = None
def get_supabase():
    global _supabase_client
    supa_url = os.getenv("SUPABASE_URL", "").strip()
    supa_key = os.getenv("SUPABASE_KEY", "").strip()
    if not supa_url or not supa_key:
        return None
    if _supabase_client is None:
        from supabase import create_client
        _supabase_client = create_client(supa_url, supa_key)
    return _supabase_client

# ── Simple in-memory TTL cache
class TTLCache:
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

_cache = TTLCache()

# ── Global flags
generation_cancelled_flag = False

# ── Global generation progress tracker
generation_progress = {
    "active": False,
    "theme": "",
    "topics": [],
    "current_day": 0,
    "total_days": 0,
    "current_step": "",
    "activity_log": [],
    "completed_days": []
}

app = FastAPI(
    title="AI LinkedIn Branding Platform API",
    description="FastAPI backend — LangGraph + Groq + Live Web Search",
    version="3.0.0"
)

# ── Middlewares (order matters)
app.add_middleware(GZipMiddleware, minimum_size=100)  # compress responses > 100 bytes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PostRequest(BaseModel):
    topic: str
    industry: str
    target_audience: str
    content_goal: str

@app.post("/api/workflow/generate-ideas")
async def generate_ideas(request: PostRequest):
    """
    Runs the full LangGraph agentic workflow:
    memory → research (live web search) → trends (live) → brand_voice
    → idea → writer → critic → (rewrite if score < 85) → END
    """
    try:
        initial_state = {
            "topic":           request.topic,
            "industry":        request.industry,
            "target_audience": request.target_audience,
            "content_goal":    request.content_goal,
            "quality_score":   0,
            "messages":        []
        }

        final_state = agent_workflow.invoke(initial_state)

        response_data = {
            "status":           "success",
            "ideas":            final_state.get("ideas"),
            "draft":            final_state.get("current_draft"),
            "score":            final_state.get("quality_score"),
            "feedback":         final_state.get("feedback"),
            "research_sources": final_state.get("research_context"),
            "trends":           final_state.get("trend_context"),
            # NEW: show which models were auto-selected and why
            "model_plan":       final_state.get("model_plan", {}),
            "model_reasoning":  final_state.get("model_reasoning", ""),
        }

        # Background: Save to Supabase
        supa_url = os.getenv("SUPABASE_URL", "").strip()
        supa_key = os.getenv("SUPABASE_KEY", "").strip()
        if supa_url and supa_key and final_state.get("quality_score", 0) >= 80:
            try:
                from supabase import create_client
                supabase = create_client(supa_url, supa_key)
                supabase.table("posts").insert({
                    "topic": request.topic,
                    "industry": request.industry,
                    "target_audience": request.target_audience,
                    "draft": final_state.get("current_draft"),
                    "score": final_state.get("quality_score"),
                    "models_used": final_state.get("model_plan")
                }).execute()
            except Exception as db_e:
                print(f"  [DB Save Error] {str(db_e)[:80]}")

        return response_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    cached = _cache.get("health")
    if cached:
        return cached
    tavily_ready = bool(os.getenv("TAVILY_API_KEY", "").strip())
    result = {
        "status":   "healthy",
        "version":  "3.0.0",
        "search_engines": {
            "tavily":     "active" if tavily_ready else "no key — skipped",
            "duckduckgo": "active (fallback)",
            "wikipedia":  "active (final fallback)",
        },
        "llm_models": [
            "llama-3.3-70b-versatile (primary)",
            "llama-3.1-8b-instant (fallback 1)",
            "gemma2-9b-it (fallback 2)",
            "mixtral-8x7b-32768 (fallback 3)",
        ],
        "style": "5-Zone viral content engine"
    }
    _cache.set("health", result, ttl=30)  # cache 30s
    return result


class WeeklyPlannerRequest(BaseModel):
    theme: str
    industry: str
    target_audience: str
    content_goal: str
    start_date: str = None  # Format: YYYY-MM-DD
    content_style: str = "mimic"


def generate_weekly_background(
    theme: str,
    industry: str,
    target_audience: str,
    content_goal: str,
    start_date_str: str,
    content_style: str = "mimic"
):
    global generation_cancelled_flag, generation_progress
    generation_cancelled_flag = False
    generation_progress = {
        "active": True,
        "theme": theme,
        "topics": [],
        "current_day": 0,
        "total_days": 7,
        "current_step": "Brainstorming topics...",
        "activity_log": [f"🚀 Starting generation for theme: '{theme}'"],
        "completed_days": []
    }
    try:
        import time, traceback
        print(f"  [Background Weekly] Worker started for theme: '{theme}'")
        # 1. Brainstorm topics
        generation_progress["activity_log"].append("🧠 AI is brainstorming 7 unique topic ideas...")
        topics = brainstorm_weekly_topics(theme, industry, target_audience)
        generation_progress["topics"] = topics
        generation_progress["activity_log"].append(f"✅ Brainstormed {len(topics)} topics!")
        print(f"  [Background Weekly] Brainstormed topics: {topics}")

        # Parse start date
        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        except Exception:
            start_date = datetime.now().date() + timedelta(days=1)

        supa_url = os.getenv("SUPABASE_URL", "").strip()
        supa_key = os.getenv("SUPABASE_KEY", "").strip()

        # 2. Run graph sequentially with a tiny delay to prevent Groq rate limit traffic jams
        for i, topic in enumerate(topics):
            if generation_cancelled_flag:
                print("  [Background Weekly] Generation ABORTED due to user reset!")
                generation_progress["active"] = False
                generation_progress["activity_log"].append("🛑 Generation aborted by user.")
                break
                
            current_date = start_date + timedelta(days=i)
            generation_progress["current_day"] = i + 1
            generation_progress["current_step"] = f"Writing Day {i+1}: {topic[:50]}..."
            generation_progress["activity_log"].append(f"📝 Day {i+1}/7 — Starting: '{topic[:60]}'")
            print(f"  [Background Weekly] Starting Day {i+1}/7: '{topic}'...")

            initial_state = {
                "topic":           topic,
                "industry":        industry,
                "target_audience": target_audience,
                "content_goal":    content_goal,
                "content_style":   content_style,
                "quality_score":   0,
                "messages":        []
            }

            try:
                generation_progress["activity_log"].append(f"🔍 Day {i+1} — Searching web for trends & context...")
                generation_progress["current_step"] = f"Searching trends for Day {i+1}..."
                final_state = agent_workflow.invoke(initial_state)
                score = final_state.get("quality_score", 0)
                draft = final_state.get("current_draft", "")

                generation_progress["activity_log"].append(f"✍️  Day {i+1} — Writing post with AI (Score: {score}/100)")
                generation_progress["completed_days"].append({"day": i+1, "topic": topic, "score": score})
                generation_progress["current_step"] = f"Day {i+1} complete! Score: {score}/100"
                print(f"  [Background Weekly] Day {i+1}/7 Completed! Score: {score}/100")

                # Save to database if configured
                supabase = get_supabase()
                if supabase:
                    try:
                        supabase.table("posts").insert({
                            "topic": topic,
                            "industry": industry,
                            "target_audience": target_audience,
                            "draft": draft,
                            "score": score,
                            "scheduled_date": str(current_date),
                            "status": "scheduled"
                        }).execute()
                        _cache.invalidate("calendar")  # bust cache on new post
                        print(f"  [Background Weekly] Saved Day {i+1} to database")
                    except Exception as db_e:
                        print(f"  [Background Weekly DB Error] Day {i+1}: {str(db_e)[:80]}")
                else:
                    # Local file backup
                    local_dir = os.path.join(os.getcwd(), "weekly_calendar")
                    os.makedirs(local_dir, exist_ok=True)
                    file_path = os.path.join(local_dir, f"{current_date}.txt")
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(f"DATE: {current_date}\nTOPIC: {topic}\nSCORE: {score}\n\n{draft}")
                    print(f"  [Background Weekly] Saved locally to {file_path}")
            except Exception as graph_e:
                print(f"  [Background Weekly Error] Day {i+1}: {str(graph_e)}")
            
            # Small delay to prevent API rate limit traffic jam
            time.sleep(2)

    except Exception as e:
        print(f"  [Background Weekly Overall Error] {str(e)}")
        traceback.print_exc()
        generation_progress["active"] = False
        generation_progress["activity_log"].append(f"❌ Error: {str(e)[:80]}")
    finally:
        if not generation_cancelled_flag:
            generation_progress["active"] = False
            generation_progress["activity_log"].append("🎉 All 7 posts generated successfully!")


@app.get("/api/workflow/progress")
def get_generation_progress():
    """Returns the live progress of the background generation task."""
    return generation_progress


@app.get("/api/user/scraped-status")
def get_scraped_status():
    """Returns whether the user has scraped any LinkedIn posts locally."""
    import glob
    local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weekly_calendar")
    scraped_files = glob.glob(os.path.join(local_dir, "extension_post_*.txt"))
    return {
        "has_scraped_posts": len(scraped_files) > 0,
        "count": len(scraped_files)
    }


@app.post("/api/workflow/generate-weekly")
async def generate_weekly_content(request: WeeklyPlannerRequest, background_tasks: BackgroundTasks):
    """
    Trigger batch generation of 7 posts for the week based on an overarching theme.
    Returns immediately, runs the scheduler in the background.
    """
    start_date = request.start_date
    if not start_date:
        start_date = str(datetime.now().date() + timedelta(days=1))

    # Strict Validation: If user requests 'mimic' (Scraped Style), enforce that they actually scraped posts!
    if request.content_style == "mimic":
        import glob
        local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weekly_calendar")
        scraped_files = glob.glob(os.path.join(local_dir, "extension_post_*.txt"))
        if not scraped_files:
            raise HTTPException(
                status_code=400, 
                detail="No scraped posts found! Since you selected 'Use My LinkedIn Style', you MUST use the Chrome Extension to scrape your LinkedIn posts first before generating."
            )

    background_tasks.add_task(
        generate_weekly_background,
        request.theme,
        request.industry,
        request.target_audience,
        request.content_goal,
        start_date,
        request.content_style
    )

    return {
        "status": "processing",
        "message": f"Weekly content generation started! If you synced posts, it will use your voice. Otherwise, it will use the optimal 5-zone framework. Starting from {start_date}."
    }


@app.post("/api/posts/calendar/reset")
def reset_calendar():
    """Clears the calendar from Supabase and local storage (without deleting scraped posts)."""
    global generation_cancelled_flag
    generation_cancelled_flag = True

    supa_url = os.getenv("SUPABASE_URL", "").strip()
    supa_key = os.getenv("SUPABASE_KEY", "").strip()
    
    # 1. Clear Supabase
    supabase = get_supabase()
    if supabase:
        try:
            result = supabase.table("posts").delete().gte("created_at", "2000-01-01").execute()
            print(f"  [Reset] Supabase cleared. Rows deleted: {len(result.data)}")
            _cache.invalidate("calendar")  # bust calendar cache immediately
        except Exception as e:
            print(f"  [Reset] Supabase reset FAILED: {e}")

    # 2. Clear Local files (ONLY generated dates, NOT extension scraped posts)
    local_dir = os.path.join(os.getcwd(), "weekly_calendar")
    if os.path.exists(local_dir):
        for file_name in os.listdir(local_dir):
            if file_name.endswith(".txt") and not file_name.startswith("extension_post_"):
                try:
                    os.remove(os.path.join(local_dir, file_name))
                except Exception:
                    pass
                    
    return {"status": "success", "message": "Calendar cleared successfully."}

@app.delete("/api/posts/{date}")
def delete_post(date: str):
    """Deletes a single scheduled post by date."""
    supabase = get_supabase()
    if supabase:
        try:
            supabase.table("posts").delete().eq("scheduled_date", date).execute()
            _cache.invalidate("calendar")
        except Exception as e:
            print(f"  [Delete] Supabase delete FAILED: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete from database")

    # Clear local file if exists
    local_dir = os.path.join(os.getcwd(), "weekly_calendar")
    if os.path.exists(local_dir):
        file_path = os.path.join(local_dir, f"{date}.txt")
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
                
    return {"status": "success", "message": f"Post for {date} deleted."}

@app.post("/api/posts/publish/{date}")
async def publish_to_linkedin(date: str, draft_text: str = Form(None), image: UploadFile = File(None), linkedin_token: str = Form(None)):
    """
    Publishes a scheduled post for a specific date directly to LinkedIn.
    Uses the user's own LinkedIn token if provided, otherwise falls back to .env token.
    """
    # Use the signed-in user's token first, fallback to .env token
    access_token = linkedin_token or os.getenv("LINKEDIN_ACCESS_TOKEN", "").strip()
    if not access_token:
        raise HTTPException(status_code=400, detail="No LinkedIn access token available. Please sign in with LinkedIn or configure LINKEDIN_ACCESS_TOKEN in .env")

    # Try Supabase first
    supa_url = os.getenv("SUPABASE_URL", "").strip()
    supa_key = os.getenv("SUPABASE_KEY", "").strip()

    if not draft_text:
        if supa_url and supa_key:
            try:
                from supabase import create_client
                supabase = create_client(supa_url, supa_key)
                response = supabase.table("posts").select("draft").eq("scheduled_date", date).execute()
                if response.data:
                    draft_text = response.data[0]["draft"]
            except Exception:
                pass

        # Fallback to local
        if not draft_text:
            local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weekly_calendar")
            file_path = os.path.join(local_dir, f"{date}.txt")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                if len(lines) >= 4:
                    draft_text = "".join(lines[4:])

    if not draft_text:
        raise HTTPException(status_code=404, detail=f"No scheduled draft found for {date} and none provided.")

    try:
        from linkedin_api import get_user_urn, create_linkedin_post
        author_urn = get_user_urn(access_token)
        
        image_bytes = None
        if image:
            image_bytes = await image.read()
            
        result = create_linkedin_post(access_token, author_urn, draft_text, image_bytes)

        # Update status locally
        if supa_url and supa_key:
            try:
                supabase.table("posts").update({"status": "published"}).eq("scheduled_date", date).execute()
            except:
                pass
                
        return {"status": "success", "linkedin_response": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AnalyzeRequest(BaseModel):
    draft_text: str

@app.post("/api/posts/analyze")
def analyze_draft(request: AnalyzeRequest):
    """
    AI Mentor: Analyzes a draft and provides actionable feedback and suggestions.
    """
    try:
        from langchain_groq import ChatGroq
        from langchain_core.messages import HumanMessage
        
        # We use a reliable Groq model for fast analysis
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.5)
        
        prompt = f"""You are an elite LinkedIn Growth Mentor. Analyze the following post draft and provide structured feedback.
Do NOT rewrite the post entirely. Instead, provide a bulleted list of 3 actionable tips to improve engagement, clarity, and formatting. Then, provide 1 strong alternative Hook.

Format your response EXACTLY like this:
**Feedback:**
- [Tip 1]
- [Tip 2]
- [Tip 3]

**Alternative Hook:**
[Your suggested hook]

Draft to analyze:
{request.draft_text}
"""
        response = llm.invoke([HumanMessage(content=prompt)])
        return {"status": "success", "feedback": response.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AccountAnalyzeRequest(BaseModel):
    industry: str
    target_audience: str
    goal: str

@app.post("/api/account/analyze")
def analyze_account(request: AccountAnalyzeRequest):
    """
    AI Mentor: Performs a high-level account strategy analysis.
    """
    try:
        from langchain_groq import ChatGroq
        from langchain_core.messages import HumanMessage
        
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.6)
        
        prompt = f"""You are an elite LinkedIn Growth Expert. The user wants an 'Account Analysis' to optimize their entire LinkedIn profile and content strategy.
They operate in the '{request.industry}' industry, targeting '{request.target_audience}', with a primary goal of '{request.goal}'.

Provide a comprehensive, highly actionable 3-part strategy:
1. **Profile Optimization:** 2 specific changes they must make to their banner, headline, or about section.
2. **Content Pillars:** 3 specific content themes they should rotate between to attract their target audience.
3. **Engagement Strategy:** 1 specific networking/commenting tactic to hit their goal.

Make it punchy, professional, and directly tailored to their industry and goal.
"""
        response = llm.invoke([HumanMessage(content=prompt)])
        return {"status": "success", "analysis": response.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class BulkAnalyzeRequest(BaseModel):
    posts: list  # list of {topic, draft, score, scheduled_date}

@app.post("/api/posts/analyze-all")
def analyze_all_posts(request: BulkAnalyzeRequest):
    """
    AI Mentor: Analyzes ALL posts at once and returns a bulk performance report.
    """
    try:
        from langchain_groq import ChatGroq
        from langchain_core.messages import HumanMessage

        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.4)

        post_summaries = "\n".join([
            f"- [{p.get('scheduled_date','?')}] Topic: '{p.get('topic','?')}' | Score: {p.get('score','?')} | Draft (first 200 chars): {str(p.get('draft',''))[:200]}..."
            for p in request.posts
        ])

        prompt = f"""You are a LinkedIn Content Intelligence Expert. Analyze this batch of {len(request.posts)} LinkedIn posts and produce a structured performance report.

Posts:
{post_summaries}

Produce a report with these EXACT sections:

**📊 Overall Content Health:**
[1 paragraph summary of the overall content quality, consistency, and patterns]

**🏆 Top Performing Post:**
[Date and topic of the highest-scoring post, and WHY it likely performs best]

**⚠️ Weakest Post:**
[Date and topic of the lowest-scoring post, and what specifically needs improvement]

**🔁 Recurring Patterns:**
[2-3 bullet points about recurring themes, writing styles, or topics across all posts]

**💡 3 Immediate Improvements:**
- [Improvement 1]
- [Improvement 2]
- [Improvement 3]

**🎯 Recommended Next Topic:**
[One specific topic they should write next, based on gaps in their current content]
"""
        response = llm.invoke([HumanMessage(content=prompt)])
        return {"status": "success", "report": response.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FullAccountRequest(BaseModel):
    industry: str
    target_audience: str
    goal: str
    name: str = "LinkedIn User"
    posts: list = []  # optional: list of post summaries for context

@app.post("/api/account/full-analysis")
def full_account_analysis(request: FullAccountRequest):
    """
    Deep AI Account Analysis: 6-section comprehensive LinkedIn audit.
    Auto-fetches real LinkedIn posts for context if no posts are passed.
    """
    try:
        import requests as req_lib
        from langchain_groq import ChatGroq
        from langchain_core.messages import HumanMessage

        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.5)

        # --- Auto-fetch real LinkedIn posts if none provided ---
        posts = list(request.posts)
        if not posts:
            access_token = os.getenv("LINKEDIN_ACCESS_TOKEN", "").strip()
            member_id = os.getenv("LINKEDIN_MEMBER_ID", "").strip()
            if access_token and member_id:
                try:
                    headers = {
                        "Authorization": f"Bearer {access_token}",
                        "X-Restli-Protocol-Version": "2.0.0",
                        "LinkedIn-Version": "202304",
                    }
                    author_urn = f"urn:li:person:{member_id}"
                    resp = req_lib.get(
                        "https://api.linkedin.com/v2/ugcPosts",
                        headers=headers,
                        params={"q": "authors", "authors": f"List({author_urn})", "count": 10, "sortBy": "LAST_MODIFIED"},
                        timeout=12,
                    )
                    if resp.status_code == 200:
                        for p in resp.json().get("elements", []):
                            content = p.get("specificContent", {}).get("com.linkedin.ugc.ShareContent", {})
                            text = content.get("shareCommentary", {}).get("text", "")
                            if text:
                                posts.append({"topic": text[:80], "draft": text, "score": "N/A"})
                except Exception:
                    pass

            # Fallback: Local directory
            if not posts:
                local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weekly_calendar")
                if os.path.exists(local_dir):
                    for file_name in sorted(os.listdir(local_dir)):
                        if file_name.endswith(".txt"):
                            with open(os.path.join(local_dir, file_name), "r", encoding="utf-8") as f:
                                lines = f.readlines()
                            if len(lines) >= 4:
                                topic = lines[1].replace("TOPIC:", "").strip()
                                score = lines[2].replace("SCORE:", "").strip()
                                draft = "".join(lines[4:])
                                posts.append({"topic": topic, "draft": draft, "score": score})

        post_context = ""
        if posts:
            topics = [p.get("topic", "") for p in posts[:5]]
            post_context = f"\nPost history context: {len(posts)} posts found. Recent topics: {', '.join(topics)}."

        prompt = f"""You are the world's top LinkedIn Growth Strategist. Perform a FULL ACCOUNT AUDIT for {request.name}.
Profile: {request.industry} industry | Target: {request.target_audience} | Goal: {request.goal}{post_context}

Produce a comprehensive 6-section audit with these EXACT headers:

**🔍 Profile Score: [X/100]**
[Score the profile and explain the rating in 2 sentences. Be specific about what's missing.]

**🎯 Ideal Customer Profile (ICP) Fit:**
[2-3 sentences on how well their current strategy targets the right audience, and any misalignment]

**📝 Headline Formula:**
[Write them a specific, optimized headline they can copy-paste. Format: [Role] | [Outcome they deliver] | [Who they help]]

**📌 About Section Blueprint:**
[A 5-line About section template: Hook → Problem → Solution → Proof → CTA]

**🗓️ 30-Day Content Plan:**
Week 1: [Theme + 2 post ideas]
Week 2: [Theme + 2 post ideas]
Week 3: [Theme + 2 post ideas]
Week 4: [Theme + 2 post ideas]

**🚀 Top 3 Growth Actions (This Week):**
1. [Specific action with exact steps]
2. [Specific action with exact steps]
3. [Specific action with exact steps]
"""
        response = llm.invoke([HumanMessage(content=prompt)])
        return {"status": "success", "audit": response.content, "posts_used": len(posts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/linkedin/posts")
def get_linkedin_posts(count: int = 15):
    """Fetches real published posts from the authenticated LinkedIn account."""
    import requests as req_lib
    import os
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
                profile_resp = req_lib.get("https://api.linkedin.com/v2/userinfo", headers=headers, timeout=10)
                if profile_resp.status_code == 200:
                    member_id = profile_resp.json().get("sub", "")
            
            if member_id:
                author_urn = f"urn:li:person:{member_id}"
                posts_resp = req_lib.get(
                    "https://api.linkedin.com/v2/ugcPosts",
                    headers=headers,
                    params={"q": "authors", "authors": f"List({author_urn})", "count": count, "sortBy": "LAST_MODIFIED"},
                    timeout=15,
                )
                if posts_resp.status_code == 200:
                    raw = posts_resp.json().get("elements", [])
                    for p in raw:
                        content = p.get("specificContent", {}).get("com.linkedin.ugc.ShareContent", {})
                        text = content.get("shareCommentary", {}).get("text", "")
                        posts.append({
                            "id": p.get("id", ""),
                            "text": text,
                            "topic": text[:80] + "..." if len(text) > 80 else text,
                            "draft": text,
                            "created_at": p.get("created", {}).get("time", 0),
                        })
        except Exception:
            pass

    # Fallback: Local directory for extension scraped posts
    if not posts:
        local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weekly_calendar")
        if os.path.exists(local_dir):
            for file_name in sorted(os.listdir(local_dir)):
                if file_name.startswith("extension_post_"):
                    with open(os.path.join(local_dir, file_name), "r", encoding="utf-8") as f:
                        lines = f.readlines()
                    if len(lines) >= 4:
                        date = lines[0].replace("DATE:", "").strip()
                        topic = lines[1].replace("TOPIC:", "").strip()
                        score = lines[2].replace("SCORE:", "").strip()
                        draft = "".join(lines[4:])
                        posts.append({
                            "id": file_name,
                            "text": draft,
                            "topic": topic,
                            "draft": draft,
                            "score": score,
                            "created_at": date,
                            "is_ai_draft": False
                        })

    return {"status": "success", "posts": posts, "count": len(posts)}


@app.post("/api/linkedin/analyze-posts")
def analyze_linkedin_posts():
    """
    Automatically fetches ALL real LinkedIn posts and produces a full Post Intelligence Report.
    """
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
                pr = req_lib.get("https://api.linkedin.com/v2/userinfo", headers=headers, timeout=10)
                if pr.status_code == 200:
                    member_id = pr.json().get("sub", "")
            if member_id:
                author_urn = f"urn:li:person:{member_id}"
                resp = req_lib.get(
                    "https://api.linkedin.com/v2/ugcPosts",
                    headers=headers,
                    params={"q": "authors", "authors": f"List({author_urn})", "count": 20, "sortBy": "LAST_MODIFIED"},
                    timeout=15,
                )
                if resp.status_code == 200:
                    for p in resp.json().get("elements", []):
                        content = p.get("specificContent", {}).get("com.linkedin.ugc.ShareContent", {})
                        text = content.get("shareCommentary", {}).get("text", "")
                        if text.strip():
                            posts.append({"topic": text[:80], "draft": text, "score": "N/A"})
        except Exception:
            pass

    # Fallback: Local directory for extension scraped posts
    if not posts:
        local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weekly_calendar")
        if os.path.exists(local_dir):
            for file_name in sorted(os.listdir(local_dir)):
                if file_name.startswith("extension_post_"):
                    with open(os.path.join(local_dir, file_name), "r", encoding="utf-8") as f:
                        lines = f.readlines()
                    if len(lines) >= 4:
                        topic = lines[1].replace("TOPIC:", "").strip()
                        score = lines[2].replace("SCORE:", "").strip()
                        draft = "".join(lines[4:])
                        posts.append({"topic": topic, "draft": draft, "score": score})

    if not posts:
        return {
            "status": "no_posts",
            "report": "⚠️ No posts found. Ensure your LinkedIn access token is valid and you have published posts, OR generate posts via the Dashboard first."
        }

    from langchain_groq import ChatGroq
    from langchain_core.messages import HumanMessage

    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.4)
    summaries = "\n".join([
        f"Post {i+1}: {p.get('topic','Untitled')} | Score: {p.get('score','N/A')} | Content: {str(p.get('draft',''))[:250]}"
        for i, p in enumerate(posts)
    ])

    prompt = f"""You are a LinkedIn Content Intelligence Expert. Analyze {len(posts)} real posts from this LinkedIn account.

POSTS DATA:
{summaries}

Produce a comprehensive Post Intelligence Report with EXACTLY these sections:

**📊 Overall Content Health:**
[2 paragraph assessment of content quality, consistency, and patterns]

**🏆 Top Performing Content Style:**
[What types of posts likely perform best and why, with specific examples from the data]

**⚠️ Critical Weaknesses:**
- [Weakness 1 with specific example from posts]
- [Weakness 2 with specific example from posts]
- [Weakness 3 with specific example from posts]

**🔁 Content Pattern Analysis:**
- [Pattern observation 1]
- [Pattern observation 2]
- [Pattern observation 3]
- [Pattern observation 4]

**💡 5 Immediate Improvements:**
- [Improvement 1 with example]
- [Improvement 2 with example]
- [Improvement 3 with example]
- [Improvement 4 with example]
- [Improvement 5 with example]

**🎯 Next 3 Post Ideas (Tailored to this account's style):**
1. [Post idea with hook line]
2. [Post idea with hook line]
3. [Post idea with hook line]

**📈 30-Day Growth Forecast:**
[Realistic growth expectations if improvements are implemented]
"""

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        return {"status": "success", "report": response.content, "posts_analyzed": len(posts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/posts/calendar")
def get_calendar():
    """
    Retrieves the scheduled content calendar. Cached for 8 seconds to handle burst traffic.
    """
    cached = _cache.get("calendar")
    if cached:
        from fastapi.responses import JSONResponse
        return JSONResponse(content=cached, headers={"X-Cache": "HIT"})

    supabase = get_supabase()
    if supabase:
        try:
            response = supabase.table("posts").select("*").order("scheduled_date", desc=False).execute()
            result = {
                "status": "success",
                "source": "supabase",
                "calendar": response.data
            }
            _cache.set("calendar", result, ttl=8)
            return result
        except Exception as e:
            print(f"  [Calendar] Supabase unavailable ({str(e)[:80]}), falling back to local files...")

    # Fallback to local files if Supabase is not configured
    local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weekly_calendar")
    calendar = []
    if os.path.exists(local_dir):
        try:
            for file_name in sorted(os.listdir(local_dir)):
                if file_name.endswith(".txt") and not file_name.startswith("extension_post_"):
                    file_path = os.path.join(local_dir, file_name)
                    with open(file_path, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                    if len(lines) >= 4:
                        date = lines[0].replace("DATE:", "").strip()
                        topic = lines[1].replace("TOPIC:", "").strip()
                        raw_score = lines[2].replace("SCORE:", "").strip()
                        try:
                            score = int(raw_score)
                        except ValueError:
                            score = 0
                        draft = "".join(lines[4:])
                        calendar.append({
                            "scheduled_date": date,
                            "topic": topic,
                            "score": score,
                            "draft": draft,
                            "status": "scheduled"
                        })
            return {
                "status": "success",
                "source": "local_files",
                "calendar": calendar
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to read local calendar files: {str(e)}"
            }

    return {
        "status": "success",
        "source": "none",
        "calendar": [],
        "message": "No scheduled posts found. Try running generate-weekly first."
    }


from fastapi import UploadFile, File
import csv
import io

@app.post("/api/linkedin/upload-csv")
async def upload_linkedin_csv(file: UploadFile = File(...)):
    """
    Parses LinkedIn's Shares.csv export to bypass the API restrictions entirely.
    """
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    posts = []
    for row in reader:
        text = row.get("ShareCommentary", "")
        if text.strip():
            posts.append({
                "topic": text[:80] + "..." if len(text) > 80 else text,
                "draft": text,
                "score": "N/A",
                "created_at": row.get("Date", "")
            })
            if len(posts) >= 50:  # Limit to last 50 posts for performance
                break
                
    if not posts:
        return {"status": "error", "message": "No valid posts found in CSV. Please ensure it is the LinkedIn Shares.csv file."}
        
    from langchain_groq import ChatGroq
    from langchain_core.messages import HumanMessage
    
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.4)
    summaries = "\n".join([
        f"Post {i+1} | Date: {p.get('created_at','')} | Content: {str(p.get('draft',''))[:250]}"
        for i, p in enumerate(posts)
    ])
    
    prompt = f"""You are a LinkedIn Content Intelligence Expert. Analyze {len(posts)} historical posts from this LinkedIn account archive.
    
POSTS DATA:
{summaries}

Provide a deep-dive intelligence report covering:
1. Overall Account Health
2. Core Strengths
3. Weaknesses / Missing Elements
4. Engagement Patterns (Based on content types)
5. 3 Immediate Improvements
6. Next 3 Post Ideas
7. 30-Day Growth Forecast

Use Markdown formatting. Use emojis. Keep it extremely strategic and actionable.
"""
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        return {"status": "success", "report": response.content, "posts_analyzed": len(posts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class CommentReplyRequest(BaseModel):
    comment: str
    post_context: str = ""
    style: str = "engaging"

@app.post("/api/comments/reply")
async def generate_comment_reply(req: CommentReplyRequest):
    """
    Generates 3 strategic AI replies to a LinkedIn comment.
    """
    from langchain_groq import ChatGroq
    from langchain_core.messages import HumanMessage
    
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.7)
    
    prompt = f"""You are an expert LinkedIn growth strategist and ghostwriter.
A user left this comment on my post: "{req.comment}"
My original post context (optional): "{req.post_context}"

Write 3 different short, engaging replies I can copy/paste to keep the conversation going and boost the LinkedIn algorithm.
Reply 1: Appreciative & Thoughtful
Reply 2: Asking a follow-up question (to drive more comments)
Reply 3: A slightly contrarian or bold take

Format strictly as:
**1. Appreciative:** [Reply]
**2. Question-Driven:** [Reply]
**3. Bold Take:** [Reply]
"""
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        return {"status": "success", "replies": response.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ExtensionPostRequest(BaseModel):
    posts: list

@app.post("/api/extension/save-posts")
async def save_extension_posts(req: ExtensionPostRequest):
    """
    Receives scraped posts directly from the Chrome extension and saves them to local fallbacks.
    """
    import os
    local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weekly_calendar")
    os.makedirs(local_dir, exist_ok=True)
    
    saved_count = 0
    for i, post in enumerate(req.posts):
        text = post.get("text", "").strip()
        if not text: continue
        
        # We will save these simply as extension_post_1.txt, etc.
        file_path = os.path.join(local_dir, f"extension_post_{int(datetime.now().timestamp())}_{i}.txt")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(f"DATE: {datetime.now().strftime('%Y-%m-%d')}\n")
            f.write(f"TOPIC: Scraped from Extension\n")
            f.write(f"SCORE: N/A\n\n")
            f.write(text)
        saved_count += 1
        
    return {"status": "success", "message": f"Saved {saved_count} posts from Chrome Extension!"}
