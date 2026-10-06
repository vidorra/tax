import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type CardPadding = 'geen' | 'klein' | 'normaal'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'aside'
  padding?: CardPadding
  children?: ReactNode
}

const PADDING: Record<CardPadding, string> = {
  geen: '',
  klein: 'p-4',
  normaal: 'p-5 sm:p-6',
}

/** Witte kaart: de basis van elk blok in de calculator en het dossier. */
export function Card({ as: Tag = 'div', padding = 'normaal', className, children, ...rest }: CardProps) {
  return (
    <Tag className={cn('bg-white rounded-2xl border border-gray-200 shadow-sm', PADDING[padding], className)} {...rest}>
      {children}
    </Tag>
  )
}
