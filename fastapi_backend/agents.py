"""
agents.py — AI LinkedIn Agent v5.0
====================================
NEW: Model Selector Agent — automatically picks the best LLM for each
     agent based on topic, industry, audience, and content goal.

WORKFLOW:
  User Input
    → model_selector_agent  ← NEW: analyzes input, builds model plan
    → supervisor_agent
    → memory / research / trend / brand_voice (no LLM)
    → idea_agent       uses  model_plan["idea"]
    → writer_agent     uses  model_plan["writer"]
    → critic_agent     uses  model_plan["critic"]
    → rewrite_agent    uses  model_plan["rewrite"]  (if score < 85)

AVAILABLE GROQ MODELS (verified live 2026-06-18):
  llama-3.3-70b-versatile              → Best reasoning, technical depth
  qwen/qwen3-32b                       → Best creative writing, storytelling
  qwen/qwen3.6-27b                     → Great for diverse rewrites
  llama-3.1-8b-instant                 → Fastest, structured output
  meta-llama/llama-4-scout-17b-16e-instruct → Broad knowledge, educational
"""

import os
import re
import json
import time as _time
from state import AgentState
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

load_dotenv()

# ══════════════════════════════════════════════════════════════════════════
#  AVAILABLE MODELS — verified live from Groq API
# ══════════════════════════════════════════════════════════════════════════
GROQ_MODELS = {
    "llama-70b":  "llama-3.3-70b-versatile",
    "qwen-32b":   "qwen-2.5-32b",
    "qwen-27b":   "mixtral-8x7b-32768",
    "llama-8b":   "llama-3.1-8b-instant",
    "llama-scout":"gemma2-9b-it",
}

# HuggingFace ultimate fallback models (if ALL Groq fails)
HF_MODELS = [
    "mistralai/Mistral-7B-Instruct-v0.3",
    "Qwen/Qwen2.5-7B-Instruct",
    "microsoft/Phi-3-mini-4k-instruct",
]

# Default safe plan (used if model selector itself fails)
DEFAULT_PLAN = {
    "idea":    GROQ_MODELS["llama-70b"],
    "writer":  GROQ_MODELS["qwen-32b"],
    "critic":  GROQ_MODELS["llama-8b"],
    "rewrite": GROQ_MODELS["qwen-27b"],
    "verification": GROQ_MODELS["qwen-32b"],
    "proofreader": GROQ_MODELS["qwen-32b"],
}

# ══════════════════════════════════════════════════════════════════════════
#  MODEL SELECTOR RULES
#  The LLM router uses these to explain its decision.
# ══════════════════════════════════════════════════════════════════════════
MODEL_STRENGTHS = """
AVAILABLE MODELS AND THEIR STRENGTHS:

1. llama-3.3-70b-versatile
   Best for: Complex reasoning, technical topics (AI, data, engineering),
             thought leadership, business analysis, nuanced arguments
   Avoid:    Simple creative tasks (overkill)

2. qwen-2.5-32b
   Best for: Creative writing, storytelling, emotional posts, Taglish tone,
             founder voice, personal branding, viral content
   Avoid:    Highly technical structured analysis

3. mixtral-8x7b-32768
   Best for: Rewrites with a fresh diverse voice, medium-complex content,
             when you need content to sound different from the first draft
   Avoid:    Primary generation (better as rewrite model)

4. llama-3.1-8b-instant
   Best for: Fast evaluation, structured output (scoring), simple tasks,
             critic role, any task needing speed over depth
   Avoid:    Complex creative writing or deep reasoning

5. gemma2-9b-it
   Best for: Educational content, factual accuracy, broad knowledge topics,
             healthcare, science, research, learning content
   Avoid:    Highly creative or emotional posts

ASSIGNMENT ROLES:
  idea    → generates creative brainstorming ideas
  writer  → writes the full Taglish LinkedIn post
  critic  → evaluates and scores the draft (structured output needed)
  rewrite → rewrites if score < 85 (needs different voice from writer)
"""

