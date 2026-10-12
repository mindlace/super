# Auth spec

## Goal
Validate session tokens in middleware for every route.

## Interface rows

| Producer | Consumer | Signature |
|---|---|---|
| auth | billing | verify(token) -> User |
| auth | search | current_user() -> User |
