"""SessionStart hook: one static note telling Claude to load the html-docs skill."""

SESSION_NOTE = (
    "superpowers-html is active: specs and plans in this session are written as .html "
    "in the supersonic spec format, not markdown. Before writing a spec or a plan, or "
    "before executing an .html plan, load the skill superpowers-html:html-docs and follow "
    "it. A .md plan still runs exactly as superpowers runs it."
)


def session_start():
    return {"hookSpecificOutput": {"hookEventName": "SessionStart",
                                   "additionalContext": SESSION_NOTE}}
