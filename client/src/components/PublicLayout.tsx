import { MainNavigation } from "./MainNavigation";
import { Link } from "wouter";

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
    <footer className="bg-myco-brown text-white py-12" data-testid="footer">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-semibold text-lg mb-4">MycoMap</h3>
            <p className="text-white/80 text-sm">
              Advancing mycological research through community science, DNA sequencing, and habitat certification.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Programs</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li><Link href="/network" className="hover:text-myco-green transition-colors">Free Sequencing</Link></li>
              <li><Link href="/mycoblitz" className="hover:text-myco-green transition-colors">Continental MycoBlitz</Link></li>
              <li><Link href="/habitat" className="hover:text-myco-green transition-colors">Certified Habitat</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li><Link href="/protocols" className="hover:text-myco-green transition-colors">Participation Protocols</Link></li>
              <li><Link href="/api-docs" className="hover:text-myco-green transition-colors">API Documentation</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Connect</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li><a href="mailto:info@mycomap.org" className="hover:text-myco-green transition-colors">info@mycomap.org</a></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-white/20 text-center text-sm text-white/60">
          <p>&copy; {new Date().getFullYear()} MycoMap.org. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
