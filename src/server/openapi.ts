import { ACTIONS } from "./api-contracts";

/**
 * The OpenAPI description of /api/v1, served at GET /api/v1/openapi.json. Kept next to the code so a test can check
 * that every action the router accepts is documented.
 */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const body = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });
const ok = (description: string, schema?: object, status = "200") => ({ [status]: { description, ...(schema ? { content: { "application/json": { schema } } } : {}) } });
const errors = { default: { description: "Error", content: { "application/json": { schema: ref("Error") } } } };
const asUser = [{ $ref: "#/components/parameters/TrustLockUser" }];
const idemp = [{ $ref: "#/components/parameters/IdempotencyKey" }];

const ACTION_BODIES: Record<string, string | undefined> = {
  reject: "ReasonBody",
  counter: "CounterBody",
  "decline-counter": "ReasonBody",
  cancel: "OptionalReasonBody",
  deliver: "DeliverBody",
  "request-revision": "ReasonBody",
  dispute: "ReasonBody",
  message: "MessageBody",
  evidence: "EvidenceBody",
};
const NEEDS_KEY = new Set(["fund", "approve"]);

export function openApiDocument(serverUrl: string) {
  const actionPaths = Object.fromEntries(
    Object.keys(ACTIONS).map((a) => [
      `/contracts/{id}/${a}`,
      {
        post: {
          summary: `Contract action: ${a}`,
          tags: ["Contracts"],
          parameters: [...asUser, { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }, ...(NEEDS_KEY.has(a) ? [{ ...idemp[0], required: true }] : [])],
          ...(ACTION_BODIES[a] ? { requestBody: body(ACTION_BODIES[a]!) } : {}),
          responses: { ...ok("The contract after the action", ref("ContractDetail")), ...errors },
        },
      },
    ]),
  );

  return {
    openapi: "3.1.0",
    info: {
      title: "TrustLock API",
      version: "1.0.0",
      description:
        "Escrow for your own users. Call it from your server with an API key and name the user each request is for in the TrustLock-User header. " +
        "Practice credits only: no real money moves. Amounts are integers in minor units (100 = 1 credit).",
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    security: [{ bearer: [] }],
    tags: [{ name: "Users" }, { name: "Wallet" }, { name: "Contracts" }, { name: "Webhooks" }, { name: "Usage" }],
    paths: {
      "/users": { post: { summary: "Register or update one of your users", tags: ["Users"], requestBody: body("UserBody"), responses: { ...ok("Updated", ref("User")), ...ok("Created", ref("User"), "201"), ...errors } } },
      "/users/{external_id}": {
        get: { summary: "Read a user and their balances", tags: ["Users"], parameters: [{ name: "external_id", in: "path", required: true, schema: { type: "string" } }], responses: { ...ok("The user", ref("UserWithWallet")), ...errors } },
      },
      "/wallet": { get: { summary: "Balances and recent ledger entries", tags: ["Wallet"], parameters: asUser, responses: { ...ok("Wallet", ref("Wallet")), ...errors } } },
      "/wallet/top-ups": { post: { summary: "Add practice credits (clients)", tags: ["Wallet"], parameters: [...asUser, { ...idemp[0], required: true }], requestBody: body("AmountBody"), responses: { ...ok("New balances", ref("Balances"), "201"), ...errors } } },
      "/wallet/withdrawals": { post: { summary: "Pay out earnings (freelancers)", tags: ["Wallet"], parameters: [...asUser, { ...idemp[0], required: true }], requestBody: body("AmountBody"), responses: { ...ok("New balances", ref("Balances"), "201"), ...errors } } },
      "/contracts": {
        get: { summary: "List the user's contracts", tags: ["Contracts"], parameters: [...asUser, { name: "state", in: "query", schema: { type: "string" } }], responses: { ...ok("Contracts", { type: "object", properties: { data: { type: "array", items: ref("Contract") } } }), ...errors } },
        post: { summary: "Propose a contract (client to freelancer)", tags: ["Contracts"], parameters: [...asUser, idemp[0]], requestBody: body("CreateContractBody"), responses: { ...ok("Created", ref("Contract"), "201"), ...errors } },
      },
      "/contracts/{id}": {
        get: { summary: "One contract, with allowed_actions, timeline and messages", tags: ["Contracts"], parameters: [...asUser, { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { ...ok("Contract", ref("ContractDetail")), ...errors } },
      },
      "/webhook-endpoints": {
        get: { summary: "List your webhook endpoints", tags: ["Webhooks"], responses: { ...ok("Endpoints", { type: "object", properties: { data: { type: "array", items: ref("WebhookEndpoint") } } }), ...errors } },
        post: { summary: "Add a webhook endpoint (the signing secret is returned once)", tags: ["Webhooks"], requestBody: body("WebhookEndpointBody"), responses: { ...ok("Created", ref("WebhookEndpointWithSecret"), "201"), ...errors } },
      },
      "/webhook-endpoints/{id}": {
        get: { summary: "One endpoint with its 20 latest deliveries", tags: ["Webhooks"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { ...ok("Endpoint", ref("WebhookEndpoint")), ...errors } },
        delete: { summary: "Remove an endpoint", tags: ["Webhooks"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { ...ok("Removed"), ...errors } },
      },
      "/webhook-endpoints/{id}/test": {
        post: { summary: "Send a ping event now and report how it went", tags: ["Webhooks"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { ...ok("The delivery", ref("WebhookDelivery")), ...errors } },
      },
      "/usage": { get: { summary: "Your most recent API calls in this key's mode", tags: ["Usage"], parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200 } }], responses: { ...ok("Calls", { type: "object", properties: { mode: { enum: ["test", "live"] }, data: { type: "array", items: { type: "object", properties: { at: { type: "string" }, method: { type: "string" }, path: { type: "string" }, status: { type: "integer" }, error_code: { type: ["string", "null"] }, ms: { type: "integer" } } } } } }), ...errors } } },
      ...actionPaths,
    },
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Your TrustLock API key, starting with tlk_" } },
      parameters: {
        TrustLockUser: { name: "TrustLock-User", in: "header", required: true, description: "The id of YOUR user this request is for (the external_id you registered).", schema: { type: "string" } },
        IdempotencyKey: { name: "Idempotency-Key", in: "header", description: "8 to 100 characters, unique per distinct request. Repeating a request with the same key changes nothing and returns the first result.", schema: { type: "string", minLength: 8, maxLength: 100 } },
      },
      schemas: {
        Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } },
        UserBody: { type: "object", required: ["external_id", "name", "role"], properties: { external_id: { type: "string", pattern: "^[A-Za-z0-9._:@-]{1,64}$" }, name: { type: "string" }, role: { enum: ["client", "freelancer"] } } },
        User: { type: "object", properties: { external_id: { type: "string" }, name: { type: "string" }, role: { enum: ["client", "freelancer"] } } },
        Balances: { type: "object", properties: { available: { type: "integer" }, held: { type: "integer" } } },
        UserWithWallet: { allOf: [ref("User"), { type: "object", properties: { wallet: ref("Balances") } }] },
        Wallet: { type: "object", properties: { available: { type: "integer" }, held: { type: "integer" }, entries: { type: "array", items: { type: "object", properties: { tx_id: { type: "string" }, balance: { enum: ["available", "held"] }, amount: { type: "integer" }, memo: { type: "string" }, contract_id: { type: ["string", "null"] }, created_at: { type: "string", format: "date-time" } } } } } },
        AmountBody: { type: "object", required: ["amount"], properties: { amount: { type: "integer", minimum: 1 } } },
        Milestone: { type: "object", required: ["title", "due_date", "amount"], properties: { title: { type: "string" }, due_date: { type: "string", format: "date" }, amount: { type: "integer" } } },
        CreateContractBody: { type: "object", required: ["freelancer", "title", "description", "amount", "review_period_days", "revision_limit", "milestones"], properties: { freelancer: { type: "string", description: "external_id of the freelancer" }, title: { type: "string" }, description: { type: "string" }, amount: { type: "integer", description: "Must equal the sum of the milestones" }, review_period_days: { type: "integer", minimum: 1, maximum: 14 }, revision_limit: { type: "integer", minimum: 0, maximum: 5 }, milestones: { type: "array", minItems: 1, maxItems: 10, items: ref("Milestone") } } },
        CounterBody: { type: "object", required: ["amount", "review_period_days", "revision_limit", "milestones", "note"], properties: { amount: { type: "integer" }, review_period_days: { type: "integer" }, revision_limit: { type: "integer" }, milestones: { type: "array", items: ref("Milestone") }, note: { type: "string" } } },
        ReasonBody: { type: "object", required: ["reason"], properties: { reason: { type: "string" } } },
        OptionalReasonBody: { type: "object", properties: { reason: { type: "string" } } },
        EvidenceBody: { type: "object", properties: { text: { type: "string", maxLength: 1000 }, files: { type: "array", maxItems: 5, items: { type: "object", required: ["file_name", "size_bytes", "sha256"], properties: { file_name: { type: "string" }, size_bytes: { type: "integer" }, sha256: { type: "string" } } } } }, description: "Text, files or both. Only while a dispute is open; each side may attach 5 files in total." },
        WebhookEndpointBody: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", description: "https only, public address" }, events: { type: "array", items: { type: "string" }, description: "Event names, or * for all (default). Examples: contract.funded, contract.delivered, contract.completed, contract.disputed, dispute.evidence_submitted." } } },
        WebhookEndpoint: { type: "object", properties: { id: { type: "string" }, url: { type: "string" }, events: { type: "array", items: { type: "string" } }, enabled: { type: "boolean" }, created_at: { type: "string" }, deliveries: { type: "array", items: ref("WebhookDelivery") } } },
        WebhookEndpointWithSecret: { allOf: [ref("WebhookEndpoint"), { type: "object", properties: { secret: { type: "string", description: "Shown once. Used to verify the TrustLock-Signature header." } } }] },
        WebhookDelivery: { type: "object", properties: { event_id: { type: "string" }, type: { type: "string" }, status: { enum: ["pending", "delivered", "failed"] }, attempts: { type: "integer" }, last_status: { type: ["integer", "null"] }, last_error: { type: ["string", "null"] }, next_attempt_at: { type: ["string", "null"] }, created_at: { type: "string" }, delivered_at: { type: ["string", "null"] } } },
        MessageBody: { type: "object", required: ["text"], properties: { text: { type: "string", maxLength: 1000 } } },
        DeliverBody: { type: "object", required: ["file_name", "size_bytes", "sha256"], properties: { file_name: { type: "string" }, size_bytes: { type: "integer" }, sha256: { type: "string", description: "Hex SHA-256 of the file" }, note: { type: "string" } } },
        Contract: { type: "object", properties: { id: { type: "string", format: "uuid" }, ref: { type: "string" }, title: { type: "string" }, state: { type: "string" }, client: { type: "string" }, freelancer: { type: "string" }, amount: { type: "integer" }, fee_bps: { type: "integer" }, milestones: { type: "array", items: ref("Milestone") }, created_at: { type: "string", format: "date-time" }, updated_at: { type: "string", format: "date-time" } }, additionalProperties: true },
        ContractDetail: { allOf: [ref("Contract"), { type: "object", properties: { your_role: { enum: ["client", "freelancer"] }, allowed_actions: { type: "array", items: { type: "string" } }, awaiting: { enum: ["client", "freelancer"] }, timeline: { type: "array", items: { type: "object" } }, messages: { type: "array", items: { type: "object" } } } }] },
      },
    },
  };
}
