import { useState } from "react"
import { ArrowLeft, ArrowRight, LockKeyhole, RotateCcw } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { steps } from "@/protocol"

export function FlowExplorer() {
  const [step, setStep] = useState(0)
  const current = steps[step]
  const nodes = [
    "Publisher",
    "Nostr relays",
    "Bidder",
    "Viewer",
    "Oracle",
    "Cashu mint",
  ]
  return (
    <div className="flow-explorer">
      <Tabs
        value={String(step)}
        onValueChange={(value) => setStep(Number(value))}
      >
        <TabsList
          variant="line"
          className="w-full justify-between gap-2 overflow-x-auto"
          aria-label="Protocol steps"
        >
          {steps.map((item, i) => (
            <TabsTrigger
              key={item.name}
              value={String(i)}
              className="min-h-12 px-3"
            >
              <span className="step-number">0{i + 1}</span>
              {item.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {steps.map((item, i) => (
          <TabsContent key={item.name} value={String(i)} className="mt-10">
            <div className="flow-body">
              <div className="flow-explanation">
                <p className="eyebrow">{item.actor}</p>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <Badge variant="outline">
                  <LockKeyhole data-icon="inline-start" />
                  {item.state}
                </Badge>
              </div>
              <div
                className="flow-map"
                aria-label={`Step ${i + 1}: ${item.actor}`}
              >
                <div className="flow-map-heading">
                  <span className="eyebrow">Follow a single bid</span>
                  <span className="eyebrow">0{i + 1} / 07</span>
                </div>
                <div className="flow-nodes">
                  {nodes.map((node, n) => (
                    <div
                      key={node}
                      className={cn(
                        "flow-node",
                        (n === item.from ||
                          n === item.to ||
                          (i === 4 && n === 4)) &&
                          "is-active"
                      )}
                    >
                      <span className="node-dot">
                        {n === item.from ||
                        n === item.to ||
                        (i === 4 && n === 4) ? (
                          <span />
                        ) : null}
                      </span>
                      <span>{node}</span>
                    </div>
                  ))}
                </div>
                <div className="flow-message" key={i}>
                  <ArrowRight />
                  <span>{item.detail}</span>
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <Separator className="mt-10" />
      <div className="flow-controls">
        <p>
          Illustrative walkthrough <span>· No funds or network activity</span>
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Previous step"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setStep(step === 6 ? 0 : step + 1)}
          >
            {step === 6 ? "Replay the flow" : "Next step"}
            {step === 6 ? (
              <RotateCcw data-icon="inline-end" />
            ) : (
              <ArrowRight data-icon="inline-end" />
            )}
          </Button>
        </div>
      </div>
      <p className="sr-only" role="status">
        Step {step + 1} of 7: {current.name}. {current.state}.
      </p>
      <div className="refund-path">
        <span className="eyebrow">Alternative outcome / Unspent bids</span>
        <Accordion type="single" collapsible>
          <AccordionItem value="refund">
            <AccordionTrigger className="py-4">
              Reclaim funds after your chosen deadline
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              The bidder chooses its own locktime and generates a fresh refund
              key for each bid. That key signs the creative/payment commitment
              and is retained for recovery. After expiry according to the mint’s
              clock, it can sign a refund spend using its retained proofs—without
              publisher or oracle approval. ROB sets no lock duration.
              <p>
                Only unspent proofs can be reclaimed. This is an alternative to
                publisher settlement, never a refund of a completed payment. The
                publisher’s spending path remains valid after expiry, so a late
                settlement can race with the refund. Reclaiming is an active
                operation; expiry does not transfer funds automatically.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}
