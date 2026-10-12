# Config survey

- parse_config returns {} for an empty file (verified-at-`cited.py:8`).
- parse_config retries on failure, verified-at cited.py:4-5.
- The loader caches results (verified-at-`missing.py:3`).
- The loader logs every read (verified-at-`cited.py:400`).
- Unverified: the CLI never calls parse_config.
