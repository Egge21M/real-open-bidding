import { Children, createElement, isValidElement } from "react"
import type { ComponentProps, ReactNode } from "react"
import Markdown from "react-markdown"
import type { ExtraProps } from "react-markdown"
import remarkGfm from "remark-gfm"
import flow from "../../../../FLOW.md?raw"

const references = import.meta.glob<string>(
  [
    "../../../../*.md",
    "!../../../../AGENTS.md",
    "!../../../../README.md",
    "../../../../docs/adr/*.md",
    "../../../../docs/agents/domain.md",
  ],
  { query: "?url", import: "default", eager: true }
)

function headingText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? headingText(child.props.children)
        : String(child)
    )
    .join("")
}

function Heading({
  children,
  node,
  ...props
}: ComponentProps<"h2"> & ExtraProps) {
  const id = headingText(children)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/ /g, "-")

  return createElement(node?.tagName ?? "h2", { ...props, id }, children)
}

export default function Specification() {
  return (
    <article className="prose-spec">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const [path, fragment] = (href ?? "").split("#", 2)
            if ((!path || path === "FLOW.md") && fragment) {
              return <a href={`#${fragment}`}>{children}</a>
            }

            const referenceUrl = references[`../../../../${path}`]
            return referenceUrl ? (
              <a
                href={referenceUrl}
                download={path.split("/").at(-1)}
                title={`Download ${path}`}
              >
                {children}
              </a>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          },
          h1: Heading,
          h2: Heading,
          h3: Heading,
          h4: Heading,
          h5: Heading,
          h6: Heading,
          pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
        }}
      >
        {flow}
      </Markdown>
    </article>
  )
}
