/* Connection settings.
   - Leave both values empty  -> DEMO MODE: sample data, kept in this browser only (nothing is sent anywhere).
   - Fill both from Supabase > Project Settings > API  -> LIVE MODE: login + shared database (see SUPABASE.md).
   Only the "anon / publishable" key goes here: it is safe to expose because the database rules (RLS) protect the data.
   NEVER put the "service_role" key in this file. */
window.RR_CONFIG = {
  supabaseUrl: '',        // e.g. https://abcdxyz.supabase.co
  supabaseAnonKey: '',    // the long "anon public" key
};
