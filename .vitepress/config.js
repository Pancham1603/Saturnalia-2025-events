import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Saturnalia 2025',
  description: 'Official Documentation for Saturnalia 2025 - The Grand College Festival',
  ignoreDeadLinks: true,
  themeConfig: {
    logo: '/Asset 3@4x.png',
    siteTitle: false,
    nav: [
      { text: 'Cultural', link: '/cultural/' },
      { text: 'Technical', link: '/technical/' },
      { text: 'Policies', link: '/policies/' }
    ],
    sidebar: [
      {
        text: '🏠 Home',
        link: '/'
      },
      {
        text: '🎭 Cultural Events',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/cultural/' },
          { text: '🎵 Music', link: '/cultural/music' },
          { text: '🕺 Dance', link: '/cultural/dance' },
          { text: '📚 Literary', link: '/cultural/literary' },
          { text: '� Media', link: '/cultural/media' },
          { text: '🎨 Art and Design', link: '/cultural/art-and-design' },
          { text: '🎭 Drama', link: '/cultural/drama' },
          { text: '� Esports', link: '/cultural/esports' },
          { text: '👗 Fashion', link: '/cultural/fashion' },
          { text: '💼 Business', link: '/cultural/business' }
        ]
      },
      {
        text: '💻 Technical Events',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/technical/' },
          { text: '�️ Workshops', link: '/technical/workshops' },
          { text: '⚡ Hacks', link: '/technical/hacks' },
          { text: '🤖 Robotics', link: '/technical/robotics' },
          { text: '🏆 Competitions', link: '/technical/competitions' },
          { text: '🎮 Gaming', link: '/technical/gaming' }
        ]
      },
      {
        text: '📋 Policies & Guidelines',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/policies/' },
          { text: '💳 Payment Policy', link: '/policies/payment' },
          { text: '🔒 Privacy Policy', link: '/policies/privacy' },
          { text: '🏨 Accommodation', link: '/policies/accommodation' },
          { text: '↩️ Refund Policy', link: '/policies/refund' },
          { text: '⚖️ Code of Conduct', link: '/policies/conduct' },
          { text: '📜 Terms & Conditions', link: '/policies/terms' }
        ]
      },
      {
        text: '📞 Contact Us',
        link: '/contact'
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Pancham1603/Saturnalia-2025-events' },
      { icon: 'instagram', link: '#' },
      { icon: 'facebook', link: '#' }
    ],
    footer: {
      message: 'Built with VitePress for Saturnalia 2025',
      copyright: 'Copyright © 2025 Saturnalia Organizing Committee'
    },
    search: {
      provider: 'local'
    }
  },
  base: '/',
  outDir: 'dist',
  head: [
    // ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3c3c3c' }]
  ]
})
