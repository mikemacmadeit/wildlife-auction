# Wildlife Auction - Next.js Project

A Next.js 14 application with TypeScript, Tailwind CSS, and shadcn/ui components.

## Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** 18.17 or later (recommended: 18.x or 20.x LTS)
- **npm** 9.x or later (comes with Node.js)

To check your versions:
```bash
node --version
npm --version
```

## Setup Instructions

### Quick Start

You can run commands from the root directory (recommended) or from the `project` directory:

**From root directory:**
```bash
npm install:project  # Install dependencies
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
```

**From project directory:**
```bash
cd project
npm install  # Install dependencies
npm run dev  # Start development server
npm run build  # Build for production
npm start    # Start production server
```

### 1. Install Dependencies

Install all required packages:

```bash
# From root directory (recommended)
npm install:project

# OR from project directory
cd project
npm install
```

This will install all dependencies listed in `project/package.json`, including:
- Next.js 14.2.5
- React 18.2.0
- TypeScript 5.2.2
- Tailwind CSS 3.3.3
- shadcn/ui components (Radix UI)
- And many other dependencies

**Note:** After installation, a postinstall script will automatically apply a patch to fix a known Next.js build ID generation bug. This patch is applied automatically and ensures the build process works correctly.

### 2. Run the Development Server

Start the development server (from root directory or project directory):

```bash
# From root directory
npm run dev

# OR from project directory
cd project
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

### 3. Build for Production

To create a production build:

```bash
# From root directory
npm run build

# OR from project directory
cd project
npm run build
```

To start the production server:

```bash
# From root directory
npm start

# OR from project directory
cd project
npm start
```

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Create a production build
- `npm start` - Start the production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking without emitting files

## Project Structure

```
project/
├── app/                  # Next.js 14 App Router directory
│   ├── globals.css      # Global styles with Tailwind CSS
│   ├── layout.tsx       # Root layout component
│   └── page.tsx         # Home page
├── components/          # React components
│   └── ui/             # shadcn/ui components
├── hooks/              # Custom React hooks
├── lib/                # Utility functions
│   └── utils.ts        # Helper functions (cn utility for Tailwind)
├── scripts/            # Build and utility scripts
│   └── patch-nextjs.js # Patch script for Next.js build ID bug
└── public/             # Static assets (create if needed)
```

## Netlify Production: Firebase Admin Credentials (IMPORTANT)

Netlify Functions are deployed to AWS Lambda and the **total environment variables per function are limited to ~4KB**.
Firebase service account JSON is typically larger than that, so **do not** provide it as a runtime env var.

**Recommended (reliable) setup:**
- In Netlify UI, add `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` as a **Build-only** environment variable (Sensitive).
- The Netlify build runs `scripts/netlify-write-firebase-service-account.mjs` which writes:
  - `netlify/secrets/firebase-service-account.json` (generated at build time; never committed)
- `netlify.toml` bundles that file into all functions via `functions."*".included_files`.
- Server code initializes Firebase Admin via `lib/firebase/admin.ts` and will prefer the bundled file.

**Fallback (if you don't want base64):**
- Provide `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` as runtime env vars.

## Technologies Used

- **Next.js 14.2.5** - React framework with App Router (upgraded from 13.5.1)
- **TypeScript 5.2.2** - Type safety
- **Tailwind CSS 3.3.3** - Utility-first CSS framework
- **shadcn/ui** - Beautiful UI components built with Radix UI
- **Radix UI** - Unstyled, accessible component primitives
- **React Hook Form** - Form handling
- **Zod** - Schema validation
- **date-fns** - Date utility library
- **lucide-react** - Icon library

## Configuration Files

- `next.config.js` - Next.js configuration
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `postcss.config.js` - PostCSS configuration
- `components.json` - shadcn/ui configuration

## Troubleshooting

### Issue: Build fails with "generate is not a function" error

This is a known issue with Next.js 13.5.x and 14.x. A patch script has been created to automatically fix this issue. The patch is applied automatically after `npm install` via the `postinstall` script.

If you still encounter this error:
1. Run the patch script manually:
   ```bash
   npm run postinstall
   ```
2. If the issue persists, manually delete `node_modules` and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Issue: Module not found errors

If you encounter module not found errors:
1. Delete `node_modules` folder and `package-lock.json`
2. Run `npm install` again

### Issue: TypeScript errors

Run type checking:
```bash
npm run typecheck
```

### Issue: Port 3000 already in use

If port 3000 is already in use, Next.js will automatically try the next available port (3001, 3002, etc.). You can also specify a custom port:

```bash
npm run dev -- -p 3001
```

### Issue: Other build errors

Clear the Next.js cache:
```bash
rm -rf .next
npm run build
```

On Windows PowerShell:
```powershell
Remove-Item -Recurse -Force .next
npm run build
```

## Environment Variables

If you need to use environment variables, create a `.env.local` file in the project root:

```env
# Example environment variables
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

Note: Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/)

## License

This project is private.
