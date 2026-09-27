#!/bin/sh
# Example of an executable part shipped inside a skill archive.
# DevDigest NEVER runs, extracts or even reads this file on import — only
# SKILL.md is taken. It is here so the import preview lists it as "ignored".
grep -rn "setTimeout\|Math.random\|Date.now()" --include='*.test.ts' .
