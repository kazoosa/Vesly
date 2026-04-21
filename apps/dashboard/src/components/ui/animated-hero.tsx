import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MoveRight, PhoneCall } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./button";

/**
 * Adapted from nextlevelbuilder pattern.
 * Copy rewritten for Beacon: rotating finance-specific words instead of
 * generic adjectives. CTA uses react-router Link instead of Next.js Link.
 */
export function AnimatedHero() {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(
    () => ["holdings", "dividends", "transactions", "allocation", "brokerages"],
    [],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (titleNumber === titles.length - 1) {
        setTitleNumber(0);
      } else {
        setTitleNumber(titleNumber + 1);
      }
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  return (
    <div className="w-full">
      <div className="container mx-auto">
        <div className="flex gap-8 py-20 lg:py-32 items-center justify-center flex-col">
          <div>
            <Button variant="secondary" size="sm" className="gap-2">
              Free forever for 1 brokerage <MoveRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex gap-4 flex-col">
            <h1 className="text-5xl md:text-7xl max-w-3xl tracking-tighter text-center font-medium text-fg-primary">
              <span>See all your</span>
              <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-4 md:pt-1 h-[1.1em]">
                &nbsp;
                {titles.map((title, index) => (
                  <motion.span
                    key={index}
                    className="absolute font-semibold text-fg-primary"
                    initial={{ opacity: 0, y: "-100" }}
                    transition={{ type: "spring", stiffness: 50 }}
                    animate={
                      titleNumber === index
                        ? { y: 0, opacity: 1 }
                        : { y: titleNumber > index ? -150 : 150, opacity: 0 }
                    }
                  >
                    {title}
                  </motion.span>
                ))}
              </span>
              <span>in one place.</span>
            </h1>

            <p className="text-lg md:text-xl leading-relaxed tracking-tight text-fg-secondary max-w-2xl text-center">
              Beacon pulls every position, dividend, and transaction from 20+ brokerages into one
              clean dashboard. Don't see yours? Upload a CSV — we parse every major format.
            </p>
          </div>
          <div className="flex flex-row gap-3 flex-wrap justify-center">
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <Link to="/login">Try the demo <PhoneCall className="w-4 h-4" /></Link>
            </Button>
            <Button size="lg" className="gap-2" asChild>
              <Link to="/register">Get started free <MoveRight className="w-4 h-4" /></Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
