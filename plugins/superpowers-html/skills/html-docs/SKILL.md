---
name: html-docs
description: Use alongside superpowers:brainstorming, superpowers:writing-plans, superpowers:subagent-driven-development or superpowers:executing-plans when the superpowers-html plugin is installed. Specs and plans are written as .html in the spec format, and .html plans run through this plugin's task-brief and task-start.
---

# HTML specs and plans for superpowers

This skill is an overlay. It never replaces or reorders a superpowers step. Each override below is named by its superpowers **section heading** (superpowers 7.0.2); everything else in that step runs as written.

Read `spec-format.md` in this skill's directory before writing a spec or a plan. It is the format; this skill does not restate it.

The helpers live in `<this skill's base directory>/../../bin/` (the harness prints the base directory when this skill loads).

## Version check

Once per session, run `bash <absolute path of this skill's base directory>/../../bin/superpowers-html compat`. If it prints `"compatible": false`, tell your human partner once: "superpowers-html was written against superpowers 7.0.2; the installed version is <superpowers_version>." Then carry on with this skill.

## brainstorming

- **"## The Written Design":** the spec goes to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.html`, in the format. Your human partner's preferences still override the path and the format.

## writing-plans

- **"## Overview":** "Save plans to" becomes `docs/superpowers/plans/YYYY-MM-DD-<feature>.html`.
- **"## Plan Document Header":** the header is the format's `header` (the `h1` and a one-line `p`, with the "For agentic workers" line as an `aside data-kind="note"`). Carry the note over without upstream's closing sentence about markdown checkbox syntax and tracking by ticking; end it instead with: "Steps are checklist items; progress is kept in the workspace ledger, not in the plan." Then a a section with id `sec-overview` holding the Goal, Architecture, Tech Stack and Spec lines. Global Constraints is the section `sec-global-constraints`; Review Focus is the section `sec-review-focus`.
- **"## Task Structure":** each task is a `section` with id `sec-task-N` whose `h2` starts `Task N:`. Files and Interfaces are lists inside it. Each step is a checklist `li` with id `tN-sK`. Write every step unchecked (no `checked` attribute), even though the format's plan example shows one step ticked; nobody ticks steps during execution. Code is `pre` > `code data-lang`.
- **"## Execution Handoff":** the handoff messages name the plan's `.html` path.

## subagent-driven-development

- **"### 1. Dispatch the implementer":** for an `.html` plan, run `bash <absolute path of this skill's base directory>/../../bin/task-brief` (same arguments) instead of the skill's `scripts/task-brief`.

## executing-plans

- **"### 1. Take the task":** for an `.html` plan, run `bash <absolute path of this skill's base directory>/../../bin/task-start` (same arguments) instead of the skill's `scripts/task-start`.

## While executing an .html plan

- Nobody ticks a plan checkbox during execution. The workspace ledger is the progress record, so plan edits never land in a task's review diff.
- The other upstream scripts (`sdd-workspace`, `review-package`, `task-done`) take the `.html` plan unchanged.
- A `.md` plan runs exactly as superpowers runs it.
