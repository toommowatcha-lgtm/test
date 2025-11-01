// index.ts — Supabase Edge Function: addMetric
import { serve } from "std/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("https://xxqyrhibagubljpkfrzv.supabase.co")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4cXlyaGliYWd1YmxqcGtmcnp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY1NDE4NCwiZXhwIjoyMDc2MjMwMTg0fQ.YfFEE46JyrAAJcM9o5uukc81rPMSGBWk5Upd4sBOdPc")!;

const supabase = createClient(https://xxqyrhibagubljpkfrzv.supabase.co, eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4cXlyaGliYWd1YmxqcGtmcnp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY1NDE4NCwiZXhwIjoyMDc2MjMwMTg0fQ.YfFEE46JyrAAJcM9o5uukc81rPMSGBWk5Upd4sBOdPc, {
  global: { headers: { "x-qa": "add-metric-function" } },
});

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const body = await req.json();

    // payload shape:
    // { metric_name: string, display_order?: number, stock_id?: string, symbol?: string, company_name?: string }
    const { metric_name, display_order = 0, stock_id: incomingStockId, symbol, company_name } = body;

    if (!metric_name) {
      return new Response(JSON.stringify({ error: "metric_name is required" }), { status: 400 });
    }

    let stockId = incomingStockId ?? null;

    // If stock_id not provided, but symbol provided -> find or create stock
    if (!stockId && symbol) {
      // Use transaction-like safe approach: first try select, if not exists then insert.
      // To avoid race conditions, attempt insert on unique symbol conflict and return id.
      // Step 1: try select
      const { data: existingStock, error: selErr } = await supabase
        .from("stocks")
        .select("id")
        .eq("symbol", symbol)
        .maybeSingle();

      if (selErr) throw selErr;

      if (existingStock && existingStock.id) {
        stockId = existingStock.id;
      } else {
        // Step 2: insert with ON CONFLICT DO NOTHING then select id again
        const { error: insErr } = await supabase
          .from("stocks")
          .insert({
            symbol,
            company_name: company_name ?? null
          })
          .select("id")
          .limit(1);

        if (insErr) {
          // If insert failed because another concurrent insert happened, fallthrough to select
          // but if other error, throw
          // We will attempt a final select below regardless.
          // (Don't throw immediately for unique-constraint race)
          console.warn("insert stock error (non-fatal):", insErr.message || insErr);
        }

        // Final select to get id (handles race)
        const { data: finalStock, error: finalSelErr } = await supabase
          .from("stocks")
          .select("id")
          .eq("symbol", symbol)
          .maybeSingle();

        if (finalSelErr) throw finalSelErr;
        if (!finalStock || !finalStock.id) {
          throw new Error("Failed to create or find stock");
        }
        stockId = finalStock.id;
      }
    }

    if (!stockId) {
      return new Response(JSON.stringify({ error: "stock_id or symbol is required" }), { status: 400 });
    }

    // Insert metric (financial_metric) using the derived stockId
    const { data: metricData, error: metricErr } = await supabase
      .from("financial_metric")
      .insert({
        metric_name,
        display_order,
        stock_id: stockId
      })
      .select("*")
      .single();

    if (metricErr) throw metricErr;

    return new Response(JSON.stringify({ success: true, metric: metricData }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("addMetric error:", err);
    return new Response(JSON.stringify({ error: err.message || err }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
