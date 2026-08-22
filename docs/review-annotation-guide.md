# Run-review annotation guide (v1)

This guide defines the human labels used to evaluate Tripwire's experimental run-review findings. It separates facts that a transcript establishes from judgments about whether repetition was avoidable or durable enough to encode as an instruction.

The machine-readable companion is [`schemas/tripwire-review-annotation-v1.schema.json`](../schemas/tripwire-review-annotation-v1.schema.json).

## Evidence boundary

Annotators work from sanitized transcripts and record only compact event references: logical session, event ID, sequence, line, and semantic-signature digest. Do not copy prompts, tool results, absolute paths, repository names, credentials, or user identity into annotations.

Every session declares one provenance class:

- `consented-real`: a participant affirmatively approved use, and a human checked sanitization while preserving event relationships.
- `source-verified`: a minimal fixture derived from a public harness specification or implementation, with no private run content.
- `synthetic`: a deliberately constructed edge case.

Source-verified and synthetic fixtures are useful engineering checks. They do **not** establish real-run representativeness, participant consent, or the PRD's false-positive gate. Never report a synthetic-only benchmark as product accuracy.

## Two independent passes

1. Reviewer A and Reviewer B label the evidence independently. They must not see one another's labels during the first pass.
2. Compare labels only after both passes are complete. Any disagreement in observation, avoidability, durability, action, or confidence requires an adjudication rationale.
3. The adjudicator records a final label. The adjudicator may be one of the original reviewers only when the corpus protocol says so; record that limitation.
4. Report both raw agreement and adjudicated benchmark results. Do not silently replace the independent labels.

Reviewer IDs should be stable pseudonyms, not names or email addresses.

## Label in this order

### 1. Direct observation

- `observed`: the normalized events directly support the proposed relationship.
- `not-observed`: the relationship is contradicted or its required events are absent.
- `ambiguous`: the relevant events exist, but ordering, identity, or state is insufficient.
- `unsupported`: the adapter cannot expose the required signal.

Observation is limited to the exact semantic signature. Two reads of one path with different offsets or limits are not the same operation. Two shell calls using the same tool name are not retries unless their semantic signatures match.

### 2. Finding type

- `recurrence`: the exact operation recurs in a compatible state epoch.
- `retry_chain`: an errored operation is followed by the same operation in a compatible epoch and within the documented retry boundary.
- `legitimate_repeat`: repetition follows a relevant mutation, is required verification, or otherwise has direct justification.
- `mutation_boundary`: the annotation exists to pin an intervening state change.
- `no_finding`: the session is a negative example.

### 3. Outcome certainty

Use `success`, `error`, `mixed`, or `unknown` only when the adapter supplies the corresponding structured evidence. Ordinary result prose does not prove success. Use `not-applicable` for a label that does not evaluate an outcome.

### 4. Avoidability

- `likely-avoidable`: state and repeated output support the inference that the repeat did not add new evidence.
- `likely-legitimate`: mutation, verification, changed scope, or another observed state difference justifies the repeat.
- `uncertain`: the transcript cannot distinguish those cases.
- `not-applicable`: avoidability is not being judged.

Avoidability is an inference. Do not label work “waste.”

### 5. Durability and action

Durability is `durable`, `project-local`, `volatile`, or `unknown`. Then choose exactly one action:

- `skill`: reusable procedural knowledge with evidence across runs or strong reviewed support.
- `project_instruction`: stable guidance specific to one repository or project.
- `investigate_workflow`: repeated failures or unclear tool behavior that should be diagnosed before encoding instructions.
- `none`: legitimate repetition, volatile facts, insufficient evidence, or no useful remedy.

Single-session evidence and unknown semantics cap recommendation confidence at `medium`. Volatile facts should normally map to `none` or `investigate_workflow`.

## Confidence mapping

- `high`: directly observed, exact signatures, compatible state, complete adapter signals, and cross-session support where durability is claimed.
- `medium`: observed but single-session, heuristic, or missing one non-critical signal.
- `low`: ambiguous ordering/state, unknown outcomes, heuristic custom-tool semantics, or weak durability evidence.

Every medium/low label records the concrete limitation. Confidence is not a probability.

## Examples

### Positive recurrence

Two logical sessions in the same project each perform the exact same documentation search with the same query, root, filters, and case setting. No relevant mutation intervenes, and result fingerprints match. Label the recurrence `observed`; avoidability may be `likely-avoidable`. If the reviewed subject is reusable procedure, `skill` with high confidence can be appropriate.

### Negative: different read ranges

One event reads lines 1–100 and a later event reads lines 101–200 of the same file. The paths match but signatures do not. Label the proposed recurrence `not-observed`; recommended action is `none`.

### Negative: read after edit

An agent reads a file, edits that file, then reads the same range to verify the new state. Record the mutation boundary and label the second read `legitimate_repeat`, even if its pre-normalization arguments match.

### Positive retry

A command fails with a structured error and the next significant operation repeats the exact command and working directory, then succeeds. Label `retry_chain`, outcome `mixed`, and retain all ordered evidence refs. Do not also label it avoidable recurrence.

### Ambiguous custom tool

A custom tool is called twice with canonically equal arguments, but the adapter exposes neither outcome nor mutation semantics. The recurrence itself can be `observed`; avoidability and durability are `uncertain`/`unknown`, action is normally `investigate_workflow` or `none`, and confidence is low.

### Unsupported signal

An OpenAI compatibility transcript contains tool calls but no standardized tool-result status. Record outcome as `unknown` and the outcome observation as `unsupported`; never infer success from result text.

## Disagreement and reporting

Typical disagreements are signature scope, whether a mutation is relevant, whether a verification call is legitimate, and whether knowledge is durable or merely current source state. The adjudication rationale must name the disputed evidence category without copying transcript content.

Before publishing a benchmark, report corpus composition by adapter and provenance, reviewer agreement, adjudication count, precision/recall by finding type, false-positive rate, and known sampling limitations. A gate is achieved only on the approved, consented real-run corpus—not by changing labels or substituting synthetic cases.
