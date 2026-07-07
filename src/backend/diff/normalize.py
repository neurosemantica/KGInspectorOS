"""Normalization functions for RDF terms (RFC 3986 for URIs)."""

import unicodedata
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse, urlunparse, unquote, quote

_DEFAULT_PORTS = {"http": 80, "https": 443, "ftp": 21}


def normalize_uri(uri: str) -> str:
    """Normalize URI per RFC 3986."""
    if not uri or not uri.startswith(("http://", "https://", "urn:", "ftp://")):
        return uri
    
    try:
        parsed = urlparse(uri)
    except ValueError:
        return uri
    
    scheme = parsed.scheme.lower()
    host = (parsed.hostname or "").lower()
    
    port = parsed.port
    if port and _DEFAULT_PORTS.get(scheme) == port:
        port = None
    
    netloc = host
    if parsed.username:
        userinfo = parsed.username
        if parsed.password:
            userinfo += f":{parsed.password}"
        netloc = f"{userinfo}@{host}"
    if port:
        netloc += f":{port}"
    
    path = _normalize_path(parsed.path) if parsed.path else "/"
    return urlunparse((scheme, netloc, path, parsed.params, parsed.query, parsed.fragment))


def _normalize_path(path: str) -> str:
    decoded = unquote(path)
    normalized = quote(decoded, safe="/:@!$&'()*+,;=-._~")
    segments = normalized.split("/")
    output = []
    for seg in segments:
        if seg == ".":
            continue
        elif seg == "..":
            if output and output[-1] != "":
                output.pop()
        else:
            output.append(seg)
    return "/".join(output) or "/"


def _normalize_decimal(value: str) -> str:
    try:
        return str(Decimal(value).normalize())
    except InvalidOperation:
        return value


def _normalize_boolean(value: str) -> str:
    v = value.strip().lower()
    if v in ("true", "1"):
        return "true"
    if v in ("false", "0"):
        return "false"
    return value


def _normalize_double(value: str) -> str:
    try:
        f = float(value)
        return "0.0E0" if f == 0.0 else f"{f:E}"
    except ValueError:
        return value


_norm_signed_int = lambda v: str(int(v)) if v.lstrip("-").isdigit() else v
_norm_unsigned_int = lambda v: str(int(v)) if v.isdigit() else v

_LITERAL_NORMALIZERS = {
    **dict.fromkeys(
        ["integer", "int", "long", "short", "byte",
         "nonNegativeInteger", "nonPositiveInteger", "positiveInteger", "negativeInteger"],
        _norm_signed_int,
    ),
    **dict.fromkeys(
        ["unsignedLong", "unsignedInt", "unsignedShort", "unsignedByte"],
        _norm_unsigned_int,
    ),
    "decimal": _normalize_decimal,
    "boolean": _normalize_boolean,
    "double": _normalize_double,
    "float": _normalize_double,
    "string": lambda v: v,
}


def normalize_literal(value: str, datatype: str | None = None) -> str:
    """Normalize literal to canonical form."""
    value = unicodedata.normalize("NFC", value)
    if datatype is None:
        return value.strip()
    
    dt = datatype.rsplit("#", 1)[-1] if "#" in datatype else datatype.rsplit("/", 1)[-1]
    normalizer = _LITERAL_NORMALIZERS.get(dt)
    return normalizer(value) if normalizer else value
