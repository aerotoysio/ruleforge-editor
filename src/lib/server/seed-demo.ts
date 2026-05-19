/**
 * Seed a workspace with a curated demo set — two input schemas (offer + order),
 * a handful of output templates (tax lines, seat / bag / lounge / insurance
 * products), and rules that wire them together end-to-end.
 *
 * Goal: a new workspace becomes "press Test and see something happen" in a
 * single click. Every seeded rule references its input via `inputSchemaRef`
 * so a single shared schema feeds multiple rules — exactly the workflow the
 * SchemaTemplate feature exists to enable.
 *
 *   Schemas:   schema-offer, schema-order
 *   Templates: tmpl-tax-line, tmpl-seat-product, tmpl-bag-product,
 *              tmpl-lounge-product, tmpl-insurance-product
 *   Rules:     demo-tax-au-gst, demo-tax-uk-vat, demo-tax-us-state,
 *              demo-produce-seats, demo-produce-lounge, demo-produce-insurance
 *
 * Writes files directly via the filesystem; doesn't go through writeRule()
 * because that path compiles to engine and we want the seed to work even
 * when engine-compile fails. The next save / test invocation will re-compile.
 *
 * Idempotent — re-running the seed overwrites the demo files but leaves any
 * non-demo files alone.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  JsonSchema,
  OutputTemplate,
  PortBinding,
  RuleOnDisk,
  RuleTest,
  SchemaTemplate,
  NodeBindings,
} from "@/lib/types";

const NOW = "2026-05-12T00:00:00.000Z";

// ── Schemas ────────────────────────────────────────────────────────────

const OFFER_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  description: "An airline offer — the data shape passed to rules that price ancillaries, compute tax, or attach products.",
  properties: {
    offerId: { type: "string", description: "Stable id for the offer (idempotency / dedupe)." },
    market: { type: "string", description: "ISO 3166-1 alpha-2 country code of the point of sale.", examples: ["AU", "GB", "US"] },
    currency: { type: "string", description: "ISO 4217 currency code of all monetary fields below.", examples: ["AUD", "GBP", "USD"] },
    totalAmount: { type: "number", description: "Total price of the offer before ancillaries/tax." },
    itinerary: {
      type: "object",
      properties: {
        origin: { type: "string", description: "IATA airport code", examples: ["SYD"] },
        destination: { type: "string", description: "IATA airport code", examples: ["LHR"] },
        cabin: { type: "string", description: "Cabin class", enum: ["Y", "W", "C", "F"] },
        departureDate: { type: "string", format: "date" },
        returnDate: { type: "string", format: "date" },
      },
      required: ["origin", "destination", "cabin", "departureDate"],
    },
    passengers: {
      type: "array",
      description: "List of passengers on this offer.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["ADT", "CHD", "INF"] },
          loyaltyTier: { type: "string", enum: ["NONE", "SILVER", "GOLD", "PLATINUM"] },
          fareBasis: { type: "string", description: "Fare basis code; defines included baggage + change rules." },
        },
        required: ["id", "type"],
      },
    },
  },
  required: ["offerId", "market", "currency", "itinerary", "passengers"],
};

const ORDER_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  description: "A booking order at the point of payment — payload for passenger and identity validations.",
  properties: {
    orderId: { type: "string" },
    departureDate: { type: "string", format: "date" },
    payment: {
      type: "object",
      properties: {
        currency: { type: "string" },
        amount: { type: "number" },
        method: { type: "string", enum: ["card", "voucher", "miles"] },
      },
      required: ["currency", "amount"],
    },
    passengers: {
      type: "array",
      description: "Passengers attached to this order, with personal + document details.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          dob: { type: "string", format: "date", description: "Date of birth." },
          passportNumber: { type: "string" },
          passportExpiry: { type: "string", format: "date" },
          loyaltyTier: { type: "string", enum: ["NONE", "SILVER", "GOLD", "PLATINUM"] },
        },
        required: ["id", "firstName", "lastName", "dob"],
      },
    },
  },
  required: ["orderId", "passengers", "payment"],
};

const SCHEMAS: SchemaTemplate[] = [
  {
    id: "schema-offer",
    name: "Offer",
    description: "Airline offer — point-of-sale market, itinerary, passengers. Feeds tax + product rules.",
    category: "offer",
    intent: "input",
    schema: OFFER_SCHEMA,
    updatedAt: NOW,
  },
  {
    id: "schema-order",
    name: "Order",
    description: "Booking order at payment time — passengers with documents, payment. Feeds validations.",
    category: "order",
    intent: "input",
    schema: ORDER_SCHEMA,
    updatedAt: NOW,
  },
];

// ── Output templates ───────────────────────────────────────────────────

const TEMPLATES: OutputTemplate[] = [
  {
    id: "tmpl-tax-line",
    name: "Tax line",
    description: "A single tax computation result — code, rate, amount.",
    category: "tax",
    fields: [
      { name: "code", type: "string", required: true, description: "Tax code identifier — e.g. GST, VAT, US-STATE." },
      { name: "name", type: "string", required: true, description: "Human-readable tax name." },
      { name: "rate", type: "number", required: true, description: "Tax rate as a decimal — 0.10 = 10%." },
      { name: "amount", type: "number", required: true, description: "Calculated tax amount." },
      { name: "currency", type: "string", required: true, description: "ISO currency code." },
      { name: "appliesTo", type: "string", description: "What the tax is applied to — fare / total / ancillaries." },
    ],
    updatedAt: NOW,
  },
  {
    id: "tmpl-seat-product",
    name: "Seat product",
    description: "Seat assignment / upgrade ancillary.",
    category: "product",
    fields: [
      { name: "type", type: "string", required: true, default: "SEAT", description: "Product type tag." },
      { name: "code", type: "string", required: true, description: "Seat product SKU." },
      { name: "name", type: "string", required: true, description: "Display name — e.g. 'Extra legroom seat'." },
      { name: "cabin", type: "string", required: true, description: "Cabin class the seat belongs to." },
      { name: "price", type: "number", required: true },
      { name: "currency", type: "string", required: true },
    ],
    updatedAt: NOW,
  },
  {
    id: "tmpl-bag-product",
    name: "Bag product",
    description: "Checked-baggage allowance ancillary.",
    category: "product",
    fields: [
      { name: "type", type: "string", required: true, default: "BAG", description: "Product type tag." },
      { name: "code", type: "string", required: true },
      { name: "name", type: "string", required: true, description: "e.g. 'Extra checked bag, 23kg'." },
      { name: "weightKg", type: "number", required: true },
      { name: "price", type: "number", required: true },
      { name: "currency", type: "string", required: true },
    ],
    updatedAt: NOW,
  },
  {
    id: "tmpl-lounge-product",
    name: "Lounge product",
    description: "Airport lounge access ancillary.",
    category: "product",
    fields: [
      { name: "type", type: "string", required: true, default: "LOUNGE", description: "Product type tag." },
      { name: "code", type: "string", required: true },
      { name: "name", type: "string", required: true, description: "e.g. 'Premium lounge — complimentary'." },
      { name: "price", type: "number", required: true, description: "Net price; 0 = complimentary." },
      { name: "currency", type: "string", required: true },
    ],
    updatedAt: NOW,
  },
  {
    id: "tmpl-insurance-product",
    name: "Travel insurance product",
    description: "Travel insurance upsell with coverage.",
    category: "product",
    fields: [
      { name: "type", type: "string", required: true, default: "INSURANCE", description: "Product type tag." },
      { name: "code", type: "string", required: true },
      { name: "name", type: "string", required: true },
      { name: "coverageAmount", type: "number", required: true, description: "Maximum payout in the offer currency." },
      { name: "price", type: "number", required: true },
      { name: "currency", type: "string", required: true },
    ],
    updatedAt: NOW,
  },
];

// ── Rule helpers ───────────────────────────────────────────────────────

type SeedRule = {
  rule: RuleOnDisk;
  bindings: NodeBindings[];
  tests: RuleTest[];
};

const POS = {
  input:  { x: 80,   y: 240 },
  filter: { x: 320,  y: 240 },
  constPass: { x: 600, y: 140 },
  constFail: { x: 600, y: 340 },
  output: { x: 880,  y: 240 },
};

/**
 * Build a 5-node "filter → 2 constants → output" rule skeleton.
 *
 * NB: we deliberately do NOT include a merge node here. The engine's
 * `node-merge` is the *closer* of an iterator — when no iterator is upstream,
 * `MergeClosesIterator[node.Id]` is null and the merge always emits `[]`,
 * silently wiping the constants' output. For flat (non-iterator) filter
 * rules, connect both constants directly to the output node; the engine's
 * `AssembleResult` picks up whichever branch fired (only one of n3/n4 has
 * a recorded output for a given run).
 *
 * Iterator-bound rules (per-pax outputs, etc.) DO use merge — that's a
 * separate skeleton not built here.
 */
