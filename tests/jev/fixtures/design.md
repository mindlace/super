# Shop design

## Goal
Sell things.

## Traceability table

| Model claim | Carried by |
|---|---|
| Tokens are validated by middleware | auth interface row 1 |
| Prices are integer cents | billing spec §2 |
| Search reads the product index | search spec |

## Interface table

| Producer | Consumer | Signature |
|---|---|---|
| auth | billing | verify(token) -> User |
