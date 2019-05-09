# Rename Extensions Plugin

Rollup plugin to take modules from RollUp and rename their file extensions. Useful for when using `preserveModules`. The plugin will also parse
all modules code and rewrite imports/exports to match the new file name.

## Installation

```bash
npm i --save-dev @betit/rollup-plugin-rename-extensions
```

## Usage

As an example, heres how we can convert `.ts` `.vue` to `.js` and `.vue.js` respectively.

```js
import renameExtensions from '@betit/rollup-plugin-rename-extensions';

// Rollup Configuration
export default {
    input: './src/index.js',
    preserveModules: true,
    /* ... */
    plugins: [
        // ...
        renameExtensions({
            include: ['**/*.ts', '**/*.vue'],
            mappings: {
                '.vue': 'vue.js',
                '.ts': 'js',
            },
        })
    ],
},
```

## Options

```typescript
export interface IRenameExtensionsOptions {
    /**
     * Files to include
     */
    include?: Array<string | RegExp> | string | RegExp | null;

    /**
     * Files to explicitly exclude
     */
    exclude?: Array<string | RegExp> | string | RegExp | null;

    /**
     * Generate source maps for the transformations.
     */
    sourceMap?: boolean;

    /**
     * Object describing the transformations to use.
     * IE. Input Extension => Output Extensions.
     * Extensions should include the dot for both input and output.
     */
    mappings: Record<string, string>;
}
```