from langgraph.graph import StateGraph, END
from state import AgentState
from agents import (
    model_selector_agent,
    gather_context_agent,
    idea_agent, writer_agent, critic_agent, rewrite_agent
)

def build_graph():
    workflow = StateGraph(AgentState)

    # ── Nodes ──────────────────────────────────────────────────────
    workflow.add_node("model_selector", model_selector_agent)
    workflow.add_node("gather_context", gather_context_agent)
    workflow.add_node("idea",           idea_agent)
    workflow.add_node("writer",         writer_agent)
    workflow.add_node("critic",         critic_agent)
    workflow.add_node("rewrite",        rewrite_agent)

    # ── Entry Point ────────────────────────────────────────────────
    workflow.set_entry_point("model_selector")

    # ── Linear Flow ────────────────────────────────────────────────
    workflow.add_edge("model_selector", "gather_context")
    workflow.add_edge("gather_context", "idea")
    workflow.add_edge("idea",           "writer")
    workflow.add_edge("writer",         "critic")

    # ── Conditional Routing (Critic -> Rewrite or END) ─────────────
    def check_score(state: AgentState):
        score = state.get("quality_score", 0)
        rewrite_count = state.get("rewrite_count", 0)
        if score < 85 and rewrite_count < 2:
            return "rewrite"
        return END

    workflow.add_conditional_edges(
        "critic",
        check_score,
        {
            "rewrite": "rewrite",
            END:       END
        }
    )

    # ── Rewrite Loop ───────────────────────────────────────────────
    workflow.add_edge("rewrite", "critic")

    return workflow.compile()

# Expose compiled graph
agent_workflow = build_graph()
