import { Link, useLocation } from "wouter";
import { 
  BarChart3, 
  Database,
  Dna, 
  Settings,
  Menu,
  X,
  AlertTriangle,
  Upload,
  ChevronDown,
  ChevronRight,
  Leaf,
  Home,
  Package,
  FlaskConical,
  Archive,
  Terminal
} from "lucide-react";
import mycoMapLogo from "@assets/mycomap-logo.png";
import { Button } from "./ui/button";
import { useState, useEffect } from "react";

export function AdminSidebar() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);

  const mainNavItems = [
    { href: "/admin", label: "Admin Dashboard", icon: BarChart3 },
    { href: "/dashboard", label: "Research Dashboard", icon: Home },
  ];

  const dataManagementItems = [
    { href: "/admin/upload", label: "Data Upload", icon: Upload },
    { href: "/admin/redlist", label: "Red List Management", icon: AlertTriangle },
    { href: "/admin/foraging-lists", label: "Foraging Lists", icon: Leaf },
  ];

  const labManagementItems = [
    { href: "/admin/shipments", label: "Pending Shipments", icon: Package },
    { href: "/admin/runs", label: "Lab Runs", icon: FlaskConical },
    { href: "/admin/bioinformatics", label: "Bioinformatics", icon: Terminal },
  ];

  const archiveItems = [
    { href: "/admin/validation", label: "Data Validation", icon: Database },
    { href: "/admin/biorecords", label: "BioRecord Management", icon: Dna },
  ];

  useEffect(() => {
    if (location.startsWith('/admin/validation') || location.startsWith('/admin/biorecords')) {
      setIsArchiveExpanded(true);
    }
  }, [location]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

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

  const renderNavItem = (item: { href: string; label: string; icon: any }) => {
    const Icon = item.icon;
    const isActive = location === item.href || (item.href !== '/admin' && location.startsWith(item.href));
    
    return (
      <Link key={item.href} href={item.href}>
        <div
          className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
            isActive
              ? "bg-[#8CBD45]/10 text-[#8CBD45] border-l-4 border-[#8CBD45]"
              : "text-slate-600 hover:bg-slate-100"
          }`}
          data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{item.label}</span>
        </div>
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-200">
        <Link href="/admin">
          <div className="flex items-center space-x-3 cursor-pointer">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={mycoMapLogo} alt="MycoMap" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#A87146]">MycoMap Admin</h1>
              <p className="text-xs text-slate-500">Administration Panel</p>
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {mainNavItems.map(renderNavItem)}

        <div className="pt-4">
          <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Lab Management
          </p>
        </div>
        {labManagementItems.map(renderNavItem)}

        <div className="pt-4">
          <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Data Management
          </p>
        </div>
        {dataManagementItems.map(renderNavItem)}

        <div className="pt-4">
          <button
            onClick={() => setIsArchiveExpanded(!isArchiveExpanded)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
              archiveItems.some(item => location.startsWith(item.href))
                ? "bg-[#A87146]/10 text-[#A87146]"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            data-testid="nav-archive-toggle"
          >
            <div className="flex items-center space-x-3">
              <Archive className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">Archive</span>
            </div>
            {isArchiveExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {isArchiveExpanded && (
            <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 pl-2">
              {archiveItems.map(renderNavItem)}
            </div>
          )}
        </div>

        <div className="pt-2">
          {renderNavItem({ href: "/admin/settings", label: "System Settings", icon: Settings })}
        </div>
      </nav>

      <div className="p-4 border-t border-slate-200">
        <div className="text-xs text-slate-400 text-center">
          MycoMap Admin v1.0
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
            <img src={mycoMapLogo} alt="MycoMap" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#A87146]">MycoMap Admin</h1>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mobile-menu-button p-2"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          data-testid="button-mobile-menu"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside 
        className={`mobile-sidebar lg:hidden fixed left-0 top-0 h-full w-72 bg-white z-50 transform transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col flex-shrink-0">
        {sidebarContent}
      </aside>
    </>
  );
}
