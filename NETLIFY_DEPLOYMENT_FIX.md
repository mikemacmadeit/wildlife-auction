# Netlify Deployment Fix - 4KB Environment Variable Limit

## Problem
Netlify functions have a 4KB limit on environment variables. When you have many environment variables (like Firebase keys, API keys, etc.), they can exceed this limit and cause deployment failures.

## Solution
We're using `netlify-plugin-inline-functions-env` to inline environment variables directly into function code at build time, bypassing the Lambda limit.

## Configuration

### 1. Plugin Installation
The plugin is already added to `package.json` as a dev dependency:
```json
"devDependencies": {
  "netlify-plugin-inline-functions-env": "^1.0.0"
}
```

### 2. Netlify Configuration
The plugin is configured in `netlify.toml` and **must run BEFORE** the Next.js plugin:

```toml
# Inline plugin runs first
[[plugins]]
package = "netlify-plugin-inline-functions-env"
  [plugins.inputs]
  include = "*"
  exclude = ""

# Next.js plugin runs after
[[plugins]]
package = "@netlify/plugin-nextjs"
```

## How It Works

1. **Build Time**: The plugin processes all function files
2. **Inlining**: Environment variables are embedded directly into the function code
3. **Deployment**: Functions are deployed without env vars, bypassing the 4KB limit

## Important Notes

- **Plugin Order Matters**: The inline plugin MUST run before `@netlify/plugin-nextjs`
- **Security**: Variables are still secure - they're in the function code, not exposed to the client
- **Build Time Only**: Variables are inlined at build time, not runtime
- **All Variables**: By default, all environment variables are inlined (you can exclude specific ones if needed)

## Troubleshooting

If deployment still fails:

1. **Check Plugin Order**: Ensure inline plugin is listed BEFORE Next.js plugin in `netlify.toml`
2. **Verify Installation**: Run `npm install` to ensure the plugin is installed
3. **Check Logs**: Look for "Processed X function file(s)" in the build logs
4. **Reduce Variables**: If still failing, consider excluding non-essential variables:
   ```toml
   [plugins.inputs]
   exclude = "NON_ESSENTIAL_VAR1,NON_ESSENTIAL_VAR2"
   ```

## Alternative Solutions

If the plugin doesn't work:

1. **Reduce Environment Variables**: Remove unused variables from Netlify dashboard
2. **Use Secrets Manager**: Store large secrets in AWS Secrets Manager (requires custom setup)
3. **Split Functions**: Break large functions into smaller ones with fewer env vars
4. **Use Netlify Edge Functions**: Edge functions have different limits (but different runtime)

## References

- [Plugin Documentation](https://github.com/netlify/plugins/tree/main/packages/netlify-plugin-inline-functions-env)
- [Netlify Functions Limits](https://docs.netlify.com/functions/overview/#limitations)
