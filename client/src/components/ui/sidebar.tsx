import { Link, useLocation } from "wouter";
import { 
  Microscope, 
  BarChart3, 
  MapPin, 
  TrendingUp, 
  GitBranch, 
  Users, 
  Dna, 
  Settings 
} from "lucide-react";
import { Button } from "./button";

interface SidebarProps {
  onOpenAdmin: () => void;
}

export function Sidebar({ onOpenAdmin }: SidebarProps) {
  const [location] = useLocation();

  const navigationItems = [
    { href: "/", label: "Dashboard", icon: BarChart3 },
    { href: "/geospatial", label: "Geospatial Analysis", icon: MapPin },
    { href: "/temporal", label: "Temporal Trends", icon: TrendingUp },
    { href: "/taxonomic", label: "Taxonomic Analysis", icon: GitBranch },
    { href: "/contributors", label: "Contributors", icon: Users },
    { href: "/species", label: "Species Analysis", icon: Dna },
  ];

  return (
    <aside className="w-64 bg-white shadow-sm border-r border-slate-200 flex flex-col">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center overflow-hidden">
            <img 
              src="/MycoMapLogo-notext.PNG" 
              alt="MycoMap Logo" 
              className="w-12 h-12 object-contain"
              onError={(e) => {
                // Fallback to microscope icon if logo fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.parentElement!.innerHTML = '<svg class="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>';
              }}
            />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">The MycoMap Network</h1>
            <p className="text-sm text-slate-500">Research Dashboard</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          
          return (
            <Link key={item.href} href={item.href}>
              <a
                className={`flex items-center space-x-3 px-3 py-2 rounded-lg font-medium w-full text-left ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </a>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-slate-200">
        <Button
          variant="ghost"
          className="flex items-center space-x-3 px-3 py-2 w-full justify-start font-medium text-slate-600 hover:bg-slate-100"
          onClick={onOpenAdmin}
        >
          <Settings className="w-5 h-5" />
          <span>Admin Panel</span>
        </Button>
      </div>
    </aside>
  );
}
