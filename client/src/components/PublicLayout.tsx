import { MainNavigation } from "./MainNavigation";
import { Link } from "wouter";
import { Mail, MapPin, ArrowUpRight, Leaf, Twitter, Facebook, Instagram } from "lucide-react";
import logoPath from "@assets/MycoMapLogo-3-e1715694201164-600x822_1766262277087.png";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <MainNavigation />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="relative overflow-hidden" data-testid="footer">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-myco-green to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#8a5c3a] to-myco-brown" />
      <div className="absolute inset-0 opacity-5">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="footerPattern" patternUnits="userSpaceOnUse" width="30" height="30">
              <circle cx="15" cy="15" r="8" fill="none" stroke="white" strokeWidth="0.3"/>
              <path d="M15,7 Q20,15 15,23" fill="none" stroke="white" strokeWidth="0.2"/>
              <path d="M7,15 Q15,10 23,15" fill="none" stroke="white" strokeWidth="0.2"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#footerPattern)"/>
        </svg>
      </div>
      
      <div className="relative z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
            <div className="lg:col-span-1">
              <div className="flex items-center gap-3 mb-6">
                <img src={logoPath} alt="MycoMap Logo" className="h-12 w-auto brightness-0 invert" />
                <span className="text-xl font-bold text-white">MycoMap</span>
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-6">
                Advancing mycological research through community science, DNA sequencing, and habitat certification. Join our network of researchers and enthusiasts.
              </p>
              <div className="flex items-center gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 hover:bg-myco-green flex items-center justify-center transition-colors" aria-label="Twitter">
                  <Twitter className="h-5 w-5 text-white" />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 hover:bg-myco-green flex items-center justify-center transition-colors" aria-label="Facebook">
                  <Facebook className="h-5 w-5 text-white" />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 hover:bg-myco-green flex items-center justify-center transition-colors" aria-label="Instagram">
                  <Instagram className="h-5 w-5 text-white" />
                </a>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-6 flex items-center gap-2">
                <Leaf className="h-4 w-4 text-myco-green" />
                Programs
              </h4>
              <ul className="space-y-3">
                <li>
                  <Link href="/network" className="text-white/70 hover:text-myco-green transition-colors text-sm flex items-center gap-1 group">
                    Free Sequencing
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
                <li>
                  <Link href="/mycoblitz" className="text-white/70 hover:text-myco-green transition-colors text-sm flex items-center gap-1 group">
                    Continental MycoBlitz
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
                <li>
                  <Link href="/habitat" className="text-white/70 hover:text-myco-green transition-colors text-sm flex items-center gap-1 group">
                    Certified Habitat
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-6">Resources</h4>
              <ul className="space-y-3">
                <li>
                  <Link href="/protocols" className="text-white/70 hover:text-myco-green transition-colors text-sm flex items-center gap-1 group">
                    Participation Protocols
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
                <li>
                  <Link href="/api-docs" className="text-white/70 hover:text-myco-green transition-colors text-sm flex items-center gap-1 group">
                    API Documentation
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="text-white/70 hover:text-myco-green transition-colors text-sm flex items-center gap-1 group">
                    Research Dashboard
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-6">Connect</h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Mail className="h-4 w-4 text-myco-green" />
                  </div>
                  <div>
                    <div className="text-white/50 text-xs uppercase tracking-wider mb-1">Email</div>
                    <a href="mailto:info@mycomap.org" className="text-white/90 hover:text-myco-green transition-colors text-sm">
                      info@mycomap.org
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="h-4 w-4 text-myco-green" />
                  </div>
                  <div>
                    <div className="text-white/50 text-xs uppercase tracking-wider mb-1">Based In</div>
                    <span className="text-white/90 text-sm">North America</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="border-t border-white/10">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-white/50 text-sm">
                &copy; {new Date().getFullYear()} MycoMap.org. All rights reserved.
              </p>
              <div className="flex items-center gap-6 text-sm text-white/50">
                <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
                <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