# =============================================================================
#  ENGLISH FOUNDER VOICE -- 5-ZONE STYLE GUIDE
# =============================================================================
STYLE_GUIDE = """
WRITING STYLE - LINKEDIN 2026 ALGORITHM (Clear, Deep, Human)

CORE NICHE REQUIREMENT (MANDATORY):
- Your overarching niche is ALWAYS "AI Agents" (e.g., AI automation, AI agents in business, agentic workflows, etc.).
- No matter what the specific topic is, you MUST tie it back to the AI Agent niche to establish deep topical authority.

VOICE & AUTHENTICITY (ANTI-AI):
- 100% human, conversational, and authentic. DO NOT sound like a corporate press release or a ChatGPT robot.
- AVOID AI clichés ("In today's fast-paced world", "Delve into", "Tapestry", "Crucial", "Game-changer").
- Write from personal experience. Be real, vulnerable, and authoritative.

DWELL TIME & STRUCTURE (MANDATORY):
- Long-form storytelling is king. Stop the scroll and keep them reading!
- Use short punchy lines (max 10 words per line) and blank lines between every distinct thought.
- ONLY use this bullet format: -> (never -, *, or numbers).
- Length: MINIMUM 40 to 50 lines. DO NOT write short posts. Make the reader click "See more" and keep reading.
- No external links in the body. If you have a link, say "Link in the comments".

MEANINGFUL ENGAGEMENT (CTA):
- Do not use engagement-bait ("Comment YES if you agree"). 
- Instead, end with a specific, thought-provoking question that invites deep industry discussion.

5-ZONE STRUCTURE (follow EXACTLY):
ZONE 1 - HOOK (3-5 lines): Bold shocking opener. Entice the "See more" click.
ZONE 2 - STORY/TENSION (10-15 lines): Contrast. Hard reality vs common belief. Deep niche expertise.
ZONE 3 - DATA & INSIGHTS (8-10 lines): Real stats from research. Back up your point with -> bullets.
ZONE 4 - THE LESSON (10-15 lines): Actionable takeaway. Specific and inspiring.
ZONE 5 - ENGAGING CTA (5-8 lines): A specific question to spark debate. No post-and-ghost.

PERFECT EXAMPLE POST (Model this EXACTLY):
Everyone told me to get a safe job after college.
I said no.
Here is what happened instead.

I did not quit because I was confused.
I quit because I was building something.

While everyone else chose comfort,
I chose...
-> Risk
-> Uncertainty
-> Zero bank balance (some months)
-> And a lot of "what are you even doing?" moments

Was it easy? No.
Was it worth it? Ask me in 5 years.

But here is what I know right now:

Every big company you admire once had 0 users.
Every founder you follow once had 0 followers.
The only difference?

They started.

Let me introduce what we are building:
[Company Name] - a community-first platform for developers and small businesses.
Not just a product.
A movement.

Where:
-> Developers grow from zero to hireable
-> Small businesses scale without burning cash
-> People learn by building, not just watching

Here is the honest truth about our team right now:
-> 2 founders
-> 1 big idea
-> 0 guarantees

And we would not have it any other way.

The people who told me to get a job?
They still have their job.
I have a company.

We are growing.
And we are looking for people who want to grow with us.

If you have the skills and hunger to build:
-> Comment Interested below
-> Or DM me directly

We will get back to everyone.
This is just the beginning.

If this resonated, share it with someone who needs to hear it.
Like if you agree.
Comment if you disagree - I read every response.

Let us build something that matters.
Let us grow. Together.
"""

# ══════════════════════════════════════════════════════════════════════════
#  STRUCTURED OUTPUT SCHEMAS
# ══════════════════════════════════════════════════════════════════════════
class ModelPlanResponse(BaseModel):
    content_category: str = Field(description="One of: technical, creative, business, educational, viral")
    idea_model:    str    = Field(description="Exact Groq model ID for idea_agent")
    writer_model:  str    = Field(description="Exact Groq model ID for writer_agent")
    critic_model:  str    = Field(description="Exact Groq model ID for critic_agent")
    rewrite_model: str    = Field(description="Exact Groq model ID for rewrite_agent")
    verification_model: str = Field(description="Exact Groq model ID for verification_agent")
    proofreader_model: str = Field(description="Exact Groq model ID for proofreader_agent (prefer llama-3.3-70b-versatile for language tasks)")
    reasoning:     str    = Field(description="2-3 sentence explanation of why these models were chosen")

class CriticResponse(BaseModel):
    quality_score: int = Field(description="Sum of 5 criteria scores (0-20 each). Total 0-100. Most posts score 60-85. Be strict — avoid round numbers like 90 or 92.")
    feedback: str      = Field(description="Zone-by-zone breakdown of scores with specific improvement instructions")

class WeeklyTopicsResponse(BaseModel):
    topics: list[str] = Field(description="Exactly 7 distinct, engaging daily sub-topics.")


# ══════════════════════════════════════════════════════════════════════════
#  LLM CALLERS — with retry + HuggingFace fallback
# ══════════════════════════════════════════════════════════════════════════
def _clean_output(text: str) -> str:
    """Remove Qwen's <think> chain and zone headers from output."""
    import re as _re
    # Strip closed <think>...</think> blocks
    text = _re.sub(r'<think>.*?</think>', '', text, flags=_re.DOTALL | _re.IGNORECASE)
    # Strip unclosed <think> blocks (everything from <think> to end of string)
    text = _re.sub(r'<think>.*', '', text, flags=_re.DOTALL | _re.IGNORECASE)
    # Strip zone headers and format check artifacts
    text = _re.sub(r'\*\*ZONE \d.*?\*\*\s*\n?', '', text)
    text = _re.sub(r'---\s*\*\*Format Check.*', '', text, flags=_re.DOTALL)
    return text.strip()

