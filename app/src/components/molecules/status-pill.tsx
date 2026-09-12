import { Badge } from '@/components/atoms/badge'
import { cn } from '@/utils/cn'

interface StatusPillProps {
  status: string
  className?: string
  pulse?: boolean
}

export function StatusPill({ status, className }: StatusPillProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider bg-neutral-100 text-neutral-700 border-neutral-200',
        className
      )}
    >
      <span className="inline-flex rounded-full h-1.5 w-1.5 bg-neutral-900" />
      {status}
    </Badge>
  )
}
