const { z } = require("zod");
const complaintRepository = require("../../complaints/complaint.repository");
const semanticSearchService = require("../understand/semantic-search.service");
const understandService = require("../understand/understand.service");
const hotspotService = require("../spatial/hotspot.service");
const spatialService = require("../spatial/spatial.service");
const infrastructureService = require("../infrastructure/infrastructure.service");
const infrastructureRepository = require("../../../repositories/infrastructure.repository");
const graphService = require("../graph/graph.service");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ASSET_CODE_RE = /\b(?:RD|WP|DR|SL|SN)-[A-Z]{2,5}-\d+\b/gi;
const COMPLAINT_REF_RE = /\bCP-\d{4}-\d{3,}\b/gi;

function collectFactsFromValue(value, facts = { entities: new Set(), numbers: new Set() }, depth = 0) {
  if (value === null || value === undefined || depth > 7) {
    return facts;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    facts.numbers.add(String(value));
    facts.numbers.add(String(Math.round(value)));
    if (!Number.isInteger(value)) {
      facts.numbers.add(value.toFixed(1));
      facts.numbers.add(value.toFixed(2));
    }
    return facts;
  }
  if (typeof value === "string") {
    const assetMatches = value.match(ASSET_CODE_RE);
    if (assetMatches) {
      for (const m of assetMatches) facts.entities.add(m.toUpperCase());
    }
    const refMatches = value.match(COMPLAINT_REF_RE);
    if (refMatches) {
      for (const m of refMatches) facts.entities.add(m.toUpperCase());
    }
    return facts;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFactsFromValue(item, facts, depth + 1);
    }
    return facts;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "assetCode" && typeof v === "string") {
        facts.entities.add(v.toUpperCase());
      } else if (k === "referenceId" && typeof v === "string") {
        facts.entities.add(v.toUpperCase());
      } else if ((k === "city" || k === "ward" || k === "hotspotKey") && typeof v === "string" && v.trim()) {
        facts.entities.add(v.trim());
      }
      collectFactsFromValue(v, facts, depth + 1);
    }
  }
  return facts;
}