def _call_groq(model_id: str, prompt: str, temperature: float) -> str:
    """Single Groq call with 3 retries on rate-limit."""
    llm = ChatGroq(model=model_id, temperature=temperature)
    for attempt in range(3):
        try:
            response = llm.invoke([HumanMessage(content=prompt)])
            return response.content
        except Exception as e:
            err = str(e)
            if "429" in err or "rate limit" in err.lower():
                wait = (attempt + 1) * 8
                print(f"      [RateLimit:{model_id}] Retry {attempt+1}/3 in {wait}s...")
                _time.sleep(wait)
            else:
                raise  # Non-rate-limit: raise immediately to try next model
    raise RuntimeError(f"Rate limit exhausted for {model_id}")

def _call_huggingface(prompt: str) -> str:
    """HuggingFace Serverless Inference — ultimate fallback."""
    hf_key = os.getenv("HUGGINGFACE_API_KEY", "").strip()
    if not hf_key:
        raise ValueError("No HUGGINGFACE_API_KEY set")
    from huggingface_hub import InferenceClient
    for hf_model in HF_MODELS:
        try:
            client   = InferenceClient(model=hf_model, token=hf_key)
            response = client.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1200
            )
            print(f"      [HuggingFace] Success with {hf_model}")
            return response.choices[0].message.content
        except Exception as e:
            print(f"      [HuggingFace:{hf_model}] {str(e)[:60]} — next...")
    raise RuntimeError("All HuggingFace models failed")

def call_llm(prompt: str, model_id: str, temperature: float = 0.7,
             fallback_models: list = None) -> tuple[str, str]:
    """
    Call a specific model. On failure, try fallback_models, then HuggingFace.
    Returns (content, model_used_id).
    """
    # Try the primary model first
    try:
        content = _call_groq(model_id, prompt, temperature)
        return _clean_output(content), f"groq:{model_id}"
    except Exception as e:
        print(f"      [Primary {model_id} failed] {str(e)[:80]}")

    # Try fallback Groq models
    for fb_model in (fallback_models or []):
        if fb_model == model_id:
            continue
        try:
            content = _call_groq(fb_model, prompt, temperature)
            print(f"      [Groq Fallback] Used {fb_model}")
            return _clean_output(content), f"groq:{fb_model}"
        except Exception as e:
            print(f"      [Fallback {fb_model} failed] {str(e)[:60]}")

    # Try HuggingFace as ultimate fallback
    print(f"      [All Groq failed] → HuggingFace...")
    content = _call_huggingface(prompt)
    return _clean_output(content), "huggingface"

def call_structured_groq(model_id: str, prompt: str, schema) -> any:
    """Structured output call with model fallbacks."""
    fallback_chain = [model_id, GROQ_MODELS["llama-8b"],
                      GROQ_MODELS["qwen-32b"], GROQ_MODELS["llama-70b"]]
    for model in dict.fromkeys(fallback_chain):  # deduplicate, preserve order
        llm = ChatGroq(model=model, temperature=0.2)
        structured = llm.with_structured_output(schema)
        for attempt in range(3):
            try:
                return structured.invoke([HumanMessage(content=prompt)])
            except Exception as e:
                err = str(e)
                if "429" in err or "rate limit" in err.lower():
                    wait = (attempt + 1) * 8
                    print(f"      [RateLimit:{model}] Retry {attempt+1}/3 in {wait}s...")
                    _time.sleep(wait)
                else:
                    print(f"      [Structured {model} error] {err[:60]} → next")
                    break
    raise RuntimeError("All structured LLM models exhausted")


# ══════════════════════════════════════════════════════════════════════════
#  SEARCH ENGINE — Tavily → DuckDuckGo → Wikipedia
# ══════════════════════════════════════════════════════════════════════════
def search_web(query: str, max_results: int = 5) -> str:
    engines = [
        ("Tavily",     lambda: _tavily(query, max_results)),
        ("DuckDuckGo", lambda: _duckduckgo(query, max_results)),
        ("Wikipedia",  lambda: _wikipedia(query)),
    ]
    for name, fn in engines:
        try:
            return f"[{name}]\n{fn()}"
        except Exception as e:
            if name != "Wikipedia":
                print(f"      [{name}] {str(e)[:50]} → next engine")
    return "Search unavailable — using general knowledge."

def _tavily(query, n):
    key = os.getenv("TAVILY_API_KEY", "").strip()
    if not key: raise ValueError("No key")
    from tavily import TavilyClient
    r = TavilyClient(api_key=key).search(query, max_results=n, search_depth="advanced")
    return "\n".join(f"- {x['title']}: {x.get('content','')[:250]}" for x in r.get("results",[]))

