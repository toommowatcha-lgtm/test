// Fix: Removed incorrect type reference and added a declaration for the Deno global object.
// The original /// <reference types="..." /> does not support URLs and caused a "Cannot find type definition file" error.
declare const Deno: any;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');

// Define a type for the expected request body
interface RequestBody {
  endpoint: 'quote' | 'fundamentals';
  symbol: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const { endpoint, symbol }: RequestBody = await req.json();

    if (!endpoint || !symbol) {
      throw new Error("Missing 'endpoint' or 'symbol' in request body.");
    }

    if (!alphaVantageApiKey) {
      throw new Error("Missing ALPHA_VANTAGE_API_KEY environment variable.");
    }

    // ✅ Initialize Supabase client (with user's auth)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // ✅ Auto-create stock if not found
    const { data: existingStock, error: stockCheckError } = await supabaseClient
      .from('stocks')
      .select('id')
      .eq('symbol', symbol)
      .maybeSingle();

    if (stockCheckError) {
      console.error("Stock lookup error:", stockCheckError);
    }

    if (!existingStock) {
      const { error: insertError } = await supabaseClient
        .from('stocks')
        .insert({ symbol });

      if (insertError) {
        throw new Error(`Failed to auto-insert stock: ${insertError.message}`);
      }

      console.log(`✅ Auto-created new stock entry: ${symbol}`);
    }

    // ✅ Build API URL
    let apiUrl = '';
    switch (endpoint) {
      case 'quote':
        apiUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${alphaVantageApiKey}`;
        break;
      default:
        throw new Error(`Invalid endpoint: ${endpoint}`);
    }

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch from Alpha Vantage: ${response.statusText}`);
    }

    const data = await response.json();
    const quoteData = data['Global Quote'];

    if (!quoteData) {
      throw new Error(`No quote data found for symbol: ${symbol}`);
    }

    // ✅ Sanitize API response
    const sanitizedData = {
      symbol: quoteData['01. symbol'],
      latestPrice: parseFloat(quoteData['05. price']),
      change: parseFloat(quoteData['09. change']),
      changePercent: parseFloat(quoteData['10. change percent'].replace('%', '')) / 100,
    };

    return new Response(JSON.stringify(sanitizedData), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      status: 200,
    });

  } catch (error) {
    console.error("Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      status: 400,
    });
  }
});
