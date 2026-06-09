import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://depxxxvxkitsnnhrilow.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlcHh4eHZ4a2l0c25uaHJpbG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTI0MzMsImV4cCI6MjA5NjQ4ODQzM30.BcdijDHl2KCX2w5fwPH71tn5W0bMKJ_1PF9r3SpVnrc'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
