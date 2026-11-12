BEGIN;

-- Layer 4: Civic Knowledge Graph nodes and relationship edges with explicit provenance metadata
CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_key VARCHAR(200) NOT NULL UNIQUE,
    entity_type VARCHAR(40) NOT NULL,
    external_id VARCHAR(120),
    label VARCHAR(240) NOT NULL,
    city VARCHAR(100),
    ward VARCHAR(100),
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT kg_nodes_entity_type_check
        CHECK (
            entity_type IN (
                'COMPLAINT',
                'INFRASTRUCTURE_ASSET',
                'HOTSPOT',
                'MAINTENANCE_EVENT',
                'WARD',
                'DEPARTMENT',
                'OFFICER',
                'CATEGORY'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_kg_nodes_entity_type_city
    ON knowledge_graph_nodes(entity_type, city);

CREATE INDEX IF NOT EXISTS idx_kg_nodes_external_id
    ON knowledge_graph_nodes(external_id)
    WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_node_id UUID NOT NULL REFERENCES knowledge_graph_nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES knowledge_graph_nodes(id) ON DELETE CASCADE,
    relation_type VARCHAR(50) NOT NULL,
    weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    is_inferred BOOLEAN NOT NULL DEFAULT FALSE,
    evidence TEXT,
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT kg_edges_unique_triple
        UNIQUE (source_node_id, target_node_id, relation_type),

    CONSTRAINT kg_edges_relation_type_check
        CHECK (
            relation_type IN (
                'AFFECTS',
                'CROSS_IMPACTS',
                'POTENTIALLY_IMPACTS',
                'IN_HOTSPOT',
                'LOCATED_IN',
                'MAINTAINED_BY',
                'ROUTED_TO',
                'ASSIGNED_TO',
                'HAS_CATEGORY',
                'HAS_MAINTENANCE',
                'PERFORMED_BY',
                'SIMILAR_TO'
            )
        ),

    CONSTRAINT kg_edges_confidence_check
        CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS idx_kg_edges_source
    ON knowledge_graph_edges(source_node_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_kg_edges_target
    ON knowledge_graph_edges(target_node_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_kg_edges_relation_inferred
    ON knowledge_graph_edges(relation_type, is_inferred);

COMMIT;
