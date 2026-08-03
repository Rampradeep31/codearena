import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://vubpgeagtfpqdojdiqtc.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YnBnZWFndGZwcWRvamRpcXRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NjY3OTIsImV4cCI6MjEwMTE0Mjc5Mn0.pm5_u6S2SPnrVGGJ2HibOFp-y4a7pVx7ktyr35FdRVM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
