import React from 'react'
import { cn } from '@/lib/utils'

interface SkeletonLoaderProps {
  className?: string
}

export function SkeletonLoader({ className }: SkeletonLoaderProps) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-muted', className)} />
  )
}