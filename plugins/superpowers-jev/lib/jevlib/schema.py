"""A JSON-schema subset validator: type, required, properties,
additionalProperties (false only), items, enum, minItems, description.
lint.py rejects any other keyword, so templates cannot rely on one silently."""

KEYWORDS = {"type", "required", "properties", "additionalProperties", "items",
            "enum", "minItems", "description"}

_TYPES = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "integer": int,
    "number": (int, float),
}


def validate(schema, value, path="$"):
    """Return a list of error strings; empty means valid."""
    expected = schema.get("type")
    if expected:
        ok = isinstance(value, _TYPES[expected])
        if expected in ("integer", "number") and isinstance(value, bool):
            ok = False
        if not ok:
            return ["%s: expected %s" % (path, expected)]
    errors = []
    if "enum" in schema and value not in schema["enum"]:
        errors.append("%s: %r not in %r" % (path, value, schema["enum"]))
    if expected == "object":
        for key in schema.get("required", []):
            if key not in value:
                errors.append("%s: missing required %r" % (path, key))
        props = schema.get("properties", {})
        for key, sub in value.items():
            if key in props:
                errors.extend(validate(props[key], sub, "%s.%s" % (path, key)))
            elif schema.get("additionalProperties") is False:
                errors.append("%s: unexpected property %r" % (path, key))
    if expected == "array":
        if len(value) < schema.get("minItems", 0):
            errors.append("%s: fewer than %d items" % (path, schema["minItems"]))
        if "items" in schema:
            for i, item in enumerate(value):
                errors.extend(validate(schema["items"], item, "%s[%d]" % (path, i)))
    return errors