def _duckduckgo(query, n):
    from ddgs import DDGS
    with DDGS() as d:
        results = list(d.text(query, max_results=n))
    if not results: raise RuntimeError("No results")
    return "\n".join(f"- {r['title']}: {r.get('body','')[:250]}" for r in results)

def _wikipedia(query):
    import wikipedia
    wikipedia.set_lang("en")
    return f"- Wikipedia: {wikipedia.summary(query, sentences=5, auto_suggest=True)}"


# ══════════════════════════════════════════════════════════════════════════
#  AGENT 0: MODEL SELECTOR  <- THE NEW SMART ROUTER
# ══════════════════════════════════════════════════════════════════════════
def model_selector_agent(state: AgentState) -> AgentState:
    """
    Analyzes topic/industry/goal and picks the optimal LLM for each agent.
    Uses llama-3.1-8b-instant (fastest) for this routing decision.
    Falls back to DEFAULT_PLAN if it fails.
    """
    prompt = f"""
You are an AI model selection expert. Analyze this LinkedIn content request
and choose the BEST LLM model for each agent in the workflow.

USER REQUEST:
  Topic     : {state.get("topic")}
  Industry  : {state.get("industry")}
  Audience  : {state.get("target_audience")}
  Goal      : {state.get("content_goal")}

{MODEL_STRENGTHS}

Choose ONE model per role from EXACTLY these model IDs:
  "llama-3.3-70b-versatile"
  "qwen-2.5-32b"
  "mixtral-8x7b-32768"
  "llama-3.1-8b-instant"
  "gemma2-9b-it"

Rules:
- critic_model should almost always be "llama-3.1-8b-instant" (fastest for evaluation)
- proofreader_model and verification_model MUST be "qwen-2.5-32b" (superior multilingual support)
- writer_model and rewrite_model should be DIFFERENT models (different voices)
- Match model strengths to the content type
- content_category must be one of: technical, creative, business, educational, viral
"""
    try:
        result: ModelPlanResponse = call_structured_groq(
            GROQ_MODELS["llama-8b"], prompt, ModelPlanResponse
        )
        plan = {
            "idea":    result.idea_model,
            "writer":  result.writer_model,
            "critic":  result.critic_model,
            "rewrite": result.rewrite_model,
            "verification": result.verification_model,
            "proofreader": result.proofreader_model,
        }
        state["model_plan"]      = plan
        state["model_reasoning"] = (
            f"Category: {result.content_category.upper()} | "
            f"idea→{result.idea_model.split('/')[-1]} | "
            f"writer→{result.writer_model.split('/')[-1]} | "
            f"critic→{result.critic_model.split('/')[-1]} | "
            f"rewrite→{result.rewrite_model.split('/')[-1]} | "
            f"verification→{result.verification_model.split('/')[-1]} | "
            f"proofreader→{result.proofreader_model.split('/')[-1]}\n"
            f"Why: {result.reasoning}"
        )
        print(f"\n  [Model Selector] Category: {result.content_category}")
        print(f"  [Model Selector] idea    → {result.idea_model}")
        print(f"  [Model Selector] writer  → {result.writer_model}")
        print(f"  [Model Selector] critic  → {result.critic_model}")
        print(f"  [Model Selector] rewrite → {result.rewrite_model}")
        print(f"  [Model Selector] Reason  : {result.reasoning[:120]}")
    except Exception as e:
        print(f"  [Model Selector FAILED] {str(e)[:80]} — using defaults")
        state["model_plan"]      = DEFAULT_PLAN
        state["model_reasoning"] = "Default plan used (selector failed)"
    return state


