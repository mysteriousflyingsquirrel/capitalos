# Vercel Deployment Notes

## Framework
**Vite** - Vercel should auto-detect this as a Vite project.

## Build Configuration
- **Build Command**: `npm run build` (runs `vite build`)
- **Output Directory**: `dist` (Vite's default output directory)

## Client-Side Routing
This app uses **React Router** for client-side routing. The `vercel.json` includes a rewrite rule to serve `index.html` for all routes (`/*`), ensuring that client-side routing works correctly.

## Environment Variables
If you need to add environment variables:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add any required variables (e.g., API keys, endpoints)
3. Redeploy after adding variables

## Notes
- The project uses Vite PWA plugin for Progressive Web App features
- All static assets (including the logo) are in the `public` folder and will be served correctly
- No additional build configuration needed - Vite handles everything automatically

