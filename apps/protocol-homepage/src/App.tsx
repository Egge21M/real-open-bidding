import { lazy, Suspense, useEffect, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Code2,
  Eye,
  FileText,
  Globe2,
  Info,
  LockKeyhole,
  Menu,
  Radio,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Mark, ProtocolArtwork } from "@/components/protocol-artwork"
import { FlowExplorer } from "@/components/flow-explorer"
import { participants, trustQuestions } from "@/protocol"
import flowUrl from "../../../FLOW.md?url"
import nostrUrl from "../../../NOSTR.md?url"
import openRtbUrl from "../../../OPENRTB.md?url"

const Specification = lazy(() => import("@/components/specification"))

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [specOpen, setSpecOpen] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const elements = pageRef.current?.querySelectorAll("[data-reveal]")
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed")
            observer.unobserve(entry.target)
          }
        }),
      { threshold: 0.08 }
    )
    elements?.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  const navItems = [
    ["The protocol", "#protocol"],
    ["How it works", "#how-it-works"],
    ["Trust model", "#trust-model"],
  ]

  return (
    <Dialog open={specOpen} onOpenChange={setSpecOpen}>
      <div ref={pageRef}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="header-inner">
            <a className="brand" href="#" aria-label="Real Open Bidding home">
              <Mark />
              <span>
                real open bidding<span className="brand-period">.</span>
              </span>
            </a>
            <nav className="desktop-nav" aria-label="Main navigation">
              {navItems.map(([label, href]) => (
                <a href={href} key={href}>
                  {label}
                </a>
              ))}
            </nav>
            <div className="header-actions">
              <DialogTrigger asChild>
                <Button variant="outline" className="min-h-10 px-4">
                  Read the spec
                  <ArrowUpRight data-icon="inline-end" />
                </Button>
              </DialogTrigger>
              <Button
                variant="ghost"
                size="icon-lg"
                className="mobile-menu-toggle"
                aria-label={menuOpen ? "Close navigation" : "Open navigation"}
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <X /> : <Menu />}
              </Button>
            </div>
          </div>
          {menuOpen && (
            <nav
              className="mobile-nav"
              id="mobile-nav"
              aria-label="Mobile navigation"
            >
              {navItems.map(([label, href]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                  {label}
                  <ArrowUpRight />
                </a>
              ))}
            </nav>
          )}
        </header>

        <main id="main">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-inner">
              <div className="hero-copy">
                <div className="hero-kicker">
                  <span className="status-dot" />
                  <span className="eyebrow">
                    An open protocol for advertising
                  </span>
                  <Badge variant="outline">Draft</Badge>
                </div>
                <h1 id="hero-title">
                  Real Open
                  <br />
                  Bidding<span className="accent-text">.</span>
                </h1>
                <p className="hero-promise">
                  Open opportunity.
                  <br />
                  Prepaid by design.
                </p>
                <p className="hero-description">
                  Decentralised real-time bidding on Nostr and Cashu. Open
                  discovery, publisher-run auctions, and publisher payments
                  requiring two signatures.
                </p>
                <div className="hero-actions">
                  <Button asChild size="lg" className="min-h-12 px-5">
                    <a href="#how-it-works">
                      Explore the protocol
                      <ArrowDown data-icon="inline-end" />
                    </a>
                  </Button>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="lg" className="min-h-12 px-4">
                      Read the specification
                      <ArrowUpRight data-icon="inline-end" />
                    </Button>
                  </DialogTrigger>
                </div>
              </div>
              <ProtocolArtwork />
            </div>
            <div className="hero-footer">
              <span className="eyebrow">Built on open foundations</span>
              <div>
                <span>
                  <Radio />
                  Nostr
                </span>
                <span>
                  <Wallet />
                  Cashu
                </span>
                <span className="openrtb-label">OpenRTB-inspired</span>
              </div>
              <a href="#protocol" aria-label="Scroll to the protocol">
                <ArrowDown />
              </a>
            </div>
          </section>

          <section className="section intro-section" id="protocol" data-reveal>
            <div className="section-label">
              <span className="eyebrow">01 / The idea</span>
              <span className="small-cross">+</span>
            </div>
            <div className="intro-content">
              <h2>
                A shared protocol.
                <br />
                An open market.
              </h2>
              <p>
                Advertising opportunities travel over an open network. Bidders
                bring the creative and the funds. Publishers keep control of the
                auction.
              </p>
              <div className="principles">
                <div>
                  <span className="eyebrow">01</span>
                  <h3>Discover openly.</h3>
                  <p>
                    Publish once to Nostr. Reach bidders listening across the
                    network.
                  </p>
                </div>
                <div>
                  <span className="eyebrow">02</span>
                  <h3>Commit upfront.</h3>
                  <p>
                    Bind the original creative to prepaid, locked Cashu ecash.
                  </p>
                </div>
                <div>
                  <span className="eyebrow">03</span>
                  <h3>Authorize together.</h3>
                  <p>
                    Publisher and oracle signatures are both required to claim
                    payment.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="flow-section" id="how-it-works">
            <div className="section" data-reveal>
              <div className="section-label">
                <span className="eyebrow">
                  02 / From opportunity to payment
                </span>
                <Badge variant="outline">Settlement + refunds</Badge>
              </div>
              <div className="section-heading">
                <h2>Follow the flow.</h2>
                <p>
                  One bid, from an open request
                  <br />
                  to a jointly authorized payment.
                </p>
              </div>
              <FlowExplorer />
            </div>
          </section>

          <section
            className="section participants-section"
            id="participants"
            data-reveal
          >
            <div className="section-label">
              <span className="eyebrow">03 / The participants</span>
              <span className="small-cross">+</span>
            </div>
            <div className="section-heading">
              <h2>
                Distinct roles.
                <br />
                Connected by design.
              </h2>
              <p>
                Each participant has a specific job.
                <br />
                No single actor controls the whole flow.
              </p>
            </div>
            <Tabs defaultValue="Publisher" className="mt-12">
              <TabsList
                variant="line"
                className="max-w-full gap-5 overflow-x-auto"
                aria-label="Participant roles"
              >
                {participants.map(({ name }) => (
                  <TabsTrigger
                    value={name}
                    key={name}
                    className="min-h-12 px-3"
                  >
                    {name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {participants.map(
                ({
                  name,
                  icon: Icon,
                  subtitle,
                  copy,
                  responsibility,
                  boundary,
                }) => (
                  <TabsContent value={name} key={name} className="mt-10">
                    <div className="participant-content">
                      <div className="participant-symbol">
                        <Icon strokeWidth={1} />
                        <span className="eyebrow">{name}</span>
                      </div>
                      <div>
                        <h3>{subtitle}</h3>
                        <p>{copy}</p>
                        <div className="role-responsibility">
                          <Check />
                          <span>{responsibility}</span>
                        </div>
                        <p className="role-boundary">{boundary}</p>
                      </div>
                    </div>
                  </TabsContent>
                )
              )}
            </Tabs>
          </section>

          <section className="trust-section" id="trust-model">
            <div className="section" data-reveal>
              <div className="section-label">
                <span className="eyebrow">04 / The trust model</span>
                <ShieldCheck />
              </div>
              <div className="trust-layout">
                <div>
                  <h2>
                    Less trust.
                    <br />
                    <span>Clear boundaries.</span>
                  </h2>
                  <p>
                    Trust-minimised does not mean trust-free. The protocol makes
                    its dependencies explicit.
                  </p>
                  <div className="signature-equation">
                    <span>
                      <Globe2 />
                      Publisher
                    </span>
                    <b>+</b>
                    <span>
                      <Eye />
                      Oracle
                    </span>
                    <b>=</b>
                    <LockKeyhole />
                    <span className="sr-only">
                      Joint spending authorization
                    </span>
                  </div>
                  <span className="eyebrow">2-of-2 P2PK · SIG_ALL</span>
                </div>
                <Accordion type="single" collapsible defaultValue="pixel">
                  {trustQuestions.map(([id, title, copy]) => (
                    <AccordionItem key={id} value={id}>
                      <AccordionTrigger className="py-6">
                        {title}
                      </AccordionTrigger>
                      <AccordionContent className="pb-6">
                        {copy}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
          </section>

          <section
            className="section specification-section"
            id="specification"
            data-reveal
          >
            <div className="section-label">
              <span className="eyebrow">05 / Build on the idea</span>
              <Badge variant="outline">Initial specification draft</Badge>
            </div>
            <div className="spec-layout">
              <div>
                <h2>
                  The protocol is open.
                  <br />
                  So is the next chapter.
                </h2>
                <p>
                  Explore the full flow, inspect the payment conditions, and see
                  the questions still to be resolved.
                </p>
                <DialogTrigger asChild>
                  <Button size="lg" className="mt-8 min-h-12 px-5">
                    Read the specification
                    <ArrowUpRight data-icon="inline-end" />
                  </Button>
                </DialogTrigger>
              </div>
              <div className="spec-links">
                <a href={flowUrl} download="FLOW.md">
                  <FileText />
                  <span>
                    Protocol flow<small>The full design, step by step</small>
                  </span>
                  <ArrowDown />
                </a>
                <a href={openRtbUrl} download="OPENRTB.md">
                  <Code2 />
                  <span>
                    OpenRTB reference<small>The existing message model</small>
                  </span>
                  <ArrowDown />
                </a>
                <a href={nostrUrl} download="NOSTR.md">
                  <Radio />
                  <span>
                    ROB messages
                    <small>Nostr transport and proposed payloads</small>
                  </span>
                  <ArrowDown />
                </a>
                <a
                  href="https://github.com/nostr-protocol/nips/blob/master/01.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Radio />
                  <span>
                    Nostr NIP-01<small>Events, relays, and subscriptions</small>
                  </span>
                  <ArrowUpRight />
                </a>
                <a
                  href="https://github.com/cashubtc/nuts/blob/main/11.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Wallet />
                  <span>
                    Cashu NUT-11
                    <small>Payment locking and joint signatures</small>
                  </span>
                  <ArrowUpRight />
                </a>
              </div>
            </div>
            <Alert className="mt-14">
              <Info />
              <AlertTitle>A design in progress</AlertTitle>
              <AlertDescription>
                Final wire encodings, rendering capabilities, payload limits,
                and settlement and recovery details remain open. This site
                explains the agreed flow and remaining specification work; it is
                not a live bidding service.
              </AlertDescription>
            </Alert>
          </section>
        </main>
        <footer className="site-footer">
          <a className="brand" href="#">
            <Mark />
            <span>
              real open bidding<span className="brand-period">.</span>
            </span>
          </a>
          <p>Open discovery. Shared authorization.</p>
          <a href="#main">
            Back to top
            <ArrowUpRight />
          </a>
        </footer>
        <DialogContent className="flex max-h-[90svh] flex-col gap-5 p-6 sm:max-w-4xl">
          <DialogHeader className="pr-7">
            <DialogTitle>Real Open Bidding — specification</DialogTitle>
            <DialogDescription>
              The current protocol flow and remaining specification work,
              sourced directly from FLOW.md.
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="min-h-0 overflow-y-auto overscroll-contain pr-3">
            <Suspense fallback={<p>Loading the specification…</p>}>
              <Specification />
            </Suspense>
          </div>
          <div className="flex justify-end">
            <Button asChild variant="outline">
              <a href={flowUrl} download="FLOW.md">
                Download Markdown
                <ArrowDown data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </DialogContent>
      </div>
    </Dialog>
  )
}

export default App