# ══════════════════════════════════════════════════════════════════════════
#  AGENT 1: GATHER CONTEXT (Parallel Execution)
# ══════════════════════════════════════════════════════════════════════════
def gather_context_agent(state: AgentState) -> AgentState:
    import concurrent.futures

    def _memory():
        supa_url = os.getenv("SUPABASE_URL", "").strip()
        supa_key = os.getenv("SUPABASE_KEY", "").strip()

        past_posts_text = ""
        # 1. Try to fetch from extension scraped posts locally first
        local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weekly_calendar")
        scraped_posts = []
        if os.path.exists(local_dir):
            # Sort by newest first
            for file_name in sorted(os.listdir(local_dir), reverse=True):
                if file_name.startswith("extension_post_"):
                    with open(os.path.join(local_dir, file_name), "r", encoding="utf-8") as f:
                        lines = f.readlines()
                    if len(lines) >= 4:
                        draft = "".join(lines[4:])
                        scraped_posts.append(draft)
                    if len(scraped_posts) >= 3:
                        break
        
        content_style = state.get("content_style", "mimic")
        
        if scraped_posts and content_style == "mimic":
            past_posts_text = "\n\n".join([f"User's Scraped Post {i+1}:\n{p}" for i, p in enumerate(scraped_posts)])
            return f"REFERENCE MATERIAL (USER'S PAST POSTS):\n{past_posts_text}\n\nINSTRUCTION: Analyze these past posts to understand the user's natural tone and voice. You MUST write a brand new, highly engaging post that fits this style, but DO NOT copy the exact content or structure of these past posts. Prioritize viral hooks and high-quality storytelling over strictly mimicking the past posts."

        # 2. Fallback to Supabase high-scoring posts
        if supa_url and supa_key:
            try:
                from supabase import create_client
                supabase = create_client(supa_url, supa_key)
                # Fetch top 3 highest scoring posts from history
                response = supabase.table("posts").select("draft").order("score", desc=True).limit(3).execute()
                if response.data:
                    past_examples = "\n\n".join([f"Example {i+1}:\n{p['draft']}" for i, p in enumerate(response.data)])
                    return f"REFERENCE MATERIAL (PAST HIGH-SCORING POSTS):\n{past_examples}\n\nINSTRUCTION: Use these past successful posts as inspiration for formatting and tone, but write completely new and original content."
            except Exception as e:
                print(f"  [Memory] Supabase fetch failed: {str(e)[:60]}")
        return ""

    def _research():
        topic    = state.get("topic", "business")
        industry = state.get("industry", "general")
        query    = f'"{topic}" {industry} 2025 statistics data report insights'
        return f"Live research on '{topic}':\n{search_web(query, 5)}"

    def _trend():
        query = f"LinkedIn viral post trends {state.get('industry','business')} 2025 {state.get('content_goal','engagement')}"
        return f"LinkedIn trends:\n{search_web(query, 3)}"

    def _brand():
        return STYLE_GUIDE

    print("  [Gather Context] Running parallel web searches...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        f_mem = executor.submit(_memory)
        f_res = executor.submit(_research)
        f_trd = executor.submit(_trend)
        f_brd = executor.submit(_brand)

        state["memory_context"]      = f_mem.result()
        state["research_context"]    = f_res.result()
        state["trend_context"]       = f_trd.result()
        state["brand_voice_context"] = f_brd.result()

    return state


# ══════════════════════════════════════════════════════════════════════════
#  AGENT 5: IDEA — uses model_plan["idea"]
# ══════════════════════════════════════════════════════════════════════════
def idea_agent(state: AgentState) -> AgentState:
    plan     = state.get("model_plan", DEFAULT_PLAN)
    model_id = plan.get("idea", DEFAULT_PLAN["idea"])
    fallback = [GROQ_MODELS["llama-70b"], GROQ_MODELS["qwen-32b"], GROQ_MODELS["llama-8b"]]

    try:
        prompt = f"""
You are an elite LinkedIn content strategist.
Generate 3 distinct, engaging LinkedIn post IDEAS that match the user's authentic style.

Topic     : {state.get("topic")}
Industry  : {state.get("industry")}
Audience  : {state.get("target_audience")}
Goal      : {state.get("content_goal")}

LIVE RESEARCH (use real stats):
{state.get("research_context","")}

TRENDING:
{state.get("trend_context","")}

{STYLE_GUIDE}

For each idea:
Idea [N]:
Hook: [Zone 1 scroll-stopping opener]
Story Angle: [Deep insight for high dwell time]
Key stat: [Specific number from research]
Zone 3 bullets: [2-3 real data → bullets]
Meaningful CTA: [Zone 5 thought-provoking question]
"""
        content, used = call_llm(prompt, model_id, temperature=0.75, fallback_models=fallback)
        state["ideas"] = [content]
        print(f"  [idea_agent] {model_id} ← selected | Used: {used}")
    except Exception as e:
        state["ideas"] = [f"Idea generation failed: {str(e)}"]
    return state


# ══════════════════════════════════════════════════════════════════════════
#  AGENT 6: WRITER — uses model_plan["writer"]
# ══════════════════════════════════════════════════════════════════════════
def writer_agent(state: AgentState) -> AgentState:
    import random
    plan     = state.get("model_plan", DEFAULT_PLAN)
    model_id = plan.get("writer", DEFAULT_PLAN["writer"])
    fallback = [GROQ_MODELS["qwen-32b"], GROQ_MODELS["llama-70b"], GROQ_MODELS["llama-8b"]]

    VIRAL_HOOKS = [
        "Most founders fail because they don't understand this one simple truth:",
        "I've spent years learning this so you don't have to:",
        "Unpopular opinion: The old way of doing things is completely dead.",
        "Everyone is talking about this, but they are missing the bigger picture.",
        "Here is the brutal truth no one tells you about our industry:",
        "Stop doing what everyone else is doing. Start doing this. Here's why:",
        "If you want to actually grow, you need to hear this today.",
        "I made a massive mistake last year. Here is exactly what I learned:",
        "The secret to success isn't working harder. It's this:",
        "I thought I knew everything about this topic. I was completely wrong.",
        "The most successful people I know do this one thing differently:",
        "Here are 3 things I wish I knew before I started:",
        "Stop wasting your time on X. Focus on Y instead.",
        "The biggest lie you've been told about our industry is this:",
        "This is the exact strategy I used to completely change the game:",
        "Want to see real results? Stop ignoring this simple fact:",
        "Nobody wants to admit this, but it's the absolute truth:",
        "How I went from struggling to thriving in 3 simple steps:",
        "Your competitors are secretly doing this. Are you?",
        "This one tiny change tripled my results in less than a month.",
        "I see this mistake every single day, and it breaks my heart.",
        "Here is a masterclass that usually costs $1,000. For free:",
        "Forget everything you learned about this topic. Read this instead:",
        "I studied the top 1% in our field. They all share this one habit:",
        "The problem isn't your effort. The problem is your strategy.",
        "If you don't read this today, you'll regret it tomorrow.",
        "I'll be honest: I was terrified to post this.",
        "Here is the ultimate cheat sheet for dominating your niche:",
        "We need to have a serious conversation about this trend.",
        "Why 90% of people fail at this (and how to be the 10%):",
        "If I had to start completely from scratch today, here is my exact plan:",
        "The fastest way to destroy your career is doing this:",
        "I'm giving away my biggest secret. Read carefully.",
        "This concept completely shifted my mindset last night:",
        "Most people overcomplicate this. Here is the simple version:",
        "If you're feeling stuck, this post is exactly for you.",
        "Here is a harsh reality check for anyone building a business:",
        "The difference between good and great comes down to this:",
        "You are losing money every day you don't implement this:",
        "Let me save you 6 months of trial and error in 60 seconds.",
        "I'm tired of seeing fake advice on this topic. Here is the reality:",
        "The most underrated skill in 2026 is actually this:",
        "I just analyzed 100 successful case studies. Here is the pattern:",
        "You don't need more resources. You need more of this:",
        "This single decision changed the entire trajectory of my life.",
        "Here is the exact framework I use to solve this exact problem:",
        "Stop making excuses. Here is how you actually fix it:",
        "The hard truth is: no one is going to save you. You must do this:",
        "I used to think this was impossible. Then I discovered this trick:",
        "Bookmark this post. You'll want to come back to it later."
    ]
    selected_hook = random.choice(VIRAL_HOOKS)

    try:
        memory_rules = state.get("memory_context", "").strip()
        if memory_rules:
            style_instruction = f"""
VOICE CLONING RULES (CRITICAL):
{memory_rules}

GENERAL STYLE GUIDELINES (if not overridden by voice cloning):
{state.get("brand_voice_context", STYLE_GUIDE)}
"""
        else:
            style_instruction = f"""
GENERAL STYLE GUIDELINES:
{state.get("brand_voice_context", STYLE_GUIDE)}
"""

        prompt = f"""
You are an elite ghostwriter for the user.
Write a complete publish-ready LinkedIn post based on the provided style guidelines. Create a high-quality, viral post that is tailored to the industry and audience.

MANDATORY FIRST SENTENCE:
You MUST start your post with EXACTLY this opening hook:
"{selected_hook}"

IDEAS FROM STRATEGIST:
{state.get("ideas",[""])[0]}

INSTRUCTION: Read the above 3 ideas. Choose the SINGLE BEST, most engaging angle. Do NOT write 3 posts. Write ONE incredible post based on the best idea.

LIVE RESEARCH (Zone 3 must use 2+ real stats from here):
{state.get("research_context","")}

Topic: {state.get("topic")} | Audience: {state.get("target_audience")}
Goal: {state.get("content_goal")} | Industry: {state.get("industry")}

{style_instruction}

OUTPUT: The complete post only. No headers. No checklist.
Start directly with the exact MANDATORY FIRST SENTENCE provided above. End with hashtags.
"""
        content, used = call_llm(prompt, model_id, temperature=0.85, fallback_models=fallback)
        state["current_draft"] = content
        print(f"  [writer_agent] {model_id} ← selected | Used: {used} | Hook: {selected_hook[:20]}...")
    except Exception as e:
        state["current_draft"] = f"DRAFT_ERROR: {str(e)}"
    return state


# ══════════════════════════════════════════════════════════════════════════
#  AGENT 7: CRITIC — uses model_plan["critic"]
# ══════════════════════════════════════════════════════════════════════════
def critic_agent(state: AgentState) -> AgentState:
    draft = state.get("current_draft", "")
    if not draft.strip() or draft.startswith("DRAFT_ERROR"):
        state["quality_score"] = 0
        state["feedback"]      = "Draft failed — cannot evaluate."
        return state

    plan     = state.get("model_plan", DEFAULT_PLAN)
    model_id = plan.get("critic", DEFAULT_PLAN["critic"])

    try:
        prompt = f"""
You are a STRICT LinkedIn content quality critic. You do NOT give generous scores.
You evaluate posts with genuine rigour — most posts should score between 60-85.
Only truly exceptional posts should score above 88. Never give the same score twice in a row.

Evaluate this LinkedIn post:

---
{draft}
---

Score on EACH of these 5 criteria (0-20 pts each), then sum for total:

1. HOOK & DWELL TIME (0-20): Does the first line entice the "See more" click? Does the post tell a compelling story to keep readers engaged (long dwell time)? Short, skim-in-2-seconds posts = max 10 pts.

2. EXPERTISE & INSIGHT DEPTH (0-20): Does it provide real, non-obvious insights in a specific niche? Specific numbers, named frameworks, or contrarian angles = 16-20. Repackaged generic advice or common knowledge = 0-10.

3. PLATFORM NATIVE (0-20): Is it optimized for LinkedIn? Good use of white space (no dense paragraphs)? Does it AVOID external links in the body? Deduct 10 pts if it contains URLs in the body.

4. ANTI-AI AUTHENTICITY (0-20): Does it sound 100% human and real? Deduct heavily for ChatGPT-isms, generic tone, or motivational fluff. Every cliché or robotic phrase ("In today's fast-paced world", "delve into") costs 5 pts.

5. MEANINGFUL ENGAGEMENT CTA (0-20): Does it spark a genuine dialogue? Engagement-bait ("Comment YES") or generic ("Thoughts?") = 0-5 pts. A specific, thought-provoking question that invites expert discussion = 15-20 pts.

Respond with:
- quality_score: integer sum of all 5 scores (must reflect actual deductions, NOT a round number like 90 or 92)
- feedback: specific zone-by-zone critique with exact improvement instructions
"""
        result = call_structured_groq(model_id, prompt, CriticResponse)
        state["quality_score"] = result.quality_score
        state["feedback"]      = result.feedback
        print(f"  [critic_agent] {model_id} ← selected | Score: {result.quality_score}/100")
    except Exception as e:
        state["quality_score"] = 0
        state["feedback"]      = f"Critic failed: {str(e)}"
    return state


# ══════════════════════════════════════════════════════════════════════════
#  AGENT 8: REWRITE — uses model_plan["rewrite"] (different from writer)
# ══════════════════════════════════════════════════════════════════════════
def rewrite_agent(state: AgentState) -> AgentState:
    plan     = state.get("model_plan", DEFAULT_PLAN)
    model_id = plan.get("rewrite", DEFAULT_PLAN["rewrite"])
    fallback = [GROQ_MODELS["llama-70b"], GROQ_MODELS["qwen-32b"], GROQ_MODELS["llama-8b"]]
    
    state["rewrite_count"] = state.get("rewrite_count", 0) + 1

    try:
        prompt = f"""
Rewrite this LinkedIn post applying the critic's feedback. Keep the 2026 algorithm rules (long dwell time, human authenticity, no AI fluff).

ORIGINAL POST:
{state.get("current_draft")}

CRITIC FEEDBACK:
{state.get("feedback")}

{STYLE_GUIDE}

OUTPUT: The complete rewritten 5-zone post only. No headers. No labels.
Start directly with Zone 1 hook. End with hashtags.
"""
        content, used = call_llm(prompt, model_id, temperature=0.82, fallback_models=fallback)
        state["current_draft"] = content
        print(f"  [rewrite_agent] {model_id} ← selected | Used: {used}")
    except Exception:
        pass  # Keep original draft
    return state


def brainstorm_weekly_topics(theme: str, industry: str, target_audience: str) -> list[str]:
    """Brainstorms 7 daily sub-topics from a single theme using llama-8b."""
    prompt = f"""
    You are a LinkedIn content strategist.
    Brainstorm exactly 7 distinct daily sub-topics (Day 1 to Day 7) based on this main theme:
    
    Theme: {theme}
    Industry: {industry}
    Audience: {target_audience}
    
    CRITICAL NICHE RULE: Your overarching niche is ALWAYS "AI Agents" (Artificial Intelligence Agents, Agentic Workflows, AI Automation). 
    No matter what the user's Theme is above, you MUST tie each daily topic back to AI Agents and their impact on that theme.
    
    Ensure each topic is unique, highly engaging, and addresses a different angle of how AI Agents intersect with the main theme (e.g. Day 1: Introduction to AI Agents in this space, Day 2: Common mistakes when implementing agents, Day 3: Statistics/Data breakdown on agent ROI, Day 4: Case study of an agentic workflow, Day 5: Contrarian opinion about AI replacing jobs, Day 6: Actionable tips for building your first agent, Day 7: Community discussion on the future of agents).
    
    Return exactly 7 topics.
    """
    try:
        # Use llama-8b as it is fast and cheap
        result = call_structured_groq(GROQ_MODELS["llama-8b"], prompt, WeeklyTopicsResponse)
        # Ensure we return exactly 7 topics
        topics = result.topics[:7]
        while len(topics) < 7:
            topics.append(f"{theme} - Part {len(topics)+1}")
        return topics
    except Exception as e:
        print(f"  [Weekly Brainstorm Failed] {str(e)} — using fallback topics")
        return [f"{theme} - Day {i+1}" for i in range(7)]


# ══════════════════════════════════════════════════════════════════════════
#  AGENT 8: VERIFICATION — uses model_plan["verification"]
# ══════════════════════════════════════════════════════════════════════════
def verification_agent(state: AgentState) -> AgentState:
    """Checks the logical flow of the content and brutally strips out any bad Taglish grammar."""
    plan     = state.get("model_plan", DEFAULT_PLAN)
    model_id = plan.get("verification", DEFAULT_PLAN.get("verification", GROQ_MODELS["llama-70b"]))
    fallback = [GROQ_MODELS["qwen-32b"], GROQ_MODELS["llama-70b"]]

    draft = state.get("current_draft", "")
    if not draft:
        return state

    prompt = f"""
    You are a strict Content Verification Editor for a professional LinkedIn post.
    Your job is to read the following draft and ensure two things:
    1. LOGICAL FLOW: Ensure the content makes sense, the arguments are sound, and it doesn't sound like "AI hype nonsense."
    2. DESTROY BAD TAGLISH: Artificial Intelligence models often hallucinate broken Tamil grammar (e.g., "irukingala naan" or "kala kaathu"). 
       If you see ANY sentences written in Tamil, rewrite them into powerful, crisp ENGLISH immediately. 
       ONLY KEEP the simple hook phrases (e.g., "Bro...", "Enna pa...", "Seri da...").

    Maintain the EXACT 5-zone structure, line breaks, emojis, and → bullets. Do NOT shorten the post.
    Output ONLY the verified and corrected draft.

    DRAFT:
    {draft}
    """
    try:
        content, used = call_llm(prompt, model_id, temperature=0.3, fallback_models=fallback)
        if len(content.strip()) > 50:
            state["current_draft"] = content.strip()
            print(f"  [verification_agent] {model_id} ← selected | Used: {used}")
    except Exception as e:
        print(f"  [verification_agent] Failed: {str(e)}")

    return state


# ══════════════════════════════════════════════════════════════════════════
#  AGENT 9: PROOFREADER — uses model_plan["proofreader"]
# ══════════════════════════════════════════════════════════════════════════
def proofreader_agent(state: AgentState) -> AgentState:
    """Final check to fix spelling mistakes and unnatural Taglish phrases."""
    plan     = state.get("model_plan", DEFAULT_PLAN)
    model_id = plan.get("proofreader", DEFAULT_PLAN.get("proofreader", GROQ_MODELS["llama-70b"]))
    fallback = [GROQ_MODELS["llama-70b"], GROQ_MODELS["qwen-32b"]]

    draft = state.get("current_draft", "")
    if not draft:
        return state

    prompt = f"""
    You are a native Tamil speaker and professional copyeditor.
    Your task is to fix spelling mistakes, grammatical errors, and unnatural phrasing in this Taglish (Tamil + English) LinkedIn post.
    
    IMPORTANT RULES:
    1. Ensure the Tamil sounds 100% natural, conversational, and authentic. 
       (e.g., fix "paathu illa" to "paathirukingala", fix weird literal translations).
    2. DO NOT change the meaning or the tone. Keep the founder voice.
    3. ABSOLUTELY DO NOT change the formatting. Keep all the line breaks, emojis, and "→" bullets exactly as they are.
    4. Only output the corrected draft. Do not add any conversational text before or after it.

    DRAFT TO PROOFREAD:
    {draft}
    """
    try:
        content, used = call_llm(prompt, model_id, temperature=0.2, fallback_models=fallback)
        if len(content.strip()) > 50: # Basic validation to ensure it didn't fail and return empty
            state["current_draft"] = content.strip()
            print(f"  [proofreader_agent] {model_id} ← selected | Used: {used}")
    except Exception as e:
        print(f"  [proofreader_agent] Failed: {str(e)}")
        pass # Keep original draft if proofreader fails

    return state




