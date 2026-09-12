import { User, Buildings, Lightning, LinkSimple } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Badge } from '@/components/atoms/badge'
import type { PhysicalClass } from '@/types/character'
import { cn } from '@/utils/cn'

interface ClassBadgeProps {
  classType: PhysicalClass
  className?: string
  showIcon?: boolean
}

const CLASS_ICONS: Record<PhysicalClass, Icon> = {
  Actor: User,
  Place: Buildings,
  Act: Lightning,
  Bond: LinkSimple,
}

export function ClassBadge({ classType, className, showIcon = true }: ClassBadgeProps) {
  const IconComponent = CLASS_ICONS[classType]

  return (
    <Badge
      variant="outline"
      className={cn(
        'bg-neutral-50 text-neutral-800 border-neutral-200 font-mono text-[11px] gap-1 px-2 py-0.5',
        className
      )}
    >
      {showIcon && IconComponent && <IconComponent className="w-3 h-3 text-neutral-500" weight="bold" />}
      {classType}
    </Badge>
  )
}
