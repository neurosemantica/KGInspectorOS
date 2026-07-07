"""Domain types and error hierarchy for KGInspector."""

from dataclasses import dataclass, field
from typing import Any, TypeAlias


class DiffError(Exception):
    """Base error for diff operations."""


class CanonError(DiffError):
    """Canonicalization failed."""


class MatchError(DiffError):
    """Blank node matching failed."""


class LoadError(DiffError):
    """Graph loading failed."""


class ValidationError(DiffError):
    """Configuration validation failed."""


NQuads: TypeAlias = str
BNodeMapping: TypeAlias = dict[str, str]


@dataclass
class DiffOptions:
    """Configuration for diff computation.
    
    Attributes:
        limit: Max results per category (None = unlimited)
        rename_limit: Max entities for rename detection
        compute_bc: Compute betweenness centrality diff
        store_path: Disk store path (None = in-memory)
        page_size: Results per page for streaming
        bnode_gw_enabled: Enable Gromov-Wasserstein fallback for unmatched bnodes
        bnode_gw_threshold: Min transport weight to accept GW match (0.0-1.0)
        bnode_gw_alpha: Balance structure (0.0) vs features (1.0) in GW
    """
    limit: int | None = None
    rename_limit: int = 1000
    compute_bc: bool = True
    store_path: str | None = None
    page_size: int = 10_000
    bnode_gw_enabled: bool = True
    bnode_gw_threshold: float = 0.3
    bnode_gw_alpha: float = 0.5
    
    def __post_init__(self) -> None:
        """Validate configuration after initialization."""
        self._validate()
    
    def _validate(self) -> None:
        """Validate configuration values."""
        if self.limit is not None and self.limit < 0:
            raise ValidationError(f"limit must be non-negative, got {self.limit}")
        
        if self.rename_limit < 0:
            raise ValidationError(f"rename_limit must be non-negative, got {self.rename_limit}")
        
        if self.page_size < 1:
            raise ValidationError(f"page_size must be positive, got {self.page_size}")
        
        if not 0.0 <= self.bnode_gw_threshold <= 1.0:
            raise ValidationError(
                f"bnode_gw_threshold must be in [0.0, 1.0], got {self.bnode_gw_threshold}"
            )
        
        if not 0.0 <= self.bnode_gw_alpha <= 1.0:
            raise ValidationError(
                f"bnode_gw_alpha must be in [0.0, 1.0], got {self.bnode_gw_alpha}"
            )


@dataclass
class CentralityInfo:
    """Betweenness centrality information for a node."""
    bc_old: float = 0.0
    bc_new: float = 0.0
    
    @property
    def bc_diff(self) -> float:
        """Absolute change in centrality."""
        return abs(self.bc_new - self.bc_old)
    
    @property
    def bc_direction(self) -> str:
        """Direction of centrality change: 'increased', 'decreased', or 'unchanged'."""
        if self.bc_new > self.bc_old + 0.001:
            return "increased"
        elif self.bc_new < self.bc_old - 0.001:
            return "decreased"
        return "unchanged"


@dataclass
class GraphDiff:
    """Complete diff result between two RDF graphs."""
    triples_added: list[tuple[str, str, str]] = field(default_factory=list)
    triples_deleted: list[tuple[str, str, str]] = field(default_factory=list)
    literal_changed: list[dict[str, str]] = field(default_factory=list)
    subject_changed: list[dict[str, str]] = field(default_factory=list)
    predicate_changed: list[dict[str, str]] = field(default_factory=list)
    object_changed: list[dict[str, str]] = field(default_factory=list)
    compound_changed: list[dict[str, Any]] = field(default_factory=list)
    node_renamed: list[dict[str, Any]] = field(default_factory=list)
    centrality: dict[str, CentralityInfo] = field(default_factory=dict)

    @property
    def is_empty(self) -> bool:
        return not (self.triples_added or self.triples_deleted or self.literal_changed or
                    self.subject_changed or self.predicate_changed or self.object_changed or
                    self.compound_changed or self.node_renamed)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "triples_added": self.triples_added,
            "triples_deleted": self.triples_deleted,
            "literal_changed": self.literal_changed,
            "subject_changed": self.subject_changed,
            "predicate_changed": self.predicate_changed,
            "object_changed": self.object_changed,
            "compound_changed": self.compound_changed,
            "node_renamed": self.node_renamed,
            "centrality": {
                uri: {
                    "bc_old": c.bc_old,
                    "bc_new": c.bc_new,
                    "bc_diff": c.bc_diff,
                    "bc_direction": c.bc_direction,
                }
                for uri, c in self.centrality.items()
            },
        }
