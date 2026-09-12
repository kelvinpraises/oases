import React from 'react'
import { Link } from '@tanstack/react-router'
import { CaretRight } from '@phosphor-icons/react'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface TerminalShellProps {
  title: string
  subtitle?: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: React.ReactNode
  children: React.ReactNode
}

export function TerminalShell({
  title,
  subtitle,
  breadcrumbs,
  actions,
  children,
}: TerminalShellProps) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-neutral-50/70 bg-grid-subtle pb-20">
      {/* Top Banner / Breadcrumb & Header Section */}
      <div className="border-b border-neutral-200 bg-white/90 backdrop-blur-xs">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          {/* Top metadata strip: Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="mb-3 flex items-center justify-between border-b border-neutral-100 pb-2.5">
              <nav className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-500">
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.label}>
                    {idx > 0 && <CaretRight className="w-3 h-3 text-neutral-300" />}
                    {crumb.href ? (
                      <Link
                        to={crumb.href}
                        className="hover:text-neutral-900 transition-colors"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="font-semibold text-neutral-900 bg-neutral-100 px-1.5 py-0.5 rounded text-[10px]">
                        {crumb.label}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            </div>
          )}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-neutral-900 text-balance">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-xs sm:text-sm text-neutral-600 max-w-3xl leading-relaxed text-pretty">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
          </div>
        </div>
      </div>

      {/* Main Content Area with concentric framing */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
