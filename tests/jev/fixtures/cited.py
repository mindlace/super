import json


def parse_config(path):
    """Load a JSON config file."""
    with open(path) as fh:
        text = fh.read()
    if not text:
        return {}
    return json.loads(text)
