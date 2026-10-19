import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

interface ToastStore {
  toasts: Toast[]
  push: (text: string, tone?: Toast['tone']) => void
  dismiss: (id: number) => void
}

let seq = 0

export const useToasts = create<ToastStore>()((set, get) => ({
  toasts: [],
  push(text, tone = 'info') {
    const id = ++seq
    // Collapse identical consecutive messages instead of stacking them.
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.text !== text), { id, text, tone }].slice(-3) }))
    setTimeout(() => get().dismiss(id), tone === 'error' ? 6000 : 3500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Fire-and-forget helper for non-React code. */
export const toast = (text: string, tone?: Toast['tone']) => useToasts.getState().push(text, tone)
