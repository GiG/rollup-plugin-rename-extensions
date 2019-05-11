import { Plugin } from 'rollup';
import { createFilter } from 'rollup-pluginutils';
// @ts-ignore No typings.
import { simple } from 'acorn-walk';
import MagicString from 'magic-string';
import { extname } from 'path';

interface INode {
    start: number;
    end: number;
    type: NodeType;
    [additional: string]: any;
}

enum NodeType {
    Literal = 'Literal',
    CallExpresssion = 'CallExpression',
    Identifier = 'Identifier',
    ImportDeclaration = 'ImportDeclaration',
    ExportNamedDeclaration = 'ExportNamedDeclaration',
    ExportAllDeclaration = 'ExportAllDeclaration',
}

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

export function isEmpty(array: any[] | undefined) {
    return !array || array.length === 0;
}

export function getRequireSource(node: INode): INode | false {
    if (node.type !== NodeType.CallExpresssion) {
        return false;
    }

    if (node.callee.type !== NodeType.Identifier || isEmpty(node.arguments)) {
        return false;
    }

    const args = node.arguments;

    if (node.callee.name !== 'require' || args[0].type !== NodeType.Literal) {
        return false;
    }

    return args[0];
}

export function getImportSource(node: INode): INode | false {
    if (
        node.type !== NodeType.ImportDeclaration ||
        node.source.type !== NodeType.Literal
    ) {
        return false;
    }

    return node.source;
}

export function getExportSource(node: INode): INode | false {
    const exportNodes = [NodeType.ExportAllDeclaration, NodeType.ExportNamedDeclaration];

    if (!exportNodes.includes(node.type) || !node.source ||
        node.source.type !== NodeType.Literal) {
        return false;
    }

    return node.source;
}

export function rewrite(
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
                    const ast = this.parse(file.code, {
                        ecmaVersion: 6,
                        sourceType: 'module',
                    });

                    const extract = (node: INode) => {
                        const req =
                            getRequireSource(node) || getImportSource(node) || getExportSource(node);

                        if (req) {
                            const { start, end } = req;
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

                    simple(ast, {
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
