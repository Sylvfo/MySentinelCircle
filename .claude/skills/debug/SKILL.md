---
name: debug
description: Scientific debugging procedure — for any bug, whether found while building a feature or reported via a GitHub issue.
---
Updated: 2026-08-21

# Scientific debugging

## 1. Locate and reproduce

Identify precisely where and how the bug manifests. Reproduce it reliably before touching any code.

## 2. Form 3 hypotheses

Formulate 3 hypotheses about the root cause, each with a test that would confirm or rule it out.

## 3. Targeted temporary logs

If needed, add temporary logs targeted at the hypotheses being tested — remove them once the bug is resolved.

## 4. Root cause

Write a clear description of the confirmed root cause before writing the fix.

## 5. Isolated bug or architecture issue?

Assess whether this is a one-off bug or a symptom of a broader architecture problem. If it's architectural, flag it to Sylvie before patching locally — don't patch a symptom of a deeper issue without discussing it.
