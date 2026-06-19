import { callModel, MODELS } from './lib/openrouter.js'

const CLASSIFIER_SYS = `You are Velfi's message router. Classify the user's message into exactly one category:
- "payment": the user is instructing a money action (send, split, stream, schedule, escrow, automate). Imperative intent to move or set up money.
- "question": asking how something works, help, account, settings, security, or anything informational.
- "other": greetings, small talk, or anything else.
Output ONLY one lowercase word: payment, question, or other. No punctuation.`

const PARSER_SYS = `You are Velfi's instruction parser. Convert one plain-language money instruction into a single strict JSON object. Output ONLY the JSON, no prose, no markdown fences.
Schema:
{ "intent":"send|split|stream|schedule|escrow|automate|unknown","confidence":0.0,"needs_clarification":false,"clarifying_question":null,"payment":{"amount":null,"currency":"USD","recipients":[{"name":null,"email":null,"address":null,"share":null}],"schedule":{"frequency":null,"day":null,"duration_days":null},"condition":null,"rule":{"trigger":null,"percentage":null}},"summary":null }
Rules: detect one intent; amount is number only; a recipient has a .vel name OR 0x address OR email; splits fill share (sum 100), "evenly"=equal; streams need duration_days; schedules need frequency; escrow needs condition; automate needs rule.trigger+percentage; always write a one-sentence summary; set confidence honestly; if critical field missing/ambiguous set needs_clarification true + ONE clarifying_question, NEVER invent values; not a payment = intent "unknown".`

const tests = [
  "Send $50 to jordan.vel",
  "Split $300 evenly between alice.vel, bob.vel and carol.vel",
  "Split this 40/30/30 between alice.vel, bob.vel, carol.vel",
  "Stream $4,000 to alex.vel over 30 days",
  "Send rent of $1,200 to landlord.vel every month on the 1st",
  "Hold $2,000 for builder.vel until the work is delivered",
  "Move 10% of every payment I receive into savings",
  "Send $50 to jordan@gmail.com",
  "Send some money to Jordan",
  "Pay my team",
  "Stream money to alex.vel",
  "What's my balance?",
  "How does escrow work?",
  "Hello",
]

function strip(s){return String(s).replace(/```json/gi,'').replace(/```/g,'').trim()}

for (const msg of tests) {
  try {
    const klass = (await callModel(MODELS.classifier,[{role:'system',content:CLASSIFIER_SYS},{role:'user',content:msg}])).toLowerCase().trim()
    let line = `\n[${klass.toUpperCase()}] "${msg}"`
    if (klass === 'payment') {
      const raw = await callModel(MODELS.parser,[{role:'system',content:PARSER_SYS},{role:'user',content:msg}],{json:true})
      const p = JSON.parse(strip(raw))
      line += `\n   intent=${p.intent} conf=${p.confidence} clarify=${p.needs_clarification}`
      line += `\n   summary: ${p.summary}`
      if (p.needs_clarification) line += `\n   Q: ${p.clarifying_question}`
    }
    console.log(line)
  } catch(e) {
    console.log(`\n[ERROR] "${msg}": ${e.message}`)
  }
}
console.log('\n--- done ---')
