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
    <div className="min-h-[calc(100vh-3.5rem)] bg-neutral-50/50 pb-16">
      {/* Top Banner / Breadcrumb section */}
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="mb-3 flex items-center gap-1.5 text-xs font-mono text-neutral-500">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.label}>
                  {idx > 0 && <CaretRight className="w-3 h-3 text-neutral-400" />}
                  {crumb.href ? (
                    <Link
                      to={crumb.href}
                      className="hover:text-neutral-900 transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-neutral-900 font-medium">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold font-display tracking-tight text-neutral-900 sm:text-3xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-sm text-neutral-600 max-w-3xl">{subtitle}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2.5">{actions}</div>}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
