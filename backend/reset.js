import supabase from './lib/supabase.js'
const addr = process.argv[2]
const { error } = await supabase.from('agent_conversations')
  .update({ pending_state: null, pending_parse: null, pending_tx: null, history: [] })
  .eq('user_address', addr)
console.log(error ? 'reset error: ' + error.message : 'reset ok')
process.exit(0)
