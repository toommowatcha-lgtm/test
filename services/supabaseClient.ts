
import { createClient } from '@supabase/supabase-js';

// Read from environment variables, with a fallback for local development.
// In a production environment (like Vercel, Netlify), these would be set in the project settings.
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://xxqyrhibagubljpkfrzv.supabase.co";
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4cXlyaGliYWd1YmxqcGtmcnp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NTQxODQsImV4cCI6MjA3NjIzMDE4NH0.cDhbqabqlKyc0bPdS9o1asIKU59aPxgGE-jANzda2uM";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key must be provided either in environment variables or directly.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
