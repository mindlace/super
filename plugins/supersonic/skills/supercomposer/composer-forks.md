# Composer forks: prompts and command lines

The checkpoint and the three kinds of fork, each as a prompt and a command line. The composer
runs the first checkpoint and the first build-graph fork in Phase C5; supersonic:superconductor
runs every later one. The rules all of them follow are in `## Composer forks` of the
supercomposer SKILL.md.

To run one:

1. Copy the prompt text below into a prompt file under `<ledger dir>/prompts/`, filling every
   `<placeholder>`. Paths are absolute.
2. Run the command line exactly as written, starting with `env -C "<package worktree>"`.
   Every one of these runs with cwd = the package worktree: `claude` has no cwd flag, and
   `--resume` looks up sessions per project directory. `env -C` sets the launch directory
   for that one command; a `cd` in a separate call persists only inside the session's
   working directories, so it can silently not take effect. A fork that exits with
   "No conversation found" was started from the wrong cwd.
3. `--allowedTools="..."` and `--add-dir="..."` keep their equals sign: both flags are
   variadic, and without `=` they swallow the prompt. `--add-dir="<ledger dir>"` declares
   the one directory outside the cwd that the adjudication and merge-review forks write to
   (a plain `Write` allow also wrote outside the cwd in the drill; the flag makes it
   explicit). Forks run as background Bash commands, so whoever started one is told when
   it exits.

`<model>` is always the checkpoint's model, recorded beside its id in the ledger.

## Checkpoint

A fresh session that cold-reads the committed package and stops. Its id is what every fork
resumes. It is never resumed in place and never receives a result: only the forks below
touch it, each as a new session.

Command, with cwd = `<package worktree>`:

    env -C "<package worktree>" claude -p --model <model> --output-format json --allowedTools="Read,Grep,Glob" "$(cat <prompt file>)" > <ledger dir>/checkpoint-<n>.json
    python3 -c 'import json,sys; print(json.load(sys.stdin)["session_id"])' < <ledger dir>/checkpoint-<n>.json

Append the id under the ledger's `## Checkpoints` heading as
`- <checkpoint id> | model <model> | package @ <short sha> | <date>`. The last line there is
the current checkpoint.

Prompt:

    You are the composer checkpoint for the <design-slug> package. You are already in the
    package worktree <package worktree> (your cwd), on the integration branch. Do not create
    or switch worktrees, and write nothing. Your tools are exactly Read, Grep and Glob; you
    run no shell commands.

    Read the package cold, from the files themselves: the design doc <design doc>, every spec
    it lists, the contracts spec, the build graph if there is one, and the survey notes in
    <survey dir>. Where a decision rests on code, read that code. Read for the decisions, the
    interface rows and the partner's reasons beside them: sessions forked from you will rule
    on questions about this package without anyone to ask.

    When you have read it all, reply with exactly one line, `Checkpoint ready @ <short sha>`,
    and stop.

## Adjudication fork

One fork per question file. It rules alone, amends the package as current-state text, writes
the ruling file and exits. It sends no messages. Adjudication and build-graph forks may amend
the package, so only one of them runs at a time.

The question file it reads, `<ledger dir>/questions/<id>.md`, has this form:

    # Question <id> — from <name>
    ## Question
    ## What the package says
    ## What I found
    (each claim verified-at `file:line`, or flagged unverified)
    ## Options I see
    ## Blocking
    (the plan tasks that wait on the answer)

Command, with cwd = `<package worktree>`, as a background Bash command:

    env -C "<package worktree>" claude -p --resume <checkpoint id> --fork-session --model <model> --permission-mode acceptEdits --allowedTools="Read,Grep,Glob,Write,Edit,Skill,Bash(jev:*),Bash(git add:*),Bash(git commit:*),Bash(git rev-parse:*)" --add-dir="<ledger dir>" "$(cat <prompt file>)"

Prompt:

    You are a fork of the <design-slug> composer checkpoint, started to rule on question <id>.
    You are already in the package worktree <package worktree> (your cwd), on the integration
    branch. Do not create or switch worktrees. You send no messages; whoever started you reads
    your ruling file when you exit. Permission mode acceptEdits. Your tools are exactly Read,
    Grep, Glob, Write, Edit and Skill; run shell commands only as `jev ...`, `git add`,
    `git commit` and `git rev-parse`, from your cwd. Anything else is refused.

    1. Disk wins. Read <ledger dir>/questions/<id>.md, then every package file it touches as
       it is on disk now: design doc, specs, contracts, build graph. What you remember from
       your checkpoint read, and the question's own quotes of the package, may be older than
       the disk. Where they disagree, the disk is the package; rule from it.
    2. Optional Jev citation check: if the superpowers-jev plugin is installed, load
       superpowers-jev:jev, run `jev cite <ledger dir>/questions/<id>.md --root <package
       worktree> > <state file>`, then `jev ask citation --state <state file>`. In shadow
       mode, judge the claims under "What I found" yourself, then `jev record` your verdict
       for each claim in the order of the state file's `claims`. On: treat every claim in
       `detail.flagged` or `detail.also_flagged` as unverified, and re-check it at primary
       source before you rule on it.
    3. Rule alone, on anything the question raises, including the design's model
       commitments. Nobody approves your ruling first; the partner reads rulings/ afterwards.
       Running units' plans are at: <unit-slug>: <plan path>, one per line.
    4. If the ruling changes the package, rewrite the design doc, specs and contracts as
       current-state text: each amended passage reads as if it had always said this. No
       "previously", no "changed from", no changelog section, and no mention of the approach
       it replaces, of plan tasks or of code already written. Git holds the history. Before
       committing, reread each amended passage as someone who never saw the earlier text:
       every sentence must make sense to them and say what the system does. Then
       `git add` the files, `git commit -m "docs(<design-slug>): rule <id>"`, and take the
       short sha from `git rev-parse --short HEAD`.
    5. Write <ledger dir>/rulings/<id>.md in exactly this form:

           # Ruling <id>
           Package commit: <sha|none>
           Changes design: yes|no
           Changes contract: yes|no
           ## Ruling
           (what the package now says on this point, as present-tense sentences)
           ## Re-read
           - <file> § <section>
           ## Affected units
           - <unit-slug>: clarification
           - <unit-slug>: first task that no longer holds: <task>

       `Package commit` is the sha of your commit, or `none` if you changed no package
       file. `Changes design` is `yes` when you changed any text in the design doc, a spec
       or the contracts. `Changes contract` is `yes` when you changed an interface row or
       contracts code. List every running unit whose spec text you changed. A unit whose approach and
       interfaces stand is `clarification`. Otherwise name the first task in its plan that
       was built on what the spec no longer says: its branch is cut back to before that task
       and a fresh operator plans from there.
    6. Print the ruling file's path and stop.