async function resolveComplaintRow(complaintIdOrRef) {
  const clean = String(complaintIdOrRef || "").trim().replace(/^#/, "");
  if (!clean) return null;
  if (UUID_REGEX.test(clean)) {
    return complaintRepository.findComplaintById(clean);
  }
  const matches = await complaintRepository.findAllComplaints({
    query: clean,
    limit: 5,
  });
  return (
    matches.find(
      (c) =>
        String(c.reference_id || "").toLowerCase() === clean.toLowerCase() ||
        c.id === clean,
    ) ||
    matches[0] ||
    null
  );
}

async function resolveAssetRow(assetIdOrCode) {
  const clean = String(assetIdOrCode || "").trim();
  if (!clean) return null;
  if (UUID_REGEX.test(clean)) {
    return infrastructureRepository.findAssetById(clean);
  }
  return infrastructureRepository.findAssetByCode(clean);
}

const TOOL_DEFINITIONS = {
  fetch_complaints: {
    name: "fetch_complaints",
    layer: "Core + Layer 1",
    description:
      "Retrieve structured citizen complaints filtered by city, category, status, or keyword query.",
    readOnly: true,
    allowedAgents: ["ComplaintAgent", "PriorityAgent", "InvestigationAgent"],
    inputSchema: z.object({
      city: z.string().trim().optional().nullable(),
      category: z.string().trim().optional().nullable(),
      status: z.string().trim().optional().nullable(),
      query: z.string().trim().optional().nullable(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    async execute(args) {
      const rows = await complaintRepository.findAllComplaints({
        city: args.city || undefined,
        category: args.category || undefined,
        status: args.status || undefined,
        query: args.query || undefined,
        limit: args.limit || 25,
      });
      return {
        total: rows.length,
        complaints: rows.map((c) => ({
          id: c.id,
          referenceId: c.reference_id,
          title: c.title,
          category: c.ai_category || c.category,
          priority: c.ai_priority || c.priority,
          status: c.status,
          city: c.city,
          ward: c.ward,
          department: c.department,
          address: c.address,
          latitude: c.latitude != null ? Number(c.latitude) : null,
          longitude: c.longitude != null ? Number(c.longitude) : null,
          aiSummary: c.ai_summary || null,
          createdAt: c.created_at,
        })),
      };
    },
  },

  fetch_complaint_detail: {
    name: "fetch_complaint_detail",
    layer: "Core + Layer 1",
    description: "Fetch a single complaint record by UUID or CP-* reference ID.",
    readOnly: true,
    allowedAgents: ["ComplaintAgent", "PriorityAgent", "InvestigationAgent"],
    inputSchema: z.object({
      complaintIdOrRef: z.string().trim().min(2),
    }),
    async execute(args) {
      const c = await resolveComplaintRow(args.complaintIdOrRef);
      if (!c) {
        return { found: false, complaint: null };
      }
      return {
        found: true,
        complaint: {
          id: c.id,
          referenceId: c.reference_id,
          title: c.title,
          description: c.description,
          category: c.ai_category || c.category,
          rawCategory: c.category,
          priority: c.ai_priority || c.priority,
          status: c.status,
          city: c.city,
          ward: c.ward,
          zone: c.zone,
          department: c.department,
          address: c.address,
          latitude: c.latitude != null ? Number(c.latitude) : null,
          longitude: c.longitude != null ? Number(c.longitude) : null,
          aiSummary: c.ai_summary || null,
          aiConfidence: c.ai_confidence != null ? Number(c.ai_confidence) : null,
          aiTags: Array.isArray(c.ai_tags) ? c.ai_tags : [],
          createdAt: c.created_at,
        },
      };
    },
  },

  understand_complaint_text: {
    name: "understand_complaint_text",
    layer: "Layer 1",
    description:
      "Run AI understanding (classification & summarization) on complaint text in offline-safe mode.",
    readOnly: true,
    allowedAgents: ["ComplaintAgent"],
    inputSchema: z.object({
      title: z.string().trim().min(2),
      description: z.string().trim().min(2),
      address: z.string().trim().optional().nullable(),
      existingCategory: z.string().trim().optional().nullable(),
    }),
    async execute(args) {
      return understandService.understandComplaint(
        {
          title: args.title,
          description: args.description,
          address: args.address || "",
          existingCategory: args.existingCategory || undefined,
        },
        { offlineFallback: true },
      );
    },
  },

  semantic_search_complaints: {
    name: "semantic_search_complaints",
    layer: "Layer 1",
    description:
      "Search citizen complaints by semantic meaning, multilingual concepts, and keyword boost.",
    readOnly: true,
    allowedAgents: ["ComplaintAgent", "InvestigationAgent"],
    inputSchema: z.object({
      query: z.string().trim().min(2),
      city: z.string().trim().optional().nullable(),
      limit: z.number().int().min(1).max(30).optional(),
    }),
    async execute(args) {
      return semanticSearchService.semanticSearchComplaints({
        query: args.query,
        city: args.city || null,
        limit: args.limit || 10,
      });
    },
  },

  find_related_complaints: {
    name: "find_related_complaints",
    layer: "Layer 1 + Layer 2",
    description:
      "Find semantically and spatially related citizen complaints and hotspot membership for a complaint UUID.",
    readOnly: true,
    allowedAgents: ["ComplaintAgent", "InvestigationAgent"],
    inputSchema: z.object({
      complaintId: z.string().trim().min(2),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    async execute(args) {
      const resolved = UUID_REGEX.test(args.complaintId)
        ? { id: args.complaintId }
        : await resolveComplaintRow(args.complaintId);
      if (!resolved) {
        return { complaintId: args.complaintId, hotspots: [], similarComplaints: [] };
      }
      return semanticSearchService.findRelatedComplaintsForComplaint(resolved.id, {
        limit: args.limit || 8,
      });
    },
  },

  list_hotspots: {
    name: "list_hotspots",
    layer: "Layer 2",
    description:
      "Retrieve persisted spatial DBSCAN hotspots, cross-category overlaps, density, and cluster severity.",
    readOnly: true,
    allowedAgents: ["SpatialAgent", "PriorityAgent"],
    inputSchema: z.object({
      city: z.string().trim().optional().nullable(),
      ward: z.string().trim().optional().nullable(),
      status: z.string().trim().optional().nullable(),
    }),
    async execute(args) {
      return hotspotService.listSavedHotspots({
        city: args.city || undefined,
        ward: args.ward || undefined,
        status: args.status || undefined,
      });
    },
  },

  get_ward_analytics: {
    name: "get_ward_analytics",
    layer: "Layer 2",
    description:
      "Compute ward-level complaint totals, open backlogs, high/critical share, and active hotspot overlaps.",
    readOnly: true,
    allowedAgents: ["SpatialAgent", "PriorityAgent"],
    inputSchema: z.object({
      city: z.string().trim().optional().nullable(),
      timeWindowDays: z.number().int().min(1).max(365).optional().nullable(),
    }),
    async execute(args) {
      return hotspotService.getWardAnalytics({
        city: args.city || null,
        timeWindowDays: args.timeWindowDays ?? null,
      });
    },
  },

  analyze_nearby_complaints: {
    name: "analyze_nearby_complaints",
    layer: "Layer 2",
    description:
      "Inspect nearby complaints within a meter radius of coordinates and check cross-category overlap alerts.",
    readOnly: true,
    allowedAgents: ["SpatialAgent"],
    inputSchema: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      radiusMeters: z.number().min(50).max(10000).optional(),
      city: z.string().trim().optional().nullable(),
    }),
    async execute(args) {
      return spatialService.analyzeNearbyComplaints({
        latitude: args.latitude,
        longitude: args.longitude,
        radiusMeters: args.radiusMeters || 600,
        maxResults: 40,
        city: args.city || undefined,
      });
    },
  },

  get_infrastructure_overview: {
    name: "get_infrastructure_overview",
    layer: "Layer 3",
    description:
      "Retrieve infrastructure asset health scores, grades, trends, and ward health rollups.",
    readOnly: true,
    allowedAgents: ["InfrastructureAgent", "PriorityAgent"],
    inputSchema: z.object({
      city: z.string().trim().optional().nullable(),
      ward: z.string().trim().optional().nullable(),
      grade: z.string().trim().optional().nullable(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    async execute(args) {
      return infrastructureService.getInfrastructureOverview({
        city: args.city || null,
        ward: args.ward || null,
        grade: args.grade || null,
        sortBy: "lowest_health",
        limit: args.limit || 50,
      });
    },
  },

  get_asset_details: {
    name: "get_asset_details",
    layer: "Layer 3",
    description:
      "Retrieve detailed asset health score breakdown, 5 deterministic penalties, linked complaints, maintenance history, and historical trajectory.",
    readOnly: true,
    allowedAgents: ["InfrastructureAgent", "InvestigationAgent", "PriorityAgent"],
    inputSchema: z.object({
      assetIdOrCode: z.string().trim().min(2),
    }),
    async execute(args) {
      const row = await resolveAssetRow(args.assetIdOrCode);
      if (!row) {
        return { found: false, asset: null };
      }
      const details = await infrastructureService.getAssetDetails(row.id);
      return { found: true, ...details };
    },
  },

  get_assets_for_complaint: {
    name: "get_assets_for_complaint",
    layer: "Layer 3",
    description: "List infrastructure assets linked (DIRECT or CROSS_IMPACT) to a complaint.",
    readOnly: true,
    allowedAgents: ["InfrastructureAgent", "InvestigationAgent"],
    inputSchema: z.object({
      complaintId: z.string().trim().min(2),
    }),
    async execute(args) {
      const resolved = UUID_REGEX.test(args.complaintId)
        ? { id: args.complaintId }
        : await resolveComplaintRow(args.complaintId);
      if (!resolved) {
        return { complaintId: args.complaintId, assets: [] };
      }
      const assets = await infrastructureService.getAssetsForComplaint(resolved.id);
      return { complaintId: resolved.id, assets };
    },
  },

  investigate_asset_graph: {
    name: "investigate_asset_graph",
    layer: "Layer 4",
    description:
      "Query the Civic Knowledge Graph around an infrastructure asset for 2-hop evidence chains and non-causal upstream contributors.",
    readOnly: true,
    allowedAgents: ["InvestigationAgent"],
    inputSchema: z.object({
      assetIdOrCode: z.string().trim().min(2),
      includeInferred: z.boolean().optional(),
    }),
    async execute(args) {
      return graphService.investigateAsset(args.assetIdOrCode, {
        includeInferred: args.includeInferred !== false,
      });
    },
  },

  investigate_complaint_graph: {
    name: "investigate_complaint_graph",
    layer: "Layer 4",
    description:
      "Query the Civic Knowledge Graph around a complaint for connected assets, potential upstream risks, and semantic peers.",
    readOnly: true,
    allowedAgents: ["InvestigationAgent"],
    inputSchema: z.object({
      complaintIdOrRef: z.string().trim().min(2),
      includeInferred: z.boolean().optional(),
    }),
    async execute(args) {
      return graphService.investigateComplaint(args.complaintIdOrRef, {
        includeInferred: args.includeInferred !== false,
      });
    },
  },

  find_graph_path: {
    name: "find_graph_path",
    layer: "Layer 4",
    description:
      "Find shortest relationship path between two Civic Knowledge Graph entities (assets, complaints, hotspots, wards, departments).",
    readOnly: true,
    allowedAgents: ["InvestigationAgent"],
    inputSchema: z.object({
      from: z.string().trim().min(2),
      to: z.string().trim().min(2),
      maxDepth: z.number().int().min(1).max(6).optional(),
      includeInferred: z.boolean().optional(),
    }),
    async execute(args) {
      return graphService.findShortestPath(args.from, args.to, {
        maxDepth: args.maxDepth || 5,
        includeInferred: args.includeInferred !== false,
      });
    },
  },
};

function listToolSchemas() {
  return Object.values(TOOL_DEFINITIONS).map((def) => ({
    name: def.name,
    layer: def.layer,
    description: def.description,
    readOnly: def.readOnly,
    allowedAgents: def.allowedAgents,
  }));
}

async function executeAgentTool({ toolName, agentName, args = {}, trace }) {
  const startedAt = Date.now();
  const def = TOOL_DEFINITIONS[toolName];

  if (!def) {
    const entry = {
      toolName,
      agentName,
      args,
      validArgs: false,
      status: "UNKNOWN_TOOL",
      durationMs: Date.now() - startedAt,
      error: `Tool "${toolName}" is not registered.`,
    };
    if (trace) trace.toolCalls.push(entry);
    throw new Error(entry.error);
  }

  if (!def.allowedAgents.includes(agentName)) {
    const entry = {
      toolName,
      agentName,
      args,
      validArgs: false,
      status: "PERMISSION_DENIED",
      durationMs: Date.now() - startedAt,
      error: `Agent "${agentName}" is not authorized to execute "${toolName}".`,
    };
    if (trace) trace.toolCalls.push(entry);
    const err = new Error(entry.error);
    err.statusCode = 403;
    throw err;
  }

  const parsed = def.inputSchema.safeParse(args || {});
  if (!parsed.success) {
    const entry = {
      toolName,
      agentName,
      args,
      validArgs: false,
      status: "INVALID_ARGS",
      durationMs: Date.now() - startedAt,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
    if (trace) trace.toolCalls.push(entry);
    throw new Error(`Invalid arguments for tool "${toolName}": ${entry.error}`);
  }

  try {
    const result = await def.execute(parsed.data);
    const extracted = collectFactsFromValue(result);
    if (trace) {
      for (const e of extracted.entities) trace.groundTruth.entities.add(e);
      for (const n of extracted.numbers) trace.groundTruth.numbers.add(n);
      trace.toolCalls.push({
        toolName,
        agentName,
        args: parsed.data,
        validArgs: true,
        status: "SUCCESS",
        durationMs: Date.now() - startedAt,
        observedEntitiesCount: extracted.entities.size,
      });
    }
    return result;
  } catch (err) {
    if (trace) {
      trace.toolCalls.push({
        toolName,
        agentName,
        args: parsed.data,
        validArgs: true,
        status: "FAILED",
        durationMs: Date.now() - startedAt,
        error: err.message,
      });
    }
    throw err;
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  listToolSchemas,
  executeAgentTool,
  collectFactsFromValue,
};
