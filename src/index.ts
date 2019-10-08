import { Plugin } from 'rollup';
import { createFilter } from 'rollup-pluginutils';
import MagicString from 'magic-string';
import { extname } from 'path';

// Parsing
import { parse, ParserPlugin } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import { Node, ImportDeclaration, CallExpression, ExportNamedDeclaration, ExportAllDeclaration, StringLiteral } from '@babel/types';

enum NodeType {
    Literal = 'StringLiteral',
    CallExpresssion = 'CallExpression',
    Identifier = 'Identifier',
    ImportDeclaration = 'ImportDeclaration',
    ExportNamedDeclaration = 'ExportNamedDeclaration',
    ExportAllDeclaration = 'ExportAllDeclaration',
}

const defaultPlugins: ParserPlugin[] = [
    'dynamicImport',
    'classProperties',
    'objectRestSpread',
];

export interface IRenameExtensionsOptions {
    /**
     * Files to include for potential renames.
     * Also denotes files of which may import a renamed module in
     * order to update their imports.
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
     * Babel plugins to use for parsing. Defaults to:
     * `dynamicImport`, `classProperties`, `objectRestSpread`
     *
     * For a full list visit https://babeljs.io/docs/en/babel-parser#plugins
     */
    parserPlugins?: ParserPlugin[];

    /**
     * Object describing the transformations to use.
     * IE. Input Extension => Output Extensions.
     * Extensions should include the dot for both input and output.
     */
    mappings: Record<string, string>;
}

function isEmpty(array: any[] | undefined) {
    return !array || array.length === 0;
}

function isLiteral(node: CallExpression['arguments'][0] | undefined | null): node is StringLiteral {
    return !!node && node.type === NodeType.Literal;
}

export function getRequireSource(node: CallExpression): StringLiteral | false {
    if (isEmpty(node.arguments)) {
        return false;
    }

    const args = node.arguments;
    const firstArg = args[0];

    if (!isLiteral(firstArg)) {
        return false;
    }

    const isRequire = node.callee.type === 'Identifier' && node.callee.name === 'require';

    if (node.callee.type === 'Import' || isRequire) {
        return firstArg;
    }

    return firstArg;
}

function getImportSource(node: ImportDeclaration): StringLiteral | false {
    if (node.type === NodeType.ImportDeclaration) {
        return node.source;
    }

    return false;
}

function getExportSource(node: ExportAllDeclaration | ExportNamedDeclaration): StringLiteral | false {
    if (!node.source || node.source.type !== NodeType.Literal) {
        return false;
    }

    return node.source;
}

function rewrite(
    input: string,
    extensions: Record<string, string>,
): string | false {
    const extension = extname(input);

    if (extensions.hasOwnProperty(extension)) {
        return `${input.slice(0, -extension.length)}${extensions[extension]}`;
    }

    return false;
}

export default function renameExtensions(
    options: IRenameExtensionsOptions,
): Plugin {
    const filter = createFilter(options.include, options.exclude);
    const sourceMaps = options.sourceMap !== false;
    return {
        name: 'rename-rollup',
        generateBundle(_, bundle) {
            const files = Object.entries<any>(bundle);

            for (const [key, file] of files) {
                if (!filter(file.facadeModuleId)) {
                    continue;
                }

                file.facadeModuleId =
                    rewrite(file.facadeModuleId, options.mappings) ||
                    file.facadeModuleId;
                file.fileName =
                    rewrite(file.fileName, options.mappings) || file.fileName;
                file.imports.map((imported: string) => {
                    if (!filter(imported)) {
                        return imported;
                    }

                    return rewrite(imported, options.mappings) || imported;
                });

                if (file.code) {
                    const magicString = new MagicString(file.code);
                    const ast = parse(file.code, {
                        sourceType: 'module',
                        plugins: options.parserPlugins || defaultPlugins,
                    });

                    const extract = (path: NodePath<Node>) => {
                        let req: StringLiteral | false = false;
                        if (path.isImportDeclaration()) {
                            req = getImportSource(path.node);
                        }

                        if (path.isCallExpression()) {
                            req = getRequireSource(path.node);
                        }

                        if (path.isExportAllDeclaration() || path.isExportNamedDeclaration()) {
                            req = getExportSource(path.node);
                        }

                        if (req) {
                            const { start, end } = req;

                            if (!start || !end) {
                                throw new Error('Error occurred when trying to get the start and end positions of imports.');
                            }

                            const newPath = rewrite(
                                req.value,
                                options.mappings,
                            );

                            if (newPath) {
                                magicString.overwrite(
                                    start,
                                    end,
                                    `'${newPath}'`,
                                );
                            }
                        }
                    };

                    traverse(ast, {
                        ImportDeclaration: extract,
                        CallExpression: extract,
                        ExportAllDeclaration: extract,
                        ExportNamedDeclaration: extract,
                    });

                    if (sourceMaps) {
                        file.map = magicString.generateMap();
                    }

                    file.code = magicString.toString();
                }

                delete bundle[key];
                bundle[rewrite(key, options.mappings) || key] = file;
            }
        },
    };
}
