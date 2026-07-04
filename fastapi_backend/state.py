from typing import Annotated, TypedDict, List, Dict, Any, Optional
import operator

class AgentState(TypedDict):
    # ── User Inputs ────────────────────────────────────────────────
    topic:           str
    industry:        str
    target_audience: str
    content_goal:    str
    content_style:   Optional[str]

    # ── Model Plan (set by model_selector_agent) ───────────────────
    model_plan:      Dict[str, str]   # {"idea": "...", "writer": "...", etc.}
    model_reasoning: str              # Why these models were chosen

    # ── Context gathered by specialist agents ──────────────────────
    research_context:   str
    trend_context:      str
    brand_voice_context: str
    memory_context:     str

    # ── Generation State ───────────────────────────────────────────
    ideas:         List[str]
    current_draft: str
    quality_score: int
    feedback:      str

    # ── History and Routing ────────────────────────────────────────
    messages:   Annotated[list, operator.add]
    next_agent: str
    rewrite_count: int
