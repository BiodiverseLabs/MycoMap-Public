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
  ChevronDown,
  ChevronRight,
  BookOpen
} from "lucide-react";
import { Button } from "./button";
import { useState, useEffect } from "react";

export function Sidebar() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminExpanded, setIsAdminExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Auto-collapse on field guide detail pages
  useEffect(() => {
    const isFieldGuideDetail = /^\/field-guides\/\d+$/.test(location);
    setIsCollapsed(isFieldGuideDetail);
  }, [location]);

  const navigationItems = [
    { href: "/", label: "Dashboard", icon: BarChart3 },
    { href: "/activity", label: "Activity Feed", icon: Activity },
    { href: "/geospatial", label: "Geospatial Analysis", icon: MapPin },
    { href: "/field-guides", label: "Field Guides", icon: BookOpen },
    { href: "/species", label: "Species Analysis", icon: Dna },
    { href: "/temporal", label: "Temporal Trends", icon: TrendingUp },
    { href: "/taxonomic", label: "Taxonomic Analysis", icon: GitBranch },
    { href: "/conservation", label: "Conservation", icon: Shield },
    { href: "/contributors", label: "Contributors", icon: Users },
    { href: "/records", label: "Records", icon: Trophy },
  ];

  const adminItems = [
    { href: "/admin/validation", label: "Data Validation", icon: Database },
    { href: "/admin/biorecords", label: "BioRecord Management", icon: Microscope },
    { href: "/admin/upload", label: "Data Upload", icon: Upload },
    { href: "/admin/redlist", label: "Red List Management", icon: AlertTriangle },
    { href: "/admin/settings", label: "System Settings", icon: Settings },
  ];

  // Check if admin section should be expanded
  useEffect(() => {
    if (location.startsWith('/admin')) {
      setIsAdminExpanded(true);
    }
  }, [location]);

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
      <aside className={`hidden lg:flex bg-white shadow-sm border-r border-slate-200 flex-col relative z-10 transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center overflow-hidden">
                <Microscope className="w-6 h-6 text-primary" />
              </div>
              {!isCollapsed && (
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">MycoMap</h1>
                  <p className="text-sm text-slate-500">Research Dashboard</p>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2"
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 rotate-90" />}
            </Button>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'space-x-3 px-3'} py-2 rounded-lg font-medium w-full text-left ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </a>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-slate-200 space-y-2 bg-white">
          <Link href="/updates">
            <a className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'space-x-3 px-3'} py-2 rounded-lg font-medium w-full text-left ${
              location === "/updates" || location.startsWith("/updates")
                ? "bg-primary/10 text-primary"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title={isCollapsed ? "Updates Needed" : undefined}>
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span>Updates Needed</span>}
            </a>
          </Link>

          {/* Admin Section */}
          {!isCollapsed ? (
            <div className="space-y-1">
              <div className={`flex items-center justify-between w-full rounded-lg font-medium ${
                  location.startsWith('/admin')
                    ? "bg-primary/10 text-primary"
                    : "text-slate-600 hover:bg-slate-100"
                }`}>
                <Link href="/admin" className="flex-1">
                  <div className="flex items-center space-x-3 px-3 py-2">
                    <Settings className="w-5 h-5" />
                    <span>Admin</span>
                  </div>
                </Link>
                <button
                  onClick={() => setIsAdminExpanded(!isAdminExpanded)}
                  className="px-2 py-2 hover:bg-slate-200 rounded-r-lg"
                >
                  {isAdminExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              </div>
              
              {isAdminExpanded && (
                <div className="ml-6 space-y-1 bg-white">
                  {adminItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.href;
                    
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          className={`flex items-center space-x-3 px-3 py-2 rounded-lg font-medium w-full text-left text-sm cursor-pointer ${
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
              )}
            </div>
          ) : (
            <Link href="/admin">
              <a className={`flex items-center justify-center px-2 py-2 rounded-lg font-medium w-full text-left ${
                location.startsWith('/admin')
                  ? "bg-primary/10 text-primary"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              title="Admin">
                <Settings className="w-5 h-5 flex-shrink-0" />
              </a>
            </Link>
          )}
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
            <div className={`flex items-center justify-between w-full rounded-lg font-medium ${
                location.startsWith('/admin')
                  ? "bg-primary/10 text-primary"
                  : "text-slate-600 hover:bg-slate-100"
              }`}>
              <Link href="/admin" className="flex-1">
                <div className="flex items-center space-x-3 px-3 py-3">
                  <Settings className="w-5 h-5" />
                  <span>Admin</span>
                </div>
              </Link>
              <button
                onClick={() => setIsAdminExpanded(!isAdminExpanded)}
                className="px-2 py-3 hover:bg-slate-200 rounded-r-lg"
              >
                {isAdminExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
            
            {isAdminExpanded && (
              <div className="ml-6 space-y-1">
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href;
                  
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={`flex items-center space-x-3 px-3 py-3 rounded-lg font-medium w-full text-left text-sm cursor-pointer ${
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
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
