import { Link, useLocation } from "wouter";
import { 
  Microscope, 
  BarChart3, 
  MapPin, 
  TrendingUp, 
  GitBranch, 
  Users, 
  Dna, 
  Settings,
  Activity,
  Menu,
  X,
  Trophy,
  AlertTriangle,
  Shield,
  Database,
  Upload,

} from "lucide-react";
import { Button } from "./button";
import { useState, useEffect } from "react";

export function Sidebar() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigationItems = [
    { href: "/", label: "Dashboard", icon: BarChart3 },
    { href: "/activity", label: "Activity Feed", icon: Activity },
    { href: "/geospatial", label: "Geospatial Analysis", icon: MapPin },
    { href: "/species", label: "Species Analysis", icon: Dna },
    { href: "/temporal", label: "Temporal Trends", icon: TrendingUp },
    { href: "/taxonomic", label: "Taxonomic Analysis", icon: GitBranch },
    { href: "/conservation", label: "Conservation", icon: Shield },
    { href: "/contributors", label: "Contributors", icon: Users },
    { href: "/records", label: "Records", icon: Trophy },
  ];

  const adminItems = [
    { href: "/admin/validation", label: "Data Validation", icon: Database },
    { href: "/admin/upload", label: "Data Upload", icon: Upload },
    { href: "/admin/redlist", label: "Red List Management", icon: AlertTriangle },
    { href: "/admin/settings", label: "System Settings", icon: Settings },
  ];



  // Close mobile menu when location changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      const target = event.target as Element;
      if (isMobileMenuOpen && !target.closest('.mobile-sidebar') && !target.closest('.mobile-menu-button')) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isMobileMenuOpen]);

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <Microscope className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">MycoMap Network</h1>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mobile-menu-button p-2"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-[9998]" />
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white shadow-sm border-r border-slate-200 flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center overflow-hidden">
              <Microscope className="w-8 h-8 text-primary" />
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
        
        <div className="p-4 border-t border-slate-200 space-y-2">
          <Link href="/updates">
            <a className={`flex items-center space-x-3 px-3 py-2 rounded-lg font-medium w-full text-left ${
              location === "/updates" || location.startsWith("/updates")
                ? "bg-primary/10 text-primary"
                : "text-slate-600 hover:bg-slate-100"
            }`}>
              <AlertTriangle className="w-5 h-5" />
              <span>Updates Needed</span>
            </a>
          </Link>

          {/* Admin Section */}
          <div className="space-y-1">
            <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Admin
            </div>
            
            <div className="space-y-1">
              {adminItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={`flex items-center space-x-3 px-3 py-2 rounded-lg font-medium text-left text-sm cursor-pointer ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={`lg:hidden mobile-sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg border-r border-slate-200 flex flex-col z-[9999] transform transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Microscope className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900">MycoMap Network</h1>
              <p className="text-xs text-slate-500">Research Dashboard</p>
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
                  className={`flex items-center space-x-3 px-3 py-3 rounded-lg font-medium w-full text-left ${
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
        
        <div className="p-4 border-t border-slate-200 space-y-2">
          <Link href="/updates">
            <a className={`flex items-center space-x-3 px-3 py-3 rounded-lg font-medium w-full text-left ${
              location === "/updates" || location.startsWith("/updates")
                ? "bg-primary/10 text-primary"
                : "text-slate-600 hover:bg-slate-100"
            }`}>
              <AlertTriangle className="w-5 h-5" />
              <span>Updates Needed</span>
            </a>
          </Link>

          {/* Admin Section - Mobile */}
          <div className="space-y-1">
            <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Admin
            </div>
            
            <div className="space-y-1">
              {adminItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={`flex items-center space-x-3 px-3 py-3 rounded-lg font-medium text-left text-sm cursor-pointer ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
