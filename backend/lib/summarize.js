// Deterministic summary builder. Rebuilds a human-readable proposal summary from
// validated structured fields — no AI. Used when a user manually edits a proposal,
// so we restate exactly what they set without re-introducing AI ambiguity.

function recipientLabel(r) {
  return r.resolved?.label || r.name || r.email || r.address || 'recipient'
}

export function buildSummary(intent, pay) {
  const amt = pay.token_amount != null
    ? `${Number(pay.token_amount).toFixed(4)} ${pay.currency}`
    : `${pay.amount} ${pay.currency || 'USD'}`
  const recips = (pay.recipients || []).map(recipientLabel)

  switch (intent) {
    case 'send':
      return `Send ${amt} to ${recips[0] || 'recipient'}.`
    case 'split': {
      const perAmounts = (pay.recipients || []).every(r => r.amount != null)
      if (perAmounts) {
        const parts = (pay.recipients || [])
          .map(r => `${r.amount} ${pay.currency || 'USD'} to ${recipientLabel(r)}`)
          .join(', ')
        return `Split payment: ${parts}.`
      }
      const parts = (pay.recipients || [])
        .map(r => `${recipientLabel(r)} (${r.share}%)`)
        .join(', ')
      return `Split ${amt} between ${parts}.`
    }
    case 'stream':
      return `Stream ${amt} to ${recips[0] || 'recipient'} over ${pay.schedule?.duration_days ?? '?'} days.`
    case 'schedule':
      return `Send ${amt} to ${recips[0] || 'recipient'} ${pay.schedule?.frequency || ''}${pay.schedule?.day ? ' on the ' + pay.schedule.day : ''}.`
    case 'escrow':
      return `Hold ${amt} for ${recips[0] || 'recipient'} until: ${pay.condition || 'condition'}.`
    case 'automate':
      return `Automate: ${pay.rule?.percentage ?? '?'}% on ${pay.rule?.trigger || 'trigger'}.`
    default:
      return `${intent} payment.`
  }
}