function ruleSkeleton(
  id: string,
  name: string,
  endpoint: string,
  description: string,
  inputSchemaRef: string,
): RuleOnDisk {
  return {
    id,
    name,
    description,
    endpoint,
    method: "POST",
    status: "draft",
    currentVersion: 1,
    tags: ["demo", "seed"],
    category: "Demo",
    inputSchemaRef,
    instances: [
      { instanceId: "n1", nodeId: "node-input",            position: POS.input,    label: "Offer" },
      { instanceId: "n2", nodeId: "node-filter-string-in", position: POS.filter,   label: "Match?" },
      { instanceId: "n3", nodeId: "node-constant",         position: POS.constPass, label: "Apply" },
      { instanceId: "n4", nodeId: "node-constant",         position: POS.constFail, label: "Skip" },
      { instanceId: "n6", nodeId: "node-output",           position: POS.output,   label: "Result" },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", branch: "default" },
      { id: "e2", source: "n2", target: "n3", branch: "pass" },
      { id: "e3", source: "n2", target: "n4", branch: "fail" },
      // n3 and n4 wire DIRECTLY to the output — no merge in between.
      // Only one of them runs per evaluation (the branch the filter took),
      // so AssembleResult picks up exactly that one constant's value.
      { id: "e4", source: "n3", target: "n6", branch: "default" },
      { id: "e5", source: "n4", target: "n6", branch: "default" },
    ],
    updatedAt: NOW,
    updatedBy: "demo-seed",
  };
}

/**
 * Build a "match a single market and emit a tax line" rule. Three rules use
 * this shape (AU, UK, US), differing only in the matched market + tax detail.
 */
