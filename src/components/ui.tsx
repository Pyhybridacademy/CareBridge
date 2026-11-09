import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { initials } from '../lib/format'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: BtnProps) {
  const styles = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 disabled:bg-teal-600/50',
    secondary:
      'bg-white text-teal-800 border border-teal-200 hover:bg-teal-50 dark:bg-slate-800 dark:text-teal-100 dark:border-slate-600 dark:hover:bg-slate-700',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
    ghost: 'text-teal-700 hover:bg-teal-50 dark:text-teal-200 dark:hover:bg-slate-800',
  }[variant]
  const sizes = size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-base'
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed',
        styles,
        sizes,
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

const inputBase =
  'w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(inputBase, 'py-2', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputBase, props.className)} />
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/70',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Avatar({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-teal-100 font-semibold text-teal-800 dark:bg-teal-900 dark:text-teal-100"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700', className)} />
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-600">
      {icon && <div className="text-teal-600">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">{text}</p>}
      {action}
    </div>
  )
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  )
}

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'teal' | 'amber' | 'red' | 'green'; children: ReactNode }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
    red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  }[tone]
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones)}>{children}</span>
}

export function statusTone(status: string): 'slate' | 'teal' | 'amber' | 'red' | 'green' {
  switch (status) {
    case 'requested':
      return 'amber'
    case 'confirmed':
      return 'teal'
    case 'completed':
      return 'green'
    case 'cancelled':
      return 'red'
    default:
      return 'slate'
  }
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h2>
      {action}
    </div>
  )
}
