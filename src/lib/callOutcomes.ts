import type { CallOutcome } from './api'

// WS2a: the six call dispositions, shared by the logging forms and the call
// report so labels never drift. Order matches the report's column order.
export const CALL_OUTCOMES: CallOutcome[] = [
  'connected', 'voicemail', 'no-answer', 'callback', 'wrong-number', 'other',
]

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  connected: 'Connected',
  voicemail: 'Voicemail',
  'no-answer': 'No answer',
  callback: 'Callback',
  'wrong-number': 'Wrong number',
  other: 'Other',
}
