import { generate, ident, parse, walk } from "css-tree";
import type { CssNode } from "css-tree";
import { resourceUrl } from "./urls";

export interface CssResource {
  url: string;
  stylesheet: boolean;
}

export function rewriteOfflineCss(
  css: string,
  baseUrl: string,
  resolve: (resource: CssResource) => string,
  declarationList = false,
): string {
  const ast = parse(css, {
    context: declarationList ? "declarationList" : "stylesheet",
    parseCustomProperty: true,
    onParseError: (_error, fallback) => {
      // AO3's default CSS retains this IE-only gradient alongside modern fallbacks.
      const gradient =
        fallback.type === "Raw"
          ? /^progid:DXImageTransform\.Microsoft\.gradient\((.*)\)$/is.exec(fallback.value)
          : null;
      if (
        gradient &&
        gradient[1]
          .split(",")
          .every((part) =>
            /^(?:(?:startColorstr|endColorstr)\s*=\s*(['"])#[a-f\d]{6,8}\1|GradientType\s*=\s*[01])$/i.test(
              part.trim(),
            ),
          )
      )
        return;
      throw new Error("A stylesheet could not be saved completely.");
    },
  });
  const imports = new Set<CssNode>();
  const assetStrings = new Set<CssNode>();
  walk(ast, {
    visit: "Atrule",
    enter(node) {
      if (ident.decode(node.name).toLowerCase() !== "import") return;
      const first = node.prelude?.type === "AtrulePrelude" ? node.prelude.children.first : null;
      if (!first || (first.type !== "String" && first.type !== "Url")) {
        throw new Error("A stylesheet import could not be saved.");
      }
      imports.add(first);
    },
  });
  walk(ast, {
    visit: "Function",
    enter(node) {
      if (
        !["image-set", "-webkit-image-set", "src"].includes(ident.decode(node.name).toLowerCase())
      )
        return;
      node.children.forEach((child) => {
        if (child.type === "String") assetStrings.add(child);
      });
    },
  });
  walk(ast, (node) => {
    const stylesheet = imports.has(node);
    if (node.type !== "Url" && !(node.type === "String" && (stylesheet || assetStrings.has(node))))
      return;
    const value = node.value;
    if (!stylesheet && value.startsWith("#")) return;
    if (!stylesheet && /^data:(?:image\/(?:png|jpeg|gif|webp)|font\/[\w.+-]+);base64,/i.test(value))
      return;
    const url = resourceUrl(value, baseUrl);
    if (!url) throw new Error("A stylesheet resource uses an unsupported address.");
    node.value = resolve({ url, stylesheet });
  });
  return generate(ast);
}
