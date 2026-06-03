/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/components/**/*.{js,vue,ts}',
    './app/layouts/**/*.vue',
    './app/pages/**/*.vue',
    './app/plugins/**/*.{js,ts}',
    './app/app.vue',
    './app/error.vue',
  ],
  theme: {
    extend: {
      // Custom Colors - Matching the existing design tokens
      // Uses CSS variables for theme-aware colors (dark/light mode)
      colors: {
        // Background colors
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'bg-sidebar': 'var(--bg-sidebar)',
        'bg-header': 'var(--bg-header)',
        'bg-input': 'var(--bg-input)',
        'bg-hover': 'var(--bg-hover)',
        'bg-active': 'var(--bg-active)',

        // Border colors
        'border-default': 'var(--border-color)',
        'border-subtle': 'var(--border-subtle)',

        // Text colors
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'text-inverse': 'var(--text-inverse)',

        // Accent colors (static - same in both modes)
        'accent-orange': '#FF6C37',
        'accent-blue': '#007AFF',
        'accent-green': '#73BF69',
        'accent-yellow': '#FFCA28',
        'accent-red': '#EF5350',
        'accent-purple': '#AB47BC',

        // HTTP Method colors (static)
        'method-get': '#73BF69',
        'method-post': '#FFCA28',
        'method-put': '#64B5F6',
        'method-delete': '#EF5350',
        'method-patch': '#AB47BC',
        'method-head': '#8b5cf6',
        'method-options': '#64748b',

        // Status colors (aliases)
        'status-success': '#73BF69',
        'status-error': '#EF5350',
        'status-warning': '#FFCA28',
      },

      // Custom Font Families
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'SF Mono', 'Consolas', 'monospace'],
      },

      // Custom Font Sizes
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
      },

      // Custom Spacing
      spacing: {
        '1': '0.25rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '8': '2rem',
        'sidebar': '280px',
        'sidebar-mobile': '280px',
        'header': '48px',
        'header-mobile': '56px',
        'tab-bar': '40px',
        'bottom-nav': '64px',
      },

      // Custom Border Radius
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        '2xl': '16px',
      },

      // Custom Shadows
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
        'modal': '0 12px 48px rgba(0, 0, 0, 0.5)',
      },

      // Custom Transitions
      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
        'slow': '300ms',
      },

      // Custom Animations
      animation: {
        'spin-slow': 'spin 1s linear infinite',
        'fade-in': 'fadeIn 200ms ease',
        'slide-in': 'slideIn 200ms ease',
        'modal-enter': 'modalEnter 200ms ease',
        'slide-in-left': 'slideInLeft 250ms ease',
        'slide-out-left': 'slideOutLeft 250ms ease',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        modalEnter: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(-10px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideOutLeft: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },

      // Responsive breakpoints (mobile-first)
      screens: {
        'xs': '480px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },

      // Custom Width/Height
      width: {
        'modal-sm': '320px',
        'modal-md': '480px',
        'modal-lg': '640px',
        'modal-xl': '800px',
      },
      maxWidth: {
        'modal-sm': '320px',
        'modal-md': '480px',
        'modal-lg': '640px',
        'modal-xl': '800px',
      },

      // Z-index
      zIndex: {
        'modal': '100',
        'dropdown': '50',
        'tooltip': '60',
      },

      // Grid Template Columns
      gridTemplateColumns: {
        'content': '1fr 380px',
        'info': 'repeat(3, 1fr)',
      },
    },
  },
  plugins: [],
}
