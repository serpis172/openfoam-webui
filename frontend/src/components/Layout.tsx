import { Box, Home, PlusCircle } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  const navItems = [
    {
      label: 'Dashboard',
      href: '/',
      icon: Home,
      active: location.pathname === '/',
    },
    {
      label: 'Nuovo caso',
      href: '/cases/new',
      icon: PlusCircle,
      active: location.pathname.startsWith('/cases/new'),
    },
  ]

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Box className="w-8 h-8 text-blue-400" />
            <div>
              <div className="font-bold text-lg">OpenFOAM</div>
              <div className="text-sm text-slate-400">Web UI</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map(item => (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                item.active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 text-xs text-slate-500 border-t border-slate-800">
          Versione 3.0.0
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  )
}