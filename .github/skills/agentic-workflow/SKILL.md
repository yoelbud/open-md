---
name: agentic-workflow
description: "Use to run or coordinate the open-md end-to-end development loop: how the scout, maintainer, testing, linting, formatting, review, scribe, and ship agents hand off, the validation ladder, escalation rules, and the definition of done."
argument-hint: "Feature/change to drive through the loop, or the current stage"
---

# OpenMD Agentic Workflow

Use this skill to drive a change from idea to merged PR through the specialist
agents in `.github/agents/`. It defines the handoffs, the validation ladder, and
when to stop and ask a human.

## The loop

1. **Scout** (`OpenMD Feature Scout`) — pick exactly one `ROADMAP.md` item and
   produce a kickoff brief (affected surfaces, reused APIs, edge cases, gates).
2. **Maintainer** (`OpenMD Maintainer`) — implement the smallest complete change
   that preserves architecture and lint expectations. Keeps IR contracts in sync.
3. **Validate** — run the validation ladder below via:
   - `OpenMD Testing` (tests + failure triage)
   - `OpenMD Linting` (clippy, typecheck, doc, build)
   - `OpenMD Formatting` (`cargo fmt`)
4. **Review** (`OpenMD Review`) — high-signal diff review: invariants, IR-contract
   sync, gate parity. Blocking issues go back to the Maintainer (loop to step 2).
5. **Scribe** (`OpenMD Scribe`) — update `ROADMAP.md` checkboxes, README, rustdoc,
   and contract notes so docs match reality.
6. **Ship** (`OpenMD Ship`) — run the full gate, craft the commit + PR, open it.

Each handoff carries forward: the kickoff brief, the diff, and the latest gate
result. Agents are stateless — pass complete context, not references to memory.

## Validation ladder

Iterate cheaply, then prove parity (see the `open-md-quality` skill for commands):

1. **Targeted** — only the tests/checks for the changed crate or frontend module.
2. **Area gate** — the full Rust *or* frontend gate for the touched side.
3. **Full CI parity** — `cargo xtask ci` (mirrors `.github/workflows/ci.yml`)
   before review and again before ship.

Never broaden scope before fixing the root cause of a failing targeted command.

## Definition of Done

A change ships only when all hold (see `CONTRIBUTING.md`):

- `cargo xtask ci` passes.
- IR contract changes are mirrored in both Rust and frontend.
- New behavior is covered by tests protecting the core invariants.
- Public Rust APIs documented; no new clippy/doc warnings.
- `ROADMAP.md` and affected docs updated.
- PR describes what changed, why, and the validation run.

## Escalation — stop and ask a human when

- The change requires breaking the block-scoped pipeline or an IR contract in a
  way the kickoff brief did not anticipate.
- A new dependency, tool, or workflow seems necessary (these are not added for
  convenience — confirm first).
- A gate fails for reasons outside the change (flaky infra, toolchain mismatch).
- Two reasonable designs exist with materially different scope or risk.
- The roadmap item is ambiguous or appears already shipped.

## Invariants every stage protects

Exact `src_range`; stable hashes for unchanged blocks; per-block rendering;
CLI JSON payload shape; Rust↔frontend state synchronization; targeted (not
whole-document) updates.
