import React from 'react'
import { Link } from 'react-router-dom'
import { MoreVertical, Copy, Trash2, Clock, Box } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Project } from '@/types/project'
import { formatDate } from '@/lib/utils'

interface ProjectCardProps {
  project: Project
  viewMode: 'grid' | 'list'
}

export function ProjectCard({ project, viewMode }: ProjectCardProps) {
  if (viewMode === 'list') {
    return (
      <Link to={`/projects/${project.id}`}>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Box className="w-6 h-6 text-primary" />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{project.name}</h3>
              <p className="text-sm text-muted-foreground truncate">
                {project.description || project.solver}
              </p>
            </div>

            <StatusBadge status={project.status} />
            
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {formatDate(project.createdAt)}
            </div>

            <Button variant="ghost" size="icon">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <Link to={`/projects/${project.id}`}>
      <Card className="hover:shadow-md transition-shadow h-full">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Box className="w-6 h-6 text-primary" />
            </div>
            
            <Button variant="ghost" size="icon" onClick={(e) => e.preventDefault()}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>

          <h3 className="font-semibold text-lg mb-1 line-clamp-1">
            {project.name}
          </h3>
          
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {project.description || project.solver}
          </p>

          <div className="flex items-center justify-between">
            <StatusBadge status={project.status} />
            
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(project.createdAt)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}