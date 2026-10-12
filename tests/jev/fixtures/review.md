### Spec Compliance

- ✅ Spec compliant

### Strengths

- Clear tests for the parser.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

- `src/config.py:14` — parse_config swallows the JSONDecodeError and returns {},
  so a corrupt config silently loads as empty.
- `tests/test_config.py:3` — the test asserts nothing.

#### Minor (Nice to Have)

**src/config.py:2** — unused import of os.

### Assessment

**Task quality:** Needs fixes
