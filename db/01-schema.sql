CREATE TABLE tree_nodes (
    id UUID PRIMARY KEY,
    parent_id UUID REFERENCES tree_nodes(id),
    value TEXT NOT NULL CHECK (char_length(value) BETWEEN 1 AND 200),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX ix_tree_nodes_active_children
    ON tree_nodes (parent_id, id)
    WHERE deleted_at IS NULL;