function makeTaxRule(opts: {
  id: string;
  name: string;
  endpoint: string;
  description: string;
  market: string;
  taxCode: string;
  taxName: string;
  taxRate: number;
}): SeedRule {
  const rule = ruleSkeleton(opts.id, opts.name, opts.endpoint, opts.description, "schema-offer");
  const bindings: NodeBindings[] = [
    // n2 — filter on market
    {
      instanceId: "n2",
      ruleId: opts.id,
      bindings: {
        source:   { kind: "path", path: "$.market" },
        operator: { kind: "literal", value: "equals" },
        literal:  { kind: "literal", value: [opts.market] },
        onMissing: { kind: "literal", value: "fail" },
      },
    },
    // n3 — emit tax line via template-fill (pass branch)
    {
      instanceId: "n3",
      ruleId: opts.id,
      bindings: {
        value: {
          kind: "template-fill",
          templateId: "tmpl-tax-line",
          fields: {
            code:      { kind: "literal", value: opts.taxCode },
            name:      { kind: "literal", value: opts.taxName },
            rate:      { kind: "literal", value: opts.taxRate },
            // The engine has to multiply — for now we emit the rate; a calc
            // node would compute the amount. This is a seed, not a complete
            // tax engine.
            amount:    { kind: "literal", value: 0 },
            currency:  { kind: "path",    path: "$.currency" },
            appliesTo: { kind: "literal", value: "fare" },
          },
        },
      },
    },
    // n4 — no-op constant (fail branch)
    {
      instanceId: "n4",
      ruleId: opts.id,
      bindings: {
        value: { kind: "literal", value: { skipped: true } },
      },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "match",
      name: `${opts.market} offer`,
      description: `Offer in market ${opts.market} — should emit ${opts.taxCode}.`,
      payload: {
        offerId: "demo-1",
        market: opts.market,
        currency: opts.market === "AU" ? "AUD" : opts.market === "GB" ? "GBP" : "USD",
        totalAmount: 500,
        itinerary: {
          origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01",
        },
        passengers: [{ id: "p1", type: "ADT", loyaltyTier: "NONE", fareBasis: "YBASE" }],
      },
      updatedAt: NOW,
    },
    {
      id: "non-match",
      name: "Offer in other market",
      description: `Offer NOT in ${opts.market} — should skip.`,
      payload: {
        offerId: "demo-2",
        market: opts.market === "AU" ? "NZ" : "AU",
        currency: "USD",
        totalAmount: 500,
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT", loyaltyTier: "NONE" }],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

/**
 * Build a "cabin == X → emit a seat product" rule.
 */
function makeSeatRule(opts: {
  id: string;
  name: string;
  endpoint: string;
  cabin: "Y" | "W" | "C" | "F";
  productCode: string;
  productName: string;
  price: number;
}): SeedRule {
  const rule = ruleSkeleton(
    opts.id,
    opts.name,
    opts.endpoint,
    `Emit a ${opts.productName} when offer.itinerary.cabin == "${opts.cabin}".`,
    "schema-offer",
  );
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2",
      ruleId: opts.id,
      bindings: {
        source:   { kind: "path", path: "$.itinerary.cabin" },
        operator: { kind: "literal", value: "equals" },
        literal:  { kind: "literal", value: [opts.cabin] },
        onMissing: { kind: "literal", value: "fail" },
      },
    },
    {
      instanceId: "n3",
      ruleId: opts.id,
      bindings: {
        value: {
          kind: "template-fill",
          templateId: "tmpl-seat-product",
          fields: {
            type:     { kind: "literal", value: "SEAT" },
            code:     { kind: "literal", value: opts.productCode },
            name:     { kind: "literal", value: opts.productName },
            cabin:    { kind: "literal", value: opts.cabin },
            price:    { kind: "literal", value: opts.price },
            currency: { kind: "path",    path: "$.currency" },
          },
        },
      },
    },
    {
      instanceId: "n4",
      ruleId: opts.id,
      bindings: { value: { kind: "literal", value: { skipped: true } } },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "match",
      name: `${opts.cabin} cabin offer`,
      payload: {
        offerId: "demo-1",
        market: "AU",
        currency: "AUD",
        totalAmount: 500,
        itinerary: { origin: "SYD", destination: "LHR", cabin: opts.cabin, departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT", loyaltyTier: "NONE" }],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

/**
 * Build a "loyalty tier in {GOLD, PLATINUM} → emit lounge product" rule.
 * Uses node-filter-loyalty-tier if available; otherwise falls back to
 * node-filter-string-in against $.passengers[*].loyaltyTier with `any` selector.
 */
function makeLoungeRule(): SeedRule {
  const id = "demo-produce-lounge";
  const rule = ruleSkeleton(
    id,
    "Produce lounge access for GOLD / PLATINUM",
    "/v1/demo/products/lounge",
    "Emit a complimentary lounge product when at least one passenger is GOLD or PLATINUM.",
    "schema-offer",
  );
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2",
      ruleId: id,
      bindings: {
        source:        { kind: "path",    path: "$.passengers[*].loyaltyTier" },
        operator:      { kind: "literal", value: "in" },
        literal:       { kind: "literal", value: ["GOLD", "PLATINUM"] },
        arraySelector: { kind: "literal", value: "any" },
        onMissing:     { kind: "literal", value: "fail" },
      },
    },
    {
      instanceId: "n3",
      ruleId: id,
      bindings: {
        value: {
          kind: "template-fill",
          templateId: "tmpl-lounge-product",
          fields: {
            type:     { kind: "literal", value: "LOUNGE" },
            code:     { kind: "literal", value: "LOUNGE-COMP" },
            name:     { kind: "literal", value: "Complimentary lounge access" },
            price:    { kind: "literal", value: 0 },
            currency: { kind: "path",    path: "$.currency" },
          },
        },
      },
    },
    {
      instanceId: "n4",
      ruleId: id,
      bindings: { value: { kind: "literal", value: { skipped: true } } },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "match",
      name: "Offer with a GOLD pax",
      payload: {
        offerId: "demo-1",
        market: "AU",
        currency: "AUD",
        totalAmount: 500,
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [
          { id: "p1", type: "ADT", loyaltyTier: "GOLD" },
          { id: "p2", type: "ADT", loyaltyTier: "NONE" },
        ],
      },
      updatedAt: NOW,
    },
    {
      id: "non-match",
      name: "Offer with all NONE tier",
      payload: {
        offerId: "demo-2",
        market: "AU",
        currency: "AUD",
        totalAmount: 500,
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [
          { id: "p1", type: "ADT", loyaltyTier: "NONE" },
        ],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

/**
 * Build a "market != AU → emit insurance product" rule. Insurance products
 * aren't sold in AU offers (regulatory placeholder example).
 */
function makeInsuranceRule(): SeedRule {
  const id = "demo-produce-insurance";
  const rule = ruleSkeleton(
    id,
    "Produce travel insurance (non-AU markets)",
    "/v1/demo/products/insurance",
    "Emit a travel insurance product when offer.market is not AU.",
    "schema-offer",
  );
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2",
      ruleId: id,
      bindings: {
        source:   { kind: "path", path: "$.market" },
        operator: { kind: "literal", value: "not_in" },
        literal:  { kind: "literal", value: ["AU"] },
        onMissing: { kind: "literal", value: "fail" },
      },
    },
    {
      instanceId: "n3",
      ruleId: id,
      bindings: {
        value: {
          kind: "template-fill",
          templateId: "tmpl-insurance-product",
          fields: {
            type:           { kind: "literal", value: "INSURANCE" },
            code:           { kind: "literal", value: "TI-STD" },
            name:           { kind: "literal", value: "Standard travel insurance" },
            coverageAmount: { kind: "literal", value: 50000 },
            price:          { kind: "literal", value: 35 },
            currency:       { kind: "path",    path: "$.currency" },
          },
        },
      },
    },
    {
      instanceId: "n4",
      ruleId: id,
      bindings: { value: { kind: "literal", value: { skipped: true } } },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "match",
      name: "UK offer",
      payload: {
        offerId: "demo-1",
        market: "GB",
        currency: "GBP",
        totalAmount: 500,
        itinerary: { origin: "LHR", destination: "JFK", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT", loyaltyTier: "NONE" }],
      },
      updatedAt: NOW,
    },
    {
      id: "non-match",
      name: "AU offer (no insurance)",
      payload: {
        offerId: "demo-2",
        market: "AU",
        currency: "AUD",
        totalAmount: 500,
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT", loyaltyTier: "NONE" }],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

/**
 * Build a "every passenger has a date of birth" validator. Uses
 * `arraySelector: all` on $.passengers[*].dob so the rule passes only when
 * EVERY passenger has a populated dob.
 */
function makePaxDobValidator(): SeedRule {
  const id = "demo-validate-pax-dob";
  const rule = ruleSkeleton(
    id,
    "Validate — all passengers have DOB",
    "/v1/demo/validate/pax-dob",
    "Pass when every passenger on the order has a populated dob field; fail otherwise. Demonstrates array-selector 'all' against a passenger property.",
    "schema-order",
  );
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2",
      ruleId: id,
      bindings: {
        // 'is_null' filter inverted: we want pass if NO passenger has missing dob.
        // node-filter-string-in's "is_null" operator passes WHEN the value is null;
        // wrap with arraySelector 'none' so we pass when zero passengers have null.
        source:        { kind: "path", path: "$.passengers[*].dob" },
        operator:      { kind: "literal", value: "is_null" },
        arraySelector: { kind: "literal", value: "none" },
        onMissing:     { kind: "literal", value: "fail" },
      },
    },
    {
      instanceId: "n3",
      ruleId: id,
      bindings: {
        value: { kind: "literal", value: { ok: true, message: "All passengers have DOB" } },
      },
    },
    {
      instanceId: "n4",
      ruleId: id,
      bindings: {
        value: { kind: "literal", value: { ok: false, message: "At least one passenger missing DOB" } },
      },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "all-have-dob",
      name: "All passengers have DOB",
      payload: {
        orderId: "demo-1",
        departureDate: "2026-08-01",
        payment: { currency: "AUD", amount: 500, method: "card" },
        passengers: [
          { id: "p1", firstName: "Jane", lastName: "Doe", dob: "1990-01-15" },
          { id: "p2", firstName: "John", lastName: "Doe", dob: "1992-07-20" },
        ],
      },
      updatedAt: NOW,
    },
    {
      id: "missing-dob",
      name: "One passenger missing DOB",
      payload: {
        orderId: "demo-2",
        departureDate: "2026-08-01",
        payment: { currency: "AUD", amount: 500, method: "card" },
        passengers: [
          { id: "p1", firstName: "Jane", lastName: "Doe", dob: "1990-01-15" },
          { id: "p2", firstName: "John", lastName: "Doe" }, // missing dob
        ],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

/**
 * Validate the order's payment method is one of the allowed values.
 */
function makePaymentMethodValidator(): SeedRule {
  const id = "demo-validate-payment-method";
  const rule = ruleSkeleton(
    id,
    "Validate — payment method allowed",
    "/v1/demo/validate/payment-method",
    "Pass when order.payment.method is one of card / voucher / miles; fail otherwise.",
    "schema-order",
  );
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2",
      ruleId: id,
      bindings: {
        source:    { kind: "path", path: "$.payment.method" },
        operator:  { kind: "literal", value: "in" },
        literal:   { kind: "literal", value: ["card", "voucher", "miles"] },
        onMissing: { kind: "literal", value: "fail" },
      },
    },
    {
      instanceId: "n3",
      ruleId: id,
      bindings: {
        value: { kind: "literal", value: { ok: true, message: "Payment method accepted" } },
      },
    },
    {
      instanceId: "n4",
      ruleId: id,
      bindings: {
        value: { kind: "literal", value: { ok: false, message: "Payment method not supported" } },
      },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "card",
      name: "Card payment (accepted)",
      payload: {
        orderId: "demo-1",
        departureDate: "2026-08-01",
        payment: { currency: "AUD", amount: 500, method: "card" },
        passengers: [{ id: "p1", firstName: "Jane", lastName: "Doe", dob: "1990-01-15" }],
      },
      updatedAt: NOW,
    },
    {
      id: "crypto",
      name: "Crypto payment (rejected)",
      payload: {
        orderId: "demo-2",
        departureDate: "2026-08-01",
        payment: { currency: "AUD", amount: 500, method: "crypto" },
        passengers: [{ id: "p1", firstName: "Jane", lastName: "Doe", dob: "1990-01-15" }],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

// ── Filter-variant rules (use the typed filter NodeDefs instead of node-filter-string-in) ──

/**
 * Generic "filter against a string field, emit a product if it matches" rule.
 * Uses one of the variant filter NodeDefs (cabin / loyalty-tier / pax-type) which
 * compile down to StringFilterConfig but ship with the right enum picker UX.
 */
function makeVariantFilterProductRule(opts: {
  id: string;
  name: string;
  endpoint: string;
  description: string;
  filterNodeId: string;
  sourcePath: string;
  matchValues: string[];
  arraySelector?: "any" | "all" | "none" | "first" | "only";
  templateId: string;
  productCode: string;
  productName: string;
  price: number;
  extraTemplateFields?: Record<string, PortBinding>;
  matchTestPayload: Record<string, unknown>;
  nonMatchTestPayload: Record<string, unknown>;
}): SeedRule {
  const rule = ruleSkeleton(opts.id, opts.name, opts.endpoint, opts.description, "schema-offer");
  // Swap the default filter node-id (`node-filter-string-in`) for the variant.
  rule.instances = rule.instances.map((i) =>
    i.instanceId === "n2" ? { ...i, nodeId: opts.filterNodeId } : i,
  );
  const filterBindings: Record<string, PortBinding> = {
    source: { kind: "path", path: opts.sourcePath },
    literal: { kind: "literal", value: opts.matchValues },
  };
  if (opts.arraySelector) {
    filterBindings.arraySelector = { kind: "literal", value: opts.arraySelector };
  }
  filterBindings.onMissing = { kind: "literal", value: "fail" };

  const templateFields: Record<string, PortBinding> = {
    type:     { kind: "literal", value: opts.templateId.replace(/^tmpl-/, "").split("-")[0].toUpperCase() },
    code:     { kind: "literal", value: opts.productCode },
    name:     { kind: "literal", value: opts.productName },
    price:    { kind: "literal", value: opts.price },
    currency: { kind: "path",    path: "$.currency" },
    ...opts.extraTemplateFields,
  };

  const bindings: NodeBindings[] = [
    { instanceId: "n2", ruleId: opts.id, bindings: filterBindings },
    {
      instanceId: "n3", ruleId: opts.id,
      bindings: {
        value: { kind: "template-fill", templateId: opts.templateId, fields: templateFields },
      },
    },
    {
      instanceId: "n4", ruleId: opts.id,
      bindings: { value: { kind: "literal", value: { skipped: true } } },
    },
  ];
  const tests: RuleTest[] = [
    { id: "match",     name: "Matching offer",     payload: opts.matchTestPayload,    updatedAt: NOW },
    { id: "non-match", name: "Non-matching offer", payload: opts.nonMatchTestPayload, updatedAt: NOW },
  ];
  return { rule, bindings, tests };
}

// ── Number-filter rules (compare / range) ──

/**
 * Bulk-spend bonus: $.totalAmount > 1000 → emit a bonus product. Demonstrates
 * node-filter-number-compare with operator "gt".
 */
function makeBulkSpendBonusRule(): SeedRule {
  const id = "demo-bulk-spend-bonus";
  const rule = ruleSkeleton(
    id,
    "Bulk-spend bonus (totalAmount > 1000)",
    "/v1/demo/products/bulk-spend-bonus",
    "Emit a bonus seat-product when offer.totalAmount exceeds 1000. Demonstrates node-filter-number-compare with operator 'gt'.",
    "schema-offer",
  );
  rule.instances = rule.instances.map((i) =>
    i.instanceId === "n2" ? { ...i, nodeId: "node-filter-number-compare", label: "totalAmount > 1000" } : i,
  );
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2", ruleId: id,
      bindings: {
        source:    { kind: "path",    path: "$.totalAmount" },
        operator:  { kind: "literal", value: "gt" },
        value:     { kind: "literal", value: 1000 },
        onMissing: { kind: "literal", value: "fail" },
      },
    },
    {
      instanceId: "n3", ruleId: id,
      bindings: {
        value: {
          kind: "template-fill",
          templateId: "tmpl-seat-product",
          fields: {
            type:     { kind: "literal", value: "BONUS" },
            code:     { kind: "literal", value: "BONUS-BULK" },
            name:     { kind: "literal", value: "Bulk-spend bonus seat" },
            cabin:    { kind: "path",    path: "$.itinerary.cabin" },
            price:    { kind: "literal", value: 0 },
            currency: { kind: "path",    path: "$.currency" },
          },
        },
      },
    },
    {
      instanceId: "n4", ruleId: id,
      bindings: { value: { kind: "literal", value: { skipped: true } } },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "match",
      name: "High-value offer (totalAmount > 1000)",
      payload: {
        offerId: "demo-1", market: "AU", currency: "AUD", totalAmount: 1500,
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
    {
      id: "non-match",
      name: "Low-value offer",
      payload: {
        offerId: "demo-2", market: "AU", currency: "AUD", totalAmount: 500,
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

// ── Date / day-of-week filter rules ──

/**
 * Weekend surcharge: fire when itinerary.departureDate falls on a Saturday
 * or Sunday. Demonstrates node-filter-day-of-week. Days are 0=Sunday..6=Saturday
 * per ISO convention; the engine accepts either 0..6 or 1..7 depending on
 * the runtime — the editor's NodeDef declares `days: number-array` so we
 * encode as [0, 6] for Sun + Sat.
 */
function makeWeekendSurchargeRule(): SeedRule {
  const id = "demo-weekend-surcharge";
  const rule = ruleSkeleton(
    id,
    "Weekend departure surcharge",
    "/v1/demo/products/weekend-surcharge",
    "Emit a $25 surcharge when itinerary.departureDate is a Saturday or Sunday. Demonstrates node-filter-day-of-week.",
    "schema-offer",
  );
  rule.instances = rule.instances.map((i) =>
    i.instanceId === "n2" ? { ...i, nodeId: "node-filter-day-of-week", label: "Sat or Sun?" } : i,
  );
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2", ruleId: id,
      bindings: {
        source:    { kind: "path",    path: "$.itinerary.departureDate" },
        days:      { kind: "literal", value: [0, 6] }, // Sun + Sat
        onMissing: { kind: "literal", value: "fail" },
      },
    },
    {
      instanceId: "n3", ruleId: id,
      bindings: {
        value: {
          kind: "template-fill",
          templateId: "tmpl-seat-product",
          fields: {
            type:     { kind: "literal", value: "SURCHARGE" },
            code:     { kind: "literal", value: "SURCHARGE-WEEKEND" },
            name:     { kind: "literal", value: "Weekend departure surcharge" },
            cabin:    { kind: "path",    path: "$.itinerary.cabin" },
            price:    { kind: "literal", value: 25 },
            currency: { kind: "path",    path: "$.currency" },
          },
        },
      },
    },
    {
      instanceId: "n4", ruleId: id,
      bindings: { value: { kind: "literal", value: { skipped: true } } },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "weekend",
      name: "Saturday departure",
      payload: {
        offerId: "demo-1", market: "AU", currency: "AUD", totalAmount: 500,
        // 2026-08-01 = Saturday
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
    {
      id: "weekday",
      name: "Tuesday departure",
      payload: {
        offerId: "demo-2", market: "AU", currency: "AUD", totalAmount: 500,
        // 2026-08-04 = Tuesday
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-04" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

/**
 * Advance-purchase eligibility: fire when departure date is BETWEEN today
 * and a future bound — demonstrates node-filter-date with operator "after"
 * compared against a fixed reference date.
 */
function makeAdvancePurchaseRule(): SeedRule {
  const id = "demo-advance-purchase-eligible";
  const rule = ruleSkeleton(
    id,
    "Advance-purchase eligibility (depart after 2026-07-01)",
    "/v1/demo/products/advance-purchase",
    "Emit an early-bird discount when departureDate is after a fixed reference date. Demonstrates node-filter-date with operator 'after'.",
    "schema-offer",
  );
  rule.instances = rule.instances.map((i) =>
    i.instanceId === "n2" ? { ...i, nodeId: "node-filter-date", label: "Depart after 2026-07-01?" } : i,
  );
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2", ruleId: id,
      bindings: {
        source:      { kind: "path",    path: "$.itinerary.departureDate" },
        operator:    { kind: "literal", value: "after" },
        match:       { kind: "date",    mode: "absolute", date: "2026-07-01" },
        granularity: { kind: "literal", value: "date" },
        onMissing:   { kind: "literal", value: "fail" },
      },
    },
    {
      instanceId: "n3", ruleId: id,
      bindings: {
        value: {
          kind: "template-fill",
          templateId: "tmpl-seat-product",
          fields: {
            type:     { kind: "literal", value: "DISCOUNT" },
            code:     { kind: "literal", value: "DISC-EARLY" },
            name:     { kind: "literal", value: "Early-bird discount" },
            cabin:    { kind: "path",    path: "$.itinerary.cabin" },
            price:    { kind: "literal", value: -50 },
            currency: { kind: "path",    path: "$.currency" },
          },
        },
      },
    },
    {
      instanceId: "n4", ruleId: id,
      bindings: { value: { kind: "literal", value: { skipped: true } } },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "eligible",
      name: "Departing 2026-08-01",
      payload: {
        offerId: "demo-1", market: "AU", currency: "AUD", totalAmount: 500,
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
    {
      id: "not-eligible",
      name: "Departing 2026-06-15 (too soon)",
      payload: {
        offerId: "demo-2", market: "AU", currency: "AUD", totalAmount: 500,
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-06-15" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

// ── Calc + assert + switch rules ──

/**
 * Real tax math: filter on market, then USE node-calc to compute the actual
 * tax amount = totalAmount * 0.10. The calc result writes to $ctx.taxAmount,
 * which the constant node then reads when filling the tax-line template.
 *
 * This is the difference between "emit a 10% tax with amount=0 placeholder"
 * (what makeTaxRule does) and "emit a 10% tax with the real money attached".
 */
function makeTaxAmountCalcRule(): SeedRule {
  const id = "demo-tax-amount-au-gst";
  const rule: RuleOnDisk = {
    id,
    name: "Tax — Australia GST (with calc'd amount)",
    description: "Same as demo-tax-au-gst but uses node-calc to compute amount = totalAmount * 0.10 and emits the real tax amount on the tax line. Demonstrates calc → constant chaining.",
    endpoint: "/v1/demo/tax/au-gst-calc",
    method: "POST",
    status: "draft",
    currentVersion: 1,
    tags: ["demo", "seed", "calc"],
    category: "Demo",
    inputSchemaRef: "schema-offer",
    instances: [
      { instanceId: "n1", nodeId: "node-input",            position: { x: 80,   y: 240 }, label: "Offer" },
      { instanceId: "n2", nodeId: "node-filter-string-in", position: { x: 280,  y: 240 }, label: "market == AU?" },
      { instanceId: "n3", nodeId: "node-calc",             position: { x: 520,  y: 140 }, label: "Compute tax amount" },
      { instanceId: "n4", nodeId: "node-constant",         position: { x: 760,  y: 140 }, label: "Emit tax line" },
      { instanceId: "n5", nodeId: "node-constant",         position: { x: 520,  y: 360 }, label: "Skip (non-AU)" },
      { instanceId: "n7", nodeId: "node-output",           position: { x: 1000, y: 240 }, label: "Result" },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", branch: "default" },
      { id: "e2", source: "n2", target: "n3", branch: "pass" },
      { id: "e3", source: "n3", target: "n4", branch: "default" },
      { id: "e4", source: "n2", target: "n5", branch: "fail" },
      // Both branches' constants connect DIRECTLY to the output (no merge —
      // see ruleSkeleton comment for why).
      { id: "e5", source: "n4", target: "n7", branch: "default" },
      { id: "e6", source: "n5", target: "n7", branch: "default" },
    ],
    updatedAt: NOW,
    updatedBy: "demo-seed",
  };
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2", ruleId: id,
      bindings: {
        source:    { kind: "path",    path: "$.market" },
        operator:  { kind: "literal", value: "equals" },
        literal:   { kind: "literal", value: ["AU"] },
        onMissing: { kind: "literal", value: "fail" },
      },
    },
    {
      instanceId: "n3", ruleId: id,
      bindings: {
        target:     { kind: "literal", value: "taxAmount" },
        // Engine's CalcEvaluator resolves bare names from upstream → ctx →
        // request top-level. So `totalAmount` lands on $.totalAmount on the
        // offer request — no JSONPath syntax needed.
        expression: { kind: "literal", value: "totalAmount * 0.10" },
      },
    },
    {
      instanceId: "n4", ruleId: id,
      bindings: {
        value: {
          kind: "template-fill",
          templateId: "tmpl-tax-line",
          fields: {
            code:      { kind: "literal", value: "GST" },
            name:      { kind: "literal", value: "Australian GST (10%)" },
            rate:      { kind: "literal", value: 0.10 },
            amount:    { kind: "context", key: "taxAmount" },
            currency:  { kind: "path",    path: "$.currency" },
            appliesTo: { kind: "literal", value: "fare" },
          },
        },
      },
    },
    {
      instanceId: "n5", ruleId: id,
      bindings: { value: { kind: "literal", value: { skipped: true } } },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "au-offer",
      name: "AU offer $500 → $50 GST",
      payload: {
        offerId: "demo-1", market: "AU", currency: "AUD", totalAmount: 500,
        itinerary: { origin: "SYD", destination: "MEL", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
    {
      id: "us-offer",
      name: "US offer (no GST)",
      payload: {
        offerId: "demo-2", market: "US", currency: "USD", totalAmount: 500,
        itinerary: { origin: "JFK", destination: "LAX", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

/**
 * Switch-on-currency: emit a per-currency FX rate. Demonstrates node-switch
 * with multiple cases dispatching to a single output via merge.
 */
function makeCurrencyFxRateRule(): SeedRule {
  const id = "demo-currency-fx-rate";
  const rule: RuleOnDisk = {
    id,
    name: "FX rate by offer currency",
    description: "Switch on offer.currency and emit the published FX rate to AUD. Demonstrates node-switch dispatch with named cases.",
    endpoint: "/v1/demo/fx/rate",
    method: "POST",
    status: "draft",
    currentVersion: 1,
    tags: ["demo", "seed", "switch"],
    category: "Demo",
    inputSchemaRef: "schema-offer",
    instances: [
      { instanceId: "n1", nodeId: "node-input",    position: { x: 80,   y: 240 }, label: "Offer" },
      { instanceId: "n2", nodeId: "node-switch",   position: { x: 320,  y: 240 }, label: "By currency" },
      { instanceId: "n3", nodeId: "node-constant", position: { x: 600,  y: 100 }, label: "USD → 1.52" },
      { instanceId: "n4", nodeId: "node-constant", position: { x: 600,  y: 220 }, label: "EUR → 1.65" },
      { instanceId: "n5", nodeId: "node-constant", position: { x: 600,  y: 340 }, label: "GBP → 1.92" },
      { instanceId: "n6", nodeId: "node-constant", position: { x: 600,  y: 460 }, label: "Other → 1.00" },
      { instanceId: "n8", nodeId: "node-output",   position: { x: 920,  y: 280 }, label: "Result" },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", branch: "default" },
      { id: "e2", source: "n2", target: "n3", branch: "default", sourceHandle: "usd" },
      { id: "e3", source: "n2", target: "n4", branch: "default", sourceHandle: "eur" },
      { id: "e4", source: "n2", target: "n5", branch: "default", sourceHandle: "gbp" },
      { id: "e5", source: "n2", target: "n6", branch: "default", sourceHandle: "default" },
      // All four case constants wire directly to the output — only the case
      // the switch dispatched into has a recorded output, so AssembleResult
      // picks up exactly that one.
      { id: "e6", source: "n3", target: "n8", branch: "default" },
      { id: "e7", source: "n4", target: "n8", branch: "default" },
      { id: "e8", source: "n5", target: "n8", branch: "default" },
      { id: "e9", source: "n6", target: "n8", branch: "default" },
    ],
    updatedAt: NOW,
    updatedBy: "demo-seed",
  };
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2", ruleId: id,
      bindings: {
        input: { kind: "path", path: "$.currency" },
        cases: {
          kind: "literal",
          value: [
            { match: "USD", name: "usd" },
            { match: "EUR", name: "eur" },
            { match: "GBP", name: "gbp" },
          ],
        },
        default: { kind: "literal", value: "default" },
      },
    },
    { instanceId: "n3", ruleId: id, bindings: { value: { kind: "literal", value: { currency: "USD", rateToAud: 1.52 } } } },
    { instanceId: "n4", ruleId: id, bindings: { value: { kind: "literal", value: { currency: "EUR", rateToAud: 1.65 } } } },
    { instanceId: "n5", ruleId: id, bindings: { value: { kind: "literal", value: { currency: "GBP", rateToAud: 1.92 } } } },
    { instanceId: "n6", ruleId: id, bindings: { value: { kind: "literal", value: { currency: "OTHER", rateToAud: 1.00 } } } },
  ];
  const tests: RuleTest[] = [
    {
      id: "usd",
      name: "USD offer",
      payload: {
        offerId: "demo-1", market: "US", currency: "USD", totalAmount: 500,
        itinerary: { origin: "JFK", destination: "LAX", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
    {
      id: "jpy",
      name: "JPY offer (default)",
      payload: {
        offerId: "demo-2", market: "JP", currency: "JPY", totalAmount: 80000,
        itinerary: { origin: "NRT", destination: "HND", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

/**
 * Assert that departureDate is after 2026-01-01 (a reasonable "future" cutoff
 * relative to seed authoring time). Demonstrates node-assert as a yes/no gate
 * — failing the assert kicks the rule into the error branch.
 */
function makeDepartureFutureAssertRule(): SeedRule {
  const id = "demo-validate-positive-amount";
  const rule: RuleOnDisk = {
    id,
    name: "Validate — totalAmount is positive",
    description: "Assert that offer.totalAmount > 0. Demonstrates node-assert with a simple numeric guard. (NB: assert + calc resolve top-level names only; for nested paths like `itinerary.departureDate` you'd flatten via mutator-set first.)",
    endpoint: "/v1/demo/validate/positive-amount",
    method: "POST",
    status: "draft",
    currentVersion: 1,
    tags: ["demo", "seed", "assert"],
    category: "Demo",
    inputSchemaRef: "schema-offer",
    instances: [
      { instanceId: "n1", nodeId: "node-input",    position: { x: 80,   y: 240 }, label: "Offer" },
      { instanceId: "n2", nodeId: "node-assert",   position: { x: 320,  y: 240 }, label: "Future departure?" },
      { instanceId: "n3", nodeId: "node-output",   position: { x: 600,  y: 240 }, label: "Result" },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", branch: "default" },
      { id: "e2", source: "n2", target: "n3", branch: "default" },
    ],
    updatedAt: NOW,
    updatedBy: "demo-seed",
  };
  const bindings: NodeBindings[] = [
    {
      instanceId: "n2", ruleId: id,
      bindings: {
        // Top-level names only — `totalAmount` resolves; `itinerary.departureDate`
        // would need an upstream mutator-set to flatten first.
        condition:    { kind: "literal", value: "totalAmount > 0" },
        errorCode:    { kind: "literal", value: "INVALID_TOTAL_AMOUNT" },
        errorMessage: { kind: "literal", value: "Total amount must be positive" },
      },
    },
  ];
  const tests: RuleTest[] = [
    {
      id: "ok",
      name: "Positive amount (passes)",
      payload: {
        offerId: "demo-1", market: "AU", currency: "AUD", totalAmount: 500,
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
    {
      id: "zero",
      name: "Zero amount (fails assert)",
      payload: {
        offerId: "demo-2", market: "AU", currency: "AUD", totalAmount: 0,
        itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
        passengers: [{ id: "p1", type: "ADT" }],
      },
      updatedAt: NOW,
    },
  ];
  return { rule, bindings, tests };
}

const ALL_RULES: SeedRule[] = [
  makeTaxRule({
    id: "demo-tax-au-gst",
    name: "Tax — Australia GST",
    endpoint: "/v1/demo/tax/au-gst",
    description: "Emit a 10% GST tax line when offer.market == AU.",
    market: "AU",
    taxCode: "GST",
    taxName: "Australian GST",
    taxRate: 0.10,
  }),
  makeTaxRule({
    id: "demo-tax-uk-vat",
    name: "Tax — UK VAT",
    endpoint: "/v1/demo/tax/uk-vat",
    description: "Emit a 20% VAT tax line when offer.market == GB.",
    market: "GB",
    taxCode: "VAT",
    taxName: "UK VAT",
    taxRate: 0.20,
  }),
  makeTaxRule({
    id: "demo-tax-us-state",
    name: "Tax — US state sales tax",
    endpoint: "/v1/demo/tax/us-state",
    description: "Emit a placeholder 8% state sales tax line when offer.market == US.",
    market: "US",
    taxCode: "US-STATE",
    taxName: "US state sales tax",
    taxRate: 0.08,
  }),
  makeSeatRule({
    id: "demo-produce-seats-economy",
    name: "Produce — economy seat",
    endpoint: "/v1/demo/products/seat-economy",
    cabin: "Y",
    productCode: "SEAT-ECO",
    productName: "Standard economy seat",
    price: 0,
  }),
  makeSeatRule({
    id: "demo-produce-seats-business",
    name: "Produce — business class seat",
    endpoint: "/v1/demo/products/seat-business",
    cabin: "C",
    productCode: "SEAT-BIZ",
    productName: "Business class seat",
    price: 0,
  }),
  makeLoungeRule(),
  makeInsuranceRule(),
  makePaxDobValidator(),
  makePaymentMethodValidator(),

  // Filter-variant rules — exercise typed NodeDefs that compile to StringFilterConfig
  makeVariantFilterProductRule({
    id: "demo-cabin-business-meal-pass",
    name: "Cabin business — complimentary meal pass",
    endpoint: "/v1/demo/products/meal-pass-business",
    description: "Emit a complimentary meal pass when offer.itinerary.cabin == C. Uses node-filter-cabin (typed enum picker UX on top of StringFilterConfig).",
    filterNodeId: "node-filter-cabin",
    sourcePath: "$.itinerary.cabin",
    matchValues: ["C"],
    templateId: "tmpl-seat-product",
    productCode: "MEAL-PASS-C",
    productName: "Complimentary meal pass — business class",
    price: 0,
    extraTemplateFields: { cabin: { kind: "literal", value: "C" } },
    matchTestPayload: {
      offerId: "demo-1", market: "AU", currency: "AUD", totalAmount: 1200,
      itinerary: { origin: "SYD", destination: "LHR", cabin: "C", departureDate: "2026-08-01" },
      passengers: [{ id: "p1", type: "ADT" }],
    },
    nonMatchTestPayload: {
      offerId: "demo-2", market: "AU", currency: "AUD", totalAmount: 500,
      itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
      passengers: [{ id: "p1", type: "ADT" }],
    },
  }),
  makeVariantFilterProductRule({
    id: "demo-loyalty-gold-fastpass",
    name: "Loyalty GOLD/PLATINUM — fast-pass",
    endpoint: "/v1/demo/products/fastpass",
    description: "Emit a security fast-pass when ANY passenger is GOLD or PLATINUM. Uses node-filter-loyalty-tier with arraySelector 'any'.",
    filterNodeId: "node-filter-loyalty-tier",
    sourcePath: "$.passengers[*].loyaltyTier",
    matchValues: ["GOLD", "PLATINUM"],
    arraySelector: "any",
    templateId: "tmpl-seat-product",
    productCode: "FASTPASS",
    productName: "Security fast-pass",
    price: 0,
    extraTemplateFields: { cabin: { kind: "path", path: "$.itinerary.cabin" } },
    matchTestPayload: {
      offerId: "demo-1", market: "AU", currency: "AUD", totalAmount: 500,
      itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
      passengers: [{ id: "p1", type: "ADT", loyaltyTier: "GOLD" }, { id: "p2", type: "ADT", loyaltyTier: "NONE" }],
    },
    nonMatchTestPayload: {
      offerId: "demo-2", market: "AU", currency: "AUD", totalAmount: 500,
      itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
      passengers: [{ id: "p1", type: "ADT", loyaltyTier: "SILVER" }],
    },
  }),
  makeVariantFilterProductRule({
    id: "demo-infant-bassinet",
    name: "Infant on board — bassinet eligibility",
    endpoint: "/v1/demo/products/bassinet",
    description: "Emit a bassinet eligibility marker when any passenger is type INF. Uses node-filter-pax-type with arraySelector 'any'.",
    filterNodeId: "node-filter-pax-type",
    sourcePath: "$.passengers[*].type",
    matchValues: ["INF"],
    arraySelector: "any",
    templateId: "tmpl-seat-product",
    productCode: "BASSINET-ELIG",
    productName: "Bassinet eligibility",
    price: 0,
    extraTemplateFields: { cabin: { kind: "path", path: "$.itinerary.cabin" } },
    matchTestPayload: {
      offerId: "demo-1", market: "AU", currency: "AUD", totalAmount: 500,
      itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
      passengers: [{ id: "p1", type: "ADT" }, { id: "p2", type: "INF" }],
    },
    nonMatchTestPayload: {
      offerId: "demo-2", market: "AU", currency: "AUD", totalAmount: 500,
      itinerary: { origin: "SYD", destination: "LHR", cabin: "Y", departureDate: "2026-08-01" },
      passengers: [{ id: "p1", type: "ADT" }, { id: "p2", type: "ADT" }],
    },
  }),

  // Numeric / date / day-of-week filters
  makeBulkSpendBonusRule(),
  makeWeekendSurchargeRule(),
  makeAdvancePurchaseRule(),

  // Calc / switch / assert
  makeTaxAmountCalcRule(),
  makeCurrencyFxRateRule(),
  makeDepartureFutureAssertRule(),
];

// ── Filesystem writer ──────────────────────────────────────────────────

export type SeedResult = {
  schemasWritten: string[];
  templatesWritten: string[];
  rulesWritten: string[];
  errors: string[];
};

/**
 * Write the entire demo set to the workspace. Idempotent — existing files
 * are overwritten; non-demo files in the same folders are left untouched.
 */
export async function seedDemo(rootPath: string): Promise<SeedResult> {
  const result: SeedResult = {
    schemasWritten: [],
    templatesWritten: [],
    rulesWritten: [],
    errors: [],
  };

  // Schemas
  const schemasDir = path.join(rootPath, "schemas");
  await fs.mkdir(schemasDir, { recursive: true });
  for (const s of SCHEMAS) {
    try {
      const file = path.join(schemasDir, `${s.id}.json`);
      await fs.writeFile(file, JSON.stringify(s, null, 2), "utf-8");
      result.schemasWritten.push(s.id);
    } catch (e) {
      result.errors.push(`schema ${s.id}: ${(e as Error).message}`);
    }
  }

  // Templates
  const templatesDir = path.join(rootPath, "templates");
  await fs.mkdir(templatesDir, { recursive: true });
  for (const t of TEMPLATES) {
    try {
      const file = path.join(templatesDir, `${t.id}.json`);
      await fs.writeFile(file, JSON.stringify(t, null, 2), "utf-8");
      result.templatesWritten.push(t.id);
    } catch (e) {
      result.errors.push(`template ${t.id}: ${(e as Error).message}`);
    }
  }

  // Rules — flat single-document layout: rules/<id>.json carries the entire
  // Rule shape (bindings as a map keyed by instanceId, tests as an array,
  // schemas embedded inline alongside the optional *Ref fields). This is the
  // canonical shape — matches what readRule returns and what /api/export
  // emits.
  const rulesDir = path.join(rootPath, "rules");
  await fs.mkdir(rulesDir, { recursive: true });
  for (const r of ALL_RULES) {
    try {
      const inputSchema = r.rule.inputSchemaRef === "schema-offer" ? OFFER_SCHEMA : ORDER_SCHEMA;
      const bindingsMap: Record<string, NodeBindings> = {};
      for (const b of r.bindings) bindingsMap[b.instanceId] = b;

      const flatRule = {
        ...r.rule,
        inputSchema,
        outputSchema: { type: "object" } as JsonSchema,
        bindings: bindingsMap,
        tests: r.tests,
      };

      await fs.writeFile(
        path.join(rulesDir, `${r.rule.id}.json`),
        JSON.stringify(flatRule, null, 2),
        "utf-8",
      );

      // If a legacy directory exists for this id, remove it so the flat
      // file is the only source of truth.
      const legacyDir = path.join(rulesDir, r.rule.id);
      try {
        const st = await fs.stat(legacyDir);
        if (st.isDirectory()) await fs.rm(legacyDir, { recursive: true, force: true });
      } catch { /* no legacy dir */ }

      result.rulesWritten.push(r.rule.id);
    } catch (e) {
      result.errors.push(`rule ${r.rule.id}: ${(e as Error).message}`);
    }
  }

  return result;
}
