import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until dashboard/.env.local has both values. The app then shows its built-in sample data. */
export const supabaseConfigured = Boolean(URL && ANON_KEY);

/** One browser client for the whole app. The session is kept in localStorage. */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(URL!, ANON_KEY!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
