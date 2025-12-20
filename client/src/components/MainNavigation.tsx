import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Menu, X, ChevronDown, User, LogIn, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logoPath from "@assets/MycoMapLogo-3-e1715694201164-600x822_1766262277087.png";

interface NavigationLink {
  id: number;
  label: string;
  href: string;
  icon: string;
  requiresAuth: boolean;
  requiresSubscription: boolean;
  isVisible: boolean;
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

  const { data: navLinks = [] } = useQuery<NavigationLink[]>({
    queryKey: ["/api/cms/navigation"],
  });

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const isAuthenticated = !!user;
  const hasActiveSubscription = user?.subscriptionStatus === "active" || user?.subscriptionStatus === "trial";

  const publicLinks = navLinks.filter(link => 
    link.isVisible && 
    !link.requiresAuth && 
    !link.requiresSubscription
  );

  const isActive = (href: string) => {
    if (href === '/') return location === '/';
    return location.startsWith(href);
  };

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

            <nav className="hidden md:flex items-center gap-1" data-testid="nav-desktop">
              {publicLinks.map((link) => (
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
              ))}
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
                <DropdownMenuContent align="end" className="w-48">
                  {hasActiveSubscription && (
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer">
                        <LayoutDashboard className="h-4 w-4" />
                        Research Dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <a 
                      href="/api/auth/logout" 
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
                <a href="/api/auth/login" className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Sign In
                </a>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-gray-100" data-testid="nav-mobile">
            <div className="flex flex-col gap-1">
              {publicLinks.map((link) => (
                <Link 
                  key={link.id}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  data-testid={`link-mobile-nav-${link.href.slice(1) || 'home'}`}
                >
                  <span className={`block px-3 py-2 rounded-md text-sm font-medium ${
                    isActive(link.href) 
                      ? 'bg-myco-green/10 text-myco-green' 
                      : 'text-gray-700 hover:text-myco-green hover:bg-myco-green/5'
                  }`}>
                    {link.label}
                  </span>
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
