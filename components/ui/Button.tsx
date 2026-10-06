import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primair' | 'secundair' | 'kaal'
export type ButtonGrootte = 'sm' | 'md'

const BASIS =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const VARIANT: Record<ButtonVariant, string> = {
  primair: 'bg-primary text-white hover:bg-primary-dark',
  secundair: 'border border-gray-300 bg-white text-gray-800 hover:border-primary hover:text-primary',
  kaal: 'text-primary hover:bg-primary/5 hover:text-primary-dark',
}

const GROOTTE: Record<ButtonGrootte, string> = {
  sm: 'min-h-[44px] min-w-[44px] px-3 text-sm',
  md: 'min-h-[44px] px-4 text-sm',
}

export function knopKlassen(variant: ButtonVariant = 'primair', grootte: ButtonGrootte = 'md', extra?: string): string {
  return cn(BASIS, VARIANT[variant], GROOTTE[grootte], extra)
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  grootte?: ButtonGrootte
  children?: ReactNode
}

export function Button({ variant = 'primair', grootte = 'md', className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={knopKlassen(variant, grootte, className)} {...rest}>
      {children}
    </button>
  )
}

export interface ButtonLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string
  variant?: ButtonVariant
  grootte?: ButtonGrootte
  children?: ReactNode
}

/** Link die eruitziet als een knop (interne links via next/link). */
export function ButtonLink({ href, variant = 'primair', grootte = 'md', className, children, ...rest }: ButtonLinkProps) {
  const klassen = knopKlassen(variant, grootte, className)
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={klassen} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={klassen} {...rest}>
      {children}
    </Link>
  )
}
