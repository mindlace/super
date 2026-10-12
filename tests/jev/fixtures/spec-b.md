# Billing spec

## Goal
Charge customers; prices are integer cents.

## Interfaces consumed

| Producer | Consumer | Signature |
| --- | --- | --- |
| auth | billing | verify(token) -> User |
