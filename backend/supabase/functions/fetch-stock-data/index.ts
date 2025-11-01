// Fix: Removed incorrect type reference and added a declaration for the Deno global object.
// The original /// <reference types="..." /> does not support URLs and caused a "Cannot find type definition file" error.
declare const Deno: any;

// Follow this tutorial to get started with Deno to write Supabase Edge Functions:
// https://supabase.com/docs/guides/functions/quickstart

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
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    } });
  }

  try {
    const { endpoint, symbol }: RequestBody = await req.json();

    if (!endpoint || !symbol) {
      throw new Error("Missing 'endpoint' or 'symbol' in request body.");
    }
    
    if (!alphaVantageApiKey) {
        throw new Error("Missing ALPHA_VANTAGE_API_KEY environment variable.");
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    let apiUrl = '';
    
    switch(endpoint) {
        case 'quote':
            apiUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${alphaVantageApiKey}`;
            break;
        // Add cases for other endpoints like fundamentals, etc.
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

    // Sanitize and map data to our format
    const sanitizedData = {
        symbol: quoteData['01. symbol'],
        latestPrice: parseFloat(quoteData['05. price']),
        change: parseFloat(quoteData['09. change']),
        changePercent: parseFloat(quoteData['10. change percent'].replace('%', '')) / 100,
        // ... add other fields and cache to stocks_cache table
    };

    // Example of caching data to Supabase table
    // await supabaseClient.from('stocks_cache').upsert({
    //     symbol: sanitizedData.symbol,
    //     last_price: sanitizedData.latestPrice,
    //     last_updated: new Date().toISOString()
    // }, { onConflict: 'symbol' });


    return new Response(JSON.stringify(sanitizedData), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      status: 400,
    });
  }
});
