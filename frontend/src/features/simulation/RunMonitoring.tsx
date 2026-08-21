import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ResidualsChart } from '@/components/charts/ResidualsChart'
import { LogConsole } from '@/components/panels/LogConsole'
import { runsApi } from '@/api/runs'

interface RunMonitoringProps {
  projectId: string
}

export function RunMonitoring({ projectId }: RunMonitoringProps) {
  const { data: residuals } = useQuery({
    queryKey: ['residuals', projectId],
    queryFn: () => runsApi.residuals(projectId),
    enabled: !!projectId,
    refetchInterval: 2000,
  })

  const { data: logs } = useQuery({
    queryKey: ['logs', projectId],
    queryFn: () => runsApi.logs(projectId),
    enabled: !!projectId,
    refetchInterval: 3000,
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Residui</CardTitle>
        </CardHeader>
        <CardContent>
          <ResidualsChart residuals={residuals?.residuals || {}} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <LogConsole logs={logs?.logs || []} />
        </CardContent>
      </Card>
    </div>
  )
}