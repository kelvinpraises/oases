import { Badge } from '@/components/atoms/badge'
import { cn } from '@/utils/cn'

interface StatusPillProps {
  status: string
  className?: string
  pulse?: boolean
}

export function StatusPill({ status, className, pulse = true }: StatusPillProps) {
  const normalized = status.toUpperCase()

  let badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive' = 'outline'
  let dotColor = 'bg-neutral-400'
  let textColor = 'text-neutral-700'
  let bgColor = 'bg-neutral-100'
  let borderColor = 'border-neutral-200'

  if (normalized === 'ACTIVE' || normalized === 'STREAMING') {
    badgeVariant = 'outline'
    dotColor = 'bg-emerald-500'
    textColor = 'text-emerald-800'
    bgColor = 'bg-emerald-50'
    borderColor = 'border-emerald-200'
  } else if (normalized === 'MONITORING' || normalized === 'STRAIN' || normalized === 'LOCKED') {
    badgeVariant = 'outline'
    dotColor = 'bg-amber-500'
    textColor = 'text-amber-800'
    bgColor = 'bg-amber-50'
    borderColor = 'border-amber-200'
  } else if (normalized === 'BREACH' || normalized === 'BROKEN' || normalized === 'DEVIANT') {
    badgeVariant = 'destructive'
    dotColor = 'bg-red-500'
    textColor = 'text-red-800'
    bgColor = 'bg-red-50'
    borderColor = 'border-red-200'
  } else if (normalized === 'RESOLVED') {
    badgeVariant = 'secondary'
    dotColor = 'bg-neutral-500'
    textColor = 'text-neutral-700'
    bgColor = 'bg-neutral-100'
    borderColor = 'border-neutral-200'
  }

  return (
    <Badge
      variant={badgeVariant}
      className={cn(
        'gap-1.5 px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider',
        bgColor,
        textColor,
        borderColor,
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (normalized === 'ACTIVE' || normalized === 'STREAMING') && (
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', dotColor)} />
        )}
        <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', dotColor)} />
      </span>
      {status}
    </Badge>
  )
}
