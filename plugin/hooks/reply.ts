// Finding Claude's last reply, for /copyreply.

import { cleanForDisplay } from './clean'
import type { CleanMode } from './settings'

export type ReplyMessage = { role: 'user' | 'assistant'; text: string }

// The text of Claude's newest message that has any, or '' when there is none.
export function lastReplyOf(messages: readonly ReplyMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role === 'assistant' && message.text.trim() !== '') return message.text.trim()
  }

  return ''
}

// What /copyreply puts on the clipboard: the reply with its symbols cleaned
// the way the screen shows it, or exactly as Claude wrote it.
export function copyText(reply: string, clean: CleanMode, isRaw: boolean): string {
  return isRaw || clean === 'off' ? reply : cleanForDisplay(reply, clean)
}

// "120 words", said after copying so the person knows what they got.
export function wordCount(text: string): string {
  const words = text.split(/\s+/).filter(w => w !== '').length

  return words === 1 ? '1 word' : `${words} words`
}
