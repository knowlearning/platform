# Postgres Query Composition Test Matrix

This checklist tracks regression coverage and feature coverage for the
`external` query-composition model implemented in
[`core/source/configured-query.js`](../../core/source/configured-query.js)
and exercised from
[`sites/test/tests/postgres.js`](./tests/postgres.js).

Use it as the source of truth when adding coverage, debugging regressions,
or reviewing changes to query resolution, parameter rewriting, or domain
configuration behavior.

## Status Key

- `[x]` Covered by the current suite in `sites/test/tests/postgres.js`
- `[ ]` Not currently covered and should be added if the behavior matters

## Baseline Postgres Regressions

- [x] Domain claim and initial configuration complete successfully.
- [x] Reconfiguration completes successfully and reports completion.
- [x] Raw string query definitions still execute.
- [x] Object-style query definitions with `domains` and `body` still execute.
- [x] Embedded query execution still works for non-composed queries.
- [x] Embedded query errors still propagate correctly.
- [x] Function-backed queries still execute.
- [x] Metadata queries for rows created before initial configuration still work.
- [x] Metadata queries for rows created after initial configuration still work.
- [x] Metadata queries for rows created after reconfiguration still work.
- [x] Text array columns still round-trip through table sync and queries.
- [x] JSONB columns still round-trip through table sync and queries.
- [x] Queries against removed tables still fail with the expected Postgres error.
- [ ] Re-enabled parallel non-composed query execution still passes.
- [ ] Queries containing only original positional parameters still preserve numbering.
- [ ] Queries mixing original positional parameters and built-in named bindings still preserve numbering.
- [ ] Repeated use of the same positional placeholder in one body reuses a single bound value correctly.
- [ ] Placeholders inside SQL string literals are never rewritten.
- [ ] Placeholders inside SQL comments are never rewritten.
- [ ] Placeholders inside double-quoted identifiers are never rewritten.

## Explicit `external` Coverage

- [x] Same-domain explicit `external` with positional params resolves correctly.
- [x] Same-domain explicit `external` with built-in named bindings resolves correctly.
- [x] Same-domain explicit `external` with mixed positional and named bindings resolves correctly.
- [x] Explicit `external` results can be consumed via `ANY($name::TEXT[])`.
- [x] Explicit `external` results can be consumed via `unnest($name::TEXT[])`.
- [x] Explicit `external` takes precedence over an implicit same-domain query with the same name.
- [x] Chained explicit `external` bindings resolve in dependency order.
- [x] Circular explicit `external` dependencies fail with `CIRCULAR EXTERNAL QUERY`.
- [x] Cross-domain explicit `external` preserves `$REQUESTING_DOMAIN`.
- [x] Cross-domain explicit `external` preserves `$CONTEXT`.
- [x] Explicit `external` with `params` omitted behaves as a zero-argument query call.
- [ ] Multiple distinct explicit `external` bindings in one SQL body resolve correctly.
- [ ] The same explicit `external` binding referenced multiple times in one SQL body stays stable.
- [ ] Explicit `external` where `domain` is a literal string works.
- [ ] Explicit `external` where `query` is a literal string works.
- [ ] Explicit `external` where `domain` resolves from another explicit binding works, if intentionally supported.
- [ ] Explicit `external` where `query` resolves from another explicit binding works, if intentionally supported.
- [ ] Explicit `external` with an empty result set behaves correctly in body consumers.
- [x] Explicit `external` target queries returning more than one column fail with `INVALID FOREIGN QUERY RESULT`.
- [ ] Explicit `external` still respects cross-domain authorization restrictions.
- [ ] Explicit `external` same-domain recursion routed through another query path fails with `CIRCULAR FOREIGN QUERY`.
- [ ] Explicit `external` cross-domain recursion routed through another query path fails with `CIRCULAR FOREIGN QUERY`.
- [ ] Explicit `external` does not leak unused original parent params into the final SQL call.

## Implicit Same-Domain `$query_name` Coverage

- [x] Implicit same-domain references resolve to a same-domain query when not declared in `external`.
- [x] Implicit same-domain references use the parent query's original params.
- [x] Implicit same-domain references can be consumed via `ANY($query_name::TEXT[])`.
- [x] Direct implicit self-reference fails with `CIRCULAR FOREIGN QUERY`.
- [ ] Implicit same-domain references can be consumed via `unnest($query_name::TEXT[])`.
- [ ] Repeated implicit use of the same same-domain query in one body stays stable.
- [ ] Implicit same-domain references to a missing query fail with `INVALID QUERY '<name>' FOR '<domain>'`.
- [x] Implicit same-domain references to a multi-column query fail with `INVALID FOREIGN QUERY RESULT`.
- [x] Indirect same-domain cycles across two or more queries fail with `CIRCULAR FOREIGN QUERY`.
- [x] Mixed explicit and implicit references in one SQL body resolve correctly.
- [ ] Hyphenated same-domain query names remain supported in implicit references.

## Error-Path And Rewrite Coverage

- [x] Legacy `$query(...)` syntax fails with a clear application error instead of Postgres syntax error.
- [x] Type-sensitive rewritten helper queries are explicitly cast where needed to avoid `42P18`.
- [x] Repeated suite runs in the same domain do not accumulate stale rows into the composed-query expectations.
- [ ] Final rewritten SQL never contains unresolved `$name` references when execution reaches Postgres.
- [ ] Final rewritten SQL preserves body-level original positional placeholders.
- [ ] Final arg compaction removes unused original params from the outermost SQL call.
- [ ] Parameter order in the final SQL call follows first use in the rewritten SQL body.
- [ ] Queries comparing two rewritten parameters without type context are either rejected in fixtures or explicitly cast.
- [ ] Malformed placeholder-like text such as `$1abc` or dollar-quoted strings is not misparsed, if those inputs are allowed.
- [ ] Max foreign-query depth is still enforced with `FOREIGN QUERY DEPTH EXCEEDED`.
- [ ] Deep but valid explicit or implicit composition chains below the max depth still succeed.

## Configuration And YAML Regressions

- [x] Object-style query definitions with `external` parse as valid YAML.
- [x] Cross-domain `external.domain` values containing `:` are quoted correctly.
- [x] Multi-line SQL `body: |` blocks remain correctly indented after config edits.
- [ ] Invalid `external` definitions fail configuration or query execution with stable errors:
- [x] Missing `external.<name>.domain`
- [x] Missing `external.<name>.query`
- [x] Unknown positional parameter like `$99`
- [x] Unknown named binding like `$NOPE`
- [x] Non-string resolved `domain`
- [x] Non-string resolved `query`

## Rerun And Isolation Regressions

- [x] Composition helper queries are constrained to the current run's generated IDs.
- [ ] Full Postgres suite passes on repeated runs against the same domain without manual cleanup.
- [ ] Full Postgres suite passes after partial failure and rerun without manual cleanup.
- [ ] Composition queries remain deterministic if stale rows from previous runs exist in the same tables.
- [ ] Reconfiguration tests remain stable when sync to Postgres is slower than expected.

## Suggested Next Additions

The highest-value uncovered tests are:

1. Final-arg compaction tests that prove unused parent params are removed.
2. Multiple distinct explicit `external` bindings in one SQL body.
3. Repeated use of the same explicit or implicit reference in one SQL body.
4. Missing-query implicit same-domain reference coverage.
5. Placeholder rewrite safety for strings, comments, and quoted identifiers.
