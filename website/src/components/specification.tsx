import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import flow from "../../../FLOW.md?raw"
import openRtbUrl from "../../../OPENRTB.md?url"

export default function Specification() {
  return (
    <article className="prose-spec">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href === "OPENRTB.md" ? openRtbUrl : href}
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
        }}
      >
        {flow}
      </Markdown>
    </article>
  )
}
