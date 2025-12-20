import { Link, useLocation } from "wouter";
import { 
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
  BookOpen,
  Code,
  Lock,
  Leaf
} from "lucide-react";
import mycoMapLogo from "@assets/mycomap-logo.png";
import { Button } from "./button";
import { Input } from "./input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./dialog";
import { useState, useEffect } from "react";

export function Sidebar() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminExpanded, setIsAdminExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Auto-collapse on field guide pages (including species detail pages)
  useEffect(() => {
    const isFieldGuidePage = /^\/field-guides\/\d+(\/.*)?$/.test(location);
    setIsCollapsed(isFieldGuidePage);
  }, [location]);

  const navigationItems = [
    { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
    { href: "/activity", label: "Activity Feed", icon: Activity },
    { href: "/foraging-map", label: "Foraging Map", icon: Leaf },
    { href: "/geospatial", label: "Geospatial Analysis", icon: MapPin },
    { href: "/field-guides", label: "Field Guides", icon: BookOpen },
    { href: "/species", label: "Species Analysis", icon: Dna },
    { href: "/temporal", label: "Temporal Trends", icon: TrendingUp },
    { href: "/taxonomic", label: "Taxonomic Analysis", icon: GitBranch },
    { href: "/conservation", label: "Conservation", icon: Shield },
    { href: "/contributors", label: "Contributors", icon: Users },
    { href: "/records", label: "Records", icon: Trophy },
    { href: "/api-docs", label: "API Documentation", icon: Code },
  ];

  const adminItems = [
    { href: "/admin/validation", label: "Data Validation", icon: Database },
    { href: "/admin/biorecords", label: "BioRecord Management", icon: Dna },
    { href: "/admin/upload", label: "Data Upload", icon: Upload },
    { href: "/admin/redlist", label: "Red List Management", icon: AlertTriangle },
    { href: "/admin/settings", label: "System Settings", icon: Settings },
  ];

  // Check if admin section should be expanded
  useEffect(() => {
    if (location.startsWith('/admin')) {
      if (isAuthenticated) {
        setIsAdminExpanded(true);
      } else {
        // Redirect to dashboard if trying to access admin without auth
        window.location.href = '/';
      }
    }
  }, [location, isAuthenticated]);

  // Password authentication functions
  const handlePasswordSubmit = () => {
    if (password === "mycotalab") {
      setIsAuthenticated(true);
      setIsPasswordDialogOpen(false);
      setPassword("");
      setPasswordError("");
      setIsAdminExpanded(true);
    } else {
      setPasswordError("Incorrect password. Please try again.");
      setPassword("");
    }
  };

  const handleAdminAccess = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      setIsPasswordDialogOpen(true);
    } else {
      setIsAdminExpanded(!isAdminExpanded);
    }
  };

  const handleAdminLinkClick = (e: React.MouseEvent, href: string) => {
    if (!isAuthenticated) {
      e.preventDefault();
      setIsPasswordDialogOpen(true);
    } else {
      window.location.href = href;
    }
  };

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
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
            <img src={mycoMapLogo} alt="MycoMap" className="w-8 h-8 object-contain" />
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
              <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                <img src={mycoMapLogo} alt="MycoMap" className="w-10 h-10 object-contain" />
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
                <div
                  className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'space-x-3 px-3'} py-2 rounded-lg font-medium w-full text-left cursor-pointer ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-slate-200 space-y-2 bg-white">
          <Link href="/updates">
            <div className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'space-x-3 px-3'} py-2 rounded-lg font-medium w-full text-left cursor-pointer ${
              location === "/updates" || location.startsWith("/updates")
                ? "bg-primary/10 text-primary"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title={isCollapsed ? "Updates Needed" : undefined}>
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span>Updates Needed</span>}
            </div>
          </Link>

          {/* Admin Section - Protected */}
          {!isCollapsed ? (
            <div className="space-y-1">
              <div className={`flex items-center justify-between w-full rounded-lg font-medium ${
                  location.startsWith('/admin') && isAuthenticated
                    ? "bg-primary/10 text-primary"
                    : "text-slate-600 hover:bg-slate-100"
                }`}>
                <div className="flex-1" onClick={(e) => handleAdminLinkClick(e, '/admin')}>
                  <div className="flex items-center space-x-3 px-3 py-2 cursor-pointer">
                    <Settings className="w-5 h-5" />
                    <span>Admin</span>
                    {!isAuthenticated && <Lock className="w-4 h-4 ml-auto" />}
                  </div>
                </div>
                <button
                  onClick={handleAdminAccess}
                  className="px-2 py-2 hover:bg-slate-200 rounded-r-lg"
                >
                  {isAdminExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              </div>
              
              {isAdminExpanded && isAuthenticated && (
                <div className="ml-6 space-y-1 bg-white">
                  {adminItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.href;
                    
                    return (
                      <div key={item.href} onClick={(e) => handleAdminLinkClick(e, item.href)}>
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div onClick={(e) => handleAdminLinkClick(e, '/admin')}>
              <div className={`flex items-center justify-center px-2 py-2 rounded-lg font-medium w-full text-left cursor-pointer ${
                location.startsWith('/admin') && isAuthenticated
                  ? "bg-primary/10 text-primary"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              title="Admin">
                <Settings className="w-5 h-5 flex-shrink-0" />
                {!isAuthenticated && <Lock className="w-3 h-3 absolute bottom-1 right-1" />}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={`lg:hidden mobile-sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg border-r border-slate-200 flex flex-col z-[9999] transform transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={mycoMapLogo} alt="MycoMap" className="w-12 h-12 object-contain" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900">MycoMap Network</h1>
              <p className="text-xs text-slate-500">Research Dashboard</p>
            </div>
          </div>
        </div>
        
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          <nav className="p-4 space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center space-x-3 px-3 py-3 rounded-lg font-medium w-full text-left cursor-pointer ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
          
          <div className="p-4 border-t border-slate-200 space-y-2">
          <Link href="/updates">
            <div className={`flex items-center space-x-3 px-3 py-3 rounded-lg font-medium w-full text-left cursor-pointer ${
              location === "/updates" || location.startsWith("/updates")
                ? "bg-primary/10 text-primary"
                : "text-slate-600 hover:bg-slate-100"
            }`}>
              <AlertTriangle className="w-5 h-5" />
              <span>Updates Needed</span>
            </div>
          </Link>

          {/* Admin Section - Mobile Protected */}
          <div className="space-y-1">
            <div className={`flex items-center justify-between w-full rounded-lg font-medium ${
                location.startsWith('/admin') && isAuthenticated
                  ? "bg-primary/10 text-primary"
                  : "text-slate-600 hover:bg-slate-100"
              }`}>
              <div className="flex-1" onClick={(e) => handleAdminLinkClick(e, '/admin')}>
                <div className="flex items-center space-x-3 px-3 py-3 cursor-pointer">
                  <Settings className="w-5 h-5" />
                  <span>Admin</span>
                  {!isAuthenticated && <Lock className="w-4 h-4 ml-auto" />}
                </div>
              </div>
              <button
                onClick={handleAdminAccess}
                className="px-2 py-3 hover:bg-slate-200 rounded-r-lg"
              >
                {isAdminExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
            
            {isAdminExpanded && isAuthenticated && (
              <div className="ml-6 space-y-1">
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href;
                  
                  return (
                    <div key={item.href} onClick={(e) => handleAdminLinkClick(e, item.href)}>
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      </aside>

      {/* Password Protection Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Admin Access Required
            </DialogTitle>
            <DialogDescription>
              Please enter the admin password to access the admin panel and its features.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handlePasswordSubmit();
                  }
                }}
                placeholder="Enter admin password"
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-red-600">{passwordError}</p>
              )}
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsPasswordDialogOpen(false);
                  setPassword("");
                  setPasswordError("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handlePasswordSubmit}>
                Access Admin
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
