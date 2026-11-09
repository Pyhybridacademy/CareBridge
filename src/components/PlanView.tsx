import { Pill } from 'lucide-react'
import type { TreatmentPlan } from '../types'
import { fmtDate } from '../lib/format'
import { AudioPlayer, VideoPlayer } from './MediaPlayers'
import { Badge, Card } from './ui'

function MediaForItem({ path }: { path: string }) {
  const isVideo = path.includes('/video-')
  return isVideo ? <VideoPlayer path={path} /> : <AudioPlayer path={path} />
}

/** Treatment plan card. Patients can tick items (onToggle); nurses see a read-only list. */
export default function PlanView({
  plan,
  onToggle,
  footer,
}: {
  plan: TreatmentPlan
  onToggle?: (itemId: string, done: boolean) => void
  footer?: React.ReactNode
}) {
  const items = plan.treatment_items ?? []
  const done = items.filter((i) => i.is_completed).length
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{plan.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {fmtDate(plan.start_date)}
            {plan.end_date ? ` – ${fmtDate(plan.end_date)}` : ''}
          </p>
        </div>
        <Badge tone={plan.status === 'active' ? 'teal' : 'green'}>{plan.status}</Badge>
      </div>
      {plan.description && <p className="mt-2 text-sm">{plan.description}</p>}

      {items.length > 0 && (
        <>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {done} of {items.length} done
          </p>
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-700">
            {items.map((i) => (
              <li key={i.id} className="flex gap-3 py-2.5">
                {onToggle ? (
                  <input
                    type="checkbox"
                    checked={i.is_completed}
                    onChange={(e) => onToggle(i.id, e.target.checked)}
                    className="mt-1 h-6 w-6 shrink-0 accent-teal-600"
                    aria-label={`Mark ${i.medication_or_task} as done`}
                  />
                ) : (
                  <Pill className="mt-1 h-5 w-5 shrink-0 text-teal-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={i.is_completed ? 'font-medium line-through opacity-60' : 'font-medium'}>{i.medication_or_task}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {[i.dosage, i.frequency, i.duration].filter(Boolean).join(' · ')}
                  </p>
                  {i.instructions && <p className="text-sm text-slate-500 dark:text-slate-400">{i.instructions}</p>}
                  {i.media_path && (
                    <div className="mt-2">
                      <MediaForItem path={i.media_path} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {footer}
    </Card>
  )
}
