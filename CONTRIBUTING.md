# Contributing to Argus RPC

Argus changes are expected to preserve explicit protocol and lifecycle invariants rather than only satisfy happy-path tests.

## Before opening a change

1. Keep protocol compatibility intentional and documented.
2. Treat socket input, metadata, payload sizes, deadlines, and peer behavior as untrusted.
3. Add regression tests for every fixed race, lifecycle edge case, parser failure, or resource-boundary defect.
4. Prefer deterministic tests. Chaos and fuzz tests must record a seed when randomness is used.
5. Run `npm run verify` before requesting review.

## Commit discipline

Each commit should represent one reviewable engineering change: an invariant, implementation capability, regression test, benchmark improvement, or documentation contract. Avoid formatting-only churn mixed with behavior changes.

## Performance claims

Do not add performance numbers to the README unless they were produced by the checked-in benchmark harness. Record the Node version, operating system, CPU, concurrency, payload size, run count, and commit SHA alongside results.
