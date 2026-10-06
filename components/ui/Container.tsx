import type { ReactNode } from 'react'
import { cn } from './cn'

export type ContainerBreedte = 'smal' | 'normaal' | 'breed'

const BREEDTE: Record<ContainerBreedte, string> = {
  smal: 'max-w-3xl',
  normaal: 'max-w-5xl',
  breed: 'max-w-6xl',
}

export interface ContainerProps {
  breedte?: ContainerBreedte
  as?: 'div' | 'section' | 'article'
  className?: string
  children?: ReactNode
}

/** Paginabreedte met een zijmarge van 16px op mobiel. */
export function Container({ breedte = 'normaal', as: Tag = 'div', className, children }: ContainerProps) {
  return <Tag className={cn('mx-auto w-full px-4', BREEDTE[breedte], className)}>{children}</Tag>
}