## Merge-review fork

One fork per merge into the integration branch, unit or milestone. It writes nothing to the
package, so any number run at once, beside an amending fork.

Command, with cwd = `<package worktree>`, as a background Bash command:

    env -C "<package worktree>" claude -p --resume <checkpoint id> --fork-session --model <model> --permission-mode acceptEdits --allowedTools="Read,Grep,Glob,Write,Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(git rev-parse:*)" --add-dir="<ledger dir>" "$(cat <prompt file>)"

Prompt:

    You are a fork of the <design-slug> composer checkpoint, started to review one merge. You
    are already in the package worktree <package worktree> (your cwd), on the integration
    branch. Do not create or switch worktrees. You send no messages and change no package
    file. Permission mode acceptEdits. Your tools are exactly Read, Grep, Glob and Write
    (Write only for the question file below); run shell commands only as `git diff`,
    `git log`, `git show` and `git rev-parse`, from your cwd. Anything else is refused.

    Disk wins: read the design doc, specs, contracts and build graph as they are on disk
    now; where your checkpoint read disagrees, the disk is the package.

    Unit <unit-slug> merged at <sha>. It needs rows <rows> and produces rows <rows>. Check
    two things: does the merged result still match the design and its spec, and do the real
    implementations of the rows it produces match the contracts their consumers were built
    against?

    Your whole output is one of these two:
    - Nothing departs: print exactly `No drift @ <sha>` and stop.
    - Something departs: write <ledger dir>/questions/merge-<unit-slug>-<short-sha>.md in the
      question form (`# Question merge-<unit-slug>-<short-sha> — from merge review`, then
      `## Question`, `## What the package says`, `## What I found` with verified-at
      `file:line`, `## Options I see`, `## Blocking`), print its path, and stop.

## Build-graph fork

Translates the specs into the build graph. The composer runs it once in Phase C5 for all
units; after a ruling amends a spec, the conductor runs it again and fills "Units to write"
with the unit slugs the ruling lists itself, so the fork never reads a ruling file. It amends the
package, so it runs alone. It writes only inside the package worktree, so it takes no
`--add-dir`.

Command, with cwd = `<package worktree>`, as a background Bash command:

    env -C "<package worktree>" claude -p --resume <checkpoint id> --fork-session --model <model> --permission-mode acceptEdits --allowedTools="Read,Grep,Glob,Write,Edit,Bash(git add:*),Bash(git commit:*),Bash(git rev-parse:*)" "$(cat <prompt file>)"

Prompt:

    You are a fork of the <design-slug> composer checkpoint, started to write the build
    graph. You are already in the package worktree <package worktree> (your cwd), on the
    integration branch. Do not create or switch worktrees. You send no messages. Permission
    mode acceptEdits. Your tools are exactly Read, Grep, Glob, Write and Edit; run shell
    commands only as `git add`, `git commit` and `git rev-parse`, from your cwd. Anything
    else is refused.

    Disk wins: read the design doc, specs and contracts as they are on disk now; where your
    checkpoint read disagrees, the disk is the package.

    Write docs/superpowers/design/<design-file-stem>-build-graph.md. Units to write: <all |
    unit-slug, unit-slug, ...>; leave every other row as it is. A unit is one serial lane, cut as fine as the dependencies allow; it cites the spec
    sections it implements; no two units that can run together write the same file;
    anything two units would both build is its own unit or part of contracts; every edge
    names interface rows. The file is this table followed by one line:

        | unit | implements (spec §) | writes | needs rows | produces rows others wait on |
        |---|---|---|---|---|
        | `contracts` | `contracts` §… | `src/contracts/**` | — | every contract row |

        Longest chain: contracts -> <unit> -> <unit>

    `Longest chain:` is the longest path of row edges through the units: the chain of
    edges the package's fresh-eyes check challenges, named by unit. If two paths tie, give
    one `Longest chain:` line for each.

    Write the graph as current-state text. No "previously", no "changed from", no changelog,
    and no mention of an earlier cut. Git holds the history. Then `git add` the file,
    `git commit -m "docs(<design-slug>): build graph"`, take the short sha from
    `git rev-parse --short HEAD`, print `Build graph @ <short sha>` and the `Longest chain:`
    line, and stop.
