import { TrendingUp, Twitter, Linkedin, Youtube, MessageCircle } from 'lucide-react';

const footerLinks = {
  Product: ['Features', 'Stock Screener', 'Portfolios', 'Pricing', 'API'],
  Resources: ['Blog', 'Help Center', 'Documentation', 'Community', 'Webinars'],
  Company: ['About', 'Careers', 'Press', 'Partners', 'Contact'],
  Legal: ['Terms of Service', 'Privacy Policy', 'Cookie Policy', 'Disclaimer'],
};

const socialLinks = [
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
  { icon: Youtube, href: '#', label: 'YouTube' },
  { icon: MessageCircle, href: '#', label: 'Discord' },
];

export function Footer() {
  return (
    <footer className="bg-[#0a0a0a] border-t border-white/10">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <a href="#" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold to-gold-light flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-[#0a0a0a]" />
              </div>
              <span className="text-xl font-bold text-white">
                StockWise <span className="text-gold">Pro</span>
              </span>
            </a>
            <p className="text-white/50 text-sm mb-6 max-w-xs">
              Professional-grade stock analysis for everyone. Make smarter investment decisions
              with AI-powered insights.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/50 hover:bg-gold/20 hover:text-gold transition-colors"
                  aria-label={social.label}
                >
                  <social.icon size={18} />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-white font-semibold mb-4">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-white/50 text-sm hover:text-gold transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/40 text-sm">
            © 2026 StockWise Pro. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-white/40 text-sm hover:text-gold transition-colors">
              Terms
            </a>
            <a href="#" className="text-white/40 text-sm hover:text-gold transition-colors">
              Privacy
            </a>
            <a href="#" className="text-white/40 text-sm hover:text-gold transition-colors">
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
