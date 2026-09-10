import { User, Buildings, Lightning, LinkSimple } from '@phosphor-icons/react'
import { Badge } from '@/components/atoms/badge'
import type { PhysicalClass } from '@/types/character'
import { cn } from '@/utils/cn'

interface ClassBadgeProps {
  classType: PhysicalClass
  className?: string
  showIcon?: boolean
}

export function ClassBadge({ classType, className, showIcon = true }: ClassBadgeProps) {
  switch (classType) {
    case 'Actor':
      return (
        <Badge
          variant="outline"
          className={cn(
            'bg-blue-50/80 text-blue-800 border-blue-200/80 font-mono text-[11px] gap-1 px-2 py-0.5',
            className
          )}
        >
          {showIcon && <User className="w-3 h-3 text-blue-600" weight="bold" />}
          Actor
        </Badge>
      )
    case 'Place':
      return (
        <Badge
          variant="outline"
          className={cn(
            'bg-emerald-50/80 text-emerald-800 border-emerald-200/80 font-mono text-[11px] gap-1 px-2 py-0.5',
            className
          )}
        >
          {showIcon && <Buildings className="w-3 h-3 text-emerald-600" weight="bold" />}
          Place
        </Badge>
      )
    case 'Act':
      return (
        <Badge
          variant="outline"
          className={cn(
            'bg-amber-50/80 text-amber-800 border-amber-200/80 font-mono text-[11px] gap-1 px-2 py-0.5',
            className
          )}
        >
          {showIcon && <Lightning className="w-3 h-3 text-amber-600" weight="bold" />}
          Act
        </Badge>
      )
    case 'Bond':
      return (
        <Badge
          variant="outline"
          className={cn(
            'bg-purple-50/80 text-purple-800 border-purple-200/80 font-mono text-[11px] gap-1 px-2 py-0.5',
            className
          )}
        >
          {showIcon && <LinkSimple className="w-3 h-3 text-purple-600" weight="bold" />}
          Bond
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className={className}>
          {classType}
        </Badge>
      )
  }
}
