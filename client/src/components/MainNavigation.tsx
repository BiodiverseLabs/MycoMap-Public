import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Menu, X, ChevronDown, User, LogIn, LogOut, LayoutDashboard, Settings, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import logoPath from "@assets/MycoMapLogo-3-e1715694201164-600x822_1766262277087.png";

interface NavigationLink {
  id: number;
  label: string;
  href: string;
  parentId: number | null;
  icon: string;
  requiresAuth: boolean;
  requiresSubscription: boolean;
  isVisible: boolean;
  sortOrder: number;
}

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  subscriptionStatus: string;
}

export function MainNavigation() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: navLinks = [] } = useQuery<NavigationLink[]>({
    queryKey: ["/api/cms/navigation"],
  });

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const isAuthenticated = !!user;
  const hasActiveSubscription = user?.subscriptionStatus === "active" || user?.subscriptionStatus === "trial";

  const topLevelLinks = navLinks.filter(link => 
    link.isVisible && 
    link.parentId === null &&
    !link.requiresAuth
  );

  const getChildren = (parentId: number) => 
    navLinks.filter(link => link.parentId === parentId && link.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const isActive = (href: string) => {
    if (href === '/') return location === '/';
    if (href === '#') return false;
    return location.startsWith(href);
  };

  const handleMouseEnter = (id: number) => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
    }
    setOpenDropdown(id);
  };

  const handleMouseLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (dropdownTimeoutRef.current) {
        clearTimeout(dropdownTimeoutRef.current);
      }
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-myco-brown/10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80" data-testid="main-navigation">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3" data-testid="link-home-logo">
              <img 
                src={logoPath} 
                alt="MycoMap Logo" 
                className="h-10 w-auto"
                data-testid="img-logo"
              />
              <span className="hidden sm:block text-xl font-semibold text-myco-brown">
                MycoMap
              </span>
            </Link>

            <nav className="hidden lg:flex items-center gap-1" data-testid="nav-desktop">
              {topLevelLinks.map((link) => {
                const children = getChildren(link.id);
                const hasChildren = children.length > 0;

                if (hasChildren) {
                  return (
                    <div 
                      key={link.id}
                      className="relative"
                      onMouseEnter={() => handleMouseEnter(link.id)}
                      onMouseLeave={handleMouseLeave}
                    >
                      <button
                        className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive(link.href) || children.some(c => isActive(c.href))
                            ? 'bg-myco-green/10 text-myco-green' 
                            : 'text-gray-700 hover:text-myco-green hover:bg-myco-green/5'
                        }`}
                        data-testid={`link-nav-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {link.label}
                        <ChevronDown className={`h-4 w-4 transition-transform ${openDropdown === link.id ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {openDropdown === link.id && (
                        <div 
                          className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-50"
                          onMouseEnter={() => handleMouseEnter(link.id)}
                          onMouseLeave={handleMouseLeave}
                        >
                          {children.map((child) => (
                            <Link 
                              key={child.id}
                              href={child.href}
                              data-testid={`link-nav-${child.href.slice(1).replace(/\//g, '-') || 'home'}`}
                            >
                              <span className={`block px-4 py-2 text-sm transition-colors ${
                                isActive(child.href) 
                                  ? 'bg-myco-green/10 text-myco-green' 
                                  : 'text-gray-700 hover:text-myco-green hover:bg-myco-green/5'
                              }`}>
                                {child.label}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link 
                    key={link.id}
                    href={link.href}
                    data-testid={`link-nav-${link.href.slice(1) || 'home'}`}
                  >
                    <span className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive(link.href) 
                        ? 'bg-myco-green/10 text-myco-green' 
                        : 'text-gray-700 hover:text-myco-green hover:bg-myco-green/5'
                    }`}>
                      {link.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="flex items-center gap-2"
                    data-testid="button-user-menu"
                  >
                    <User className="h-5 w-5" />
                    <span className="hidden sm:block">{user.username}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center gap-2 cursor-pointer" data-testid="link-profile">
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile?tab=settings" className="flex items-center gap-2 cursor-pointer" data-testid="link-account-settings">
                      <Settings className="h-4 w-4" />
                      Account Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile?tab=specimens" className="flex items-center gap-2 cursor-pointer" data-testid="link-specimen-submission">
                      <FlaskConical className="h-4 w-4" />
                      Specimen Submission
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer" data-testid="link-dashboard">
                      <LayoutDashboard className="h-4 w-4" />
                      Research Dashboard
                    </Link>
                  </DropdownMenuItem>
                  {user.role === 'admin' && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin/shipments" className="flex items-center gap-2 cursor-pointer" data-testid="link-admin-dashboard">
                        <Settings className="h-4 w-4" />
                        Admin Dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a 
                      href="/api/logout" 
                      className="flex items-center gap-2 cursor-pointer"
                      data-testid="button-logout"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button 
                asChild 
                className="bg-myco-green hover:bg-myco-green/90 text-white"
                data-testid="button-signin"
              >
                <a href="/api/login" className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Sign In
                </a>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <MobileNav 
            links={topLevelLinks} 
            getChildren={getChildren} 
            isActive={isActive}
            onClose={() => setIsMobileMenuOpen(false)}
          />
        )}
      </div>
    </header>
  );
}

interface MobileNavProps {
  links: NavigationLink[];
  getChildren: (parentId: number) => NavigationLink[];
  isActive: (href: string) => boolean;
  onClose: () => void;
}

function MobileNav({ links, getChildren, isActive, onClose }: MobileNavProps) {
  const [expandedItems, setExpandedItems] = useState<number[]>([]);

  const toggleExpand = (id: number) => {
    setExpandedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <nav className="lg:hidden py-4 border-t border-gray-100" data-testid="nav-mobile">
      <div className="flex flex-col gap-1">
        {links.map((link) => {
          const children = getChildren(link.id);
          const hasChildren = children.length > 0;
          const isExpanded = expandedItems.includes(link.id);

          return (
            <div key={link.id}>
              {hasChildren ? (
                <>
                  <button
                    onClick={() => toggleExpand(link.id)}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-md text-sm font-medium ${
                      children.some(c => isActive(c.href))
                        ? 'bg-myco-green/10 text-myco-green' 
                        : 'text-gray-700'
                    }`}
                  >
                    {link.label}
                    <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-1 border-l-2 border-myco-green/20 pl-3">
                      {children.map((child) => (
                        <Link 
                          key={child.id}
                          href={child.href}
                          onClick={onClose}
                        >
                          <span className={`block px-3 py-2 rounded-md text-sm ${
                            isActive(child.href) 
                              ? 'bg-myco-green/10 text-myco-green font-medium' 
                              : 'text-gray-600 hover:text-myco-green'
                          }`}>
                            {child.label}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Link 
                  href={link.href}
                  onClick={onClose}
                >
                  <span className={`block px-3 py-2 rounded-md text-sm font-medium ${
                    isActive(link.href) 
                      ? 'bg-myco-green/10 text-myco-green' 
                      : 'text-gray-700 hover:text-myco-green hover:bg-myco-green/5'
                  }`}>
                    {link.label}
                  </span>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
